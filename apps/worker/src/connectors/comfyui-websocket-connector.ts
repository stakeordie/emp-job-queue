// ComfyUI WebSocket Connector - Pure WebSocket implementation for ComfyUI fork
// Uses stakeordie/ComfyUI fork with native WebSocket job submission and progress

import { JobData, JobResult, ProgressCallback, ServiceInfo, logger } from '@emp/core';
import { WebSocketConnector, MessageType, WebSocketMessage, WebSocketState } from './protocol/websocket-connector.js';
import { HealthCheckCapabilities, ServiceJobStatus } from './base-connector.js';

interface AuthConfig {
  type: 'basic' | 'bearer';
  username?: string;
  password?: string;
  token?: string;
}

export class ComfyUIWebSocketConnector extends WebSocketConnector {
  service_type = 'comfyui' as const;
  version = '1.0.0';

  protected clientId: string | null = null;
  protected promptId: string | null = null;
  protected lastProgress: number = 0;

  constructor(
    connectorId: string,
    config?: {
      host?: string;
      port?: number;
      secure?: boolean;
      username?: string;
      password?: string;
      apiKey?: string;
    }
  ) {
    // Accept configuration directly OR read from LOCAL ComfyUI environment variables
    // For local ComfyUI, we check both unprefixed (for backwards compat) and COMFYUI_ prefixed vars
    const host = config?.host || process.env.COMFYUI_HOST || 'localhost';
    const port = config?.port || parseInt(process.env.COMFYUI_PORT || process.env.COMFYUI_BASE_PORT || '8188');
    const isSecure = config?.secure || process.env.COMFYUI_SECURE === 'true';
    const wsProtocol = isSecure ? 'wss' : 'ws';
    
    // Auth configuration (typically not needed for local)
    const username = config?.username || process.env.COMFYUI_USERNAME;
    const password = config?.password || process.env.COMFYUI_PASSWORD;
    const apiKey = config?.apiKey || process.env.COMFYUI_API_KEY;

    // Build WebSocket URL
    let websocketUrl = process.env.COMFYUI_WS_URL;
    if (!websocketUrl) {
      if (username && password) {
        // Basic auth in URL
        websocketUrl = `${wsProtocol}://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/ws`;
      } else {
        websocketUrl = `${wsProtocol}://${host}:${port}/ws`;
      }
    }

    // Debug: Log configuration
    console.log(`🔗🔗🔗 [COMFYUI-CONNECTOR-DEBUG] ComfyUI WebSocket Connector Configuration:`);
    console.log(`🔗🔗🔗 [COMFYUI-CONNECTOR-DEBUG] Host: ${host}`);
    console.log(`🔗🔗🔗 [COMFYUI-CONNECTOR-DEBUG] Port: ${port}`);
    console.log(`🔗🔗🔗 [COMFYUI-CONNECTOR-DEBUG] WebSocket URL: ${websocketUrl}`);
    console.log(`🔗🔗🔗 [COMFYUI-CONNECTOR-DEBUG] Environment variables used:`);
    console.log(`🔗🔗🔗 [COMFYUI-CONNECTOR-DEBUG] - COMFYUI_HOST: ${process.env.COMFYUI_HOST}`);
    console.log(`🔗🔗🔗 [COMFYUI-CONNECTOR-DEBUG] - COMFYUI_PORT: ${process.env.COMFYUI_PORT}`);
    console.log(`🔗🔗🔗 [COMFYUI-CONNECTOR-DEBUG] - COMFYUI_BASE_PORT: ${process.env.COMFYUI_BASE_PORT}`);
    
    logger.debug(`[ComfyUI-${connectorId}] Configuration:`, {
      host,
      port,
      secure: isSecure,
      hasAuth: !!(username || apiKey),
      websocketUrl: websocketUrl.replace(/:[^@]*@/, ':***@'), // Mask password in logs
    });

    // Create WebSocketConnectorConfig
    const wsConfig = {
      connector_id: connectorId,
      service_type: 'comfyui',
      base_url: websocketUrl,
      websocket_url: websocketUrl,
      // Use config values if provided (for remote), otherwise use local ENV vars
      timeout_seconds: parseInt(config ? '300' : process.env.COMFYUI_TIMEOUT_SECONDS || '300'),
      retry_attempts: parseInt(config ? '3' : process.env.COMFYUI_RETRY_ATTEMPTS || '3'),
      retry_delay_seconds: parseInt(config ? '2' : process.env.COMFYUI_RETRY_DELAY_SECONDS || '2'),
      health_check_interval_seconds: 30,
      max_concurrent_jobs: parseInt(config ? '5' : process.env.COMFYUI_MAX_CONCURRENT_JOBS || '5'),
      heartbeat_interval_ms: parseInt(config ? '30000' : process.env.COMFYUI_HEARTBEAT_MS || '30000'),
      reconnect_delay_ms: parseInt(config ? '5000' : process.env.COMFYUI_RECONNECT_DELAY_MS || '5000'),
      max_reconnect_attempts: parseInt(config ? '5' : process.env.COMFYUI_MAX_RECONNECT || '5'),
      
      // Auth settings for WebSocket connection (if provided)
      auth: (username || apiKey)
        ? {
            type: apiKey ? 'bearer' as const : 'basic' as const,
            username: username,
            password: password,
            bearer_token: apiKey,
            token: apiKey,
          }
        : undefined,
    };

    super(connectorId, wsConfig);

    logger.info(`ComfyUI WebSocket connector ${connectorId} initialized for ${websocketUrl}`);
  }

