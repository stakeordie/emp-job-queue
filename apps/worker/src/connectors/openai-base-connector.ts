// OpenAI Base Connector - Shared functionality for all OpenAI connectors
// Provides common OpenAI client setup, debug logging, and background job polling

import OpenAI from 'openai';
import { BaseConnector } from './base-connector.js';
import {
  JobData,
  HealthCheckClass,
  ProgressCallback,
  logger,
} from '@emp/core';

export abstract class OpenAIBaseConnector extends BaseConnector {
  protected client: OpenAI | null = null;
  protected apiKey: string;
  protected baseURL: string;

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
          const truncatedResponse = responseBody.length > 3000 ? 
            responseBody.substring(0, 3000) + '...[TRUNCATED]' : responseBody;
          logger.info(`   Body: ${truncatedResponse}`);
        } catch (bodyError) {
          logger.info(`   Body: [Could not read response body: ${bodyError.message}]`);
        }

        return response;
        
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error(`❌ OpenAI API Request Failed [${this.connector_id}] (${duration}ms):`);
        logger.error(`   Error: ${error.message}`);
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
    const maxPollingTimeMs = 120000; // 2 minutes max
    const pollIntervalMs = 2000; // Poll every 2 seconds
    const maxAttempts = Math.floor(maxPollingTimeMs / pollIntervalMs);
    
    let pollAttempts = 0;
    let lastStatus = 'unknown';

    logger.info(`🔄 Starting polling for OpenAI job ${openaiJobId} (max ${maxAttempts} attempts, ${maxPollingTimeMs}ms total)`);

    while (pollAttempts < maxAttempts) {
      pollAttempts++;
      const pollStartTime = Date.now();

      try {
        // Get job status from OpenAI
        const statusResponse = await this.client!.responses.retrieve(openaiJobId);
        const currentStatus = statusResponse.status;
        
        logger.info(`📊 Poll attempt ${pollAttempts}/${maxAttempts} for OpenAI job ${openaiJobId}: status=${currentStatus}`);

        // Update progress if status changed
        if (currentStatus !== lastStatus) {
          lastStatus = currentStatus;
          const progressPercent = Math.min(progressEndPercent, progressStartPercent + (pollAttempts / maxAttempts) * (progressEndPercent - progressStartPercent));
          
          if (progressCallback) {
            await progressCallback({
              job_id: jobId,
              progress: progressPercent,
              message: `OpenAI job ${currentStatus} (poll ${pollAttempts}/${maxAttempts})`,
              current_step: 'processing',
              metadata: {
                openai_job_id: openaiJobId,
                openai_status: currentStatus,
                poll_attempts: pollAttempts,
                elapsed_time_ms: Date.now() - startTime
              },
            });
          }
        }

        // Check if job is complete
        if (currentStatus === 'completed') {
          logger.info(`✅ OpenAI job ${openaiJobId} completed after ${pollAttempts} polls (${Date.now() - startTime}ms)`);
          
          // Extract generated images from completed response
          const images: string[] = [];
          
          if (statusResponse.output && Array.isArray(statusResponse.output)) {
            for (const output of statusResponse.output) {
              if (output.type === 'image_generation_call' && output.result) {
                // Store base64 directly (will be processed by connector)
                images.push(output.result);
                logger.info(`🖼️  Extracted image from completed OpenAI job ${openaiJobId} (${output.result.length} chars)`);
              }
            }
          }

          if (images.length === 0) {
            throw new Error(`OpenAI job ${openaiJobId} completed but no images found in output`);
          }

          return {
            images,
            pollAttempts,
            totalPollTimeMs: Date.now() - startTime
          };
        }

        // Check if job failed
        if (currentStatus === 'failed' || currentStatus === 'cancelled') {
          const errorMessage = statusResponse.error?.message || `Job ${currentStatus}`;
          throw new Error(`OpenAI job ${openaiJobId} ${currentStatus}: ${errorMessage}`);
        }

        // Continue polling if job is still in progress
        if (currentStatus === 'in_progress' || currentStatus === 'queued') {
          const remainingTime = maxPollingTimeMs - (Date.now() - startTime);
          logger.info(`⏳ OpenAI job ${openaiJobId} still ${currentStatus}, continuing to poll (${remainingTime}ms remaining)`);
        }

      } catch (pollError) {
        logger.warn(`⚠️  Poll attempt ${pollAttempts} failed for OpenAI job ${openaiJobId}: ${pollError.message}`);
        
        // If this is the last attempt, throw the error
        if (pollAttempts >= maxAttempts) {
          throw new Error(`Polling failed after ${maxAttempts} attempts: ${pollError.message}`);
        }
      }

      // Wait before next poll (unless this was the last attempt)
      if (pollAttempts < maxAttempts) {
        const pollDuration = Date.now() - pollStartTime;
        const waitTime = Math.max(0, pollIntervalMs - pollDuration);
        
        if (waitTime > 0) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    // Polling timeout
    const totalTime = Date.now() - startTime;
    throw new Error(
      `OpenAI job ${openaiJobId} polling timeout after ${pollAttempts} attempts (${totalTime}ms). ` +
      `Last status: ${lastStatus}`
    );
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
      logger.warn(`OpenAI connector ${this.connector_id} health check failed: ${error.message}`);
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
      logger.warn(`Failed to fetch OpenAI models for ${this.connector_id}: ${error.message}`);
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