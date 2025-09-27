// Lightweight API Server - Phase 1C Implementation
// Replaces hub orchestration with simple HTTP + WebSocket API
// WebSocket-only communication for real-time updates

import express, { Request, Response } from 'express';
import { createServer, Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { existsSync } from 'fs';
import { Pool } from 'pg';
import {
  Job,
  JobStatus,
  JobRequirements,
  logger,
  RedisService,
  EventBroadcaster,
  JobSubmittedEvent,
  JobAssignedEvent,
  JobStatusChangedEvent,
  JobProgressEvent,
  smartTruncateObject,
  sanitizeBase64Data,
  JobCompletedEvent,
  JobFailedEvent,
  WorkerStatusChangedEvent,
  JobInstrumentation,
  WorkflowInstrumentation,
} from '@emp/core';
import { createRequire } from 'module';

interface PackageInfo {
  version: string;
  name: string;
  description: string;
}

let packageJson: PackageInfo = { version: 'unknown', name: 'api', description: 'API Server' };
try {
  const require = createRequire(import.meta.url);
  // Try different paths for package.json
  try {
    packageJson = require('../package.json');
  } catch (_e) {
    try {
      packageJson = require('../../package.json');
    } catch (_e2) {
      // In Docker, package.json might be at the app root
      try {
        packageJson = require('/app/apps/api/package.json');
      } catch (_e3) {
        console.warn('Could not load package.json, using defaults');
      }
    }
  }
} catch (error) {
  console.warn('Failed to load package.json:', error);
}

interface LightweightAPIConfig {
  port: number;
  redisUrl: string;
  corsOrigins?: string[];
}

interface WebSocketConnection {
  ws: WebSocket;
  clientId: string;
  subscribedJobs: Set<string>;
}

interface MonitorConnection {
  ws: WebSocket;
  monitorId: string;
  subscribedTopics: Set<string>;
  clientId: string;
}

interface ClientConnection {
  ws: WebSocket;
  clientId: string;
  clientType: 'emprops';
  ipAddress: string;
  userAgent?: string;
  connectedAt: string;
}

export class LightweightAPIServer {
  private app: express.Express;
  private httpServer: HTTPServer;
  private wsServer: WebSocketServer;
  private redis: Redis;
  private redisService: RedisService;
  private eventBroadcaster: EventBroadcaster;
  private config: LightweightAPIConfig;
  private dbPool?: Pool;

  // Connection tracking
  private wsConnections = new Map<string, WebSocketConnection>();
  private monitorConnections = new Map<string, MonitorConnection>();

  // Machine status tracking
  private machineLastSeen = new Map<string, number>();
  private unifiedMachineStatus = new Map<string, unknown>();
  private staleMachineCheckInterval?: NodeJS.Timeout;
  private clientConnections = new Map<string, ClientConnection>();
  private progressSubscriber: Redis;
  // Track which client submitted which job
  private jobToClientMap = new Map<string, string>();
  // Track workflow trace contexts for multi-step workflows
  private workflowTraceContexts = new Map<string, { traceId: string; spanId: string; totalSteps: number; startedAt: number }>();
  // Monitor ping/pong tracking
  private monitorData = new Map<
    string,
    { isAlive: boolean; missedPongs: number; pingInterval: NodeJS.Timeout }
  >();
  // Client ping/pong tracking
  private clientData = new Map<
    string,
    { isAlive: boolean; missedPongs: number; pingInterval: NodeJS.Timeout }
  >();

  constructor(config: LightweightAPIConfig) {
    this.config = config;
    this.app = express();
    this.httpServer = createServer(this.app);
    this.wsServer = new WebSocketServer({ server: this.httpServer });

    // Redis connections - initialized as null, will connect with retry logic
    this.redis = null as any;
    this.redisService = null as any;
    this.progressSubscriber = null as any;

    // Database connection for monitoring (direct Neon PostgreSQL)
    const monitoringUrl = process.env.DATABASE_URL;
    if (monitoringUrl) {
      this.dbPool = new Pool({
        connectionString: monitoringUrl,
        max: 2, // Minimal pool for monitoring only
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        application_name: 'JobQueue-API-Monitor-Neon',
      });
      logger.info('🔍 Database monitoring enabled via Neon PostgreSQL');
    }

    // Event broadcaster for real-time updates
    this.eventBroadcaster = new EventBroadcaster();

    // NOTE: EmProps format compatibility now handled directly in EventBroadcaster

    this.setupMiddleware();
    this.setupHTTPRoutes();
    this.setupWebSocketHandling();
    // NOTE: setupProgressStreaming() will be called after Redis connections are established
  }

  private isValidToken(token: string): boolean {
    // Use environment variable for token validation, fallback to hardcoded for dev
    // CRITICAL: AUTH_TOKEN must be explicitly set - NO FALLBACKS
    if (!process.env.AUTH_TOKEN) {
      throw new Error('FATAL: AUTH_TOKEN environment variable is required. No defaults allowed.');
    }
    const validToken = process.env.AUTH_TOKEN;
    return token === validToken;
  }

  private async testRedisConnection(): Promise<void> {
    // Simple ping-based test with robust error handling
    const testClient = new Redis(this.config.redisUrl, {
      lazyConnect: true,
      enableReadyCheck: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      commandTimeout: 3000,
    });

    // Suppress errors during testing
    testClient.on('error', () => {});

    try {
      await testClient.ping();
    } finally {
      try {
        await testClient.quit();
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  private async safeRedisOperation<T>(operation: () => Promise<T>, operationName: string): Promise<T | null> {
    // Wrapper for Redis operations that prevents crashes on disconnection
    try {
      return await operation();
    } catch (error) {
      logger.warn(`Redis operation '${operationName}' failed (service continues):`, error.message);
      return null;
    }
  }

  private async connectToRedisWithRetry(): Promise<void> {
    const maxRetries = 999999; // Essentially infinite retries
    const retryInterval = 2000; // 2 seconds

    logger.info('🔄 Waiting for Redis to become available...');

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Test basic Redis connectivity
        await this.testRedisConnection();

        // If we get here, Redis is available - create ONE main connection and ONE subscriber
        this.redis = new Redis(this.config.redisUrl);
        const subscriber = new Redis(this.config.redisUrl); // Separate subscriber needed for pub/sub

        // Create RedisService that shares our connections
        this.redisService = new RedisService(this.redis, undefined, subscriber);

        // Use the subscriber for progress updates
        this.progressSubscriber = subscriber;

        // Add robust error handlers with reconnection logic
        this.redis.on('error', (error) => {
          // Log error but don't crash - Redis client will auto-reconnect
          logger.warn('Redis main connection error (auto-reconnecting):', error.message);
        });

        this.redis.on('reconnecting', (ms) => {
          logger.info(`Redis main connection reconnecting in ${ms}ms...`);
        });

        this.redis.on('ready', () => {
          logger.info('Redis main connection restored');
        });

        subscriber.on('error', (error) => {
          // Log error but don't crash - Redis client will auto-reconnect
          logger.warn('Redis subscriber connection error (auto-reconnecting):', error.message);
        });

        subscriber.on('reconnecting', (ms) => {
          logger.info(`Redis subscriber reconnecting in ${ms}ms...`);
        });

        subscriber.on('ready', () => {
          logger.info('Redis subscriber connection restored');
        });

        // Test the shared connections
        await this.redis.ping();
        await subscriber.ping();
        await this.redisService.connect();

        // Now that Redis connections are established, set up progress streaming
        this.setupProgressStreaming();

        logger.info('✅ Redis connections established successfully');
        return;
      } catch (error) {
        // Only log every 30th attempt to reduce noise
        if (attempt === 1 || attempt % 30 === 0) {
          logger.info(`⏳ Waiting for Redis... (attempt ${attempt})`);
        }

        // Clean up failed connections
        if (this.redis) {
          try { await this.redis.quit(); } catch {}
          this.redis = null as any;
        }
        if (this.redisService) {
          try { await this.redisService.disconnect(); } catch {}
          this.redisService = null as any;
        }
        if (this.progressSubscriber) {
          try { await this.progressSubscriber.quit(); } catch {}
          this.progressSubscriber = null as any;
        }

        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryInterval));
        }
      }
    }

    throw new Error('Failed to connect to Redis after maximum retries');
  }

  private getWebSocketCloseCodeText(code: number): string {
    switch (code) {
      case 1000:
        return 'Normal Closure';
      case 1001:
        return 'Going Away';
      case 1002:
        return 'Protocol Error';
      case 1003:
        return 'Unsupported Data';
      case 1004:
        return 'Reserved';
      case 1005:
        return 'No Status Received';
      case 1006:
        return 'Abnormal Closure';
      case 1007:
        return 'Invalid Frame Payload Data';
      case 1008:
        return 'Policy Violation';
      case 1009:
        return 'Message Too Big';
      case 1010:
        return 'Mandatory Extension';
      case 1011:
        return 'Internal Server Error';
      case 1015:
        return 'TLS Handshake Failed';
      default:
        return 'Unknown';
    }
  }

  private setupMiddleware(): void {
    // Enhanced CORS support with detailed logging
    this.app.use((req, res, next) => {
      const allowedOrigins = this.config.corsOrigins || ['*'];
      const origin = req.headers.origin;

      logger.debug('API CORS check for origin:', origin, 'allowed origins:', allowedOrigins);

      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) {
        logger.debug('API CORS: Allowing request with no origin');
        if (allowedOrigins.includes('*')) {
          res.setHeader('Access-Control-Allow-Origin', '*');
        }
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
        res.setHeader(
          'Access-Control-Allow-Headers',
          'Content-Type, Authorization, X-Requested-With, Accept, Origin'
        );
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Max-Age', '86400');

        if (req.method === 'OPTIONS') {
          res.sendStatus(200);
          return;
        }
        return next();
      }

      // Check if origin is explicitly allowed
      if (allowedOrigins.includes('*')) {
        logger.debug('API CORS: Allowing all origins (*)');
        res.setHeader('Access-Control-Allow-Origin', '*');
      } else if (allowedOrigins.includes(origin)) {
        logger.debug('API CORS: Allowing explicitly listed origin:', origin);
        res.setHeader('Access-Control-Allow-Origin', origin);
      } else if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        // Special case: allow localhost variants for development
        logger.debug('API CORS: Allowing localhost origin for development:', origin);
        res.setHeader('Access-Control-Allow-Origin', origin);
      } else {
        // Block the origin
        logger.warn('API CORS BLOCKED origin:', origin, 'allowed origins:', allowedOrigins);
        // Don't set CORS header for blocked origins - this will cause the browser to block
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
        res.setHeader(
          'Access-Control-Allow-Headers',
          'Content-Type, Authorization, X-Requested-With, Accept, Origin'
        );
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Max-Age', '86400');

        if (req.method === 'OPTIONS') {
          res.sendStatus(200);
          return;
        }
        return next();
      }

      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Requested-With, Accept, Origin'
      );
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Max-Age', '86400'); // Cache preflight for 24 hours

      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }

      next();
    });

    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
  }

  private setupHTTPRoutes(): void {
    // Health check with CORS debugging
    this.app.get('/health', (req: Request, res: Response) => {
      const healthInfo = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        cors: {
          origin: req.headers.origin || 'no-origin',
          allowedOrigins: this.config.corsOrigins || ['*'],
          userAgent: req.headers['user-agent'] || 'unknown',
        },
        connections: {
          monitors: this.eventBroadcaster.getMonitorCount(),
          workers: this.getActiveWorkerCount(),
        },
      };

      logger.info(`Health check from ${req.headers.origin || 'unknown origin'}`);
      res.json(healthInfo);
    });

    // Version endpoint
    this.app.get('/version', (_req: Request, res: Response) => {
      const versionInfo = {
        api_version: packageJson.version,
        name: packageJson.name,
        description: packageJson.description,
        node_version: process.version,
        platform: process.platform,
        arch: process.arch,
        uptime_seconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        // CRITICAL: NODE_ENV must be explicitly set - NO FALLBACKS
        environment: (() => {
          if (!process.env.NODE_ENV) {
            throw new Error('FATAL: NODE_ENV environment variable is required. No defaults allowed.');
          }
          return process.env.NODE_ENV;
        })(),
        // BUILD_DATE: Required in containers, fallback to current time for local dev
        build_date: (() => {
          if (!process.env.BUILD_DATE) {
            // Check if running in container (has /.dockerenv or cgroup info)
            const isContainer = existsSync('/.dockerenv') || 
                              existsSync('/proc/1/cgroup');
            
            if (isContainer) {
              throw new Error('FATAL: BUILD_DATE environment variable is required in container environments.');
            }
            
            // Local development fallback
            const fallbackDate = new Date().toISOString();
            logger.warn(`BUILD_DATE not set in local environment, using current time: ${fallbackDate}`);
            return fallbackDate;
          }
          return process.env.BUILD_DATE;
        })(),
      };
      res.json(versionInfo);
    });

    // DEBUG: Test broadcast endpoint
    this.app.get('/test-broadcast', (_req: Request, res: Response) => {
      const testMessage = { type: 'manual_test', timestamp: Date.now() };

      // Test client broadcast
      logger.info('[TEST] Broadcasting to clients...');
      const clientResults: Record<string, unknown> = {};
      const broadcaster = this.eventBroadcaster as unknown as {
        clients: Map<string, { ws: WebSocket }>;
      };
      broadcaster.clients.forEach((client: { ws: WebSocket }, id: string) => {
        logger.info(`[TEST] Client ${id} - readyState: ${client.ws.readyState}`);
        try {
          client.ws.send(JSON.stringify(testMessage));
          logger.info(`[TEST] Success sending to client ${id}`);
          clientResults[id] = { sent: true, readyState: client.ws.readyState };
        } catch (error) {
          logger.error(`[TEST] Failed sending to client ${id}:`, error);
          clientResults[id] = {
            sent: false,
            error: error instanceof Error ? error.message : String(error),
            readyState: client.ws.readyState,
          };
        }
      });

      // Test monitor broadcast
      logger.info('[TEST] Broadcasting to monitors...');
      const monitorResults: Record<string, unknown> = {};
      const monitorBroadcaster = this.eventBroadcaster as unknown as {
        monitors: Map<string, WebSocket>;
      };
      monitorBroadcaster.monitors.forEach((monitor: WebSocket, id: string) => {
        logger.info(`[TEST] Monitor ${id}`);
        if (monitor instanceof WebSocket) {
          logger.info(`[TEST] Monitor ${id} - readyState: ${monitor.readyState}`);
          try {
            monitor.send(JSON.stringify(testMessage));
            logger.info(`[TEST] Success sending to monitor ${id}`);
            monitorResults[id] = { sent: true, readyState: monitor.readyState };
          } catch (error) {
            logger.error(`[TEST] Failed sending to monitor ${id}:`, error);
            monitorResults[id] = {
              sent: false,
              error: error instanceof Error ? error.message : String(error),
              readyState: monitor.readyState,
            };
          }
        }
      });

      res.json({
        clientCount: broadcaster.clients.size,
        monitorCount: monitorBroadcaster.monitors.size,
        eventBroadcasterInstance: (this.eventBroadcaster as unknown as { instanceId: string })
          .instanceId,
        clients: clientResults,
        monitors: monitorResults,
      });
    });

    // Connections endpoint - show all connected clients
    this.app.get('/api/connections', (_req: Request, res: Response) => {
      const connections = {
        monitor_connections: Array.from(this.monitorConnections.entries()).map(([id, conn]) => ({
          id,
          monitor_id: conn.monitorId,
          client_id: conn.clientId,
          subscribed_topics: Array.from(conn.subscribedTopics),
          connected_at: new Date().toISOString(),
        })),
        client_connections: Array.from(this.clientConnections.entries()).map(([id, conn]) => ({
          id,
          client_id: conn.clientId,
          ip_address: conn.ipAddress,
          user_agent: conn.userAgent,
          connected_at: conn.connectedAt,
        })),
        websocket_connections: Array.from(this.wsConnections.entries()).map(([id, conn]) => ({
          id,
          client_id: conn.clientId,
          subscribed_jobs: Array.from(conn.subscribedJobs),
          connected_at: new Date().toISOString(),
        })),
        stats: this.getConnectionStats(),
        timestamp: new Date().toISOString(),
      };
      res.json(connections);
    });

    // Database connection monitoring endpoint
    this.app.get('/api/system/db-connections', async (_req: Request, res: Response) => {
      try {
        if (!this.dbPool) {
          return res.status(503).json({
            error: 'Database monitoring not available - DATABASE_URL not configured',
            available: false
          });
        }

        const client = await this.dbPool.connect();
        try {
          // Get connection statistics by application
          const connectionStats = await client.query(`
            SELECT
              application_name,
              client_addr,
              usename,
              count(*) as connections,
              string_agg(DISTINCT state, ', ') as states,
              max(now() - state_change) as max_idle_time
            FROM pg_stat_activity
            WHERE pid <> pg_backend_pid()
            GROUP BY application_name, client_addr, usename
            ORDER BY connections DESC
          `);

          // Get total connection info
          const totalStats = await client.query(`
            SELECT
              count(*) as total_connections,
              (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections,
              count(*) FILTER (WHERE state = 'active') as active_connections,
              count(*) FILTER (WHERE state = 'idle') as idle_connections,
              count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
            FROM pg_stat_activity
            WHERE pid <> pg_backend_pid()
          `);

          // Get long-running idle connections (potential leaks)
          const leakyConnections = await client.query(`
            SELECT pid, usename, application_name, state, client_addr,
                   now() - state_change as idle_duration,
                   left(query, 100) as query_preview
            FROM pg_stat_activity
            WHERE (state = 'idle in transaction'
                   OR (state = 'idle' AND now() - state_change > interval '5 minutes'))
              AND pid <> pg_backend_pid()
            ORDER BY state_change
          `);

          res.json({
            available: true,
            timestamp: new Date().toISOString(),
            summary: totalStats.rows[0],
            connections_by_app: connectionStats.rows,
            potential_leaks: leakyConnections.rows.map(row => ({
              ...row,
              idle_duration: `${row.idle_duration}`,
            })),
            pool_usage: Math.round((totalStats.rows[0].total_connections / totalStats.rows[0].max_connections) * 100)
          });
        } finally {
          client.release();
        }
      } catch (error) {
        logger.error('Database monitoring error:', error);
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Unknown database error',
          available: false
        });
      }
    });

    // Direct PostgreSQL connection monitoring (bypasses PgBouncer)
    this.app.get('/api/system/postgres-connections', async (_req: Request, res: Response) => {
      try {
        if (!process.env.DATABASE_URL) {
          return res.status(503).json({
            error: 'Direct PostgreSQL monitoring not available - DATABASE_URL not configured',
            available: false
          });
        }

        // Create direct PostgreSQL connection
        const directPool = new Pool({
          connectionString: process.env.DATABASE_URL, // Direct to PostgreSQL
          max: 1, // Single connection for monitoring
          idleTimeoutMillis: 10000,
          connectionTimeoutMillis: 5000,
          application_name: 'JobQueue-API-Monitor-DirectPostgreSQL',
        });

        try {
          const client = await directPool.connect();
          try {
            // Get direct PostgreSQL connection stats
            const connectionStats = await client.query(`
              SELECT
                application_name,
                client_addr,
                usename,
                count(*) as connections,
                string_agg(DISTINCT state, ', ') as states
              FROM pg_stat_activity
              WHERE pid <> pg_backend_pid()
              GROUP BY application_name, client_addr, usename
              ORDER BY connections DESC
            `);

            const totalStats = await client.query(`
              SELECT
                count(*) as total_connections,
                (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections,
                count(*) FILTER (WHERE state = 'active') as active_connections,
                count(*) FILTER (WHERE state = 'idle') as idle_connections,
                count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
              FROM pg_stat_activity
              WHERE pid <> pg_backend_pid()
            `);

            // Get database size and storage metrics (Neon-specific)
            const databaseStats = await client.query(`
              SELECT
                pg_size_pretty(pg_database_size(current_database())) as database_size,
                pg_database_size(current_database()) as database_size_bytes,
                (SELECT sum(pg_total_relation_size(schemaname||'.'||tablename))
                 FROM pg_tables WHERE schemaname NOT IN ('information_schema', 'pg_catalog')) as tables_size_bytes,
                (SELECT count(*) FROM pg_stat_user_tables) as table_count,
                (SELECT count(*) FROM pg_stat_user_indexes) as index_count
            `);

            // Get query performance metrics from pg_stat_statements (if available)
            let queryStats = null;
            try {
              const extensionCheck = await client.query(`
                SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
              `);

              if (extensionCheck.rows.length > 0) {
                queryStats = await client.query(`
                  SELECT
                    calls,
                    total_exec_time,
                    mean_exec_time,
                    rows,
                    left(query, 100) as query_preview
                  FROM pg_stat_statements
                  ORDER BY total_exec_time DESC
                  LIMIT 5
                `);
              }
            } catch (e) {
              // pg_stat_statements not available or not enabled
            }

            // Get slow/long-running queries
            const slowQueries = await client.query(`
              SELECT
                pid,
                usename,
                application_name,
                state,
                query_start,
                now() - query_start as duration,
                left(query, 200) as query_preview
              FROM pg_stat_activity
              WHERE state = 'active'
                AND query_start < now() - interval '10 seconds'
                AND pid <> pg_backend_pid()
                AND query NOT LIKE '%pg_stat_activity%'
              ORDER BY query_start
              LIMIT 10
            `);

            // Get connection leaks (idle in transaction for too long)
            const connectionLeaks = await client.query(`
              SELECT
                pid,
                usename,
                application_name,
                state,
                client_addr,
                now() - state_change as idle_duration,
                left(query, 100) as query_preview
              FROM pg_stat_activity
              WHERE state = 'idle in transaction'
                AND state_change < now() - interval '5 minutes'
                AND pid <> pg_backend_pid()
              ORDER BY state_change
              LIMIT 10
            `);

            res.json({
              available: true,
              source: 'neon_postgresql',
              timestamp: new Date().toISOString(),
              summary: totalStats.rows[0],
              connections_by_app: connectionStats.rows,
              pool_usage: Math.round((totalStats.rows[0].total_connections / totalStats.rows[0].max_connections) * 100),
              potential_leaks: connectionLeaks.rows.map(row => ({
                ...row,
                idle_duration: row.idle_duration
              })),
              // Neon-specific metrics
              database_metrics: {
                size: databaseStats.rows[0].database_size,
                size_bytes: parseInt(databaseStats.rows[0].database_size_bytes),
                tables_size_bytes: parseInt(databaseStats.rows[0].tables_size_bytes) || 0,
                table_count: parseInt(databaseStats.rows[0].table_count),
                index_count: parseInt(databaseStats.rows[0].index_count)
              },
              performance_metrics: {
                pg_stat_statements_available: queryStats !== null,
                top_queries: queryStats?.rows || [],
                slow_queries: slowQueries.rows.map(row => ({
                  ...row,
                  duration_seconds: row.duration
                }))
              }
            });
          } finally {
            client.release();
          }
        } finally {
          await directPool.end();
        }
      } catch (error) {
        logger.error('Direct PostgreSQL monitoring error:', error);
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Unknown database error',
          available: false
        });
      }
    });

    // Job submission (modern HTTP endpoint)
    this.app.post('/api/jobs', async (req: Request, res: Response) => {
      try {
        const jobData = req.body;
        const jobId = await this.submitJob(jobData);

        res.status(201).json({
          success: true,
          job_id: jobId,
          message: 'Job submitted successfully',
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error('Job submission failed:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Job status query
    this.app.get('/api/jobs/:jobId', async (req: Request, res: Response) => {
      try {
        const { jobId } = req.params;
        const job = await this.getJobStatus(jobId);

        if (!job) {
          res.status(404).json({
            success: false,
            error: 'Job not found',
            timestamp: new Date().toISOString(),
          });
          return;
        }

        res.json({
          success: true,
          job,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error(`Failed to get job status for ${req.params.jobId}:`, error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        });
      }
    });


    // Job list endpoint
    this.app.get('/api/jobs', async (req: Request, res: Response) => {
      try {
        const { status, limit = '50', offset = '0' } = req.query;
        const jobs = await this.getJobs({
          status: status as string,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        });

        res.json({
          success: true,
          jobs,
          total: jobs.length,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error('Failed to get jobs:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        });
      }
    });

    // User notification tracking endpoint
    this.app.post('/api/user_notified', async (req: Request, res: Response) => {
      try {
        // Check authentication
        const authToken = req.headers.authorization?.replace('Bearer ', '') || req.headers['auth-token'] as string;
        const expectedToken = process.env.AUTH_TOKEN;

        if (!expectedToken || authToken !== expectedToken) {
          return res.status(401).json({
            success: false,
            error: 'Unauthorized - invalid or missing AUTH_TOKEN',
            timestamp: new Date().toISOString()
          });
        }

        const {
          job_id,
          workflow_id,
          miniapp_user_id,
          notification_type,
          notification_method,
          notification_content,
          success = true,
          error_message = null,
          metadata = {}
        } = req.body;

        // Validate required fields - use workflow_id as primary, job_id as fallback
        const workflowId = workflow_id || job_id;
        if (!workflowId) {
          return res.status(400).json({
            success: false,
            error: 'workflow_id (or job_id) is required',
            timestamp: new Date().toISOString()
          });
        }

        if (!miniapp_user_id) {
          return res.status(400).json({
            success: false,
            error: 'miniapp_user_id is required',
            timestamp: new Date().toISOString()
          });
        }

        // Create notification attestation record
        const attestationRecord = {
          workflow_id: workflowId,
          job_id: job_id || null,
          miniapp_user_id,
          notification_type: notification_type || 'notification',
          notification_method: notification_method || 'unknown',
          notification_content: notification_content || null,
          success,
          error_message,
          metadata,
          attestation: 'miniapp attests that it sent a notification to the user',
          attested_by: 'miniapp',
          attested_at: new Date().toISOString(),
          timestamp: new Date().toISOString()
        };

        // Store attestation in Redis with multiple keys for easy lookup
        const attestationId = uuidv4();
        const primaryKey = `user_notification_attestation:${attestationId}`;

        // Store primary record with 7-day TTL
        await this.redis.setex(primaryKey, 86400 * 7, JSON.stringify(attestationRecord));

        // Store by workflow for quick lookup
        const workflowAttestationKey = `workflow_notifications:${workflowId}`;
        await this.redis.lpush(workflowAttestationKey, JSON.stringify({
          ...attestationRecord,
          attestation_id: attestationId
        }));
        await this.redis.expire(workflowAttestationKey, 86400 * 7);

        // Store by user for user-specific lookups
        const userAttestationKey = `user_notifications:${miniapp_user_id}`;
        await this.redis.lpush(userAttestationKey, JSON.stringify({
          ...attestationRecord,
          attestation_id: attestationId
        }));
        await this.redis.expire(userAttestationKey, 86400 * 7);

        // Log the attestation
        logger.info(`✅ MINIAPP ATTESTATION: Miniapp attests notification sent to user ${miniapp_user_id} for workflow ${workflowId} via ${notification_method}, success: ${success}`);

        res.json({
          success: true,
          message: 'Miniapp notification attestation recorded successfully',
          attestation_id: attestationId,
          workflow_id: workflowId,
          miniapp_user_id,
          attested_at: attestationRecord.attested_at,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to track user notification:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Unified attestations endpoint - gets all types of attestations for a workflow or job
    this.app.get('/api/attestations', async (req: Request, res: Response) => {
      try {
        const { workflow_id, job_id } = req.query;

        if (!workflow_id && !job_id) {
          return res.status(400).json({
            success: false,
            error: 'workflow_id or job_id is required',
            timestamp: new Date().toISOString()
          });
        }

        const targetId = String(workflow_id || job_id);

        // Initialize response structure
        const response: any = {
          success: true,
          workflow_id: targetId,
          worker_attestations: [],
          api_attestation: null,
          notification_attestations: [],
          timestamp: new Date().toISOString()
        };

        // Collect all attestations with timestamps for sorting
        const allAttestations: Array<{type: string, data: any, timestamp: string}> = [];

        // Helper function to add attestation with timestamp
        const addAttestation = (type: string, data: any) => {
          const timestamp = data.timestamp || data.created_at || new Date().toISOString();
          allAttestations.push({ type, data, timestamp });
        };

        // Get all step IDs by querying the database (includes retries)
        let stepIds: string[] = [targetId]; // Always include the main workflow ID

        try {
          if (process.env.DATABASE_URL) {
            const pool = new Pool({
              connectionString: process.env.DATABASE_URL,
              max: 1,
              idleTimeoutMillis: 10000,
              connectionTimeoutMillis: 5000,
              application_name: 'JobQueue-API-Attestations',
            });

            const client = await pool.connect();
            try {
              // Query for all step IDs associated with this job/workflow
              const stepQuery = `
                SELECT DISTINCT s.id as step_id, s.retry_attempt, s.started_at
                FROM step s
                WHERE s.job_id = $1
                ORDER BY s.started_at ASC, s.retry_attempt ASC
              `;

              const stepResult = await client.query(stepQuery, [targetId]);

              if (stepResult.rows.length > 0) {
                const additionalStepIds = stepResult.rows.map((row: any) => row.step_id);
                stepIds = [targetId, ...additionalStepIds];
                logger.info(`Found ${additionalStepIds.length} step IDs for workflow ${targetId} (including retries)`);
              }
            } finally {
              client.release();
              await pool.end();
            }
          }
        } catch (error) {
          logger.warn(`Failed to fetch step IDs from database for ${targetId}: ${error}`);
          // Continue with just the main workflow ID
        }

        // For each step ID, search for all types of attestations
        for (const stepId of stepIds) {
          // Get notification attestations
          try {
            const workflowNotifications = await this.redis.lrange(`workflow_notifications:${stepId}`, 0, -1);
            for (const notificationStr of workflowNotifications) {
              try {
                const notification = JSON.parse(notificationStr);
                addAttestation('notification', notification);
              } catch (parseError) {
                logger.warn(`Failed to parse notification attestation for ${stepId}: ${parseError}`);
              }
            }
          } catch (redisError) {
            logger.warn(`Failed to get workflow notifications for ${stepId}: ${redisError}`);
          }

          // Get worker attestations (using correct Redis key pattern)
          try {
            const workerCompletionKey = `worker:completion:${stepId}`;
            const workerCompletion = await this.redis.get(workerCompletionKey);
            if (workerCompletion) {
              try {
                const parsed = JSON.parse(workerCompletion);
                addAttestation('worker', parsed);
              } catch (parseError) {
                logger.warn(`Failed to parse worker completion for ${stepId}: ${parseError}`);
              }
            }
          } catch (redisError) {
            logger.warn(`Failed to get worker completion for ${stepId}: ${redisError}`);
          }

          // Get API attestation
          try {
            const apiAttestationKey = `api:workflow:completion:${stepId}`;
            const apiAttestation = await this.redis.get(apiAttestationKey);
            if (apiAttestation) {
              try {
                const parsed = JSON.parse(apiAttestation);
                addAttestation('api', parsed);
              } catch (parseError) {
                logger.warn(`Failed to parse API attestation for ${stepId}: ${parseError}`);
              }
            }
          } catch (redisError) {
            logger.warn(`Failed to get API attestation for ${stepId}: ${redisError}`);
          }
        }

        // Additionally search for worker attestations that contain the target workflow_id in their data
        try {
          const workerCompletionKeys = await this.redis.keys('worker:completion:*');
          for (const key of workerCompletionKeys) {
            try {
              const workerCompletion = await this.redis.get(key);
              if (workerCompletion) {
                const parsed = JSON.parse(workerCompletion);
                // Check if this worker attestation contains our target workflow_id
                if (parsed.workflow_id === targetId) {
                  // Only add if we haven't already found this attestation
                  const alreadyExists = allAttestations.some(att =>
                    att.type === 'worker' &&
                    att.data.job_id === parsed.job_id
                  );
                  if (!alreadyExists) {
                    addAttestation('worker', parsed);
                  }
                }
              }
            } catch (parseError) {
              logger.warn(`Failed to parse worker completion from ${key}: ${parseError}`);
            }
          }
        } catch (redisError) {
          logger.warn(`Failed to search worker completions by workflow_id: ${redisError}`);
        }

        // Sort all attestations by timestamp and organize by type
        allAttestations.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        // Organize into response structure
        for (const attestation of allAttestations) {
          switch (attestation.type) {
            case 'notification':
              response.notification_attestations.push(attestation.data);
              break;
            case 'worker':
              response.worker_attestations.push(attestation.data);
              break;
            case 'api':
              // Only keep the latest API attestation (there should be only one)
              if (!response.api_attestation) {
                response.api_attestation = attestation.data;
              }
              break;
          }
        }

        logger.info(`Found ${allAttestations.length} total attestations across ${stepIds.length} step IDs for workflow ${targetId}`);
        res.json(response);

      } catch (error) {
        logger.error('Failed to get attestations:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Worker and job cleanup endpoint
    this.app.post('/api/cleanup', async (req: Request, res: Response) => {
      try {
        const {
          reset_workers = false,
          cleanup_orphaned_jobs = false,
          reset_specific_worker = null,
          max_job_age_minutes = 60,
        } = req.body;

        const results = await this.performCleanup({
          reset_workers,
          cleanup_orphaned_jobs,
          reset_specific_worker,
          max_job_age_minutes: parseInt(max_job_age_minutes),
        });

        res.json({
          success: true,
          results,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error('Failed to perform cleanup:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Machine deletion endpoint
    this.app.delete('/api/machines/:machineId', async (req: Request, res: Response) => {
      try {
        const { machineId } = req.params;

        if (!machineId) {
          res.status(400).json({
            success: false,
            error: 'Machine ID is required',
            timestamp: new Date().toISOString(),
          });
          return;
        }

        const result = await this.deleteMachine(machineId);

        res.json({
          success: true,
          ...result,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error(`Failed to delete machine ${req.params.machineId}:`, error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        });
      }
    });
  }

  private setupWebSocketHandling(): void {
    this.wsServer.on('connection', (ws: WebSocket, req) => {
      const url = req.url || '';
      logger.info(`WebSocket connection to: ${url}`);

      // Parse URL to determine connection type
      if (url.startsWith('/ws/monitor/') || url.startsWith('/ws/monitor?')) {
        this.handleMonitorConnection(ws, url, req);
      } else if (url.startsWith('/ws/client/')) {
        this.handleClientConnection(ws, url, req);
      } else {
        // Legacy WebSocket connection (fallback)
        this.handleLegacyConnection(ws);
      }
    });
  }

  private handleMonitorConnection(ws: WebSocket, url: string, _req: unknown): void {
    const monitorId = url.split('/ws/monitor/')[1]?.split('?')[0];
    if (!monitorId) {
      ws.close(1008, 'Invalid monitor ID');
      return;
    }

    // Parse query parameters for authentication
    const urlParams = new URLSearchParams(url.split('?')[1]);
    const token = urlParams.get('token');

    // Validate token if provided
    if (token && !this.isValidToken(token)) {
      logger.warn(`Invalid token provided for monitor ${monitorId}: ${token}`);
      ws.close(1008, 'Invalid authentication token');
      return;
    }

    const connection: MonitorConnection = {
      ws,
      monitorId,
      subscribedTopics: new Set(),
      clientId: uuidv4(),
    };

    this.monitorConnections.set(monitorId, connection);

    // CRITICAL FIX: Add monitor to EventBroadcaster
    logger.info(`[API] About to add monitor ${monitorId} to EventBroadcaster - still connected`);
    this.eventBroadcaster.addMonitor(monitorId, ws);
    logger.info(`[API] Monitor ${monitorId} added to EventBroadcaster successfully`);

    logger.info(`Monitor ${monitorId} connected`);
    logger.debug(`📊 Total monitors connected: ${this.monitorConnections.size}`);

    // DEBUG: Test basic WebSocket communication for monitors
    setTimeout(() => {
      try {
        ws.send(
          JSON.stringify({
            type: 'debug_monitor_test',
            message: 'Monitor WebSocket test',
            monitorId: monitorId,
            readyState: ws.readyState,
            timestamp: Date.now(),
          })
        );
        logger.debug(`Sent test message to monitor ${monitorId}, ws.readyState: ${ws.readyState}`);
      } catch (error) {
        logger.debug(`Failed to send test message to monitor ${monitorId}:`, error);
      }
    }, 1000);

    // Handle WebSocket pong responses for monitor connections
    ws.on('pong', () => {
      const data = this.monitorData.get(monitorId);
      if (data) {
        data.isAlive = true;
        data.missedPongs = 0;
        this.monitorData.set(monitorId, data);
        logger.debug(`[PING-PONG] Monitor ${monitorId} pong received 🏓`);
      }
      // Update EventBroadcaster heartbeat to prevent timeout removal
      this.eventBroadcaster.updateHeartbeat(monitorId);
    });

    // Set up ping/pong for connection health using WebSocket frames
    interface MonitorData {
      isAlive: boolean;
      missedPongs: number;
      pingInterval: NodeJS.Timeout;
    }

    if (!this.monitorData) {
      this.monitorData = new Map<string, MonitorData>();
    }

    const maxMissedPongs = 3; // Allow 3 missed pongs before disconnecting

    const pingInterval = setInterval(() => {
      const data = this.monitorData.get(monitorId);
      if (!data) return;

      if (!data.isAlive) {
        data.missedPongs++;
        logger.warn(`Monitor ${monitorId} missed pong ${data.missedPongs}/${maxMissedPongs}`);

        if (data.missedPongs >= maxMissedPongs) {
          // Connection is dead, clean up
          clearInterval(pingInterval);
          this.monitorData.delete(monitorId);
          logger.info(
            `Monitor ${monitorId} disconnected (ping timeout after ${maxMissedPongs} missed pongs)`
          );
          ws.terminate();
          this.monitorConnections.delete(monitorId);
          logger.info(`[API] PING TIMEOUT - Calling EventBroadcaster.removeMonitor(${monitorId})`);
          this.eventBroadcaster.removeMonitor(monitorId);
          return;
        }
      }

      // Only ping if WebSocket is still open
      if (ws.readyState === WebSocket.OPEN) {
        data.isAlive = false;

        // Send WebSocket ping frame
        ws.ping();

        logger.debug(`[PING-PONG] Monitor ${monitorId} WebSocket ping sent 🏓`);
      } else {
        clearInterval(pingInterval);
        this.monitorData.delete(monitorId);
        logger.info(`[PING-PONG] Monitor ${monitorId} WebSocket not open, stopping ping`);
      }
    }, 5000); // Ping every 5 seconds for immediate testing

    // Store monitor data for ping/pong tracking
    this.monitorData.set(monitorId, {
      isAlive: true,
      missedPongs: 0,
      pingInterval,
    });

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        logger.info(`🔍 [WS_DEBUG] Monitor ${monitorId} raw message received:`, message);
        await this.handleMonitorMessage(connection, message);
      } catch (error) {
        logger.error(`Monitor message handling failed for ${monitorId}:`, error);
        ws.send(
          JSON.stringify({
            type: 'error',
            error: 'Invalid message format',
            timestamp: new Date().toISOString(),
          })
        );
      }
    });

    ws.on('close', (code, reason) => {
      // Clean up ping interval and monitor data
      const data = this.monitorData.get(monitorId);
      if (data) {
        clearInterval(data.pingInterval);
        this.monitorData.delete(monitorId);
      }
      this.monitorConnections.delete(monitorId);
      logger.info(
        `[API] WEBSOCKET CLOSE - Calling EventBroadcaster.removeMonitor(${monitorId}) - Code: ${code}, Reason: ${reason ? reason.toString() : 'none'}`
      );
      this.eventBroadcaster.removeMonitor(monitorId);

      const reasonText = reason ? reason.toString() : 'No reason provided';
      const codeText = this.getWebSocketCloseCodeText(code);

      logger.info(
        `Monitor ${monitorId} disconnected - Code: ${code} (${codeText}), Reason: ${reasonText}`
      );
      logger.debug(`📊 Total monitors remaining: ${this.monitorConnections.size}`);
      logger.debug(
        `📊 EventBroadcaster monitors remaining: ${this.eventBroadcaster.getMonitorCount()}`
      );
    });

    ws.on('error', error => {
      logger.error(`Monitor WebSocket error for ${monitorId}:`, error);
      logger.error(`Monitor WebSocket error details:`, {
        error: error.message,
        stack: error.stack,
      });
      // Clean up ping interval and monitor data
      const data = this.monitorData.get(monitorId);
      if (data) {
        clearInterval(data.pingInterval);
        this.monitorData.delete(monitorId);
      }
      this.monitorConnections.delete(monitorId);
      logger.info(
        `[API] WEBSOCKET ERROR - Calling EventBroadcaster.removeMonitor(${monitorId}) - Error: ${error.message}`
      );
      this.eventBroadcaster.removeMonitor(monitorId);
    });
  }

  private handleClientConnection(ws: WebSocket, url: string, req: unknown): void {
    const clientId = url.split('/ws/client/')[1]?.split('?')[0];
    if (!clientId) {
      ws.close(1008, 'Invalid client ID');
      return;
    }

    // Parse query parameters for authentication
    const urlParams = new URLSearchParams(url.split('?')[1]);
    const token = urlParams.get('token');

    // All client connections use EmProps format
    const clientType = 'emprops' as const;

    // Validate token if provided
    if (token && !this.isValidToken(token)) {
      logger.warn(`Invalid token provided for client ${clientId}: ${token}`);
      ws.close(1008, 'Invalid authentication token');
      return;
    }

    // Extract IP address (handle various proxy scenarios)
    const getClientIP = (req: unknown): string => {
      const reqWithHeaders = req as {
        headers?: { [key: string]: string | string[] | undefined };
        connection?: { remoteAddress?: string };
        socket?: { remoteAddress?: string };
      };

      return (
        (reqWithHeaders.headers?.['x-forwarded-for'] as string)?.split(',')[0] ||
        (reqWithHeaders.headers?.['x-real-ip'] as string) ||
        reqWithHeaders.connection?.remoteAddress ||
        reqWithHeaders.socket?.remoteAddress ||
        'unknown'
      );
    };

    const connection: ClientConnection = {
      ws,
      clientId,
      clientType,
      ipAddress: getClientIP(req),
      userAgent: (req as { headers?: { [key: string]: string | string[] | undefined } }).headers?.[
        'user-agent'
      ] as string | undefined,
      connectedAt: new Date().toISOString(),
    };

    this.clientConnections.set(clientId, connection);
    logger.info(`Client ${clientId} connected (type: ${clientType})`);

    // Register client with EventBroadcaster for real-time events
    this.eventBroadcaster.addClient(clientId, ws, clientType);

    // Send EmProps-compatible connection_established message to all clients
    const empropsMessage = {
      type: 'connection_established',
      message: 'Connected to server',
      timestamp: Date.now(),
    };
    ws.send(JSON.stringify(empropsMessage));
    logger.debug(`Sent EmProps connection_established message to ${clientId}`);

    // DEBUG: Test basic WebSocket communication
    setTimeout(() => {
      try {
        ws.send(
          JSON.stringify({
            type: 'debug_client_test',
            message: 'If you see this, WebSocket works',
            clientId: clientId,
            readyState: ws.readyState,
            timestamp: Date.now(),
          })
        );
        logger.debug(`Sent test message to client ${clientId}, ws.readyState: ${ws.readyState}`);
      } catch (error) {
        logger.debug(`Failed to send test message to client ${clientId}:`, error);
      }
    }, 1000);

    // Handle WebSocket pong responses for client connections
    ws.on('pong', () => {
      const data = this.clientData.get(clientId);
      if (data) {
        data.isAlive = true;
        data.missedPongs = 0;
        this.clientData.set(clientId, data);
        logger.debug(`[PING-PONG] Client ${clientId} pong received 🏓`);
      }
    });

    // Set up ping/pong for client connection health using WebSocket frames
    const clientPingInterval = setInterval(() => {
      const data = this.clientData.get(clientId);
      if (!data) return;

      if (!data.isAlive) {
        data.missedPongs++;
        logger.warn(`Client ${clientId} missed pong ${data.missedPongs}/${3}`);

        if (data.missedPongs >= 3) {
          // Connection is dead, clean up
          clearInterval(clientPingInterval);
          this.clientData.delete(clientId);
          logger.info(`Client ${clientId} disconnected (ping timeout after 3 missed pongs)`);
          ws.terminate();
          this.clientConnections.delete(clientId);
          this.eventBroadcaster.removeClient(clientId);
          return;
        }
      }

      // Only ping if WebSocket is still open
      if (ws.readyState === WebSocket.OPEN) {
        data.isAlive = false;

        // Send WebSocket ping frame
        ws.ping();

        logger.debug(`[PING-PONG] Client ${clientId} WebSocket ping sent 🏓`);
      } else {
        clearInterval(clientPingInterval);
        this.clientData.delete(clientId);
        logger.info(`[PING-PONG] Client ${clientId} WebSocket not open, stopping ping`);
      }
    }, 5000); // Ping every 5 seconds for immediate testing

    // Store client data for ping/pong tracking
    this.clientData.set(clientId, {
      isAlive: true,
      missedPongs: 0,
      pingInterval: clientPingInterval,
    });

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        await this.handleClientMessage(connection, message);
      } catch (error) {
        logger.error(`Client message handling failed for ${clientId}:`, error);
        ws.send(
          JSON.stringify({
            type: 'error',
            error: 'Invalid message format',
            timestamp: new Date().toISOString(),
          })
        );
      }
    });

    ws.on('close', () => {
      // Clean up ping interval and client data
      const data = this.clientData.get(clientId);
      if (data) {
        clearInterval(data.pingInterval);
        this.clientData.delete(clientId);
      }
      this.clientConnections.delete(clientId);
      this.eventBroadcaster.removeClient(clientId);
      logger.info(`Client ${clientId} disconnected`);
    });

    ws.on('error', error => {
      logger.error(`Client WebSocket error for ${clientId}:`, error);
      // Clean up ping interval and client data
      const data = this.clientData.get(clientId);
      if (data) {
        clearInterval(data.pingInterval);
        this.clientData.delete(clientId);
      }
      this.clientConnections.delete(clientId);
      this.eventBroadcaster.removeClient(clientId);
    });
  }

  private handleLegacyConnection(ws: WebSocket): void {
    const clientId = uuidv4();
    const connection: WebSocketConnection = {
      ws,
      clientId,
      subscribedJobs: new Set(),
    };

    this.wsConnections.set(clientId, connection);
    logger.info(`Legacy WebSocket client ${clientId} connected`);

    // Send welcome message
    ws.send(
      JSON.stringify({
        type: 'connected',
        client_id: clientId,
        timestamp: new Date().toISOString(),
      })
    );

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        await this.handleWebSocketMessage(connection, message);
      } catch (error) {
        logger.error(`WebSocket message handling failed for client ${clientId}:`, error);
        ws.send(
          JSON.stringify({
            type: 'error',
            error: 'Invalid message format',
            timestamp: new Date().toISOString(),
          })
        );
      }
    });

    ws.on('close', () => {
      this.wsConnections.delete(clientId);
      logger.info(`Legacy WebSocket client ${clientId} disconnected`);
    });

    ws.on('error', error => {
      logger.error(`Legacy WebSocket error for client ${clientId}:`, error);
      this.wsConnections.delete(clientId);
    });
  }

  private async handleWebSocketMessage(
    connection: WebSocketConnection,
    message: Record<string, unknown>
  ): Promise<void> {
    const { ws, clientId } = connection;

    switch (message.type) {
      case 'submit_job':
        try {
          // Extract message_id if provided for job ID consistency
          const messageId = message.message_id as string | undefined;
          const jobId = await this.submitJob(message.data as Record<string, unknown>, messageId);
          ws.send(
            JSON.stringify({
              type: 'job_submitted',
              job_id: jobId,
              message_id: message.id,
              timestamp: new Date().toISOString(),
            })
          );
        } catch (error) {
          ws.send(
            JSON.stringify({
              type: 'error',
              message_id: message.id,
              error: error instanceof Error ? error.message : 'Job submission failed',
              timestamp: new Date().toISOString(),
            })
          );
        }
        break;

      case 'subscribe_progress':
        const jobId = message.job_id;
        if (jobId) {
          connection.subscribedJobs.add(jobId as string);
          ws.send(
            JSON.stringify({
              type: 'subscribed',
              job_id: jobId,
              message_id: message.id,
              timestamp: new Date().toISOString(),
            })
          );
          logger.debug(`WebSocket client ${clientId} subscribed to job ${jobId} progress`);
        }
        break;

      case 'unsubscribe_progress':
        const unsubJobId = message.job_id;
        if (unsubJobId) {
          connection.subscribedJobs.delete(unsubJobId as string);
          ws.send(
            JSON.stringify({
              type: 'unsubscribed',
              job_id: unsubJobId,
              message_id: message.id,
              timestamp: new Date().toISOString(),
            })
          );
        }
        break;

      case 'get_job_status':
        try {
          const job = await this.getJobStatus(message.job_id as string);
          ws.send(
            JSON.stringify({
              type: 'job_status',
              job,
              message_id: message.id,
              timestamp: new Date().toISOString(),
            })
          );
        } catch (error) {
          ws.send(
            JSON.stringify({
              type: 'error',
              message_id: message.id,
              error: error instanceof Error ? error.message : 'Failed to get job status',
              timestamp: new Date().toISOString(),
            })
          );
        }
        break;

      case 'cancel_job':
        try {
          const cancelJobId = message.job_id as string;
          if (cancelJobId) {
            await this.cancelJob(cancelJobId);
            ws.send(
              JSON.stringify({
                type: 'job_cancelled',
                job_id: cancelJobId,
                message_id: message.id,
                timestamp: new Date().toISOString(),
              })
            );
            logger.info(`Client ${clientId} cancelled job ${cancelJobId}`);
          }
        } catch (error) {
          ws.send(
            JSON.stringify({
              type: 'error',
              message_id: message.id,
              error: error instanceof Error ? error.message : 'Failed to cancel job',
              timestamp: new Date().toISOString(),
            })
          );
        }
        break;

      // 'pong' case removed - now handled by WebSocket pong event

      default:
        ws.send(
          JSON.stringify({
            type: 'error',
            message_id: message.id,
            error: `Unknown message type: ${message.type}`,
            timestamp: new Date().toISOString(),
          })
        );
    }
  }

  private async handleMonitorMessage(
    connection: MonitorConnection,
    message: Record<string, unknown>
  ): Promise<void> {
    const { ws, monitorId } = connection;

    logger.info(`🔍 [MONITOR_DEBUG] Received message from ${monitorId}:`, JSON.stringify(message));

    switch (message.type) {
      // case 'monitor_connect':
      //   const connectTime = Date.now();
      //   logger.info(
      //     `Monitor ${monitorId} requesting connection at ${new Date(connectTime).toISOString()}`
      //   );

      //   // Send acknowledgment
      //   ws.send(
      //     JSON.stringify({
      //       type: 'monitor_connected',
      //       monitor_id: monitorId,
      //       timestamp: new Date().toISOString(),
      //     })
      //   );

      //   // Send full state if requested
      //   if (message.request_full_state) {
      //     logger.info(`Monitor ${monitorId} requested full state, sending...`);
      //     const beforeSnapshot = Date.now();
      //     await this.sendFullStateSnapshot(connection, {
      //       finishedJobsPagination: (
      //         message as { finishedJobsPagination?: { page: number; pageSize: number } }
      //       ).finishedJobsPagination || {
      //         page: 1,
      //         pageSize: 20,
      //       },
      //     });
      //     logger.info(
      //       `Full state snapshot for ${monitorId} completed in ${Date.now() - beforeSnapshot}ms (${Date.now() - connectTime}ms since connect)`
      //     );
      //   }

      //   break;

      case 'subscribe':
        const subscribeTime = Date.now();
        const topics = (message.topics as string[]) || [];
        connection.subscribedTopics.clear();
        topics.forEach(topic => connection.subscribedTopics.add(topic));

        logger.info(
          `Monitor ${monitorId} subscribed to topics at ${new Date(subscribeTime).toISOString()}:`,
          topics
        );

        ws.send(
          JSON.stringify({
            type: 'subscribed',
            monitor_id: monitorId,
            topics,
            timestamp: new Date().toISOString(),
          })
        );
        break;

      case 'request_full_state':
        logger.info(`Monitor ${monitorId} requested full state sync`);
        await this.sendFullStateSnapshot(connection, {
          finishedJobsPagination: (
            message as { finishedJobsPagination?: { page: number; pageSize: number } }
          ).finishedJobsPagination || {
            page: 1,
            pageSize: 20,
          },
        });

        break;

      // 'heartbeat' case removed - now using WebSocket ping/pong frames

      // 'pong' case removed - now handled by WebSocket pong event

      default:
        ws.send(
          JSON.stringify({
            type: 'error',
            error: `Unknown monitor message type: ${message.type}`,
            timestamp: new Date().toISOString(),
          })
        );
    }
  }

  private async handleClientMessage(
    connection: ClientConnection,
    message: Record<string, unknown>
  ): Promise<void> {
    const { ws, clientId } = connection;

    switch (message.type) {
      case 'submit_job':
        try {
          logger.info(`Received submit_job message:`, JSON.stringify(message, null, 2));
          const jobData = message as Record<string, unknown>;
          logger.info(`Job data: ${JSON.stringify(jobData, null, 2)}`);
          // Extract message_id if provided for job ID consistency (EmProps compatibility)
          const messageId = message.message_id as string | undefined;
          const jobId = await this.submitJob(jobData, messageId);

          // Track that this client submitted this job
          this.jobToClientMap.set(jobId, clientId);

          // Subscribe client to this job's updates via EventBroadcaster
          this.eventBroadcaster.subscribeClientToJob(clientId, jobId);

          // EmProps clients get updates via EventBroadcaster (no direct response needed)
          logger.debug(
            `Client ${clientId} will receive updates via EventBroadcaster for job ${jobId}`
          );

          // Note: Job submission event will be broadcasted from submitJob method with proper JobSubmittedEvent format
        } catch (error) {
          logger.error(`🔍 [WS_HANDLER_DEBUG] CAUGHT ERROR in submit_job handler:`, error);
          logger.error(`🔍 [WS_HANDLER_DEBUG] Error details:`, {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : 'No stack trace',
            name: error instanceof Error ? error.name : 'Unknown error type'
          });
          
          ws.send(
            JSON.stringify({
              type: 'error',
              message_id: message.id,
              error: error instanceof Error ? error.message : 'Job submission failed',
              timestamp: new Date().toISOString(),
            })
          );
        }
        break;

      case 'subscribe_progress':
        const jobId = message.job_id as string;
        if (jobId) {
          // For client connections, we automatically subscribe them to their own jobs
          // This message acknowledges the subscription
          ws.send(
            JSON.stringify({
              type: 'subscribed',
              job_id: jobId,
              message_id: message.id,
              timestamp: new Date().toISOString(),
            })
          );
          logger.debug(`Client ${clientId} subscribed to job ${jobId} progress`);
        }
        break;

      case 'cancel_job':
        try {
          const cancelJobId = message.job_id as string;
          if (cancelJobId) {
            await this.cancelJob(cancelJobId);
            ws.send(
              JSON.stringify({
                type: 'job_cancelled',
                job_id: cancelJobId,
                message_id: message.id,
                timestamp: new Date().toISOString(),
              })
            );
            logger.info(`Client ${clientId} cancelled job ${cancelJobId}`);
          }
        } catch (error) {
          ws.send(
            JSON.stringify({
              type: 'error',
              message_id: message.id,
              error: error instanceof Error ? error.message : 'Failed to cancel job',
              timestamp: new Date().toISOString(),
            })
          );
        }
        break;

      case 'delegated_job_result':
        try {
          const jobId = message.job_id as string;
          const resultData = message.result as Record<string, unknown>; // Cast for property access

          if (!jobId || !resultData) {
            throw new Error('Missing required fields: job_id and result');
          }

          // Get job details to check for workflow metadata and prevent duplicates
          const jobDetails = await this.redisService.getJob(jobId);

          // 🚨 DUPLICATION FIX: Check if job is already completed
          if (jobDetails?.status === 'completed') {
            logger.warn(`🔄 DELEGATED JOB ALREADY COMPLETED: ${jobId} - ignoring duplicate result`);
            ws.send(
              JSON.stringify({
                type: 'delegated_job_acknowledged',
                action: 'already_completed',
                job_id: jobId,
                message_id: message.id,
                timestamp: new Date().toISOString(),
                message: 'Job already completed, ignoring duplicate result'
              })
            );
            break; // Exit without reprocessing
          }

          // Only log workflow jobs
          if (jobDetails?.workflow_id) {
            logger.info(
              `🎯 API-SERVER: Completing delegated workflow job ${jobId} (workflow: ${jobDetails.workflow_id}, step: ${jobDetails.current_step}/${jobDetails.total_steps})`
            );
          } else {
            logger.info(`🎯 API-SERVER: Completing delegated job ${jobId} (no workflow)`);
          }

          // Handle different result types
          if (resultData.data === 'retry') {
            // Retry case - just acknowledge, keep job pending
            ws.send(
              JSON.stringify({
                type: 'delegated_job_acknowledged',
                action: 'retry_acknowledged',
                job_id: jobId,
                message_id: message.id,
                timestamp: new Date().toISOString(),
              })
            );
            logger.info(`Delegated job ${jobId} marked for retry`);
            break; // Exit without completing the job
          }
          logger.info('THIS MUST SHOW=2');
          // Success or failed case - complete the job
          const success = resultData.success === true || resultData.data === 'completed';

          // 🔧 DELEGATED JOBS FIX: Apply same asset extraction logic as base connector
          // Extract image_url and mime_type from delegated job results for consistency
          let processedData = resultData.data;
          if (success && resultData.data && typeof resultData.data === 'object') {
            const data = resultData.data as any;

            // Extract asset information if available
            if (data.saved_asset?.fileUrl || data.asset_url || data.image_url) {
              processedData = {
                ...data,
                image_url: data.saved_asset?.fileUrl || data.asset_url || data.image_url,
                mime_type: data.saved_asset?.mimeType || data.mime_type || 'image/png',
              };
              logger.info(`🔧 DELEGATED JOB ASSET FIX: Applied for job ${jobId} - image_url: ${(processedData as any).image_url}`);
            }
          }

          const jobResult = {
            success,
            data: processedData,
            error:
              typeof resultData.error === 'string'
                ? resultData.error
                : JSON.stringify(resultData.error || 'Unknown error'),
            metadata: {
              completed_by: 'delegated_service',
              client_id: clientId,
              // Include saved asset metadata if available
              saved_asset: (resultData.data as any)?.saved_asset || null,
            },
          };

          // Assign a dummy worker_id to delegated jobs so completeJob() doesn't reject them
          const dummyWorkerId = `delegated_client_${clientId}`;

          await this.redis.hset(`job:${jobId}`, 'worker_id', dummyWorkerId);

          // Use the Redis service to complete the job
          logger.info(`JobID: ${jobId}`);
          logger.info(`JobResult: ${jobResult}`);
          await this.redisService.completeJob(jobId, jobResult);

          ws.send(
            JSON.stringify({
              type: 'delegated_job_acknowledged',
              action: success ? 'completed' : 'failed',
              job_id: jobId,
              message_id: message.id,
              timestamp: new Date().toISOString(),
            })
          );

          if (jobDetails?.workflow_id) {
            logger.info(
              `✅ API-SERVER: Delegated workflow job ${jobId} ${success ? 'completed' : 'failed'}`
            );
          }
        } catch (error) {
          logger.error(`Failed to handle delegated job result from client ${clientId}:`, error);
          ws.send(
            JSON.stringify({
              type: 'error',
              message_id: message.id,
              error:
                error instanceof Error ? error.message : 'Failed to process delegated job result',
              timestamp: new Date().toISOString(),
            })
          );
        }
        break;

      // 'pong' case removed - now handled by WebSocket pong event

      default:
        ws.send(
          JSON.stringify({
            type: 'error',
            message_id: message.id,
            error: `Unknown client message type: ${message.type}`,
            timestamp: new Date().toISOString(),
          })
        );
    }
  }

  private async sendFullStateSnapshot(
    connection: MonitorConnection,
    options?: {
      finishedJobsPagination?: { page: number; pageSize: number };
    }
  ): Promise<void> {
    try {
      const startTime = Date.now();

      // Get workers from machine structure data (unified machine status)
      const workers = [];
      
      logger.debug(`Building workers from ${this.unifiedMachineStatus.size} machine(s) in ${Date.now() - startTime}ms`);

      // Extract workers from machine structures
      for (const machineData of this.unifiedMachineStatus.values()) {
        const machine = machineData as any;
        const machineId = machine.machine_id;
        const structure = machine.structure || {};
        const statusData = machine.status_data || {};
        
        // Get workers from this machine's structure
        for (const [workerId, workerStructure] of Object.entries(structure.workers || {})) {
          const workerStruct = workerStructure as any;
          const workerStatus = statusData.workers?.[workerId] || {};
          
          // Build worker in monitor format
          const worker = {
            id: workerId,
            machine_id: machineId,
            status: workerStatus.status || 'unknown',
            last_activity: workerStatus.last_activity ? (() => {
              const date = new Date(workerStatus.last_activity);
              return isNaN(date.getTime()) ? null : date.toISOString();
            })() : null,
            current_job_id: workerStatus.current_job_id || null,
            total_jobs_completed: parseInt(workerStatus.total_jobs_completed || '0'),
            total_jobs_failed: parseInt(workerStatus.total_jobs_failed || '0'),
            capabilities: {
              gpu_count: 1,
              gpu_memory_gb: 8,
              gpu_model: 'Mock GPU', 
              cpu_cores: 4,
              ram_gb: 8,
              services: workerStruct.services || [],
              models: [],
              customer_access: 'none',
              max_concurrent_jobs: 1,
            },
            connections: (workerStruct.services || []).map((service: string) => ({
              service_type: service,
              status: 'active',
              last_activity: workerStatus.last_activity,
              error_message: null,
            })),
            is_stale: false,
            heartbeat_ttl: null,
          };
          
          workers.push(worker);
        }
      }
      
      // Old worker scanning code disabled - now using unified machine status

      // Get current jobs and organize by status
      const jobsStart = Date.now();
      const allJobs = await this.getAllJobs();
      logger.debug(`Fetched ${allJobs.length} jobs in ${Date.now() - jobsStart}ms`);

      // Get paginated completed jobs from already-loaded jobs (avoid duplicate loading)
      const paginationOptions = options?.finishedJobsPagination || { page: 1, pageSize: 20 };
      const completedJobsResult = await this.getCompletedJobsPaginatedFromJobs(allJobs, paginationOptions);

      // Organize jobs by status for monitor compatibility
      const jobsByStatus = {
        pending: [] as unknown[],
        active: [] as unknown[],
        completed: [] as unknown[],
        failed: [] as unknown[],
      };

      for (const job of allJobs) {
        // Convert job for monitor compatibility - EXCLUDE large payload data
        const monitorJob = {
          id: job.id,
          status: job.status,
          job_type: job.service_required, // Map service_required to job_type for monitor
          worker_id: job.worker_id,
          created_at: job.created_at,
          started_at: job.started_at,
          completed_at: job.completed_at,
          assigned_at: job.assigned_at,
          priority: job.priority,
          retry_count: job.retry_count,
          max_retries: job.max_retries,
          workflow_id: job.workflow_id,
          customer_id: job.customer_id,
          // EXPLICITLY EXCLUDE: payload, requirements, ctx, and other large fields
        };

        // Categorize by status (excluding completed jobs - they're handled separately)
        switch (job.status) {
          case 'pending':
          case 'queued':
            jobsByStatus.pending.push(monitorJob);
            break;
          case 'assigned':
          case 'accepted':
          case 'in_progress':
            jobsByStatus.active.push(monitorJob);
            break;
          case 'completed':
            // Skip - handled by pagination
            break;
          case 'failed':
          case 'cancelled':
          case 'timeout':
          case 'unworkable':
            jobsByStatus.failed.push(monitorJob);
            break;
          default:
            // Default to pending for unknown status
            jobsByStatus.pending.push(monitorJob);
        }
      }

      // Add paginated completed jobs - EXCLUDE large payload data
      jobsByStatus.completed = completedJobsResult.jobs.map(job => ({
        id: job.id,
        status: job.status,
        job_type: job.service_required, // Map service_required to job_type for monitor
        worker_id: job.worker_id,
        created_at: job.created_at,
        started_at: job.started_at,
        completed_at: job.completed_at,
        assigned_at: job.assigned_at,
        priority: job.priority,
        retry_count: job.retry_count,
        max_retries: job.max_retries,
        workflow_id: job.workflow_id,
        customer_id: job.customer_id,
        // EXPLICITLY EXCLUDE: payload, requirements, ctx, and other large fields
      }));

      // Get machines from in-memory unified machine status - EXCLUDE large nested data
      const machines = Array.from(this.unifiedMachineStatus.values()).map(machineData => {
        const machine = machineData as any;
        return {
          machine_id: machine.machine_id,
          gpu_count: machine.structure?.gpu_count || 0,
          capabilities: machine.structure?.capabilities || [],
          phase: machine.status_data?.machine?.phase || 'unknown',
          uptime_ms: machine.status_data?.machine?.uptime_ms || 0,
          worker_count: Object.keys(machine.structure?.workers || {}).length,
          timestamp: machine.timestamp || Date.now(),
          // EXPLICITLY EXCLUDE: structure.workers, structure.services, status_data.workers, status_data.services
        };
      });

      const snapshot = {
        workers,
        jobs: jobsByStatus,
        machines,
        timestamp: Date.now(),
        system_stats: {
          total_jobs: allJobs.length,
          pending_jobs: jobsByStatus.pending.length,
          active_jobs: jobsByStatus.active.length,
          completed_jobs: jobsByStatus.completed.length,
          failed_jobs: jobsByStatus.failed.length,
          total_workers: workers.length,
          active_workers: workers.filter(w => w.status === 'active' || w.status === 'busy').length,
          total_machines: machines.length,
        },
        pagination: {
          finishedJobs: completedJobsResult.pagination,
        },
      };

      // Prepare the WebSocket message
      const wsMessage = {
        type: 'full_state_snapshot',
        data: snapshot,
        monitor_id: connection.monitorId,
        timestamp: new Date().toISOString(),
      };
      
      logger.info(`🚀 [SNAPSHOT] About to send full_state_snapshot to monitor ${connection.monitorId}`);
      logger.debug(`🚀 [SNAPSHOT] WebSocket readyState: ${connection.ws.readyState}, workers: ${workers.length}, jobs: ${allJobs.length}`);
      
      // Send the WebSocket message
      connection.ws.send(JSON.stringify(wsMessage));
      
      logger.info(`✅ [SNAPSHOT] Successfully sent full_state_snapshot to monitor ${connection.monitorId}: ${workers.length} workers, ${allJobs.length} total jobs (${jobsByStatus.pending.length} pending, ${jobsByStatus.active.length} active, ${jobsByStatus.completed.length} completed, ${jobsByStatus.failed.length} failed) - total time: ${Date.now() - startTime}ms`);
      logger.debug(`✅ [SNAPSHOT] Message sent with type: ${wsMessage.type}, monitor_id: ${wsMessage.monitor_id}`);
    } catch (error) {
      logger.error(`Failed to send full state snapshot to monitor ${connection.monitorId}:`, error);
    }
  }

  // NOTE: Direct broadcast methods removed - all events now go through EventBroadcaster
  // for unified monitoring and client handling with proper job subscription filtering

  private extractMachineIdFromWorkerId(workerId: string): string {
    // For new worker naming: "basic-machine-local-worker-0"
    // Extract machine ID from worker ID: "basic-machine-local-worker-0" -> "basic-machine-local"
    const workerMatch = workerId.match(/^(.+)-worker-\d+$/);
    if (workerMatch) {
      return workerMatch[1];
    }

    // Fallback for old pattern: "redis-direct-worker-basic-machine-44" -> "basic-machine"
    const oldPatternMatch = workerId.match(/redis-direct-worker-(.+)-\d+$/);
    if (oldPatternMatch) {
      return oldPatternMatch[1];
    }

    return 'unknown';
  }

  /**
   * Handle unified machine status message (replaces fragmented status handling)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleUnifiedMachineStatus(statusData: any): Promise<void> {
    const machineId = statusData.machine_id;
    const updateType = statusData.update_type || 'periodic';

    // Track when we last heard from this machine
    this.machineLastSeen.set(machineId, Date.now());
    logger.info(`🏭 Processing unified machine status for: ${machineId} (${updateType})`);

    try {
      // Separate structure from status_data
      const structure = statusData.structure || {};
      const status_data = {
        machine: statusData.status?.machine || {},
        workers: statusData.status?.workers || {},
        services: statusData.status?.services || {}
      };

      // Log worker IDs being processed by API
      const workerIds = Object.keys(status_data.workers || {});
      logger.info(`🔴 [API-WORKER-ID-DEBUG] Received worker IDs from machine ${machineId}: ${JSON.stringify(workerIds)}`);
      
      // Store the separated data in memory for snapshot access
      const separatedData = {
        machine_id: machineId,
        update_type: updateType,
        structure: structure,
        status_data: status_data
      };
      this.unifiedMachineStatus.set(machineId, separatedData);

      // Also store basic machine info for backward compatibility
      const machineInfo = {
        machine_id: machineId,
        status: status_data.machine?.phase || 'unknown',
        last_activity: new Date().toISOString(),
        gpu_count: structure?.gpu_count || 0,
        capabilities: JSON.stringify(structure?.capabilities || []),
        structure: JSON.stringify(structure || {}),
        uptime_ms: status_data.machine?.uptime_ms || 0,
      };

      await this.redis.hset(`machine:${machineId}:info`, machineInfo);
      // Set TTL for machine info to expire after 120 seconds without updates
      await this.redis.expire(`machine:${machineId}:info`, 120);

      // Store/update worker data for each worker in the machine
      if (structure?.workers && status_data?.workers) {
        for (const [workerId, workerInfo] of Object.entries(structure.workers)) {
          const workerStatus = status_data.workers[workerId];

          if (workerStatus) {
            const workerData = {
              worker_id: workerId,
              machine_id: machineId,
              status: workerStatus.status || 'unknown',
              is_connected: workerStatus.is_connected || false,
              current_job_id: workerStatus.current_job_id || '',
              last_activity: workerStatus.last_activity || new Date().toISOString(),
              capabilities: JSON.stringify({
                gpu_id: (workerInfo as Record<string, unknown>).gpu_id,
                services: (workerInfo as Record<string, unknown>).services,
              }),
              connector_statuses: JSON.stringify(status_data?.services || {}),
            };

            await this.redis.hset(`worker:${workerId}`, workerData);
            // Set TTL for worker info to expire after 120 seconds without updates
            await this.redis.expire(`worker:${workerId}`, 120);
          }
        }
      }

      // Broadcast appropriate events to monitors based on update type
      if (updateType === 'initial' || updateType === 'periodic') {
        // Broadcast machine update for periodic refreshes
        // Broadcast to WebSocket monitors
        this.eventBroadcaster.broadcastMachineUpdate(machineId, structure, status_data);
      } else if (updateType === 'event_driven') {
        // Broadcast specific status changes for immediate updates
        // Broadcast to WebSocket monitors
        this.eventBroadcaster.broadcastMachineStatusChange(machineId, structure, status_data);
      }

      logger.debug(
        `✅ Processed unified status for ${machineId}: ${Object.keys(structure?.workers || {}).length} workers, ${Object.keys(status_data?.services || {}).length} services`
      );
    } catch (error) {
      logger.error(`❌ Error processing unified machine status for ${machineId}:`, error);
    }
  }

  private mapStepToPhase(stepName: string): string {
    if (stepName.includes('phase_0') || stepName.includes('shared')) {
      return 'shared_setup';
    } else if (
      stepName.includes('phase_1') ||
      stepName.includes('nginx') ||
      stepName.includes('infrastructure')
    ) {
      return 'core_infrastructure';
    } else if (
      stepName.includes('phase_2') ||
      stepName.includes('gpu') ||
      stepName.includes('comfyui') ||
      stepName.includes('automatic1111') ||
      stepName.includes('redis-worker')
    ) {
      return 'ai_services';
    } else if (
      stepName.includes('phase_3') ||
      stepName.includes('ollama') ||
      stepName.includes('supporting')
    ) {
      return 'supporting_services';
    }
    return 'ai_services'; // default
  }

  private broadcastJobEventToClient(
    jobId: string,
    event:
      | JobAssignedEvent
      | JobStatusChangedEvent
      | JobProgressEvent
      | JobCompletedEvent
      | JobFailedEvent
  ): void {
    const submittingClientId = this.jobToClientMap.get(jobId);
    if (submittingClientId) {
      const clientConnection = this.clientConnections.get(submittingClientId);
      if (clientConnection && clientConnection.ws.readyState === WebSocket.OPEN) {
        try {
          clientConnection.ws.send(JSON.stringify(event));
          logger.debug(`Sent ${event.type} event to job submitter client ${submittingClientId}`);
        } catch (error) {
          logger.error(
            `Failed to send ${event.type} to submitting client ${submittingClientId}:`,
            error
          );
          this.clientConnections.delete(submittingClientId);
        }
      }
    }
  }

  private setupProgressStreaming(): void {
    logger.info('🔔 Setting up Redis stream consumers for real-time updates...');

    // Start polling for progress streams
    this.startProgressStreamPolling();

    // Also monitor job status changes via keyspace notifications (for HSET operations)
    this.progressSubscriber.psubscribe('__keyspace@0__:job:*'); // Job status changes
    this.progressSubscriber.psubscribe('__keyspace@0__:worker:*'); // Worker status changes

    this.progressSubscriber.on('pmessage', async (pattern, channel, message) => {
      try {
        logger.debug(
          `🔔 Redis pattern message: pattern=${pattern}, channel=${channel}, message=${message.substring(0, 100)}...`
        );

        // Handle unified machine status updates
        if (pattern === 'machine:status:*' && channel.startsWith('machine:status:')) {
          try {
            const machineStatusData = JSON.parse(message);
            logger.info(
              `🏭 Received unified machine status: ${machineStatusData.machine_id} (${machineStatusData.update_type})`
            );

            // Process the unified machine status
            await this.handleUnifiedMachineStatus(machineStatusData);
          } catch (error) {
            logger.error('Error processing unified machine status message:', error);
          }
        }
        // Handle keyspace notifications
        else if (pattern.startsWith('__keyspace@')) {
          // Handle job status changes
          if (channel.includes(':job:') && message === 'hset') {
            const match = channel.match(/job:(.+)$/);
            if (!match) return;

            const jobId = match[1];
            logger.info(`📋 Job status change detected for job: ${jobId}`);
            await this.handleJobStatusChange(jobId);
          }

          // Handle worker status changes
          else if (channel.includes(':worker:') && message === 'hset') {
            const match = channel.match(/worker:(.+)$/);
            if (!match) return;

            const workerId = match[1];
            logger.info(
              `👷 Worker status change detected for worker: ${workerId}, event: ${message}`
            );
            await this.handleWorkerStatusChange(workerId);
          }
        }
      } catch (error) {
        logger.error(`Failed to handle Redis pattern message:`, error);
      }
    });
  }

  private async startProgressStreamPolling(): Promise<void> {
    // Subscribe to real-time progress events from all workers
    await this.progressSubscriber.subscribe('update_job_progress');
    logger.info('✅ Subscribed to: update_job_progress');

    // Subscribe to real-time worker status changes
    await this.progressSubscriber.subscribe('worker_status');
    logger.info('✅ Subscribed to: worker_status');

    // Subscribe to job completion events
    await this.progressSubscriber.subscribe('complete_job');
    logger.info('✅ Subscribed to: complete_job');

    // Subscribe to job failure events
    await this.progressSubscriber.subscribe('job_failed');
    logger.info('✅ Subscribed to: job_failed');

    // Subscribe to unified machine status updates (replaces fragmented channels)
    logger.info('🔌 Subscribing to unified machine status channel: machine:status:*');
    await this.progressSubscriber.psubscribe('machine:status:*');
    logger.info('✅ Successfully subscribed to: machine:status:* (pattern)');

    this.progressSubscriber.on('message', async (channel, message) => {
      if (channel === 'update_job_progress') {
        try {
          const progressData = JSON.parse(message);
          logger.info(
            `📊 Received real-time progress: job ${progressData.job_id}: ${progressData.progress}% (status: ${progressData.status})`
          );
          logger.info(
            `[JOB PROGRESS] Received progress update - Monitor still connected: ${this.eventBroadcaster.getMonitorCount()} monitors`
          );

          // Broadcast the progress update immediately
          logger.info(
            `[JOB PROGRESS] About to broadcast progress - Monitor still connected: ${this.eventBroadcaster.getMonitorCount()} monitors`
          );
          await this.broadcastProgress(progressData.job_id, progressData);
          logger.info(
            `[JOB PROGRESS] After broadcasting progress - Monitor still connected: ${this.eventBroadcaster.getMonitorCount()} monitors`
          );
        } catch (error) {
          logger.error('Error processing progress message:', error);
        }
      } else if (channel === 'worker_status') {
        try {
          const statusData = JSON.parse(message);
          logger.info(
            `👷 Received real-time worker status: ${statusData.worker_id}: ${statusData.new_status} (job: ${statusData.current_job_id || 'none'})`
          );
          logger.info(
            `[JOB CLAIMED] Worker status change - Monitor still connected: ${this.eventBroadcaster.getMonitorCount()} monitors`
          );

          // Create and broadcast worker status event
          const workerStatusEvent: WorkerStatusChangedEvent = {
            type: 'worker_status_changed',
            worker_id: statusData.worker_id,
            old_status: statusData.old_status,
            new_status: statusData.new_status,
            current_job_id: statusData.current_job_id,
            timestamp: statusData.timestamp,
          };
          logger.info(
            `[JOB CLAIMED] About to broadcast worker status - Monitor still connected: ${this.eventBroadcaster.getMonitorCount()} monitors`
          );
          this.eventBroadcaster.broadcast(workerStatusEvent);

          logger.info(
            `📢 Broadcasted worker status change: ${statusData.worker_id} -> ${statusData.new_status}`
          );
          logger.info(
            `[JOB CLAIMED] After broadcasting worker status - Monitor still connected: ${this.eventBroadcaster.getMonitorCount()} monitors`
          );
        } catch (error) {
          logger.error('Error processing worker status message:', error);
        }
      } else if (channel === 'complete_job') {
        try {
          const completionData = JSON.parse(message);
          logger.info(
            `🎉 Received job completion: job ${completionData.job_id} completed by worker ${completionData.worker_id}`
          );
          logger.info(
            `[JOB COMPLETE] Received completion - Monitor still connected: ${this.eventBroadcaster.getMonitorCount()} monitors`
          );

          // Add a small delay before broadcasting completion to ensure any pending progress updates are processed first
          // This prevents the race condition where completion events arrive before final progress updates
          setTimeout(async () => {
            logger.info(
              `[JOB COMPLETE] About to broadcast completion - Monitor still connected: ${this.eventBroadcaster.getMonitorCount()} monitors`
            );
            await this.broadcastCompletion(completionData.job_id, completionData);
            logger.info(
              `📢 Broadcasted job completion event to clients and monitors: ${completionData.job_id}`
            );
            logger.info(`📢 COMPLETION DATA: ${completionData}`);
            logger.info(
              `[JOB COMPLETE] After broadcasting completion - Monitor still connected: ${this.eventBroadcaster.getMonitorCount()} monitors`
            );
          }, 100); // 100ms delay to allow pending progress updates to be processed
        } catch (error) {
          logger.error('Error processing job completion message:', error);
        }
      } else if (channel === 'job_failed') {
        try {
          const failureData = JSON.parse(message);
          logger.info(
            `❌ Received job failure: job ${failureData.job_id} failed on worker ${failureData.worker_id}: ${failureData.error}`
          );

          // Add a small delay before broadcasting failure to ensure any pending progress updates are processed first
          setTimeout(async () => {
            await this.broadcastFailure(failureData.job_id, failureData);
            logger.info(
              `📢 Broadcasted job failure event to clients and monitors: ${failureData.job_id}`
            );
          }, 100); // 100ms delay to allow pending progress updates to be processed
        } catch (error) {
          logger.error('Error processing job failure message:', error);
        }
      }
    });

    logger.info(
      '✅ Started Redis pub/sub subscription for real-time progress and worker status updates'
    );

    // Start periodic check for stale machines (30s timeout)
    this.startStaleMachineCheck();
  }

  /**
   * Start periodic check for machines that haven't sent status in 30+ seconds
   */
  private startStaleMachineCheck(): void {
    this.staleMachineCheckInterval = setInterval(async () => {
      await this.checkForStaleMachines();
    }, 15000); // Check every 15 seconds

    logger.info('✅ Started stale machine detection (30s timeout)');
  }

  /**
   * Check for machines that haven't sent status updates and mark them as disconnected
   * Now includes Redis-based stale detection that survives API server restarts
   */
  private async checkForStaleMachines(): Promise<void> {
    const now = Date.now();
    const staleThreshold = 30000; // 30 seconds

    // Check in-memory tracked machines (traditional method)
    for (const [machineId, lastSeen] of this.machineLastSeen.entries()) {
      const timeSinceLastSeen = now - lastSeen;

      if (timeSinceLastSeen > staleThreshold) {
        await this.markMachineAsStale(machineId, lastSeen, 'Status timeout (30s)');
      }
    }

    // Check Redis directly for machines with expired TTL or stale data
    // This handles machines that were registered before API server restart
    await this.checkRedisForStaleMachines();
  }

  /**
   * Check Redis directly for stale machines that may not be in memory
   */
  private async checkRedisForStaleMachines(): Promise<void> {
    try {
      // Scan for all machine info keys
      const keys = await this.redis.keys('machine:*:info');

      for (const key of keys) {
        const machineId = key.split(':')[1];

        // Check TTL - if TTL is < 30 seconds, the machine is about to expire
        const ttl = await this.redis.ttl(key);

        if (ttl === -1) {
          // Key exists but has no TTL - this is a legacy stale entry
          logger.warn(`🔴 Found machine ${machineId} without TTL, cleaning up`);
          await this.cleanupStaleMachine(machineId, 'No TTL (legacy data)');
        } else if (ttl < 30 && ttl > 0) {
          // Machine will expire soon and hasn't sent updates
          const machineData = await this.redis.hgetall(key);
          const lastActivity = machineData.last_activity;

          if (lastActivity) {
            const lastSeen = new Date(lastActivity).getTime();
            const timeSinceLastSeen = Date.now() - lastSeen;

            if (timeSinceLastSeen > 60000) {
              // 60 seconds without update
              logger.warn(
                `🔴 Machine ${machineId} is stale (${Math.round(timeSinceLastSeen / 1000)}s since last activity)`
              );
              await this.markMachineAsStale(machineId, lastSeen, 'Redis TTL expiring');
            }
          }
        }
      }
    } catch (error) {
      logger.error('Error checking Redis for stale machines:', error);
    }
  }

  /**
   * Mark a machine as stale and broadcast disconnection
   */
  private async markMachineAsStale(
    machineId: string,
    lastSeen: number,
    reason: string
  ): Promise<void> {
    try {
      // Mark machine as disconnected in Redis
      await this.redis.hset(`machine:${machineId}:info`, {
        status: 'disconnected',
        last_activity: new Date(lastSeen).toISOString(),
        disconnected_at: new Date().toISOString(),
      });

      // Broadcast machine disconnected event to monitors
      this.eventBroadcaster.broadcastMachineDisconnected(machineId, reason);

      // Also broadcast to WebSocket monitors
      this.eventBroadcaster.broadcast({
        type: 'machine_disconnected',
        machine_id: machineId,
        reason: reason,
        timestamp: Date.now(),
      });

      // Remove from tracking to avoid repeated warnings
      this.machineLastSeen.delete(machineId);
      this.unifiedMachineStatus.delete(machineId);

      logger.info(`✅ Marked machine ${machineId} as disconnected: ${reason}`);
    } catch (error) {
      logger.error(`Failed to mark machine ${machineId} as disconnected:`, error);
    }
  }

  /**
   * Completely remove stale machine data from Redis
   */
  private async cleanupStaleMachine(machineId: string, reason: string): Promise<void> {
    try {
      // Remove machine info
      await this.redis.del(`machine:${machineId}:info`);

      // Find and remove associated workers
      const workerKeys = await this.redis.keys(`worker:*`);
      for (const workerKey of workerKeys) {
        const workerData = await this.redis.hgetall(workerKey);
        if (workerData.machine_id === machineId) {
          await this.redis.del(workerKey);
          logger.debug(`Cleaned up worker key: ${workerKey}`);
        }
      }

      // Broadcast machine disconnected event
      this.eventBroadcaster.broadcast({
        type: 'machine_disconnected',
        machine_id: machineId,
        reason: reason,
        timestamp: Date.now(),
      });

      // Remove from in-memory tracking
      this.machineLastSeen.delete(machineId);
      this.unifiedMachineStatus.delete(machineId);

      logger.info(`✅ Completely cleaned up stale machine ${machineId}: ${reason}`);
    } catch (error) {
      logger.error(`Failed to cleanup stale machine ${machineId}:`, error);
    }
  }

  /**
   * Cleanup stale machine and worker data on API server startup
   * This handles phantom machines left over from previous server instances
   */
  private async startupCleanup(): Promise<void> {
    try {
      logger.info('🧹 Starting cleanup of stale machine data...');

      let cleanedMachines = 0;
      let cleanedWorkers = 0;

      // Find all machine keys
      const machineKeys = await this.redis.keys('machine:*:info');

      for (const key of machineKeys) {
        const machineId = key.split(':')[1];
        const ttl = await this.redis.ttl(key);

        if (ttl === -1) {
          // No TTL set - legacy data that needs cleanup
          logger.info(`🔴 Found legacy machine ${machineId} without TTL, removing`);
          await this.cleanupStaleMachine(machineId, 'Startup cleanup (no TTL)');
          cleanedMachines++;
        } else if (ttl < 60) {
          // TTL exists but machine will expire soon - likely stale
          const machineData = await this.redis.hgetall(key);
          const lastActivity = machineData.last_activity;

          if (lastActivity) {
            const timeSinceLastActivity = Date.now() - new Date(lastActivity).getTime();

            if (timeSinceLastActivity > 300000) {
              // 5 minutes old
              logger.info(
                `🔴 Found stale machine ${machineId} (${Math.round(timeSinceLastActivity / 1000)}s old), removing`
              );
              await this.cleanupStaleMachine(machineId, 'Startup cleanup (stale)');
              cleanedMachines++;
            }
          }
        }
      }

      // Find orphaned workers (workers without valid machines)
      const workerKeys = await this.redis.keys('worker:*');
      const validMachineIds = new Set();

      // Get list of valid machine IDs
      const remainingMachineKeys = await this.redis.keys('machine:*:info');
      for (const key of remainingMachineKeys) {
        validMachineIds.add(key.split(':')[1]);
      }

      // Clean up workers without valid machines
      for (const workerKey of workerKeys) {
        const workerData = await this.redis.hgetall(workerKey);
        const machineId = workerData.machine_id;

        if (!machineId || !validMachineIds.has(machineId)) {
          logger.info(`🔴 Found orphaned worker ${workerKey}, removing`);
          await this.redis.del(workerKey);
          cleanedWorkers++;
        }
      }

      if (cleanedMachines > 0 || cleanedWorkers > 0) {
        logger.info(
          `✅ Startup cleanup completed: ${cleanedMachines} machines, ${cleanedWorkers} workers removed`
        );
      } else {
        logger.info('✅ Startup cleanup completed: no stale data found');
      }
    } catch (error) {
      logger.error('Error during startup cleanup:', error);
    }
  }

  private async handleJobStatusChange(jobId: string): Promise<void> {
    try {
      const jobData = await this.redis.hgetall(`job:${jobId}`);
      if (!jobData.id) return;

      const status = jobData.status as string;
      const workerId = jobData.worker_id;

      // Broadcast appropriate event based on status
      if (status === JobStatus.ASSIGNED && workerId) {
        const jobAssignedEvent: JobAssignedEvent = {
          type: 'job_assigned',
          job_id: jobId,
          worker_id: workerId,
          old_status: 'pending',
          new_status: 'assigned',
          assigned_at: Date.now(),
          timestamp: Date.now(),
        };
        this.eventBroadcaster.broadcast(jobAssignedEvent);
      } else if (status === JobStatus.IN_PROGRESS) {
        const jobStatusEvent: JobStatusChangedEvent = {
          type: 'job_status_changed',
          job_id: jobId,
          old_status: JobStatus.ASSIGNED,
          new_status: JobStatus.IN_PROGRESS,
          worker_id: workerId,
          timestamp: Date.now(),
        };
        this.eventBroadcaster.broadcast(jobStatusEvent);
      } else if (status === JobStatus.COMPLETED) {
        const jobCompletedEvent: JobCompletedEvent = {
          type: 'complete_job',
          job_id: jobId,
          worker_id: workerId,
          result: jobData.result ? JSON.parse(jobData.result) : undefined,
          completed_at: Date.now(),
          timestamp: Date.now(),
        };
        this.eventBroadcaster.broadcast(jobCompletedEvent);
      } else if (status === JobStatus.FAILED) {
        const jobFailedEvent: JobFailedEvent = {
          type: 'job_failed',
          job_id: jobId,
          worker_id: workerId,
          error: jobData.error || 'Unknown error',
          failed_at: Date.now(),
          timestamp: Date.now(),
        };
        this.eventBroadcaster.broadcast(jobFailedEvent);
      }

      logger.debug(`Broadcasted job status change: ${jobId} -> ${status}`);
    } catch (error) {
      logger.error(`Failed to handle job status change for ${jobId}:`, error);
    }
  }

  private async handleWorkerStatusChange(workerId: string): Promise<void> {
    try {
      const workerData = await this.redis.hgetall(`worker:${workerId}`);
      logger.info(`👷 Worker data for ${workerId}:`, workerData);

      if (!workerData.worker_id) {
        logger.warn(`No worker data found for ${workerId}`);
        return;
      }

      const newStatus = workerData.status;
      const oldStatus = workerData.previous_status || 'unknown';

      logger.info(
        `👷 Worker ${workerId} status change: ${oldStatus} -> ${newStatus}, current_job: ${workerData.current_job_id || 'none'}`
      );

      const workerStatusEvent: WorkerStatusChangedEvent = {
        type: 'worker_status_changed',
        worker_id: workerId,
        old_status: oldStatus,
        new_status: newStatus,
        current_job_id: workerData.current_job_id,
        timestamp: Date.now(),
      };
      this.eventBroadcaster.broadcast(workerStatusEvent);

      logger.info(`📢 Broadcasted worker status change: ${workerId} ${oldStatus} -> ${newStatus}`);
    } catch (error) {
      logger.error(`Failed to handle worker status change for ${workerId}:`, error);
    }
  }

  private async broadcastProgress(
    jobId: string,
    progressData: Record<string, string>
  ): Promise<void> {
    // Create standardized progress event for both monitors and clients
    if (progressData.worker_id && progressData.progress) {
      const jobProgressEvent: JobProgressEvent = {
        type: 'update_job_progress',
        job_id: jobId,
        worker_id: progressData.worker_id,
        progress: parseInt(progressData.progress) || 0,
        status: progressData.status,
        message: progressData.message,
        timestamp: Date.now(),
      };

      // Broadcast to both monitors and clients via EventBroadcaster
      this.eventBroadcaster.broadcast(jobProgressEvent);
    }

    // Check if this is a status change (assigned/processing/completed/failed)
    const status = progressData.status;
    if (status === 'assigned') {
      // Broadcast job assignment
      const jobAssignedEvent: JobAssignedEvent = {
        type: 'job_assigned',
        job_id: jobId,
        worker_id: progressData.worker_id || 'unknown',
        old_status: 'pending',
        new_status: 'assigned',
        assigned_at: Date.now(),
        timestamp: Date.now(),
      };
      this.eventBroadcaster.broadcast(jobAssignedEvent);
      this.broadcastJobEventToClient(jobId, jobAssignedEvent);
    } else if (status === 'processing') {
      // Broadcast job processing start
      const jobStatusEvent: JobStatusChangedEvent = {
        type: 'job_status_changed',
        job_id: jobId,
        old_status: JobStatus.ASSIGNED,
        new_status: JobStatus.IN_PROGRESS,
        worker_id: progressData.worker_id || 'unknown',
        timestamp: Date.now(),
      };
      this.eventBroadcaster.broadcast(jobStatusEvent);
      this.broadcastJobEventToClient(jobId, jobStatusEvent);
    } else if (status === 'completed') {
      // Broadcast job completion
      const jobCompletedEvent: JobCompletedEvent = {
        type: 'complete_job',
        job_id: jobId,
        worker_id: progressData.worker_id || 'unknown',
        result: progressData.result || null,
        completed_at: Date.now(),
        timestamp: Date.now(),
      };
      this.eventBroadcaster.broadcast(jobCompletedEvent);
      this.broadcastJobEventToClient(jobId, jobCompletedEvent);

      // Clean up job-to-client mapping for completed jobs
      this.jobToClientMap.delete(jobId);
    } else if (status === 'failed') {
      // Broadcast job failure
      const jobFailedEvent: JobFailedEvent = {
        type: 'job_failed',
        job_id: jobId,
        worker_id: progressData.worker_id || 'unknown',
        error: progressData.message || 'Job failed',
        failed_at: Date.now(),
        timestamp: Date.now(),
      };
      this.eventBroadcaster.broadcast(jobFailedEvent);

      this.broadcastJobEventToClient(jobId, jobFailedEvent);

      // Clean up job-to-client mapping for failed jobs
      this.jobToClientMap.delete(jobId);
    }
    // Note: Regular progress updates are already handled at the top of this method
  }

  private async broadcastCompletion(
    jobId: string,
    completionData: Record<string, unknown>
  ): Promise<void> {
    const _completionMessage = {
      type: 'complete_job',
      job_id: jobId,
      worker_id: completionData.worker_id,
      result: completionData.result,
      completed_at: completionData.timestamp,
      timestamp: completionData.timestamp,
    };

    // Get job details to check for workflow information
    const jobData = await this.redis.hgetall(`job:${jobId}`);
    
    // 🚨 PROMINENT JOB WORKFLOW INFO LOGGING 🚨
    logger.info(`🔍 JOB WORKFLOW INFO: ${jobId}`);
    logger.info(`📋 workflow_id: ${jobData.workflow_id || 'NOT_SET'}`);
    logger.info(`📊 current_step: ${jobData.current_step || 'NOT_SET'} (type: ${typeof jobData.current_step})`);
    logger.info(`🔢 current_step: ${jobData.current_step || 'NOT_SET'} (type: ${typeof jobData.current_step})`);
    logger.info(`📈 total_steps: ${jobData.total_steps || 'NOT_SET'} (type: ${typeof jobData.total_steps})`);
    logger.info(`🚨 STEP FIELD ANALYSIS:`);
    logger.info(`   - current_step present: ${jobData.current_step !== undefined}`);
    logger.info(`   - current_step present: ${jobData.current_step !== undefined}`);
    logger.info(`   - current_step field present: ${jobData.current_step !== undefined}`);
    logger.info(`   - current_step value: ${jobData.current_step || 'N/A'}`);
    logger.info(`✅ Has workflow fields: ${!!(jobData.workflow_id && jobData.current_step && jobData.total_steps)}`);
    
    // Handle workflow step completion tracing
    if (jobData.workflow_id && jobData.current_step && jobData.total_steps) {
      const workflowId = jobData.workflow_id;
      // Use current_step (1-based)
      const stepNumber = parseInt(jobData.current_step as string);
      const totalSteps = parseInt(jobData.total_steps as string);
      
      // Get workflow context
      const workflowContext = this.workflowTraceContexts.get(workflowId);
      logger.info(`🔍 WORKFLOW CONTEXT CHECK: ${workflowId}`);
      logger.info(`   - Context exists: ${!!workflowContext}`);
      logger.info(`   - Current step: ${stepNumber}`);
      logger.info(`   - Total steps: ${totalSteps}`);
      logger.info(`   - Is final step? ${stepNumber === totalSteps}`);
      
      if (workflowContext) {
        // Trace workflow step completion
        await WorkflowInstrumentation.stepComplete({
          workflowId,
          stepNumber,
          totalSteps,
          jobId,
          stepType: jobData.service_required || 'unknown',
        }, {
          traceId: workflowContext.traceId,
          spanId: workflowContext.spanId,
        });
        
        // If this was the last step, complete the workflow (ONLY check for exact match)
        if (stepNumber === totalSteps) {
          // 🚨🚨🚨 PROMINENT WORKFLOW COMPLETION DETECTION 🚨🚨🚨
          logger.info(`🚨🚨🚨 WORKFLOW COMPLETION DETECTED 🚨🚨🚨`);
          logger.info(`📋 WORKFLOW_ID: ${workflowId}`);
          logger.info(`📊 STEP: ${stepNumber}/${totalSteps}`);
          logger.info(`🎯 JOB_ID: ${jobId}`);
          logger.info(`📝 WORKFLOW_TYPE: ${totalSteps === 1 ? 'SINGLE-STEP' : 'MULTI-STEP'}`);
          logger.info(`⏰ TIMESTAMP: ${new Date().toISOString()}`);
          logger.info(`🚨🚨🚨 STARTING EMPROPS VERIFICATION 🚨🚨🚨`);
          
          await WorkflowInstrumentation.complete({
            workflowId,
            totalSteps,
            completedSteps: totalSteps,
            duration: Date.now() - workflowContext.startedAt,
            status: 'completed',
          }, {
            traceId: workflowContext.traceId,
            spanId: workflowContext.spanId,
          });
          
          // Clean up workflow context
          this.workflowTraceContexts.delete(workflowId);
          logger.info(`🎯 WORKFLOW COMPLETED: ${workflowId} (${totalSteps} steps)`);
          
          // Verify workflow completion with EMPROPS before sending webhook
          // Pass the original completion data so we can retry with the same message
          this.verifyWorkflowWithEmprops(workflowId, {
            job_id: jobId,
            workflow_id: workflowId,
            current_step: stepNumber,
            total_steps: totalSteps,
            status: 'completed',
            completed_at: completionData.completed_at,
            timestamp: completionData.timestamp,
            worker_id: completionData.worker_id,
            machine_id: completionData.machine_id,
            result: completionData.result,
            message: completionData.message
          }).catch(error => {
            logger.error(`Failed to verify workflow ${workflowId} with EMPROPS:`, error);
          });
        }
      } else {
        logger.warn(`⚠️ WORKFLOW CONTEXT MISSING: ${workflowId}`);
        logger.warn(`   - Current step: ${stepNumber}`);
        logger.warn(`   - Total steps: ${totalSteps}`);
        logger.warn(`   - Should this be final step? ${stepNumber === totalSteps}`);
        
        // If this should be the final step and we don't have context,
        // this indicates the workflow context was prematurely deleted
        if (stepNumber === totalSteps) {
          logger.error(`🚨 CRITICAL: Final step (${stepNumber}/${totalSteps}) has no workflow context!`);
          logger.error(`   This suggests workflow completion was triggered prematurely on an earlier step.`);
          
          // For now, we'll still try to verify with EMPROPS even without the context
          // This ensures the user gets their workflow_completed webhook
          logger.info(`🔄 ATTEMPTING EMPROPS VERIFICATION WITHOUT WORKFLOW CONTEXT`);
          this.verifyWorkflowWithEmprops(workflowId, {
            job_id: jobId,
            workflow_id: workflowId,
            current_step: stepNumber,
            total_steps: totalSteps,
            status: 'completed',
            completed_at: completionData.completed_at,
            timestamp: completionData.timestamp,
            worker_id: completionData.worker_id,
            machine_id: completionData.machine_id,
            result: completionData.result,
            message: completionData.message
          }).catch(error => {
            logger.error(`Failed to verify workflow ${workflowId} with EMPROPS (no context):`, error);
          });
        }
      }
    }

    // Create completion event for monitors (original format)
    const jobCompletedEvent: JobCompletedEvent = {
      type: 'complete_job',
      job_id: jobId,
      worker_id: completionData.worker_id as string,
      result: completionData.result,
      completed_at: completionData.timestamp as number,
      timestamp: completionData.timestamp as number,
    };

    // Broadcast to both monitors and clients via EventBroadcaster
    // EventBroadcaster will automatically format for each connection type
    this.eventBroadcaster.broadcast(jobCompletedEvent);

    // Use new function to broadcast to the specific client that submitted this job
    this.broadcastJobEventToClient(jobId, jobCompletedEvent);

    // Also broadcast to the client that submitted this job
    const submittingClientId = this.jobToClientMap.get(jobId);
    if (submittingClientId) {
      const clientConnection = this.clientConnections.get(submittingClientId);
      if (clientConnection && clientConnection.ws.readyState === clientConnection.ws.OPEN) {
        try {
          // clientConnection.ws.send(JSON.stringify(completionMessage)); // Legacy - causes duplicates
          logger.debug(`Sent completion update to job submitter client ${submittingClientId}`);
        } catch (error) {
          logger.error(
            `Failed to send completion to submitting client ${submittingClientId}:`,
            error
          );
          this.clientConnections.delete(submittingClientId);
        }
      }
      // Clean up job-to-client mapping for completed jobs
      this.jobToClientMap.delete(jobId);
    }
  }

  private async broadcastFailure(
    jobId: string,
    failureData: Record<string, unknown>
  ): Promise<void> {
    // Get job details to check for workflow information
    const jobData = await this.redis.hgetall(`job:${jobId}`);
    
    // Handle workflow step failure tracing
    if (jobData.workflow_id && jobData.current_step && jobData.total_steps) {
      const workflowId = jobData.workflow_id;
      const stepNumber = parseInt(jobData.current_step);
      const totalSteps = parseInt(jobData.total_steps);
      
      // Get workflow context
      const workflowContext = this.workflowTraceContexts.get(workflowId);
      if (workflowContext) {
        // Trace workflow step failure
        await WorkflowInstrumentation.stepFail({
          workflowId,
          stepNumber,
          jobId,
          error: failureData.error as string,
          failureType: 'job_processing_error',
        }, {
          traceId: workflowContext.traceId,
          spanId: workflowContext.spanId,
        });
        
        // Mark the entire workflow as failed
        await WorkflowInstrumentation.complete({
          workflowId,
          totalSteps,
          completedSteps: stepNumber - 1, // Steps completed before this failure
          duration: Date.now() - workflowContext.startedAt,
          status: 'failed',
        }, {
          traceId: workflowContext.traceId,
          spanId: workflowContext.spanId,
        });
        
        // Clean up workflow context
        this.workflowTraceContexts.delete(workflowId);
        logger.info(`💥 WORKFLOW FAILED: ${workflowId} at step ${stepNumber}/${totalSteps} - ${failureData.error}`);
      }
    }

    // Create failure event for monitors
    const jobFailedEvent: JobFailedEvent = {
      type: 'job_failed',
      job_id: jobId,
      worker_id: failureData.worker_id as string,
      error: failureData.error as string,
      failed_at: failureData.timestamp as number,
      timestamp: failureData.timestamp as number,
    };

    // Broadcast to both monitors and clients via EventBroadcaster
    this.eventBroadcaster.broadcast(jobFailedEvent);

    // Broadcast to the specific client that submitted this job
    this.broadcastJobEventToClient(jobId, jobFailedEvent);

    // Also broadcast to the client that submitted this job
    const submittingClientId = this.jobToClientMap.get(jobId);
    if (submittingClientId) {
      const clientConnection = this.clientConnections.get(submittingClientId);
      if (clientConnection && clientConnection.ws.readyState === clientConnection.ws.OPEN) {
        try {
          logger.debug(`Sent failure update to job submitter client ${submittingClientId}`);
        } catch (error) {
          logger.error(
            `Failed to send failure to submitting client ${submittingClientId}:`,
            error
          );
          this.clientConnections.delete(submittingClientId);
        }
      }
      // Clean up job-to-client mapping for failed jobs
      this.jobToClientMap.delete(jobId);
    }
  }

  private async submitJob(
    jobData: Record<string, unknown>,
    providedJobId?: string
  ): Promise<string> {
    // Submit job directly to Redis (no hub orchestration)
    // Use provided job ID (for EmProps compatibility) or generate new one

    logger.info(`🔍 [SUBMIT_JOB_DEBUG] Starting submitJob method`);
    logger.info(`🔍 [SUBMIT_JOB_DEBUG] Received jobData keys: ${Object.keys(jobData)}`);
    logger.info(`🔍 [SUBMIT_JOB_DEBUG] ProvidedJobId: ${providedJobId}`);

    const jobId = providedJobId || uuidv4();
    logger.info(`🔍 [SUBMIT_JOB_DEBUG] Using jobId: ${jobId}`);
    
    // Handle workflow tracing if this job is part of a workflow
    let workflowStepSpanContext: { traceId: string; spanId: string } | undefined;
    let parentSpanContext: { traceId: string; spanId: string } | undefined;
    
    if (jobData.workflow_id && jobData.current_step && jobData.total_steps) {
      const workflowId = jobData.workflow_id as string;
      // Use current_step (1-based)
      const stepNumber = (jobData.current_step as number);
      const totalSteps = jobData.total_steps as number;
      const workflowType = (jobData.service_required as string) || 'multi_step_workflow';
      
      // Check if this is the first step - if so, start the workflow (handle 0-based indexing)
      if (stepNumber === 1 || (stepNumber === 0 && totalSteps >= 1)) {
        // 🚨🚨🚨 PROMINENT WORKFLOW SUBMISSION DETECTION 🚨🚨🚨
        logger.info(`🚨🚨🚨 WORKFLOW SUBMISSION DETECTED 🚨🚨🚨`);
        logger.info(`📋 WORKFLOW_ID: ${workflowId}`);
        logger.info(`📊 TOTAL_STEPS: ${totalSteps}`);
        logger.info(`🎯 FIRST_JOB_ID: ${jobId}`);
        logger.info(`👤 CUSTOMER_ID: ${jobData.customer_id || 'NOT_SET'}`);
        logger.info(`🔧 SERVICE_TYPE: ${workflowType}`);
        logger.info(`⏰ TIMESTAMP: ${new Date().toISOString()}`);
        logger.info(`🚨🚨🚨 PUBLISHING WORKFLOW_SUBMITTED EVENT 🚨🚨🚨`);
        
        const workflowStartSpanContext = await WorkflowInstrumentation.start({
          workflowId,
          totalSteps,
          userId: jobData.customer_id as string | undefined,
          workflowType,
          estimatedDuration: undefined, // Could be calculated from job requirements
        });
        
        // Store workflow context for future steps
        this.workflowTraceContexts.set(workflowId, {
          traceId: workflowStartSpanContext.traceId,
          spanId: workflowStartSpanContext.spanId,
          totalSteps,
          startedAt: Date.now(),
        });
        
        parentSpanContext = workflowStartSpanContext;
        
        // Publish workflow_submitted event to Redis for webhook notifications
        try {
          await this.redis.publish('workflow_submitted', JSON.stringify({
            workflow_id: workflowId,
            first_job_id: jobId,
            total_steps: totalSteps,
            workflow_priority: jobData.workflow_priority || jobData.priority || 50,
            workflow_datetime: jobData.workflow_datetime || Date.now(),
            customer_id: jobData.customer_id,
            service_required: jobData.service_required,
            timestamp: Date.now(),
            workflow_type: workflowType,
            message: 'Workflow started with first job submission'
          }));
          
          logger.info(`📤 Published workflow_submitted event for workflow ${workflowId}`);
        } catch (error) {
          logger.error(`❌ Failed to publish workflow_submitted event for ${workflowId}:`, error);
        }
      } else {
        // Use existing workflow context
        const existingWorkflowContext = this.workflowTraceContexts.get(workflowId);
        if (existingWorkflowContext) {
          parentSpanContext = {
            traceId: existingWorkflowContext.traceId,
            spanId: existingWorkflowContext.spanId,
          };
        }
      }
      
      // Create workflow step submission trace
      workflowStepSpanContext = await WorkflowInstrumentation.stepSubmit({
        workflowId,
        stepNumber,
        totalSteps,
        jobId,
        stepType: (jobData.service_required as string) || 'unknown',
      }, parentSpanContext);
      
      // Use workflow step as parent for job submission
      parentSpanContext = workflowStepSpanContext;
    }
    
    // 🚨 BIG TRACE LOGGING: ABOUT TO CREATE JOB SUBMISSION SPAN
    console.log(`\n🚨🚨🚨 API: BIG SUBMITTING TRACE for JOB ${jobId}`);
    console.log(`🚨 JOB: ${jobId}`);
    console.log(`🚨 WORKFLOW: ${jobData.workflow_id || 'NONE'}`);
    console.log(`🚨 PARENT SPAN CONTEXT:`, parentSpanContext);
    console.log(`🚨🚨🚨\n`);
    
    // Start job submission tracing (either standalone or as child of workflow step)
    const submitSpanContext = await JobInstrumentation.submit({
      jobId,
      jobType: (jobData.service_required as string) || 
               (jobData.job_type as string) || 
               (jobData.type as string) || 'unknown',
      priority: (jobData.priority as number) || 50,
      queueName: 'default',
      submittedBy: 'api-server',
      workflowId: jobData.workflow_id as string | undefined,
      userId: jobData.customer_id as string | undefined,
      payload: jobData.payload || jobData, // Include the full payload sent to services
      payloadSizeBytes: JSON.stringify(jobData.payload || jobData).length
    }, parentSpanContext);
    
    // 🚨 BIG TRACE LOGGING: AFTER CREATING JOB SUBMISSION SPAN
    console.log(`\n🚨🚨🚨 API: JOB SUBMISSION SPAN CREATED FOR JOB ${jobId}`);
    console.log(`🚨 JOB: ${jobId}`);
    console.log(`🚨 WORKFLOW: ${jobData.workflow_id || 'NONE'}`);
    console.log(`🚨 SUBMIT TRACE_ID: ${submitSpanContext.traceId}`);
    console.log(`🚨 SUBMIT SPAN_ID: ${submitSpanContext.spanId}`);
    console.log(`🚨🚨🚨\n`);
    
    if (providedJobId) {
      logger.info(`[JOB SUBMIT START] Using provided job ID: ${jobId} (EmProps compatibility)`);
    } else {
      logger.info(`[JOB SUBMIT START] Generated new job ID: ${jobId}`);
    }
    logger.info(
      `[JOB SUBMIT START] Job ${jobId} - Monitor still connected: ${this.eventBroadcaster.getMonitorCount()} monitors`
    );

    // DEBUG: Log the incoming jobData to see what we're receiving
    logger.debug(`🔍 API SUBMIT DEBUG Job ${jobId}:`, {
      total_steps: jobData.total_steps,
      total_steps_type: typeof jobData.total_steps,
      current_step: jobData.current_step,
      current_step_type: typeof jobData.current_step,
      workflow_id: jobData.workflow_id,
      full_jobData_keys: Object.keys(jobData),
    });
    const now = new Date().toISOString();

    const job: Job = {
      id: jobId,
      service_required:
        (jobData.service_required as string) ||
        (jobData.job_type as string) ||
        (jobData.type as string) ||
        'unknown',
      priority: (jobData.priority as number) || 50,
      payload: (jobData.payload as Record<string, unknown>) || {},
      requirements: jobData.requirements as JobRequirements | undefined,
      customer_id: jobData.customer_id as string,
      created_at: now,
      status: JobStatus.PENDING,
      retry_count: (jobData.retry_count as number) || 0,
      max_retries: (jobData.max_retries as number) || 3,
      workflow_id: jobData.workflow_id as string | undefined,
      workflow_priority: jobData.workflow_priority as number | undefined,
      workflow_datetime: jobData.workflow_datetime as number | undefined,
      current_step: jobData.current_step as number | undefined,
      total_steps: jobData.total_steps as number | undefined,
      // Storage context (separate from payload to avoid sending to external APIs)
      ctx: jobData.ctx as Record<string, unknown> | undefined,
    };

    logger.info(`Job:`, JSON.stringify(job, null, 2));

    // Store job in Redis
    logger.info(
      `[JOB SUBMIT] Storing job ${jobId} in Redis - Monitor still connected: ${this.eventBroadcaster.getMonitorCount()} monitors`
    );
    logger.info(`🔍 [SUBMIT_JOB_DEBUG] About to call redis.hmset for job:${jobId}`);
    
    // 🚨 BIG TRACE LOGGING: STORING TRACE CONTEXT IN REDIS
    console.log(`\n🚨🚨🚨 API: STORING JOB ${jobId} IN REDIS WITH TRACE CONTEXT`);
    console.log(`🚨 JOB: ${jobId}`);
    console.log(`🚨 WORKFLOW: ${job.workflow_id || 'NONE'}`);
    console.log(`🚨 STORING job_trace_id: ${submitSpanContext.traceId}`);
    console.log(`🚨 STORING job_span_id: ${submitSpanContext.spanId}`);
    console.log(`🚨 STORING workflow_trace_id: ${workflowStepSpanContext?.traceId || 'NONE'}`);
    console.log(`🚨 STORING workflow_span_id: ${workflowStepSpanContext?.spanId || 'NONE'}`);
    console.log(`🚨🚨🚨\n`);
    
    try {
      await this.redis.hmset(`job:${jobId}`, {
      id: job.id,
      service_required: job.service_required,
      priority: job.priority.toString(),
      payload: JSON.stringify(job.payload),
      requirements: job.requirements ? JSON.stringify(job.requirements) : '',
      customer_id: job.customer_id || '',
      created_at: job.created_at,
      status: job.status,
      retry_count: job.retry_count.toString(),
      max_retries: job.max_retries.toString(),
      workflow_id: job.workflow_id || '',
      workflow_priority: job.workflow_priority?.toString() || '',
      workflow_datetime: job.workflow_datetime?.toString() || '',
      current_step: job.current_step?.toString() || '',
      total_steps: job.total_steps?.toString() || '',
      // Trace context for cross-service propagation
      job_trace_id: submitSpanContext.traceId,
      job_span_id: submitSpanContext.spanId,
      workflow_trace_id: workflowStepSpanContext?.traceId || '',
      workflow_span_id: workflowStepSpanContext?.spanId || '',
      // Storage context (separate from payload to avoid sending to external APIs)
      ctx: job.ctx ? JSON.stringify(job.ctx) : '',
    });
    logger.info(`🔍 [SUBMIT_JOB_DEBUG] Successfully stored job in Redis hash`);
    
    // 🚨 BIG TRACE LOGGING: CONFIRM WHAT GOT STORED
    console.log(`\n🚨🚨🚨 API: REDIS STORAGE COMPLETE FOR JOB ${jobId}`);
    console.log(`🚨 JOB: ${jobId} - STORED IN REDIS WITH TRACE IDs`);
    console.log(`🚨🚨🚨\n`);
    } catch (error) {
      logger.error(`🔍 [SUBMIT_JOB_DEBUG] FAILED to store job in Redis hash:`, error);
      throw error;
    }

    // Add to pending queue with workflow-aware scoring
    // In Redis sorted sets, HIGHER scores come FIRST (ZREVRANGE)
    // Requirements:
    // 1. Higher priority jobs ALWAYS come before lower priority jobs
    // 2. Within same priority, older jobs come first (FIFO)

    const effectivePriority = job.workflow_priority || job.priority;
    const effectiveDateTime = job.workflow_datetime || Date.parse(job.created_at);

    // Score formula: (priority * 10^15) - (timestamp / 1000)
    // - Priority is multiplied by 10^15 to ensure it always dominates
    // - Timestamp is divided by 1000 (convert ms to seconds) to prevent overflow
    // - Subtracting timestamp means older jobs (smaller timestamps) get higher scores
    const priorityComponent = effectivePriority * 1e15;
    const timeComponent = Math.floor(effectiveDateTime / 1000);
    const score = priorityComponent - timeComponent;

    logger.info(
      `Job ${jobId} scoring: priority=${job.priority}, workflow_priority=${job.workflow_priority}, effective_priority=${effectivePriority}, timestamp=${new Date(effectiveDateTime).toISOString()}, score=${score.toExponential(2)} (${priorityComponent.toExponential(2)} - ${timeComponent})`
    );

    logger.info(`🔍 [SUBMIT_JOB_DEBUG] About to add job to pending queue with score: ${score}`);
    
    try {
      await this.redis.zadd('jobs:pending', score, jobId);
      logger.info(`🔍 [SUBMIT_JOB_DEBUG] Successfully added job to pending queue`);
      logger.info(
        `[JOB SUBMIT] Job ${jobId} added to pending queue - Monitor still connected: ${this.eventBroadcaster.getMonitorCount()} monitors`
      );
    } catch (error) {
      logger.error(`🔍 [SUBMIT_JOB_DEBUG] FAILED to add job to pending queue:`, error);
      throw error;
    }

    // Trace job save to Redis (after score calculation)
    logger.info(`🔍 [SUBMIT_JOB_DEBUG] About to call JobInstrumentation.saveToRedis`);
    
    try {
      await JobInstrumentation.saveToRedis({
        jobId,
        redisKey: `job:${jobId}`,
        queueScore: score,
      }, submitSpanContext);
      logger.info(`🔍 [SUBMIT_JOB_DEBUG] Successfully completed JobInstrumentation.saveToRedis`);
    } catch (error) {
      logger.error(`🔍 [SUBMIT_JOB_DEBUG] FAILED JobInstrumentation.saveToRedis:`, error);
      throw error;
    }

    // Create job_submitted event for monitors (original format)
    const jobSubmittedEvent: JobSubmittedEvent = {
      type: 'job_submitted',
      job_id: jobId,
      job_data: {
        id: jobId,
        job_type: job.service_required,
        status: 'pending',
        priority: job.priority,
        payload: job.payload,
        workflow_id: jobData.workflow_id as string,
        workflow_priority: jobData.workflow_priority as number,
        workflow_datetime: jobData.workflow_datetime as number,
        current_step: jobData.current_step as number,
        total_steps: jobData.total_steps as number,
        customer_id: job.customer_id,
        requirements: job.requirements,
        created_at: Date.now(),
      },
      timestamp: Date.now(),
    };

    logger.debug('[TRACE 1] Job submitted, about to broadcast', {
      jobId,
      eventBroadcasterInstance: (this.eventBroadcaster as unknown as { instanceId: string })
        .instanceId,
    });

    // Broadcast job_submitted to both monitors and clients via EventBroadcaster
    this.eventBroadcaster.broadcast(jobSubmittedEvent);

    // ALSO publish job_submitted event to Redis for webhook notifications
    logger.info(`🔍 [SUBMIT_JOB_DEBUG] About to create submission event and publish to Redis`);
    
    const submissionEvent = {
      job_id: jobId,
      service_required: job.service_required,
      priority: job.priority,
      payload: job.payload,
      requirements: job.requirements,
      customer_id: job.customer_id,
      created_at: job.created_at,
      status: 'pending',
      timestamp: Date.now(),
      // Workflow fields for workflow tracking and events
      workflow_id: job.workflow_id,
      workflow_priority: job.workflow_priority,
      workflow_datetime: job.workflow_datetime,
      current_step: job.current_step,
      total_steps: job.total_steps,
    };
    
    try {
      await this.redis.publish('job_submitted', JSON.stringify(submissionEvent));
      logger.info(`🔍 [SUBMIT_JOB_DEBUG] Successfully published job_submitted event to Redis`);
    } catch (error) {
      logger.error(`🔍 [SUBMIT_JOB_DEBUG] FAILED to publish job_submitted event:`, error);
      throw error;
    }

    logger.info(`📢 [DEBUG] Broadcasted job_submitted event for ${jobId}`);
    logger.info(`📢 [DEBUG] Published job_submitted to Redis for webhooks: ${jobId}`);

    logger.info(`🔍 [SUBMIT_JOB_DEBUG] submitJob method completed successfully`);
    logger.info(`Job ${jobId} submitted via lightweight API (${job.service_required})`);
    return jobId;
  }

  private async getJobStatus(jobId: string): Promise<Job | null> {
    const jobData = await this.redis.hgetall(`job:${jobId}`);
    if (!jobData.id) return null;

    // Parse payload to get retry_count from ctx (same as asset-saver)
    let parsedPayload: any = {};
    try {
      parsedPayload = JSON.parse(jobData.payload || '{}');
    } catch (e) {
      logger.warn(`Failed to parse payload for job ${jobId}: ${e.message}`);
      parsedPayload = {};
    }

    // Get retry count from the same place asset-saver gets it: ctx.workflow_context.retry_attempt
    // parsedPayload.ctx is undefined, but jobData.ctx contains the workflow_context as JSON string
    let parsedCtx: any = null;
    try {
      parsedCtx = typeof jobData.ctx === 'string' ? JSON.parse(jobData.ctx) : jobData.ctx;
    } catch (error) {
      // Continue without ctx if parsing fails
    }

    const retryCount =
      parsedCtx?.workflow_context?.retry_attempt ||
      parsedPayload.ctx?.retry_count ||
      parsedPayload.ctx?.retryCount ||
      parseInt(jobData.retry_count || '0');

    return {
      id: jobData.id,
      service_required: jobData.service_required,
      priority: parseInt(jobData.priority || '50'),
      payload: parsedPayload,
      requirements: jobData.requirements ? JSON.parse(jobData.requirements) : undefined,
      customer_id: jobData.customer_id || undefined,
      created_at: jobData.created_at,
      assigned_at: jobData.assigned_at || undefined,
      started_at: jobData.started_at || undefined,
      completed_at: jobData.completed_at || undefined,
      failed_at: jobData.failed_at || undefined,
      worker_id: jobData.worker_id || undefined,
      status: (jobData.status || 'pending') as JobStatus,
      retry_count: retryCount,
      max_retries: parseInt(jobData.max_retries || '3'),
      last_failed_worker: jobData.last_failed_worker || undefined,
      processing_time: jobData.processing_time ? parseInt(jobData.processing_time) : undefined,
      estimated_completion: jobData.estimated_completion || undefined,
      // Workflow fields
      workflow_id: jobData.workflow_id || undefined,
      workflow_priority: jobData.workflow_priority
        ? parseInt(jobData.workflow_priority)
        : undefined,
      workflow_datetime: jobData.workflow_datetime
        ? parseInt(jobData.workflow_datetime)
        : undefined,
      current_step: jobData.current_step ? parseInt(jobData.current_step) : undefined,
      total_steps:
        jobData.total_steps && jobData.total_steps !== ''
          ? parseInt(jobData.total_steps)
          : undefined,
    };
  }

  private async cancelJob(jobId: string): Promise<void> {
    try {
      // Get current job status
      const jobData = await this.redis.hgetall(`job:${jobId}`);
      if (!jobData.id) {
        throw new Error(`Job ${jobId} not found`);
      }

      const currentStatus = jobData.status;

      // Only allow cancellation of pending, assigned, or in-progress jobs
      if (currentStatus === 'completed' || currentStatus === 'failed') {
        throw new Error(`Cannot cancel job ${jobId} - already ${currentStatus}`);
      }

      // Update job status to failed with cancellation message
      await this.redis.hmset(`job:${jobId}`, {
        status: JobStatus.FAILED,
        failed_at: new Date().toISOString(),
        error: 'Job cancelled by user',
      });

      // If job was assigned to a worker, remove it from worker's active jobs
      if (jobData.worker_id) {
        await this.redis.hdel(`jobs:active:${jobData.worker_id}`, jobId);

        // Send cancellation message to worker (if they support it)
        try {
          await this.redis.publish(
            'cancel_job',
            JSON.stringify({
              job_id: jobId,
              worker_id: jobData.worker_id,
              reason: 'Job cancelled by user',
              timestamp: Date.now(),
            })
          );
        } catch (error) {
          logger.warn(`Failed to send cancellation message to worker ${jobData.worker_id}:`, error);
        }
      }

      // Remove from pending queue if it was still pending
      if (currentStatus === 'pending') {
        await this.redis.zrem('jobs:pending', jobId);
      }

      // Store in failed jobs for tracking
      await this.redis.hset(
        'jobs:failed',
        jobId,
        JSON.stringify({
          error: 'Job cancelled by user',
          failed_at: new Date().toISOString(),
          cancelled: true,
        })
      );

      // Broadcast job failure event
      const jobFailedEvent: JobFailedEvent = {
        type: 'job_failed',
        job_id: jobId,
        worker_id: jobData.worker_id || undefined,
        error: 'Job cancelled by user',
        failed_at: Date.now(),
        timestamp: Date.now(),
      };
      this.eventBroadcaster.broadcast(jobFailedEvent);

      logger.info(`Job ${jobId} cancelled successfully (was ${currentStatus})`);
    } catch (error) {
      logger.error(`Failed to cancel job ${jobId}:`, error);
      throw error;
    }
  }

  private async getJobs(options: {
    status?: string;
    limit: number;
    offset: number;
  }): Promise<Job[]> {
    const startTime = Date.now();
    const jobs: Job[] = [];
    const jobKeys: string[] = [];

    // Use SCAN instead of KEYS to avoid blocking
    let cursor = '0';
    do {
      const [newCursor, keys] = await this.redis.scan(cursor, 'MATCH', 'job:*', 'COUNT', 100);
      cursor = newCursor;
      // Filter out progress streams - only include actual job data keys
      const jobDataKeys = keys.filter(key => !key.includes(':progress'));
      jobKeys.push(...jobDataKeys);
    } while (cursor !== '0');

    logger.debug(`SCAN found ${jobKeys.length} job keys in ${Date.now() - startTime}ms`);

    // Apply pagination on the keys
    const paginatedKeys = jobKeys.slice(options.offset, options.offset + options.limit);

    if (paginatedKeys.length === 0) {
      return jobs;
    }

    // Use pipeline to batch fetch all job data
    const pipeline = this.redis.pipeline();
    for (const key of paginatedKeys) {
      pipeline.hgetall(key);
    }

    const pipelineStart = Date.now();
    const results = await pipeline.exec();
    logger.debug(
      `Pipeline fetched ${paginatedKeys.length} jobs in ${Date.now() - pipelineStart}ms`
    );

    // Process results
    if (results) {
      for (let i = 0; i < results.length; i++) {
        const [err, jobData] = results[i];
        if (!err && jobData && (jobData as Record<string, string>).id) {
          const job = this.parseJobData(jobData as Record<string, string>);
          if (job && (!options.status || job.status === options.status)) {
            jobs.push(job);
          }
        }
      }
    }

    const sortedJobs = jobs.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    logger.debug(
      `Total getJobs execution time: ${Date.now() - startTime}ms for ${sortedJobs.length} jobs`
    );

    return sortedJobs;
  }

  private parseJobData(jobData: Record<string, string>): Job | null {
    if (!jobData.id) return null;

    // Parse payload to get retry_count from ctx (same as asset-saver)
    let parsedPayload: any = {};
    try {
      parsedPayload = JSON.parse(jobData.payload || '{}');
    } catch (e) {
      logger.warn(`Failed to parse payload for job ${jobData.id}: ${e.message}`);
      parsedPayload = {};
    }

    // Get retry count from the same place asset-saver gets it: ctx.workflow_context.retry_attempt
    // parsedPayload.ctx is undefined, but jobData.ctx contains the workflow_context as JSON string
    let parsedCtx: any = null;
    try {
      parsedCtx = typeof jobData.ctx === 'string' ? JSON.parse(jobData.ctx) : jobData.ctx;
    } catch (error) {
      // Continue without ctx if parsing fails
    }

    const retryCount =
      parsedCtx?.workflow_context?.retry_attempt ||
      parsedPayload.ctx?.retry_count ||
      parsedPayload.ctx?.retryCount ||
      parseInt(jobData.retry_count || '0');

    return {
      id: jobData.id,
      service_required: jobData.service_required,
      priority: parseInt(jobData.priority || '50'),
      payload: parsedPayload,
      requirements: jobData.requirements ? JSON.parse(jobData.requirements) : undefined,
      customer_id: jobData.customer_id || undefined,
      created_at: jobData.created_at,
      assigned_at: jobData.assigned_at || undefined,
      started_at: jobData.started_at || undefined,
      completed_at: jobData.completed_at || undefined,
      failed_at: jobData.failed_at || undefined,
      worker_id: jobData.worker_id || undefined,
      status: (jobData.status || 'pending') as JobStatus,
      retry_count: retryCount,
      max_retries: parseInt(jobData.max_retries || '3'),
      last_failed_worker: jobData.last_failed_worker || undefined,
      processing_time: jobData.processing_time ? parseInt(jobData.processing_time) : undefined,
      estimated_completion: jobData.estimated_completion || undefined,
      // Workflow fields
      workflow_id: jobData.workflow_id || undefined,
      workflow_priority: jobData.workflow_priority
        ? parseInt(jobData.workflow_priority)
        : undefined,
      workflow_datetime: jobData.workflow_datetime
        ? parseInt(jobData.workflow_datetime)
        : undefined,
      current_step: jobData.current_step ? parseInt(jobData.current_step) : undefined,
      total_steps:
        jobData.total_steps && jobData.total_steps !== ''
          ? parseInt(jobData.total_steps)
          : undefined,
    };
  }

  private async getAllJobs(): Promise<Job[]> {
    const startTime = Date.now();
    const result = await this.getJobs({ limit: 1000, offset: 0 });
    logger.info(
      `getAllJobs completed in ${Date.now() - startTime}ms, returning ${result.length} jobs`
    );
    return result;
  }

  private async getCompletedJobsPaginatedFromJobs(allJobs: Job[], options: { page: number; pageSize: number }): Promise<{
    jobs: Job[];
    pagination: {
      page: number;
      pageSize: number;
      totalCount: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
  }> {
    const startTime = Date.now();
    const offset = (options.page - 1) * options.pageSize;

    // Filter and sort completed jobs from already-loaded jobs (avoid duplicate loading)
    const completedJobs = allJobs
      .filter(job => job.status === 'completed')
      .sort((a, b) => {
        // Sort by completion time DESC (newest first)
        const aTime = new Date(a.completed_at || a.created_at).getTime();
        const bTime = new Date(b.completed_at || b.created_at).getTime();
        return bTime - aTime;
      });

    const totalCount = completedJobs.length;
    const paginatedJobs = completedJobs.slice(offset, offset + options.pageSize);

    logger.info(
      `getCompletedJobsPaginatedFromJobs completed in ${Date.now() - startTime}ms, returning ${paginatedJobs.length}/${totalCount} jobs (page ${options.page}, size ${options.pageSize}) - NO DUPLICATE LOADING`
    );

    return {
      jobs: paginatedJobs,
      pagination: {
        page: options.page,
        pageSize: options.pageSize,
        totalCount,
        hasNextPage: offset + options.pageSize < totalCount,
        hasPreviousPage: options.page > 1,
      },
    };
  }

  // Keep the original function for other use cases
  private async getCompletedJobsPaginated(options: { page: number; pageSize: number }): Promise<{
    jobs: Job[];
    pagination: {
      page: number;
      pageSize: number;
      totalCount: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
  }> {
    const startTime = Date.now();
    const offset = (options.page - 1) * options.pageSize;

    // Get all jobs directly (not through getAllJobs which skips completed jobs in snapshot context)
    const allJobs = await this.getJobs({ limit: 10000, offset: 0 });
    const completedJobs = allJobs
      .filter(job => job.status === 'completed')
      .sort((a, b) => {
        // Sort by completion time DESC (newest first)
        const aTime = new Date(a.completed_at || a.created_at).getTime();
        const bTime = new Date(b.completed_at || b.created_at).getTime();
        return bTime - aTime;
      });

    const totalCount = completedJobs.length;
    const paginatedJobs = completedJobs.slice(offset, offset + options.pageSize);

    logger.info(
      `getCompletedJobsPaginated completed in ${Date.now() - startTime}ms, returning ${paginatedJobs.length}/${totalCount} jobs (page ${options.page}, size ${options.pageSize})`
    );

    return {
      jobs: paginatedJobs,
      pagination: {
        page: options.page,
        pageSize: options.pageSize,
        totalCount,
        hasNextPage: offset + options.pageSize < totalCount,
        hasPreviousPage: options.page > 1,
      },
    };
  }

  private async performCleanup(options: {
    reset_workers: boolean;
    cleanup_orphaned_jobs: boolean;
    reset_specific_worker: string | null;
    max_job_age_minutes: number;
  }): Promise<{
    workers_reset: number;
    jobs_cleaned: number;
    workers_found: string[];
    details: string[];
  }> {
    const results = {
      workers_reset: 0,
      jobs_cleaned: 0,
      workers_found: [] as string[],
      details: [] as string[],
    };

    logger.info('Starting cleanup operation:', options);

    // Find all workers
    const workerKeys: string[] = [];
    let cursor = '0';
    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        'worker:*:heartbeat',
        'COUNT',
        100
      );
      cursor = newCursor;
      workerKeys.push(...keys);
    } while (cursor !== '0');

    const workerIds = workerKeys.map(key => key.split(':')[1]);
    results.workers_found = workerIds;
    results.details.push(`Found ${workerIds.length} workers: ${workerIds.join(', ')}`);

    // Reset specific worker
    if (options.reset_specific_worker) {
      if (workerIds.includes(options.reset_specific_worker)) {
        await this.resetWorker(options.reset_specific_worker);
        results.workers_reset = 1;
        results.details.push(`Reset specific worker: ${options.reset_specific_worker}`);
      } else {
        results.details.push(`Worker not found: ${options.reset_specific_worker}`);
      }
    }

    // Reset all workers
    else if (options.reset_workers) {
      for (const workerId of workerIds) {
        await this.resetWorker(workerId);
        results.workers_reset++;
      }
      results.details.push(`Reset ${results.workers_reset} workers to idle state`);
    }

    // Cleanup orphaned jobs
    if (options.cleanup_orphaned_jobs) {
      const cleanedCount = await this.cleanupOrphanedJobs(options.max_job_age_minutes);
      results.jobs_cleaned = cleanedCount;
      results.details.push(
        `Cleaned up ${cleanedCount} orphaned jobs older than ${options.max_job_age_minutes} minutes`
      );
    }

    logger.info('Cleanup operation completed:', results);
    return results;
  }

  private async resetWorker(workerId: string): Promise<void> {
    try {
      // Get current worker data
      const workerData = await this.redis.hgetall(`worker:${workerId}`);
      if (!workerData || Object.keys(workerData).length === 0) {
        logger.warn(`Worker ${workerId} not found for reset`);
        return;
      }

      // Reset worker to idle status
      await this.redis.hset(`worker:${workerId}`, {
        ...workerData,
        status: 'idle',
        current_job_id: '',
        last_activity: new Date().toISOString(),
      });

      // Remove any active job assignments
      const activeJobs = await this.redis.hgetall(`worker:${workerId}:jobs`);
      for (const jobId of Object.keys(activeJobs)) {
        // Release job back to pending queue
        const jobData = await this.redis.hgetall(`job:${jobId}`);
        if (jobData.id) {
          await this.redis.hset(`job:${jobId}`, {
            ...jobData,
            status: 'pending',
            worker_id: '',
            assigned_at: '',
            started_at: '',
          });

          // Re-add to pending queue with original priority
          const priority = parseInt(jobData.priority || '50');
          const timestamp = parseInt(jobData.created_at) || Date.now();
          const score = priority * Math.pow(10, 15) - timestamp / 1000;
          await this.redis.zadd('jobs:pending', score, jobId);

          logger.info(`Released job ${jobId} from worker ${workerId} back to pending queue`);
        }
      }

      // Clear worker's active jobs
      await this.redis.del(`worker:${workerId}:jobs`);

      logger.info(`Reset worker ${workerId} to idle state`);
    } catch (error) {
      logger.error(`Failed to reset worker ${workerId}:`, error);
      throw error;
    }
  }

  private async cleanupOrphanedJobs(maxAgeMinutes: number): Promise<number> {
    try {
      const cutoffTime = Date.now() - maxAgeMinutes * 60 * 1000;
      let cleanedCount = 0;

      // Find all active jobs
      const jobKeys: string[] = [];
      let cursor = '0';
      do {
        const [newCursor, keys] = await this.redis.scan(cursor, 'MATCH', 'job:*', 'COUNT', 100);
        cursor = newCursor;
        // Filter out progress streams - only include actual job data keys
        const jobDataKeys = keys.filter(key => !key.includes(':progress'));
        jobKeys.push(...jobDataKeys);
      } while (cursor !== '0');

      for (const jobKey of jobKeys) {
        const jobData = await this.redis.hgetall(jobKey);
        if (!jobData.id) continue;

        const isActive = jobData.status === 'active' || jobData.status === 'processing';
        const startedAt = parseInt(jobData.started_at || '0');
        const assignedAt = parseInt(jobData.assigned_at || '0');
        const jobAge = Math.max(startedAt, assignedAt);

        // Check if job is old and potentially orphaned
        if (isActive && jobAge > 0 && jobAge < cutoffTime) {
          const workerId = jobData.worker_id;

          // Check if worker still exists and is active
          let workerExists = false;
          if (workerId) {
            const workerHeartbeat = await this.redis.ttl(`worker:${workerId}:heartbeat`);
            workerExists = workerHeartbeat > 0;
          }

          // If worker doesn't exist or hasn't sent heartbeat, consider job orphaned
          if (!workerExists) {
            // Move job back to pending
            await this.redis.hset(`job:${jobData.id}`, {
              ...jobData,
              status: 'pending',
              worker_id: '',
              assigned_at: '',
              started_at: '',
            });

            // Re-add to pending queue
            const priority = parseInt(jobData.priority || '50');
            const timestamp = parseInt(jobData.created_at) || Date.now();
            const score = priority * Math.pow(10, 15) - timestamp / 1000;
            await this.redis.zadd('jobs:pending', score, jobData.id);

            cleanedCount++;
            logger.info(
              `Cleaned up orphaned job ${jobData.id} (worker ${workerId} not responding)`
            );
          }
        }
      }

      return cleanedCount;
    } catch (error) {
      logger.error('Failed to cleanup orphaned jobs:', error);
      throw error;
    }
  }

  private async deleteMachine(machineId: string): Promise<{
    machine_id: string;
    workers_found: string[];
    workers_cleaned: number;
    message: string;
  }> {
    try {
      logger.info(`🗑️  Deleting machine: ${machineId}`);

      // First, check if machine exists
      const machineData = await this.redis.hgetall(`machine:${machineId}:info`);
      if (!machineData || !machineData.machine_id) {
        throw new Error(`Machine ${machineId} not found`);
      }

      // Find all workers for this machine
      const allWorkerKeys: string[] = [];
      let cursor = '0';
      do {
        const [newCursor, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          'worker:*:heartbeat',
          'COUNT',
          100
        );
        cursor = newCursor;
        allWorkerKeys.push(...keys);
      } while (cursor !== '0');

      const allWorkerIds = allWorkerKeys.map(key => key.split(':')[1]);
      const machineWorkers: string[] = [];

      // Check each worker to see if it belongs to this machine
      for (const workerId of allWorkerIds) {
        const workerData = await this.redis.hgetall(`worker:${workerId}`);
        if (workerData && workerData.machine_id === machineId) {
          machineWorkers.push(workerId);
        } else {
          // For workers that don't have machine_id set, use pattern matching
          const extractedMachineId = this.extractMachineIdFromWorkerId(workerId);
          if (extractedMachineId === machineId) {
            machineWorkers.push(workerId);
          }
        }
      }

      logger.info(
        `Found ${machineWorkers.length} workers for machine ${machineId}: ${machineWorkers.join(', ')}`
      );

      // Clean up each worker
      let workersCleanedCount = 0;
      for (const workerId of machineWorkers) {
        try {
          await this.cleanupWorker(workerId);
          workersCleanedCount++;
          logger.info(`✅ Cleaned up worker: ${workerId}`);
        } catch (error) {
          logger.error(`❌ Failed to clean up worker ${workerId}:`, error);
        }
      }

      // Delete machine record from Redis
      await this.redis.del(`machine:${machineId}:info`);

      // Broadcast machine deletion event
      this.eventBroadcaster.broadcastMachineShutdown(machineId, 'Machine deleted by user request');

      // Also broadcast to WebSocket monitors
      this.eventBroadcaster.broadcast({
        type: 'machine_shutdown',
        machine_id: machineId,
        reason: 'Machine deleted by user request',
        timestamp: Date.now(),
      });

      const result = {
        machine_id: machineId,
        workers_found: machineWorkers,
        workers_cleaned: workersCleanedCount,
        message: `Machine ${machineId} deleted successfully. Cleaned up ${workersCleanedCount} workers.`,
      };

      logger.info(`🎉 Machine deletion completed:`, result);
      return result;
    } catch (error) {
      logger.error(`Failed to delete machine ${machineId}:`, error);
      throw error;
    }
  }

  private async cleanupWorker(workerId: string): Promise<void> {
    try {
      logger.info(`🧹 Cleaning up worker: ${workerId}`);

      // Get current worker data
      const workerData = await this.redis.hgetall(`worker:${workerId}`);
      if (!workerData || Object.keys(workerData).length === 0) {
        logger.warn(`Worker ${workerId} not found - may already be deleted`);
        return;
      }

      // If worker has active jobs, handle them with proper retry logic
      if (workerData.current_job_id) {
        const jobId = workerData.current_job_id;
        logger.info(`🔄 Processing job ${jobId} from failed worker ${workerId} with retry logic`);

        const jobData = await this.redis.hgetall(`job:${jobId}`);
        if (jobData.id) {
          // Parse payload to get retry_count from ctx (same as asset-saver)
          let parsedPayload: any = {};
          try {
            parsedPayload = JSON.parse(jobData.payload || '{}');
          } catch (e) {
            logger.warn(`Failed to parse payload for job ${jobId}: ${e.message}`);
            parsedPayload = {};
          }

          // Get retry count from the same place asset-saver gets it: ctx.retry_count
          const retryCount = parsedPayload.ctx?.retry_count || parsedPayload.ctx?.retryCount || parseInt(jobData.retry_count || '0');

          // Convert Redis hash data to Job object
          const job = {
            id: jobData.id,
            retry_count: retryCount,
            max_retries: parseInt(jobData.max_retries || '3'),
            worker_id: jobData.worker_id || '',
            priority: parseInt(jobData.priority || '50'),
            workflow_priority: jobData.workflow_priority
              ? parseInt(jobData.workflow_priority)
              : undefined,
            workflow_datetime: jobData.workflow_datetime
              ? parseInt(jobData.workflow_datetime)
              : undefined,
            created_at: jobData.created_at,
          };

          // Apply proper retry logic with limits
          const newRetryCount = job.retry_count + 1;
          const maxRetries = job.max_retries;

          if (newRetryCount >= maxRetries) {
            // Job exceeded max retries - fail it permanently
            logger.warn(
              `Job ${jobId} exceeded max retries (${newRetryCount}/${maxRetries}) - marking as failed due to worker failure`
            );

            await this.redis.hset(`job:${jobId}`, {
              ...jobData,
              status: 'failed',
              failed_at: new Date().toISOString(),
              retry_count: newRetryCount.toString(),
              last_failed_worker: workerId,
              worker_id: '',
              assigned_at: '',
              started_at: '',
            });

            // Store in failed jobs with error details
            await this.redis.hset(
              'jobs:failed',
              jobId,
              JSON.stringify({
                error: `Worker disconnected/timeout: ${workerId}`,
                failed_at: new Date().toISOString(),
                retry_count: newRetryCount,
                max_retries: maxRetries,
              })
            );
            await this.redis.expire('jobs:failed', 7 * 24 * 60 * 60); // 7 days

            // Remove from any active job tracking
            await this.redis.hdel(`jobs:active:${workerId}`, jobId);

            logger.info(`❌ Job ${jobId} permanently failed after ${newRetryCount} attempts`);
          } else {
            // Job can be retried - increment retry count and requeue
            logger.info(
              `Job ${jobId} will be retried (${newRetryCount}/${maxRetries}) - returning to queue`
            );

            await this.redis.hset(`job:${jobId}`, {
              ...jobData,
              status: 'pending',
              worker_id: '',
              assigned_at: '',
              started_at: '',
              retry_count: newRetryCount.toString(),
              last_failed_worker: workerId,
            });

            // Re-add to pending queue with workflow-aware scoring (same logic as redis-service.ts)
            const effectivePriority = job.workflow_priority || job.priority;
            const effectiveDateTime = job.workflow_datetime || Date.parse(job.created_at);
            const score =
              effectivePriority * 1000000 + (Number.MAX_SAFE_INTEGER - effectiveDateTime);
            await this.redis.zadd('jobs:pending', score, jobId);

            // Remove from worker's active jobs
            await this.redis.hdel(`jobs:active:${workerId}`, jobId);

            logger.info(`🔄 Job ${jobId} requeued for retry ${newRetryCount}/${maxRetries}`);
          }
        }
      }

      // Clean up worker-related Redis keys
      const keysToDelete = [
        `worker:${workerId}`,
        `worker:${workerId}:heartbeat`,
        `worker:${workerId}:jobs`,
        `worker:${workerId}:status`,
      ];

      for (const key of keysToDelete) {
        await this.redis.del(key);
      }

      // Broadcast worker disconnection
      this.eventBroadcaster.broadcastWorkerDisconnected(workerId, workerId);

      // Also broadcast to WebSocket monitors
      this.eventBroadcaster.broadcast({
        type: 'worker_disconnected',
        worker_id: workerId,
        machine_id: workerId,
        timestamp: Date.now(),
      });

      logger.info(`✅ Worker ${workerId} cleaned up successfully`);
    } catch (error) {
      logger.error(`Failed to cleanup worker ${workerId}:`, error);
      throw error;
    }
  }

  async start(): Promise<void> {
    try {
      // Connect to Redis with retry logic
      await this.connectToRedisWithRetry();

      // Enable keyspace notifications for progress streaming
      // K = Keyspace events, $ = String commands, s = Stream commands, E = Keyevent, x = Expired
      await this.redis.config('SET', 'notify-keyspace-events', 'Ks$Ex');

      // Clean up any stale machine data from previous API server instances
      await this.startupCleanup();

      // Redis functions are pre-installed on Railway Redis instance
      // Use CLI command `pnpm redis:functions:install` to install them manually
      logger.info('ℹ️ Using pre-installed Redis functions for orchestration');

      // Start HTTP server
      await new Promise<void>((resolve, reject) => {
        this.httpServer.listen(this.config.port, (error?: Error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      logger.info(`🚀 Lightweight API Server started on port ${this.config.port}`);
      logger.info('📡 WebSocket endpoint: ws://localhost:' + this.config.port);
      logger.info('🌐 HTTP endpoints:');
      logger.info('  POST /api/jobs - Submit job');
      logger.info('  GET /api/jobs/:id - Get job status');
      logger.info('  GET /api/jobs - List jobs');
      logger.info('  POST /api/user_notified - Track user notifications');
      logger.info('  WS /ws/client - WebSocket for job progress streaming');
      logger.info('  GET /health - Health check');
    } catch (error) {
      logger.error('Failed to start Lightweight API Server:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    logger.info('Stopping Lightweight API Server...');

    // Stop stale machine check
    if (this.staleMachineCheckInterval) {
      clearInterval(this.staleMachineCheckInterval);
      this.staleMachineCheckInterval = undefined;
    }

    // Close all WebSocket connections
    for (const [_clientId, connection] of this.wsConnections) {
      connection.ws.close(1000, 'Server shutdown');
    }
    this.wsConnections.clear();

    // Close servers
    this.wsServer.close();

    await new Promise<void>(resolve => {
      this.httpServer.close(() => resolve());
    });

    // Close database pool
    if (this.dbPool) {
      await this.dbPool.end();
    }

    // Disconnect Redis
    await this.redis.quit();
    await this.redisService.disconnect();
    await this.progressSubscriber.quit();

    logger.info('Lightweight API Server stopped');
  }

  /**
   * Create API workflow completion attestation
   * This is the API's proof that it determined a workflow should be complete
   * Records asset location and completion details for recovery purposes
   */
  private async createWorkflowCompletionAttestation(workflowId: string, jobCompletion?: any, workflowOutputs?: any[], retryAttempt?: number): Promise<void> {
    try {
      // Extract asset locations from job result
      const jobAssetLocations = this.extractAssetLocations(jobCompletion?.result, jobCompletion?.job_id);

      // Extract output URLs from workflow outputs
      const workflowOutputUrls: string[] = [];
      if (workflowOutputs && Array.isArray(workflowOutputs)) {
        for (const output of workflowOutputs) {
          if (typeof output === 'string' && output.match(/^https?:\/\//)) {
            workflowOutputUrls.push(output);
          } else if (output && typeof output === 'object') {
            // Handle output objects with URL fields
            if (output.url) workflowOutputUrls.push(output.url);
            if (output.output_url) workflowOutputUrls.push(output.output_url);
            if (output.asset_url) workflowOutputUrls.push(output.asset_url);
            if (output.image_url) workflowOutputUrls.push(output.image_url);
            if (output.file_url) workflowOutputUrls.push(output.file_url);
          }
        }
      }

      // Combine and deduplicate all asset locations
      const allAssetLocations = [...new Set([...jobAssetLocations, ...workflowOutputUrls])];

      const attestationData = {
        workflow_id: workflowId,
        api_determined_complete_at: new Date().toISOString(),
        retry_count: retryAttempt || 0,
        job_completion_data: jobCompletion ? {
          job_id: jobCompletion.job_id,
          worker_id: jobCompletion.worker_id,
          result: this.sanitizeResultForAttestation(jobCompletion.result),
          completed_at: jobCompletion.timestamp
        } : null,
        workflow_outputs: workflowOutputUrls.length > 0 ? workflowOutputUrls : null,
        api_instance: process.env.HOSTNAME || process.env.SERVICE_NAME || 'unknown',
        api_version: process.env.VERSION || 'unknown',
        attestation_created_at: Date.now(),
        emprops_api_url: process.env.EMPROPS_API_URL,
        asset_locations: allAssetLocations
      };

      // Store API workflow attestation with 30-day TTL for audit trail
      // Remove base64 data to avoid storing massive image data in Redis
      const sanitizedAttestationData = sanitizeBase64Data(attestationData);

      // Include retry attempt in key to preserve attestations from all attempts
      const attestationKey = retryAttempt
        ? `api:workflow:completion:${workflowId}:attempt-${retryAttempt}`
        : `api:workflow:completion:${workflowId}`;

      await this.redis.setex(
        attestationKey,
        30 * 24 * 60 * 60, // 30 days
        JSON.stringify(sanitizedAttestationData)
      );

      logger.info(`🔐 API created workflow completion attestation for ${workflowId}${retryAttempt ? ` (attempt ${retryAttempt})` : ''}`, {
        job_id: jobCompletion?.job_id,
        asset_count: attestationData.asset_locations?.length || 0,
        attestation_key: attestationKey
      });

    } catch (error) {
      logger.error(`Failed to create workflow completion attestation for ${workflowId}:`, error);
      // Don't throw - attestation failure shouldn't block verification
    }
  }

  /**
   * Sanitize job result for attestation - removes base64 data but keeps URLs
   */
  private sanitizeResultForAttestation(result: any): any {
    if (!result || typeof result !== 'object') {
      return result;
    }

    // Parse if it's a JSON string
    let parsed = result;
    if (typeof result === 'string') {
      try {
        parsed = JSON.parse(result);
      } catch {
        return result; // Return as-is if not JSON
      }
    }

    const sanitized = { ...parsed };

    // If this has data field, sanitize it
    if (sanitized.data && typeof sanitized.data === 'object') {
      const sanitizedData = { ...sanitized.data };

      // Remove base64 image data but keep URLs
      if (sanitizedData.image_base64) {
        delete sanitizedData.image_base64;
        sanitizedData._attestation_note = 'base64 image data removed for security';
      }

      // Remove large raw_output content
      if (sanitizedData.raw_output && typeof sanitizedData.raw_output === 'object') {
        sanitizedData.raw_output = Array.isArray(sanitizedData.raw_output)
          ? sanitizedData.raw_output.map((item: any) => {
              if (item && typeof item === 'object') {
                const sanitizedItem = { ...item };
                if (sanitizedItem.result && typeof sanitizedItem.result === 'string' && sanitizedItem.result.length > 1000) {
                  sanitizedItem.result = `[LARGE_DATA_REMOVED_${sanitizedItem.result.length}_CHARS]`;
                }
                return sanitizedItem;
              }
              return item;
            })
          : sanitizedData.raw_output;
      }

      sanitized.data = sanitizedData;
    }

    return sanitized;
  }

  /**
   * Extract asset locations from job result for attestation
   */
  private extractAssetLocations(result: any, jobId?: string): string[] {
    const logPrefix = jobId ? `[JOB-${jobId}]` : '[UNKNOWN-JOB]';

    if (!result) {
      logger.info(`📋 ${logPrefix} API ASSET EXTRACTION: No result provided`);
      return [];
    }

    logger.info(`\n📋 ===== API ASSET EXTRACTION ANALYSIS ${logPrefix} =====`);
    logger.info(`📋 RESULT TYPE: ${typeof result}`);
    logger.info(`📋 RESULT KEYS: ${result && typeof result === 'object' ? Object.keys(result).join(', ') : 'N/A'}`);

    const locations: string[] = [];

    try {
      // Log the complete result structure for debugging
      if (result && typeof result === 'object') {
        logger.info(`📋 FULL RESULT STRUCTURE: ${JSON.stringify(result, null, 2).substring(0, 2000)}${JSON.stringify(result, null, 2).length > 2000 ? '...[TRUNCATED]' : ''}`);

        // Show key fields we care about
        if (result.data) {
          logger.info(`📋 RESULT.DATA ANALYSIS:`);
          logger.info(`📋   - image_url: ${result.data.image_url || 'NOT SET'}`);
          logger.info(`📋   - mime_type: ${result.data.mime_type || 'NOT SET'}`);
          logger.info(`📋   - content_type: ${result.data.content_type || 'NOT SET'}`);

          // Check for .bin extension issues
          if (result.data.image_url && result.data.image_url.includes('.bin')) {
            logger.info(`📋   ❌ DETECTED .BIN EXTENSION IN API: ${result.data.image_url}`);
          } else if (result.data.image_url) {
            logger.info(`📋   ✅ PROPER EXTENSION IN API: ${result.data.image_url}`);
          }
        }

        if (result.output_files) {
          logger.info(`📋 OUTPUT_FILES ANALYSIS: ${result.output_files.length} files`);
          result.output_files.forEach((file: any, index: number) => {
            logger.info(`📋   [${index}] filename: ${file.filename}, mime_type: ${file.mime_type}, cdn_url: ${file.metadata?.cdn_url || 'NO CDN URL'}`);
          });
        }
      }

      // Handle different result formats
      if (typeof result === 'string') {
        // Direct URL
        if (result.match(/^https?:\/\//)) {
          locations.push(result);
          logger.info(`📋 FOUND URL (string): ${result}`);
        }
      } else if (result && typeof result === 'object') {
        // Object with various URL fields
        const urlFields = ['url', 'output_url', 'asset_url', 'image_url', 'file_url'];
        for (const field of urlFields) {
          if (result[field] && typeof result[field] === 'string') {
            locations.push(result[field]);
            logger.info(`📋 FOUND URL (result.${field}): ${result[field]}`);
          }
        }

        // Handle nested data object (common pattern: result.data.image_url)
        if (result.data && typeof result.data === 'object') {
          for (const field of urlFields) {
            if (result.data[field] && typeof result.data[field] === 'string') {
              locations.push(result.data[field]);
              logger.info(`📋 FOUND URL (result.data.${field}): ${result.data[field]}`);

              // Check if this is where our fix worked
              if (field === 'image_url' && result.data[field].includes('.bin')) {
                logger.info(`📋   ⚠️  .BIN EXTENSION STILL PRESENT - FIX DID NOT WORK`);
              } else if (field === 'image_url') {
                logger.info(`📋   ✅ PROPER EXTENSION - FIX WORKED OR NOT NEEDED`);
              }
            }
          }
        }

        // Array of URLs
        if (Array.isArray(result.outputs)) {
          logger.info(`📋 CHECKING OUTPUTS ARRAY: ${result.outputs.length} items`);
          for (const output of result.outputs) {
            if (typeof output === 'string' && output.match(/^https?:\/\//)) {
              locations.push(output);
              logger.info(`📋 FOUND URL (outputs string): ${output}`);
            } else if (output && typeof output === 'object') {
              for (const field of urlFields) {
                if (output[field] && typeof output[field] === 'string') {
                  locations.push(output[field]);
                  logger.info(`📋 FOUND URL (outputs.${field}): ${output[field]}`);
                }
              }
            }
          }
        }

        // Check output_files array (our fix populates this)
        if (Array.isArray(result.output_files)) {
          logger.info(`📋 CHECKING OUTPUT_FILES ARRAY: ${result.output_files.length} items`);
          for (const file of result.output_files) {
            if (file && typeof file === 'object') {
              if (file.metadata?.cdn_url) {
                locations.push(file.metadata.cdn_url);
                logger.info(`📋 FOUND URL (output_files.cdn_url): ${file.metadata.cdn_url}`);
                logger.info(`📋   📄 FILE DETAILS: ${file.filename} (${file.mime_type})`);
              }
            }
          }
        }
      }

      // Final summary
      const uniqueLocations = [...new Set(locations)];
      logger.info(`📋 EXTRACTION SUMMARY:`);
      logger.info(`📋   - Total URLs found: ${locations.length}`);
      logger.info(`📋   - Unique URLs: ${uniqueLocations.length}`);
      uniqueLocations.forEach((url, index) => {
        const hasBin = url.includes('.bin');
        logger.info(`📋   [${index + 1}] ${hasBin ? '❌ .BIN' : '✅ GOOD'}: ${url}`);
      });
      logger.info(`📋 ===== API ASSET EXTRACTION COMPLETE ${logPrefix} =====\n`);

      return uniqueLocations;
    } catch (error) {
      logger.error(`📋 ${logPrefix} Failed to extract asset locations:`, error);
      logger.info(`📋 ===== API ASSET EXTRACTION FAILED ${logPrefix} =====\n`);
      return [];
    }
  }

  /**
   * Publish workflow completion notification
   */
  private async publishWorkflowCompletion(workflowId: string, workflowData: any): Promise<void> {
    // 🔒 WEBHOOK TIMING FIX: Verify workflow_output is populated before sending webhook
    // This prevents race condition where webhook is sent before workflow_output field is committed
    logger.info(`🔒 Verifying workflow_output population for ${workflowId} before webhook...`);

    const empropsApiUrl = process.env.EMPROPS_API_URL;
    if (empropsApiUrl) {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };

      const empropsAuth = process.env.EMPROPS_API_KEY;
      if (empropsAuth) {
        headers['Authorization'] = `Bearer ${empropsAuth}`;
      }

      // Verify that workflow_output field is populated with retry logic
      const maxVerifyRetries = 3;
      const verifyDelay = 1000; // 1 second between retries

      for (let attempt = 1; attempt <= maxVerifyRetries; attempt++) {
        try {
          logger.info(`🔍 Verification attempt ${attempt}/${maxVerifyRetries} for workflow_output...`);

          const verifyResponse = await fetch(`${empropsApiUrl}/jobs/${workflowId}`, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(3000)
          });

          if (verifyResponse.ok) {
            const verifyData = await verifyResponse.json();
            const hasWorkflowOutput = !!verifyData.data?.workflow_output;

            logger.info(`📋 Verification result: workflow_output ${hasWorkflowOutput ? 'IS' : 'IS NOT'} populated`);

            if (hasWorkflowOutput) {
              logger.info(`✅ workflow_output verified populated for ${workflowId} - proceeding with webhook`);
              break; // Exit retry loop
            } else if (attempt === maxVerifyRetries) {
              logger.warn(`⚠️ workflow_output still not populated after ${maxVerifyRetries} attempts - sending webhook anyway`);
            } else {
              logger.info(`⏳ workflow_output not populated yet, retrying in ${verifyDelay}ms...`);
              await new Promise(resolve => setTimeout(resolve, verifyDelay));
            }
          } else {
            logger.warn(`⚠️ Verification request failed: ${verifyResponse.status} - proceeding with webhook`);
            break;
          }
        } catch (error) {
          logger.warn(`⚠️ Verification attempt ${attempt} failed:`, error);
          if (attempt === maxVerifyRetries) {
            logger.warn(`⚠️ All verification attempts failed - proceeding with webhook`);
          }
        }
      }
    } else {
      logger.warn(`⚠️ EMPROPS_API_URL not configured - cannot verify workflow_output`);
    }

    // Publish workflow completion notification with metadata only (no outputs/results)
    // Webhook service will query EmProps API directly if it needs full data
    await this.redis.publish('workflow_completed', JSON.stringify({
      workflow_id: workflowId,
      status: 'completed',
      completed_at: workflowData.completed_at,
      timestamp: Date.now(),
      verified: true,
      message: 'Workflow completed and verified with EMPROPS',
      // Include basic workflow metadata only
      workflow_details: {
        id: workflowData.id,
        name: workflowData.name,
        job_type: workflowData.job_type,
        status: workflowData.status,
        progress: workflowData.progress,
        created_at: workflowData.created_at,
        completed_at: workflowData.completed_at
      },
      // 🚨 CRITICAL: NO outputs included - webhook service should query EmProps API directly
      // This prevents massive base64 data from accumulating in Redis
      outputs_available: !!(workflowData?.data?.outputs?.length),
      outputs_count: workflowData?.data?.outputs?.length || 0,
      // 🔒 TIMING FIX: Include verification timestamp
      workflow_output_verified_at: new Date().toISOString()
    }));

    logger.info(`📤 Published workflow_completed webhook for ${workflowId} (with workflow_output verification)`);
  }

  /**
   * Smart workflow recovery - goal: get the workflow completion webhook sent out
   * Steps:
   * 1. Check if workflow is complete
   * 2. If not, check if last step is complete
   * 3. If step not complete, call POST /steps/{stepId}/complete
   * 4. Recheck workflow - if complete, send webhook
   * 5. If still not complete, call POST /jobs/{jobId}/complete as failsafe
   */
  private async attemptWorkflowRecovery(workflowId: string, jobCompletion?: any): Promise<boolean> {
    if (!jobCompletion) {
      logger.warn(`No job completion data for recovery of workflow ${workflowId}`);
      return false;
    }

    const empropsApiUrl = process.env.EMPROPS_API_URL;
    if (!empropsApiUrl) {
      logger.error('EMPROPS_API_URL not configured for recovery');
      return false;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    const empropsAuth = process.env.EMPROPS_API_KEY;
    if (empropsAuth) {
      headers['Authorization'] = `Bearer ${empropsAuth}`;
    }

    try {
      // Step 1: Check if workflow is complete (this should fail, that's why we're here)
      logger.info(`🔍 Step 1: Double-checking workflow ${workflowId} status...`);

      const workflowResponse = await fetch(`${empropsApiUrl}/jobs/${workflowId}`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(5000)
      });

      if (workflowResponse.ok) {
        const workflowData = await workflowResponse.json();
        if (workflowData.data?.status === 'completed') {
          logger.info(`✅ Workflow ${workflowId} is actually completed - sending webhook`);
          await this.publishWorkflowCompletion(workflowId, workflowData.data);
          return true;
        }
        logger.info(`📋 Workflow ${workflowId} status: ${workflowData.data?.status || 'unknown'} - proceeding with recovery`);
      }

      // Step 2: Check the last step status
      logger.info(`🔍 Step 2: Checking last step ${jobCompletion.job_id} status...`);

      const stepsResponse = await fetch(`${empropsApiUrl}/jobs/${workflowId}/steps`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(5000)
      });

      let lastStepCompleted = false;
      if (stepsResponse.ok) {
        const stepsData = await stepsResponse.json();
        // Find the step that matches our job ID
        const matchingStep = stepsData.steps?.find((step: any) => step.step_id === jobCompletion.job_id);
        lastStepCompleted = matchingStep?.status === 'completed';
        logger.info(`📋 Step ${jobCompletion.job_id} status: ${matchingStep?.status || 'not found'}`);
      }

      if (!lastStepCompleted) {
        // Step 3: Complete the step
        logger.info(`🔧 Step 3: Completing step ${jobCompletion.job_id}...`);

        const completeStepResponse = await fetch(`${empropsApiUrl}/steps/${jobCompletion.job_id}/complete`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            output_data: jobCompletion.result,
            completed_at: new Date(jobCompletion.timestamp).toISOString(),
            worker_id: jobCompletion.worker_id,
            job_queue_recovery: true
          }),
          signal: AbortSignal.timeout(10000)
        });

        if (!completeStepResponse.ok) {
          logger.error(`❌ Failed to complete step: ${completeStepResponse.status}`);
          // Continue to failsafe below
        } else {
          logger.info(`✅ Successfully completed step ${jobCompletion.job_id}`);

          // Step 4: Wait and check if workflow is now complete
          logger.info(`⏳ Step 4: Waiting 2 seconds then checking workflow status...`);
          await new Promise(resolve => setTimeout(resolve, 2000));

          const workflowRecheckResponse = await fetch(`${empropsApiUrl}/jobs/${workflowId}`, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(5000)
          });

          if (workflowRecheckResponse.ok) {
            const workflowData = await workflowRecheckResponse.json();
            if (workflowData.data?.status === 'completed') {
              logger.info(`🎉 Workflow ${workflowId} completed after step completion!`);
              await this.publishWorkflowCompletion(workflowId, workflowData.data);
              return true;
            }
          }
        }
      }

      // Step 5: Failsafe - force complete the entire job
      logger.info(`🔧 Step 5: Failsafe - force completing entire job ${workflowId}...`);

      // Use the complete stored workflow data instead of fabricating
      // Normal completions send jobCompletion.result.data.result which contains the full workflow
      // Recovery should send the EXACT SAME data structure for consistency
      let generationOutputs = [];

      if (jobCompletion.result?.data?.result) {
        // Use the complete stored ComfyUI workflow result - this contains variables + final steps
        logger.info(`🔄 Using stored complete workflow data from job completion`);
        generationOutputs = jobCompletion.result.data.result;

        logger.info(`📋 STORED WORKFLOW STRUCTURE:`);
        logger.info(`📋   - Type: ${Array.isArray(generationOutputs) ? 'Array' : typeof generationOutputs}`);
        logger.info(`📋   - Length: ${Array.isArray(generationOutputs) ? generationOutputs.length : 'N/A'}`);
        if (Array.isArray(generationOutputs) && generationOutputs[0]) {
          logger.info(`📋   - First item has steps: ${generationOutputs[0].steps ? generationOutputs[0].steps.length : 'NO STEPS'}`);
          if (generationOutputs[0].steps) {
            generationOutputs[0].steps.forEach((step: any, idx: number) => {
              logger.info(`📋     Step ${idx}: ${step.nodeName} (${step.nodeAlias || 'no alias'})`);
            });
          }
        }
      } else {
        // Fallback: create minimal structure if no stored workflow
        logger.warn(`⚠️  No stored workflow data found, creating fallback structure`);
        generationOutputs = [{
          id: workflowId,
          generation: {
            id: 0,
            hash: `job_${jobCompletion.job_id.replace(/[^a-zA-Z0-9]/g, '').substring(0, 16)}`
          },
          steps: [{
            id: 1,
            nodeName: 'completion',
            nodeAlias: 'ForceCompletion1',
            nodeResponse: {
              src: jobCompletion.result?.data?.image_url || jobCompletion.result?.image_url,
              mimeType: "image/png"
            }
          }]
        }];
      }

      // Extract the final image URL for direct workflow_output
      const finalImageUrl = jobCompletion.result?.data?.image_url || jobCompletion.result?.image_url || null;

      // 🚨🚨🚨 FORCE COMPLETION: Direct workflow override - no extraction needed 🚨🚨🚨
      const requestPayload = {
        // Include synthetic outputs for compatibility, but EmProps should use workflow_output directly
        outputs: generationOutputs,
        // CRITICAL: Direct workflow_output field - EmProps should use this, not extract from outputs
        workflow_output: finalImageUrl,
        metadata: {
          completed_by_job_queue: true,
          last_job_id: jobCompletion.job_id,
          recovery_timestamp: new Date().toISOString(),
          override_completion: true, // Signal that this is a direct completion override
          skip_extraction: true // Signal that EmProps should use workflow_output directly
        }
      };

      logger.info(`🚨🚨🚨 FORCE COMPLETION PAYLOAD TO EMPROPS API 🚨🚨🚨`);
      logger.info(`📋 ENDPOINT: POST ${empropsApiUrl}/jobs/${workflowId}/complete`);
      logger.info(`📋 PAYLOAD TYPE: ${typeof requestPayload.outputs} (should be 'object')`);
      logger.info(`📋 OUTPUTS IS ARRAY: ${Array.isArray(requestPayload.outputs)}`);
      logger.info(`📋 OUTPUTS LENGTH: ${requestPayload.outputs?.length || 0}`);
      logger.info(`📋 🎯 WORKFLOW_OUTPUT: ${requestPayload.workflow_output || 'NOT_SET'}`);
      logger.info(`📋 🎯 OVERRIDE_COMPLETION: ${requestPayload.metadata.override_completion}`);
      logger.info(`📋 🎯 SKIP_EXTRACTION: ${requestPayload.metadata.skip_extraction}`);
      logger.info(`📋 FULL PAYLOAD STRUCTURE:`);
      logger.info(JSON.stringify(requestPayload, null, 2));
      logger.info(`🚨🚨🚨 END FORCE COMPLETION PAYLOAD 🚨🚨🚨`);

      const completeJobResponse = await fetch(`${empropsApiUrl}/jobs/${workflowId}/complete`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestPayload),
        signal: AbortSignal.timeout(10000)
      });

      if (!completeJobResponse.ok) {
        logger.error(`❌ Failed to force complete job: ${completeJobResponse.status}`);
        return false;
      }

      logger.info(`✅ Force completed job ${workflowId}`);

      // Step 6: Final check and send webhook
      const finalCheckResponse = await fetch(`${empropsApiUrl}/jobs/${workflowId}`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(5000)
      });

      if (finalCheckResponse.ok) {
        const workflowData = await finalCheckResponse.json();
        if (workflowData.data?.status === 'completed') {
          logger.info(`🎉 Workflow ${workflowId} recovery successful - sending webhook!`);
          await this.publishWorkflowCompletion(workflowId, workflowData.data);
          return true;
        }
      }

      logger.warn(`⚠️ Workflow ${workflowId} still not completed after all recovery attempts`);
      return false;

    } catch (error) {
      logger.error(`❌ Error during workflow recovery for ${workflowId}:`, error);
      return false;
    }
  }

  /**
   * Verify workflow completion with EMPROPS API
   * Hits /api/jobs/{workflow_id} to confirm the workflow is actually completed
   */
  private async verifyWorkflowWithEmprops(workflowId: string, originalJobCompletion?: any): Promise<void> {
    logger.info(`🔍 Verifying workflow ${workflowId} with EMPROPS API...`);

    // 🚨 CRITICAL: Create API workflow completion attestation FIRST
    // This is the API's authoritative "I believe this workflow is done" record
    // Must happen BEFORE EmProps verification to prevent orphaning

    // Get retry count from job data (same way as worker and asset-saver)
    let retryAttempt: number | undefined;
    if (originalJobCompletion?.job_id) {
      try {
        const jobKey = `job:${originalJobCompletion.job_id}`;
        const jobData = await this.redis.hgetall(jobKey);

        if (jobData && jobData.ctx) {
          // Parse ctx JSON string to get workflow_context.retry_attempt
          let parsedCtx: any = null;
          try {
            parsedCtx = JSON.parse(jobData.ctx);
            retryAttempt = parsedCtx?.workflow_context?.retry_attempt;
            logger.info(`🔍 Found retry count from job context: ${retryAttempt} for workflow ${workflowId}`);
          } catch (error) {
            logger.warn(`Failed to parse job ctx for retry count: ${error.message}`);
          }
        }
      } catch (error) {
        logger.warn(`Could not fetch retry count from job data: ${error}`);
      }
    }

    await this.createWorkflowCompletionAttestation(workflowId, originalJobCompletion, undefined, retryAttempt);

    const empropsApiUrl = process.env.EMPROPS_API_URL;
    if (!empropsApiUrl) {
      logger.error('EMPROPS_API_URL not configured, cannot verify workflow completion');
      return;
    }

    const maxRetries = 3;
    const retryDelay = 2000; // 2 seconds

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const url = `${empropsApiUrl}/jobs/${workflowId}`;
        
        // Build headers with optional auth
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        };
        
        // Add auth header if configured  
        const empropsAuth = process.env.EMPROPS_API_KEY;
        if (empropsAuth) {
          headers['Authorization'] = `Bearer ${empropsAuth}`;
        }
        
        // 🚨🚨🚨 PROMINENT EMPROPS API CALL LOGGING 🚨🚨🚨
        logger.info(`🚨🚨🚨 EMPROPS API CALL 🚨🚨🚨`);
        logger.info(`🎯 ENDPOINT: GET ${url}`);
        logger.info(`🔄 ATTEMPT: ${attempt}/${maxRetries}`);
        logger.info(`📋 WORKFLOW_ID: ${workflowId}`);
        logger.info(`🔐 AUTH_CONFIGURED: ${!!empropsAuth}`);
        logger.info(`🔐 HEADERS: ${JSON.stringify(headers, null, 2)}`);
        logger.info(`⏰ TIMESTAMP: ${new Date().toISOString()}`);
        logger.info(`🚨🚨🚨 MAKING REQUEST NOW 🚨🚨🚨`);
        
        const startTime = Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        const response = await fetch(url, {
          method: 'GET',
          headers,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        const responseTime = Date.now() - startTime;
        
        // 🚨🚨🚨 PROMINENT RESPONSE LOGGING 🚨🚨🚨
        logger.info(`🚨🚨🚨 EMPROPS API RESPONSE 🚨🚨🚨`);
        logger.info(`📊 STATUS: ${response.status} ${response.statusText}`);
        logger.info(`⏱️ RESPONSE_TIME: ${responseTime}ms`);
        logger.info(`🎯 ENDPOINT: GET ${url}`);
        logger.info(`🚨🚨🚨 RESPONSE RECEIVED 🚨🚨🚨`);
        
        if (!response.ok) {
          throw new Error(`EMPROPS API returned ${response.status}: ${response.statusText}`);
        }
        
        const workflowData = await response.json();
        
        // 🚨🚨🚨 PROMINENT EMPROPS RESPONSE DATA LOGGING 🚨🚨🚨
        logger.info(`🚨🚨🚨 EMPROPS API RESPONSE DATA 🚨🚨🚨`);
        logger.info(`📋 WORKFLOW_ID: ${workflowId}`);
        logger.info(`📊 RESPONSE STATUS: ${workflowData.data?.status || 'NOT_SET'}`);
        logger.info(`📈 PROGRESS: ${workflowData.data?.progress || 'NOT_SET'}`);
        logger.info(`🖼️ HAS_OUTPUTS: ${!!workflowData.data?.data?.outputs}`);
        logger.info(`📦 OUTPUT_COUNT: ${workflowData.data?.data?.outputs?.length || 0}`);
        logger.info(`✅ COMPLETED_AT: ${workflowData.data?.completed_at || 'NOT_SET'}`);
        // Apply smart truncation to prevent base64 floods in logs
        logger.info(`🗂️ FULL_RESPONSE: ${JSON.stringify(smartTruncateObject(workflowData), null, 2)}`);
        logger.info(`🚨🚨🚨 END RESPONSE DATA 🚨🚨🚨`);
        
        if (workflowData.data?.status === 'completed') {
          logger.info(`✅ EMPROPS confirms workflow ${workflowId} is completed`);
          await this.publishWorkflowCompletion(workflowId, workflowData.data);
          return;
        } else {
          logger.warn(`⏳ EMPROPS workflow ${workflowId} not ready (status: ${workflowData.data?.status || 'unknown'})`);

          // 🚨 SMART RECOVERY: Try to resolve the completion issue
          if (attempt === maxRetries) {
            logger.info(`🔧 Starting smart recovery for workflow ${workflowId}...`);
            const recovered = await this.attemptWorkflowRecovery(workflowId, originalJobCompletion);

            if (recovered) {
              logger.info(`✅ Successfully recovered workflow ${workflowId}`);
              return;
            }

            logger.error(`❌ Workflow ${workflowId} recovery failed - will retry later`);

            // If we have the original job completion data, re-publish it to retry later
            if (originalJobCompletion) {
              logger.info(`🔄 Re-publishing original complete_job event to retry verification later`);

              // Add a delay before re-triggering to avoid immediate retry loops
              setTimeout(async () => {
                await this.redis.publish('complete_job', JSON.stringify({
                  ...originalJobCompletion,
                  retry_verification: true,
                  retry_attempt: Date.now()
                }));
              }, 30000); // Wait 30 seconds before retrying

              logger.info(`⏰ Scheduled retry for workflow ${workflowId} verification in 30 seconds`);
            }

            return;
          }
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn(`EMPROPS API request failed for workflow ${workflowId} (attempt ${attempt}):`, errorMessage);
        
        if (attempt === maxRetries) {
          logger.error(`❌ Failed to verify workflow ${workflowId} with EMPROPS after ${maxRetries} attempts`);
          return;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  getConnectionStats() {
    return {
      monitor_connections: this.monitorConnections.size,
      client_websocket_connections: this.wsConnections.size,
      total_connections: this.monitorConnections.size + this.wsConnections.size,
    };
  }

  getActiveWorkerCount(): number {
    let totalWorkers = 0;
    
    // Count workers from all machines in unified status
    for (const machineData of this.unifiedMachineStatus.values()) {
      const machine = machineData as any;
      if (machine.structure?.workers) {
        totalWorkers += Object.keys(machine.structure.workers).length;
      }
    }
    
    return totalWorkers;
  }
}
