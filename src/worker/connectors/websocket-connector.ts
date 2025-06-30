// WebSocket Connector - base class for WebSocket-based service connections
// Direct port from Python worker/connectors/websocket_connector.py

import { WebSocket } from 'ws';
import {
  ConnectorInterface,
  JobData,
  JobResult,
  ProgressCallback,
  WebSocketConnectorConfig,
} from '../../core/types/connector.js';
import { logger } from '../../core/utils/logger.js';

export class WebSocketConnector implements ConnectorInterface {
  connector_id: string;
  service_type = 'websocket' as const;
  version = '1.0.0';
  protected config: WebSocketConnectorConfig;
  protected websocket: WebSocket | null = null;
  protected isConnected = false;
  protected reconnectAttempts = 0;
  protected maxReconnectAttempts = 5;

  constructor(connectorId: string) {
    this.connector_id = connectorId;

    // Basic WebSocket configuration
    this.config = {
      connector_id: this.connector_id,
      service_type: this.service_type as 'websocket',
      base_url: process.env.WORKER_WEBSOCKET_BASE_URL || 'ws://localhost:8080',
      timeout_seconds: parseInt(process.env.WORKER_WEBSOCKET_TIMEOUT_SECONDS || '60'),
      retry_attempts: parseInt(process.env.WORKER_WEBSOCKET_RETRY_ATTEMPTS || '3'),
      retry_delay_seconds: parseInt(process.env.WORKER_WEBSOCKET_RETRY_DELAY_SECONDS || '2'),
      health_check_interval_seconds: 30,
      max_concurrent_jobs: parseInt(process.env.WORKER_WEBSOCKET_MAX_CONCURRENT_JOBS || '5'),
      settings: {
        websocket_url: process.env.WORKER_WEBSOCKET_URL || 'ws://localhost:8080/ws',
        protocol: process.env.WORKER_WEBSOCKET_PROTOCOL,
        heartbeat_interval_ms: parseInt(
          process.env.WORKER_WEBSOCKET_HEARTBEAT_INTERVAL_MS || '30000'
        ),
        reconnect_delay_ms: parseInt(process.env.WORKER_WEBSOCKET_RECONNECT_DELAY_MS || '5000'),
        max_reconnect_attempts: parseInt(
          process.env.WORKER_WEBSOCKET_MAX_RECONNECT_ATTEMPTS || '5'
        ),
      },
    };
  }

  async initialize(): Promise<void> {
    logger.info(
      `Initializing WebSocket connector ${this.connector_id} to ${this.config.settings.websocket_url}`
    );

    await this.connectWebSocket();

    logger.info(`WebSocket connector ${this.connector_id} initialized successfully`);
  }

  async cleanup(): Promise<void> {
    logger.info(`Cleaning up WebSocket connector ${this.connector_id}`);

    if (this.websocket) {
      this.websocket.close(1000, 'Connector cleanup');
      this.websocket = null;
    }

    this.isConnected = false;
  }

  async checkHealth(): Promise<boolean> {
    return this.isConnected && this.websocket?.readyState === WebSocket.OPEN;
  }

  async getAvailableModels(): Promise<string[]> {
    // Base WebSocket connector is generic
    return ['websocket-generic'];
  }

  async getServiceInfo(): Promise<Record<string, unknown>> {
    return {
      service_name: 'WebSocket Service',
      service_version: this.version,
      base_url: this.config.settings.websocket_url,
      status: this.isConnected ? 'connected' : 'disconnected',
      capabilities: {
        supported_formats: ['json', 'text', 'binary'],
        supported_models: await this.getAvailableModels(),
        features: ['real_time_communication', 'bidirectional', 'auto_reconnect'],
        concurrent_jobs: this.config.max_concurrent_jobs,
      },
      connection_info: {
        protocol: this.config.settings.protocol,
        heartbeat_interval_ms: this.config.settings.heartbeat_interval_ms,
        reconnect_attempts: this.reconnectAttempts,
        max_reconnect_attempts: this.config.settings.max_reconnect_attempts,
      },
    };
  }

  async canProcessJob(jobData: JobData): Promise<boolean> {
    return (
      jobData.type === 'websocket' ||
      jobData.type === this.service_type ||
      jobData.payload?.websocket === true
    );
  }

  async processJob(jobData: JobData, progressCallback: ProgressCallback): Promise<JobResult> {
    const startTime = Date.now();
    logger.info(`Starting WebSocket job ${jobData.id}`);

    try {
      // Ensure connection is active
      if (!this.isConnected) {
        await this.connectWebSocket();
      }

      // Report initial progress
      await progressCallback({
        job_id: jobData.id,
        progress: 10,
        message: 'Sending message via WebSocket',
        current_step: 'Sending message',
      });

      // Send the job data via WebSocket
      const result = await this.sendWebSocketMessage(jobData, progressCallback);

      const processingTime = Date.now() - startTime;

      // Final progress update
      await progressCallback({
        job_id: jobData.id,
        progress: 100,
        message: 'WebSocket communication completed',
        current_step: 'Finished',
      });

      logger.info(`WebSocket job ${jobData.id} completed in ${processingTime}ms`);

      return {
        success: true,
        data: result,
        processing_time_ms: processingTime,
        service_metadata: {
          service_version: this.version,
          processing_stats: {
            websocket_url: this.config.settings.websocket_url,
            connection_state: this.websocket?.readyState,
            message_size: JSON.stringify(jobData.payload).length,
          },
        },
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error(`WebSocket job ${jobData.id} failed:`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket communication failed',
        processing_time_ms: processingTime,
        service_metadata: {
          service_version: this.version,
        },
      };
    }
  }

  async cancelJob(jobId: string): Promise<void> {
    logger.info(`Cancelling WebSocket job ${jobId}`);

    // Send cancellation message if connected
    if (this.isConnected && this.websocket) {
      try {
        const cancelMessage = {
          type: 'cancel',
          job_id: jobId,
          timestamp: new Date().toISOString(),
        };

        this.websocket.send(JSON.stringify(cancelMessage));
        logger.info(`Sent cancellation message for job ${jobId}`);
      } catch (error) {
        logger.error(`Failed to send cancellation for job ${jobId}:`, error);
      }
    }
  }

  protected async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const wsUrl = this.config.settings.websocket_url;
        if (!wsUrl) {
          reject(new Error('WebSocket URL not configured'));
          return;
        }
        const protocol = this.config.settings.protocol;

        this.websocket = new WebSocket(wsUrl, protocol ? [protocol] : undefined);

        this.websocket.on('open', () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          logger.info(`WebSocket connected to ${wsUrl}`);
          resolve();
        });

