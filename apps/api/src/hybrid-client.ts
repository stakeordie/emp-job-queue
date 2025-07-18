// Hybrid Client - Phase 1C Implementation
// Client library supporting both legacy WebSocket and modern HTTP+SSE APIs

import { EventEmitter } from 'events';
import { WebSocket } from 'ws';
import fetch from 'node-fetch';
import EventSource from 'eventsource';
import { Job, logger } from '@emp/core';

export interface HybridClientConfig {
  baseUrl: string; // http://localhost:3001
  mode?: 'websocket' | 'http' | 'auto'; // auto = try HTTP first, fallback to WebSocket
  reconnectAttempts?: number;
  reconnectDelayMs?: number;
}

export interface JobSubmissionResult {
  success: boolean;
  job_id?: string;
  error?: string;
}

export interface ProgressEvent {
  job_id: string;
  progress: number;
  status?: string;
  message?: string;
  worker_id?: string;
  timestamp: string;
}

export class HybridClient extends EventEmitter {
  private config: HybridClientConfig;
  private websocket?: WebSocket;
  private isConnected = false;
  private reconnectAttempts = 0;
  private eventSources = new Map<string, EventSource>();
  private messageId = 0;

  constructor(config: HybridClientConfig) {
    super();
    this.config = {
      mode: 'auto',
      reconnectAttempts: 5,
      reconnectDelayMs: 5000,
      ...config,
    };
  }

  async connect(): Promise<void> {
    switch (this.config.mode) {
      case 'websocket':
        await this.connectWebSocket();
        break;
      case 'http':
        // HTTP mode doesn't need persistent connection
        this.isConnected = true;
        this.emit('connected');
        break;
      case 'auto':
        try {
          // Test HTTP endpoint first
          const response = await fetch(`${this.config.baseUrl}/health`);
          if (response.ok) {
            this.isConnected = true;
            this.emit('connected');
            logger.info('HybridClient connected in HTTP mode');
          } else {
            throw new Error('HTTP health check failed');
          }
        } catch (error) {
          logger.warn('HTTP connection failed, falling back to WebSocket:', error);
          await this.connectWebSocket();
        }
        break;
    }
  }

  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = this.config.baseUrl.replace(/^http/, 'ws');
      this.websocket = new WebSocket(wsUrl);

