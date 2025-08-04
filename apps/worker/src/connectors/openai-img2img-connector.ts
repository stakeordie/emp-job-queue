// OpenAI Image-to-Image Connector - Handles img2img generation using OpenAI responses API
// Uses multiple reference images with text prompts for advanced image generation

import OpenAI from 'openai';
import * as crypto from 'crypto';
import { BaseConnector } from './base-connector.js';
import { AssetSaver } from './asset-saver.js';
import {
  JobData,
  JobResult,
  ServiceInfo,
  HealthCheckClass,
  ProgressCallback,
  logger,
} from '@emp/core';

export class OpenAIImg2ImgConnector extends BaseConnector {
  service_type = 'image_generation' as const;
  version = '1.0.0';

  private client: OpenAI | null = null;
  private apiKey: string;
  private baseURL: string;
  private defaultModel: string;

  /**
   * Get required environment variables for OpenAI Img2Img connector
   */
  static getRequiredEnvVars(): Record<string, string> {
    return {
      ...super.getRequiredEnvVars(), // Include base connector env vars
      OPENAI_API_KEY: '${OPENAI_API_KEY:-}',
      OPENAI_BASE_URL: '${OPENAI_BASE_URL:-https://api.openai.com/v1}',
      OPENAI_IMG2IMG_MODEL: '${OPENAI_IMG2IMG_MODEL:-gpt-4.1}',
      OPENAI_TIMEOUT_SECONDS: '${OPENAI_TIMEOUT_SECONDS:-120}',
      OPENAI_RETRY_ATTEMPTS: '${OPENAI_RETRY_ATTEMPTS:-3}',
      OPENAI_RETRY_DELAY_SECONDS: '${OPENAI_RETRY_DELAY_SECONDS:-5}',
      OPENAI_HEALTH_CHECK_INTERVAL: '${OPENAI_HEALTH_CHECK_INTERVAL:-120}',
      OPENAI_IMG2IMG_MAX_CONCURRENT_JOBS: '${OPENAI_IMG2IMG_MAX_CONCURRENT_JOBS:-2}',
      // Cloud storage configuration (uses storage-provider.env variables)
      CLOUD_STORAGE_PROVIDER: '${CLOUD_STORAGE_PROVIDER:-}',
      CLOUD_STORAGE_CONTAINER: '${CLOUD_STORAGE_CONTAINER:-}',
      CLOUD_CDN_URL: '${CLOUD_CDN_URL:-}',
      AZURE_STORAGE_ACCOUNT: '${AZURE_STORAGE_ACCOUNT:-}',
      AZURE_STORAGE_KEY: '${AZURE_STORAGE_KEY:-}',
    };
  }

  constructor(connectorId = 'openai-img2img') {
    const config = {
      connector_id: connectorId,
      service_type: 'image_generation',
      base_url: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      timeout_seconds: parseInt(process.env.OPENAI_TIMEOUT_SECONDS || '120'),
      retry_attempts: parseInt(process.env.OPENAI_RETRY_ATTEMPTS || '3'),
      retry_delay_seconds: parseInt(process.env.OPENAI_RETRY_DELAY_SECONDS || '5'),
      health_check_interval_seconds: parseInt(process.env.OPENAI_HEALTH_CHECK_INTERVAL || '120'),
      max_concurrent_jobs: parseInt(process.env.OPENAI_IMG2IMG_MAX_CONCURRENT_JOBS || '2'),
    };

    super(connectorId, config);

    // OpenAI-specific configuration
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.baseURL = config.base_url;
    this.defaultModel = process.env.OPENAI_IMG2IMG_MODEL || 'gpt-4.1';

    if (!this.apiKey) {
      throw new Error('OpenAI Img2Img connector requires OPENAI_API_KEY environment variable');
    }

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
      this.client = new OpenAI({
        apiKey: this.apiKey,
        baseURL: this.baseURL,
        timeout: this.config.timeout_seconds * 1000,
        maxRetries: this.config.retry_attempts,
      });

      // Test the connection
      await this.checkHealth();
      this.currentStatus = 'idle';
      logger.info(`OpenAI Img2Img connector ${this.connector_id} initialized successfully`);
    } catch (error) {
      this.currentStatus = 'error';
      throw new Error(`Failed to initialize OpenAI Img2Img connector: ${error.message}`);
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
      logger.warn(`OpenAI Img2Img connector health check failed: ${error.message}`);
      return false;
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

  getRequiredHealthCheckClass(): HealthCheckClass {
    // API-only services use MINIMAL health checking (no job status query required)
    return HealthCheckClass.MINIMAL;
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

      // Use responses API (non-streaming for simplicity, matching your working example)
      const response = await this.client.responses.create({
        model,
        input,
        tools: [{ type: 'image_generation' as const }],
      });

      // Extract image data from response
      const imageData = response.output
        .filter((output: any) => output.type === 'image_generation_call')
        .map((output: any) => output.result);

      if (!imageData || imageData.length === 0) {
        throw new Error('No image generated from OpenAI img2img response');
      }

      const imageBase64 = imageData[0];

      if (progressCallback) {
        await progressCallback({
          job_id: jobData.id,
          progress: 80,
          message: 'Image generated successfully',
          current_step: 'processing',
        });
      }

      // Process final image with optional asset saving
      let savedAsset: { filePath: string; fileName: string; fileUrl: string } | null = null;
      
      // Check if we should save assets (default: true)
      const saveAssets = payload.save_assets !== false; // Default to true unless explicitly false

      if (saveAssets && imageBase64) {
        // Save the base64 image data to cloud storage
        savedAsset = await AssetSaver.saveAssetToCloud(imageBase64, jobData.id, jobData, 'image/png');
        logger.info(`Image saved and verified in cloud storage: ${savedAsset.fileName}`);
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
          },
        });
      }

      logger.info(
        `img2img generation completed for job ${jobData.id} using ${model} with ${images.length} reference images (saved: ${saveAssets})`
      );

      // Return minimal response like other connectors
      return {
        success: true,
        data: {
          model_used: model,
          reference_images_count: images.length,
          original_prompt: prompt,
        },
        processing_time_ms: 0, // Will be calculated by base class
      };
    } catch (error) {
      logger.error(`OpenAI img2img processing failed: ${error.message}`);
      throw error;
    }
  }

  async cleanupService(): Promise<void> {
    this.client = null;
    this.currentStatus = 'offline';
    logger.info(`OpenAI Img2Img connector ${this.connector_id} cleaned up`);
  }

  async cancelJob(jobId: string): Promise<void> {
    // OpenAI doesn't support job cancellation
    // For image generation, jobs are typically short-lived
    logger.info(
      `Job cancellation requested for ${jobId} (OpenAI img2img jobs cannot be cancelled once started)`
    );
  }

  async updateConfiguration(config: any): Promise<void> {
    // Update configuration if needed
    logger.info(`Configuration update requested for OpenAI Img2Img connector ${this.connector_id}`);
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