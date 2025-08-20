// OpenAI Image-to-Image Connector - Handles img2img generation using OpenAI responses API
// Uses multiple reference images with text prompts for advanced image generation

import OpenAI from 'openai';
import * as crypto from 'crypto';
import { OpenAIBaseConnector } from './openai-base-connector.js';
import { AssetSaver } from './asset-saver.js';
import {
  JobData,
  JobResult,
  ServiceInfo,
  ProgressCallback,
  logger,
} from '@emp/core';

export class OpenAIImg2ImgConnector extends OpenAIBaseConnector {
  service_type = 'image_generation' as const; // Will be set by constructor from service mapping
  version = '1.0.0';

  private defaultModel: string;

  /**
   * Get required environment variables for OpenAI Img2Img connector
   */
  static getRequiredEnvVars(): Record<string, string> {
    return {
      ...super.getRequiredEnvVars(), // Include base connector env vars
      ...OpenAIBaseConnector.getBaseOpenAIEnvVars(), // Include shared OpenAI env vars
      OPENAI_IMG2IMG_MODEL: '${OPENAI_IMG2IMG_MODEL:-gpt-4.1}',
      OPENAI_IMG2IMG_MAX_CONCURRENT_JOBS: '${OPENAI_IMG2IMG_MAX_CONCURRENT_JOBS:-2}',
    };
  }

  constructor(connectorId: string, serviceConfig?: any) {
    // Get service_type from service mapping configuration (like SimulationConnector)
    const config = {
      connector_id: connectorId,
      service_type: serviceConfig?.service_type || 'image_generation', // Fallback for backwards compatibility
      base_url: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      timeout_seconds: parseInt(process.env.OPENAI_TIMEOUT_SECONDS || '120'),
      retry_attempts: parseInt(process.env.OPENAI_RETRY_ATTEMPTS || '3'),
      retry_delay_seconds: parseInt(process.env.OPENAI_RETRY_DELAY_SECONDS || '5'),
      health_check_interval_seconds: parseInt(process.env.OPENAI_HEALTH_CHECK_INTERVAL || '120'),
      max_concurrent_jobs: parseInt(process.env.OPENAI_IMG2IMG_MAX_CONCURRENT_JOBS || '2'),
    };

    super(connectorId, config);

    // Set service_type from constructor config (overrides hardcoded value)
    this.service_type = config.service_type;

    // Img2Img-specific configuration
    this.defaultModel = process.env.OPENAI_IMG2IMG_MODEL || 'gpt-4.1';

    logger.info(`OpenAI Img2Img connector ${connectorId} initialized with model ${this.defaultModel}`);
  }

  /**
   * Convert image input (URL, base64, or template variable) to base64 data URL
   */
  private async imageUrlToBase64(imageInput: string): Promise<string> {
    try {
      // Case 1: Already a data URL
      if (imageInput.startsWith('data:')) {
        return imageInput;
      }

      // Case 2: Base64 string (detect common patterns)
      if (this.isBase64String(imageInput)) {
        logger.info(`Converting base64 string to data URL (${imageInput.length} chars)`);
        // Assume PNG for pure base64 strings (most common for generated images)
        return `data:image/png;base64,${imageInput}`;
      }

      // Case 3: Template variable or invalid input
      if (imageInput.includes('{{') || imageInput.includes('}}') || !this.isValidUrl(imageInput)) {
        throw new Error(`Invalid image input: "${imageInput}". Expected URL, data URL, or base64 string, but received template variable or invalid format.`);
      }

      // Case 4: Valid URL - fetch and convert
      logger.info(`Fetching and converting image from URL: ${imageInput.substring(0, 80)}...`);
      const response = await fetch(imageInput);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString('base64');

      // Determine MIME type from response headers or URL
      let mimeType = response.headers.get('content-type') || 'image/jpeg';
      if (!mimeType.startsWith('image/')) {
        // Fallback based on URL extension
        const urlLower = imageInput.toLowerCase();
        if (urlLower.includes('.png')) mimeType = 'image/png';
        else if (urlLower.includes('.webp')) mimeType = 'image/webp';
        else if (urlLower.includes('.gif')) mimeType = 'image/gif';
        else mimeType = 'image/jpeg';
      }

      const dataUrl = `data:${mimeType};base64,${base64}`;
      logger.info(`URL conversion successful: ${buffer.length} bytes → base64 data URL`);
      return dataUrl;
    } catch (error) {
      logger.error(`Failed to convert image input to base64: ${error.message}`);
      throw new Error(`Image conversion failed: ${error.message}`);
    }
  }

