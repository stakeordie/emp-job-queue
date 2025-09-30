/**
 * HTTPConnector - Abstract base class for all HTTP-based connectors
 * 
 * Provides unified HTTP client management, authentication, retry logic,
 * error handling, and request/response processing for REST API services.
 * 
 * Services like OpenAI, A1111 REST, and custom APIs extend this class
 * and implement service-specific request building and response parsing.
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { BaseConnector, ConnectorConfig } from '../base-connector.js';
import { JobData, JobResult, ProgressCallback, ServiceInfo, logger, smartTruncateObject } from '@emp/core';

// Note: Telemetry imports removed - replace with WorkflowTelemetryClient if needed
type SpanContext = any; // Temporary type for build compatibility

// HTTP-specific configuration - contains base config fields
export interface HTTPConnectorConfig {
  // Base connector fields
  connector_id: string;
  service_type: string;
  base_url: string;
  timeout_seconds?: number;
  retry_attempts?: number;
  retry_delay_seconds?: number;
  health_check_interval_seconds?: number;
  max_concurrent_jobs?: number;
  
  // HTTP authentication configuration
  auth?: {
    type: 'none' | 'api_key' | 'bearer' | 'basic' | 'oauth';
    api_key?: string;
    api_key_header?: string; // Default: 'Authorization'
    bearer_token?: string;
    username?: string;
    password?: string;
    oauth_token?: string;
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
  follow_redirects?: boolean;
  max_redirects?: number;
  
  // Polling configuration for async jobs
  polling_enabled?: boolean;
  polling_interval_ms?: number;
  polling_timeout_seconds?: number;
  status_endpoint?: string; // e.g., '/queue' or '/status/{id}'
  
  // Advanced HTTP options
  keep_alive?: boolean;
  connection_pool_size?: number;
  retry_on_status_codes?: number[];
}

// Standard HTTP error categories for consistent error handling
export enum HTTPErrorCategory {
  AUTHENTICATION = 'authentication',
  RATE_LIMIT = 'rate_limit',
  SERVICE_UNAVAILABLE = 'service_unavailable',
  BAD_REQUEST = 'bad_request',
  NOT_FOUND = 'not_found',
  TIMEOUT = 'timeout',
  NETWORK_ERROR = 'network_error',
  UNKNOWN = 'unknown'
}

export interface HTTPError extends Error {
  category: HTTPErrorCategory;
  statusCode?: number;
  retryable: boolean;
  retryAfterSeconds?: number;
}

/**
 * Abstract HTTPConnector class - handles all HTTP communication patterns
 * Services implement the abstract methods for their specific API logic
 */
export abstract class HTTPConnector extends BaseConnector {
  protected httpClient: AxiosInstance;
  protected readonly httpConfig: HTTPConnectorConfig;

  constructor(connectorId: string, config: HTTPConnectorConfig) {
    // Convert HTTPConnectorConfig to base ConnectorConfig for super constructor
    const baseConfig: ConnectorConfig = {
      connector_id: config.connector_id,
      service_type: config.service_type,
      base_url: config.base_url,
      timeout_seconds: config.timeout_seconds || 60,
      retry_attempts: config.retry_attempts || 3,
      retry_delay_seconds: config.retry_delay_seconds || 1,
      health_check_interval_seconds: config.health_check_interval_seconds || 30,
      max_concurrent_jobs: config.max_concurrent_jobs || 1,
      auth: config.auth ? {
        type: config.auth.type === 'oauth' ? 'bearer' : (config.auth.type as 'none' | 'api_key' | 'bearer' | 'basic'),
        username: config.auth.username,
        password: config.auth.password,
        token: config.auth.oauth_token || config.auth.bearer_token || config.auth.token,
        api_key: config.auth.api_key
      } : undefined
    };
    super(connectorId, baseConfig);
    this.httpConfig = {
      // Default HTTP configuration
      user_agent: `emp-worker-${connectorId}/1.0.0`,
      accept_header: 'application/json',
      content_type: 'application/json',
      request_timeout_ms: (config.timeout_seconds || 30) * 1000,
      follow_redirects: true,
      max_redirects: 3,
      keep_alive: true,
      connection_pool_size: 10,
      retry_on_status_codes: [408, 429, 500, 502, 503, 504],
      ...config
    };

    this.httpClient = this.createHTTPClient();
  }

