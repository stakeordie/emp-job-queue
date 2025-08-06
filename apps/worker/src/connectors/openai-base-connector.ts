// OpenAI Base Connector - Shared functionality for all OpenAI connectors
// Provides common OpenAI client setup, debug logging, and background job polling

import OpenAI from 'openai';
import { BaseConnector } from './base-connector.js';
import {
  JobData,
  HealthCheckClass,
  ProgressCallback,
  logger,
  createEnhancedProgressReporter,
  EnhancedProgressReporter,
} from '@emp/core';

export abstract class OpenAIBaseConnector extends BaseConnector {
  protected client: OpenAI | null = null;
  protected apiKey: string;
  protected baseURL: string;
  protected logReporter?: EnhancedProgressReporter;

  /**
   * Get base OpenAI environment variables that all OpenAI connectors need
   */
  static getBaseOpenAIEnvVars(): Record<string, string> {
    return {
      OPENAI_API_KEY: '${OPENAI_API_KEY:-}',
      OPENAI_BASE_URL: '${OPENAI_BASE_URL:-https://api.openai.com/v1}',
      OPENAI_TIMEOUT_SECONDS: '${OPENAI_TIMEOUT_SECONDS:-120}',
      OPENAI_RETRY_ATTEMPTS: '${OPENAI_RETRY_ATTEMPTS:-3}',
      OPENAI_RETRY_DELAY_SECONDS: '${OPENAI_RETRY_DELAY_SECONDS:-5}',
      OPENAI_HEALTH_CHECK_INTERVAL: '${OPENAI_HEALTH_CHECK_INTERVAL:-120}',
      OPENAI_DEBUG: '${OPENAI_DEBUG:-false}',
      // Cloud storage configuration (used by AssetSaver)
      CLOUD_STORAGE_PROVIDER: '${CLOUD_STORAGE_PROVIDER:-}',
      CLOUD_STORAGE_CONTAINER: '${CLOUD_STORAGE_CONTAINER:-}',
      CLOUD_CDN_URL: '${CLOUD_CDN_URL:-}',
      AZURE_STORAGE_ACCOUNT: '${AZURE_STORAGE_ACCOUNT:-}',
      AZURE_STORAGE_KEY: '${AZURE_STORAGE_KEY:-}',
    };
  }

  constructor(connectorId: string, config: any) {
    super(connectorId, config);

    // OpenAI-specific configuration
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.baseURL = config.base_url || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

    if (!this.apiKey) {
      throw new Error(`OpenAI connector ${connectorId} requires OPENAI_API_KEY environment variable`);
    }
  }

  /**
   * Format OpenAI messages by converting \n to actual line breaks
   */
  protected formatMessage(message: string): string {
    return message.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  }

  /**
   * Truncate base64 data for logging (show first/last chars only)
   */
  protected truncateBase64(data: string, showChars: number = 50): string {
    if (data.length <= showChars * 2) {
      return data;
    }
    return `${data.substring(0, showChars)}...${data.substring(data.length - showChars)} (${data.length} chars total)`;
  }

