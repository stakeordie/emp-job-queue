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
import { JobData, JobResult, ProgressCallback, ServiceInfo, logger } from '@emp/core';

// HTTP-specific configuration extending base connector config
export interface HTTPConnectorConfig extends ConnectorConfig {
  // Authentication configuration
  auth?: {
    type: 'none' | 'api_key' | 'bearer' | 'basic' | 'oauth';
    api_key?: string;
    api_key_header?: string; // Default: 'Authorization'
    bearer_token?: string;
    username?: string;
    password?: string;
    oauth_token?: string;
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
    super(connectorId, config);
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
   * Override for service-specific endpoints
   */
  protected getJobEndpoint(jobData: JobData): string {
    return '/api/v1/jobs';
  }

  // ========================================
  // BaseConnector Implementation
  // ========================================

  async processJob(jobData: JobData, progressCallback?: ProgressCallback): Promise<JobResult> {
    try {
      logger.debug(`Processing HTTP job`, {
        connector: this.connector_id,
        jobId: jobData.id,
        type: jobData.type
      });

      // Build request configuration
      const requestConfig = this.buildRequestConfig(jobData);
      
      // Execute HTTP request
      const response = await this.httpClient.request(requestConfig);

      // Validate response
      if (!this.validateServiceResponse(response)) {
        throw new Error('Invalid service response received');
      }

      // Parse response to JobResult
      const result = this.parseResponse(response, jobData);

      logger.debug(`HTTP job completed successfully`, {
        connector: this.connector_id,
        jobId: jobData.id,
        status: response.status
      });

      return result;

    } catch (error) {
      logger.error(`HTTP job failed`, {
        connector: this.connector_id,
        jobId: jobData.id,
        error: error.message
      });

      throw error;
    }
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
}