// Example ComfyUI Connector - Demonstrates health check framework implementation
// This shows how a service with full API support implements the framework

import { BaseConnector } from './base-connector.js';
import {
  HealthCheckCapabilities,
  ServiceJobStatus,
  HealthCheckClass,
  ServiceInfo,
  JobData,
  JobResult,
  ProgressCallback,
  ConnectorConfig,
  logger,
} from '@emp/core';
import fetch from 'node-fetch';

export class ComfyUIConnector extends BaseConnector {
  public service_type = 'comfyui';
  public version = '1.0.0';

  constructor(connectorId: string, config?: Partial<ConnectorConfig>) {
    super(connectorId, config);
  }

  // ============================================================================
  // Health Check Framework Implementation
  // ============================================================================

  getHealthCheckCapabilities(): HealthCheckCapabilities {
    return {
      // ComfyUI has excellent API support
      supportsBasicHealthCheck: true,
      basicHealthCheckEndpoint: '/system_stats',

      // Can query job status via prompt history
      supportsJobStatusQuery: true,
      jobStatusQueryEndpoint: '/history/{prompt_id}',
      jobStatusQueryMethod: 'GET',

      // Can cancel jobs via interrupt
      supportsJobCancellation: true,
      jobCancellationEndpoint: '/interrupt',
      jobCancellationMethod: 'POST',

      // Cannot restart ComfyUI service itself
      supportsServiceRestart: false,

      // Can introspect queue status
      supportsQueueIntrospection: true,
      queueIntrospectionEndpoint: '/queue',

      // ComfyUI specific requirements
      customHealthCheckRequirements: [
        'WebSocket connection for real-time updates',
        'Model directory access for model verification',
      ],
      minimumApiVersion: '1.0.0',
    };
  }

  async queryJobStatus(serviceJobId: string): Promise<ServiceJobStatus> {
    try {
      const response = await fetch(`${this.config.base_url}/history/${serviceJobId}`);

      if (!response.ok) {
        if (response.status === 404) {
          return {
            serviceJobId,
            status: 'unknown',
            canReconnect: false,
            canCancel: false,
            errorMessage: 'Job not found in ComfyUI history',
          };
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const history = (await response.json()) as any;
      const jobData = history[serviceJobId];

      if (!jobData) {
        return {
          serviceJobId,
          status: 'unknown',
          canReconnect: false,
          canCancel: false,
          errorMessage: 'Job ID not found in history response',
        };
      }

      // Parse ComfyUI job status - SIMPLE APPROACH
      const outputs = jobData.outputs;
      const status_info = jobData.status;

      let status: ServiceJobStatus['status'];

      if (status_info?.completed === true) {
        // Only case we DON'T requeue - job actually completed
        status = 'completed';
      } else if (status_info?.error) {
        // Failed - will be requeued
        status = 'failed';
      } else if (outputs && Object.keys(outputs).length > 0) {
        // Has outputs but not marked complete - still processing, will be requeued
        status = 'running';
      } else {
        // In queue or just started - will be requeued
        status = 'pending';
      }

      // Simple logic: Only completed jobs avoid requeuing
      const isCompleted = status === 'completed';

      return {
        serviceJobId,
        status,
        canReconnect: false, // We don't reconnect - simpler to requeue
        canCancel: !isCompleted, // Can only cancel if not completed
        startedAt: status_info?.started_at,
        completedAt: isCompleted ? status_info?.completed_at : undefined,
        errorMessage: status_info?.error?.message,
        metadata: {
          outputs: outputs ? Object.keys(outputs) : [],
          queue_position: status_info?.queue_position,
          execution_time: status_info?.execution_time,
          will_requeue: !isCompleted, // Clear indication of what happens next
        },
      };
    } catch (error) {
      logger.error(`Failed to query ComfyUI job status for ${serviceJobId}:`, error);
      return {
        serviceJobId,
        status: 'unknown',
        canReconnect: false,
        canCancel: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error querying job status',
      };
    }
  }

  // ============================================================================
  // Service-Specific Implementation
  // ============================================================================

  protected async initializeService(): Promise<void> {
    // ComfyUI-specific initialization
    logger.info(`Initializing ComfyUI connector to ${this.config.base_url}`);

    // Test basic connectivity
    const isHealthy = await this.checkHealth();
    if (!isHealthy) {
      throw new Error('ComfyUI service is not responding to health checks');
    }
  }

  protected async cleanupService(): Promise<void> {
    // ComfyUI-specific cleanup
    logger.info('Cleaning up ComfyUI connector');
  }

  async checkHealth(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout_seconds * 1000);

      const response = await fetch(`${this.config.base_url}/system_stats`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      logger.debug(`ComfyUI health check failed:`, error);
      return false;
    }
  }

  async getServiceInfo(): Promise<ServiceInfo> {
    try {
      const response = await fetch(`${this.config.base_url}/system_stats`);
      const stats = (await response.json()) as any;

      return {
        service_name: 'ComfyUI',
        service_version: stats.comfyui_version || 'unknown',
        api_version: '1.0.0',
        base_url: this.config.base_url,
        status: response.ok ? 'online' : 'error',
        capabilities: {
          supported_formats: ['png', 'jpg', 'webp'],
          supported_models: [], // Would query /object_info for models
          features: ['text2img', 'img2img', 'controlnet', 'workflows'],
          hardware_acceleration: stats.devices || [],
          concurrent_jobs: 1, // ComfyUI typically processes one job at a time
        },
        resource_usage: {
          cpu_usage: stats.system?.cpu_usage || 0,
          memory_usage_mb: stats.system?.ram_used || 0,
          gpu_usage: stats.devices?.[0]?.vram_used_percent || 0,
          vram_total_mb: stats.devices?.[0]?.vram_total || 0,
          vram_used_mb: stats.devices?.[0]?.vram_used || 0,
        },
      };
    } catch (error) {
      return {
        service_name: 'ComfyUI',
        service_version: 'unknown',
        base_url: this.config.base_url,
        status: 'error',
        capabilities: {
          supported_formats: [],
          supported_models: [],
          features: [],
        },
      };
    }
  }

  // Placeholder implementations for required methods
  async getAvailableModels(): Promise<string[]> {
    return [];
  }
  async canProcessJob(jobData: JobData): Promise<boolean> {
    return true;
  }
  async cancelJob(jobId: string): Promise<void> {}
  async updateConfiguration(config: ConnectorConfig): Promise<void> {}
  getConfiguration(): ConnectorConfig {
    return this.config;
  }

  protected async processJobImpl(
    jobData: JobData,
    progressCallback: ProgressCallback
  ): Promise<JobResult> {
    // ComfyUI job processing implementation would go here
    return {
      success: true,
      processing_time_ms: 1000,
      service_metadata: {
        service_version: this.version,
        service_job_id: 'example-prompt-id',
      },
    };
  }
}
