// RestConnector - Base class for REST-based service connectors
// Provides HTTP request handling, polling, and REST-specific functionality

import {
  JobData,
  JobResult,
  ProgressCallback,
  ServiceInfo,
  ConnectorConfig,
  logger,
} from '@emp/core';
import { BaseConnector } from './base-connector.js';

export interface RestConnectorConfig extends ConnectorConfig {
  settings: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    response_format: 'json' | 'text' | 'binary';
    polling_interval_ms?: number; // for async operations
    completion_endpoint?: string; // for async job status checking
    status_field?: string; // field to check for completion
    result_field?: string; // field containing the result
    headers?: Record<string, string>;
    body_format?: 'json' | 'form' | 'multipart';
  };
}

export abstract class RestConnector extends BaseConnector {
  protected restConfig: RestConnectorConfig;
  private abortController?: AbortController;

  constructor(connectorId: string, config: Partial<RestConnectorConfig>) {
    super(connectorId, config);
    this.restConfig = this.config as RestConnectorConfig;

    // Set default REST settings if not provided
    if (!this.restConfig.settings) {
      this.restConfig.settings = {
        method: 'POST',
        response_format: 'json',
        polling_interval_ms: 1000,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body_format: 'json',
      };
    }
  }

  protected async initializeService(): Promise<void> {
    // Validate REST configuration
    if (!this.restConfig.base_url) {
      throw new Error(`REST connector ${this.connector_id} missing base_url`);
    }

    // Test connection to the service
    try {
      const healthCheck = await this.checkHealth();
      if (!healthCheck) {
        logger.warn(`REST service at ${this.restConfig.base_url} failed initial health check`);
      }
    } catch (error) {
      logger.warn(`Failed to perform initial health check for ${this.connector_id}:`, error);
    }

    logger.info(`REST connector ${this.connector_id} initialized for ${this.restConfig.base_url}`);
  }

