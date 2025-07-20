// Lightweight API Server - Phase 1C Implementation
// Replaces hub orchestration with simple HTTP + WebSocket API
// WebSocket-only communication for real-time updates

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
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let packageJson: any = { version: 'unknown', name: 'api', description: 'API Server' };
try {
  const require = createRequire(import.meta.url);
  // Try different paths for package.json
  try {
    packageJson = require('../package.json');
  } catch (e) {
    try {
      packageJson = require('../../package.json');
    } catch (e2) {
      // In Docker, package.json might be at the app root
      try {
        packageJson = require('/app/apps/api/package.json');
      } catch (e3) {
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

    // Redis connections
    this.redis = new Redis(config.redisUrl);
    this.redisService = new RedisService(config.redisUrl);
    this.progressSubscriber = new Redis(config.redisUrl);

    // Event broadcaster for real-time updates
    this.eventBroadcaster = new EventBroadcaster();

    // NOTE: EmProps format compatibility now handled directly in EventBroadcaster

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
    // CORS support - Enhanced for remote connections
    this.app.use((req, res, next) => {
      const allowedOrigins = this.config.corsOrigins || ['*'];
      const origin = req.headers.origin;

      // Log CORS requests for debugging
      if (origin) {
        logger.debug(`CORS request from origin: ${origin}, allowed: ${allowedOrigins.join(', ')}`);
      }

      if (allowedOrigins.includes('*') || (origin && allowedOrigins.includes(origin))) {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
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
          workers: Array.from(
            (this.eventBroadcaster as unknown as { workers: Map<string, unknown> }).workers.keys()
          ).length,
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
        environment: process.env.NODE_ENV || 'unknown',
        build_date: process.env.BUILD_DATE || 'unknown',
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
        logger.info(
          `[DEBUG] Sent test message to monitor ${monitorId}, ws.readyState: ${ws.readyState}`
        );
      } catch (error) {
        logger.error(`[DEBUG] Failed to send test message to monitor ${monitorId}:`, error);
      }
    }, 1000);

    // Set up ping/pong for connection health with visible JSON messages
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

        // Send visible ping message instead of protocol ping
        const pingMessage = {
          type: 'ping',
          monitor_id: monitorId,
          timestamp: Date.now(),
        };
        ws.send(JSON.stringify(pingMessage));

        logger.info(`[PING-PONG] Monitor ${monitorId} visible ping sent 🏓`);
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
        logger.info(
          `[DEBUG] Sent test message to client ${clientId}, ws.readyState: ${ws.readyState}`
        );
      } catch (error) {
        logger.error(`[DEBUG] Failed to send test message to client ${clientId}:`, error);
      }
    }, 1000);

    // Set up ping/pong for client connection health with visible JSON messages
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

        // Send visible ping message instead of protocol ping
        const pingMessage = {
          type: 'ping',
          client_id: clientId,
          timestamp: Date.now(),
        };
        ws.send(JSON.stringify(pingMessage));

        logger.info(`[PING-PONG] Client ${clientId} visible ping sent 🏓`);
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

      case 'pong':
        // Handle pong response from client
        logger.info(`[PING-PONG] Received pong from client ${clientId}:`, message);
        // Reset missed pongs counter for this client
        if (this.clientData.has(clientId)) {
          const data = this.clientData.get(clientId)!;
          data.missedPongs = 0;
          data.isAlive = true;
          this.clientData.set(clientId, data);
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
          await this.sendFullStateSnapshot(connection, {
            finishedJobsPagination: (
              message as { finishedJobsPagination?: { page: number; pageSize: number } }
            ).finishedJobsPagination || {
              page: 1,
              pageSize: 20,
            },
          });
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

      case 'heartbeat':
        ws.send(
          JSON.stringify({
            type: 'heartbeat_ack',
            monitor_id: monitorId,
            timestamp: new Date().toISOString(),
          })
        );
        break;

      case 'pong':
        // Handle pong response from monitor
        // Reset missed pongs counter for this monitor
        if (this.monitorData.has(monitorId)) {
          const data = this.monitorData.get(monitorId)!;
          data.missedPongs = 0;
          data.isAlive = true;
          this.monitorData.set(monitorId, data);
        }
        // Update EventBroadcaster heartbeat to prevent timeout removal
        this.eventBroadcaster.updateHeartbeat(monitorId);
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

      case 'pong':
        // Handle pong response from client
        logger.info(`[PING-PONG] Received pong from client ${clientId}:`, message);
        // Reset missed pongs counter for this client
        if (this.clientData.has(clientId)) {
          const data = this.clientData.get(clientId)!;
          data.missedPongs = 0;
          data.isAlive = true;
          this.clientData.set(clientId, data);
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

  private isMonitorSubscribedToEvent(connection: MonitorConnection, eventType: string): boolean {
    // If no subscriptions, default to allowing all events
    if (connection.subscribedTopics.size === 0) {
      return true;
    }

    // Check event type against subscribed topics
    if (
      eventType.startsWith('job_') ||
      eventType.startsWith('complete_job') ||
      eventType.startsWith('update_job_progress')
    ) {
      return connection.subscribedTopics.has('jobs');
    }

    if (eventType.startsWith('worker_') || eventType.startsWith('connector_')) {
      return connection.subscribedTopics.has('workers');
    }

    if (eventType.startsWith('machine_')) {
      return connection.subscribedTopics.has('machines');
    }

    if (eventType === 'system_stats') {
      return connection.subscribedTopics.has('system_stats');
    }

    if (eventType === 'heartbeat_ack' || eventType === 'heartbeat') {
      return connection.subscribedTopics.has('heartbeat');
    }

    if (eventType === 'full_state_snapshot') {
      return true; // Always allow full state snapshots
    }

    // Log unknown event types for debugging
    logger.debug(`🤔 Unknown event type for subscription check: ${eventType}`);
    return false;
  }

  private async sendFullStateSnapshot(
    connection: MonitorConnection,
    options?: {
      finishedJobsPagination?: { page: number; pageSize: number };
    }
  ): Promise<void> {
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

              // Parse connector statuses if available
              interface ConnectorStatusObj {
                status: string;
                timestamp: number;
                error_message?: string;
                [key: string]: unknown;
              }

              let connectorStatuses: Record<string, unknown> = {};
              try {
                if (data.connector_statuses) {
                  connectorStatuses = JSON.parse(data.connector_statuses as string);

                  // Validate timestamps and mark stale statuses
                  for (const [serviceType, status] of Object.entries(connectorStatuses)) {
                    if (status && typeof status === 'object' && 'timestamp' in status) {
                      const statusObj = status as ConnectorStatusObj;
                      const ageSeconds = (Date.now() - statusObj.timestamp) / 1000;

                      if (ageSeconds > 90) {
                        // Stale if older than 90 seconds (15s interval + buffer)
                        logger.warn(
                          `Stale connector status for ${workerId}:${serviceType}, age: ${Math.round(ageSeconds)}s`
                        );
                        statusObj.status = 'unknown';
                        statusObj.error_message = `Status stale (${Math.round(ageSeconds)}s old)`;
                        statusObj.timestamp = Date.now(); // Update timestamp to prevent repeated warnings
                      }
                    }
                  }
                }
              } catch (error) {
                logger.debug(`Failed to parse connector statuses for worker ${workerId}:`, error);
              }

              const worker = {
                id: workerId,
                machine_id: data.machine_id || this.extractMachineIdFromWorkerId(workerId), // Add machine_id field
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
                connector_statuses: connectorStatuses,
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

      // Get paginated completed jobs
      const paginationOptions = options?.finishedJobsPagination || { page: 1, pageSize: 20 };
      const completedJobsResult = await this.getCompletedJobsPaginated(paginationOptions);

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

      // Add paginated completed jobs
      jobsByStatus.completed = completedJobsResult.jobs.map(job => ({
        ...job,
        job_type: job.service_required, // Map service_required to job_type for monitor
      }));

      // Get machines from in-memory unified machine status
      const machines = Array.from(this.unifiedMachineStatus.values());

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

  private async sendFullStateSnapshotSSE(
    monitorId: string,
    res: Response,
    options?: {
      finishedJobsPagination?: { page: number; pageSize: number };
    }
  ): Promise<void> {
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

              // Parse connector statuses if available
              interface ConnectorStatusObj {
                status: string;
                timestamp: number;
                error_message?: string;
                [key: string]: unknown;
              }

              let connectorStatuses: Record<string, unknown> = {};
              try {
                if (data.connector_statuses) {
                  connectorStatuses = JSON.parse(data.connector_statuses as string);

                  // Validate timestamps and mark stale statuses
                  for (const [serviceType, status] of Object.entries(connectorStatuses)) {
                    if (status && typeof status === 'object' && 'timestamp' in status) {
                      const statusObj = status as ConnectorStatusObj;
                      const ageSeconds = (Date.now() - statusObj.timestamp) / 1000;

                      if (ageSeconds > 90) {
                        // Stale if older than 90 seconds (15s interval + buffer)
                        logger.warn(
                          `Stale connector status for ${workerId}:${serviceType}, age: ${Math.round(ageSeconds)}s`
                        );
                        statusObj.status = 'unknown';
                        statusObj.error_message = `Status stale (${Math.round(ageSeconds)}s old)`;
                        statusObj.timestamp = Date.now(); // Update timestamp to prevent repeated warnings
                      }
                    }
                  }
                }
              } catch (error) {
                logger.debug(`Failed to parse connector statuses for worker ${workerId}:`, error);
              }

              const worker = {
                id: workerId,
                machine_id: data.machine_id || this.extractMachineIdFromWorkerId(workerId), // Add machine_id field
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
                connector_statuses: connectorStatuses,
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

      // Get paginated completed jobs
      const paginationOptions = options?.finishedJobsPagination || { page: 1, pageSize: 20 };
      const completedJobsResult = await this.getCompletedJobsPaginated(paginationOptions);

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

      // Add paginated completed jobs
      jobsByStatus.completed = completedJobsResult.jobs.map(job => ({
        ...job,
        job_type: job.service_required, // Map service_required to job_type for monitor
      }));

      // Get machines from in-memory unified machine status
      const machines = Array.from(this.unifiedMachineStatus.values());

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

      // Send via SSE as single message (chunking removed)
      const eventData = {
        type: 'full_state_snapshot',
        data: snapshot,
        monitor_id: monitorId,
        timestamp: new Date().toISOString(),
      };

      const eventJson = JSON.stringify(eventData);
      res.write(`data: ${eventJson}\n\n`);

      logger.info(
        `Sent full state snapshot to SSE monitor ${monitorId}: ${workers.length} workers, ${allJobs.length} jobs (size: ${eventJson.length} bytes, total time: ${Date.now() - startTime}ms)`
      );
    } catch (error) {
      logger.error(`Failed to send full state snapshot to SSE monitor ${monitorId}:`, error);
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleMachineEvent(eventData: any): Promise<void> {
    // Extract machine_id from the worker_id or use machine config
    const machineId =
      eventData.machine_id ||
      eventData.machine_config?.machine_id ||
      eventData.worker_id.split('-').slice(0, -1).join('-') ||
      'unknown-machine';

    logger.info(`🏭 Processing machine event:`, {
      event_type: eventData.event_type,
      machine_id: machineId,
      worker_id: eventData.worker_id,
      reason: eventData.reason,
    });

    const monitorCount = this.eventBroadcaster.getMonitorCount();
    logger.info(`📊 Connected monitors: ${monitorCount}`);

    // Map the event types to machine events
    switch (eventData.event_type) {
      case 'machine_startup':
        logger.info(`🚀 Broadcasting machine startup for: ${machineId}`);

        // Create machine record in Redis
        const machineData = {
          machine_id: machineId,
          status: eventData.phase || 'starting',
          started_at: new Date().toISOString(),
          last_activity: new Date().toISOString(),
          hostname: eventData.machine_config?.hostname || 'unknown',
          os: process.platform,
          cpu_cores: eventData.machine_config?.cpu_cores || 4,
          total_ram_gb: eventData.machine_config?.ram_gb || 16,
          gpu_count: eventData.machine_config?.gpu_count || 0,
          gpu_models: JSON.stringify(eventData.machine_config?.gpu_models || []),
        };

        await this.redis.hset(`machine:${machineId}:info`, machineData);

        const hostInfo = eventData.machine_config
          ? {
              hostname: eventData.machine_config.hostname || 'unknown',
              os: process.platform,
              cpu_cores: eventData.machine_config.cpu_cores || 4,
              total_ram_gb: eventData.machine_config.ram_gb || 16,
              gpu_count: eventData.machine_config.gpu_count || 1,
              gpu_models: eventData.machine_config.gpu_model
                ? [eventData.machine_config.gpu_model]
                : undefined,
            }
          : undefined;

        this.eventBroadcaster.broadcastMachineStartup(machineId, 'starting', hostInfo);

        // Also broadcast to WebSocket monitors
        this.eventBroadcaster.broadcast({
          type: 'machine_startup',
          machine_id: machineId,
          phase: 'starting',
          host_info: hostInfo,
          timestamp: Date.now(),
        });
        logger.debug(`✅ Machine startup broadcast sent for: ${machineId}`);
        break;

      case 'startup_step':
        logger.info(`📝 Broadcasting step '${eventData.step_name}' for: ${machineId}`);
        this.eventBroadcaster.broadcastMachineStartupStep(
          machineId,
          eventData.step_name,
          this.mapStepToPhase(eventData.step_name),
          eventData.elapsed_ms || 0,
          eventData.step_data
        );
        break;

      case 'startup_complete':
        logger.info(`🎉 Broadcasting startup complete for: ${machineId}`);

        // Update machine status to ready
        await this.redis.hset(`machine:${machineId}:info`, {
          status: 'ready',
          last_activity: new Date().toISOString(),
        });

        this.eventBroadcaster.broadcastMachineStartupComplete(
          machineId,
          eventData.total_startup_time_ms,
          1, // worker count - basic machine has 1 worker typically
          eventData.machine_config?.services || []
        );
        break;

      case 'service_started':
        logger.info(`🔧 Service started: ${eventData.service_name} for: ${machineId}`);

        // Broadcast as a startup step for the monitor to track service progress
        this.eventBroadcaster.broadcastMachineStartupStep(
          machineId,
          `service_started: ${eventData.service_name}`,
          'supporting_services',
          eventData.elapsed_ms || 0,
          {
            service_name: eventData.service_name,
            service_data: eventData.service_data,
          }
        );
        break;

      case 'startup_failed':
        logger.error(`❌ Broadcasting startup failure for: ${machineId}`);

        // Mark machine as offline
        await this.redis.hset(`machine:${machineId}:info`, {
          status: 'offline',
          last_activity: new Date().toISOString(),
        });

        // For now, we'll treat this as a machine startup step with error
        this.eventBroadcaster.broadcastMachineStartupStep(
          machineId,
          `startup_failed: ${eventData.error}`,
          'supporting_services',
          eventData.total_startup_time_ms || 0,
          { error: eventData.error, stack: eventData.stack }
        );
        break;

      case 'shutdown':
        logger.info(
          `🔴 Processing machine shutdown for: ${machineId} (reason: ${eventData.reason})`
        );

        // Mark machine as offline
        await this.redis.hset(`machine:${machineId}:info`, {
          status: 'offline',
          last_activity: new Date().toISOString(),
        });
        logger.info(`✅ Updated Redis machine status to offline for: ${machineId}`);

        // Broadcast shutdown event
        logger.info(
          `📢 Broadcasting shutdown event to ${this.eventBroadcaster.getMonitorCount()} monitors`
        );
        this.eventBroadcaster.broadcastMachineShutdown(
          machineId,
          eventData.reason || 'Machine shutdown'
        );

        // Also broadcast to WebSocket monitors
        this.eventBroadcaster.broadcast({
          type: 'machine_shutdown',
          machine_id: machineId,
          reason: eventData.reason || 'Machine shutdown',
          timestamp: Date.now(),
        });
        logger.info(`✅ Machine shutdown event broadcasted for: ${machineId}`);
        break;

      default:
        logger.warn(`⚠️  Unknown machine event type: ${eventData.event_type} for ${machineId}`);
        break;
    }

    logger.info(`📢 Processed machine event: ${machineId} - ${eventData.event_type}`);
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
      // Store the unified machine status in memory for snapshot access
      this.unifiedMachineStatus.set(machineId, statusData);

      // Also store basic machine info for backward compatibility
      const machineInfo = {
        machine_id: machineId,
        status: statusData.status?.machine?.phase || 'unknown',
        last_activity: new Date().toISOString(),
        gpu_count: statusData.structure?.gpu_count || 0,
        capabilities: JSON.stringify(statusData.structure?.capabilities || []),
        structure: JSON.stringify(statusData.structure || {}),
        uptime_ms: statusData.status?.machine?.uptime_ms || 0,
      };

      await this.redis.hset(`machine:${machineId}:info`, machineInfo);

      // Store/update worker data for each worker in the machine
      if (statusData.structure?.workers && statusData.status?.workers) {
        for (const [workerId, workerInfo] of Object.entries(statusData.structure.workers)) {
          const workerStatus = statusData.status.workers[workerId];

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
              connector_statuses: JSON.stringify(statusData.status?.services || {}),
            };

            await this.redis.hset(`worker:${workerId}`, workerData);
          }
        }
      }

      // Broadcast appropriate events to monitors based on update type
      if (updateType === 'initial' || updateType === 'periodic') {
        // Broadcast machine update for periodic refreshes
        // Broadcast to WebSocket monitors
        this.eventBroadcaster.broadcast({
          type: 'machine_update',
          machine_id: machineId,
          status_data: statusData,
          timestamp: Date.now(),
        });
      } else if (updateType === 'event_driven') {
        // Broadcast specific status changes for immediate updates
        // Broadcast to WebSocket monitors
        this.eventBroadcaster.broadcast({
          type: 'machine_status_change',
          machine_id: machineId,
          status_data: statusData,
          timestamp: Date.now(),
        });
      }

      logger.debug(
        `✅ Processed unified status for ${machineId}: ${Object.keys(statusData.structure?.workers || {}).length} workers, ${Object.keys(statusData.status?.services || {}).length} services`
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
            logger.info(
              `[JOB COMPLETE] After broadcasting completion - Monitor still connected: ${this.eventBroadcaster.getMonitorCount()} monitors`
            );
          }, 100); // 100ms delay to allow pending progress updates to be processed
        } catch (error) {
          logger.error('Error processing job completion message:', error);
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
   */
  private async checkForStaleMachines(): Promise<void> {
    const now = Date.now();
    const staleThreshold = 30000; // 30 seconds

    for (const [machineId, lastSeen] of this.machineLastSeen.entries()) {
      const timeSinceLastSeen = now - lastSeen;

      if (timeSinceLastSeen > staleThreshold) {
        logger.warn(
          `🔴 Machine ${machineId} is stale (${Math.round(timeSinceLastSeen / 1000)}s since last status)`
        );

        try {
          // Mark machine as disconnected in Redis
          await this.redis.hset(`machine:${machineId}:info`, {
            status: 'disconnected',
            last_activity: new Date(lastSeen).toISOString(),
            disconnected_at: new Date().toISOString(),
          });

          // Broadcast machine disconnected event to monitors
          this.eventBroadcaster.broadcastMachineDisconnected(machineId, 'Status timeout (30s)');

          // Also broadcast to WebSocket monitors
          this.eventBroadcaster.broadcast({
            type: 'machine_disconnected',
            machine_id: machineId,
            reason: 'Status timeout (30s)',
            timestamp: Date.now(),
          });

          // Remove from tracking to avoid repeated warnings
          this.machineLastSeen.delete(machineId);

          logger.info(`📢 Broadcasted disconnection for stale machine: ${machineId}`);
        } catch (error) {
          logger.error(`Failed to mark machine ${machineId} as disconnected:`, error);
        }
      }
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
        timestamp: Date.now(),
      };

      // Broadcast to monitors
      this.eventBroadcaster.broadcast(jobProgressEvent);

      // Broadcast to clients via EventBroadcaster (with EmProps format adaptation)
      this.eventBroadcaster.broadcast(jobProgressEvent);

      // Legacy: Also broadcast to WebSocket connections directly (for backward compatibility)
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
    const completionMessage = {
      type: 'complete_job',
      job_id: jobId,
      worker_id: completionData.worker_id,
      result: completionData.result,
      completed_at: completionData.timestamp,
      timestamp: completionData.timestamp,
    };

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

    // Legacy: Also broadcast to WebSocket connections directly (for backward compatibility)
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

  private async submitJob(
    jobData: Record<string, unknown>,
    providedJobId?: string
  ): Promise<string> {
    // Submit job directly to Redis (no hub orchestration)
    // Use provided job ID (for EmProps compatibility) or generate new one

    const jobId = providedJobId || uuidv4();
    if (providedJobId) {
      logger.info(`[JOB SUBMIT START] Using provided job ID: ${jobId} (EmProps compatibility)`);
    } else {
      logger.info(`[JOB SUBMIT START] Generated new job ID: ${jobId}`);
    }
    logger.info(
      `[JOB SUBMIT START] Job ${jobId} - Monitor still connected: ${this.eventBroadcaster.getMonitorCount()} monitors`
    );
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
    logger.info(
      `[JOB SUBMIT] Storing job ${jobId} in Redis - Monitor still connected: ${this.eventBroadcaster.getMonitorCount()} monitors`
    );
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
    logger.info(
      `[JOB SUBMIT] Job ${jobId} added to pending queue - Monitor still connected: ${this.eventBroadcaster.getMonitorCount()} monitors`
    );

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
        step_number: jobData.step_number as number,
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

    logger.info(`📢 [DEBUG] Broadcasted job_submitted event for ${jobId}`);

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
      status: (jobData.status || 'pending') as JobStatus,
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
      status: (jobData.status || 'pending') as JobStatus,
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

    // Get all completed jobs first to get total count
    const allJobs = await this.getAllJobs();
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

      // If worker has active jobs, reset them to pending
      if (workerData.current_job_id) {
        const jobId = workerData.current_job_id;
        logger.info(`🔄 Resetting job ${jobId} from worker ${workerId} to pending`);

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
      logger.info('  WS /ws/client - WebSocket for job progress streaming');
      logger.info('  GET /api/jobs - List jobs');
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

    // Disconnect Redis
    await this.redis.quit();
    await this.redisService.disconnect();
    await this.progressSubscriber.quit();

    logger.info('Lightweight API Server stopped');
  }

  getConnectionStats() {
    return {
      monitor_connections: this.monitorConnections.size,
      client_websocket_connections: this.wsConnections.size,
      total_connections: this.monitorConnections.size + this.wsConnections.size,
    };
  }
}
