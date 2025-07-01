// WebSocket Manager - handles real-time communication with workers and clients
// Direct port from Python hub WebSocket handling

import { WebSocketServer, WebSocket } from 'ws';
import { Server, IncomingMessage } from 'http';
import { URL } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { TimestampUtil } from '../core/utils/timestamp.js';
import {
  ConnectionManagerInterface,
  WebSocketConnection,
} from '../core/interfaces/connection-manager.js';
import { BaseMessage, MessageType, WorkerRegistrationMessage } from '../core/types/messages.js';
import { logger } from '../core/utils/logger.js';

interface WebSocketManagerConfig {
  port: number;
  host: string;
  authToken?: string;
  enableHeartbeat?: boolean;
  heartbeatIntervalMs?: number;
  maxConnections?: number;
  enableCompression?: boolean;
}

export class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private server: Server | null = null;
  private connectionManager: ConnectionManagerInterface;
  private config: WebSocketManagerConfig;
  private isRunningFlag = false;
  private connectionCount = 0;

  constructor(connectionManager: ConnectionManagerInterface, config: WebSocketManagerConfig) {
    this.connectionManager = connectionManager;
    this.config = {
      enableHeartbeat: true,
      heartbeatIntervalMs: 30000,
      maxConnections: 1000,
      enableCompression: true,
      ...config,
    };
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Create WebSocket server
        this.wss = new WebSocketServer({
          port: this.config.port,
          host: this.config.host,
          perMessageDeflate: this.config.enableCompression
            ? {
                zlibDeflateOptions: {
                  level: 6,
                  chunkSize: 4096,
                },
                threshold: 1024,
                concurrencyLimit: 10,
                clientNoContextTakeover: false,
                serverNoContextTakeover: false,
                serverMaxWindowBits: 15,
                clientMaxWindowBits: 15,
              }
            : false,
        });

        this.wss.on('connection', this.handleConnection.bind(this));

        this.wss.on('listening', () => {
          this.isRunningFlag = true;
          logger.info(`WebSocket server listening on ${this.config.host}:${this.config.port}`);
          resolve();
        });

        this.wss.on('error', error => {
          logger.error('WebSocket server error:', error);
          reject(error);
        });

        // Start heartbeat interval if enabled
        if (this.config.enableHeartbeat) {
          setInterval(() => {
            this.sendHeartbeats();
          }, this.config.heartbeatIntervalMs || 30000);
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    if (!this.wss) return;

    return new Promise(resolve => {
      // Close all connections
      if (this.wss) {
        this.wss.clients.forEach(ws => {
          ws.close(1000, 'Server shutting down');
        });
      }

      if (this.wss) {
        this.wss.close(() => {
          this.isRunningFlag = false;
          logger.info('WebSocket server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  isRunning(): boolean {
    return this.isRunningFlag;
  }

  private async handleConnection(ws: WebSocket, request: IncomingMessage): Promise<void> {
    try {
      // Check connection limit
      if (this.connectionCount >= (this.config.maxConnections || 1000)) {
        ws.close(1013, 'Server overloaded');
        return;
      }

      this.connectionCount++;

      // Parse connection type and ID from URL - support both query params and path-based routing
      const url = new URL(request.url, `http://${request.headers.host}`);

      let connectionType = url.searchParams.get('type') || 'client';
      let connectionId = url.searchParams.get('id') || uuidv4();

      // Handle path-based routing like Python version: /ws/monitor/id, /ws/worker/id, /ws/client/id
      const pathParts = url.pathname.split('/').filter(part => part.length > 0);
      if (pathParts.length >= 3 && pathParts[0] === 'ws') {
        const pathType = pathParts[1]; // monitor, worker, client
        const pathId = pathParts[2];

        if (['monitor', 'worker', 'client'].includes(pathType)) {
          connectionType = pathType;
          connectionId = pathId;
        }
      }

      logger.info(
        `WebSocket connection: type=${connectionType}, id=${connectionId}, url=${request.url}`
      );
      const authToken =
        url.searchParams.get('auth') ||
        url.searchParams.get('token') ||
        request.headers.authorization;

      // Validate auth token if configured
      if (this.config.authToken && authToken !== this.config.authToken) {
        ws.close(1008, 'Invalid authentication');
        this.connectionCount--;
        return;
      }

      // Create connection wrapper
      const connection = this.createConnectionWrapper(
        ws,
        connectionType as 'worker' | 'client' | 'monitor',
        connectionId
      );

      // Add to connection manager
      if (connectionType === 'worker') {
        await this.connectionManager.addWorkerConnection(connectionId, connection);
        logger.info(`Worker ${connectionId} connected via WebSocket`);
      } else {
        // Both 'client' and 'monitor' are treated as clients, but type is preserved
        await this.connectionManager.addClientConnection(connectionId, connection);
        logger.info(`${connectionType} ${connectionId} connected via WebSocket`);
      }

      // Handle connection close
      ws.on('close', async (code, reason) => {
        this.connectionCount--;
        connection.connected = false;

        if (connectionType === 'worker') {
          await this.connectionManager.removeWorkerConnection(connectionId);
        } else {
          await this.connectionManager.removeClientConnection(connectionId);
        }

        logger.info(`${connectionType} ${connectionId} disconnected: ${code} ${reason}`);
      });

      ws.on('error', error => {
        logger.error(`WebSocket error for ${connectionType} ${connectionId}:`, error);
      });

      // Send welcome message
      const welcomeMessage: BaseMessage = {
        id: uuidv4(),
        type: MessageType.SYSTEM_STATUS,
        timestamp: TimestampUtil.now(),
        data: {
          status: 'connected',
          connection_id: connectionId,
          connection_type: connectionType,
          server_time: TimestampUtil.toISO(TimestampUtil.now()),
        },
      };

      await connection.send(welcomeMessage);
    } catch (error) {
      logger.error('Error handling WebSocket connection:', error);
      ws.close(1011, 'Internal server error');
      this.connectionCount--;
    }
  }

  private createConnectionWrapper(
    ws: WebSocket,
    type: 'worker' | 'client' | 'monitor',
    id: string
  ): WebSocketConnection {
    const connection: WebSocketConnection = {
      id,
      type,
      workerId: type === 'worker' ? id : undefined,
      clientId: type === 'client' || type === 'monitor' ? id : undefined,
      socket: ws,
      connected: true,
      connectedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      messagesSent: 0,
      messagesReceived: 0,
      bytesSent: 0,
      bytesReceived: 0,

      async send(message: BaseMessage): Promise<boolean> {
        if (!this.connected || ws.readyState !== WebSocket.OPEN) {
          return false;
        }

        try {
          const serialized = JSON.stringify(message);
          const sizeBytes = Buffer.byteLength(serialized, 'utf8');

          ws.send(serialized);

          this.messagesSent++;
          this.bytesSent += sizeBytes;
          this.lastActivity = new Date().toISOString();

          return true;
        } catch (error) {
          logger.error(`Failed to send message to ${type} ${id}:`, error);
          return false;
        }
      },

      async ping(): Promise<boolean> {
        if (!this.connected || ws.readyState !== WebSocket.OPEN) {
          return false;
        }

        return new Promise(resolve => {
          const timeout = setTimeout(() => resolve(false), 5000);

          ws.ping();
          ws.once('pong', () => {
            clearTimeout(timeout);
            resolve(true);
          });
        });
      },

      async close(code?: number, reason?: string): Promise<void> {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close(code || 1000, reason || 'Connection closed');
        }
        this.connected = false;
      },

      isAlive(): boolean {
        return this.connected && ws.readyState === WebSocket.OPEN;
      },
    };

    // Set up message handling
    ws.on('message', async (data: Buffer) => {
      try {
        connection.lastActivity = new Date().toISOString();
        connection.messagesReceived++;
        connection.bytesReceived += data.length;

        const message = JSON.parse(data.toString()) as BaseMessage;

        // Handle worker registration specially
        if (message.type === MessageType.REGISTER_WORKER && type === 'worker') {
          await this.handleWorkerRegistration(id, message as WorkerRegistrationMessage);
        }

        // Forward to connection manager for general handling
        // The connection manager will route this to the message handler
        const connectionType = type === 'monitor' ? 'client' : type;
        this.connectionManager.forwardMessage(message, connectionType, id);
      } catch (error) {
        logger.error(`Error processing message from ${type} ${id}:`, error);
      }
    });

    ws.on('pong', () => {
      connection.lastActivity = new Date().toISOString();
    });

    return connection;
  }

  private async handleWorkerRegistration(
    workerId: string,
    message: WorkerRegistrationMessage
  ): Promise<void> {
    try {
      logger.info(`Worker ${workerId} registration received:`, {
        services: message.capabilities.services,
        hardware: message.capabilities.hardware,
      });

      // The actual registration will be handled by the message handler
      // We just log it here for visibility
    } catch (error) {
      logger.error(`Failed to handle worker registration for ${workerId}:`, error);
    }
  }

  private async sendHeartbeats(): Promise<void> {
    if (!this.wss) return;

    const heartbeatMessage: BaseMessage = {
      id: uuidv4(),
      type: MessageType.SYSTEM_STATUS,
      timestamp: TimestampUtil.now(),
      data: {
        type: 'heartbeat',
        server_time: TimestampUtil.toISO(TimestampUtil.now()),
      },
    };

    let sentCount = 0;
    let failedCount = 0;

    for (const ws of this.wss.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(heartbeatMessage));
          sentCount++;
        } catch (error) {
          failedCount++;
          logger.debug('Failed to send heartbeat to client:', error);
        }
      }
    }

    if (sentCount > 0) {
      logger.debug(`Sent heartbeat to ${sentCount} clients (${failedCount} failed)`);
    }
  }

  // Statistics and monitoring
  getConnectionCount(): number {
    return this.connectionCount;
  }

  getActiveConnections(): number {
    return this.wss ? this.wss.clients.size : 0;
  }

  getServerInfo() {
    return {
      running: this.isRunningFlag,
      port: this.config.port,
      host: this.config.host,
      total_connections: this.connectionCount,
      active_connections: this.getActiveConnections(),
      max_connections: this.config.maxConnections,
      heartbeat_enabled: this.config.enableHeartbeat,
      compression_enabled: this.config.enableCompression,
    };
  }
}
