// OpenAI Responses Connector - Handles dynamic JSON payloads with OpenAI Responses API
// Inherits from HTTPConnector for simple HTTP request/response handling with polling

import { HTTPConnector, HTTPConnectorConfig } from './protocol/http-connector.js';
import { AssetSaver } from './asset-saver.js';
import {
  JobData,
  JobResult,
  ServiceInfo,
  ProgressCallback,
  logger,
} from '@emp/core';
import { AxiosResponse } from 'axios';

export class OpenAIResponsesConnector extends HTTPConnector {
  service_type = 'openai_responses' as const;
  version = '1.0.0';

  private apiKey: string;

  /**
   * Get required environment variables for OpenAI Responses connector
   */
  static getRequiredEnvVars(): Record<string, string> {
    return {
      ...super.getRequiredEnvVars(),
      OPENAI_API_KEY: '${OPENAI_API_KEY}',
      OPENAI_BASE_URL: '${OPENAI_BASE_URL:-https://api.openai.com/v1}',
      CLOUD_STORAGE_PROVIDER: '${CLOUD_STORAGE_PROVIDER}',
      CLOUD_STORAGE_CONTAINER: '${CLOUD_STORAGE_CONTAINER}'
    };
  }

  constructor(connectorId: string, serviceConfig?: any) {
    const config: HTTPConnectorConfig = {
      connector_id: connectorId,
      service_type: serviceConfig?.service_type || 'openai_responses',
      base_url: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      timeout_seconds: parseInt(process.env.OPENAI_TIMEOUT_SECONDS || '60'),
      retry_attempts: parseInt(process.env.OPENAI_RETRY_ATTEMPTS || '3'),
      retry_delay_seconds: parseInt(process.env.OPENAI_RETRY_DELAY_SECONDS || '5'),
      health_check_interval_seconds: parseInt(process.env.OPENAI_HEALTH_CHECK_INTERVAL || '120'),
      max_concurrent_jobs: parseInt(process.env.OPENAI_RESPONSES_MAX_CONCURRENT_JOBS || '5'),
      auth: {
        type: 'bearer',
        bearer_token: process.env.OPENAI_API_KEY || ''
      },
      content_type: 'application/json',
      accept_header: 'application/json',
      
      // Enable polling for async OpenAI responses
      polling_enabled: true,
      polling_interval_ms: 5000, // Check every 5 seconds
      polling_timeout_seconds: 300, // 5 minute timeout
      status_endpoint: '/responses/{id}', // OpenAI status endpoint pattern
    };

    super(connectorId, config);

    // Set service_type from constructor config
    this.service_type = config.service_type as 'openai_responses';

    // OpenAI API configuration
    this.apiKey = process.env.OPENAI_API_KEY || '';

    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    logger.info(
      `OpenAI Responses connector ${connectorId} initialized with base URL ${config.base_url}`
    );
  }

  async initializeService(): Promise<void> {
    try {
      // Test the connection with a simple health check
      await this.checkHealth();

      this.currentStatus = 'idle';
      logger.info(`OpenAI Responses connector ${this.connector_id} initialized successfully`);
    } catch (error) {
      this.currentStatus = 'error';
      throw new Error(`Failed to initialize OpenAI Responses connector: ${error.message}`);
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      // Simple health check - verify API key format
      if (!this.apiKey.startsWith('sk-')) {
        throw new Error('Invalid OpenAI API key format');
      }

      // Could add a simple API call here if needed
      return true;
    } catch (error) {
      logger.error(`OpenAI Responses health check failed: ${error.message}`);
      return false;
    }
  }

  async getServiceInfo(): Promise<ServiceInfo> {
    return {
      service_name: 'OpenAI Responses API',
      service_version: this.version,
      base_url: this.httpConfig.base_url,
      status: this.currentStatus === 'idle' || this.currentStatus === 'active' ? 'online' : 'offline',
      capabilities: {
        supported_formats: ['json'],
        supported_models: ['gpt-4.1', 'gpt-4o', 'gpt-3.5-turbo'],
        features: [
          'dynamic_json_payloads',
          'openai_responses_api',
          'background_polling',
          'cloud_storage',
          'asset_saving'
        ],
        concurrent_jobs: this.config.max_concurrent_jobs,
      },
    };
  }

  async canProcessJob(jobData: JobData): Promise<boolean> {
    const payload = jobData.payload as any;

    // Check if this is a dynamic JSON job or has required OpenAI fields
    if (payload.dynamic_json || payload.model || payload.input || payload.messages) {
      return true;
    }

    return false;
  }

  async getAvailableModels(): Promise<string[]> {
    // This connector doesn't manage models - it's a passthrough to OpenAI
    // Return common OpenAI models for reference
    return ['gpt-4.1', 'gpt-4o', 'gpt-3.5-turbo'];
  }

