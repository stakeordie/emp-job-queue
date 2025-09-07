/**
 * OpenAI Responses Connector - Handles dynamic JSON payloads via OpenAI Responses API
 * 
 * This connector processes dynamic JSON workflows by routing them to OpenAI's Responses API.
 * It uses the AsyncRESTConnector pattern to ALWAYS poll for completion - no smart decisions.
 * 
 * Key features:
 * - Dynamic JSON payload processing 
 * - OpenAI Responses API integration with guaranteed polling
 * - Clean payload filtering (removes EmProps metadata)
 * - Cloud storage integration via AssetSaver
 * - Per-machine API key configuration via environment variables
 * 
 * Environment Variables:
 * - OPENAI_API_KEY: OpenAI API key for authentication
 * - OPENAI_BASE_URL: Base URL for OpenAI API (default: https://api.openai.com/v1)
 * - OPENAI_TIMEOUT_SECONDS: Request timeout in seconds
 * - OPENAI_RESPONSES_MAX_CONCURRENT_JOBS: Maximum concurrent jobs for this connector
 */

import { AxiosResponse } from 'axios';
import { AsyncRESTConnector, AsyncRESTConnectorConfig } from './protocol/async-rest-connector.js';
import { AssetSaver } from './asset-saver.js';
import {
  JobData,
  JobResult,
  ServiceInfo,
  ProgressCallback,
  logger,
} from '@emp/core';

export class OpenAIResponsesConnector extends AsyncRESTConnector {
  service_type = 'openai_responses' as const;
  version = '1.0.0';

  /**
   * Get required environment variables for OpenAI Responses connector
   */
  static getRequiredEnvVars(): Record<string, string> {
    return {
      OPENAI_API_KEY: '${OPENAI_API_KEY}',
      OPENAI_BASE_URL: '${OPENAI_BASE_URL:-https://api.openai.com/v1}',
      CLOUD_STORAGE_PROVIDER: '${CLOUD_STORAGE_PROVIDER}',
      CLOUD_STORAGE_CONTAINER: '${CLOUD_STORAGE_CONTAINER}'
    };
  }

  constructor(connectorId: string, serviceConfig?: any) {
    const config: AsyncRESTConnectorConfig = {
      connector_id: connectorId,
      service_type: serviceConfig?.service_type || 'openai_responses',
      base_url: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      timeout_seconds: parseInt(process.env.OPENAI_TIMEOUT_SECONDS || '60'),
      retry_attempts: parseInt(process.env.OPENAI_RETRY_ATTEMPTS || '3'),
      retry_delay_seconds: parseInt(process.env.OPENAI_RETRY_DELAY_SECONDS || '5'),
      max_concurrent_jobs: parseInt(process.env.OPENAI_RESPONSES_MAX_CONCURRENT_JOBS || '5'),
      
      // Authentication
      auth: {
        type: 'bearer',
        bearer_token: process.env.OPENAI_API_KEY || ''
      },
      
      // HTTP settings
      content_type: 'application/json',
      accept_header: 'application/json',
      
      // Async polling settings - ALWAYS poll
      polling_interval_ms: 5000, // Check every 5 seconds
      polling_timeout_seconds: 300, // 5 minute timeout
      status_endpoint_pattern: '/responses/{id}', // OpenAI polling endpoint
    };

    super(connectorId, config);

    // Set service_type from constructor config
    this.service_type = config.service_type as 'openai_responses';

    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    logger.info(`OpenAI Responses connector ${connectorId} initialized - ALWAYS uses async polling`);
  }

  // ========================================
  // AsyncRESTConnector Implementation
  // ========================================

  /**
   * Build clean payload for OpenAI submission - removes EmProps metadata
   */
  protected buildSubmissionPayload(jobData: JobData): any {
    const payload = jobData.payload as any;
    
    // For dynamic_json jobs, the payload should already be processed
    const rawPayload = payload.dynamic_json || payload;

    // Filter out EmProps-specific fields that OpenAI doesn't understand
    const cleanPayload = { ...rawPayload };
    
    // Remove EmProps metadata fields
    delete cleanPayload.ctx;
    delete cleanPayload.bucket;
    delete cleanPayload.prefix;
    delete cleanPayload.filename;
    delete cleanPayload.provider;
    delete cleanPayload.cdnUrl;
    delete cleanPayload.workflow_name;
    delete cleanPayload.user_id;
    delete cleanPayload.generation_context;
    delete cleanPayload.save_assets;

    // Ensure we have a model (required for OpenAI Responses API)
    if (!cleanPayload.model) {
      cleanPayload.model = 'gpt-4.1'; // Default model
    }

    logger.info(`🧹 Cleaned payload for OpenAI - removed EmProps metadata fields`);
    logger.info(`🎯 Final OpenAI payload keys: ${Object.keys(cleanPayload).join(', ')}`);

    return cleanPayload;
  }

  /**
   * OpenAI submission endpoint is always /responses
   */
  protected getSubmissionEndpoint(): string {
    return '/responses';
  }

