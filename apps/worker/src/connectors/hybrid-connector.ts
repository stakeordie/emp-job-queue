// HybridConnector - Base class for services using both HTTP REST and WebSocket connections
// Combines REST and WebSocket functionality for services like ComfyUI

import {
  JobData,
  JobResult,
  ProgressCallback,
  ServiceInfo,
  ConnectorConfig,
  logger,
} from '@emp/core';
import { BaseConnector } from './base-connector.js';
import WebSocket from 'ws';

export interface HybridConnectorConfig extends ConnectorConfig {
  settings: {
    // HTTP settings
    http_base_url?: string;
    headers?: Record<string, string>;
    body_format?: 'json' | 'form' | 'multipart';

    // WebSocket settings
    websocket_url: string;
    protocol?: string;
    heartbeat_interval_ms?: number;
    reconnect_delay_ms?: number;
    max_reconnect_attempts?: number;
    message_timeout_ms?: number;
    ping_interval_ms?: number;

    // Hybrid-specific settings
    use_http_for_submission?: boolean; // Submit jobs via HTTP
    use_websocket_for_progress?: boolean; // Monitor progress via WebSocket
    use_websocket_for_results?: boolean; // Get results via WebSocket
  };
}

export interface HybridMessage {
  id?: string;
  type: string;
  data?: unknown;
  error?: string;
  timestamp?: number;
}

export abstract class HybridConnector extends BaseConnector {
  protected hybridConfig: HybridConnectorConfig;

  // WebSocket connection
  protected ws?: WebSocket;
  protected isWebSocketConnected: boolean = false;
  protected reconnectAttempts: number = 0;
  protected reconnectTimeout?: NodeJS.Timeout;
  protected heartbeatInterval?: NodeJS.Timeout;
  protected pingInterval?: NodeJS.Timeout;

  // HTTP client settings
  protected httpBaseUrl: string;
  protected httpHeaders: Record<string, string> = {};

  // Job tracking
  protected pendingJobs = new Map<
    string,
    {
      jobData: JobData;
      progressCallback: ProgressCallback;
      resolve: (result: JobResult) => void;
      reject: (error: Error) => void;
      startTime: number;
      submittedViaHttp?: boolean;
    }
  >();

  private messageHandlers = new Map<string, (message: HybridMessage) => void>();

  constructor(connectorId: string, config: Partial<HybridConnectorConfig>) {
    super(connectorId, config);
    this.hybridConfig = this.config as HybridConnectorConfig;

    // Set defaults if not provided
    if (!this.hybridConfig.settings) {
      this.hybridConfig.settings = {
        websocket_url: 'ws://localhost:8188/ws',
        heartbeat_interval_ms: 30000,
        reconnect_delay_ms: 5000,
        max_reconnect_attempts: 5,
        message_timeout_ms: 300000,
        ping_interval_ms: 10000,
        use_http_for_submission: true,
        use_websocket_for_progress: true,
        use_websocket_for_results: true,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body_format: 'json',
      };
    }

    this.httpBaseUrl = this.hybridConfig.settings.http_base_url || this.hybridConfig.base_url;
    this.httpHeaders = { ...this.hybridConfig.settings.headers };
  }

  protected async initializeService(): Promise<void> {
    // Initialize HTTP settings
    this.setupHttpClient();

    // Initialize WebSocket connection if needed
    if (
      this.hybridConfig.settings.use_websocket_for_progress ||
      this.hybridConfig.settings.use_websocket_for_results
    ) {
      await this.connectWebSocket();
    }

    // Test HTTP connection
    try {
      const healthCheck = await this.checkHealth();
      if (!healthCheck) {
        logger.warn(`Hybrid service at ${this.httpBaseUrl} failed initial health check`);
      }
    } catch (error) {
      logger.warn(`Failed to perform initial health check for ${this.connector_id}:`, error);
    }

    logger.info(`Hybrid connector ${this.connector_id} initialized`);
  }