  protected async cleanupService(): Promise<void> {
    // Cancel any ongoing requests
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = undefined;
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      const healthEndpoint = this.getHealthEndpoint();
      const response = await this.makeRequest('GET', healthEndpoint);
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

    try {
      // Create abort controller for this job
      this.abortController = new AbortController();

      // Submit job to REST service
      const jobEndpoint = this.getJobEndpoint();
      const payload = this.prepareJobPayload(jobData);

      const response = await this.makeRequest(
        this.restConfig.settings.method,
        jobEndpoint,
        payload,
        this.abortController.signal
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const responseData = await this.parseResponse(response);

      // Handle synchronous vs asynchronous processing
      if (this.isAsyncJob(responseData)) {
        return await this.handleAsyncJob(jobData, responseData, progressCallback, startTime);
      } else {
        return await this.handleSyncJob(jobData, responseData, startTime);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown REST processing error',
        processing_time_ms: Date.now() - startTime,
        service_metadata: {
          service_version: this.version,
        },
      };
    } finally {
      this.abortController = undefined;
    }
  }

  async cancelJob(jobId: string): Promise<void> {
    // Cancel the HTTP request
    if (this.abortController) {
      this.abortController.abort();
    }

    // If service supports job cancellation, call the cancel endpoint
    try {
      const cancelEndpoint = this.getCancelEndpoint(jobId);
      if (cancelEndpoint) {
        await this.makeRequest('DELETE', cancelEndpoint);
        logger.info(`Cancelled REST job ${jobId}`);
      }
    } catch (error) {
      logger.warn(`Failed to cancel job ${jobId} via REST endpoint:`, error);
    }
  }

  // ============================================================================
  // HTTP Request Handling
  // ============================================================================

  protected async makeRequest(
    method: string,
    endpoint: string,
    data?: unknown,
    signal?: AbortSignal
  ): Promise<Response> {
    const url = new URL(endpoint, this.restConfig.base_url);

    const headers: Record<string, string> = {
      ...this.restConfig.settings.headers,
    };

    // Add authentication headers if configured
    if (this.restConfig.auth) {
      this.addAuthHeaders(headers);
    }

    const options: RequestInit = {
      method,
      headers,
      signal,
    };

    // Add body for non-GET requests
    if (data && method !== 'GET') {
      if (this.restConfig.settings.body_format === 'json') {
        options.body = JSON.stringify(data);
        headers['Content-Type'] = 'application/json';
      } else if (this.restConfig.settings.body_format === 'form') {
        const formData = new URLSearchParams();
        if (typeof data === 'object' && data !== null) {
          Object.entries(data as Record<string, string>).forEach(([key, value]) => {
            formData.append(key, String(value));
          });
        }
        options.body = formData;
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    }

    logger.debug(`Making ${method} request to ${url.toString()}`);
    return fetch(url.toString(), options);
  }

  protected async parseResponse(response: Response): Promise<unknown> {
    const contentType = response.headers.get('content-type') || '';

    if (
      this.restConfig.settings.response_format === 'json' ||
      contentType.includes('application/json')
    ) {
      return await response.json();
    } else if (
      this.restConfig.settings.response_format === 'text' ||
      contentType.includes('text/')
    ) {
      return await response.text();
    } else {
      // Binary response
      return await response.arrayBuffer();
    }
  }

  private addAuthHeaders(headers: Record<string, string>): void {
    if (!this.restConfig.auth) return;

    switch (this.restConfig.auth.type) {
      case 'basic':
        if (this.restConfig.auth.username && this.restConfig.auth.password) {
          const credentials = btoa(
            `${this.restConfig.auth.username}:${this.restConfig.auth.password}`
          );
          headers['Authorization'] = `Basic ${credentials}`;
        }
        break;
      case 'bearer':
        if (this.restConfig.auth.token) {
          headers['Authorization'] = `Bearer ${this.restConfig.auth.token}`;
        }
        break;
      case 'api_key':
        if (this.restConfig.auth.api_key) {
          headers['X-API-Key'] = this.restConfig.auth.api_key;
        }
        break;
    }
  }

  // ============================================================================
  // Async Job Handling
  // ============================================================================

  private async handleAsyncJob(
    jobData: JobData,
    responseData: unknown,
    progressCallback: ProgressCallback,
    startTime: number
  ): Promise<JobResult> {
    const jobId = this.extractJobId(responseData);
    let progress = 0;

    logger.info(`Started async REST job ${jobId} for ${jobData.id}`);

    // Poll for completion
    while (progress < 100) {
      await this.sleep(this.restConfig.settings.polling_interval_ms || 1000);

      try {
        const statusEndpoint = this.getStatusEndpoint(jobId);
        const statusResponse = await this.makeRequest('GET', statusEndpoint);
        const statusData = await this.parseResponse(statusResponse);

        const jobStatus = this.extractJobStatus(statusData);
        progress = this.extractJobProgress(statusData);

        await progressCallback({
          job_id: jobData.id,
          progress: Math.min(progress, 99), // Don't report 100% until we have results
          message: `Processing via REST API (${progress}%)`,
          current_step: jobStatus,
          estimated_completion_ms: this.estimateCompletion(progress, startTime),
        });

        if (this.isJobComplete(statusData)) {
          const result = this.extractJobResult(statusData);
          return {
            success: true,
            data: result,
            processing_time_ms: Date.now() - startTime,
            service_metadata: {
              service_version: this.version,
            },
          };
        }

        if (this.isJobFailed(statusData)) {
          const error = this.extractJobError(statusData);
          throw new Error(`REST job failed: ${error}`);
        }
      } catch (error) {
        logger.error(`Error polling async job ${jobId}:`, error);
        throw error;
      }
    }

    throw new Error('Async job polling timed out');
  }

  private async handleSyncJob(
    jobData: JobData,
    responseData: unknown,
    startTime: number
  ): Promise<JobResult> {
    // For synchronous jobs, the response contains the final result
    return {
      success: true,
      data: responseData,
      processing_time_ms: Date.now() - startTime,
      service_metadata: {
        service_version: this.version,
      },
    };
  }

  private estimateCompletion(progress: number, startTime: number): number {
    if (progress <= 0) return 0;
    const elapsed = Date.now() - startTime;
    const total = (elapsed * 100) / progress;
    return Math.max(0, total - elapsed);
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================================================
  // Abstract methods that service-specific connectors must implement
  // ============================================================================

  protected abstract getHealthEndpoint(): string;
  protected abstract getJobEndpoint(): string;
  protected abstract getStatusEndpoint(jobId: string): string;
  protected abstract getCancelEndpoint(jobId: string): string | null;
  protected abstract prepareJobPayload(jobData: JobData): unknown;
  protected abstract isAsyncJob(responseData: unknown): boolean;
  protected abstract extractJobId(responseData: unknown): string;
  protected abstract extractJobStatus(statusData: unknown): string;
  protected abstract extractJobProgress(statusData: unknown): number;
  protected abstract isJobComplete(statusData: unknown): boolean;
  protected abstract isJobFailed(statusData: unknown): boolean;
  protected abstract extractJobResult(statusData: unknown): unknown;
  protected abstract extractJobError(statusData: unknown): string;
}
