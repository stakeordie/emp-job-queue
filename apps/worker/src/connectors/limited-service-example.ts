// Example Limited Service Connector - Demonstrates what happens when a service lacks required APIs
// This shows how a service WITHOUT job status querying fails validation

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

export class LimitedServiceConnector extends BaseConnector {
  public service_type = 'limited_service';
  public version = '1.0.0';

  constructor(connectorId: string, config?: Partial<ConnectorConfig>) {
    super(connectorId, config);
  }

  // ============================================================================
  // Health Check Framework Implementation - LIMITED SERVICE
  // ============================================================================

  getHealthCheckCapabilities(): HealthCheckCapabilities {
    return {
      // This service only has basic health checking
      supportsBasicHealthCheck: true,
      basicHealthCheckEndpoint: '/health',

      // ❌ CRITICAL MISSING: Cannot query job status
      supportsJobStatusQuery: false,
      // No jobStatusQueryEndpoint available

      // ❌ Cannot cancel jobs
      supportsJobCancellation: false,

      // ❌ Cannot restart service
      supportsServiceRestart: false,

      // ❌ Cannot introspect queue
      supportsQueueIntrospection: false,

      // This service has minimal API capabilities
      customHealthCheckRequirements: [
        'Service only supports fire-and-forget job submission',
        'No job tracking or status querying available',
      ],
      minimumApiVersion: '0.1.0',
    };
  }

  async queryJobStatus(serviceJobId: string): Promise<ServiceJobStatus> {
    // This service doesn't support job status querying
    throw new Error(
      `${this.service_type} does not support job status querying. ` +
        `Service lacks the required API endpoints for failure recovery. ` +
        `This connector cannot be used in production without job status querying capabilities.`
    );
  }

  // ============================================================================
  // Override health check class to require only MINIMAL support
  // ============================================================================

  protected getRequiredHealthCheckClass(): HealthCheckClass {
    // This connector accepts minimal support (no failure recovery)
    return HealthCheckClass.MINIMAL;
  }

  // ============================================================================
  // Service-Specific Implementation
  // ============================================================================

  protected async initializeService(): Promise<void> {
    logger.warn(
      `Initializing ${this.service_type} connector with LIMITED capabilities. ` +
        `This connector cannot provide failure recovery and should only be used for development/testing.`
    );

    const isHealthy = await this.checkHealth();
    if (!isHealthy) {
      throw new Error(`${this.service_type} service is not responding to health checks`);
    }
  }

  protected async cleanupService(): Promise<void> {
    logger.info(`Cleaning up ${this.service_type} connector`);
  }

  async checkHealth(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout_seconds * 1000);

      const response = await fetch(`${this.config.base_url}/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      logger.debug(`${this.service_type} health check failed:`, error);
      return false;
    }
  }

  async getServiceInfo(): Promise<ServiceInfo> {
    return {
      service_name: 'Limited Service',
      service_version: '1.0.0',
      base_url: this.config.base_url,
      status: 'online',
      capabilities: {
        supported_formats: ['json'],
        supported_models: ['basic'],
        features: ['fire_and_forget_processing'],
      },
    };
  }

  // Placeholder implementations
  async getAvailableModels(): Promise<string[]> {
    return ['basic'];
  }
  async canProcessJob(jobData: JobData): Promise<boolean> {
    return true;
  }
  async cancelJob(jobId: string): Promise<void> {
    throw new Error(`${this.service_type} does not support job cancellation`);
  }
  async updateConfiguration(config: ConnectorConfig): Promise<void> {}
  getConfiguration(): ConnectorConfig {
    return this.config;
  }

  protected async processJobImpl(
    jobData: JobData,
    progressCallback: ProgressCallback
  ): Promise<JobResult> {
    // Fire-and-forget processing
    logger.warn(
      `Processing job ${jobData.id} with ${this.service_type} - ` +
        `NO FAILURE RECOVERY POSSIBLE due to service limitations`
    );

    return {
      success: true,
      processing_time_ms: 500,
      service_metadata: {
        service_version: this.version,
        // ❌ No service_job_id because service doesn't provide job tracking
      },
    };
  }
}

// Example of what happens when you try to use this connector:
/*
During initialization:

1. validateServiceSupport() runs
2. Checks that service requires jobStatusQuery but doesn't support it
3. With STANDARD health check class (default):
   - Validation fails with error: "Service does not support job status querying - connector cannot implement failure recovery"
   - recommendedAction: 'fail'
   - Connector initialization throws error

4. With MINIMAL health check class (overridden):
   - Validation passes with warnings
   - supportLevel: 'minimal'
   - failureRecoveryCapable: false
   - Connector initializes but with limitations logged

This ensures that:
- Production systems require services with proper APIs
- Development/testing can use limited services with clear warnings
- Missing capabilities are clearly documented and fail fast
*/
