// Worker Client - handles communication with Hub service
// Direct port from Python worker WebSocket client functionality

import { WebSocket } from 'ws';
import { RedisService } from '../core/redis-service.js';
import { TimestampUtil } from '../core/utils/timestamp.js';
import {
  BaseMessage,
  MessageType,
  WorkerRegistrationMessage,
  WorkerHeartbeatMessage,
  JobProgressMessage,
  CompleteJobMessage,
  FailJobMessage,
  WorkerStatus,
  SystemInfo,
} from '../core/types/messages.js';
import { WorkerCapabilities } from '../core/types/worker.js';
import { Job, JobProgress } from '../core/types/job.js';
import { logger } from '../core/utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export class WorkerClient {
  private redisService: RedisService;
  private websocket: WebSocket | null = null;
  private workerId: string;
  private hubRedisUrl: string;
  private hubWsUrl: string;
  private isConnectedFlag = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelayMs = 5000;
  private messageCallbacks: ((message: BaseMessage) => void)[] = [];
  private disconnectedCallbacks: (() => void)[] = [];
  private reconnectedCallbacks: (() => void)[] = [];

  constructor(hubRedisUrl: string, hubWsUrl: string, workerId: string) {
    this.hubRedisUrl = hubRedisUrl;
    this.hubWsUrl = hubWsUrl;
    this.workerId = workerId;
    this.redisService = new RedisService(hubRedisUrl);
  }

  async connect(): Promise<void> {
    try {
      // Connect to Redis first
      await this.redisService.connect();
      logger.info('Connected to Redis');

      // Connect to WebSocket for real-time communication
      await this.connectWebSocket();

      this.isConnectedFlag = true;
      this.reconnectAttempts = 0;

      logger.info(`Worker client ${this.workerId} connected to hub`);
    } catch (error) {
      logger.error('Failed to connect to hub:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.isConnectedFlag = false;

    if (this.websocket) {
      this.websocket.close(1000, 'Worker disconnecting');
      this.websocket = null;
    }

    await this.redisService.disconnect();
    logger.info(`Worker client ${this.workerId} disconnected from hub`);
  }

  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Build WebSocket URL with worker ID and auth token
        const wsUrl = new URL(this.hubWsUrl);
        wsUrl.searchParams.set('type', 'worker');
        wsUrl.searchParams.set('id', this.workerId);

        const authToken = process.env.WORKER_WEBSOCKET_AUTH_TOKEN;
        if (authToken) {
          wsUrl.searchParams.set('auth', authToken);
        }

        this.websocket = new WebSocket(wsUrl.toString(), {
          perMessageDeflate: true,
        });

        this.websocket.on('open', () => {
          logger.info(`WebSocket connected to ${wsUrl.toString()}`);
          resolve();
        });

        this.websocket.on('message', (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString()) as BaseMessage;
            this.handleMessage(message);
          } catch (error) {
            logger.error('Failed to parse WebSocket message:', error);
          }
        });

        this.websocket.on('close', (code, reason) => {
          logger.warn(`WebSocket disconnected: ${code} ${reason}`);
          this.websocket = null;

          if (this.isConnectedFlag) {
            this.handleDisconnection();
          }
        });

        this.websocket.on('error', error => {
          logger.error('WebSocket error:', error);
          reject(error);
        });

        // Connection timeout
        setTimeout(() => {
          if (this.websocket?.readyState !== WebSocket.OPEN) {
            reject(new Error('WebSocket connection timeout'));
          }
        }, 10000);
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleMessage(message: BaseMessage): void {
    logger.debug(`Received message: ${message.type}`);

    // Notify all listeners
    this.messageCallbacks.forEach(callback => {
      try {
        callback(message);
      } catch (error) {
        logger.error('Error in message callback:', error);
      }
    });
  }

  private async handleDisconnection(): Promise<void> {
    // Notify listeners
    this.disconnectedCallbacks.forEach(callback => {
      try {
        callback();
      } catch (error) {
        logger.error('Error in disconnection callback:', error);
      }
    });

    // Attempt reconnection
    await this.attemptReconnection();
  }

  private async attemptReconnection(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached, giving up');
      return;
    }

    this.reconnectAttempts++;
    logger.info(
      `Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`
    );

    await new Promise(resolve => setTimeout(resolve, this.reconnectDelayMs));

    try {
      await this.connectWebSocket();

      // Notify listeners of successful reconnection
      this.reconnectedCallbacks.forEach(callback => {
        try {
          callback();
        } catch (error) {
          logger.error('Error in reconnection callback:', error);
        }
      });

      logger.info('Successfully reconnected to hub');
    } catch (error) {
      logger.error(`Reconnection attempt ${this.reconnectAttempts} failed:`, error);

      // Try again with exponential backoff
      this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, 60000);
      await this.attemptReconnection();
    }
  }

  // Worker registration
  async registerWorker(capabilities: WorkerCapabilities): Promise<void> {
    const message: WorkerRegistrationMessage = {
      id: uuidv4(),
      type: MessageType.REGISTER_WORKER,
      timestamp: TimestampUtil.now(),
      worker_id: this.workerId,
      capabilities,
      connectors: capabilities.services,
    };

    await this.sendMessage(message);

    // Also register via Redis for persistence
    await this.redisService.registerWorker(capabilities);
  }

  // Job operations
  async requestJob(capabilities: WorkerCapabilities): Promise<Job | null> {
    // Use Redis pull-based job selection (hybrid approach)
    return await this.redisService.getNextJob(capabilities);
  }

  async reportProgress(jobId: string, progress: JobProgress): Promise<void> {
    const message: JobProgressMessage = {
      id: uuidv4(),
      type: MessageType.UPDATE_JOB_PROGRESS,
      timestamp: TimestampUtil.now(),
      job_id: jobId,
      worker_id: this.workerId,
      progress: progress.progress,
      status: progress.status,
      message: progress.message,
      estimated_completion: progress.estimated_completion,
    };

    await this.sendMessage(message);

    // Also update Redis
    await this.redisService.updateJobProgress(jobId, progress);
  }

  async completeJob(jobId: string, result): Promise<void> {
    const message: CompleteJobMessage = {
      id: uuidv4(),
      type: MessageType.COMPLETE_JOB,
      timestamp: TimestampUtil.now(),
      job_id: jobId,
      result,
    };

    await this.sendMessage(message);
  }

  async failJob(jobId: string, error: string, retry: boolean): Promise<void> {
    const message: FailJobMessage = {
      id: uuidv4(),
      type: MessageType.FAIL_JOB,
      timestamp: TimestampUtil.now(),
      job_id: jobId,
      worker_id: this.workerId,
      error,
      retry,
    };

    await this.sendMessage(message);
  }

  // Worker status
  async sendHeartbeat(status: WorkerStatus, systemInfo: SystemInfo): Promise<void> {
    const message: WorkerHeartbeatMessage = {
      id: uuidv4(),
      type: MessageType.WORKER_HEARTBEAT,
      timestamp: TimestampUtil.now(),
      worker_id: this.workerId,
      status,
      system_info: systemInfo,
    };

    await this.sendMessage(message);

    // Also update Redis heartbeat
    await this.redisService.updateWorkerHeartbeat(this.workerId, systemInfo);
  }

  // Message sending
  private async sendMessage(message: BaseMessage): Promise<void> {
    if (this.websocket?.readyState === WebSocket.OPEN) {
      // Send via WebSocket for immediate delivery
      try {
        this.websocket.send(JSON.stringify(message));
        logger.debug(`Sent WebSocket message: ${message.type}`);
      } catch (error) {
        logger.error('Failed to send WebSocket message:', error);
        // Fall back to Redis if WebSocket fails
        await this.sendMessageViaRedis(message);
      }
    } else {
      // Fall back to Redis pub/sub
      await this.sendMessageViaRedis(message);
    }
  }

  private async sendMessageViaRedis(message: BaseMessage): Promise<void> {
    try {
      await this.redisService.publishMessage('worker_messages', message);
      logger.debug(`Sent Redis message: ${message.type}`);
    } catch (error) {
      logger.error('Failed to send message via Redis:', error);
      throw error;
    }
  }

  // Event listeners
  onMessage(callback: (message: BaseMessage) => void): void {
    this.messageCallbacks.push(callback);
  }

  onDisconnected(callback: () => void): void {
    this.disconnectedCallbacks.push(callback);
  }

  onReconnected(callback: () => void): void {
    this.reconnectedCallbacks.push(callback);
  }

  // Status
  isConnected(): boolean {
    return (
      this.isConnectedFlag &&
      this.redisService.isConnected() &&
      (this.websocket?.readyState === WebSocket.OPEN || false)
    );
  }

  getConnectionInfo() {
    return {
      worker_id: this.workerId,
      redis_connected: this.redisService.isConnected(),
      websocket_connected: this.websocket?.readyState === WebSocket.OPEN,
      reconnect_attempts: this.reconnectAttempts,
      hub_redis_url: this.hubRedisUrl,
      hub_ws_url: this.hubWsUrl,
    };
  }
}
