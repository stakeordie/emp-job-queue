// ComfyUI WebSocket Connector - Pure WebSocket implementation for ComfyUI fork
// Uses stakeordie/ComfyUI fork with native WebSocket job submission and progress

import { JobData, JobResult, ProgressCallback, ServiceInfo, logger } from '@emp/core';
import { BaseConnector, HealthCheckCapabilities, ServiceJobStatus } from './base-connector.js';
import { WebSocket } from 'ws';

interface AuthConfig {
  type: 'basic' | 'bearer';
  username?: string;
  password?: string;
  token?: string;
}

export class ComfyUIWebSocketConnector extends BaseConnector {
  service_type = 'comfyui' as const;
  version = '1.0.0';

  protected websocket: WebSocket | null = null;
  protected isConnected = false;
  protected reconnectAttempts = 0;
  protected maxReconnectAttempts = 5;

  protected clientId: string | null = null;
  protected promptId: string | null = null;
  protected lastProgress: number = 0;

  private activeJobs = new Map<
    string,
    {
      jobData: JobData;
      progressCallback: ProgressCallback;
      resolve: (result: JobResult) => void;
      reject: (error: Error) => void;
      timeout?: NodeJS.Timeout;
    }
  >();

  constructor(connectorId: string) {
    // Build WebSocket URL from environment (supporting both local and remote)
    const host = process.env.WORKER_COMFYUI_HOST || 'localhost';
    const port = parseInt(process.env.WORKER_COMFYUI_PORT || '8188');
    const isSecure = process.env.WORKER_COMFYUI_SECURE === 'true';
    const wsProtocol = isSecure ? 'wss' : 'ws';
    // Authentication for remote connections
    const username = process.env.WORKER_COMFYUI_USERNAME;
    const password = process.env.WORKER_COMFYUI_PASSWORD;
    const apiKey = process.env.WORKER_COMFYUI_API_KEY;

    // Only use auth for remote connections (not localhost/127.0.0.1)
    const isRemoteConnection = host !== 'localhost' && host !== '127.0.0.1';
    const shouldUseAuth = isRemoteConnection && ((username && password) || apiKey);

    // Build WebSocket URL with auth if needed
    let websocketUrl = process.env.WORKER_COMFYUI_WS_URL;
    if (!websocketUrl) {
      if (shouldUseAuth && username && password) {
        // Basic auth in URL
        websocketUrl = `${wsProtocol}://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/ws`;
      } else {
        websocketUrl = `${wsProtocol}://${host}:${port}/ws`;
      }
    }

    // Debug: Log what we're actually using
    logger.debug('[ComfyUI-WS] Environment check:', {
      WORKER_COMFYUI_HOST: process.env.WORKER_COMFYUI_HOST,
      WORKER_COMFYUI_PORT: process.env.WORKER_COMFYUI_PORT,
      host,
      port,
      websocketUrl,
      finalBaseUrl: websocketUrl,
    });

    super(connectorId, {
      service_type: 'comfyui',
      base_url: websocketUrl,
      timeout_seconds: parseInt(process.env.WORKER_COMFYUI_TIMEOUT_SECONDS || '300'),
      retry_attempts: parseInt(process.env.WORKER_COMFYUI_RETRY_ATTEMPTS || '3'),
      retry_delay_seconds: parseInt(process.env.WORKER_COMFYUI_RETRY_DELAY_SECONDS || '2'),
      health_check_interval_seconds: 30,
      max_concurrent_jobs: parseInt(process.env.WORKER_COMFYUI_MAX_CONCURRENT_JOBS || '5'),
      settings: {
        websocket_url: websocketUrl,
        heartbeat_interval_ms: parseInt(process.env.WORKER_COMFYUI_HEARTBEAT_MS || '30000'),
        reconnect_delay_ms: parseInt(process.env.WORKER_COMFYUI_RECONNECT_DELAY_MS || '5000'),
        max_reconnect_attempts: parseInt(process.env.WORKER_COMFYUI_MAX_RECONNECT || '5'),

        // Auth settings for WebSocket connection
        auth: shouldUseAuth
          ? {
              type: apiKey ? ('bearer' as const) : ('basic' as const),
              username: username,
              password: password,
              token: apiKey,
            }
          : undefined,
      },
    });

    logger.info(`ComfyUI WebSocket connector ${connectorId} initialized for ${websocketUrl}`);
  }

  // ============================================================================
  // BaseConnector Implementation
  // ============================================================================