      this.websocket.on('open', () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.emit('connected');
        logger.info('HybridClient connected in WebSocket mode');
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
        this.emit('disconnected', { code, reason: reason.toString() });
        logger.warn(`WebSocket disconnected: ${code} ${reason}`);

        if (this.reconnectAttempts < this.config.reconnectAttempts!) {
          this.attemptReconnect();
        }
      });

      this.websocket.on('error', error => {
        logger.error('WebSocket error:', error);
        reject(error);
      });

      // Connection timeout
      setTimeout(() => {
        if (!this.isConnected) {
          reject(new Error('WebSocket connection timeout'));
        }
      }, 10000);
    });
  }

  private async attemptReconnect(): Promise<void> {
    this.reconnectAttempts++;
    logger.info(
      `Attempting reconnection ${this.reconnectAttempts}/${this.config.reconnectAttempts}`
    );

    await new Promise(resolve => setTimeout(resolve, this.config.reconnectDelayMs));

    try {
      await this.connectWebSocket();
      this.emit('reconnected');
    } catch (error) {
      logger.error(`Reconnection attempt ${this.reconnectAttempts} failed:`, error);
      if (this.reconnectAttempts < this.config.reconnectAttempts!) {
        this.attemptReconnect();
      } else {
        this.emit('failed', new Error('Max reconnection attempts reached'));
      }
    }
  }

  private handleWebSocketMessage(message): void {
    switch (message.type) {
      case 'connected':
        logger.debug('WebSocket connection confirmed');
        break;
      case 'job_submitted':
        this.emit('job_submitted', {
          success: true,
          job_id: message.job_id,
          message_id: message.message_id,
        });
        break;
      case 'progress':
        this.emit('progress', {
          job_id: message.job_id,
          progress: parseFloat(message.data.progress || '0'),
          status: message.data.status,
          message: message.data.message,
          worker_id: message.data.worker_id,
          timestamp: message.timestamp,
        } as ProgressEvent);
        break;
      case 'job_status':
        this.emit('job_status', message.job);
        break;
      case 'error':
        this.emit('error', new Error(message.error));
        break;
      default:
        logger.debug(`Unhandled WebSocket message type: ${message.type}`);
    }
  }

  async submitJob(jobData: Record<string, unknown>): Promise<JobSubmissionResult> {
    if (this.config.mode === 'websocket' || (this.config.mode === 'auto' && this.websocket)) {
      return this.submitJobWebSocket(jobData);
    } else {
      return this.submitJobHTTP(jobData);
    }
  }

  private async submitJobHTTP(jobData: Record<string, unknown>): Promise<JobSubmissionResult> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(jobData),
      });

      const result = (await response.json()) as { job_id?: string; error?: string };

      if (response.ok) {
        return {
          success: true,
          job_id: result.job_id,
        };
      } else {
        return {
          success: false,
          error: result.error || 'Job submission failed',
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  private async submitJobWebSocket(jobData: Record<string, unknown>): Promise<JobSubmissionResult> {
    if (!this.websocket || !this.isConnected) {
      throw new Error('WebSocket not connected');
    }

    return new Promise(resolve => {
      const messageId = ++this.messageId;

      const handler = (result: JobSubmissionResult & { message_id?: number }) => {
        if (result.message_id === messageId) {
          this.removeListener('job_submitted', handler);
          this.removeListener('error', errorHandler);
          resolve(result);
        }
      };

      const errorHandler = (_error: Error) => {
        this.removeListener('job_submitted', handler);
        this.removeListener('error', errorHandler);
        resolve({
          success: false,
          error: _error.message,
        });
      };

      this.on('job_submitted', handler);
      this.on('error', errorHandler);

      this.websocket!.send(
        JSON.stringify({
          id: messageId,
          type: 'submit_job',
          data: jobData,
        })
      );

      // Timeout after 30 seconds
      setTimeout(() => {
        this.removeListener('job_submitted', handler);
        this.removeListener('error', errorHandler);
        resolve({
          success: false,
          error: 'Job submission timeout',
        });
      }, 30000);
    });
  }

  async getJobStatus(jobId: string): Promise<Job | null> {
    if (this.config.mode === 'websocket' || (this.config.mode === 'auto' && this.websocket)) {
      return this.getJobStatusWebSocket(jobId);
    } else {
      return this.getJobStatusHTTP(jobId);
    }
  }

  private async getJobStatusHTTP(jobId: string): Promise<Job | null> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/jobs/${jobId}`);
      const result = (await response.json()) as { job?: Job; error?: string };

      if (response.ok) {
        return result.job || null;
      } else if (response.status === 404) {
        return null;
      } else {
        throw new Error(result.error || 'Failed to get job status');
      }
    } catch (error) {
      logger.error(`Failed to get job status for ${jobId}:`, error);
      return null;
    }
  }

  private async getJobStatusWebSocket(jobId: string): Promise<Job | null> {
    if (!this.websocket || !this.isConnected) {
      throw new Error('WebSocket not connected');
    }

    return new Promise(resolve => {
      const messageId = ++this.messageId;

      const handler = (job: Job) => {
        this.removeListener('job_status', handler);
        this.removeListener('error', errorHandler);
        resolve(job);
      };

      const errorHandler = (_error: Error) => {
        this.removeListener('job_status', handler);
        this.removeListener('error', errorHandler);
        resolve(null);
      };

      this.on('job_status', handler);
      this.on('error', errorHandler);

      this.websocket!.send(
        JSON.stringify({
          id: messageId,
          type: 'get_job_status',
          job_id: jobId,
        })
      );

      // Timeout after 10 seconds
      setTimeout(() => {
        this.removeListener('job_status', handler);
        this.removeListener('error', errorHandler);
        resolve(null);
      }, 10000);
    });
  }

  subscribeToProgress(jobId: string): void {
    if (this.config.mode === 'websocket' || (this.config.mode === 'auto' && this.websocket)) {
      this.subscribeToProgressWebSocket(jobId);
    } else {
      this.subscribeToProgressSSE(jobId);
    }
  }

  private subscribeToProgressWebSocket(jobId: string): void {
    if (!this.websocket || !this.isConnected) {
      throw new Error('WebSocket not connected');
    }

    this.websocket.send(
      JSON.stringify({
        id: ++this.messageId,
        type: 'subscribe_progress',
        job_id: jobId,
      })
    );
  }

  private subscribeToProgressSSE(jobId: string): void {
    if (this.eventSources.has(jobId)) {
      return; // Already subscribed
    }

    const eventSource = new EventSource(`${this.config.baseUrl}/api/jobs/${jobId}/progress`);

    eventSource.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'progress') {
          this.emit('progress', {
            job_id: data.job_id,
            progress: parseFloat(data.data.progress || '0'),
            status: data.data.status,
            message: data.data.message,
            worker_id: data.data.worker_id,
            timestamp: data.timestamp,
          } as ProgressEvent);
        }
      } catch (error) {
        logger.error('Failed to parse SSE progress event:', error);
      }
    };

    eventSource.onerror = _error => {
      logger.error(`SSE connection error for job ${jobId}`);
      this.eventSources.delete(jobId);
    };

    this.eventSources.set(jobId, eventSource);
    logger.debug(`Subscribed to SSE progress for job ${jobId}`);
  }

  unsubscribeFromProgress(jobId: string): void {
    if (this.config.mode === 'websocket' || (this.config.mode === 'auto' && this.websocket)) {
      this.unsubscribeFromProgressWebSocket(jobId);
    } else {
      this.unsubscribeFromProgressSSE(jobId);
    }
  }

  private unsubscribeFromProgressWebSocket(jobId: string): void {
    if (!this.websocket || !this.isConnected) {
      return;
    }

    this.websocket.send(
      JSON.stringify({
        id: ++this.messageId,
        type: 'unsubscribe_progress',
        job_id: jobId,
      })
    );
  }

  private unsubscribeFromProgressSSE(jobId: string): void {
    const eventSource = this.eventSources.get(jobId);
    if (eventSource) {
      eventSource.close();
      this.eventSources.delete(jobId);
      logger.debug(`Unsubscribed from SSE progress for job ${jobId}`);
    }
  }

  async disconnect(): Promise<void> {
    // Close all SSE connections
    for (const [_jobId, eventSource] of this.eventSources) {
      eventSource.close();
    }
    this.eventSources.clear();

    // Close WebSocket if connected
    if (this.websocket) {
      this.websocket.close(1000, 'Client disconnect');
      this.websocket = undefined;
    }

    this.isConnected = false;
    this.emit('disconnected', { code: 1000, reason: 'Client disconnect' });
    logger.info('HybridClient disconnected');
  }

  isConnectedToServer(): boolean {
    return this.isConnected;
  }

  getConnectionMode(): string {
    if (this.websocket && this.isConnected) {
      return 'websocket';
    } else if (this.isConnected) {
      return 'http';
    } else {
      return 'disconnected';
    }
  }
}