  /**
   * Check if a string is a valid base64 encoded string
   */
  private isBase64String(str: string): boolean {
    // Base64 strings are typically long and contain only valid base64 characters
    if (str.length < 100) return false; // Too short to be a meaningful image
    
    // Check for base64 pattern
    const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
    return base64Pattern.test(str) && str.length % 4 === 0;
  }

  /**
   * Check if a string is a valid URL
   */
  private isValidUrl(str: string): boolean {
    try {
      new URL(str);
      return true;
    } catch {
      return false;
    }
  }

  async initializeService(): Promise<void> {
    try {
      // Use base class OpenAI client initialization
      await this.initializeOpenAIClient();

      // Test the connection
      await this.checkHealth();
      this.currentStatus = 'idle';
      logger.info(`OpenAI Img2Img connector ${this.connector_id} initialized successfully`);
    } catch (error) {
      this.currentStatus = 'error';
      throw new Error(`Failed to initialize OpenAI Img2Img connector: ${error.message}`);
    }
  }


  async getAvailableModels(): Promise<string[]> {
    try {
      if (!this.client) {
        return [this.defaultModel];
      }
      const models = await this.client.models.list();
      return models.data.filter(model => model.id.includes('gpt')).map(model => model.id);
    } catch (error) {
      logger.warn(`Failed to fetch OpenAI models: ${error.message}`);
      return [this.defaultModel];
    }
  }


  async getServiceInfo(): Promise<ServiceInfo> {
    const models = await this.getAvailableModels();
    return {
      service_name: 'OpenAI Image-to-Image Generation',
      service_version: this.version,
      base_url: this.baseURL,
      status:
        this.currentStatus === 'idle' || this.currentStatus === 'active'
          ? 'online'
          : this.currentStatus === 'offline'
            ? 'offline'
            : 'error',
      capabilities: {
        supported_formats: ['png', 'jpeg', 'webp'],
        supported_models: models,
        features: [
          'image_generation',
          'img2img',
          'multi_image_input',
          'reference_images',
          'prompt_based',
          'gpt_4_1',
          'responses_api',
          'cloud_storage',
          'asset_saving',
          'custom_prefix',
        ],
        concurrent_jobs: this.config.max_concurrent_jobs,
      },
    };
  }

