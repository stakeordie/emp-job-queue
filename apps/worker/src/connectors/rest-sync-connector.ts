// REST Sync Connector - synchronous REST API connector
// Direct port from Python worker/connectors/rest_sync_connector.py

import axios, { AxiosInstance } from 'axios';
import {
  ConnectorInterface,
  JobData,
  JobResult,
  ProgressCallback,
  ConnectorConfig,
  ServiceInfo,
  logger,
  HealthCheckCapabilities,
  ServiceJobStatus,
  ServiceSupportValidation,
} from '@emp/core';

// REST Sync Connector Configuration (flexible like AsyncRESTConnector)
export interface RestSyncConnectorConfig extends ConnectorConfig {
  // Base connector fields are inherited from ConnectorConfig
  
  // HTTP authentication configuration
  auth?: {
    type: 'none' | 'api_key' | 'bearer' | 'basic';
    api_key?: string;
    api_key_header?: string; // Default: 'Authorization'
    bearer_token?: string;
    username?: string;
    password?: string;
    token?: string;
  };
  
  // HTTP client configuration
  user_agent?: string;
  accept_header?: string;
  content_type?: string;
  custom_headers?: Record<string, string>;
  
  // Request/Response configuration
  request_timeout_ms?: number;
  max_request_size_bytes?: number;
  max_response_size_bytes?: number;
  
  // REST sync settings
  settings?: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    response_format?: 'json' | 'text' | 'binary';
  };
}

export class RestSyncConnector implements ConnectorInterface {
  connector_id: string;
  service_type: string;
  version = '1.0.0';
  protected config: RestSyncConnectorConfig;
  protected httpClient: AxiosInstance;