  /**
   * Create and configure the HTTP client with auth, timeouts, retries
   */
  private createHTTPClient(): AxiosInstance {
    const client = axios.create({
      baseURL: this.config.base_url,
      timeout: this.httpConfig.request_timeout_ms,
      maxRedirects: this.httpConfig.max_redirects,
      headers: {
        'User-Agent': this.httpConfig.user_agent,
        'Accept': this.httpConfig.accept_header,
        'Content-Type': this.httpConfig.content_type,
        ...this.httpConfig.custom_headers
      }
    });

    // Setup authentication
    this.setupAuthentication(client);
    
    // Setup retry logic
    this.setupRetryInterceptor(client);
    
    // Setup error handling
    this.setupErrorHandling(client);

    return client;
  }

  /**
   * Configure authentication based on auth config
   */
  private setupAuthentication(client: AxiosInstance): void {
    if (!this.httpConfig.auth || this.httpConfig.auth.type === 'none') {
      return;
    }

    const auth = this.httpConfig.auth;
    
    // Add request interceptor for auth
    client.interceptors.request.use((config) => {
      switch (auth.type) {
        case 'api_key':
          const headerName = auth.api_key_header || 'Authorization';
          config.headers[headerName] = auth.api_key;
          break;
          
        case 'bearer':
          config.headers['Authorization'] = `Bearer ${auth.bearer_token}`;
          break;
          
        case 'basic':
          const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
          config.headers['Authorization'] = `Basic ${credentials}`;
          break;
          
        case 'oauth':
          config.headers['Authorization'] = `Bearer ${auth.oauth_token}`;
          break;
      }
      
      return config;
    });
  }