  /**
   * Extract OpenAI response ID from submission response
   */
  protected extractAsyncJobId(response: AxiosResponse): string {
    const responseData = response.data;
    if (!responseData.id) {
      throw new Error('No OpenAI response ID returned from submission');
    }
    return responseData.id;
  }

  /**
   * Parse OpenAI polling response to check completion status
   * This ALWAYS gets called - no smart decisions about whether to poll
   */
  protected async parsePollingResponse(response: AxiosResponse, jobData: JobData): Promise<{
    completed: boolean;
    result?: JobResult;
    error?: string;
    progress?: number;
  }> {
    const responseData = response.data;
    
    logger.debug(`OpenAI polling response status: ${responseData.status}`, {
      responseId: responseData.id,
      status: responseData.status
    });
    
    if (responseData.status === 'completed') {
      logger.info(`OpenAI job ${responseData.id} completed - extracting content`);
      
      // Check if this is an image generation response
      let hasImageGeneration = false;
      let imageBase64Data = null;
      let textContent = '';
      
      if (responseData.output && Array.isArray(responseData.output)) {
        for (const output of responseData.output) {
          // Handle image generation responses
          if (output.type === 'image_generation_call' && output.status === 'completed') {
            hasImageGeneration = true;
            if (output.result) {
              // Check if it's a data URL or raw base64
              if (output.result.startsWith('data:image/')) {
                // Extract base64 from data URL
                imageBase64Data = output.result.replace(/^data:[^;]+;base64,/, '');
                logger.info(`Found image generation result (data URL): ${output.output_format} format, ${imageBase64Data.length} chars`);
              } else if (output.result.length > 100 && /^[A-Za-z0-9+/=]+$/.test(output.result)) {
                // Raw base64 data
                imageBase64Data = output.result;
                logger.info(`Found image generation result (raw base64): ${output.output_format} format, ${imageBase64Data.length} chars`);
              }
            }
          }
          // Handle text content responses  
          else if (output.type === 'message' && output.content) {
            for (const content of output.content) {
              if (content.type === 'output_text' && content.text) {
                textContent += content.text + '\n';
              }
            }
          }
        }
      }

      // For image generation jobs, we need an actual image, not just text
      if (hasImageGeneration) {
        if (!imageBase64Data) {
          return {
            completed: true,
            error: 'Image generation completed but no image data found in response'
          };
        }

        // Log image save details
        logger.info(`🖼️ PREPARING IMAGE SAVE - Job: ${jobData.id}`);
        logger.info(`🖼️ Image base64 length: ${imageBase64Data.length}`);
        logger.info(`🖼️ JobData keys: ${Object.keys(jobData).join(', ')}`);
        logger.info(`🖼️ JobData.ctx exists: ${!!(jobData as any).ctx}`);
        logger.info(`🖼️ JobData.payload.ctx exists: ${!!(jobData.payload as any)?.ctx}`);
        
        if ((jobData as any).ctx) {
          logger.info(`🖼️ JobData.ctx: ${JSON.stringify((jobData as any).ctx, null, 2)}`);
        }
        if ((jobData.payload as any)?.ctx) {
          logger.info(`🖼️ JobData.payload.ctx: ${JSON.stringify((jobData.payload as any).ctx, null, 2)}`);
        }
        
        // Try to save image to cloud storage
        let savedImageUrl = null;
        try {
          logger.info(`🖼️ CALLING AssetSaver.saveAssetToCloud for image...`);
          const savedAsset = await AssetSaver.saveAssetToCloud(
            imageBase64Data,
            jobData.id,
            jobData,
            'image/png'
          );
          savedImageUrl = savedAsset.cdnUrl || savedAsset.fileUrl;
          logger.info(`🖼️ SUCCESS - Image saved to: ${savedImageUrl}`);
        } catch (error) {
          logger.error(`🖼️ FAILED to save image to cloud storage: ${error.message}`);
          logger.error(`🖼️ Error stack: ${error.stack}`);
        }

        // Build successful image result  
        const jobResult: JobResult = {
          success: true,
          data: {
            openai_response_id: responseData.id,
            model_used: responseData.model,
            usage: responseData.usage,
            content_type: 'image',
            image_base64: imageBase64Data,
            image_url: savedImageUrl, // Add the saved URL
            text_description: textContent.trim(), // The description text if any
            raw_output: responseData.output, // Full OpenAI response for debugging
          },
          processing_time_ms: 0, // Will be calculated by base class
        };

        return {
          completed: true,
          result: jobResult,
          progress: 100
        };
      } else {
        // Text-only response
        const jobResult: JobResult = {
          success: true,
          data: {
            openai_response_id: responseData.id,
            model_used: responseData.model,
            usage: responseData.usage,
            content_type: 'text',
            text_content: textContent.trim(), // The actual generated content
            raw_output: responseData.output, // Full OpenAI response for debugging
          },
          processing_time_ms: 0, // Will be calculated by base class
        };

        return {
          completed: true,
          result: jobResult,
          progress: 100
        };
      }
    } 
    else if (responseData.status === 'failed') {
      return {
        completed: true,
        error: responseData.error || 'OpenAI Responses job failed'
      };
    } 
    else if (responseData.status === 'cancelled') {
      return {
        completed: true,
        error: 'OpenAI Responses job was cancelled'
      };
    }
    
    // Job still processing (in_progress, queued, etc.)
    // Estimate progress based on status
    let progress = 30;
    if (responseData.status === 'in_progress') progress = 60;
    
    return { 
      completed: false,
      progress 
    };
  }

