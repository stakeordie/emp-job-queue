// OpenAI Image Connector - Handles image generation using OpenAI SDK
// Uses the OpenAI images API for DALL-E image generation tasks

import OpenAI from 'openai';
import { BaseConnector } from './base-connector.js';
import { JobData, JobResult, ServiceInfo, HealthCheckClass, ProgressCallback, logger } from '@emp/core';

export class OpenAIImageConnector extends BaseConnector {
  service_type = 'image_generation' as const;
  version = '1.0.0';
  
  private client: OpenAI | null = null;
  private apiKey: string;
  private baseURL: string;
  private defaultModel: string;
  private defaultSize: string;
  private defaultQuality: string;
  
  /**
   * Get required environment variables for OpenAI Image connector
   */
  static getRequiredEnvVars(): Record<string, string> {
    return {
      OPENAI_API_KEY: '${OPENAI_API_KEY:-}',
      OPENAI_BASE_URL: '${OPENAI_BASE_URL:-https://api.openai.com/v1}',
      OPENAI_IMAGE_MODEL: '${OPENAI_IMAGE_MODEL:-gpt-4.1}',
      OPENAI_IMAGE_SIZE: '${OPENAI_IMAGE_SIZE:-1024x1024}',
      OPENAI_IMAGE_QUALITY: '${OPENAI_IMAGE_QUALITY:-standard}',
      OPENAI_TIMEOUT_SECONDS: '${OPENAI_TIMEOUT_SECONDS:-120}',
      OPENAI_RETRY_ATTEMPTS: '${OPENAI_RETRY_ATTEMPTS:-3}',
      OPENAI_RETRY_DELAY_SECONDS: '${OPENAI_RETRY_DELAY_SECONDS:-5}',
      OPENAI_HEALTH_CHECK_INTERVAL: '${OPENAI_HEALTH_CHECK_INTERVAL:-120}',
      OPENAI_IMAGE_MAX_CONCURRENT_JOBS: '${OPENAI_IMAGE_MAX_CONCURRENT_JOBS:-3}'
    };
  }

  constructor(connectorId: string = 'openai-image') {
    const config = {
      connector_id: connectorId,
      service_type: 'image_generation',
      base_url: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      timeout_seconds: parseInt(process.env.OPENAI_TIMEOUT_SECONDS || '120'),
      retry_attempts: parseInt(process.env.OPENAI_RETRY_ATTEMPTS || '3'),
      retry_delay_seconds: parseInt(process.env.OPENAI_RETRY_DELAY_SECONDS || '5'),
      health_check_interval_seconds: parseInt(process.env.OPENAI_HEALTH_CHECK_INTERVAL || '120'),
      max_concurrent_jobs: parseInt(process.env.OPENAI_IMAGE_MAX_CONCURRENT_JOBS || '3'),
    };

    super(connectorId, config);

    // OpenAI-specific configuration
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.baseURL = config.base_url;
    this.defaultModel = 'gpt-4.1'; // Using gpt-4.1 for streaming image generation
    this.defaultSize = process.env.OPENAI_IMAGE_SIZE || '1024x1024';
    this.defaultQuality = process.env.OPENAI_IMAGE_QUALITY || 'standard';

    if (!this.apiKey) {
      throw new Error('OpenAI Image connector requires OPENAI_API_KEY environment variable');
    }

    logger.info(`OpenAI Image connector ${connectorId} initialized with model ${this.defaultModel}`);
  }

  async initializeService(): Promise<void> {
    try {
      this.client = new OpenAI({
        apiKey: this.apiKey,
        baseURL: this.baseURL,
        timeout: this.config.timeout_seconds * 1000,
        maxRetries: this.config.retry_attempts,
      });

      // Test the connection
      await this.checkHealth();
      
      this.currentStatus = 'idle';
      logger.info(`OpenAI Image connector ${this.connector_id} initialized successfully`);
    } catch (error) {
      this.currentStatus = 'error';
      throw new Error(`Failed to initialize OpenAI Image connector: ${error.message}`);
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      if (!this.client) {
        return false;
      }

      // Simple health check - list models to verify API connectivity
      const models = await this.client.models.list();
      return models.data.length > 0;
    } catch (error) {
      logger.warn(`OpenAI Image connector health check failed: ${error.message}`);
      return false;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      if (!this.client) {
        return [this.defaultModel];
      }

      const models = await this.client.models.list();
      return models.data
        .filter(model => model.id.includes('gpt-image'))
        .map(model => model.id);
    } catch (error) {
      logger.warn(`Failed to fetch OpenAI models: ${error.message}`);
      return [this.defaultModel];
    }
  }

  protected getRequiredHealthCheckClass() {
    // API-only services use MINIMAL health checking (no job status query required)
    return HealthCheckClass.MINIMAL;
  }

  async getServiceInfo(): Promise<ServiceInfo> {
    const models = await this.getAvailableModels();
    
    return {
      service_name: 'OpenAI Image Generation',
      service_version: this.version,
      base_url: this.baseURL,
      status: (this.currentStatus === 'idle' || this.currentStatus === 'active') ? 'online' : 
              (this.currentStatus === 'offline') ? 'offline' : 'error',
      capabilities: {
        supported_formats: ['png', 'webp'],
        supported_models: models,
        features: [
          'image_generation',
          'text_to_image',
          'prompt_based',
          'dall_e',
          'quality_control',
          'size_variants'
        ],
        concurrent_jobs: this.config.max_concurrent_jobs
      }
    };
  }