  // ========================================
  // HTTPConnector Abstract Methods Implementation
  // ========================================

  protected buildRequestPayload(jobData: JobData): any {
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

  protected parseResponse(response: AxiosResponse, jobData: JobData): JobResult {
    const responseData = response.data;

    // Check if this is a job submission response (has id but no output yet)
    if (responseData.id && !responseData.output) {
      // This is just the submission response, we'll need to poll
      return {
        success: false,
        error: 'Job submitted, polling required',
        processing_time_ms: 0,
        metadata: { openai_response_id: responseData.id }
      };
    }

    // This is the final response with output
    return {
      success: true,
      data: {
        openai_response_id: responseData.id,
        model_used: responseData.model,
        usage: responseData.usage,
        // Don't return file URLs directly - they're saved to cloud storage
      },
      processing_time_ms: 0, // Will be calculated by base class
    };
  }

  protected validateServiceResponse(response: AxiosResponse): boolean {
    const data = response.data;
    
    // Valid if we have an ID (for submission) or output (for completion)
    return !!(data && (data.id || data.output));
  }

  protected getJobEndpoint(jobData: JobData): string {
    return '/responses';
  }

  /**
   * Extract OpenAI response ID from submission response for polling
   */
  protected extractJobId(response: AxiosResponse): string | null {
    const responseData = response.data;
    return responseData.id || null;
  }

  /**
   * Parse status response from /responses/{id} endpoint
   */
  protected parseStatusResponse(response: AxiosResponse, jobData: JobData): {
    completed: boolean;
    result?: JobResult;
    error?: string;
  } {
    const responseData = response.data;
    
    if (responseData.status === 'completed') {
      // Parse the completed OpenAI response
      const jobResult: JobResult = {
        success: true,
        data: {
          openai_response_id: responseData.id,
          model_used: responseData.model,
          usage: responseData.usage,
          output: responseData.output,
        },
        processing_time_ms: 0, // Will be calculated by base class
      };
      
      return {
        completed: true,
        result: jobResult
      };
    } else if (responseData.status === 'failed') {
      return {
        completed: true,
        error: responseData.error || 'OpenAI Responses job failed'
      };
    } else if (responseData.status === 'cancelled') {
      return {
        completed: true,
        error: 'OpenAI Responses job was cancelled'
      };
    }
    
    // Job still processing (in_progress, queued, etc.)
    return { completed: false };
  }

  // ========================================
  // Custom Implementation
  // ========================================

  /**
   * Override processJob to add cloud storage integration
   * HTTPConnector handles the submission and polling automatically
   */
  async processJob(jobData: JobData, progressCallback?: ProgressCallback): Promise<JobResult> {
    logger.info(`Processing OpenAI Responses job ${jobData.id}`);

    // Use HTTPConnector's standard processing (handles submission and polling)
    const result = await super.processJob(jobData, progressCallback);
    
    if (result.success && result.data) {
      // Save response to cloud storage if completed successfully
      try {
        const savedAsset = await this.saveResponseToStorage(result.data, jobData);
        
        // Add saved asset info to result
        if (savedAsset) {
          (result.data as any).saved_asset = savedAsset;
        }
      } catch (error) {
        logger.error(`Failed to save OpenAI response to storage for job ${jobData.id}: ${error.message}`);
        // Don't fail the job if storage fails - just log the error
      }
    }

    return result;
  }

  /**
   * Save OpenAI response to cloud storage
   */
  private async saveResponseToStorage(responseData: any, jobData: JobData): Promise<any> {
    try {
      // Extract the text content from OpenAI response output
      let textContent = '';
      
      if (responseData.output && Array.isArray(responseData.output)) {
        for (const output of responseData.output) {
          if (output.type === 'message' && output.content) {
            for (const content of output.content) {
              if (content.type === 'output_text' && content.text) {
                textContent += content.text + '\n';
              }
            }
          }
        }
      }

      if (!textContent.trim()) {
        logger.warn(`No text content found in OpenAI response for job ${jobData.id}`);
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

      logger.info(`OpenAI response saved to cloud storage: ${savedAsset.fileName}`);
      return savedAsset;

    } catch (error) {
      logger.error(`Failed to save OpenAI response to storage for job ${jobData.id}: ${error.message}`);
      // Don't fail the job if storage fails - return null
      return null;
    }
  }

  getConfiguration(): any {
    return {
      connector_id: this.connector_id,
      service_type: this.service_type,
      base_url: this.httpConfig.base_url,
      max_concurrent_jobs: this.config.max_concurrent_jobs,
    };
  }
}