        this.websocket.on('message', (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleWebSocketMessage(message);
          } catch (error) {
            logger.error('Failed to parse WebSocket message:', error);
          }
        });

        this.websocket.on('close', (code, reason) => {
          this.isConnected = false;
          logger.warn(`WebSocket disconnected: ${code} ${reason}`);

          // Attempt reconnection if not intentionally closed
          if (code !== 1000) {
            this.attemptReconnection();
          }
        });

        this.websocket.on('error', error => {
          logger.error('WebSocket error:', error);
          this.isConnected = false;
          reject(error);
        });

        // Setup heartbeat if configured
        if (this.config.settings.heartbeat_interval_ms) {
          this.setupHeartbeat();
        }

        // Connection timeout
        setTimeout(() => {
          if (!this.isConnected) {
            reject(new Error('WebSocket connection timeout'));
          }
        }, 10000);
      } catch (error) {
        reject(error);
      }
    });
  }

  protected async sendWebSocketMessage(
    jobData: JobData,
    progressCallback: ProgressCallback
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (!this.websocket || !this.isConnected) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      // Create message with job data
      const message = {
        type: 'job',
        id: jobData.id,
        payload: jobData.payload,
        timestamp: new Date().toISOString(),
      };

      // Set up response handler
      const responseTimeout = setTimeout(() => {
        reject(new Error(`WebSocket job ${jobData.id} response timeout`));
      }, this.config.timeout_seconds * 1000);

      // Listen for response
      const responseHandler = (data: Buffer) => {
        try {
          const response = JSON.parse(data.toString());

          if (response.job_id === jobData.id) {
            clearTimeout(responseTimeout);
            this.websocket?.removeListener('message', responseHandler);

            if (response.type === 'job_result') {
              resolve(response.result);
            } else if (response.type === 'job_error') {
              reject(new Error(response.error));
            } else if (response.type === 'job_progress') {
              // Update progress and continue listening
              progressCallback({
                job_id: jobData.id,
                progress: response.progress || 50,
                message: response.message || 'Processing...',
                current_step: response.step,
              }).catch(error => {
                logger.error('Failed to update progress:', error);
              });
            }
          }
        } catch (error) {
          logger.error('Failed to parse WebSocket response:', error);
        }
      };

      this.websocket.on('message', responseHandler);

      // Send the message
      try {
        this.websocket.send(JSON.stringify(message));
        logger.debug(`Sent WebSocket message for job ${jobData.id}`);
      } catch (error) {
        clearTimeout(responseTimeout);
        this.websocket.removeListener('message', responseHandler);
        reject(error);
      }
    });
  }

  protected handleWebSocketMessage(message): void {
    // Base implementation - can be overridden by subclasses
    logger.debug(`Received WebSocket message: ${message.type}`);

    switch (message.type) {
      case 'ping':
        // Respond to ping with pong
        if (this.websocket) {
          this.websocket.send(
            JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() })
          );
        }
        break;
      case 'pong':
        // Heartbeat response received
        logger.debug('Heartbeat pong received');
        break;
      default:
        logger.debug(`Unhandled WebSocket message type: ${message.type}`);
    }
  }

  protected setupHeartbeat(): void {
    const interval = this.config.settings.heartbeat_interval_ms || 30000;

    setInterval(() => {
      if (this.isConnected && this.websocket) {
        try {
          const pingMessage = {
            type: 'ping',
            timestamp: new Date().toISOString(),
          };
          this.websocket.send(JSON.stringify(pingMessage));
        } catch (error) {
          logger.error('Failed to send heartbeat ping:', error);
        }
      }
    }, interval);
  }

  protected async attemptReconnection(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay =
      (this.config.settings.reconnect_delay_ms || 5000) * Math.pow(2, this.reconnectAttempts - 1);

    logger.info(
      `Attempting WebSocket reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`
    );

    setTimeout(async () => {
      try {
        await this.connectWebSocket();
        logger.info('WebSocket reconnected successfully');
      } catch (error) {
        logger.error(`Reconnection attempt ${this.reconnectAttempts} failed:`, error);
        this.attemptReconnection();
      }
    }, delay);
  }

  async updateConfiguration(config: WebSocketConnectorConfig): Promise<void> {
    const oldUrl = this.config.settings.websocket_url;
    this.config = { ...this.config, ...config };

    // Reconnect if URL changed
    if (config.settings?.websocket_url && config.settings.websocket_url !== oldUrl) {
      await this.cleanup();
      await this.connectWebSocket();
    }

    logger.info(`Updated configuration for WebSocket connector ${this.connector_id}`);
  }

  getConfiguration(): WebSocketConnectorConfig {
    return { ...this.config };
  }
}