  constructor(connectorId: string, config?: RestSyncConnectorConfig) {
    this.connector_id = connectorId;
    
    // Use provided config or create default config
    this.config = config || {
      connector_id: connectorId,
      service_type: 'rest_sync',
      base_url: process.env.WORKER_REST_SYNC_BASE_URL || 'http://localhost:8080',
      timeout_seconds: parseInt(process.env.WORKER_REST_SYNC_TIMEOUT_SECONDS || '60'),
      retry_attempts: parseInt(process.env.WORKER_REST_SYNC_RETRY_ATTEMPTS || '3'),
      retry_delay_seconds: parseInt(process.env.WORKER_REST_SYNC_RETRY_DELAY_SECONDS || '2'),
      health_check_interval_seconds: 30,
      max_concurrent_jobs: parseInt(process.env.WORKER_REST_SYNC_MAX_CONCURRENT_JOBS || '5'),
      settings: {
        method: (process.env.WORKER_REST_SYNC_METHOD as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE') || 'POST',
        response_format: (process.env.WORKER_REST_SYNC_RESPONSE_FORMAT as 'json' | 'text' | 'binary') || 'json',
      },
    };
    
    // Set service_type from config
    this.service_type = this.config.service_type;

    // Initialize HTTP client
    this.httpClient = axios.create({
      baseURL: this.config.base_url,
      timeout: (this.config.request_timeout_ms || this.config.timeout_seconds * 1000),
      maxContentLength: this.config.max_response_size_bytes || 10 * 1024 * 1024, // 10MB
      maxBodyLength: this.config.max_request_size_bytes || 10 * 1024 * 1024, // 10MB
      headers: {
        'User-Agent': this.config.user_agent || `emp-redis-worker/${this.version}`,
        'Accept': this.config.accept_header || 'application/json',
        'Content-Type': this.config.content_type || 'application/json',
        ...this.config.custom_headers,
      },
    });

    // Configure authentication
    this.configureAuth();
  }

  private configureAuth(): void {
    const auth = this.config.auth;
    if (!auth || auth.type === 'none') return;

    switch (auth.type) {
      case 'bearer':
        if (auth.bearer_token || auth.token) {
          this.httpClient.defaults.headers.common['Authorization'] = `Bearer ${auth.bearer_token || auth.token}`;
        }
        break;
      case 'api_key':
        if (auth.api_key) {
          const header = auth.api_key_header || 'Authorization';
          this.httpClient.defaults.headers.common[header] = auth.api_key;
        }
        break;
      case 'basic':
        if (auth.username && auth.password) {
          const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
          this.httpClient.defaults.headers.common['Authorization'] = `Basic ${credentials}`;
        }
        break;
    }
  }

  async initialize(): Promise<void> {
    logger.info(`Initializing REST Sync connector ${this.connector_id} at ${this.config.base_url}`);
    logger.info(
      `REST Sync settings: ${this.config.settings?.method || 'POST'} requests, ${this.config.settings?.response_format || 'json'} responses`
    );
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

  async getServiceInfo(): Promise<ServiceInfo> {
    return {
      service_name: 'REST Sync Service',
      service_version: this.version,
      base_url: this.config.base_url,
      status: (await this.checkHealth()) ? 'online' : 'offline',
      capabilities: {
        supported_formats: ['json', 'text', 'binary'],
        supported_models: await this.getAvailableModels(),
        features: ['synchronous_requests', 'configurable_endpoints', 'retry_logic'],
        concurrent_jobs: this.config.max_concurrent_jobs,
      },
    };
  }

  async canProcessJob(jobData: JobData): Promise<boolean> {
    return (
      jobData.type === 'rest_sync' ||
      jobData.type === this.service_type ||
      jobData.payload?.endpoint !== undefined
    );
  }

  async processJob(jobData: JobData, progressCallback: ProgressCallback): Promise<JobResult> {
    const startTime = Date.now();
    logger.info(`Starting REST Sync job ${jobData.id}`);

    try {
      // Extract endpoint and request configuration from job payload
      const endpoint = String(jobData.payload.endpoint || '/');
      const method = String(jobData.payload.method || this.config.settings?.method || 'POST');
      const requestData = jobData.payload.data || jobData.payload.body || {};
      const headers = (jobData.payload.headers as Record<string, string>) || {};

      // Report initial progress
      await progressCallback({
        job_id: jobData.id,
        progress: 10,
        message: `Preparing ${method} request to ${endpoint}`,
        current_step: 'Initializing request',
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
        current_step: 'Finished',
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
          response_size: JSON.stringify(result.data).length,
        },
        processing_time_ms: processingTime,
        service_metadata: {
          service_version: this.version,
          processing_stats: {
            endpoint,
            method,
            status_code: result.status,
            response_size_bytes: JSON.stringify(result.data).length,
            retry_attempts_used: 0, // Would be tracked in actual retry implementation
          },
        },
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error(`REST Sync job ${jobData.id} failed:`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'REST Sync request failed',
        metadata: {
          endpoint: jobData.payload.endpoint,
          method: jobData.payload.method || this.config.settings?.method || 'POST',
        },
        processing_time_ms: processingTime,
        service_metadata: {
          service_version: this.version,
        },
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
  ): Promise<Record<string, unknown>> {
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
          current_step: `Attempt ${attempt + 1}`,
        });

        // Make the actual request
        const response = await this.httpClient.request({
          url: endpoint,
          method: method,
          data: method !== 'GET' ? data : undefined,
          params: method === 'GET' ? data : undefined,
          headers,
        });

        // Success - return response
        return {
          status: response.status,
          headers: response.headers,
          data: response.data,
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

  async updateConfiguration(config: RestSyncConnectorConfig): Promise<void> {
    this.config = { ...this.config, ...config };

    // Update service_type if changed
    if (config.service_type) {
      this.service_type = config.service_type;
    }

    // Recreate HTTP client if base URL changed
    if (config.base_url) {
      this.httpClient = axios.create({
        baseURL: this.config.base_url,
        timeout: (this.config.request_timeout_ms || this.config.timeout_seconds * 1000),
        maxContentLength: this.config.max_response_size_bytes || 10 * 1024 * 1024,
        maxBodyLength: this.config.max_request_size_bytes || 10 * 1024 * 1024,
        headers: {
          'User-Agent': this.config.user_agent || `emp-redis-worker/${this.version}`,
          'Accept': this.config.accept_header || 'application/json',
          'Content-Type': this.config.content_type || 'application/json',
          ...this.config.custom_headers,
        },
      });

      // Reconfigure authentication
      this.configureAuth();
    }

    logger.info(`Updated configuration for REST Sync connector ${this.connector_id}`);
  }

  getConfiguration(): RestSyncConnectorConfig {
    return { ...this.config };
  }

  // Redis connection injection (required by ConnectorInterface)
  setRedisConnection(_redis: any, _workerId: string, _machineId?: string): void {
    // REST sync connector doesn't use Redis for status reporting
    // This is a no-op implementation to satisfy the interface
    logger.debug(`REST Sync connector ${this.connector_id} received Redis connection (not used)`);
  }

  // Failure recovery methods - minimal implementation for sync connector
  getHealthCheckCapabilities(): HealthCheckCapabilities {
    return {
      supportsBasicHealthCheck: true,
      basicHealthCheckEndpoint: '/health',
      supportsJobStatusQuery: false, // Sync connectors complete immediately
      supportsJobCancellation: false,
      supportsServiceRestart: false,
      supportsQueueIntrospection: false,
    };
  }

  async queryJobStatus(serviceJobId: string): Promise<ServiceJobStatus> {
    // Sync connectors complete immediately, so job status is always completed or failed
    return {
      serviceJobId,
      status: 'completed',
      canReconnect: false,
      canCancel: false,
      errorMessage: 'Synchronous connectors do not support job status queries',
    };
  }

  async validateServiceSupport(): Promise<ServiceSupportValidation> {
    return {
      isSupported: true,
      supportLevel: 'minimal',
      missingCapabilities: ['jobStatusQuery', 'jobCancellation', 'serviceRestart'],
      warnings: ['Synchronous connector - no job tracking capabilities'],
      errors: [],
      recommendedAction: 'proceed',
    };
  }
}