  protected async cleanupService(): Promise<void> {
    // Clear timeouts
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }

    // Fail pending jobs
    for (const [jobId, pendingJob] of this.pendingJobs) {
      pendingJob.reject(new Error('Connector shutting down'));
    }
    this.pendingJobs.clear();

    // Close WebSocket
    await this.disconnectWebSocket();
  }

  async checkHealth(): Promise<boolean> {
    try {
      const healthEndpoint = this.getHealthEndpoint();
      const response = await this.makeHttpRequest('GET', healthEndpoint);
      return response.status >= 200 && response.status < 300;
    } catch (error) {
      logger.debug(`Health check failed for ${this.connector_id}:`, error);
      return false;
    }
  }

  protected async processJobImpl(
    jobData: JobData,
    progressCallback: ProgressCallback
  ): Promise<JobResult> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const jobId = jobData.id;

      // Store job for tracking
      this.pendingJobs.set(jobId, {
        jobData,
        progressCallback,
        resolve,
        reject,
        startTime,
      });

      // Set timeout
      const timeout = setTimeout(() => {
        this.pendingJobs.delete(jobId);
        reject(new Error(`Hybrid job ${jobId} timed out`));
      }, this.hybridConfig.settings.message_timeout_ms || 300000);

      // Override handlers for cleanup
      const originalResolve = resolve;
      const originalReject = reject;

      const wrappedResolve = (result: JobResult) => {
        clearTimeout(timeout);
        this.pendingJobs.delete(jobId);
        originalResolve(result);
      };

      const wrappedReject = (error: Error) => {
        clearTimeout(timeout);
        this.pendingJobs.delete(jobId);
        originalReject(error);
      };

      // Update stored handlers
      const pendingJob = this.pendingJobs.get(jobId);
      if (pendingJob) {
        pendingJob.resolve = wrappedResolve;
        pendingJob.reject = wrappedReject;
      }

      // Submit job
      this.submitJob(jobData).catch(error => {
        wrappedReject(error);
      });
    });
  }

  private async submitJob(jobData: JobData): Promise<void> {
    if (this.hybridConfig.settings.use_http_for_submission) {
      await this.submitJobViaHttp(jobData);
    } else {
      await this.submitJobViaWebSocket(jobData);
    }
  }

  private async submitJobViaHttp(jobData: JobData): Promise<void> {
    try {
      const endpoint = this.getJobSubmissionEndpoint();
      const payload = this.prepareHttpJobPayload(jobData);
      const response = await this.makeHttpRequest('POST', endpoint, payload);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const responseData = await this.parseHttpResponse(response);

      // Mark as submitted via HTTP
      const pendingJob = this.pendingJobs.get(jobData.id);
      if (pendingJob) {
        pendingJob.submittedViaHttp = true;
      }

      // Handle submission response
      await this.handleHttpSubmissionResponse(jobData, responseData);
    } catch (error) {
      const pendingJob = this.pendingJobs.get(jobData.id);
      if (pendingJob) {
        pendingJob.reject(error instanceof Error ? error : new Error('HTTP submission failed'));
      }
    }
  }

  private async submitJobViaWebSocket(jobData: JobData): Promise<void> {
    if (!this.isWebSocketConnected || !this.ws) {
      throw new Error('WebSocket not connected for job submission');
    }

    try {
      const message = this.prepareWebSocketJobMessage(jobData);
      this.sendWebSocketMessage(message);
    } catch (error) {
      const pendingJob = this.pendingJobs.get(jobData.id);
      if (pendingJob) {
        pendingJob.reject(
          error instanceof Error ? error : new Error('WebSocket submission failed')
        );
      }
    }
  }

  async cancelJob(jobId: string): Promise<void> {
    const pendingJob = this.pendingJobs.get(jobId);
    if (!pendingJob) return;

    try {
      if (pendingJob.submittedViaHttp) {
        // Try HTTP cancellation
        const cancelEndpoint = this.getCancelEndpoint(jobId);
        if (cancelEndpoint) {
          await this.makeHttpRequest('DELETE', cancelEndpoint);
        }
      }

      // Try WebSocket cancellation
      if (this.isWebSocketConnected && this.ws) {
        const cancelMessage = this.prepareWebSocketCancelMessage(jobId);
        this.sendWebSocketMessage(cancelMessage);
      }

      logger.info(`Cancelled hybrid job ${jobId}`);
    } catch (error) {
      logger.warn(`Failed to cancel job ${jobId}:`, error);
    }

    // Fail the pending job
    pendingJob.reject(new Error('Job cancelled'));
  }

  // ============================================================================
  // HTTP Methods
  // ============================================================================

  private setupHttpClient(): void {
    // Add authentication headers if configured
    if (this.hybridConfig.auth) {
      this.addAuthHeaders();
    }
  }

  protected async makeHttpRequest(
    method: string,
    endpoint: string,
    data?: unknown
  ): Promise<Response> {
    const url = new URL(endpoint, this.httpBaseUrl);

    const options: RequestInit = {
      method,
      headers: { ...this.httpHeaders },
    };

    // Add body for non-GET requests
    if (data && method !== 'GET') {
      if (this.hybridConfig.settings.body_format === 'json') {
        options.body = JSON.stringify(data);
        (options.headers as Record<string, string>)['Content-Type'] = 'application/json';
      }
    }

    logger.debug(`Making ${method} request to ${url.toString()}`);
    return fetch(url.toString(), options);
  }

  protected async parseHttpResponse(response: Response): Promise<unknown> {
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      return await response.json();
    } else if (contentType.includes('text/')) {
      return await response.text();
    } else {
      return await response.arrayBuffer();
    }
  }

  private addAuthHeaders(): void {
    if (!this.hybridConfig.auth) return;

    switch (this.hybridConfig.auth.type) {
      case 'basic':
        if (this.hybridConfig.auth.username && this.hybridConfig.auth.password) {
          const credentials = btoa(
            `${this.hybridConfig.auth.username}:${this.hybridConfig.auth.password}`
          );
          this.httpHeaders['Authorization'] = `Basic ${credentials}`;
        }
        break;
      case 'bearer':
        if (this.hybridConfig.auth.token) {
          this.httpHeaders['Authorization'] = `Bearer ${this.hybridConfig.auth.token}`;
        }
        break;
      case 'api_key':
        if (this.hybridConfig.auth.api_key) {
          this.httpHeaders['X-API-Key'] = this.hybridConfig.auth.api_key;
        }
        break;
    }
  }

  // ============================================================================
  // Service Health Polling
  // ============================================================================

  private async waitForServiceHealth(): Promise<void> {
    const maxWaitMs = 60000; // 60 seconds max wait
    const pollIntervalMs = 2000; // Check every 2 seconds
    const startTime = Date.now();

    // Update status to indicate we're waiting for service
    await this.reportStatus('waiting_for_service');
    logger.info(
      `Waiting for service health check at ${this.httpBaseUrl} before connecting WebSocket`
    );

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const isHealthy = await this.checkHealth();
        if (isHealthy) {
          logger.info(
            `Service health check passed for ${this.connector_id}, proceeding with WebSocket connection`
          );
          return;
        }
      } catch (error) {
        logger.debug(`Health check attempt failed for ${this.connector_id}:`, error);
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    // If we get here, we timed out waiting for health
    const errorMsg = `Timed out waiting for service health at ${this.httpBaseUrl} after ${maxWaitMs}ms`;
    logger.error(errorMsg);
    await this.reportStatus('error', errorMsg);
    throw new Error(errorMsg);
  }

  // ============================================================================
  // WebSocket Methods
  // ============================================================================

  private async connectWebSocket(): Promise<void> {
    if (this.ws) {
      await this.disconnectWebSocket();
    }

    // First, wait for the service to be healthy before attempting WebSocket connection
    await this.waitForServiceHealth();

    // Update status to connecting now that service is healthy
    await this.reportStatus('connecting');

    return new Promise((resolve, reject) => {
      try {
        const wsUrl = this.hybridConfig.settings.websocket_url;
        const protocol = this.hybridConfig.settings.protocol;

        logger.info(`Connecting to WebSocket: ${wsUrl}`);
        
        // Create WebSocket options with authentication if needed
        const wsOptions: any = {};
        if (protocol) {
          wsOptions.protocol = protocol;
        }
        
        // Add authentication headers if using basic auth
        if (this.hybridConfig.auth?.type === 'basic' && this.hybridConfig.auth.username && this.hybridConfig.auth.password) {
          const credentials = Buffer.from(
            `${this.hybridConfig.auth.username}:${this.hybridConfig.auth.password}`
          ).toString('base64');
          wsOptions.headers = {
            'Authorization': `Basic ${credentials}`
          };
          logger.info(`Adding Basic auth header to WebSocket connection for ${this.connector_id}`);
        } else {
          logger.info(`Connecting to WebSocket without auth for ${this.connector_id}`);
        }
        
        this.ws = new WebSocket(wsUrl, wsOptions);

        this.ws.on('open', async () => {
          logger.info(`Hybrid connector ${this.connector_id} WebSocket connected to ${wsUrl}`);
          this.isWebSocketConnected = true;
          this.reconnectAttempts = 0;
          await this.reportStatus('active'); // Successfully connected
          this.startHeartbeat();
          this.startPing();
          this.setupMessageHandlers();
          this.onWebSocketConnected();
          resolve();
        });

        this.ws.on('message', (data: Buffer) => {
          try {
            const message = this.parseWebSocketMessage(data);
            this.handleWebSocketMessage(message);
          } catch (error) {
            logger.error(`Failed to parse WebSocket message:`, error);
          }
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
          logger.warn(`WebSocket connection closed: ${code} ${reason.toString()}`);
          this.isWebSocketConnected = false;
          this.onWebSocketDisconnected();

          if (this.reconnectAttempts < (this.hybridConfig.settings.max_reconnect_attempts || 5)) {
            this.scheduleWebSocketReconnect();
          } else {
            logger.error(`Max WebSocket reconnection attempts reached for ${this.connector_id}`);
          }
        });

        this.ws.on('error', (error: Error) => {
          logger.error(`WebSocket error for ${this.connector_id}:`, error);
          if (!this.isWebSocketConnected) {
            reject(error);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  private async disconnectWebSocket(): Promise<void> {
    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }
      this.ws = undefined;
    }
    this.isWebSocketConnected = false;
  }

  private scheduleWebSocketReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    const delay = this.hybridConfig.settings.reconnect_delay_ms || 5000;
    logger.info(
      `Scheduling WebSocket reconnection attempt ${this.reconnectAttempts + 1} in ${delay}ms`
    );

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectAttempts++;
      try {
        await this.connectWebSocket();
      } catch (error) {
        logger.error(`WebSocket reconnection attempt ${this.reconnectAttempts} failed:`, error);
      }
    }, delay);
  }

  private setupMessageHandlers(): void {
    this.messageHandlers.set('job_progress', message => this.handleJobProgress(message));
    this.messageHandlers.set('job_complete', message => this.handleJobComplete(message));
    this.messageHandlers.set('job_failed', message => this.handleJobFailed(message));
    this.messageHandlers.set('error', message => this.handleWebSocketError(message));

    // Allow subclasses to add custom handlers
    this.setupCustomMessageHandlers();
  }

  private handleWebSocketMessage(message: HybridMessage): void {
    logger.debug(`Received WebSocket message: ${message.type}`);

    const handler = this.messageHandlers.get(message.type);
    if (handler) {
      handler(message);
    } else {
      this.handleUnknownWebSocketMessage(message);
    }
  }

  private handleJobProgress(message: HybridMessage): void {
    const jobId = this.extractJobIdFromWebSocketMessage(message);
    const pendingJob = this.pendingJobs.get(jobId);

    if (pendingJob) {
      const progress = this.extractProgressFromWebSocketMessage(message);
      pendingJob.progressCallback({
        job_id: pendingJob.jobData.id,
        progress: progress.progress,
        message: progress.message,
        current_step: progress.current_step,
        total_steps: progress.total_steps,
        estimated_completion_ms: progress.estimated_completion_ms,
      });
    }
  }

  private handleJobComplete(message: HybridMessage): void {
    const jobId = this.extractJobIdFromWebSocketMessage(message);
    const pendingJob = this.pendingJobs.get(jobId);

    if (pendingJob) {
      const result = this.extractResultFromWebSocketMessage(message);
      pendingJob.resolve({
        success: true,
        data: result,
        processing_time_ms: Date.now() - pendingJob.startTime,
        service_metadata: {
          service_version: this.version,
        },
      });
    }
  }

  private handleJobFailed(message: HybridMessage): void {
    const jobId = this.extractJobIdFromWebSocketMessage(message);
    const pendingJob = this.pendingJobs.get(jobId);

    if (pendingJob) {
      const error = this.extractErrorFromWebSocketMessage(message);
      pendingJob.reject(new Error(error));
    }
  }

  private handleWebSocketError(message: HybridMessage): void {
    logger.error(`WebSocket error message:`, message);
  }

  protected sendWebSocketMessage(message: HybridMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const messageStr = JSON.stringify(message);
    this.ws.send(messageStr);
    logger.debug(`Sent WebSocket message: ${message.type}`);
  }

  private parseWebSocketMessage(data: Buffer): HybridMessage {
    try {
      return JSON.parse(data.toString()) as HybridMessage;
    } catch (error) {
      throw new Error(`Failed to parse WebSocket message: ${error}`);
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    const interval = this.hybridConfig.settings.heartbeat_interval_ms || 30000;
    this.heartbeatInterval = setInterval(() => {
      if (this.isWebSocketConnected) {
        try {
          const heartbeatMessage = this.prepareWebSocketHeartbeatMessage();
          this.sendWebSocketMessage(heartbeatMessage);
        } catch (error) {
          logger.warn(`Failed to send heartbeat:`, error);
        }
      }
    }, interval);
  }

  private startPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    const interval = this.hybridConfig.settings.ping_interval_ms || 10000;
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, interval);
  }

  // ============================================================================
  // Abstract methods that service-specific connectors must implement
  // ============================================================================

  // HTTP-related abstracts
  protected abstract getHealthEndpoint(): string;
  protected abstract getJobSubmissionEndpoint(): string;
  protected abstract getCancelEndpoint(jobId: string): string | null;
  protected abstract prepareHttpJobPayload(jobData: JobData): unknown;
  protected abstract handleHttpSubmissionResponse(
    jobData: JobData,
    responseData: unknown
  ): Promise<void>;

  // WebSocket-related abstracts
  protected abstract setupCustomMessageHandlers(): void;
  protected abstract prepareWebSocketJobMessage(jobData: JobData): HybridMessage;
  protected abstract prepareWebSocketCancelMessage(jobId: string): HybridMessage;
  protected abstract prepareWebSocketHeartbeatMessage(): HybridMessage;
  protected abstract extractJobIdFromWebSocketMessage(message: HybridMessage): string;
  protected abstract extractProgressFromWebSocketMessage(message: HybridMessage): {
    progress: number;
    message?: string;
    current_step?: string;
    total_steps?: number;
    estimated_completion_ms?: number;
  };
  protected abstract extractResultFromWebSocketMessage(message: HybridMessage): unknown;
  protected abstract extractErrorFromWebSocketMessage(message: HybridMessage): string;
  protected abstract handleUnknownWebSocketMessage(message: HybridMessage): void;
  protected abstract onWebSocketConnected(): void;
  protected abstract onWebSocketDisconnected(): void;
}