  protected async initializeService(): Promise<void> {
    logger.info(
      `ComfyUI WebSocket connector ${this.connector_id} connecting to ${this.config.settings.websocket_url}`
    );
    await this.connectWebSocket();
  }

  protected async cleanupService(): Promise<void> {
    if (this.websocket) {
      this.websocket.close(1000, 'Connector cleanup');
      this.websocket = null;
    }
    this.isConnected = false;
  }

  async getAvailableModels(): Promise<string[]> {
    // TODO: Query ComfyUI for available models via WebSocket
    return ['comfyui-default'];
  }

  // ============================================================================
  // Service Info and Health
  // ============================================================================

  async getServiceInfo(): Promise<ServiceInfo> {
    try {
      // For WebSocket-only ComfyUI, we'll need to get info via WebSocket or assume defaults
      return {
        service_name: 'ComfyUI WebSocket',
        service_version: 'forward-branch',
        base_url: this.config.base_url,
        status: this.isConnected ? 'online' : 'offline',
        capabilities: {
          supported_formats: ['png', 'jpg', 'webp'],
          supported_models: [], // TODO: Get via WebSocket query
          features: ['workflow_processing', 'websocket_progress', 'realtime_updates'],
          concurrent_jobs: this.config.max_concurrent_jobs,
        },
        resource_usage: {
          cpu_usage: 0,
          memory_usage_mb: 0,
        },
      };
    } catch (error) {
      logger.error('Failed to get ComfyUI WebSocket service info:', error);
      throw error;
    }
  }

  async canProcessJob(jobData: JobData): Promise<boolean> {
    // Check if job has ComfyUI workflow
    const workflow = jobData.payload?.workflow || jobData.payload;
    return !!(workflow && typeof workflow === 'object');
  }

  // ============================================================================
  // Health Check and Job Status Query Support
  // ============================================================================

  getHealthCheckCapabilities(): HealthCheckCapabilities {
    return {
      supportsBasicHealthCheck: true,
      supportsJobStatusQuery: true, // We support this via prompt ID tracking
      supportsJobCancellation: true, // ComfyUI supports interrupting workflows
      supportsServiceRestart: false, // Cannot restart remote ComfyUI instance
      supportsQueueIntrospection: true, // ComfyUI provides queue status
    };
  }

  async queryJobStatus(serviceJobId: string): Promise<ServiceJobStatus> {
    try {
      if (!this.isConnected) {
        return {
          serviceJobId,
          status: 'unknown',
          canReconnect: true,
          canCancel: false,
          errorMessage: 'WebSocket not connected',
        };
      }

      // In ComfyUI, serviceJobId is the prompt_id
      // We can query the queue status via WebSocket
      // For now, check if it's the current prompt
      if (serviceJobId === this.promptId) {
        // This is the currently processing prompt
        return {
          serviceJobId,
          status: 'running',
          canReconnect: true,
          canCancel: true,
          progress: this.lastProgress,
        };
      }

      // TODO: Implement queue query via WebSocket to check if prompt is still queued
      // For now, assume if it's not the current prompt, it might be completed or unknown
      return {
        serviceJobId,
        status: 'unknown',
        canReconnect: true,
        canCancel: false,
        errorMessage: 'Prompt status query not fully implemented',
      };
    } catch (error) {
      logger.error(`Failed to query job status for ${serviceJobId}:`, error);
      return {
        serviceJobId,
        status: 'failed',
        canReconnect: false,
        canCancel: false,
        errorMessage: error.message,
      };
    }
  }

  // ============================================================================
  // Job Processing
  // ============================================================================

  protected async processJobImpl(
    jobData: JobData,
    progressCallback: ProgressCallback
  ): Promise<JobResult> {
    const startTime = Date.now();
    logger.info(`Starting ComfyUI WebSocket job ${jobData.id}`);

    try {
      // Ensure WebSocket connection
      if (!this.isConnected) {
        await this.connectWebSocket();
      }

      // Extract workflow from job payload
      const workflow = jobData.payload?.workflow || jobData.payload;
      if (!workflow || typeof workflow !== 'object') {
        throw new Error('No workflow provided in job payload');
      }

      // Submit job via WebSocket and wait for completion
      const result = await this.submitJobViaWebSocket(
        jobData,
        workflow as Record<string, unknown>,
        progressCallback
      );

      const processingTime = Date.now() - startTime;
      logger.info(`ComfyUI WebSocket job ${jobData.id} completed in ${processingTime}ms`);

      return {
        success: true,
        data: result,
        processing_time_ms: processingTime,
        service_metadata: {
          service_version: this.version,
          service_type: this.service_type,
        },
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error(`ComfyUI WebSocket job ${jobData.id} failed after ${processingTime}ms:`, error);

      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown ComfyUI WebSocket processing error',
        processing_time_ms: processingTime,
        service_metadata: {
          service_version: this.version,
          service_type: this.service_type,
        },
      };
    }
  }