  // ========================================
  // Enhanced Processing with Cloud Storage
  // ========================================

  /**
   * Override processJob to add cloud storage integration
   */
  async processJob(jobData: JobData, progressCallback?: ProgressCallback): Promise<JobResult> {
    logger.info(`Processing OpenAI Responses job ${jobData.id} - ALWAYS polling`);

    // Use AsyncRESTConnector's processing (guaranteed polling)
    const result = await super.processJob(jobData, progressCallback);
    
    if (result.success && result.data) {
      // Save response to cloud storage if completed successfully
      try {
        const textContent = (result.data as any).text_content;
        if (textContent) {
          const savedAsset = await this.saveResponseToStorage(textContent, jobData);
          
          // Add saved asset info to result
          if (savedAsset) {
            (result.data as any).saved_asset = savedAsset;
            logger.info(`OpenAI response saved to cloud storage: ${savedAsset.fileName}`);
          }
        }
      } catch (error) {
        logger.error(`Failed to save OpenAI response to storage for job ${jobData.id}: ${error.message}`);
        // Don't fail the job if storage fails - just log the error
      }
    }

    return result;
  }

  /**
   * Save OpenAI response text to cloud storage
   */
  private async saveResponseToStorage(textContent: string, jobData: JobData): Promise<any> {
    try {
      if (!textContent.trim()) {
        logger.warn(`No text content to save for job ${jobData.id}`);
        return null;
      }

      // Convert text to base64 for storage
      const base64Content = Buffer.from(textContent.trim(), 'utf8').toString('base64');

      // Save to cloud storage using AssetSaver
      const savedAsset = await AssetSaver.saveAssetToCloud(
        base64Content,
        jobData.id,
        jobData,
        'text/plain'
      );

      return savedAsset;

    } catch (error) {
      logger.error(`Failed to save OpenAI response to storage for job ${jobData.id}: ${error.message}`);
      return null;
    }
  }

  // ========================================
  // BaseConnector Required Methods
  // ========================================

  async cleanupService(): Promise<void> {
    logger.info(`Cleaning up OpenAI Responses connector ${this.connector_id}`);
    // No specific cleanup needed for HTTP-based connector
  }

  async processJobImpl(jobData: JobData, progressCallback?: ProgressCallback): Promise<JobResult> {
    // Delegate to the enhanced processJob method with cloud storage
    return this.processJob(jobData, progressCallback);
  }

  async getAvailableModels(): Promise<string[]> {
    // OpenAI Responses API supports various models
    return ['gpt-4.1', 'gpt-4.1-2025-04-14', 'gpt-4o', 'gpt-4o-mini'];
  }

  async canProcessJob(jobData: JobData): Promise<boolean> {
    const payload = jobData.payload as any;
    
    // Must have model and input for OpenAI Responses API
    if (!payload.model && !payload.input) {
      return false;
    }
    
    // Check if this is a dynamic_json job or direct OpenAI format
    const actualPayload = payload.dynamic_json || payload;
    return !!(actualPayload.model || actualPayload.input);
  }

  async cancelJob(jobId: string): Promise<void> {
    logger.info(`Cancel requested for OpenAI job ${jobId} - not supported by OpenAI API`);
    // OpenAI Responses API doesn't support job cancellation
    throw new Error('Job cancellation not supported by OpenAI Responses API');
  }

  async updateConfiguration(newConfig: any): Promise<void> {
    logger.info(`Configuration update requested for connector ${this.connector_id}`);
    // Configuration updates would require restart for security (API keys, etc.)
    throw new Error('Configuration updates require connector restart');
  }

  // ========================================
  // Service Information
  // ========================================

  async getServiceInfo(): Promise<ServiceInfo> {
    return {
      service_name: 'OpenAI Responses API',
      service_version: this.version,
      base_url: this.asyncRestConfig.base_url,
      status: this.currentStatus === 'idle' || this.currentStatus === 'active' ? 'online' : 'offline',
      capabilities: {
        supported_formats: ['json'],
        supported_models: ['gpt-4.1', 'gpt-4.1-2025-04-14'], // Common OpenAI models
        features: [
          'dynamic_json',
          'async_processing',
          'guaranteed_polling', // Key feature - always polls
          'text_generation',
          'image_analysis',
          'cloud_storage',
          'asset_saving',
        ],
        concurrent_jobs: this.asyncRestConfig.max_concurrent_jobs,
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
      always_polls: true, // Key configuration - never synchronous
    };
  }
}