  async canProcessJob(jobData: JobData): Promise<boolean> {
    const payload = jobData.payload as any;

    // Must have a text prompt
    if (!payload.prompt && !payload.text) {
      return false;
    }

    // Must have at least one image
    if (!payload.images || !Array.isArray(payload.images) || payload.images.length === 0) {
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
      const prompt = payload.prompt || payload.text;
      const images = payload.images || [];

      if (!prompt) {
        throw new Error('Job must contain either "prompt" or "text" field');
      }

      if (!Array.isArray(images) || images.length === 0) {
        throw new Error('Job must contain "images" array with at least one image URL');
      }

      logger.info(`Processing img2img job with model ${model}, ${images.length} reference images`);

      // Report initial progress
      if (progressCallback) {
        await progressCallback({
          job_id: jobData.id,
          progress: 5,
          message: `Starting img2img generation with ${model}`,
          current_step: 'initializing',
        });
      }

      // Convert all image URLs to base64 data URLs
      if (progressCallback) {
        await progressCallback({
          job_id: jobData.id,
          progress: 15,
          message: `Converting ${images.length} images to base64...`,
          current_step: 'preprocessing',
        });
      }

      const processedImages = await Promise.all(
        images.map(async (imageUrl: string) => {
          const base64DataUrl = await this.imageUrlToBase64(imageUrl);
          return {
            type: 'input_image' as const,
            image_url: base64DataUrl,
            detail: 'auto' as const,
          };
        })
      );

      logger.info(`Converted ${processedImages.length} images to base64 format`);

      // Prepare the structured input for responses API
      const input = [
        {
          role: 'user' as const,
          content: [
            { type: 'input_text' as const, text: prompt },
            ...processedImages,
          ],
        },
      ];

      if (progressCallback) {
        await progressCallback({
          job_id: jobData.id,
          progress: 25,
          message: 'Generating image with OpenAI responses API...',
          current_step: 'generating',
        });
      }

      // Use background polling approach for reliability and status tracking
      const requestConfig = {
        model,
        input,
        background: true,
        stream: false, // Use polling instead of streaming
        tools: [{ type: 'image_generation' as const }],
      };

      logger.info(`🚀 Creating OpenAI background img2img request for job ${jobData.id}`);
      
      // Debug: Log exactly what we're sending to OpenAI
      if (process.env.OPENAI_DEBUG === 'true') {
        logger.info(`🔍 OpenAI Request Config for job ${jobData.id}:`);
        logger.info(`   Model: ${requestConfig.model}`);
        logger.info(`   Background: ${requestConfig.background}`);
        logger.info(`   Stream: ${requestConfig.stream}`);
        logger.info(`   Tools: ${JSON.stringify(requestConfig.tools)}`);
        logger.info(`   Input length: ${requestConfig.input.length}`);
        requestConfig.input.forEach((item, index) => {
          if (item.role === 'user' && item.content) {
            logger.info(`   Input[${index}] role: ${item.role}, content items: ${item.content.length}`);
            item.content.forEach((contentItem, contentIndex) => {
              if (contentItem.type === 'input_text') {
                logger.info(`     Content[${contentIndex}]: text (${contentItem.text.length} chars)`);
              } else if (contentItem.type === 'input_image') {
                let imageDesc: string;
                if ('image_url' in contentItem && contentItem.image_url) {
                  imageDesc = `data URL (${contentItem.image_url.length} chars)`;
                } else if ('file_id' in contentItem && contentItem.file_id) {
                  imageDesc = `file_id: ${contentItem.file_id}`;
                } else {
                  imageDesc = 'unknown image format';
                }
                logger.info(`     Content[${contentIndex}]: image (${imageDesc})`);
              }
            });
          }
        });
      }
      
      const response = await this.client.responses.create(requestConfig);

      // Extract OpenAI job ID from response (handle type properly)
      const openaiJobId = (response as any).id;
      if (!openaiJobId) {
        throw new Error(`No OpenAI job ID returned from background img2img request for job ${jobData.id}`);
      }

      logger.info(`✅ OpenAI background img2img job created: ${openaiJobId} for job ${jobData.id}`);

      if (progressCallback) {
        await progressCallback({
          job_id: jobData.id,
          progress: 50,
          message: `OpenAI img2img job ${openaiJobId} started, polling for completion`,
          current_step: 'processing',
          metadata: {
            openai_job_id: openaiJobId,
            approach: 'background_polling'
          },
        });
      }

      // Poll for job completion (use base class method with custom progress range)
      const pollResult = await this.pollForJobCompletion(openaiJobId, jobData.id, progressCallback, 50, 80);
      
      logger.info(`Background polling successful for OpenAI img2img job ${openaiJobId} -> job ${jobData.id}`);
      
      // Validate that the response contains images using MessageBus pattern
      if (!pollResult.images || !Array.isArray(pollResult.images) || pollResult.images.length === 0) {
        // This triggers MessageBus pattern matching: should_terminate = true, recoverable = false
        throw new Error(`No image was generated - check that the prompt is asking for an image`);
      }
      
      const imageBase64 = pollResult.images[0];

      if (progressCallback) {
        await progressCallback({
          job_id: jobData.id,
          progress: 80,
          message: 'Image generated successfully',
          current_step: 'processing',
          metadata: {
            openai_job_id: openaiJobId,
            poll_attempts: pollResult.pollAttempts,
            total_poll_time_ms: pollResult.totalPollTimeMs
          },
        });
      }

      // Process final image with optional asset saving
      let savedAsset: { filePath: string; fileName: string; fileUrl: string } | null = null;
      
      // Check if we should save assets (default: true)
      const saveAssets = payload.save_assets !== false; // Default to true unless explicitly false

      if (saveAssets && imageBase64) {
        try {
          // Save the base64 image data to cloud storage
          logger.info(`💾 Attempting to save image asset for job ${jobData.id}`);
          savedAsset = await AssetSaver.saveAssetToCloud(imageBase64, jobData.id, jobData, 'image/png');
          logger.info(`✅ Image saved and verified in cloud storage: ${savedAsset.fileName}`);
        } catch (assetError) {
          logger.error(`❌ AssetSaver failed for job ${jobData.id}: ${assetError.message}`);
          const ctx = (jobData.payload as any)?.ctx;
          logger.error(`   Job payload structure: ${JSON.stringify({
            hasCtx: !!ctx,
            ctxKeys: ctx ? Object.keys(ctx) : [],
            hasStorage: !!(ctx as any)?.storage,
            storageKeys: (ctx as any)?.storage ? Object.keys((ctx as any).storage) : []
          }, null, 2)}`);
          
          // Re-throw with more context
          throw new Error(
            `Image generation succeeded but asset saving failed: ${assetError.message}. ` +
            `Job ID: ${jobData.id}. Check that job payload includes proper storage configuration in ctx.`
          );
        }
      }

      // Use the appropriate URL
      let resultImageUrl: string;
      if (savedAsset) {
        resultImageUrl = savedAsset.fileUrl; // Use cloud storage URL
      } else if (imageBase64) {
        resultImageUrl = `data:image/png;base64,${imageBase64}`; // Use data URL
      } else {
        throw new Error('No image data received from OpenAI img2img');
      }

      if (progressCallback) {
        await progressCallback({
          job_id: jobData.id,
          progress: 100,
          message: saveAssets ? 'Image saved successfully' : 'img2img generation complete',
          current_step: 'completed',
          metadata: {
            final_image_url: resultImageUrl,
            reference_images_count: images.length,
            saved_asset: savedAsset,
            save_assets: saveAssets,
            model_used: model,
            openai_job_id: openaiJobId,
            poll_attempts: pollResult.pollAttempts,
            total_poll_time_ms: pollResult.totalPollTimeMs,
            approach: 'background_polling'
          },
        });
      }

      logger.info(
        `img2img generation completed for job ${jobData.id} using ${model} with ${images.length} reference images (saved: ${saveAssets}) via ${openaiJobId}`
      );

      // Return minimal response like other connectors
      return {
        success: true,
        data: {
          model_used: model,
          reference_images_count: images.length,
          original_prompt: prompt,
          openai_job_id: openaiJobId,
          poll_attempts: pollResult.pollAttempts,
          total_poll_time_ms: pollResult.totalPollTimeMs,
          approach: 'background_polling'
        },
        processing_time_ms: 0, // Will be calculated by base class
      };
    } catch (error) {
      logger.error(`OpenAI img2img processing failed: ${error.message}`);
      throw error;
    }
  }


  getConfiguration(): any {
    return {
      connector_id: this.connector_id,
      service_type: this.service_type,
      model: this.defaultModel,
      max_concurrent_jobs: this.config.max_concurrent_jobs,
    };
  }
}