  /**
   * Setup automatic retry logic with exponential backoff
   */
  private setupRetryInterceptor(client: AxiosInstance): void {
    client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const config = error.config as any;
        
        // Initialize retry count
        if (!config._retryCount) {
          config._retryCount = 0;
        }

        // Check if we should retry
        const shouldRetry = this.shouldRetryRequest(error, config._retryCount);
        
        if (shouldRetry && config._retryCount < this.config.retry_attempts) {
          config._retryCount++;
          
          // Calculate delay with exponential backoff
          const delay = this.calculateRetryDelay(config._retryCount, error);
          
          logger.debug(`HTTP retry ${config._retryCount}/${this.config.retry_attempts} after ${delay}ms`, {
            connector: this.connector_id,
            url: config.url,
            status: error.response?.status,
            attempt: config._retryCount
          });

          await this.sleep(delay);
          return client(config);
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * Determine if a request should be retried based on error type
   */
  private shouldRetryRequest(error: AxiosError, retryCount: number): boolean {
    // Don't retry if we've exceeded max attempts
    if (retryCount >= this.config.retry_attempts) {
      return false;
    }

    // Retry on network errors (no response)
    if (!error.response) {
      return true;
    }

    // Retry on specific HTTP status codes
    const status = error.response.status;
    return this.httpConfig.retry_on_status_codes?.includes(status) || false;
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  private calculateRetryDelay(attemptNumber: number, error?: AxiosError): number {
    // Check for Retry-After header
    const retryAfter = error?.response?.headers['retry-after'];
    if (retryAfter) {
      const retryAfterSeconds = parseInt(retryAfter, 10);
      if (!isNaN(retryAfterSeconds)) {
        return retryAfterSeconds * 1000;
      }
    }

    // Exponential backoff: base_delay * (2 ^ attempt) + jitter
    const baseDelay = this.config.retry_delay_seconds * 1000;
    const exponentialDelay = baseDelay * Math.pow(2, attemptNumber - 1);
    const jitter = Math.random() * 1000; // Add up to 1s jitter
    
    return Math.min(exponentialDelay + jitter, 30000); // Cap at 30s
  }

  /**
   * Setup centralized error handling and categorization
   */
  private setupErrorHandling(client: AxiosInstance): void {
    client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        // Create standardized HTTPError
        const httpError = this.categorizeHTTPError(error);
        
        logger.error('HTTP request failed', {
          connector: this.connector_id,
          url: error.config?.url,
          method: error.config?.method?.toUpperCase(),
          status: error.response?.status,
          category: httpError.category,
          retryable: httpError.retryable,
          message: httpError.message
        });

        return Promise.reject(httpError);
      }
    );
  }

  /**
   * Categorize HTTP errors for consistent error handling
   */
  private categorizeHTTPError(error: AxiosError): HTTPError {
    const httpError = new Error(error.message) as HTTPError;
    httpError.statusCode = error.response?.status;

    // 🚨 GOOGLE API ERROR DEBUGGING: Log the exact error response
    if (error.response) {
      console.log(`🚨🚨🚨 [GOOGLE-API-ERROR-DEBUG] HTTP ${error.response.status} Response:`);
      console.log(`🚨 URL: ${error.config?.url}`);
      console.log(`🚨 Method: ${error.config?.method?.toUpperCase()}`);
      console.log(`🚨 Status: ${error.response.status} ${error.response.statusText}`);
      console.log(`🚨 Headers:`, JSON.stringify(error.response.headers, null, 2));
      console.log(`🚨 Response Body:`, JSON.stringify(error.response.data, null, 2));
      console.log(`🚨🚨🚨\n`);
    }

    if (!error.response) {
      // Network/connection errors
      httpError.category = HTTPErrorCategory.NETWORK_ERROR;
      httpError.retryable = true;
      return httpError;
    }

    const status = error.response.status;
    
    switch (true) {
      case status === 401 || status === 403:
        httpError.category = HTTPErrorCategory.AUTHENTICATION;
        httpError.retryable = false;
        break;
        
      case status === 429:
        httpError.category = HTTPErrorCategory.RATE_LIMIT;
        httpError.retryable = true;
        httpError.retryAfterSeconds = this.parseRetryAfter(error.response.headers['retry-after']);
        break;
        
      case status === 404:
        httpError.category = HTTPErrorCategory.NOT_FOUND;
        httpError.retryable = false;
        break;
        
      case status >= 400 && status < 500:
        httpError.category = HTTPErrorCategory.BAD_REQUEST;
        httpError.retryable = false;
        break;
        
      case status >= 500 && status < 600:
        httpError.category = HTTPErrorCategory.SERVICE_UNAVAILABLE;
        httpError.retryable = true;
        break;
        
      default:
        httpError.category = HTTPErrorCategory.UNKNOWN;
        httpError.retryable = false;
    }

    return httpError;
  }

  /**
   * Parse Retry-After header value
   */
  private parseRetryAfter(retryAfter?: string): number | undefined {
    if (!retryAfter) return undefined;
    
    const seconds = parseInt(retryAfter, 10);
    return !isNaN(seconds) ? seconds : undefined;
  }

  /**
   * Utility method for delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ========================================
  // ABSTRACT METHODS - Service Implementation Required
  // ========================================

  /**
   * Build the HTTP request payload for the specific service
   * Each service implements their API-specific request format
   */
  protected abstract buildRequestPayload(jobData: JobData): any;

  /**
   * Parse the service response into a standardized JobResult
   * Each service handles their API-specific response format
   */
  protected abstract parseResponse(response: AxiosResponse, jobData: JobData): JobResult;

  /**
   * Validate that the service response is complete and correct
   * Each service can implement custom validation logic
   */
  protected abstract validateServiceResponse(response: AxiosResponse): boolean;

  // ============================================
  // Polling Support for Async Jobs (Optional)
  // ============================================

  /**
   * Extract job ID from submission response (for polling)
   * Return null if this is a synchronous response that doesn't need polling
   */
  protected extractJobId(response: AxiosResponse): string | null {
    return null; // Default: no polling
  }

  /**
   * Build status check URL for polling
   * Override to customize status endpoint format
   */
  protected buildStatusUrl(jobId: string): string {
    const endpoint = this.httpConfig.status_endpoint || '/status/{id}';
    return endpoint.replace('{id}', jobId);
  }

  /**
   * Parse status response to determine if job is complete
   * Return { completed: boolean, result?: JobResult, error?: string }
   */
  protected parseStatusResponse(response: AxiosResponse, jobData: JobData): {
    completed: boolean;
    result?: JobResult;
    error?: string;
  } {
    // Default implementation - override in subclass
    return { completed: true };
  }

  /**
   * Build the HTTP request configuration for the job
   * Override for custom headers, query params, etc.
   */
  protected buildRequestConfig(jobData: JobData): AxiosRequestConfig {
    return {
      method: 'POST',
      url: this.getJobEndpoint(jobData),
      data: this.buildRequestPayload(jobData)
    };
  }

  /**
   * Get the API endpoint for job processing
   * Each service must implement this for their specific API
   */
  protected abstract getJobEndpoint(jobData: JobData): string;

  // ========================================
  // BaseConnector Implementation
  // ========================================

  async processJob(jobData: JobData, progressCallback?: ProgressCallback, parentSpan?: SpanContext): Promise<JobResult> {
    const startTime = Date.now();
    
    try {
      logger.debug(`Processing HTTP job`, {
        connector: this.connector_id,
        jobId: jobData.id,
        type: jobData.type
      });

      // Build request configuration
      const requestConfig = this.buildRequestConfig(jobData);
      
      const fullURL = `${this.httpClient.defaults.baseURL}${requestConfig.url}`;
      
      logger.info(`🌐 HTTPConnector making request`, {
        connector: this.connector_id,
        method: requestConfig.method,
        url: requestConfig.url,
        baseURL: this.httpClient.defaults.baseURL,
        fullURL: fullURL,
        jobId: jobData.id
      });

      // Calculate request payload size and string for telemetry
      const requestPayloadString = requestConfig.data ? 
        (typeof requestConfig.data === 'string' ? requestConfig.data : JSON.stringify(requestConfig.data)) : '';
      const requestPayloadSize = requestPayloadString.length;

      // 🚨 BIG PAYLOAD LOGGING: HTTP REQUEST TO SERVICE
      console.log(`\n🚨🚨🚨 HTTP CONNECTOR: SENDING REQUEST TO ${this.config.service_type.toUpperCase()}`);
      console.log(`🚨 JOB: ${jobData.id}`);
      console.log(`🚨 SERVICE: ${this.config.service_type}`);
      console.log(`🚨 URL: ${fullURL}`);
      console.log(`🚨 METHOD: ${requestConfig.method?.toUpperCase() || 'POST'}`);
      console.log(`🚨 REQUEST PAYLOAD SIZE: ${requestPayloadSize} bytes`);
      console.log(`🚨 REQUEST PAYLOAD (SMART TRUNCATED):`);
      // Use smart truncation to handle base64 data properly (words >25 chars get truncated)
      const truncatedRequest = smartTruncateObject(requestConfig.data || requestPayloadString);
      const requestOutput = typeof truncatedRequest === 'string' ? truncatedRequest : JSON.stringify(truncatedRequest);
      console.log(`[TRUNCATION-APPLIED-REQUEST] ${requestOutput}`);
      console.log(`🚨🚨🚨\n`);

      // Note: OTEL telemetry temporarily disabled - replace with WorkflowTelemetryClient if needed
      // try {
      //   await ProcessingInstrumentation.httpRequest({ ... }, parentSpan);
      // } catch (traceError) {
      //   logger.debug('Failed to send HTTP request trace', { error: traceError.message });
      // }
      
      // Execute HTTP request
      const response = await this.httpClient.request(requestConfig);
      
      const requestDurationMs = Date.now() - startTime;

      // Calculate and log response payload info
      const responsePayloadString = response.data ?
        (typeof response.data === 'string' ? response.data : JSON.stringify(response.data)) : '';
      const responsePayloadSize = responsePayloadString.length;

      // 🚨 BIG PAYLOAD LOGGING: HTTP RESPONSE FROM SERVICE
      console.log(`\n🚨🚨🚨 HTTP CONNECTOR: RECEIVED RESPONSE FROM ${this.config.service_type.toUpperCase()}`);
      console.log(`🚨 JOB: ${jobData.id}`);
      console.log(`🚨 SERVICE: ${this.config.service_type}`);
      console.log(`🚨 STATUS: ${response.status}`);
      console.log(`🚨 DURATION: ${requestDurationMs}ms`);
      console.log(`🚨 RESPONSE PAYLOAD SIZE: ${responsePayloadSize} bytes`);
      console.log(`🚨 RESPONSE PAYLOAD (SMART TRUNCATED):`);
      // Use smart truncation to handle base64 data properly (words >25 chars get truncated)
      const truncatedResponse = smartTruncateObject(response.data || responsePayloadString);
      const responseOutput = typeof truncatedResponse === 'string' ? truncatedResponse : JSON.stringify(truncatedResponse);
      console.log(`[TRUNCATION-APPLIED-RESPONSE] ${responseOutput}`);
      console.log(`🚨🚨🚨\n`);

      // Note: OTEL telemetry temporarily disabled - replace with WorkflowTelemetryClient if needed
      // try {
      //   await sendTrace('connector.http_response', { ... });
      // } catch (traceError) {
      //   logger.debug('Failed to send HTTP response trace', { error: traceError.message });
      // }

      // Validate response
      if (!this.validateServiceResponse(response)) {
        throw new Error('Invalid service response received');
      }

      // Check if this requires polling (async job)
      const serviceJobId = this.extractJobId(response);
      
      if (serviceJobId && this.httpConfig.polling_enabled) {
        logger.debug(`Job submitted for async processing`, {
          connector: this.connector_id,
          jobId: jobData.id,
          serviceJobId
        });
        
        // Start polling for completion
        return await this.pollForCompletion(serviceJobId, jobData, progressCallback, requestConfig);
      } else {
        // Synchronous response - parse and return immediately
        const result = this.parseResponse(response, jobData);

        // Add raw request payload for forensics
        result.raw_request_payload = requestConfig.data;

        logger.debug(`HTTP job completed synchronously`, {
          connector: this.connector_id,
          jobId: jobData.id,
          status: response.status
        });

        return result;
      }

    } catch (error) {
      logger.error(`HTTP job failed`, {
        connector: this.connector_id,
        jobId: jobData.id,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Poll service for job completion
   */
  private async pollForCompletion(
    serviceJobId: string,
    jobData: JobData,
    progressCallback?: ProgressCallback,
    requestConfig?: any
  ): Promise<JobResult> {
    const pollInterval = this.httpConfig.polling_interval_ms || 2000; // Default 2s
    const pollTimeout = (this.httpConfig.polling_timeout_seconds || 300) * 1000; // Default 5min
    const startTime = Date.now();
    
    logger.debug(`Starting polling for job completion`, {
      connector: this.connector_id,
      jobId: jobData.id,
      serviceJobId,
      pollInterval,
      pollTimeout
    });
    
    while (Date.now() - startTime < pollTimeout) {
      try {
        // Build status check URL
        const statusUrl = this.buildStatusUrl(serviceJobId);
        
        // Check job status
        const statusResponse = await this.httpClient.get(statusUrl);
        
        logger.info(`📊 HTTPConnector polling response`, {
          connector: this.connector_id,
          jobId: jobData.id,
          serviceJobId,
          statusUrl,
          statusCode: statusResponse.status,
          responseData: JSON.stringify(statusResponse.data, null, 2)
        });
        
        const statusResult = this.parseStatusResponse(statusResponse, jobData);
        
        if (statusResult.completed) {
          if (statusResult.error) {
            throw new Error(`Job failed: ${statusResult.error}`);
          }
          
          logger.debug(`Job completed via polling`, {
            connector: this.connector_id,
            jobId: jobData.id,
            serviceJobId,
            pollingDuration: Date.now() - startTime
          });

          // Add raw request payload for forensics
          const finalResult = statusResult.result!;
          if (requestConfig) {
            finalResult.raw_request_payload = requestConfig.data;
          }

          return finalResult;
        }
        
        // Job still running - call progress callback if provided
        if (progressCallback) {
          // Calculate progress in 10% increments based on polling duration
          const elapsed = Date.now() - startTime;
          // Use a more realistic estimate: assume jobs take 5-30 seconds
          const estimatedTotal = 15000; // 15 seconds estimate for most jobs
          const rawProgress = Math.floor((elapsed / estimatedTotal) * 100);
          // Round to nearest 10% increment, cap at 90% until completion
          const estimatedProgress = Math.min(90, Math.floor(rawProgress / 10) * 10);
          
          progressCallback({
            job_id: jobData.id,
            progress: estimatedProgress,
            message: 'Job in progress...',
            current_step: 'processing'
          });
        }
        
        // Wait before next poll
        await this.sleep(pollInterval);
        
      } catch (error) {
        // Don't fail immediately - could be temporary network issue
        logger.warn(`Polling attempt failed, continuing`, {
          connector: this.connector_id,
          jobId: jobData.id,
          serviceJobId,
          error: error.message
        });
        
        await this.sleep(pollInterval);
      }
    }
    
    // Polling timeout
    throw new Error(`Job polling timeout after ${pollTimeout}ms`);
  }


  async checkHealth(): Promise<boolean> {
    try {
      const response = await this.httpClient.get('/health');
      return response.status >= 200 && response.status < 300;
    } catch (error) {
      logger.debug(`Health check failed`, {
        connector: this.connector_id,
        error: error.message
      });
      return false;
    }
  }

  protected async cleanupService(): Promise<void> {
    // HTTP connectors don't need special cleanup by default
    // Override if service needs specific cleanup (close connection pools, etc.)
  }

  // ========================================
  // BaseConnector Required Method Implementations
  // ========================================

  protected async initializeService(): Promise<void> {
    // HTTP connectors are ready once the client is created
    // Override if service needs specific initialization
  }

  protected async processJobImpl(jobData: JobData, progressCallback: ProgressCallback): Promise<JobResult> {
    // HTTPConnector uses the new processJob method instead
    return this.processJob(jobData, progressCallback);
  }

  async cancelJob(jobId: string): Promise<void> {
    // HTTP services typically don't support job cancellation
    // Override if the service supports cancellation
    logger.debug(`HTTP job cancellation not supported by default`, {
      connector: this.connector_id,
      jobId
    });
  }

  async updateConfiguration(config: ConnectorConfig): Promise<void> {
    // Update base configuration
    this.config = { ...this.config, ...config };
    logger.info(`Updated configuration for HTTP connector`, {
      connector: this.connector_id
    });
  }

  getConfiguration(): ConnectorConfig {
    return { ...this.config };
  }
}