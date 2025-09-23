import {
  JobData,
  JobResult,
  ProgressCallback,
  ConnectorConfig,
  ServiceInfo,
  HealthCheckCapabilities,
  ServiceJobStatus,
  ServiceSupportValidation,
  logger,
} from '@emp/core';
import { BaseConnector } from './base-connector.js';

/**
 * Mock connector for testing retry completion without external dependencies
 */
export class MockConnector extends BaseConnector {
  service_type = 'mock';
  version = '1.0.0';

  constructor(connectorId: string, serviceConfig?: any) {
    super(connectorId, serviceConfig);
  }

  async initialize(): Promise<void> {
    logger.info(`Initializing Mock connector ${this.connector_id}`);
  }

  async cleanup(): Promise<void> {
    logger.info(`Cleaning up Mock connector ${this.connector_id}`);
  }

  protected async initializeService(): Promise<void> {
    // Mock service doesn't need initialization
  }

  protected async cleanupService(): Promise<void> {
    // Mock service doesn't need cleanup
  }

  protected async processJobImpl(jobData: JobData, progressCallback: ProgressCallback): Promise<JobResult> {
    // This implementation will be called by the base class
    return this.processJob(jobData, progressCallback);
  }

  async checkHealth(): Promise<boolean> {
    return true;
  }

  async getAvailableModels(): Promise<string[]> {
    return ['mock-model'];
  }

  async getServiceInfo(): Promise<ServiceInfo> {
    return {
      service_name: 'Mock Service',
      service_version: this.version,
      base_url: 'mock://localhost',
      status: 'online',
      capabilities: {
        supported_formats: ['json'],
        supported_models: ['mock-model'],
        features: ['testing'],
        concurrent_jobs: 1,
      },
    };
  }

  async canProcessJob(jobData: JobData): Promise<boolean> {
    return jobData.type === 'mock' || jobData.payload?.service_required === 'mock';
  }

  async processJob(jobData: JobData, progressCallback: ProgressCallback): Promise<JobResult> {
    const startTime = Date.now();

    // Extract parameters from payload
    const { delay_ms = 100, should_fail = false, test_data = 'Mock test successful' } = jobData.payload || {};

    logger.info(`🎭 MOCK CONNECTOR: Processing job ${jobData.id}`, {
      delay_ms,
      should_fail,
      test_data,
      retry_attempt: (jobData.metadata as any)?.workflow_context?.retry_attempt || 0,
    });

    // Report initial progress
    await progressCallback({
      job_id: jobData.id,
      progress: 10,
      message: 'Starting mock processing',
      current_step: 'initializing',
    });

    // Simulate processing delay
    const delayMs = typeof delay_ms === 'number' ? delay_ms : parseInt(String(delay_ms)) || 0;
    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    // Report progress
    await progressCallback({
      job_id: jobData.id,
      progress: 80,
      message: 'Mock processing complete',
      current_step: 'processing',
    });

    // Simulate failure if requested
    if (should_fail) {
      logger.info(`🎭 MOCK CONNECTOR: Simulating failure for job ${jobData.id}`);
      return {
        success: false,
        error: 'Mock failure requested',
        processing_time_ms: Date.now() - startTime,
      };
    }

    // Return a fixed test image URL (using a placeholder image service)
    const mockUrl = `https://via.placeholder.com/512x512.png?text=Mock+Test+${jobData.id}`;

    logger.info(`🎭 MOCK CONNECTOR: Job ${jobData.id} completed successfully`, {
      mockUrl,
      processingTime: Date.now() - startTime,
    });

    // Final progress update
    await progressCallback({
      job_id: jobData.id,
      progress: 100,
      message: 'Mock job completed',
      current_step: 'completed',
    });

    // Return successful result
    return {
      success: true,
      data: {
        test_data,
        mock_url: mockUrl,
        processing_time_ms: Date.now() - startTime,
      },
      processing_time_ms: Date.now() - startTime,
    };
  }

  async cancelJob(jobId: string): Promise<void> {
    logger.info(`Cancelling mock job ${jobId}`);
  }

  async updateConfiguration(config: ConnectorConfig): Promise<void> {
    logger.info(`Updating mock connector configuration`);
  }

  getConfiguration(): ConnectorConfig {
    return {
      connector_id: this.connector_id,
      service_type: this.service_type,
      base_url: 'mock://localhost',
      timeout_seconds: 30,
      retry_attempts: 3,
      retry_delay_seconds: 1,
      health_check_interval_seconds: 30,
      max_concurrent_jobs: 1,
    };
  }

  setRedisConnection(redis: any, workerId: string, machineId?: string): void {
    // Mock connector doesn't need Redis connection
  }

  getHealthCheckCapabilities(): HealthCheckCapabilities {
    return {
      supportsBasicHealthCheck: true,
      basicHealthCheckEndpoint: '/health',
      supportsJobStatusQuery: false,
      supportsJobCancellation: false,
      supportsServiceRestart: false,
      supportsQueueIntrospection: false,
    };
  }

  async queryJobStatus(serviceJobId: string): Promise<ServiceJobStatus> {
    return {
      serviceJobId,
      status: 'completed',
      canReconnect: false,
      canCancel: false,
    };
  }

  async validateServiceSupport(): Promise<ServiceSupportValidation> {
    return {
      isSupported: true,
      supportLevel: 'full',
      missingCapabilities: [],
      warnings: [],
      errors: [],
      recommendedAction: 'proceed',
    };
  }
}