  // ============================================================================
  // WebSocketConnector Abstract Method Implementation
  // ============================================================================

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
        status: 'online', // WebSocketConnector manages connection state
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
  // WebSocketConnector Abstract Methods Implementation
  // ============================================================================

  protected classifyMessage(messageData: any): MessageType {
    
    if (!messageData.type) return MessageType.UNKNOWN;
    
    switch (messageData.type) {
      case 'client_id':
      case 'status':
        return MessageType.CONNECTION;
      case 'prompt_queued':
        return MessageType.JOB_SUBMIT;
      case 'executing':
        // Check if this is a completion message (node is null)
        if (messageData.data?.node === null) {
          return MessageType.JOB_COMPLETE;
        }
        return MessageType.JOB_SUBMIT;
      case 'progress':
        return MessageType.JOB_PROGRESS;
      case 'execution_error':
      case 'error':
        return MessageType.JOB_ERROR;
      case 'pong':
        return MessageType.HEARTBEAT;
      default:
        return MessageType.UNKNOWN;
    }
  }

  protected extractJobId(messageData: any): string | undefined {
    // ComfyUI doesn't have direct job IDs, use prompt_id as correlation
    let promptId = messageData.data?.prompt_id;
    
    // For completion messages, we need to use the current prompt ID since the message doesn't contain it
    if (messageData.type === 'executing' && messageData.data?.node === null) {
      promptId = this.promptId;
    }
    
    // Convert ComfyUI prompt_id back to worker job_id using our active jobs mapping
    if (promptId) {
      // Find the active job that matches this prompt_id
      for (const [jobId, activeJob] of (this as any).activeJobs.entries()) {
        // Check if this job's prompt_id matches (stored when we sent the job)
        if ((activeJob as any).promptId === promptId) {
          return jobId;
        }
      }
      
      // Fallback: if no active job mapping found, return the prompt_id
      // This can happen for messages before job submission completes
      return promptId;
    }
    
    return undefined;
  }

  protected extractProgress(messageData: any): number {
    const progress = messageData.data?.progress || 0;
    return Math.min(90, 10 + progress * 80); // Map 0-1 to 10-90%
  }

  protected parseJobResult(messageData: any, _originalJobData: JobData): JobResult {
    return {
      success: true,
      data: {
        prompt_id: this.promptId,
        client_id: this.clientId,
        result: messageData.data,
      },
      processing_time_ms: 0, // Will be calculated by caller
      service_metadata: {
        service_version: this.version,
        service_type: this.service_type,
      },
    };
  }

  protected extractErrorMessage(messageData: any): string {
    return messageData.data?.exception_message || 
           messageData.data?.message || 
           'Unknown ComfyUI error';
  }

  protected buildJobMessage(jobData: JobData): any {
    // Extract workflow from job payload
    const workflow = jobData.payload?.workflow || jobData.payload;
    if (!workflow || typeof workflow !== 'object') {
      throw new Error('No workflow provided in job payload');
    }

    return {
      type: 'prompt',
      data: {
        prompt: workflow,
        extra_data: {
          client_id: this.clientId,
        },
      },
    };
  }

  protected onMessage(message: WebSocketMessage): void {
    // Handle ComfyUI-specific messages
    switch (message.data.type) {
      case 'client_id':
        this.handleClientId(message.data);
        break;
      case 'prompt_queued':
        this.handlePromptQueued(message.data);
        break;
      case 'executing':
        this.handleExecuting(message.data);
        break;
    }
  }

  protected onConnectionEstablished(): void {
    logger.info(`ComfyUI WebSocket connection established`);
    // Wait for client_id message before considering fully ready
  }

  protected onConnectionMessage(message: WebSocketMessage): void {
    if (message.data.type === 'client_id') {
      this.handleClientId(message.data);
    }
  }

  // ============================================================================
  // ComfyUI-Specific Message Handlers (kept from original implementation)
  // ============================================================================


  private handleClientId(message: any): void {
    this.clientId = message.data?.client_id || message.client_id;
    logger.info(`ComfyUI WebSocket: Received client_id: ${this.clientId}`);

    // Now we're fully connected, report as active
    this.setStatus('active');
  }

