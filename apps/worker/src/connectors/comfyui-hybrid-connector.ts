// ComfyUI Connector - Hybrid HTTP + WebSocket connection to ComfyUI service
// Enhanced to use HybridConnector for shared Redis connection and status reporting

import { JobData, JobResult, JobProgress, ProgressCallback, ServiceInfo, logger } from '@emp/core';
import { HybridConnector, HybridConnectorConfig, HybridMessage } from './hybrid-connector.js';

export class ComfyUIConnector extends HybridConnector {
  service_type = 'comfyui' as const;
  version = '1.0.0';

  private activeJobs = new Map<
    string,
    {
      jobData: JobData;
      progressCallback: ProgressCallback;
      promptId?: string;
    }
  >();

  // Don't declare messageHandlers - it's inherited from HybridConnector

  // Store A1111-specific settings as instance properties
  private workflowTimeoutSeconds: number;
  private imageFormat: string;
  private imageQuality: number;
  private saveWorkflow: boolean;

  constructor(connectorId: string) {
    // Build configuration from environment (matching Python patterns)
    const host = process.env.WORKER_COMFYUI_HOST || 'localhost';
    const port = parseInt(process.env.WORKER_COMFYUI_PORT || '8188');
    const username = process.env.WORKER_COMFYUI_USERNAME;
    const password = process.env.WORKER_COMFYUI_PASSWORD;

    const config: Partial<HybridConnectorConfig> = {
      service_type: 'comfyui',
      base_url: `http://${host}:${port}`,
      auth:
        username && password
          ? {
              type: 'basic',
              username,
              password,
            }
          : { type: 'none' },
      timeout_seconds: parseInt(process.env.WORKER_COMFYUI_TIMEOUT_SECONDS || '300'),
      retry_attempts: 3,
      retry_delay_seconds: 2,
      health_check_interval_seconds: 30,
      max_concurrent_jobs: parseInt(process.env.WORKER_COMFYUI_MAX_CONCURRENT_JOBS || '1'),
      settings: {
        // HTTP settings
        http_base_url: `http://${host}:${port}`,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body_format: 'json',

        // WebSocket settings
        websocket_url:
          username && password
            ? `ws://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/ws`
            : `ws://${host}:${port}/ws`,
        heartbeat_interval_ms: 30000,
        reconnect_delay_ms: 5000,
        max_reconnect_attempts: 5,
        message_timeout_ms:
          parseInt(process.env.WORKER_COMFYUI_WORKFLOW_TIMEOUT_SECONDS || '600') * 1000,
        ping_interval_ms: 10000,

        // Hybrid configuration - ComfyUI uses HTTP for submission, WebSocket for progress
        use_http_for_submission: true,
        use_websocket_for_progress: true,
        use_websocket_for_results: false, // Results retrieved via HTTP API

        // ComfyUI-specific settings stored in base settings
        // ComfyUI-specific settings will be stored elsewhere
      },
    };

    super(connectorId, config);

    // Store ComfyUI-specific settings
    this.workflowTimeoutSeconds = parseInt(
      process.env.WORKER_COMFYUI_WORKFLOW_TIMEOUT_SECONDS || '600'
    );
    this.imageFormat = process.env.WORKER_COMFYUI_IMAGE_FORMAT || 'png';
    this.imageQuality = parseInt(process.env.WORKER_COMFYUI_IMAGE_QUALITY || '95');
    this.saveWorkflow = process.env.WORKER_COMFYUI_SAVE_WORKFLOW !== 'false';
  }