  /**
   * Initialize OpenAI client with shared configuration
   */
  protected async initializeOpenAIClient(): Promise<void> {
    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseURL,
      timeout: this.config.timeout_seconds * 1000,
      maxRetries: this.config.retry_attempts,
    });

    // Enable debug logging if OPENAI_DEBUG=true
    if (process.env.OPENAI_DEBUG === 'true') {
      logger.info(`🔍 OpenAI Debug Mode ENABLED for connector ${this.connector_id}`);
      this.enableDebugLogging();
    }
  }

  /**
   * Initialize intelligent logging for a job
   */
  protected initializeIntelligentLogging(jobId: string, progressCallback: ProgressCallback): void {
    this.logReporter = createEnhancedProgressReporter(
      'openai',
      this.connector_id,
      progressCallback,
      jobId
    );
  }

  /**
   * Get enhanced progress callback with intelligent interpretation
   */
  protected getEnhancedProgressCallback(): ProgressCallback {
    return this.logReporter?.createEnhancedCallback() || ((progress) => Promise.resolve());
  }

  /**
   * Report intelligent log with pattern matching
   */
  protected async reportIntelligentLog(
    message: string,
    level: 'debug' | 'info' | 'warn' | 'error' | 'fatal' = 'info',
    source?: string
  ): Promise<void> {
    if (this.logReporter) {
      await this.logReporter.interpretAndReportLog(message, level, source);
    }
  }

  /**
   * Log detailed OpenAI request with intelligent analysis
   */
  protected async logOpenAIRequest(
    method: string,
    url: string,
    requestData: any,
    description: string = 'OpenAI API Request'
  ): Promise<void> {
    const sanitizedData = this.sanitizeRequestData(requestData);
    
    logger.info(`🚀 ${description}:`);
    logger.info(`   ${method} ${url}`);
    logger.info(`   Request: ${JSON.stringify(sanitizedData, null, 2)}`);

    // Report through intelligent logging
    await this.reportIntelligentLog(
      `${description}: ${method} ${url}`,
      'info',
      'openai_request'
    );
  }

  /**
   * Log detailed OpenAI response with intelligent analysis
   */
  protected async logOpenAIResponse(
    statusCode: number,
    responseData: any,
    duration: number,
    description: string = 'OpenAI API Response'
  ): Promise<void> {
    const sanitizedData = this.sanitizeResponseData(responseData);
    
    logger.info(`📥 ${description} (${duration}ms):`);
    logger.info(`   Status: ${statusCode}`);
    logger.info(`   Response: ${JSON.stringify(sanitizedData, null, 2)}`);

    // Intelligent interpretation of response
    if (statusCode >= 400) {
      await this.reportIntelligentLog(
        `OpenAI API error ${statusCode}: ${responseData?.error?.message || 'Unknown error'}`,
        'error',
        'openai_response'
      );
    } else if (responseData?.status) {
      await this.reportIntelligentLog(
        `OpenAI job status: ${responseData.status}`,
        'info',
        'openai_response'
      );
    }
  }

  /**
   * Sanitize request data for logging (truncate base64, hide sensitive data)
   */
  private sanitizeRequestData(data: any): any {
    if (!data) return data;

    const sanitized = JSON.parse(JSON.stringify(data));

    // Recursively sanitize nested objects
    const sanitizeObject = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item));
      }
      
      if (typeof obj === 'object' && obj !== null) {
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
          if (typeof value === 'string') {
            // Truncate base64 data URLs
            if (value.startsWith('data:image/') && value.includes('base64,')) {
              const base64Part = value.split('base64,')[1];
              result[key] = `data:image/...;base64,${this.truncateBase64(base64Part)}`;
            }
            // Truncate long base64 strings
            else if (value.length > 100 && /^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
              result[key] = this.truncateBase64(value);
            }
            // Hide API keys
            else if (key.toLowerCase().includes('key') || key.toLowerCase().includes('token')) {
              result[key] = '***HIDDEN***';
            }
            else {
              result[key] = value;
            }
          } else {
            result[key] = sanitizeObject(value);
          }
        }
        return result;
      }
      
      return obj;
    };

    return sanitizeObject(sanitized);
  }

  /**
   * Sanitize response data for logging
   */
  private sanitizeResponseData(data: any): any {
    if (!data) return data;

    const sanitized = JSON.parse(JSON.stringify(data));

    // Recursively sanitize response data
    const sanitizeObject = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item));
      }
      
      if (typeof obj === 'object' && obj !== null) {
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
          if (typeof value === 'string' && value.length > 100 && /^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
            // Truncate base64 results
            result[key] = this.truncateBase64(value);
          } else {
            result[key] = sanitizeObject(value);
          }
        }
        return result;
      }
      
      return obj;
    };

    return sanitizeObject(sanitized);
  }

  /**
   * Enable verbose debug logging for OpenAI requests/responses
   * This intercepts all HTTP calls to log complete request/response data
   */
  protected enableDebugLogging(): void {
    if (!this.client) {
      logger.warn('Cannot enable debug logging - OpenAI client not initialized');
      return;
    }

    // Store original fetch method
    const originalFetch = global.fetch;

    // Create debug fetch wrapper
    const debugFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const startTime = Date.now();
      
      // Log request details
      const requestUrl = typeof url === 'string' ? url : url.toString();
      const method = init?.method || 'GET';
      
      logger.info(`🚀 OpenAI API Request [${this.connector_id}]:`);
      logger.info(`   ${method} ${requestUrl}`);
      
      // Log request headers (mask authorization)
      if (init?.headers) {
        const headers = new Headers(init.headers);
        const sanitizedHeaders: Record<string, string> = {};
        
        headers.forEach((value, key) => {
          if (key.toLowerCase() === 'authorization') {
            sanitizedHeaders[key] = value.replace(/Bearer .+/, 'Bearer ***MASKED***');
          } else {
            sanitizedHeaders[key] = value;
          }
        });
        
        logger.info(`   Headers: ${JSON.stringify(sanitizedHeaders, null, 2)}`);
      }
      
      // Log request body (truncate if too large)
      if (init?.body) {
        const bodyStr = typeof init.body === 'string' ? init.body : init.body.toString();
        const truncatedBody = bodyStr.length > 2000 ? bodyStr.substring(0, 2000) + '...[TRUNCATED]' : bodyStr;
        logger.info(`   Body: ${truncatedBody}`);
      }

      try {
        // Make the actual request
        const response = await originalFetch(url, init);
        const duration = Date.now() - startTime;

        // Log response details
        logger.info(`📥 OpenAI API Response [${this.connector_id}] (${duration}ms):`);
        logger.info(`   Status: ${response.status} ${response.statusText}`);
        
        // Log response headers
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });
        logger.info(`   Headers: ${JSON.stringify(responseHeaders, null, 2)}`);

        // Clone response to read body without consuming it
        const clonedResponse = response.clone();
        
        try {
          const responseBody = await clonedResponse.text();
          
          // Smart truncation based on response type
          let loggedBody: string;
          
          try {
            const parsed = JSON.parse(responseBody);
            
            // Handle model list responses (very verbose)
            if (parsed.object === 'list' && Array.isArray(parsed.data) && parsed.data[0]?.object === 'model') {
              loggedBody = `Model list response: ${parsed.data.length} models (${parsed.data.slice(0, 3).map(m => m.id).join(', ')}${parsed.data.length > 3 ? ', ...' : ''})`;
            }
            // Handle job status responses (what we care about)
            else if (parsed.status && parsed.id) {
              const output = parsed.output ? ` output: ${parsed.output.length} items` : '';
              loggedBody = `Job status: ${parsed.status}${output}`;
            }
            // Other responses - truncate more aggressively
            else {
              loggedBody = responseBody.length > 500 ? 
                responseBody.substring(0, 500) + '...[TRUNCATED]' : responseBody;
            }
          } catch {
            // Not JSON, just truncate
            loggedBody = responseBody.length > 500 ? 
              responseBody.substring(0, 500) + '...[TRUNCATED]' : responseBody;
          }
          
          logger.info(`   Body: ${loggedBody}`);
        } catch (bodyError) {
          logger.info(`   Body: [Could not read response body: ${bodyError.message}]`);
        }

        return response;
        
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error(`❌ OpenAI API Request Failed [${this.connector_id}] (${duration}ms):`);
        logger.error(`   Error: ${this.formatMessage(error.message)}`);
        logger.error(`   Stack: ${error.stack}`);
        throw error;
      }
    };

    // Replace global fetch with debug version
    global.fetch = debugFetch;
    
    logger.info(`✅ OpenAI debug logging enabled for connector ${this.connector_id}`);
    logger.info(`   All OpenAI API requests/responses will be logged to PM2 logs`);
    logger.info(`   To disable: set OPENAI_DEBUG=false and restart worker`);
  }

  /**
   * Poll OpenAI job status until completion
   * Shared polling logic for all OpenAI background jobs
   * Updated: Dynamic polling intervals and indefinite polling for queued/in-progress jobs
   */
  protected async pollForJobCompletion(
    openaiJobId: string, 
    jobId: string, 
    progressCallback?: ProgressCallback,
    progressStartPercent: number = 15,
    progressEndPercent: number = 85
  ): Promise<{
    images: string[];
    pollAttempts: number;
    totalPollTimeMs: number;
  }> {
    const startTime = Date.now();
    const maxInitialPollingTimeMs = 300000; // 5 minutes max for non-queued/in-progress states
    
    let pollAttempts = 0;
    let lastStatus = 'unknown';
    let totalElapsedTime = 0;

    // Report polling start with intelligent interpretation
    await this.reportIntelligentLog(
      `Starting dynamic polling for OpenAI job ${openaiJobId} (indefinite for queued/in-progress)`,
      'info',
      'openai_polling'
    );

    // Dynamic polling loop - continues indefinitely for queued/in-progress jobs
    while (true) {
      pollAttempts++;
      const pollStartTime = Date.now();
      totalElapsedTime = pollStartTime - startTime;

      try {
        // Get job status from OpenAI
        const statusResponse = await this.client!.responses.retrieve(openaiJobId);
        const currentStatus = statusResponse.status;
        
        // Log polling attempt with detailed response analysis
        await this.logOpenAIResponse(
          200,
          statusResponse,
          Date.now() - pollStartTime,
          `Poll attempt ${pollAttempts} for OpenAI job ${openaiJobId} (${Math.round(totalElapsedTime / 1000)}s elapsed)`
        );
        
        // Debug: Show what's in each poll response
        if (process.env.OPENAI_DEBUG === 'true') {
          logger.info(`🔍 Poll ${pollAttempts} Response Debug:`);
          logger.info(`   Status: ${currentStatus}`);
          logger.info(`   Has output: ${!!statusResponse.output}`);
          if (statusResponse.output) {
            logger.info(`   Output type: ${Array.isArray(statusResponse.output) ? 'array' : typeof statusResponse.output}`);
            if (Array.isArray(statusResponse.output)) {
              logger.info(`   Output length: ${statusResponse.output.length}`);
              statusResponse.output.forEach((item, index) => {
                logger.info(`   Output[${index}]: type=${item.type}`);
                // Check if this item has a result property (type-safe check)
                if ('result' in item && item.result && typeof item.result === 'string') {
                  // Only show base64 if explicitly requested with OPENAI_DEBUG_VERBOSE
                  if (process.env.OPENAI_DEBUG_VERBOSE === 'true') {
                    logger.info(`   Output[${index}] result: ${this.truncateBase64(item.result)}`);
                  } else {
                    logger.info(`   Output[${index}] result: <base64 data: ${item.result.length} chars>`);
                  }
                }
              });
            }
          }
        }

        // Update progress if status changed
        if (currentStatus !== lastStatus) {
          lastStatus = currentStatus;
          // Dynamic progress calculation without max attempts limitation
          const progressPercent = Math.min(progressEndPercent, 
            progressStartPercent + Math.min(50, (totalElapsedTime / 60000) * 30) // Gradual increase over time
          );
          
          // Report status change with intelligent interpretation
          await this.reportIntelligentLog(
            `OpenAI job status changed to: ${currentStatus}`,
            'info',
            'openai_status_change'
          );
          
          if (progressCallback) {
            await progressCallback({
              job_id: jobId,
              progress: progressPercent,
              message: `OpenAI job ${currentStatus} (poll ${pollAttempts}, ${Math.round(totalElapsedTime / 1000)}s elapsed)`,
              current_step: 'processing',
              metadata: {
                openai_job_id: openaiJobId,
                openai_status: currentStatus,
                poll_attempts: pollAttempts,
                elapsed_time_ms: totalElapsedTime
              },
            });
          }
        }

        // Check if job is complete
        if (currentStatus === 'completed') {
          await this.reportIntelligentLog(
            `OpenAI job ${openaiJobId} completed after ${pollAttempts} polls (${totalElapsedTime}ms)`,
            'info',
            'openai_completion'
          );
          
          // Debug: Log the entire response to understand what OpenAI returned
          if (process.env.OPENAI_DEBUG === 'true') {
            logger.info(`🔍 OpenAI Response Debug for job ${openaiJobId}:`);
            logger.info(`   Status: ${currentStatus}`);
            
            // Sanitize response for logging (remove large base64 data)
            const sanitizedResponse = { ...statusResponse };
            if (sanitizedResponse.output && Array.isArray(sanitizedResponse.output)) {
              sanitizedResponse.output = sanitizedResponse.output.map(item => {
                if ('result' in item && item.result && typeof item.result === 'string' && item.result.length > 100) {
                  return { ...item, result: `<base64 data: ${item.result.length} chars>` };
                }
                return item;
              });
            }
            logger.info(`   Full Response: ${JSON.stringify(sanitizedResponse, null, 2)}`);
          }
          
          // Extract generated images from completed response
          const images: string[] = [];
          
          if (statusResponse.output && Array.isArray(statusResponse.output)) {
            for (const output of statusResponse.output) {
              if (output.type === 'image_generation_call' && output.result) {
                // Store base64 directly (will be processed by connector)
                images.push(output.result);
                // Only show base64 if explicitly requested
                if (process.env.OPENAI_DEBUG_VERBOSE === 'true') {
                  logger.info(`🖼️  Extracted image from completed OpenAI job ${openaiJobId}: ${this.truncateBase64(output.result)}`);
                } else {
                  logger.info(`🖼️  Extracted image from completed OpenAI job ${openaiJobId} (${output.result.length} chars)`);
                }
              }
            }
          }

          if (images.length === 0) {
            // IMMEDIATE FAILURE: Job completed but no images generated
            const noImagesMessage = `No image was generated - check that the prompt is asking for an image`;
            
            // Report with intelligent interpretation - this is a critical pattern for OpenAI
            await this.reportIntelligentLog(
              `OpenAI job ${openaiJobId} completed but no images found in output - likely prompt issue`,
              'error',
              'openai_no_images'
            );
            
            logger.error(`❌ ${noImagesMessage}`);
            logger.error(`   OpenAI job ${openaiJobId} completed but returned no images`);
            logger.error(`   Response has output: ${!!statusResponse.output}`);
            logger.error(`   Response output type: ${Array.isArray(statusResponse.output) ? 'array' : typeof statusResponse.output}`);
            // Sanitize output for error logging
            const sanitizedOutput = statusResponse.output && Array.isArray(statusResponse.output) 
              ? statusResponse.output.map(item => {
                  if ('result' in item && item.result && typeof item.result === 'string' && item.result.length > 100) {
                    return { ...item, result: `<base64 data: ${item.result.length} chars>` };
                  }
                  return item;
                })
              : statusResponse.output;
            logger.error(`   Response output structure: ${JSON.stringify(sanitizedOutput, null, 2)}`);
            
            throw new Error(noImagesMessage);
          }

          // Report successful image extraction
          await this.reportIntelligentLog(
            `Successfully extracted ${images.length} image(s) from OpenAI job ${openaiJobId}`,
            'info',
            'openai_image_extraction'
          );

          return {
            images,
            pollAttempts,
            totalPollTimeMs: totalElapsedTime
          };
        }

        // Check if job failed
        if (currentStatus === 'failed' || currentStatus === 'cancelled') {
          const rawErrorMessage = statusResponse.error?.message || `Job ${currentStatus}`;
          const errorMessage = this.formatMessage(rawErrorMessage);
          
          // Report failure with intelligent interpretation
          await this.reportIntelligentLog(
            `OpenAI job ${openaiJobId} ${currentStatus}: ${errorMessage}`,
            'error',
            'openai_job_failure'
          );
          
          throw new Error(`OpenAI job ${openaiJobId} ${currentStatus}: ${errorMessage}`);
        }

        // DYNAMIC POLLING: Continue indefinitely for active job statuses
        // Common OpenAI status values: 'queued', 'in_progress', 'processing', 'running', 'pending', 'submitted'
        const activeStatuses = ['in_progress', 'queued', 'processing', 'running', 'pending', 'submitted'];
        const slowPollStatuses = ['queued', 'pending', 'submitted']; // Poll less frequently for waiting states
        
        if (activeStatuses.includes(currentStatus.toLowerCase())) {
          await this.reportIntelligentLog(
            `OpenAI job ${openaiJobId} still ${currentStatus}, continuing to poll (${Math.round(totalElapsedTime / 1000)}s elapsed)`,
            'info',
            'openai_polling_continue'
          );
          
          // Dynamic wait time based on status
          const isSlowPollStatus = slowPollStatuses.includes(currentStatus.toLowerCase());
          const waitTime = isSlowPollStatus ? 3000 : 1000; // 3s for queued/waiting states, 1s for active processing
          const pollDuration = Date.now() - pollStartTime;
          const actualWaitTime = Math.max(0, waitTime - pollDuration);
          
          logger.info(`🔄 OpenAI job ${openaiJobId} status: ${currentStatus} (polling again in ${waitTime}ms)`);
          
          if (actualWaitTime > 0) {
            await new Promise(resolve => setTimeout(resolve, actualWaitTime));
          }
          
          continue; // Continue polling indefinitely for active statuses
        }

        // For other unknown statuses, apply the original timeout logic
        if (totalElapsedTime > maxInitialPollingTimeMs) {
          const timeoutMessage = `OpenAI job ${openaiJobId} polling timeout after ${pollAttempts} attempts (${totalElapsedTime}ms). Status: ${currentStatus}`;
          
          // Report timeout with intelligent interpretation
          await this.reportIntelligentLog(timeoutMessage, 'error', 'openai_polling_timeout');
          
          throw new Error(timeoutMessage);
        }

      } catch (pollError) {
        const errorMessage = this.formatMessage(pollError.message);
        
        // Report polling error with intelligent interpretation
        await this.reportIntelligentLog(
          `Poll attempt ${pollAttempts} failed for OpenAI job ${openaiJobId}: ${errorMessage}`,
          'warn',
          'openai_poll_error'
        );
        
        // Only fail immediately for API errors, not for transient network issues
        if (pollError.status && pollError.status >= 400 && pollError.status < 500) {
          // Client error - don't retry
          const finalError = `OpenAI API error: ${errorMessage}`;
          await this.reportIntelligentLog(finalError, 'error', 'openai_api_error');
          throw new Error(finalError);
        }
        
        // For network errors, continue polling but apply timeout for unknown statuses
        if (totalElapsedTime > maxInitialPollingTimeMs && lastStatus !== 'queued' && lastStatus !== 'in_progress') {
          const finalError = `Polling failed after ${pollAttempts} attempts and ${totalElapsedTime}ms: ${errorMessage}`;
          await this.reportIntelligentLog(finalError, 'error', 'openai_polling_failed');
          throw new Error(finalError);
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  /**
   * Shared health check for OpenAI connectors
   */
  async checkHealth(): Promise<boolean> {
    try {
      if (!this.client) {
        return false;
      }
      // Simple health check - list models to verify API connectivity
      const models = await this.client.models.list();
      return models.data.length > 0;
    } catch (error) {
      logger.warn(`OpenAI connector ${this.connector_id} health check failed: ${this.formatMessage(error.message)}`);
      return false;
    }
  }

  /**
   * Get available models (to be overridden by specific connectors)
   */
  async getAvailableModels(): Promise<string[]> {
    try {
      if (!this.client) {
        return [];
      }
      const models = await this.client.models.list();
      return models.data.filter(model => model.id.includes('gpt')).map(model => model.id);
    } catch (error) {
      logger.warn(`Failed to fetch OpenAI models for ${this.connector_id}: ${this.formatMessage(error.message)}`);
      return [];
    }
  }

  /**
   * OpenAI connectors use minimal health checking
   */
  getRequiredHealthCheckClass(): HealthCheckClass {
    return HealthCheckClass.MINIMAL;
  }

  /**
   * Cleanup OpenAI client
   */
  async cleanupService(): Promise<void> {
    this.client = null;
    this.currentStatus = 'offline';
    logger.info(`OpenAI connector ${this.connector_id} cleaned up`);
  }

  /**
   * OpenAI doesn't support job cancellation
   */
  async cancelJob(jobId: string): Promise<void> {
    logger.info(
      `Job cancellation requested for ${jobId} (OpenAI jobs cannot be cancelled once started)`
    );
  }

  /**
   * Basic configuration update
   */
  async updateConfiguration(config: any): Promise<void> {
    logger.info(`Configuration update requested for OpenAI connector ${this.connector_id}`);
  }
}