  private async handlePromptQueued(message: any): Promise<void> {
    this.promptId = message.data?.prompt_id;
    logger.info(`ComfyUI: Prompt queued with ID: ${this.promptId}`);
    
    // Find the most recently submitted job (should be the one that triggered this prompt)
    // and store the prompt_id correlation
    let mostRecentJob: any = null;
    let mostRecentTime = 0;
    
    for (const [jobId, activeJob] of (this as any).activeJobs.entries()) {
      if ((activeJob as any).startTime > mostRecentTime && !(activeJob as any).promptId) {
        mostRecentJob = activeJob;
        mostRecentTime = (activeJob as any).startTime;
      }
    }
    
    if (mostRecentJob && this.promptId) {
      mostRecentJob.promptId = this.promptId;
      logger.info(`🔗 [${this.connector_id}] Job ID correlation established:`, {
        jobId: mostRecentJob.jobData.id,
        promptId: this.promptId
      });
    }

    // Store service job ID mapping for health checks
    if (this.redis && this.promptId) {
      try {
        // Note: We'll need to correlate this with actual job IDs when jobs are submitted
        logger.debug(`ComfyUI prompt queued: ${this.promptId}`);
      } catch (error) {
        logger.warn(`Failed to handle prompt queued for ${this.promptId}:`, error);
      }
    }
  }

  private handleExecuting(message: any): void {
    const data = message.data;
    const nodeId = data?.node;

    if (nodeId === null) {
      // Execution completed (node is null)
      logger.info(`ComfyUI: Workflow execution completed`);
    } else {
      // Node execution started
      logger.debug(`ComfyUI: Executing node ${nodeId}`);
    }
  }

  // ============================================================================
  // BaseConnector Interface Implementation (Required Methods)
  // ============================================================================

  async checkHealth(): Promise<boolean> {
    // Use the base WebSocketConnector's checkHealth method
    return super.checkHealth();
  }

  // Override health check capabilities for ComfyUI
  getHealthCheckCapabilities(): HealthCheckCapabilities {
    return {
      supportsBasicHealthCheck: true,
      supportsJobStatusQuery: true,
      supportsJobCancellation: true,
      supportsServiceRestart: false,
      supportsQueueIntrospection: true,
    };
  }

  async queryJobStatus(serviceJobId: string): Promise<ServiceJobStatus> {
    // Basic implementation - could be enhanced with HTTP API queries
    return {
      serviceJobId,
      status: 'unknown',
      canReconnect: true,
      canCancel: true,
      errorMessage: 'Job status query not fully implemented',
    };
  }

  async cancelJob(jobId: string): Promise<void> {
    // Use base class implementation
    await super.cancelJob(jobId);
  }

  async updateConfiguration(config: any): Promise<void> {
    await super.updateConfiguration(config);
  }

  getConfiguration(): any {
    return super.getConfiguration();
  }

  // ============================================================================
  // Override heartbeat to include port debugging information
  // ============================================================================

  /**
   * Build heartbeat message with port information for debugging
   */
  protected buildHeartbeatMessage(): any {
    const baseMessage = this.wsConfig.heartbeat_message;
    const port = parseInt(process.env.COMFYUI_PORT || process.env.COMFYUI_BASE_PORT || '8188');
    
    logger.info(`🔗🔗🔗 [COMFYUI-PING-DEBUG] Heartbeat sending to port ${port} via ${this.config.base_url}`);
    
    return baseMessage;
  }

  // ============================================================================
  // Override processJob to handle ComfyUI prompt_id correlation
  // ============================================================================

  async processJob(jobData: JobData, progressCallback?: ProgressCallback): Promise<JobResult> {
    // Ensure connection is established
    if (this.connectionState !== WebSocketState.CONNECTED) {
      await super.connect();
    }

    return new Promise<JobResult>((resolve, reject) => {
      // Setup job timeout
      const timeout = setTimeout(() => {
        this.handleJobFailure(jobData.id, new Error('Job timeout'));
      }, this.wsConfig.message_timeout_ms);

      // Track active job with ComfyUI-specific fields
      const activeJob: any = {
        jobData,
        progressCallback,
        resolve,
        reject,
        timeout,
        startTime: Date.now(),
        promptId: null // Will be set when we get the prompt_queued message
      };

      (this as any).activeJobs.set(jobData.id, activeJob);

      try {
        // Build and send job message
        const jobMessage = this.buildJobMessage(jobData);
        this.sendMessage(jobMessage);

        logger.debug(`ComfyUI WebSocket job submitted`, {
          connector: this.connector_id,
          jobId: jobData.id,
          type: jobData.type
        });

      } catch (error) {
        this.handleJobFailure(jobData.id, error as Error);
      }
    });
  }

  private handleJobFailure(jobId: string, error: Error): void {
    const activeJob = (this as any).activeJobs.get(jobId);
    if (activeJob) {
      if (activeJob.timeout) {
        clearTimeout(activeJob.timeout);
      }
      
      (this as any).activeJobs.delete(jobId);
      activeJob.reject(error);
      
      logger.error(`ComfyUI WebSocket job failed`, {
        connector: this.connector_id,
        jobId,
        error: error.message,
        duration: Date.now() - activeJob.startTime
      });
    }
  }
}
