// Lightweight API Server - Phase 1C Implementation
// Replaces hub orchestration with simple HTTP + WebSocket API
// Supports both legacy WebSocket clients and modern HTTP+SSE clients

import express, { Request, Response } from 'express';
import { createServer, Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
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
  JobCompletedEvent,
  JobFailedEvent,
  WorkerStatusChangedEvent,
} from '@emp/core';

interface LightweightAPIConfig {
  port: number;
  redisUrl: string;
  corsOrigins?: string[];
}

interface SSEConnection {
  response: Response;
  jobId: string;
  clientId: string;
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
}

export class LightweightAPIServer {
  private app: express.Express;
  private httpServer: HTTPServer;
  private wsServer: WebSocketServer;
  private redis: Redis;
  private redisService: RedisService;
  private eventBroadcaster: EventBroadcaster;
  private config: LightweightAPIConfig;

  // Connection tracking
  private sseConnections = new Map<string, SSEConnection>();
  private wsConnections = new Map<string, WebSocketConnection>();
  private monitorConnections = new Map<string, MonitorConnection>();
  private clientConnections = new Map<string, ClientConnection>();
  private progressSubscriber: Redis;
  // Track which client submitted which job
  private jobToClientMap = new Map<string, string>();

  constructor(config: LightweightAPIConfig) {
    this.config = config;
    this.app = express();
    this.httpServer = createServer(this.app);
    this.wsServer = new WebSocketServer({ server: this.httpServer });

    // Redis connections
    this.redis = new Redis(config.redisUrl);
    this.redisService = new RedisService(config.redisUrl);
    this.progressSubscriber = new Redis(config.redisUrl);

    // Event broadcaster for real-time updates
    this.eventBroadcaster = new EventBroadcaster();

    this.setupMiddleware();
    this.setupHTTPRoutes();
    this.setupWebSocketHandling();
    this.setupProgressStreaming();
  }

  private isValidToken(token: string): boolean {
    // Use environment variable for token validation, fallback to hardcoded for dev
    const validToken = process.env.WS_AUTH_TOKEN || '3u8sdj5389fj3kljsf90u';
    return token === validToken;
  }

