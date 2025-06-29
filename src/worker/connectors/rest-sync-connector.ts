// REST Sync Connector - synchronous REST API connector
// Direct port from Python worker/connectors/rest_sync_connector.py

import axios, { AxiosInstance } from 'axios';
import { ConnectorInterface, JobData, JobResult, JobProgress, ProgressCallback, RestConnectorConfig } from '../../core/types/connector.js';
import { logger } from '../../core/utils/logger.js';

export class RestSyncConnector implements ConnectorInterface {
  connector_id: string;
  service_type = 'rest_sync';
  version = '1.0.0';
  private config: RestConnectorConfig;
  private httpClient: AxiosInstance;

  constructor(connectorId: string) {
    this.connector_id = connectorId;
    
    // Basic configuration - can be enhanced with environment variables
    this.config = {
      connector_id: this.connector_id,
      service_type: this.service_type,
      base_url: process.env.WORKER_REST_SYNC_BASE_URL || 'http://localhost:8080',
      timeout_seconds: parseInt(process.env.WORKER_REST_SYNC_TIMEOUT_SECONDS || '60'),
      retry_attempts: parseInt(process.env.WORKER_REST_SYNC_RETRY_ATTEMPTS || '3'),
      retry_delay_seconds: parseInt(process.env.WORKER_REST_SYNC_RETRY_DELAY_SECONDS || '2'),
      health_check_interval_seconds: 30,
      max_concurrent_jobs: parseInt(process.env.WORKER_REST_SYNC_MAX_CONCURRENT_JOBS || '5'),
      settings: {
        method: (process.env.WORKER_REST_SYNC_METHOD as any) || 'POST',
        response_format: (process.env.WORKER_REST_SYNC_RESPONSE_FORMAT as any) || 'json'
      }
    };

    // Initialize HTTP client
    this.httpClient = axios.create({
      baseURL: this.config.base_url,
      timeout: this.config.timeout_seconds * 1000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `emp-redis-worker/${this.version}`
      }
    });
  }

  async initialize(): Promise<void> {
    logger.info(`Initializing REST Sync connector ${this.connector_id} at ${this.config.base_url}`);
    logger.info(`REST Sync settings: ${this.config.settings.method} requests, ${this.config.settings.response_format} responses`);
  }

  async cleanup(): Promise<void> {
    logger.info(`Cleaning up REST Sync connector ${this.connector_id}`);
  }

  async checkHealth(): Promise<boolean> {
    try {
      // Try a simple GET request to the base URL or health endpoint
      const healthUrl = process.env.WORKER_REST_SYNC_HEALTH_URL || '/health';
      const response = await this.httpClient.get(healthUrl);
      return response.status >= 200 && response.status < 300;
    } catch (error) {
      logger.debug(`REST Sync health check failed:`, error);
      return false;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    // REST sync connector is generic, so no specific models
    return ['rest-sync-generic'];
  }

  async getServiceInfo(): Promise<any> {
    return {
      service_name: 'REST Sync Service',
      service_version: this.version,
      base_url: this.config.base_url,
      status: await this.checkHealth() ? 'online' : 'offline',
      capabilities: {
        supported_formats: ['json', 'text', 'binary'],
        supported_models: await this.getAvailableModels(),
        features: ['synchronous_requests', 'configurable_endpoints', 'retry_logic'],
        concurrent_jobs: this.config.max_concurrent_jobs
      },
      configuration: {
        method: this.config.settings.method,
        response_format: this.config.settings.response_format,
        timeout_seconds: this.config.timeout_seconds,
        retry_attempts: this.config.retry_attempts
      }
    };
  }

  async canProcessJob(jobData: JobData): Promise<boolean> {
    return jobData.type === 'rest_sync' || 
           jobData.type === this.service_type ||
           (jobData.payload?.endpoint !== undefined);
  }

  async processJob(jobData: JobData, progressCallback: ProgressCallback): Promise<JobResult> {
    const startTime = Date.now();
    logger.info(`Starting REST Sync job ${jobData.id}`);

    try {
      // Extract endpoint and request configuration from job payload
      const endpoint = jobData.payload.endpoint || '/';
      const method = jobData.payload.method || this.config.settings.method;
      const requestData = jobData.payload.data || jobData.payload.body || {};
      const headers = jobData.payload.headers || {};

      // Report initial progress
      await progressCallback({
        job_id: jobData.id,
        progress: 10,
        message: `Preparing ${method} request to ${endpoint}`,
        current_step: 'Initializing request'
      });

      // Make the REST request with retry logic
      const result = await this.makeRequestWithRetries(
        endpoint, 
        method, 
        requestData, 
        headers, 
        jobData.id, 
        progressCallback
      );

      const processingTime = Date.now() - startTime;

      // Final progress update
      await progressCallback({
        job_id: jobData.id,
        progress: 100,
        message: 'Request completed successfully',
        current_step: 'Finished'
      });

      logger.info(`REST Sync job ${jobData.id} completed in ${processingTime}ms`);

      return {
        success: true,
        data: result.data,
        metadata: {
          status_code: result.status,
          headers: result.headers,
          endpoint,
          method,
          response_size: JSON.stringify(result.data).length
        },
        processing_time_ms: processingTime,
        service_metadata: {
          service_version: this.version,
          processing_stats: {
            endpoint,
            method,
            status_code: result.status,
            response_size_bytes: JSON.stringify(result.data).length,
            retry_attempts_used: 0 // Would be tracked in actual retry implementation
          }
        }
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error(`REST Sync job ${jobData.id} failed:`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'REST Sync request failed',
        metadata: {
          endpoint: jobData.payload.endpoint,
          method: jobData.payload.method || this.config.settings.method
        },
        processing_time_ms: processingTime,
        service_metadata: {
          service_version: this.version
        }
      };
    }
  }

  async cancelJob(jobId: string): Promise<void> {
    logger.info(`Cancelling REST Sync job ${jobId}`);
    // REST sync jobs are typically short-lived, so cancellation is immediate
  }

  private async makeRequestWithRetries(
    endpoint: string,
    method: string,
    data: any,
    headers: Record<string, string>,
    jobId: string,
    progressCallback: ProgressCallback
  ): Promise<any> {
    const maxRetries = this.config.retry_attempts;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Update progress for each attempt
        const progress = 10 + (attempt / (maxRetries + 1)) * 80; // Progress from 10% to 90%
        await progressCallback({
          job_id: jobId,
          progress: Math.round(progress),
          message: attempt > 0 ? `Retry attempt ${attempt}/${maxRetries}` : 'Making request',
          current_step: `Attempt ${attempt + 1}`
        });

        // Make the actual request
        const response = await this.httpClient.request({
          url: endpoint,
          method: method as any,
          data: method !== 'GET' ? data : undefined,
          params: method === 'GET' ? data : undefined,
          headers
        });

        // Success - return response
        return {
          status: response.status,
          headers: response.headers,
          data: response.data
        };

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        logger.warn(`REST Sync job ${jobId} attempt ${attempt + 1} failed:`, lastError.message);

        // If this isn't the last attempt, wait before retrying
        if (attempt < maxRetries) {
          const delayMs = this.config.retry_delay_seconds * 1000 * Math.pow(2, attempt); // Exponential backoff
          await this.sleep(delayMs);
        }
      }
    }

    // All attempts failed
    throw lastError || new Error('All retry attempts failed');
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
          ...(this.config.custom_headers || {})
        }
      });
    }
    
    logger.info(`Updated configuration for REST Sync connector ${this.connector_id}`);
  }

  getConfiguration(): RestConnectorConfig {
    return { ...this.config };
  }
}