  // HybridConnector overrides
  async checkHealth(): Promise<boolean> {
    try {
      const response = await this.makeHttpRequest('GET', '/system_stats');
      return response.status >= 200 && response.status < 300;
    } catch (error) {
      logger.debug(`ComfyUI health check failed:`, error);
      return false;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      // Get available checkpoints from ComfyUI
      const response = await this.makeHttpRequest('GET', '/object_info');
      const objectInfo = await this.parseHttpResponse(response);

      // Extract checkpoint models
      const checkpoints =
        (objectInfo as any)?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];

      logger.info(`Found ${checkpoints.length} models in ComfyUI`);
      return checkpoints;
    } catch (error) {
      logger.error('Failed to get ComfyUI models:', error);
      return [];
    }
  }

  async getServiceInfo(): Promise<ServiceInfo> {
    try {
      const systemStatsResponse = await this.makeHttpRequest('GET', '/system_stats');
      const systemStats = await this.parseHttpResponse(systemStatsResponse);

      await this.makeHttpRequest('GET', '/object_info');

      return {
        service_name: 'ComfyUI',
        service_version: 'unknown', // ComfyUI doesn't expose version in API
        base_url: this.config.base_url,
        status: 'online',
        capabilities: {
          supported_formats: ['png', 'jpg', 'webp'],
          supported_models: await this.getAvailableModels(),
          features: [
            'workflow_processing',
            'progress_tracking',
            'websocket_updates',
            'hybrid_connectivity',
          ],
          concurrent_jobs: this.config.max_concurrent_jobs,
        },
        resource_usage: {
          cpu_usage: (systemStats as any)?.cpu_usage || 0,
          memory_usage_mb: (systemStats as any)?.memory_usage_mb || 0,
          ...(systemStats as any),
        },
      };
    } catch (error) {
      logger.error('Failed to get ComfyUI service info:', error);
      throw error;
    }
  }

  async canProcessJob(jobData: JobData): Promise<boolean> {
    return jobData.type === 'comfyui' && jobData.payload?.workflow !== undefined;
  }

  // Override processJobImpl from BaseConnector to customize ComfyUI job processing
  protected async processJobImpl(
    jobData: JobData,
    progressCallback: ProgressCallback
  ): Promise<JobResult> {
    const startTime = Date.now();
    logger.info(`Starting ComfyUI job ${jobData.id}`);

    try {
      // Validate workflow
      const workflow = jobData.payload.workflow;
      if (!workflow) {
        throw new Error('No workflow provided in job payload');
      }

      // Store job for progress tracking
      this.activeJobs.set(jobData.id, { jobData, progressCallback });

      // Submit workflow to ComfyUI via HTTP
      const promptId = await this.submitWorkflow(workflow as Record<string, unknown>);
      logger.info(`ComfyUI job ${jobData.id} submitted with prompt ID: ${promptId}`);

      // Update job with prompt ID for tracking
      const activeJob = this.activeJobs.get(jobData.id);
      if (activeJob) {
        activeJob.promptId = promptId;
        this.activeJobs.set(jobData.id, activeJob);
      }

      // Wait for completion via WebSocket progress monitoring and HTTP result retrieval
      const result = await this.waitForCompletion(jobData.id, promptId, progressCallback);

      const processingTime = Date.now() - startTime;

      logger.info(`ComfyUI job ${jobData.id} completed in ${processingTime}ms`);

      return {
        success: true,
        data: result,
        processing_time_ms: processingTime,
        service_metadata: {
          service_version: this.version,
          model_used: this.extractModelFromWorkflow(workflow as Record<string, unknown>),
          processing_stats: {
            prompt_id: promptId,
            workflow_nodes: Object.keys(workflow).length,
          },
        },
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error(`ComfyUI job ${jobData.id} failed:`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'ComfyUI processing failed',
        processing_time_ms: processingTime,
        service_metadata: {
          service_version: this.version,
        },
      };
    } finally {
      this.activeJobs.delete(jobData.id);
    }
  }

  async cancelJob(jobId: string): Promise<void> {
    logger.info(`Cancelling ComfyUI job ${jobId}`);

    // Remove from active jobs
    this.activeJobs.delete(jobId);

    // ComfyUI doesn't have a direct cancel API, but we stop tracking the job
    // In a real implementation, you might need to interrupt the workflow
  }

  private async submitWorkflow(workflow: Record<string, unknown>): Promise<string> {
    try {
      const payload = {
        prompt: workflow,
        extra_data: {
          client_id: this.connector_id,
        },
      };

      const response = await this.makeHttpRequest('POST', '/prompt', payload);
      const responseData = await this.parseHttpResponse(response);

      const promptId = (responseData as any).prompt_id;
      if (!promptId) {
        throw new Error('No prompt ID returned from ComfyUI');
      }

      return promptId;
    } catch (error) {
      logger.error('Failed to submit workflow to ComfyUI:', error);
      throw error;
    }
  }

  private async waitForCompletion(
    jobId: string,
    promptId: string,
    progressCallback: ProgressCallback
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(`ComfyUI job ${jobId} timed out after ${this.workflowTimeoutSeconds} seconds`)
        );
      }, this.workflowTimeoutSeconds * 1000);

      // Store completion handlers
      const originalJob = this.activeJobs.get(jobId);
      if (originalJob) {
        this.activeJobs.set(jobId, {
          ...originalJob,
          progressCallback: async (progress: JobProgress) => {
            await progressCallback(progress);

            // Check for completion
            if (progress.progress >= 100) {
              clearTimeout(timeout);

              // Get the results
              try {
                const result = await this.getJobResult(promptId);
                resolve(result);
              } catch (error) {
                reject(error);
              }
            }
          },
        });
      }
    });
  }

  private async getJobResult(promptId: string): Promise<Record<string, unknown>> {
    try {
      // Get history to find completed execution
      const historyResponse = await this.makeHttpRequest('GET', `/history/${promptId}`);
      const historyData = await this.parseHttpResponse(historyResponse);
      const history = (historyData as any)[promptId];

      if (!history) {
        throw new Error(`No history found for prompt ${promptId}`);
      }

      // Extract outputs from the execution
      const outputs = history.outputs || {};
      const images: string[] = [];

      // Process any image outputs
      for (const nodeId of Object.keys(outputs)) {
        const nodeOutput = outputs[nodeId];
        if (nodeOutput.images) {
          for (const image of nodeOutput.images) {
            const imageUrl = `${this.config.base_url}/view?filename=${image.filename}&subfolder=${image.subfolder || ''}&type=${image.type || 'output'}`;
            images.push(imageUrl);
          }
        }
      }

      return {
        prompt_id: promptId,
        outputs,
        images,
        execution_time: history.execution_time,
        status: history.status,
      };
    } catch (error) {
      logger.error(`Failed to get ComfyUI job result for prompt ${promptId}:`, error);
      throw error;
    }
  }

  // HybridConnector abstract method implementations
  protected handleUnknownWebSocketMessage(message: HybridMessage): void {
    logger.debug(`Unhandled ComfyUI WebSocket message type: ${message.type}`);
  }

  protected setupCustomMessageHandlers(): void {
    // ComfyUI specific message handlers
    const messageHandlers = (this as any).messageHandlers;
    messageHandlers.set('progress', (message: any) => this.handleProgressMessage(message.data));
    messageHandlers.set('executing', (message: any) => this.handleExecutingMessage(message.data));
    messageHandlers.set('executed', (message: any) => this.handleExecutedMessage(message.data));
  }

  private handleComfyUIMessage(message: { type: string; data: unknown }): void {
    const { type, data } = message;

    switch (type) {
      case 'progress':
        this.handleProgressMessage(data);
        break;
      case 'executing':
        this.handleExecutingMessage(data);
        break;
      case 'executed':
        this.handleExecutedMessage(data);
        break;
      default:
        logger.debug(`Unhandled ComfyUI WebSocket message type: ${type}`);
    }
  }

  private async handleProgressMessage(data: unknown): Promise<void> {
    const progressData = data as { value: number; max: number };
    const { value, max } = progressData;
    const progress = max > 0 ? Math.round((value / max) * 100) : 0;

    // Update all active jobs with progress
    for (const [jobId, jobInfo] of this.activeJobs) {
      try {
        await jobInfo.progressCallback({
          job_id: jobId,
          progress,
          message: `Processing: ${value}/${max}`,
          current_step: `Step ${value}`,
          total_steps: max,
        });
      } catch (error) {
        logger.error(`Failed to update progress for job ${jobId}:`, error);
      }
    }
  }

  private async handleExecutingMessage(_data: unknown): Promise<void> {
    // Update active jobs when execution starts
    for (const [jobId, jobInfo] of this.activeJobs) {
      try {
        await jobInfo.progressCallback({
          job_id: jobId,
          progress: 10,
          message: 'Execution started',
          current_step: 'Starting workflow',
        });
      } catch (error) {
        logger.error(`Failed to update execution status for job ${jobId}:`, error);
      }
    }
  }

  private async handleExecutedMessage(_data: unknown): Promise<void> {
    // Update active jobs when execution completes
    for (const [jobId, jobInfo] of this.activeJobs) {
      try {
        await jobInfo.progressCallback({
          job_id: jobId,
          progress: 100,
          message: 'Execution completed',
          current_step: 'Workflow finished',
        });
      } catch (error) {
        logger.error(`Failed to update completion status for job ${jobId}:`, error);
      }
    }
  }

  private extractModelFromWorkflow(workflow: Record<string, unknown>): string {
    // Try to find checkpoint loader node
    for (const nodeId of Object.keys(workflow)) {
      const node = workflow[nodeId] as Record<string, unknown>;
      if (node?.class_type === 'CheckpointLoaderSimple') {
        const inputs = node.inputs as Record<string, unknown> | undefined;
        return typeof inputs?.ckpt_name === 'string' ? inputs.ckpt_name : 'unknown';
      }
    }
    return 'unknown';
  }

  // HybridConnector abstract implementations for ComfyUI
  protected getHealthEndpoint(): string {
    return '/system_stats';
  }

  protected getJobSubmissionEndpoint(): string {
    return '/prompt';
  }

  protected getCancelEndpoint(jobId: string): string | null {
    // ComfyUI doesn't have a direct cancel endpoint
    return null;
  }

  protected prepareHttpJobPayload(jobData: JobData): unknown {
    return {
      prompt: jobData.payload.workflow,
      extra_data: {
        client_id: this.connector_id,
      },
    };
  }

  protected async handleHttpSubmissionResponse(
    jobData: JobData,
    responseData: unknown
  ): Promise<void> {
    const promptId = (responseData as any).prompt_id;
    if (!promptId) {
      throw new Error('No prompt ID returned from ComfyUI');
    }

    // Update active job with prompt ID
    const activeJob = this.activeJobs.get(jobData.id);
    if (activeJob) {
      activeJob.promptId = promptId;
      this.activeJobs.set(jobData.id, activeJob);
    }
  }

  protected prepareWebSocketJobMessage(jobData: JobData): HybridMessage {
    // ComfyUI doesn't use WebSocket for job submission
    return {
      type: 'job_submit',
      id: jobData.id,
      data: jobData.payload,
    };
  }

  protected prepareWebSocketCancelMessage(jobId: string): HybridMessage {
    return {
      type: 'cancel',
      id: jobId,
    };
  }

  protected prepareWebSocketHeartbeatMessage(): HybridMessage {
    return {
      type: 'ping',
      timestamp: Date.now(),
    };
  }

  protected extractJobIdFromWebSocketMessage(message: HybridMessage): string {
    return message.id || '';
  }

  protected extractProgressFromWebSocketMessage(message: HybridMessage): {
    progress: number;
    message?: string;
    current_step?: string;
    total_steps?: number;
    estimated_completion_ms?: number;
  } {
    const data = message.data as any;
    const { value, max } = data;
    const progress = max > 0 ? Math.round((value / max) * 100) : 0;

    return {
      progress,
      message: `Processing: ${value}/${max}`,
      current_step: `Step ${value}`,
      total_steps: max,
    };
  }

  protected extractResultFromWebSocketMessage(message: HybridMessage): unknown {
    return message.data;
  }

  protected extractErrorFromWebSocketMessage(message: HybridMessage): string {
    return message.error || 'ComfyUI processing failed';
  }

  protected onWebSocketConnected(): void {
    logger.info(`ComfyUI WebSocket connected for connector ${this.connector_id}`);
  }

  protected onWebSocketDisconnected(): void {
    logger.warn(`ComfyUI WebSocket disconnected for connector ${this.connector_id}`);
  }

  async updateConfiguration(config: any): Promise<void> {
    this.config = { ...this.config, ...config };

    // Update HTTP settings if base URL changed
    if (config.base_url || config.settings?.http_base_url) {
      this.httpBaseUrl = config.settings?.http_base_url || config.base_url || this.httpBaseUrl;
      // Access setupHttpClient through parent
      (this as any).setupHttpClient();
    }

    logger.info(`Updated configuration for ComfyUI connector ${this.connector_id}`);
  }

  getConfiguration(): HybridConnectorConfig {
    return { ...this.config } as HybridConnectorConfig;
  }
}
