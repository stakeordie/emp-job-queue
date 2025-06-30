// REST Async Connector - asynchronous REST API connector with polling
// Direct port from Python worker/connectors/rest_async_connector.py

import axios, { AxiosInstance } from 'axios';
import {
  ConnectorInterface,
  JobData,
  JobResult,
  ProgressCallback,
  RestConnectorConfig,
} from '../../core/types/connector.js';
import { logger } from '../../core/utils/logger.js';

export class RestAsyncConnector implements ConnectorInterface {
  connector_id: string;
  service_type = 'rest_async';
  version = '1.0.0';
  private config: RestConnectorConfig;
  private httpClient: AxiosInstance;

  constructor(connectorId: string) {
    this.connector_id = connectorId;

    // Configuration with async-specific settings
    this.config = {
      connector_id: this.connector_id,
      service_type: this.service_type as 'rest_async',
      base_url: process.env.WORKER_REST_ASYNC_BASE_URL || 'http://localhost:8080',
      timeout_seconds: parseInt(process.env.WORKER_REST_ASYNC_TIMEOUT_SECONDS || '300'), // Longer timeout for async
      retry_attempts: parseInt(process.env.WORKER_REST_ASYNC_RETRY_ATTEMPTS || '3'),
      retry_delay_seconds: parseInt(process.env.WORKER_REST_ASYNC_RETRY_DELAY_SECONDS || '2'),
      health_check_interval_seconds: 30,
      max_concurrent_jobs: parseInt(process.env.WORKER_REST_ASYNC_MAX_CONCURRENT_JOBS || '10'),
      settings: {
        method:
          (process.env.WORKER_REST_ASYNC_METHOD as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE') ||
          'POST',
        response_format:
          (process.env.WORKER_REST_ASYNC_RESPONSE_FORMAT as 'json' | 'binary' | 'text') || 'json',
        polling_interval_ms: parseInt(process.env.WORKER_REST_ASYNC_POLLING_INTERVAL_MS || '2000'),
        completion_endpoint: process.env.WORKER_REST_ASYNC_COMPLETION_ENDPOINT || '/status',
        status_field: process.env.WORKER_REST_ASYNC_STATUS_FIELD || 'status',
        result_field: process.env.WORKER_REST_ASYNC_RESULT_FIELD || 'result',
      },
    };

    // Initialize HTTP client
    this.httpClient = axios.create({
      baseURL: this.config.base_url,
      timeout: this.config.timeout_seconds * 1000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `emp-redis-worker/${this.version}`,
      },
    });
  }

  async initialize(): Promise<void> {
    logger.info(
      `Initializing REST Async connector ${this.connector_id} at ${this.config.base_url}`
    );
    logger.info(
      `REST Async settings: ${this.config.settings.method} requests with ${this.config.settings.polling_interval_ms}ms polling`
    );
  }

  async cleanup(): Promise<void> {
    logger.info(`Cleaning up REST Async connector ${this.connector_id}`);
  }