  private setupMiddleware(): void {
    // CORS support
    this.app.use((req, res, next) => {
      const allowedOrigins = this.config.corsOrigins || ['*'];
      const origin = req.headers.origin;

      if (allowedOrigins.includes('*') || (origin && allowedOrigins.includes(origin))) {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
      }

      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Credentials', 'true');

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
    // Health check
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

    // Job progress streaming (Server-Sent Events)
    this.app.get('/api/jobs/:jobId/progress', (req: Request, res: Response) => {
      const { jobId } = req.params;
      const clientId = uuidv4();

      // Set SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
      });

      // Send initial connection event
      res.write(
        `data: ${JSON.stringify({
          type: 'connected',
          job_id: jobId,
          client_id: clientId,
          timestamp: new Date().toISOString(),
        })}\n\n`
      );

      // Store SSE connection
      this.sseConnections.set(clientId, {
        response: res,
        jobId,
        clientId,
      });

      logger.info(`SSE client ${clientId} connected for job ${jobId}`);

      // Handle client disconnect
      req.on('close', () => {
        this.sseConnections.delete(clientId);
        logger.info(`SSE client ${clientId} disconnected from job ${jobId}`);
      });
    });

    // Job list endpoint
    this.app.get('/api/jobs', async (req: Request, res: Response) => {
      try {
        const { status, limit = '50', offset = '0' } = req.query;
        const jobs = await this.getJobs({
          status: status as JobStatus,
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
  }

  private setupWebSocketHandling(): void {
    this.wsServer.on('connection', (ws: WebSocket, req) => {
      const url = req.url || '';
      logger.info(`WebSocket connection to: ${url}`);

      // Parse URL to determine connection type
      if (url.startsWith('/ws/monitor/')) {
        this.handleMonitorConnection(ws, url);
      } else if (url.startsWith('/ws/client/')) {
        this.handleClientConnection(ws, url);
      } else {
        // Legacy WebSocket connection (fallback)
        this.handleLegacyConnection(ws);
      }
    });
  }

  private handleMonitorConnection(ws: WebSocket, url: string): void {
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

    // Register monitor with EventBroadcaster
    this.eventBroadcaster.addMonitor(monitorId, ws);

    logger.info(`Monitor ${monitorId} connected`);
    logger.debug(`📊 Total monitors connected: ${this.eventBroadcaster.getMonitorCount()}`);

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
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

    ws.on('close', () => {
      this.monitorConnections.delete(monitorId);
      this.eventBroadcaster.removeMonitor(monitorId);
      logger.info(`Monitor ${monitorId} disconnected`);
      logger.debug(`📊 Total monitors remaining: ${this.eventBroadcaster.getMonitorCount()}`);
    });

    ws.on('error', error => {
      logger.error(`Monitor WebSocket error for ${monitorId}:`, error);
      this.monitorConnections.delete(monitorId);
      this.eventBroadcaster.removeMonitor(monitorId);
    });
  }

  private handleClientConnection(ws: WebSocket, url: string): void {
    const clientId = url.split('/ws/client/')[1]?.split('?')[0];
    if (!clientId) {
      ws.close(1008, 'Invalid client ID');
      return;
    }

    // Parse query parameters for authentication
    const urlParams = new URLSearchParams(url.split('?')[1]);
    const token = urlParams.get('token');

    // Validate token if provided
    if (token && !this.isValidToken(token)) {
      logger.warn(`Invalid token provided for client ${clientId}: ${token}`);
      ws.close(1008, 'Invalid authentication token');
      return;
    }

    const connection: ClientConnection = {
      ws,
      clientId,
    };

    this.clientConnections.set(clientId, connection);
    logger.info(`Client ${clientId} connected`);

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
      this.clientConnections.delete(clientId);
      logger.info(`Client ${clientId} disconnected`);
    });

    ws.on('error', error => {
      logger.error(`Client WebSocket error for ${clientId}:`, error);
      this.clientConnections.delete(clientId);
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
          const jobId = await this.submitJob(message.data as Record<string, unknown>);
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

    switch (message.type) {
      case 'monitor_connect':
        const connectTime = Date.now();
        logger.info(
          `Monitor ${monitorId} requesting connection at ${new Date(connectTime).toISOString()}`
        );

        // Send acknowledgment
        ws.send(
          JSON.stringify({
            type: 'monitor_connected',
            monitor_id: monitorId,
            timestamp: new Date().toISOString(),
          })
        );

        // Send full state if requested
        if (message.request_full_state) {
          logger.info(`Monitor ${monitorId} requested full state, sending...`);
          const beforeSnapshot = Date.now();
          await this.sendFullStateSnapshot(connection);
          logger.info(
            `Full state snapshot for ${monitorId} completed in ${Date.now() - beforeSnapshot}ms (${Date.now() - connectTime}ms since connect)`
          );
        }
        break;

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

      case 'heartbeat':
        ws.send(
          JSON.stringify({
            type: 'heartbeat_ack',
            monitor_id: monitorId,
            timestamp: new Date().toISOString(),
          })
        );
        break;

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
          const jobId = await this.submitJob(jobData);

          // Track that this client submitted this job
          this.jobToClientMap.set(jobId, clientId);

          ws.send(
            JSON.stringify({
              type: 'job_submitted',
              job_id: jobId,
              message_id: message.id,
              timestamp: new Date().toISOString(),
            })
          );

          // Note: Job submission event will be broadcasted from submitJob method with proper JobSubmittedEvent format
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

  private async sendFullStateSnapshot(connection: MonitorConnection): Promise<void> {
    try {
      const startTime = Date.now();

      // Get current workers using SCAN for heartbeat keys
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

      logger.debug(
        `SCAN found ${workerKeys.length} worker heartbeat keys in ${Date.now() - startTime}ms`
      );

      const workers = [];

      if (workerKeys.length > 0) {
        // Extract worker IDs and prepare pipeline
        const workerIds = workerKeys.map(key => key.split(':')[1]);
        const pipeline = this.redis.pipeline();

        // Batch fetch worker data and TTLs
        for (const workerId of workerIds) {
          pipeline.hgetall(`worker:${workerId}`);
        }
        for (const key of workerKeys) {
          pipeline.ttl(key);
        }

        const pipelineStart = Date.now();
        const results = await pipeline.exec();
        logger.debug(
          `Pipeline fetched ${workerIds.length} workers data in ${Date.now() - pipelineStart}ms`
        );

        if (results) {
          const workerDataResults = results.slice(0, workerIds.length);
          const ttlResults = results.slice(workerIds.length);

          for (let i = 0; i < workerIds.length; i++) {
            const [workerErr, workerData] = workerDataResults[i];
            const [ttlErr, ttl] = ttlResults[i];

            if (
              !workerErr &&
              workerData &&
              Object.keys(workerData as Record<string, unknown>).length > 0
            ) {
              const workerId = workerIds[i];
              const data = workerData as Record<string, string>;

              // Parse capabilities JSON from Redis
              let capabilities: Record<string, unknown>;
              try {
                capabilities = JSON.parse(data.capabilities || '{}');
              } catch {
                capabilities = {};
              }

              // Transform Redis worker data to monitor format
              interface CapabilitiesData {
                hardware?: {
                  gpu_count?: number;
                  gpu_memory_gb?: number;
                  gpu_model?: string;
                  cpu_cores?: number;
                  ram_gb?: number;
                };
                services?: string[];
                models?: Record<string, unknown>;
                customer_access?: {
                  isolation?: string;
                };
                performance?: {
                  concurrent_jobs?: number;
                };
              }

              const caps = capabilities as CapabilitiesData;
              const worker = {
                id: workerId,
                status: (data.status as 'idle' | 'busy' | 'offline' | 'error') || 'idle',
                capabilities: {
                  gpu_count: caps?.hardware?.gpu_count || 0,
                  gpu_memory_gb: caps?.hardware?.gpu_memory_gb || 0,
                  gpu_model: caps?.hardware?.gpu_model || 'Unknown',
                  cpu_cores: caps?.hardware?.cpu_cores || 1,
                  ram_gb: caps?.hardware?.ram_gb || 1,
                  services: caps?.services || [],
                  models: Object.keys(caps?.models || {}),
                  customer_access: caps?.customer_access?.isolation || 'none',
                  max_concurrent_jobs: caps?.performance?.concurrent_jobs || 1,
                },
                current_job_id: data.current_job_id,
                connected_at: data.connected_at || new Date().toISOString(),
                last_activity: data.last_heartbeat || new Date().toISOString(),
                jobs_completed: parseInt(data.total_jobs_completed || '0'),
                jobs_failed: parseInt(data.total_jobs_failed || '0'),
                total_processing_time: 0, // Could be calculated from job history
                last_heartbeat: !ttlErr ? (ttl as number) : -1,
              };
              workers.push(worker);
            }
          }
        }
      }

      // Get current jobs and organize by status
      const jobsStart = Date.now();
      const allJobs = await this.getAllJobs();
      logger.debug(`Fetched ${allJobs.length} jobs in ${Date.now() - jobsStart}ms`);

      // Organize jobs by status for monitor compatibility
      const jobsByStatus = {
        pending: [] as unknown[],
        active: [] as unknown[],
        completed: [] as unknown[],
        failed: [] as unknown[],
      };

      for (const job of allJobs) {
        // Convert job for monitor compatibility
        const monitorJob = {
          ...job,
          job_type: job.service_required, // Map service_required to job_type for monitor
        };

        // Categorize by status
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
            jobsByStatus.completed.push(monitorJob);
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

      const snapshot = {
        workers,
        jobs: jobsByStatus,
        timestamp: Date.now(),
        system_stats: {
          total_jobs: allJobs.length,
          pending_jobs: jobsByStatus.pending.length,
          active_jobs: jobsByStatus.active.length,
          completed_jobs: jobsByStatus.completed.length,
          failed_jobs: jobsByStatus.failed.length,
          total_workers: workers.length,
          active_workers: workers.filter(w => w.status === 'active' || w.status === 'busy').length,
        },
      };

      connection.ws.send(
        JSON.stringify({
          type: 'full_state_snapshot',
          data: snapshot,
          monitor_id: connection.monitorId,
          timestamp: new Date().toISOString(),
        })
      );

      logger.info(
        `Sent full state snapshot to monitor ${connection.monitorId}: ${workers.length} workers, ${allJobs.length} jobs (total time: ${Date.now() - startTime}ms)`
      );
    } catch (error) {
      logger.error(`Failed to send full state snapshot to monitor ${connection.monitorId}:`, error);
    }
  }

  private broadcastToMonitors(
    event:
      | JobSubmittedEvent
      | JobAssignedEvent
      | JobStatusChangedEvent
      | JobProgressEvent
      | JobCompletedEvent
      | JobFailedEvent
      | WorkerStatusChangedEvent
  ): void {
    const eventJson = JSON.stringify(event);

    for (const [_monitorId, connection] of this.monitorConnections) {
      if (connection.ws.readyState === WebSocket.OPEN) {
        // Check if monitor is subscribed to this event type
        const eventType = event.type as string;
        const isSubscribed =
          connection.subscribedTopics.has('jobs') ||
          connection.subscribedTopics.has(`jobs:${eventType.split('_')[1]}`) ||
          connection.subscribedTopics.size === 0; // Subscribe to all if no specific topics

        if (isSubscribed) {
          connection.ws.send(eventJson);
        }
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleMachineStartupEvent(startupData: any): void {
    // Extract machine_id from the worker_id or use machine config
    const machineId =
      startupData.machine_config?.machine_id ||
      startupData.worker_id.split('-').slice(0, -1).join('-') ||
      'unknown-machine';

    logger.info(`🏭 Processing machine event for: ${machineId}`);
    const monitorCount = this.eventBroadcaster.getMonitorCount();
    logger.info(`📊 Connected monitors: ${monitorCount}`);

    if (monitorCount === 0) {
      logger.warn('⚠️  NO MONITORS CONNECTED - Hello World message will not be received');
    } else {
      logger.info(`🔄 Broadcasting to ${monitorCount} connected monitors`);
    }

    // TEST: Send a simple message to verify WebSocket connection
    this.eventBroadcaster.broadcast({
      type: 'system_stats' as const,
      stats: {
        message: 'Hello World from API server - machine event processed!',
        timestamp: Date.now(),
        test: true
      },
      timestamp: Date.now()
    });
    logger.info('🧪 Sent Hello World test message as system_stats to monitors');
    logger.info('🚀 FORCE DEPLOY: Testing machine event processing v3');

    // Map the startup event types to machine events
    switch (startupData.event_type) {
      case 'startup_begin':
        logger.info(`🚀 Broadcasting machine startup for: ${machineId}`);
        this.eventBroadcaster.broadcastMachineStartup(
          machineId,
          'starting',
          startupData.machine_config
            ? {
                hostname: startupData.machine_config.hostname || 'unknown',
                os: process.platform,
                cpu_cores: startupData.machine_config.cpu_cores || 4,
                total_ram_gb: startupData.machine_config.ram_gb || 16,
                gpu_count: startupData.machine_config.gpu_count || 1,
                gpu_models: startupData.machine_config.gpu_model
                  ? [startupData.machine_config.gpu_model]
                  : undefined,
              }
            : undefined
        );
        logger.debug(`✅ Machine startup broadcast sent for: ${machineId}`);
        break;

      case 'startup_step':
        logger.info(`📝 Broadcasting step '${startupData.step_name}' for: ${machineId}`);
        this.eventBroadcaster.broadcastMachineStartupStep(
          machineId,
          startupData.step_name,
          this.mapStepToPhase(startupData.step_name),
          startupData.elapsed_ms || 0,
          startupData.step_data
        );
        break;

      case 'startup_complete':
        logger.info(`🎉 Broadcasting startup complete for: ${machineId}`);
        this.eventBroadcaster.broadcastMachineStartupComplete(
          machineId,
          startupData.total_startup_time_ms,
          1, // worker count - basic machine has 1 worker typically
          startupData.machine_config?.services || []
        );
        break;

      case 'startup_failed':
        logger.error(`❌ Broadcasting startup failure for: ${machineId}`);
        // For now, we'll treat this as a machine startup step with error
        this.eventBroadcaster.broadcastMachineStartupStep(
          machineId,
          `startup_failed: ${startupData.error}`,
          'supporting_services',
          startupData.total_startup_time_ms || 0,
          { error: startupData.error, stack: startupData.stack }
        );
        break;

      default:
        logger.warn(`⚠️  Unknown machine event type: ${startupData.event_type} for ${machineId}`);
        break;
    }

    logger.info(`📢 Processed machine startup event: ${machineId} - ${startupData.event_type}`);
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

    this.progressSubscriber.on('pmessage', async (pattern, channel, event) => {
      try {
        logger.debug(
          `🔔 Redis keyspace notification: pattern=${pattern}, channel=${channel}, event=${event}`
        );

        // Handle job status changes
        if (channel.includes(':job:') && event === 'hset') {
          const match = channel.match(/job:(.+)$/);
          if (!match) return;

          const jobId = match[1];
          logger.info(`📋 Job status change detected for job: ${jobId}`);
          await this.handleJobStatusChange(jobId);
        }

        // Handle worker status changes
        else if (channel.includes(':worker:') && event === 'hset') {
          const match = channel.match(/worker:(.+)$/);
          if (!match) return;

          const workerId = match[1];
          logger.info(`👷 Worker status change detected for worker: ${workerId}, event: ${event}`);
          await this.handleWorkerStatusChange(workerId);
        }
      } catch (error) {
        logger.error(`Failed to handle Redis keyspace notification:`, error);
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

    // Subscribe to machine startup events
    await this.progressSubscriber.subscribe('machine:startup:events');
    logger.info('✅ Subscribed to: machine:startup:events');

    // Add debug subscription to legacy channel to catch any old events
    await this.progressSubscriber.subscribe('worker:startup:events');
    logger.warn('⚠️  Also subscribed to legacy channel: worker:startup:events (should be empty)');

    this.progressSubscriber.on('message', async (channel, message) => {
      if (channel === 'update_job_progress') {
        try {
          const progressData = JSON.parse(message);
          logger.info(
            `📊 Received real-time progress: job ${progressData.job_id}: ${progressData.progress}% (status: ${progressData.status})`
          );

          // Broadcast the progress update immediately
          await this.broadcastProgress(progressData.job_id, progressData);
        } catch (error) {
          logger.error('Error processing progress message:', error);
        }
      } else if (channel === 'worker_status') {
        try {
          const statusData = JSON.parse(message);
          logger.info(
            `👷 Received real-time worker status: ${statusData.worker_id}: ${statusData.new_status} (job: ${statusData.current_job_id || 'none'})`
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
          this.broadcastToMonitors(workerStatusEvent);

          logger.info(
            `📢 Broadcasted worker status change: ${statusData.worker_id} -> ${statusData.new_status}`
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

          // Broadcast the completion event to both clients and monitors
          await this.broadcastCompletion(completionData.job_id, completionData);

          logger.info(
            `📢 Broadcasted job completion event to clients and monitors: ${completionData.job_id}`
          );
        } catch (error) {
          logger.error('Error processing job completion message:', error);
        }
      } else if (channel === 'machine:startup:events') {
        try {
          const startupData = JSON.parse(message);
          logger.info(
            `🚀 Received machine startup event: ${startupData.worker_id} - ${startupData.event_type}`
          );
          logger.debug('🔍 Machine startup data:', JSON.stringify(startupData, null, 2));

          // Process machine startup event and broadcast via EventBroadcaster
          this.handleMachineStartupEvent(startupData);
        } catch (error) {
          logger.error('❌ Error processing machine startup message:', error);
          logger.error('Raw message:', message);
        }
      } else if (channel === 'worker:startup:events') {
        logger.warn(
          `⚠️  Received event on legacy channel 'worker:startup:events' - this should not happen!`
        );
        logger.warn('Raw message:', message);
        try {
          const data = JSON.parse(message);
          logger.warn('Parsed legacy event:', JSON.stringify(data, null, 2));
        } catch (error) {
          logger.error('Failed to parse legacy event:', error);
        }
      }
    });

    logger.info(
      '✅ Started Redis pub/sub subscription for real-time progress and worker status updates'
    );
  }

  private async handleJobStatusChange(jobId: string): Promise<void> {
    try {
      const jobData = await this.redis.hgetall(`job:${jobId}`);
      if (!jobData.id) return;

      const status = jobData.status as JobStatus;
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
        this.broadcastToMonitors(jobAssignedEvent);
      } else if (status === JobStatus.IN_PROGRESS) {
        const jobStatusEvent: JobStatusChangedEvent = {
          type: 'job_status_changed',
          job_id: jobId,
          old_status: JobStatus.ASSIGNED,
          new_status: JobStatus.IN_PROGRESS,
          worker_id: workerId,
          timestamp: Date.now(),
        };
        this.broadcastToMonitors(jobStatusEvent);
      } else if (status === JobStatus.COMPLETED) {
        const jobCompletedEvent: JobCompletedEvent = {
          type: 'complete_job',
          job_id: jobId,
          worker_id: workerId,
          result: jobData.result ? JSON.parse(jobData.result) : undefined,
          completed_at: Date.now(),
          timestamp: Date.now(),
        };
        this.broadcastToMonitors(jobCompletedEvent);
      } else if (status === JobStatus.FAILED) {
        const jobFailedEvent: JobFailedEvent = {
          type: 'job_failed',
          job_id: jobId,
          worker_id: workerId,
          error: jobData.error || 'Unknown error',
          failed_at: Date.now(),
          timestamp: Date.now(),
        };
        this.broadcastToMonitors(jobFailedEvent);
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
      this.broadcastToMonitors(workerStatusEvent);

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
        timestamp: Date.now(),
      };

      // Broadcast to monitors
      this.broadcastToMonitors(jobProgressEvent);

      // Broadcast to SSE connections (clients)
      for (const [_clientId, connection] of this.sseConnections) {
        if (connection.jobId === jobId) {
          try {
            connection.response.write(`data: ${JSON.stringify(jobProgressEvent)}\n\n`);
          } catch (error) {
            logger.error(`Failed to send SSE progress to client ${connection.clientId}:`, error);
            this.sseConnections.delete(connection.clientId);
          }
        }
      }

      // Broadcast to WebSocket connections (clients)
      for (const [_clientId, connection] of this.wsConnections) {
        if (connection.subscribedJobs.has(jobId)) {
          try {
            connection.ws.send(JSON.stringify(jobProgressEvent));
          } catch (error) {
            logger.error(
              `Failed to send WebSocket progress to client ${connection.clientId}:`,
              error
            );
            this.wsConnections.delete(connection.clientId);
          }
        }
      }

      // Also broadcast to the client that submitted this job
      const submittingClientId = this.jobToClientMap.get(jobId);
      if (submittingClientId) {
        const clientConnection = this.clientConnections.get(submittingClientId);
        if (clientConnection && clientConnection.ws.readyState === WebSocket.OPEN) {
          try {
            clientConnection.ws.send(JSON.stringify(jobProgressEvent));
            logger.debug(`Sent progress update to job submitter client ${submittingClientId}`);
          } catch (error) {
            logger.error(
              `Failed to send progress to submitting client ${submittingClientId}:`,
              error
            );
            this.clientConnections.delete(submittingClientId);
          }
        }
      }
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
      this.broadcastToMonitors(jobAssignedEvent);
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
      this.broadcastToMonitors(jobStatusEvent);
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
      this.broadcastToMonitors(jobCompletedEvent);
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
      this.broadcastToMonitors(jobFailedEvent);
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
    const completionMessage = {
      type: 'complete_job',
      job_id: jobId,
      worker_id: completionData.worker_id,
      result: completionData.result,
      completed_at: completionData.timestamp,
      timestamp: completionData.timestamp,
    };

    // Broadcast to monitors as JobCompletedEvent
    const jobCompletedEvent: JobCompletedEvent = {
      type: 'complete_job',
      job_id: jobId,
      worker_id: completionData.worker_id as string,
      result: completionData.result,
      completed_at: completionData.timestamp as number,
      timestamp: completionData.timestamp as number,
    };
    this.broadcastToMonitors(jobCompletedEvent);

    // Broadcast to SSE connections (clients waiting for this specific job)
    for (const [_clientId, connection] of this.sseConnections) {
      if (connection.jobId === jobId) {
        try {
          connection.response.write(`data: ${JSON.stringify(completionMessage)}\n\n`);
          // Close SSE connection after sending completion
          connection.response.end();
          this.sseConnections.delete(connection.clientId);
        } catch (error) {
          logger.error(`Failed to send SSE completion to client ${connection.clientId}:`, error);
          this.sseConnections.delete(connection.clientId);
        }
      }
    }

    // Broadcast to WebSocket connections (clients subscribed to this job)
    for (const [_clientId, connection] of this.wsConnections) {
      if (connection.subscribedJobs.has(jobId)) {
        try {
          connection.ws.send(JSON.stringify(completionMessage));
        } catch (error) {
          logger.error(
            `Failed to send WebSocket completion to client ${connection.clientId}:`,
            error
          );
          this.wsConnections.delete(connection.clientId);
        }
      }
    }

    // Also broadcast to the client that submitted this job
    const submittingClientId = this.jobToClientMap.get(jobId);
    if (submittingClientId) {
      const clientConnection = this.clientConnections.get(submittingClientId);
      if (clientConnection && clientConnection.ws.readyState === clientConnection.ws.OPEN) {
        try {
          clientConnection.ws.send(JSON.stringify(completionMessage));
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

  private async submitJob(jobData: Record<string, unknown>): Promise<string> {
    // Submit job directly to Redis (no hub orchestration)

    const jobId = uuidv4();
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
      retry_count: 0,
      max_retries: (jobData.max_retries as number) || 3,
      workflow_id: jobData.workflow_id as string | undefined,
      workflow_priority: jobData.workflow_priority as number | undefined,
      workflow_datetime: jobData.workflow_datetime as number | undefined,
      step_number: jobData.step_number as number | undefined,
    };

    logger.info(`Job:`, JSON.stringify(job, null, 2));

    // Store job in Redis
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
      step_number: job.step_number?.toString() || '',
    });

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

    await this.redis.zadd('jobs:pending', score, jobId);

    // Broadcast job_submitted event to monitors
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
        step_number: jobData.step_number as number,
        customer_id: job.customer_id,
        requirements: job.requirements,
        created_at: Date.now(),
      },
      timestamp: Date.now(),
    };
    this.broadcastToMonitors(jobSubmittedEvent);

    logger.info(`Job ${jobId} submitted via lightweight API (${job.service_required})`);
    return jobId;
  }

  private async getJobStatus(jobId: string): Promise<Job | null> {
    const jobData = await this.redis.hgetall(`job:${jobId}`);
    if (!jobData.id) return null;

    return {
      id: jobData.id,
      service_required: jobData.service_required,
      priority: parseInt(jobData.priority || '50'),
      payload: JSON.parse(jobData.payload || '{}'),
      requirements: jobData.requirements ? JSON.parse(jobData.requirements) : undefined,
      customer_id: jobData.customer_id || undefined,
      created_at: jobData.created_at,
      assigned_at: jobData.assigned_at || undefined,
      started_at: jobData.started_at || undefined,
      completed_at: jobData.completed_at || undefined,
      failed_at: jobData.failed_at || undefined,
      worker_id: jobData.worker_id || undefined,
      status: jobData.status as JobStatus,
      retry_count: parseInt(jobData.retry_count || '0'),
      max_retries: parseInt(jobData.max_retries || '3'),
      last_failed_worker: jobData.last_failed_worker || undefined,
      processing_time: jobData.processing_time ? parseInt(jobData.processing_time) : undefined,
      estimated_completion: jobData.estimated_completion || undefined,
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
      this.broadcastToMonitors(jobFailedEvent);

      logger.info(`Job ${jobId} cancelled successfully (was ${currentStatus})`);
    } catch (error) {
      logger.error(`Failed to cancel job ${jobId}:`, error);
      throw error;
    }
  }

  private async getJobs(options: {
    status?: JobStatus;
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
      jobKeys.push(...keys);
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

    return {
      id: jobData.id,
      service_required: jobData.service_required,
      priority: parseInt(jobData.priority || '50'),
      payload: JSON.parse(jobData.payload || '{}'),
      requirements: jobData.requirements ? JSON.parse(jobData.requirements) : undefined,
      customer_id: jobData.customer_id || undefined,
      created_at: jobData.created_at,
      assigned_at: jobData.assigned_at || undefined,
      started_at: jobData.started_at || undefined,
      completed_at: jobData.completed_at || undefined,
      failed_at: jobData.failed_at || undefined,
      worker_id: jobData.worker_id || undefined,
      status: jobData.status as JobStatus,
      retry_count: parseInt(jobData.retry_count || '0'),
      max_retries: parseInt(jobData.max_retries || '3'),
      last_failed_worker: jobData.last_failed_worker || undefined,
      processing_time: jobData.processing_time ? parseInt(jobData.processing_time) : undefined,
      estimated_completion: jobData.estimated_completion || undefined,
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
        jobKeys.push(...keys);
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

  async start(): Promise<void> {
    try {
      // Connect to Redis
      await this.redis.ping();
      await this.redisService.connect();

      // Enable keyspace notifications for progress streaming
      // K = Keyspace events, $ = String commands, s = Stream commands, E = Keyevent, x = Expired
      await this.redis.config('SET', 'notify-keyspace-events', 'Ks$Ex');

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
      logger.info('  GET /api/jobs/:id/progress - Stream progress (SSE)');
      logger.info('  GET /api/jobs - List jobs');
      logger.info('  GET /health - Health check');
    } catch (error) {
      logger.error('Failed to start Lightweight API Server:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    logger.info('Stopping Lightweight API Server...');

    // Close all SSE connections
    for (const [_clientId, connection] of this.sseConnections) {
      connection.response.end();
    }
    this.sseConnections.clear();

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

    // Disconnect Redis
    await this.redis.quit();
    await this.redisService.disconnect();
    await this.progressSubscriber.quit();

    logger.info('Lightweight API Server stopped');
  }

  getConnectionStats() {
    return {
      sse_connections: this.sseConnections.size,
      websocket_connections: this.wsConnections.size,
      total_connections: this.sseConnections.size + this.wsConnections.size,
    };
  }
}