  async canProcessJob(jobData: JobData): Promise<boolean> {
    const payload = jobData.payload as any;
    
    // Check if job has required fields for image generation
    if (!payload.prompt && !payload.description) {
      return false;
    }

    // Check if model is supported (if specified)
    if (payload.model) {
      const availableModels = await this.getAvailableModels();
      if (!availableModels.includes(payload.model)) {
        return false;
      }
    }

    return true;
  }

  async processJobImpl(jobData: JobData, progressCallback?: ProgressCallback): Promise<JobResult> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    try {
      const payload = jobData.payload as any;
      const model = payload.model || this.defaultModel;
      const size = payload.size || this.defaultSize;
      const quality = payload.quality || this.defaultQuality;
      const n = Math.min(payload.n || 1, 1); // DALL-E 3 only supports n=1

      // Get the prompt from either prompt or description field
      const prompt = payload.prompt || payload.description;
      if (!prompt) {
        throw new Error('Job must contain either "prompt" or "description" field');
      }

      logger.info(`Processing image generation job with model ${model}, size ${size} with streaming`);
      
      // PROOF: Log exact request parameters
      logger.info(`PROOF - Model being sent to API: "${model}"`);
      logger.info(`PROOF - Connector defaultModel: "${this.defaultModel}"`);
      logger.info(`PROOF - Payload model (if any): "${payload.model || 'undefined'}"`);
      logger.info(`PROOF - Request will use model: "${model}" for OpenAI Responses API`);

      // Report initial progress
      if (progressCallback) {
        await progressCallback({
          job_id: jobData.id,
          progress: 10,
          message: `Starting image generation with ${model}`,
          current_step: 'initializing'
        });
      }

      // Use Responses API with streaming for progress updates
      const stream = await this.client.responses.create({
        model,
        input: prompt,
        stream: true as const,
        tools: [{ type: "image_generation" as const, partial_images: 2 }]
      });

      let finalImageUrl: string | undefined;
      let revisedPrompt: string | undefined;
      let partialCount = 0;
      const partialImages: string[] = [];

      // Process streaming response
      for await (const event of stream) {
        if (event.type === "response.image_generation_call.partial_image") {
          partialCount++;
          const progress = Math.min(85, 10 + (partialCount * 35)); // Progress from 10% to 85%
          
          // Convert base64 to buffer and then to data URL for immediate use
          const imageBuffer = Buffer.from(event.partial_image_b64, "base64");
          const partialImageDataUrl = `data:image/png;base64,${event.partial_image_b64}`;
          partialImages.push(partialImageDataUrl);
          
          if (progressCallback) {
            await progressCallback({
              job_id: jobData.id,
              progress,
              message: `Partial image ${partialCount} received`,
              current_step: 'generating',
              metadata: {
                partial_image_index: event.partial_image_index,
                partial_image_data_url: partialImageDataUrl,
                partial_count: partialCount
              }
            });
          }

          logger.info(`Received partial image ${partialCount} (index ${event.partial_image_index}) for job ${jobData.id}`);
        } else if (event.type.includes('done')) {
          // Stream is complete, need to get final image
          if (progressCallback) {
            await progressCallback({
              job_id: jobData.id,
              progress: 95,
              message: 'Finalizing image...',
              current_step: 'finalizing'
            });
          }
        }
      }

      // After streaming completes, we need to get the final image URL
      // For now, we'll use the last partial image as the final result
      // In a real implementation, you'd upload the final image buffer to storage
      if (partialImages.length > 0) {
        finalImageUrl = partialImages[partialImages.length - 1]; // Use last partial as final
        
        if (progressCallback) {
          await progressCallback({
            job_id: jobData.id,
            progress: 100,
            message: 'Image generation complete',
            current_step: 'completed',
            metadata: {
              final_image_url: finalImageUrl,
              total_partial_images: partialCount
            }
          });
        }

        logger.info(`Final image ready for job ${jobData.id} (${partialCount} partial images received)`);
      } else {
        throw new Error('No partial images received from OpenAI streaming response');
      }

      return {
        success: true,
        data: {
          image_url: finalImageUrl,
          revised_prompt: revisedPrompt,
          model_used: model,
          size: size,
          quality: quality,
        },
        processing_time_ms: 0, // Will be calculated by base class
        metadata: {
          model: model,
          service: 'openai_image',
          streaming_enabled: true,
          partial_images_received: partialCount,
          partial_images: partialImages,
          parameters: {
            size,
            quality,
            n,
            original_prompt: prompt,
            revised_prompt: revisedPrompt,
          }
        },
        service_metadata: {
          service_version: this.version,
          service_type: this.service_type,
          model_used: model,
        }
      };
    } catch (error) {
      logger.error(`OpenAI Image processing failed: ${error.message}`);
      throw error;
    }
  }

  async cleanupService(): Promise<void> {
    this.client = null;
    this.currentStatus = 'offline';
    logger.info(`OpenAI Image connector ${this.connector_id} cleaned up`);
  }

  async cancelJob(jobId: string): Promise<void> {
    // OpenAI doesn't support job cancellation
    // For image generation, jobs are typically short-lived
    logger.info(`Job cancellation requested for ${jobId} (OpenAI image jobs cannot be cancelled once started)`);
  }

  async updateConfiguration(config: any): Promise<void> {
    // Update configuration if needed
    logger.info(`Configuration update requested for OpenAI Image connector ${this.connector_id}`);
  }

  getConfiguration(): any {
    return {
      connector_id: this.connector_id,
      service_type: this.service_type,
      model: this.defaultModel,
      size: this.defaultSize,
      quality: this.defaultQuality,
      max_concurrent_jobs: this.config.max_concurrent_jobs,
    };
  }
}