  async checkHealth(): Promise<boolean> {
    try {
      const healthUrl = process.env.WORKER_REST_ASYNC_HEALTH_URL || '/health';
      const response = await this.httpClient.get(healthUrl);
      return response.status >= 200 && response.status < 300;
    } catch (error) {
      logger.debug(`REST Async health check failed:`, error);
      return false;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    return ['rest-async-generic'];
  }

  async getServiceInfo(): Promise<Record<string, unknown>> {
    return {
      service_name: 'REST Async Service',
      service_version: this.version,
      base_url: this.config.base_url,
      status: (await this.checkHealth()) ? 'online' : 'offline',
      capabilities: {
        supported_formats: ['json', 'text', 'binary'],
        supported_models: await this.getAvailableModels(),
        features: ['asynchronous_requests', 'status_polling', 'long_running_jobs'],
        concurrent_jobs: this.config.max_concurrent_jobs,
      },
      configuration: {
        method: this.config.settings.method,
        response_format: this.config.settings.response_format,
        polling_interval_ms: this.config.settings.polling_interval_ms,
        completion_endpoint: this.config.settings.completion_endpoint,
        timeout_seconds: this.config.timeout_seconds,
      },
    };
  }

  async canProcessJob(jobData: JobData): Promise<boolean> {
    return (
      jobData.type === 'rest_async' ||
      jobData.type === this.service_type ||
      (jobData.payload?.endpoint !== undefined && jobData.payload?.async === true)
    );
  }

  async processJob(jobData: JobData, progressCallback: ProgressCallback): Promise<JobResult> {
    const startTime = Date.now();
    logger.info(`Starting REST Async job ${jobData.id}`);

    try {
      // Extract configuration from job payload
      const endpoint = jobData.payload.endpoint || '/';
      const method = jobData.payload.method || this.config.settings.method;
      const requestData = jobData.payload.data || jobData.payload.body || {};
      const headers = jobData.payload.headers || {};

      // Report initial progress
      await progressCallback({
        job_id: jobData.id,
        progress: 5,
        message: `Submitting async ${method} request to ${endpoint}`,
        current_step: 'Submitting request',
      });

      // Submit the async job
      const submissionResponse = await this.submitAsyncJob(endpoint, method, requestData, headers);
      const jobToken = this.extractJobToken(submissionResponse);

      await progressCallback({
        job_id: jobData.id,
        progress: 15,
        message: `Job submitted with token: ${jobToken}`,
        current_step: 'Job submitted',
      });

      // Poll for completion
      const result = await this.pollForCompletion(jobToken, jobData.id, progressCallback);

      const processingTime = Date.now() - startTime;

      // Final progress update
      await progressCallback({
        job_id: jobData.id,
        progress: 100,
        message: 'Async job completed successfully',
        current_step: 'Finished',
      });

      logger.info(`REST Async job ${jobData.id} completed in ${processingTime}ms`);

      return {
        success: true,
        data: result,
        metadata: {
          job_token: jobToken,
          endpoint,
          method,
          processing_time_ms: processingTime,
        },
        processing_time_ms: processingTime,
        service_metadata: {
          service_version: this.version,
          processing_stats: {
            endpoint,
            method,
            job_token: jobToken,
            polling_cycles: Math.floor(
              processingTime / (this.config.settings.polling_interval_ms || 2000)
            ),
          },
        },
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error(`REST Async job ${jobData.id} failed:`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'REST Async request failed',
        metadata: {
          endpoint: jobData.payload.endpoint,
          method: jobData.payload.method || this.config.settings.method,
        },
        processing_time_ms: processingTime,
        service_metadata: {
          service_version: this.version,
        },
      };
    }
  }

  async cancelJob(jobId: string): Promise<void> {
    logger.info(`Cancelling REST Async job ${jobId}`);
    // In a real implementation, you might need to call a cancellation endpoint
  }

  private async submitAsyncJob(
    endpoint: string,
    method: string,
    data: unknown,
    headers: Record<string, string>
  ): Promise<Record<string, unknown>> {
    try {
      const response = await this.httpClient.request({
        url: endpoint,
        method: method,
        data: method !== 'GET' ? data : undefined,
        params: method === 'GET' ? data : undefined,
        headers,
      });

      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Async job submission failed with status ${response.status}`);
      }

      return response.data;
    } catch (error) {
      logger.error('Failed to submit async job:', error);
      throw error;
    }
  }

  private extractJobToken(response: Record<string, unknown>): string {
    // Try various common patterns for job tokens/IDs
    const token =
      response.job_id ||
      response.jobId ||
      response.id ||
      response.token ||
      response.task_id ||
      response.taskId;

    if (!token) {
      throw new Error('No job token found in submission response');
    }

    return String(token);
  }

  private async pollForCompletion(
    jobToken: string,
    jobId: string,
    progressCallback: ProgressCallback
  ): Promise<Record<string, unknown>> {
    const maxPolls = Math.floor(
      (this.config.timeout_seconds * 1000) / (this.config.settings.polling_interval_ms || 2000)
    );
    let polls = 0;

    while (polls < maxPolls) {
      try {
        // Get status from completion endpoint
        const statusResponse = await this.httpClient.get(
          `${this.config.settings.completion_endpoint}/${jobToken}`
        );

        const statusData = statusResponse.data;
        const status = this.extractStatus(statusData);
        const progress = this.extractProgress(statusData);

        // Update progress
        await progressCallback({
          job_id: jobId,
          progress: Math.round(15 + progress * 0.8), // Map progress to 15-95% range
          message: `Async job ${status}: ${progress}%`,
          current_step: `Status: ${status}`,
          estimated_completion_ms: this.estimateCompletion(progress, polls),
        });

        // Check for completion
        if (this.isJobComplete(status)) {
          const result = this.extractResult(statusData);
          return result;
        }

        // Check for failure
        if (this.isJobFailed(status)) {
          const error = this.extractError(statusData);
          throw new Error(`Async job failed: ${error}`);
        }

        // Wait before next poll
        await this.sleep(this.config.settings.polling_interval_ms || 2000);
        polls++;
      } catch (error) {
        logger.error(`Failed to poll status for job token ${jobToken}:`, error);

        // If it's a status polling error, retry
        if (polls < maxPolls - 1) {
          await this.sleep(this.config.settings.polling_interval_ms || 2000);
          polls++;
          continue;
        } else {
          throw error;
        }
      }
    }

    throw new Error(
      `Async job ${jobToken} timed out after ${(maxPolls * (this.config.settings.polling_interval_ms || 2000)) / 1000} seconds`
    );
  }

  private extractStatus(data: Record<string, unknown>): string {
    const statusField = this.config.settings.status_field || 'status';
    return String(data[statusField]) || String(data.status) || 'unknown';
  }

  private extractProgress(data: Record<string, unknown>): number {
    // Try to extract progress percentage
    const progress = data.progress || data.percentage || data.percent || 0;
    return Math.min(100, Math.max(0, Number(progress)));
  }

  private extractResult(data: Record<string, unknown>): unknown {
    const resultField = this.config.settings.result_field || 'result';
    return data[resultField] || data.result || data.data || data;
  }

  private extractError(data: Record<string, unknown>): string {
    return (
      String(data.error) || String(data.error_message) || String(data.message) || 'Unknown error'
    );
  }

  private isJobComplete(status: string): boolean {
    const completedStatuses = ['completed', 'finished', 'done', 'success', 'successful'];
    return completedStatuses.includes(status.toLowerCase());
  }

  private isJobFailed(status: string): boolean {
    const failedStatuses = ['failed', 'error', 'cancelled', 'timeout', 'aborted'];
    return failedStatuses.includes(status.toLowerCase());
  }

  private estimateCompletion(progress: number, polls: number): number | undefined {
    if (progress <= 0 || polls <= 0) return undefined;

    const timePerPercent = (polls * (this.config.settings.polling_interval_ms || 2000)) / progress;
    const remainingPercent = 100 - progress;
    return remainingPercent * timePerPercent;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async updateConfiguration(config: RestConnectorConfig): Promise<void> {
    this.config = { ...this.config, ...config };

    // Recreate HTTP client if base URL changed
    if (config.base_url) {
      this.httpClient = axios.create({
        baseURL: this.config.base_url,
        timeout: this.config.timeout_seconds * 1000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': `emp-redis-worker/${this.version}`,
          ...(this.config.custom_headers || {}),
        },
      });
    }

    logger.info(`Updated configuration for REST Async connector ${this.connector_id}`);
  }

  getConfiguration(): RestConnectorConfig {
    return { ...this.config };
  }
}