  // ============================================================================
  // WebSocket Job Submission
  // ============================================================================

  private async submitJobViaWebSocket(
    jobData: JobData,
    workflow: Record<string, unknown>,
    progressCallback: ProgressCallback
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      // Store job for tracking
      this.activeJobs.set(jobData.id, {
        jobData,
        progressCallback,
        resolve,
        reject,
      });

      // Send ComfyUI prompt message (following ComfyUI WebSocket protocol)
      const promptMessage = {
        type: 'prompt',
        data: {
          prompt: workflow,
          extra_data: {
            client_id: this.clientId,
          },
        },
      };

      logger.info(`Submitting ComfyUI job ${jobData.id} via WebSocket (prompt protocol)`);
      logger.info(`ComfyUI WebSocket: Client ID: ${this.clientId}, Connected: ${this.isConnected}`);
      logger.info(`ComfyUI WebSocket: Sending message:`, JSON.stringify(promptMessage, null, 2));
      this.sendMessage(promptMessage);

      // Set timeout
      const timeout = setTimeout(
        () => {
          this.activeJobs.delete(jobData.id);
          reject(new Error(`ComfyUI WebSocket job ${jobData.id} timed out`));
        },
        (this.config.timeout_seconds || 300) * 1000
      );

      // Store timeout for cleanup
      const job = this.activeJobs.get(jobData.id);
      if (job) {
        job.timeout = timeout;
      }
    });
  }

  // ============================================================================
  // WebSocket Message Handling
  // ============================================================================

  protected handleWebSocketMessage(message: any): void {
    try {
      logger.info(`ComfyUI WebSocket message received:`, JSON.stringify(message, null, 2));

      switch (message.type) {
        case 'client_id':
          this.handleClientId(message);
          break;
        case 'prompt_queued':
          this.handlePromptQueued(message);
          break;
        case 'progress':
          this.handleProgress(message);
          break;
        case 'executing':
          this.handleExecuting(message);
          break;
        case 'execution_error':
          this.handleExecutionError(message);
          break;
        case 'error':
          this.handleError(message);
          break;
        case 'pong':
          // Heartbeat response - handled by base class
          break;
        default:
          logger.debug(`Unhandled ComfyUI WebSocket message type: ${message.type}`);
      }
    } catch (error) {
      logger.error('Error handling ComfyUI WebSocket message:', error);
    }
  }

  private handleClientId(message: any): void {
    this.clientId = message.data?.client_id;
    logger.info(`ComfyUI WebSocket: Received client_id: ${this.clientId}`);

    // Now we're fully connected, report as active
    this.reportStatus('active');
  }

  private async handlePromptQueued(message: any): Promise<void> {
    this.promptId = message.data?.prompt_id;
    logger.info(`ComfyUI: Prompt queued with ID: ${this.promptId}`);

    // Find the job waiting for this prompt_id
    // In ComfyUI protocol, we don't have direct job_id mapping, so we use the most recent job
    const jobs = Array.from(this.activeJobs.values());
    if (jobs.length > 0) {
      const latestJob = jobs[jobs.length - 1];

      // Store service job ID mapping for health checks
      if (this.redis && this.promptId) {
        try {
          await this.redis.hset(`job:${latestJob.jobData.id}`, 'service_job_id', this.promptId);
          logger.debug(
            `Stored service job ID mapping: job ${latestJob.jobData.id} -> prompt ${this.promptId}`
          );
        } catch (error) {
          logger.warn(
            `Failed to store service job ID mapping for job ${latestJob.jobData.id}:`,
            error
          );
        }
      }

      latestJob.progressCallback({
        job_id: latestJob.jobData.id,
        progress: 10,
        message: 'Workflow queued in ComfyUI',
        current_step: 'queued',
        total_steps: 0,
        estimated_completion_ms: 0,
      });
    }
  }

  private async handleProgress(message: any): Promise<void> {
    const data = message.data;
    const nodeId = data?.node;
    const progress = data?.progress || 0;

    // Find active jobs and update their progress
    for (const [jobId, job] of this.activeJobs) {
      try {
        const progressValue = Math.min(90, 10 + progress * 80); // Map 0-1 to 10-90%
        this.lastProgress = progressValue; // Track last progress for health checks
        
        await job.progressCallback({
          job_id: jobId,
          progress: progressValue,
          message: `Processing node ${nodeId || 'unknown'}`,
          current_step: `node_${nodeId}`,
          total_steps: 0,
          estimated_completion_ms: 0,
        });
      } catch (error) {
        logger.error(`Failed to update progress for job ${jobId}:`, error);
      }
    }
  }

  private handleExecuting(message: any): void {
    const data = message.data;
    const nodeId = data?.node;

    if (nodeId === null) {
      // Execution completed (node is null)
      logger.info(`ComfyUI: Workflow execution completed`);

      // Complete all active jobs
      for (const [jobId, job] of this.activeJobs) {
        logger.info(`ComfyUI job ${jobId} completed`);

        // Clear timeout
        if (job.timeout) {
          clearTimeout(job.timeout);
        }

        // Remove from active jobs
        this.activeJobs.delete(jobId);

        // Resolve with result
        job.resolve({
          success: true,
          data: {
            prompt_id: this.promptId,
            client_id: this.clientId,
            result: data,
          },
          processing_time_ms: 0, // Will be calculated by the caller
        });
      }
    } else {
      // Node execution started
      logger.debug(`ComfyUI: Executing node ${nodeId}`);
    }
  }

  private handleExecutionError(message: any): void {
    const data = message.data;
    const errorMessage = data?.exception_message || 'Unknown execution error';

    logger.error(`ComfyUI execution error: ${errorMessage}`);

    // Fail all active jobs
    for (const [jobId, job] of this.activeJobs) {
      logger.error(`ComfyUI job ${jobId} failed: ${errorMessage}`);

      // Clear timeout
      if (job.timeout) {
        clearTimeout(job.timeout);
      }

      // Remove from active jobs
      this.activeJobs.delete(jobId);

      // Reject with error
      job.reject(new Error(`ComfyUI execution error: ${errorMessage}`));
    }
  }

  private handleError(message: any): void {
    const data = message.data;
    const errorMessage = data?.message || 'Unknown ComfyUI error';

    logger.error(`ComfyUI error: ${errorMessage}`);

    // Fail all active jobs
    for (const [jobId, job] of this.activeJobs) {
      logger.error(`ComfyUI job ${jobId} failed: ${errorMessage}`);

      // Clear timeout
      if (job.timeout) {
        clearTimeout(job.timeout);
      }

      // Remove from active jobs
      this.activeJobs.delete(jobId);

      // Reject with error
      job.reject(new Error(`ComfyUI error: ${errorMessage}`));
    }
  }

  // ============================================================================
  // WebSocket Connection Management
  // ============================================================================

  protected async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const wsUrl = this.config.settings.websocket_url;
        if (!wsUrl) {
          reject(new Error('ComfyUI WebSocket URL not configured'));
          return;
        }

        // Prepare WebSocket options with auth headers for remote connections
        const wsOptions: any = {};

        if (this.config.settings.auth) {
          const auth = this.config.settings.auth as AuthConfig;
          wsOptions.headers = {};

          if (auth.type === 'basic' && auth.username && auth.password) {
            // Basic auth header
            const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
            wsOptions.headers['Authorization'] = `Basic ${credentials}`;
          } else if (auth.type === 'bearer' && auth.token) {
            // Bearer token auth
            wsOptions.headers['Authorization'] = `Bearer ${auth.token}`;
          }
        }

        // Create WebSocket connection with auth headers
        this.websocket = new WebSocket(wsUrl as string, undefined, wsOptions);

        this.websocket.on('open', () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          logger.info(`ComfyUI WebSocket connected to ${wsUrl}`);
          this.onWebSocketOpen();
          resolve();
        });

        this.websocket.on('message', (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleWebSocketMessage(message);
          } catch (error) {
            logger.error('Failed to parse ComfyUI WebSocket message:', error);
          }
        });

        this.websocket.on('close', (code, reason) => {
          this.isConnected = false;
          logger.warn(`ComfyUI WebSocket disconnected: ${code} ${reason}`);
          this.onWebSocketClose();

          // Attempt reconnection if not a normal close
          if (code !== 1000) {
            this.attemptReconnection();
          }
        });

        this.websocket.on('error', error => {
          logger.error('ComfyUI WebSocket error:', error);
          this.onWebSocketError(error);
          reject(error);
        });

        // Set connection timeout
        const timeout = setTimeout(() => {
          if (this.websocket && this.websocket.readyState === this.websocket.CONNECTING) {
            this.websocket.terminate();
            reject(new Error('ComfyUI WebSocket connection timeout'));
          }
        }, 10000); // 10 second timeout

        this.websocket.on('open', () => {
          clearTimeout(timeout);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  protected onWebSocketOpen(): void {
    logger.info(`ComfyUI WebSocket connected to ${(this.config.settings as any).websocket_url}`);

    // Wait for client_id message from ComfyUI before considering connection fully ready
    this.waitForClientId();
  }

  private async waitForClientId(): Promise<void> {
    // Set up a timeout for receiving client_id
    setTimeout(() => {
      logger.warn('ComfyUI WebSocket: No client_id received within 10 seconds');
      this.reportStatus('active'); // Report as active anyway
    }, 10000);

    // The actual client_id handling is done in handleWebSocketMessage
    // This timeout will be cleared when we receive the client_id message
  }

  protected onWebSocketClose(): void {
    logger.warn(
      `ComfyUI WebSocket disconnected from ${(this.config.settings as any).websocket_url}`
    );

    // Clear ComfyUI state
    this.clientId = null;
    this.promptId = null;

    // Report disconnection status to unified machine state
    this.reportStatus('offline', 'ComfyUI WebSocket disconnected');

    // Fail all active jobs
    for (const [jobId, job] of this.activeJobs) {
      logger.error(`Failing job ${jobId} due to WebSocket disconnection`);
      if (job.timeout) {
        clearTimeout(job.timeout);
      }
      job.reject(new Error('WebSocket connection lost'));
    }
    this.activeJobs.clear();
  }

  protected onWebSocketError(error: Error): void {
    logger.error('ComfyUI WebSocket error:', error);

    // Report error status to unified machine state
    this.reportStatus('error', `ComfyUI WebSocket error: ${error.message}`);
  }

  // ============================================================================
  // Health Check
  // ============================================================================

  async checkHealth(): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      // Send WebSocket ping (not JSON message)
      if (this.websocket && this.isConnected) {
        this.websocket.ping();
      }

      return true;
    } catch (error) {
      logger.error('ComfyUI WebSocket health check failed:', error);
      return false;
    }
  }

  /**
   * Health check for stuck jobs - query ComfyUI directly using service job ID
   * This enables the unified JobHealthMonitor to recover stuck/completed jobs
   */
  async healthCheckJob(
    jobId: string
  ): Promise<{ action: string; reason: string; result?: unknown }> {
    if (!this.redis) {
      return { action: 'return_to_queue', reason: 'no_redis_connection' };
    }

    try {
      const jobData = await this.redis.hgetall(`job:${jobId}`);
      if (!jobData.service_job_id) {
        return { action: 'return_to_queue', reason: 'service_submission_failed' };
      }

      // Query ComfyUI history directly via HTTP API
      const serviceStatus = await this.queryComfyUIStatus(jobData.service_job_id);

      // Update last service check
      await this.redis.hset(`job:${jobId}`, 'last_service_check', new Date().toISOString());

      switch (serviceStatus.status) {
        case 'completed':
          logger.info(
            `Health check: Job ${jobId} (${jobData.service_job_id}) completed in ComfyUI`
          );
          return {
            action: 'complete_job',
            reason: 'found_completed_in_service',
            result: serviceStatus.result,
          };

        case 'failed':
          logger.warn(`Health check: Job ${jobId} (${jobData.service_job_id}) failed in ComfyUI`);
          return { action: 'fail_job', reason: serviceStatus.error || 'service_reported_failure' };

        case 'running':
          logger.info(
            `Health check: Job ${jobId} (${jobData.service_job_id}) still running in ComfyUI`
          );
          return { action: 'continue_monitoring', reason: 'service_still_processing' };

        case 'not_found':
          logger.warn(
            `Health check: Job ${jobId} (${jobData.service_job_id}) not found in ComfyUI`
          );
          return { action: 'return_to_queue', reason: 'service_job_not_found' };

        default:
          logger.warn(`Health check: Unknown status for job ${jobId}: ${serviceStatus.status}`);
          return { action: 'continue_monitoring', reason: 'unknown_service_status' };
      }
    } catch (error) {
      logger.error(`Health check failed for job ${jobId}:`, error);
      return { action: 'continue_monitoring', reason: 'health_check_error' };
    }
  }

  /**
   * Query ComfyUI HTTP API to check job status by prompt_id
   * This enables health checks even when WebSocket connection is lost
   */
  private async queryComfyUIStatus(
    promptId: string
  ): Promise<{ status: string; result?: unknown; error?: string }> {
    try {
      // Build HTTP URL from WebSocket URL
      const wsUrl = this.config.base_url as string;
      const httpUrl = wsUrl.replace(/^wss?:\/\//, 'http://').replace(/\/ws$/, '');
      const historyUrl = `${httpUrl}/history/${promptId}`;

      // Prepare headers with auth if needed
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      if (this.config.settings?.auth) {
        const auth = this.config.settings.auth as AuthConfig;
        if (auth.type === 'basic' && auth.username && auth.password) {
          const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
          headers['Authorization'] = `Basic ${credentials}`;
        } else if (auth.type === 'bearer' && auth.token) {
          headers['Authorization'] = `Bearer ${auth.token}`;
        }
      }

      // Create controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(historyUrl, {
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return { status: 'not_found' };
      }

      const historyData = await response.json();
      if (!historyData || Object.keys(historyData).length === 0) {
        return { status: 'not_found' };
      }

      // Check if job completed successfully
      if (historyData[promptId]?.status?.completed) {
        return {
          status: 'completed',
          result: historyData[promptId],
        };
      }

      // Check if job failed
      if (historyData[promptId]?.status?.error) {
        return {
          status: 'failed',
          error: historyData[promptId].status.error,
        };
      }

      // If we have history data but no completion status, assume running
      if (historyData[promptId]) {
        return { status: 'running' };
      }

      return { status: 'not_found' };
    } catch (error) {
      logger.error(`Failed to query ComfyUI status for prompt ${promptId}:`, error);
      return {
        status: 'not_found',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  async cancelJob(jobId: string): Promise<void> {
    logger.info(`Cancelling ComfyUI WebSocket job ${jobId}`);

    // Cancel the job if it's active
    const job = this.activeJobs.get(jobId);
    if (job) {
      job.reject(new Error('Job cancelled'));
      this.activeJobs.delete(jobId);
    }

    // Send cancellation message if connected
    if (this.isConnected && this.websocket) {
      try {
        const cancelMessage = {
          type: 'cancel_job',
          job_id: jobId,
          timestamp: Date.now(),
        };

        this.sendMessage(cancelMessage);
        logger.info(`Sent cancellation message for job ${jobId}`);
      } catch (error) {
        logger.error(`Failed to send cancellation for job ${jobId}:`, error);
      }
    }
  }

  async updateConfiguration(_config: unknown): Promise<void> {
    // TODO: Implement configuration updates
    logger.info(
      `Configuration update requested for ComfyUI WebSocket connector ${this.connector_id}`
    );
  }

  getConfiguration(): any {
    return { ...this.config };
  }

  async stop(): Promise<void> {
    // Fail all active jobs
    for (const [jobId, job] of this.activeJobs) {
      logger.info(`Cancelling job ${jobId} due to connector shutdown`);
      job.reject(new Error('Connector shutting down'));
    }
    this.activeJobs.clear();

    await super.cleanup();
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  // Utility method for sending messages
  protected sendMessage(message: unknown): void {
    if (this.websocket && this.isConnected) {
      const messageStr = JSON.stringify(message);
      logger.info(`ComfyUI WebSocket: Sending message: ${messageStr}`);
      this.websocket.send(messageStr);
      logger.info(`ComfyUI WebSocket: Message sent successfully`);
    } else {
      const error = `WebSocket not connected. Connected: ${this.isConnected}, Socket exists: ${!!this.websocket}`;
      logger.error(error);
      throw new Error(error);
    }
  }

  protected async attemptReconnection(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay =
      ((this.config.settings as any).reconnect_delay_ms || 5000) *
      Math.pow(2, this.reconnectAttempts - 1);

    logger.info(
      `Attempting ComfyUI WebSocket reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`
    );

    setTimeout(async () => {
      try {
        await this.connectWebSocket();
        logger.info('ComfyUI WebSocket reconnected successfully');
      } catch (error) {
        logger.error(`Reconnection attempt ${this.reconnectAttempts} failed:`, error);
        this.attemptReconnection();
      }
    }, delay);
  }
}
