/**
 * AsyncRESTConnector - Base class for asynchronous REST API connectors
 * 
 * This connector ALWAYS follows the async pattern:
 * 1. Submit job to REST endpoint
 * 2. Extract job/response ID from initial response
 * 3. Poll status endpoint until completion
 * 4. Return final result
 * 
 * No "smart" decisions about whether to poll - this connector type ALWAYS polls.
 * Use this for APIs that return job IDs and require polling for results.
 * 
 * Examples: OpenAI Responses API, background processing services
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { BaseConnector, ConnectorConfig } from '../base-connector.js';
import { JobData, JobResult, ProgressCallback, ServiceInfo, logger, ProcessingInstrumentation, sendTrace, SpanContext, smartTruncateObject } from '@emp/core';
import { trace } from '@opentelemetry/api';

// AsyncREST-specific configuration
export interface AsyncRESTConnectorConfig {
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
  
  // Async polling configuration
  polling_interval_ms?: number;
  polling_timeout_seconds?: number;
  status_endpoint_pattern?: string; // e.g., '/responses/{id}', '/jobs/{id}/status'
  
  // Request/Response configuration
  request_timeout_ms?: number;
  max_request_size_bytes?: number;
  max_response_size_bytes?: number;
}

export abstract class AsyncRESTConnector extends BaseConnector {
  protected httpClient: AxiosInstance;
  protected asyncRestConfig: AsyncRESTConnectorConfig;
  protected lastPollingResponse: any = null; // Store for telemetry

  constructor(connectorId: string, config: AsyncRESTConnectorConfig) {
    super(connectorId, {
      connector_id: config.connector_id,
      service_type: config.service_type,
      base_url: config.base_url,
      timeout_seconds: config.timeout_seconds || 60,
      retry_attempts: config.retry_attempts || 3,
      retry_delay_seconds: config.retry_delay_seconds || 5,
      health_check_interval_seconds: config.health_check_interval_seconds || 120,
      max_concurrent_jobs: config.max_concurrent_jobs || 5,
    } as ConnectorConfig);

    this.asyncRestConfig = config;

    // Initialize HTTP client
    this.httpClient = axios.create({
      baseURL: config.base_url,
      timeout: (config.request_timeout_ms || 60000),
      maxContentLength: config.max_response_size_bytes || 10 * 1024 * 1024, // 10MB
      maxBodyLength: config.max_request_size_bytes || 10 * 1024 * 1024, // 10MB
      headers: {
        'User-Agent': config.user_agent || 'AsyncRESTConnector/1.0',
        'Accept': config.accept_header || 'application/json',
        'Content-Type': config.content_type || 'application/json',
        ...config.custom_headers,
      },
    });

    // Configure authentication
    this.configureAuth();
  }

  private configureAuth(): void {
    const auth = this.asyncRestConfig.auth;
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

  // ========================================
  // Abstract Methods - Must Override
  // ========================================

  /**
   * Build the request payload for job submission
   */
  protected abstract buildSubmissionPayload(jobData: JobData): any;

  /**
   * Get the submission endpoint (e.g., '/responses', '/jobs')
   */
  protected abstract getSubmissionEndpoint(): string;

  /**
   * Extract the async job ID from the initial submission response
   */
  protected abstract extractAsyncJobId(response: AxiosResponse): string;

  /**
   * Build the polling URL for checking job status
   * Default implementation uses status_endpoint_pattern with {id} substitution
   */
  protected buildPollingUrl(asyncJobId: string): string {
    const pattern = this.asyncRestConfig.status_endpoint_pattern || '/status/{id}';
    return pattern.replace('{id}', asyncJobId);
  }

  /**
   * Parse the polling response to determine completion status
   */
  protected abstract parsePollingResponse(response: AxiosResponse, jobData: JobData): Promise<{
    completed: boolean;
    result?: JobResult;
    error?: string;
    progress?: number; // 0-100
  }>;

  // ========================================
  // Base Connector Implementation
  // ========================================

  async initializeService(): Promise<void> {
    try {
      // Test HTTP client connection
      await this.checkHealth();
      this.currentStatus = 'idle';
      logger.info(`AsyncREST connector ${this.connector_id} initialized successfully`);
    } catch (error) {
      this.currentStatus = 'error';
      throw new Error(`Failed to initialize AsyncREST connector: ${error.message}`);
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      // Try a simple request to base URL or health endpoint
      await this.httpClient.get('/health', { timeout: 5000 });
      return true;
    } catch (error) {
      logger.warn(`AsyncREST connector ${this.connector_id} health check failed: ${error.message}`);
      return false;
    }
  }

  async processJob(jobData: JobData, progressCallback?: ProgressCallback): Promise<JobResult> {
    logger.info(`AsyncREST connector ${this.connector_id} processing job ${jobData.id}`);

    const startTime = Date.now();

    // Report initial progress
    if (progressCallback) {
      await progressCallback({
        job_id: jobData.id,
        progress: 5,
        message: 'Starting async REST job submission',
        current_step: 'initializing',
      });
    }

    try {
      // Step 1: Submit job
      const payload = this.buildSubmissionPayload(jobData);
      const endpoint = this.getSubmissionEndpoint();

      logger.info(`Submitting async job to ${endpoint}`, {
        connector: this.connector_id,
        jobId: jobData.id,
        endpoint
      });

      if (progressCallback) {
        await progressCallback({
          job_id: jobData.id,
          progress: 15,
          message: `Submitting job to ${endpoint}`,
          current_step: 'submitting',
        });
      }

      const submitResponse = await this.httpClient.post(endpoint, payload);

      // Step 2: Extract async job ID
      const asyncJobId = this.extractAsyncJobId(submitResponse);
      logger.info(`Job submitted, async ID: ${asyncJobId}`, {
        connector: this.connector_id,
        jobId: jobData.id,
        asyncJobId
      });

      if (progressCallback) {
        await progressCallback({
          job_id: jobData.id,
          progress: 25,
          message: `Job submitted (ID: ${asyncJobId}), starting polling`,
          current_step: 'polling',
          metadata: { async_job_id: asyncJobId }
        });
      }

      // Step 3: Poll until completion
      const result = await this.pollForCompletion(asyncJobId, jobData, progressCallback);

      const totalTime = Date.now() - startTime;
      logger.info(`AsyncREST job completed in ${totalTime}ms`, {
        connector: this.connector_id,
        jobId: jobData.id,
        asyncJobId,
        totalTime
      });

      return {
        ...result,
        processing_time_ms: totalTime
      };

    } catch (error) {
      const totalTime = Date.now() - startTime;
      
      // Extract detailed error information from AxiosError
      if (error.isAxiosError) {
        const axiosError = error as AxiosError;
        const responseData = axiosError.response?.data;
        const status = axiosError.response?.status;
        const statusText = axiosError.response?.statusText;
        
        // Build enhanced error message with OpenAI details
        let enhancedMessage = `Request failed with status code ${status}`;
        if (responseData) {
          // Try to extract the specific error from OpenAI's response
          if (typeof responseData === 'object' && responseData && 'error' in responseData) {
            const openaiError = (responseData as any).error;
            if (typeof openaiError === 'object' && openaiError && 'message' in openaiError) {
              enhancedMessage += ` - ${openaiError.message}`;
              if ('type' in openaiError && openaiError.type) {
                enhancedMessage += ` (${openaiError.type})`;
              }
            } else if (typeof openaiError === 'string') {
              enhancedMessage += ` - ${openaiError}`;
            }
          } else if (typeof responseData === 'string') {
            enhancedMessage += ` - ${responseData}`;
          } else {
            // Fallback: show truncated response data
            const truncatedResponse = smartTruncateObject(responseData, 500);
            enhancedMessage += ` - ${JSON.stringify(truncatedResponse)}`;
          }
        }
        
        logger.error(`AsyncREST job failed after ${totalTime}ms: ${enhancedMessage}`, {
          connector: this.connector_id,
          jobId: jobData.id,
          status,
          statusText,
          error: enhancedMessage,
          responseData: responseData ? smartTruncateObject(responseData, 1000) : null
        });
        
        // Throw enhanced error with OpenAI details
        const enhancedError = new Error(enhancedMessage);
        (enhancedError as any).originalError = error;
        (enhancedError as any).status = status;
        (enhancedError as any).responseData = responseData;
        throw enhancedError;
      }
      
      // Non-Axios errors (network, timeout, etc.)
      logger.error(`AsyncREST job failed after ${totalTime}ms: ${error.message}`, {
        connector: this.connector_id,
        jobId: jobData.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Poll the status endpoint until job completion
   */
  private async pollForCompletion(
    asyncJobId: string,
    jobData: JobData,
    progressCallback?: ProgressCallback
  ): Promise<JobResult> {
    const pollInterval = this.asyncRestConfig.polling_interval_ms || 5000; // Default 5s
    const pollTimeout = (this.asyncRestConfig.polling_timeout_seconds || 300) * 1000; // Default 5min
    const startTime = Date.now();
    const pollingUrl = this.buildPollingUrl(asyncJobId);
    
    logger.info(`Starting polling for async job ${asyncJobId}`, {
      connector: this.connector_id,
      jobId: jobData.id,
      asyncJobId,
      pollingUrl,
      pollInterval,
      pollTimeout
    });

    let pollAttempt = 0;

    while (Date.now() - startTime < pollTimeout) {
      pollAttempt++;
      
      try {
        logger.debug(`Polling attempt ${pollAttempt} for async job ${asyncJobId}`);

        const statusResponse = await this.httpClient.get(pollingUrl);
        
        // Store response for telemetry (will be included in job completion attributes)
        this.lastPollingResponse = smartTruncateObject(statusResponse.data, 4000, {
          maxValueSize: 200, // Show more detail for debugging
          preserveStructure: true
        });

        // Log response for immediate debugging
        logger.info(`🔍 Polling response ${pollAttempt} for ${asyncJobId}:`, {
          status: statusResponse.data.status,
          id: statusResponse.data.id,
          hasOutput: !!statusResponse.data.output,
          outputCount: Array.isArray(statusResponse.data.output) ? statusResponse.data.output.length : 0,
          rawResponseSize: JSON.stringify(statusResponse.data).length
        });
        
        const pollingResult = await this.parsePollingResponse(statusResponse, jobData);

        // Log parsing result for debugging
        logger.info(`🎯 Parsing result ${pollAttempt} for ${asyncJobId}:`, {
          completed: pollingResult.completed,
          hasError: !!pollingResult.error,
          error: pollingResult.error || '',
          hasResult: !!pollingResult.result
        });

        // Update progress if available
        if (progressCallback && pollingResult.progress !== undefined) {
          await progressCallback({
            job_id: jobData.id,
            progress: Math.max(25, Math.min(95, pollingResult.progress)), // Keep between 25-95%
            message: `Polling async job (attempt ${pollAttempt})`,
            current_step: 'polling',
            metadata: { 
              async_job_id: asyncJobId,
              poll_attempt: pollAttempt
            }
          });
        }

        if (pollingResult.completed) {
          if (pollingResult.error) {
            // Helper function to safely serialize any value to string
            const safeStringify = (value: unknown): string => {
              if (value === null || value === undefined) {
                return 'null';
              }
              if (typeof value === 'string') {
                return value;
              }
              if (typeof value === 'object') {
                try {
                  return JSON.stringify(value);
                } catch {
                  return String(value);
                }
              }
              return String(value);
            };

            // Job completed with error - create enhanced error with response data
            const serializedError = safeStringify(pollingResult.error);
            const completionError = new Error(`Async job failed: ${serializedError}`);
            (completionError as any).isCompletionError = true; // Mark as completion error
            
            // Add OpenAI response data to error for telemetry
            if (this.lastPollingResponse) {
              (completionError as any).openaiResponseData = JSON.stringify(smartTruncateObject(this.lastPollingResponse));
              logger.error(`📡 Job completion error with OpenAI response data:`, {
                error: serializedError,
                asyncJobId: asyncJobId,
                openaiResponse: `[SMART-TRUNCATED] ${JSON.stringify(smartTruncateObject(this.lastPollingResponse))}`
              });
            }
            
            throw completionError;
          }

          if (!pollingResult.result) {
            // Job completed but no result - fail immediately, don't retry  
            const completionError = new Error(`Async job completed but no result provided`);
            (completionError as any).isCompletionError = true; // Mark as completion error
            throw completionError;
          }

          logger.info(`Async job ${asyncJobId} completed successfully after ${pollAttempt} polls`);
          
          if (progressCallback) {
            await progressCallback({
              job_id: jobData.id,
              progress: 100,
              message: 'Async job completed successfully',
              current_step: 'completed',
              metadata: { 
                async_job_id: asyncJobId,
                poll_attempts: pollAttempt,
                total_poll_time: Date.now() - startTime
              }
            });
          }

          return pollingResult.result;
        }

        // Job still processing - wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));

      } catch (error) {
        // Extract detailed error information for better debugging
        let errorMessage = error.message;
        if (error.isAxiosError) {
          const axiosError = error as AxiosError;
          const responseData = axiosError.response?.data;
          const status = axiosError.response?.status;
          
          if (status && responseData) {
            errorMessage = `HTTP ${status}`;
            if (typeof responseData === 'object' && responseData && 'error' in responseData) {
              const apiError = (responseData as any).error;
              if (typeof apiError === 'object' && apiError && 'message' in apiError) {
                errorMessage += ` - ${apiError.message}`;
              } else if (typeof apiError === 'string') {
                errorMessage += ` - ${apiError}`;
              }
            } else if (typeof responseData === 'string') {
              errorMessage += ` - ${responseData}`;
            }
          }
        }
        
        logger.error(`Polling attempt ${pollAttempt} failed for async job ${asyncJobId}: ${errorMessage}`);
        
        // If this is a completion error (job completed with failure), don't retry
        if ((error as any).isCompletionError) {
          logger.error(`Async job ${asyncJobId} completed with error, stopping polling immediately`);
          throw error;
        }
        
        // If it's the last possible attempt within timeout, throw enhanced error
        if (Date.now() - startTime + pollInterval >= pollTimeout) {
          const enhancedError = new Error(errorMessage);
          (enhancedError as any).originalError = error;
          throw enhancedError;
        }
        
        // Otherwise wait and retry (only for HTTP errors, network issues, etc.)
        logger.warn(`Retrying polling for ${asyncJobId} after HTTP/network error (attempt ${pollAttempt})`);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }

    throw new Error(`Async job ${asyncJobId} polling timeout after ${pollTimeout}ms (${pollAttempt} attempts)`);
  }

  // ========================================
  // Placeholder Methods
  // ========================================

  async getServiceInfo(): Promise<ServiceInfo> {
    return {
      service_name: `AsyncREST Service (${this.service_type})`,
      service_version: '1.0.0',
      base_url: this.asyncRestConfig.base_url,
      status: this.currentStatus === 'idle' || this.currentStatus === 'active' ? 'online' : 'offline',
      capabilities: {
        supported_formats: ['json'],
        supported_models: [], // Override in subclass
        features: ['async_processing', 'polling', 'progress_tracking'],
        concurrent_jobs: this.asyncRestConfig.max_concurrent_jobs || 5,
      },
    };
  }

  getConfiguration(): any {
    return {
      connector_id: this.connector_id,
      service_type: this.service_type,
      base_url: this.asyncRestConfig.base_url,
      polling_interval_ms: this.asyncRestConfig.polling_interval_ms,
      polling_timeout_seconds: this.asyncRestConfig.polling_timeout_seconds,
    };
  }
}