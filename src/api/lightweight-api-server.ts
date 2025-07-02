// Lightweight API Server - Phase 1C Implementation
// Replaces hub orchestration with simple HTTP + WebSocket API
// Supports both legacy WebSocket clients and modern HTTP+SSE clients

import express, { Request, Response } from 'express';
import { createServer, Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { Job, JobStatus, JobRequirements } from '../core/types/job.js';
import { logger } from '../core/utils/logger.js';
import { RedisService } from '../core/redis-service.js';

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
  private config: LightweightAPIConfig;

  // Connection tracking
  private sseConnections = new Map<string, SSEConnection>();
  private wsConnections = new Map<string, WebSocketConnection>();
  private monitorConnections = new Map<string, MonitorConnection>();
  private clientConnections = new Map<string, ClientConnection>();
  private progressSubscriber: Redis;

  constructor(config: LightweightAPIConfig) {
    this.config = config;
    this.app = express();
    this.httpServer = createServer(this.app);
    this.wsServer = new WebSocketServer({ server: this.httpServer });

    // Redis connections
    this.redis = new Redis(config.redisUrl);
    this.redisService = new RedisService(config.redisUrl);
    this.progressSubscriber = new Redis(config.redisUrl);

    this.setupMiddleware();
    this.setupHTTPRoutes();
    this.setupWebSocketHandling();
    this.setupProgressStreaming();
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
    this.app.get('/health', (req: Request, res: Response) => {
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

    const connection: MonitorConnection = {
      ws,
      monitorId,
      subscribedTopics: new Set(),
      clientId: uuidv4(),
    };

    this.monitorConnections.set(monitorId, connection);
    logger.info(`Monitor ${monitorId} connected`);

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
      logger.info(`Monitor ${monitorId} disconnected`);
    });

    ws.on('error', error => {
      logger.error(`Monitor WebSocket error for ${monitorId}:`, error);
      this.monitorConnections.delete(monitorId);
    });
  }

  private handleClientConnection(ws: WebSocket, url: string): void {
    const clientId = url.split('/ws/client/')[1]?.split('?')[0];
    if (!clientId) {
      ws.close(1008, 'Invalid client ID');
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
        logger.info(`Monitor ${monitorId} requesting connection`);

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
          await this.sendFullStateSnapshot(connection);
        }
        break;

      case 'subscribe':
        const topics = (message.topics as string[]) || [];
        connection.subscribedTopics.clear();
        topics.forEach(topic => connection.subscribedTopics.add(topic));

        logger.info(`Monitor ${monitorId} subscribed to topics:`, topics);

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
          ws.send(
            JSON.stringify({
              type: 'job_submitted',
              job_id: jobId,
              message_id: message.id,
              timestamp: new Date().toISOString(),
            })
          );

          // Broadcast job submission event to monitors
          this.broadcastToMonitors({
            type: 'job_submitted',
            job_id: jobId,
            timestamp: Date.now(),
          });
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
      // Get current workers (from Redis heartbeats)
      const workerKeys = await this.redis.keys('worker:*:heartbeat');
      const workers = [];

      for (const key of workerKeys) {
        const workerId = key.split(':')[1];
        const workerData = await this.redis.hgetall(`worker:${workerId}`);
        if (Object.keys(workerData).length > 0) {
          // Parse capabilities JSON from Redis
          let capabilities;
          try {
            capabilities = JSON.parse(workerData.capabilities || '{}');
          } catch {
            capabilities = {};
          }

          // Transform Redis worker data to monitor format
          const worker = {
            id: workerId,
            status: (workerData.status as 'idle' | 'busy' | 'offline' | 'error') || 'idle',
            capabilities: {
              gpu_count: capabilities.hardware?.gpu_count || 0,
              gpu_memory_gb: capabilities.hardware?.gpu_memory_gb || 0,
              gpu_model: capabilities.hardware?.gpu_model || 'Unknown',
              cpu_cores: capabilities.hardware?.cpu_cores || 1,
              ram_gb: capabilities.hardware?.ram_gb || 1,
              services: capabilities.services || [],
              models: Object.keys(capabilities.models || {}),
              customer_access: capabilities.customer_access?.isolation || 'none',
              max_concurrent_jobs: capabilities.performance?.concurrent_jobs || 1,
            },
            current_job_id: workerData.current_job_id,
            connected_at: workerData.connected_at || new Date().toISOString(),
            last_activity: workerData.last_heartbeat || new Date().toISOString(),
            jobs_completed: parseInt(workerData.total_jobs_completed || '0'),
            jobs_failed: parseInt(workerData.total_jobs_failed || '0'),
            total_processing_time: 0, // Could be calculated from job history
            last_heartbeat: await this.redis.ttl(key),
          };
          workers.push(worker);
        }
      }

      // Get current jobs
      const jobs = await this.getAllJobs();

      const snapshot = {
        workers,
        jobs,
        timestamp: Date.now(),
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
        `Sent full state snapshot to monitor ${connection.monitorId}: ${workers.length} workers, ${jobs.length} jobs`
      );
    } catch (error) {
      logger.error(`Failed to send full state snapshot to monitor ${connection.monitorId}:`, error);
    }
  }

  private broadcastToMonitors(event: Record<string, unknown>): void {
    const eventJson = JSON.stringify(event);

    for (const [monitorId, connection] of this.monitorConnections) {
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

  private setupProgressStreaming(): void {
    // Subscribe to all progress streams using pattern
    this.progressSubscriber.psubscribe('__keyspace@0__:progress:*');

    this.progressSubscriber.on('pmessage', async (pattern, channel, event) => {
      // Extract job ID from keyspace notification
      const match = channel.match(/progress:(.+)$/);
      if (!match || event !== 'xadd') return;

      const jobId = match[1];

      try {
        // Get latest progress from Redis Stream
        const entries = await this.redis.xrevrange(`progress:${jobId}`, '+', '-', 'COUNT', 1);
        if (entries.length === 0) return;

        const [_streamId, fields] = entries[0];
        const progressData = this.parseStreamFields(fields);

        // Broadcast to all relevant connections
        await this.broadcastProgress(jobId, progressData);
      } catch (error) {
        logger.error(`Failed to handle progress update for job ${jobId}:`, error);
      }
    });
  }

  private parseStreamFields(fields: string[]): Record<string, string> {
    const data: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      data[fields[i]] = fields[i + 1];
    }
    return data;
  }

  private async broadcastProgress(
    jobId: string,
    progressData: Record<string, string>
  ): Promise<void> {
    const progressMessage = {
      type: 'progress',
      job_id: jobId,
      data: progressData,
      timestamp: new Date().toISOString(),
    };

    // Broadcast to SSE connections
    for (const [_clientId, connection] of this.sseConnections) {
      if (connection.jobId === jobId) {
        try {
          connection.response.write(`data: ${JSON.stringify(progressMessage)}\n\n`);
        } catch (error) {
          logger.error(`Failed to send SSE progress to client ${connection.clientId}:`, error);
          this.sseConnections.delete(connection.clientId);
        }
      }
    }

    // Broadcast to WebSocket connections
    for (const [_clientId, connection] of this.wsConnections) {
      if (connection.subscribedJobs.has(jobId)) {
        try {
          connection.ws.send(JSON.stringify(progressMessage));
        } catch (error) {
          logger.error(
            `Failed to send WebSocket progress to client ${connection.clientId}:`,
            error
          );
          this.wsConnections.delete(connection.clientId);
        }
      }
    }

    // Broadcast to monitor connections
    this.broadcastToMonitors({
      type: 'job_progress',
      job_id: jobId,
      data: progressData,
      timestamp: Date.now(),
    });
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
    });

    // Add to pending queue with priority scoring
    const score = job.priority * 1000 + Date.now();
    await this.redis.zadd('jobs:pending', score, jobId);

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

  private async getJobs(options: {
    status?: JobStatus;
    limit: number;
    offset: number;
  }): Promise<Job[]> {
    // Simple implementation - in production might need pagination optimization
    const allJobIds = await this.redis.keys('job:*');
    const jobs: Job[] = [];

    for (const key of allJobIds.slice(options.offset, options.offset + options.limit)) {
      const jobId = key.replace('job:', '');
      const job = await this.getJobStatus(jobId);
      if (job && (!options.status || job.status === options.status)) {
        jobs.push(job);
      }
    }

    return jobs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  private async getAllJobs(): Promise<Job[]> {
    return this.getJobs({ limit: 1000, offset: 0 });
  }

  async start(): Promise<void> {
    try {
      // Connect to Redis
      await this.redis.ping();
      await this.redisService.connect();

      // Enable keyspace notifications for progress streaming
      await this.redis.config('SET', 'notify-keyspace-events', 'Ex');

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
