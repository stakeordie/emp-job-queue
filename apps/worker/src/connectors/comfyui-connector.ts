// ComfyUI Connector - Hybrid REST + WebSocket implementation
// REST for job submission, WebSocket for real-time progress events

import { JobData, JobResult, ProgressCallback, ServiceInfo, logger } from '@emp/core';
import { RestConnector, RestConnectorConfig } from './rest-connector.js';
import WebSocket from 'ws';

export class ComfyUIConnector extends RestConnector {
  service_type = 'comfyui' as const;
  version = '1.0.0';

  constructor(connectorId: string) {
    // Build configuration from environment
    const host = process.env.WORKER_COMFYUI_HOST || 'localhost';
    const port = parseInt(process.env.WORKER_COMFYUI_PORT || '8188');
    const username = process.env.WORKER_COMFYUI_USERNAME;
    const password = process.env.WORKER_COMFYUI_PASSWORD;

    const config: Partial<RestConnectorConfig> = {
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
        method: 'POST',
        response_format: 'json',
        polling_interval_ms: 1000, // 1-second polling for responsive updates
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body_format: 'json',
      },
    };

    super(connectorId, config);
    logger.info(`ComfyUI connector ${connectorId} initialized with REST polling`);
  }

  // ============================================================================
  // Service Info and Health
  // ============================================================================

  async getServiceInfo(): Promise<ServiceInfo> {
    try {
      const systemStatsResponse = await this.makeRequest('GET', '/system_stats');
      const systemStats = await this.parseResponse(systemStatsResponse);

      return {
        service_name: 'ComfyUI',
        service_version: 'unknown', // ComfyUI doesn't expose version in API
        base_url: this.restConfig.base_url,
        status: 'online',
        capabilities: {
          supported_formats: ['png', 'jpg', 'webp'],
          supported_models: await this.getAvailableModels(),
          features: ['workflow_processing', 'progress_tracking', 'http_polling'],
          concurrent_jobs: this.restConfig.max_concurrent_jobs,
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

  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await this.makeRequest('GET', '/object_info');
      const objectInfo = await this.parseResponse(response);

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

  async canProcessJob(jobData: JobData): Promise<boolean> {
    return jobData.type === 'comfyui' && jobData.payload?.workflow !== undefined;
  }

  // ============================================================================
  // RestConnector Implementation - ComfyUI specific endpoints and logic
  // ============================================================================

  protected getHealthEndpoint(): string {
    return '/system_stats';
  }

  protected getJobEndpoint(): string {
    return '/prompt';
  }

  protected getStatusEndpoint(promptId: string): string {
    return `/history/${promptId}`;
  }

  protected getCancelEndpoint(_jobId: string): string | null {
    // ComfyUI doesn't have a direct cancel endpoint
    return null;
  }

  protected prepareJobPayload(jobData: JobData): unknown {
    const workflow = jobData.payload.workflow;
    if (!workflow) {
      throw new Error('No workflow provided in job payload');
    }

    return {
      prompt: workflow,
      extra_data: {
        client_id: this.connector_id,
      },
    };
  }

  protected isAsyncJob(responseData: unknown): boolean {
    // ComfyUI always returns a prompt_id for async processing
    return !!(responseData as any)?.prompt_id;
  }

  protected extractJobId(responseData: unknown): string {
    const promptId = (responseData as any)?.prompt_id;
    if (!promptId) {
      throw new Error('No prompt ID returned from ComfyUI');
    }
    return promptId;
  }

  protected extractJobStatus(statusData: unknown): string {
    const history = statusData as any;

    if (!history) {
      return 'queued';
    }

    if (history.status) {
      return history.status === 'success' ? 'completed' : history.status;
    }

    // If we have outputs, it's completed
    if (history.outputs && Object.keys(history.outputs).length > 0) {
      return 'completed';
    }

    return 'processing';
  }

  protected extractJobProgress(statusData: unknown): number {
    const history = statusData as any;

    if (!history) {
      return 0; // Still queued
    }

    // If we have outputs, it's 100% complete
    if (history.outputs && Object.keys(history.outputs).length > 0) {
      return 100;
    }

    // If status indicates completion
    if (history.status === 'success') {
      return 100;
    }

    // Otherwise, estimate progress based on execution state
    if (history.status === 'error') {
      return 0;
    }

    // If job exists in history but no outputs yet, assume 50% progress
    return history ? 50 : 0;
  }

  protected isJobComplete(statusData: unknown): boolean {
    const history = statusData as any;

    if (!history) {
      return false;
    }

    // Check if we have outputs (main completion indicator)
    if (history.outputs && Object.keys(history.outputs).length > 0) {
      return true;
    }

    // Check status field
    return history.status === 'success';
  }

  protected isJobFailed(statusData: unknown): boolean {
    const history = statusData as any;
    return history?.status === 'error';
  }

  protected extractJobResult(statusData: unknown): unknown {
    const history = statusData as any;

    if (!history) {
      throw new Error('No history data found');
    }

    const outputs = history.outputs || {};
    const images: string[] = [];

    // Process any image outputs
    for (const nodeId of Object.keys(outputs)) {
      const nodeOutput = outputs[nodeId];
      if (nodeOutput.images) {
        for (const image of nodeOutput.images) {
          const imageUrl = `${this.restConfig.base_url}/view?filename=${image.filename}&subfolder=${image.subfolder || ''}&type=${image.type || 'output'}`;
          images.push(imageUrl);
        }
      }
    }

    return {
      prompt_id: this.extractJobId({ prompt_id: Object.keys(history)[0] }),
      outputs,
      images,
      execution_time: history.execution_time,
      status: history.status,
    };
  }

  protected extractJobError(statusData: unknown): string {
    const history = statusData as any;
    return history?.error || history?.messages?.join(', ') || 'ComfyUI processing failed';
  }

  // ============================================================================
  // BaseConnector Abstract Method Implementations
  // ============================================================================

  async updateConfiguration(config: RestConnectorConfig): Promise<void> {
    this.restConfig = { ...this.restConfig, ...config };
    logger.info(`Updated configuration for ComfyUI connector ${this.connector_id}`);
  }

  getConfiguration(): RestConnectorConfig {
    return { ...this.restConfig };
  }

  // ============================================================================
  // ComfyUI Specific Utilities
  // ============================================================================

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
}
