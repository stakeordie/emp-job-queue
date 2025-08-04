// OpenAI Image Connector - Handles image generation using OpenAI SDK
// Uses the OpenAI images API for DALL-E image generation tasks

import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
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
      ...super.getRequiredEnvVars(), // Include base connector env vars
      OPENAI_API_KEY: '${OPENAI_API_KEY:-}',
      OPENAI_BASE_URL: '${OPENAI_BASE_URL:-https://api.openai.com/v1}',
      OPENAI_IMAGE_MODEL: '${OPENAI_IMAGE_MODEL:-gpt-4.1}',
      OPENAI_IMAGE_SIZE: '${OPENAI_IMAGE_SIZE:-1024x1024}',
      OPENAI_IMAGE_QUALITY: '${OPENAI_IMAGE_QUALITY:-standard}',
      OPENAI_TIMEOUT_SECONDS: '${OPENAI_TIMEOUT_SECONDS:-120}',
      OPENAI_RETRY_ATTEMPTS: '${OPENAI_RETRY_ATTEMPTS:-3}',
      OPENAI_RETRY_DELAY_SECONDS: '${OPENAI_RETRY_DELAY_SECONDS:-5}',
      OPENAI_HEALTH_CHECK_INTERVAL: '${OPENAI_HEALTH_CHECK_INTERVAL:-120}',
      OPENAI_IMAGE_MAX_CONCURRENT_JOBS: '${OPENAI_IMAGE_MAX_CONCURRENT_JOBS:-3}',
      // Cloud storage configuration (uses storage-provider.env variables)
      CLOUD_STORAGE_PROVIDER: '${CLOUD_STORAGE_PROVIDER:-}',
      CLOUD_STORAGE_CONTAINER: '${CLOUD_STORAGE_CONTAINER:-}',
      CLOUD_CDN_URL: '${CLOUD_CDN_URL:-}',
      AZURE_STORAGE_ACCOUNT: '${AZURE_STORAGE_ACCOUNT:-}',
      AZURE_STORAGE_KEY: '${AZURE_STORAGE_KEY:-}',
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

    logger.info(
      `OpenAI Image connector ${connectorId} initialized with model ${this.defaultModel}`
    );
  }

  /**
   * Save base64 asset to cloud storage using Cloud Saver logic
   */
  private async saveAssetToCloud(
    base64Data: string,
    jobId: string,
    jobData: any,
    assetType: 'image' | 'video' | 'audio' | 'text' = 'image',
    format: string = 'png'
  ): Promise<{ filePath: string; fileName: string; fileUrl: string; cdnUrl?: string }> {
    try {
      // Get cloud storage configuration from environment and job data (following storage-provider.env)
      const provider = process.env.CLOUD_STORAGE_PROVIDER?.toLowerCase();
      // Use bucket from payload if provided, otherwise fall back to environment variable
      const bucket = jobData.payload?.bucket || process.env.CLOUD_STORAGE_CONTAINER;
      const prefix = jobData.payload?.ctx?.prefix;

      if (!provider) {
        throw new Error('CLOUD_STORAGE_PROVIDER environment variable is required');
      }

      if (!bucket) {
        throw new Error(
          'Bucket is required. Please provide "bucket" in job payload or set CLOUD_STORAGE_CONTAINER environment variable.'
        );
      }

      if (!prefix) {
        throw new Error(
          'Cloud storage prefix is required. Job should include "ctx.prefix" in payload.'
        );
      }

      // Use provided filename or generate unique filename with timestamp and hash
      let fileName: string;
      if (jobData.payload?.ctx?.filename) {
        // Use provided filename, but ensure extension matches actual format
        const providedName = jobData.payload.ctx.filename;
        const hasExtension = providedName.includes('.');

        if (hasExtension) {
          // Replace extension with actual format
          const nameWithoutExt = providedName.substring(0, providedName.lastIndexOf('.'));
          fileName = `${nameWithoutExt}.${format}`;
        } else {
          // Add actual format extension
          fileName = `${providedName}.${format}`;
        }
      } else {
        // Generate unique filename with timestamp and hash (following Cloud Saver pattern)
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const hash = crypto
          .createHash('md5')
          .update(base64Data.slice(0, 100))
          .digest('hex')
          .slice(0, 8);
        fileName = `${jobId}_${timestamp}_${hash}.${format}`;
      }

      // Ensure prefix ends with '/'
      const normalizedPrefix = prefix.endsWith('/') ? prefix : prefix + '/';
      const storageKey = normalizedPrefix + fileName;

      // Convert base64 to buffer
      const buffer = Buffer.from(base64Data, 'base64');

      // Determine content type
      let contentType = 'application/octet-stream';
      switch (format.toLowerCase()) {
        case 'png':
          contentType = 'image/png';
          break;
        case 'jpg':
        case 'jpeg':
          contentType = 'image/jpeg';
          break;
        case 'webp':
          contentType = 'image/webp';
          break;
        case 'gif':
          contentType = 'image/gif';
          break;
        case 'mp4':
          contentType = 'video/mp4';
          break;
        case 'wav':
          contentType = 'audio/wav';
          break;
        case 'mp3':
          contentType = 'audio/mpeg';
          break;
        case 'txt':
          contentType = 'text/plain';
          break;
      }

      // Upload to cloud storage using JavaScript SDKs
      const uploadSuccess = await this.uploadToCloudStorage(
        buffer,
        bucket,
        storageKey,
        contentType,
        provider
      );

      // Verify upload success
      if (uploadSuccess && provider === 'azure') {
        const verified = await this.verifyAzureUpload(bucket, storageKey);
        if (!verified) {
          throw new Error('Azure upload verification failed');
        }
      }

      if (!uploadSuccess) {
        throw new Error(`Failed to upload ${assetType} to ${provider} cloud storage`);
      }

      // For Azure, wait for CDN to be available before returning
      let fileUrl: string;
      if (provider === 'azure' && process.env.CLOUD_CDN_URL) {
        const cdnUrl = `https://${process.env.CLOUD_CDN_URL}/${storageKey}`;
        logger.info(`🌐 Waiting for CDN availability: ${cdnUrl}`);

        // Poll CDN until it's available (required before job completion)
        const cdnAvailable = await this.waitForCDNAvailability(cdnUrl);
        if (!cdnAvailable) {
          throw new Error(`CDN failed to propagate after maximum attempts`);
        }

        fileUrl = cdnUrl;
        logger.info(`✅ CDN URL confirmed available: ${cdnUrl}`);
      } else {
        fileUrl = `https://${bucket}.blob.core.windows.net/${storageKey}`;
      }

      logger.info(`Saved ${assetType} asset: ${fileName} | URL: ${fileUrl}`);

      return {
        filePath: storageKey,
        fileName,
        fileUrl,
        cdnUrl: fileUrl, // CDN URL is now the primary fileUrl
      };
    } catch (error) {
      logger.error(`Failed to save ${assetType} asset for job ${jobId}: ${error.message}`);
      throw new Error(`Asset saving failed: ${error.message}`);
    }
  }

  /**
   * Upload to cloud storage using JavaScript SDKs
   */
  private async uploadToCloudStorage(
    buffer: Buffer,
    bucket: string,
    storageKey: string,
    contentType: string,
    provider: string
  ): Promise<boolean> {
    try {
      if (provider === 'azure') {
        return await this.uploadToAzure(buffer, bucket, storageKey, contentType);
      } else if (provider === 'aws') {
        throw new Error('AWS S3 upload not implemented yet - install @aws-sdk/client-s3');
      } else if (provider === 'google') {
        throw new Error(
          'Google Cloud Storage upload not implemented yet - install @google-cloud/storage'
        );
      } else {
        throw new Error(`Unsupported provider: ${provider}`);
      }
    } catch (error) {
      logger.error(`Cloud storage upload failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Upload to Azure Blob Storage using JavaScript SDK
   */
  private async uploadToAzure(
    buffer: Buffer,
    containerName: string,
    blobName: string,
    contentType: string
  ): Promise<boolean> {
    try {
      const { BlobServiceClient, StorageSharedKeyCredential } = await import('@azure/storage-blob');

      const accountName = process.env.AZURE_STORAGE_ACCOUNT;
      const accountKey = process.env.AZURE_STORAGE_KEY;

      if (!accountName || !accountKey) {
        throw new Error(
          'AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_KEY environment variables are required'
        );
      }

      // Create credential and BlobServiceClient
      const credential = new StorageSharedKeyCredential(accountName, accountKey);
      const blobServiceClient = new BlobServiceClient(
        `https://${accountName}.blob.core.windows.net`,
        credential
      );

      // Get container client
      const containerClient = blobServiceClient.getContainerClient(containerName);

      // Get blob client
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      // Upload buffer
      await blockBlobClient.upload(buffer, buffer.length, {
        blobHTTPHeaders: {
          blobContentType: contentType,
        },
      });

      logger.info(`Successfully uploaded to Azure: ${blobName} (${buffer.length} bytes)`);
      return true;
    } catch (error) {
      logger.error(`Azure upload failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Verify Azure blob upload with retries
   */
  private async verifyAzureUpload(
    containerName: string,
    blobName: string,
    maxAttempts: number = 5
  ): Promise<boolean> {
    try {
      const { BlobServiceClient, StorageSharedKeyCredential } = await import('@azure/storage-blob');

      const accountName = process.env.AZURE_STORAGE_ACCOUNT;
      const accountKey = process.env.AZURE_STORAGE_KEY;

      if (!accountName || !accountKey) {
        return false;
      }

      const credential = new StorageSharedKeyCredential(accountName, accountKey);
      const blobServiceClient = new BlobServiceClient(
        `https://${accountName}.blob.core.windows.net`,
        credential
      );

      const containerClient = blobServiceClient.getContainerClient(containerName);
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const exists = await blockBlobClient.exists();
          if (exists) {
            logger.info(`Azure upload verified: ${blobName}`);
            return true;
          }

          if (attempt < maxAttempts) {
            logger.warn(`Azure verification attempt ${attempt}/${maxAttempts} failed, retrying...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (error) {
          if (attempt < maxAttempts) {
            logger.warn(`Azure verification attempt ${attempt}/${maxAttempts} failed, retrying...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
          } else {
            logger.error(
              `Azure verification failed after ${maxAttempts} attempts: ${error.message}`
            );
            return false;
          }
        }
      }
      return false;
    } catch (error) {
      logger.error(`Azure verification error: ${error.message}`);
      return false;
    }
  }

  /**
   * Wait for CDN to be available by polling every 2 seconds
   */
  private async waitForCDNAvailability(
    cdnUrl: string,
    maxAttempts: number = 30, // 30 attempts * 2 seconds = 1 minute max wait
    intervalMs: number = 2000
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout per request

        const response = await fetch(cdnUrl, {
          method: 'HEAD',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.status === 200) {
          logger.info(
            `✅ CDN available after ${attempt} attempts (${((attempt - 1) * intervalMs) / 1000}s)`
          );
          return true;
        }

        logger.info(
          `⏳ CDN attempt ${attempt}/${maxAttempts} - Status: ${response.status}, waiting ${intervalMs}ms...`
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.info(
          `⏳ CDN attempt ${attempt}/${maxAttempts} - Error: ${errorMsg}, waiting ${intervalMs}ms...`
        );
      }

      // Wait before next attempt (except on last attempt)
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
    }

    logger.error(
      `❌ CDN failed to become available after ${maxAttempts} attempts (${(maxAttempts * intervalMs) / 1000}s)`
    );
    return false;
  }

  /**
   * Verify CDN availability (following Cloud Saver pattern for production)
   */
  private async verifyCDNAvailability(
    storageKey: string,
    maxAttempts: number = 6
  ): Promise<string | undefined> {
    try {
      const cdnBase = process.env.CLOUD_CDN_URL;
      if (!cdnBase) {
        throw new Error('CLOUD_CDN_URL environment variable is required for CDN verification');
      }

      const cdnUrl = `${cdnBase}/${storageKey}`;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          // Use AbortController for timeout since native fetch doesn't support timeout option
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);

          const response = await fetch(cdnUrl, {
            method: 'HEAD',
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (response.status === 200) {
            logger.info(`CDN verified: ${cdnUrl}`);
            return cdnUrl;
          }

          if (attempt < maxAttempts) {
            logger.warn(
              `CDN verification attempt ${attempt}/${maxAttempts} failed (status: ${response.status}), retrying...`
            );
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        } catch (error) {
          if (attempt < maxAttempts) {
            logger.warn(
              `CDN verification attempt ${attempt}/${maxAttempts} failed: ${error.message}, retrying...`
            );
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
      }

      logger.warn(`CDN verification failed after ${maxAttempts} attempts`);
      return undefined;
    } catch (error) {
      logger.error(`CDN verification error: ${error.message}`);
      return undefined;
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
      return models.data.filter(model => model.id.includes('gpt-image')).map(model => model.id);
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
      status:
        this.currentStatus === 'idle' || this.currentStatus === 'active'
          ? 'online'
          : this.currentStatus === 'offline'
            ? 'offline'
            : 'error',
      capabilities: {
        supported_formats: ['png', 'webp'],
        supported_models: models,
        features: [
          'image_generation',
          'text_to_image',
          'prompt_based',
          'dall_e',
          'quality_control',
          'size_variants',
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

    // Use background + streaming as the primary approach (reliable + trackable)
    try {
      return await this.processWithBackgroundStreaming(jobData, progressCallback);
    } catch (backgroundError) {
      logger.warn(
        `Background streaming failed for job ${jobData.id}: ${backgroundError.message}. Falling back to traditional streaming.`
      );
      try {
        return await this.processWithStreaming(jobData, progressCallback);
      } catch (streamingError) {
        logger.warn(
          `Traditional streaming failed for job ${jobData.id}: ${streamingError.message}. Falling back to non-streaming.`
        );
        try {
          return await this.processWithoutStreaming(jobData, progressCallback);
        } catch (fallbackError) {
          logger.error(`All three approaches failed for job ${jobData.id}`);
          throw new Error(`OpenAI Image generation failed: ${fallbackError.message}`);
        }
      }
    }
  }

  private async processWithBackgroundStreaming(jobData: JobData, progressCallback?: ProgressCallback): Promise<JobResult> {
    const payload = jobData.payload as any;
    const model = payload.model || this.defaultModel;
    const size = payload.size || this.defaultSize;
    const quality = payload.quality || this.defaultQuality;

    // Get the prompt from either prompt or description field
    const prompt = payload.prompt || payload.description;
    if (!prompt) {
      throw new Error('Job must contain either "prompt" or "description" field');
    }

    logger.info(`Processing image generation job with model ${model}, size ${size} with background streaming`);

    // Report initial progress
    if (progressCallback) {
      await progressCallback({
        job_id: jobData.id,
        progress: 5,
        message: `Starting image generation with ${model} (background streaming)`,
        current_step: 'initializing',
      });
    }

    // Use background + streaming approach for reliable job tracking
    const stream = await this.client!.responses.create({
      model,
      input: prompt,
      background: true,
      stream: true,
      tools: [{ type: 'image_generation' as const, partial_images: 2 }],
    });

    let openaiJobId: string | null = null;
    let partialCount = 0;
    const partialImages: string[] = [];
    let cursor: number | null = null;

    // Process background streaming response
    try {
      for await (const event of stream) {
        cursor = event.sequence_number;

        // Capture OpenAI job ID for tracking
        if (event.type === 'response.created' && event.response?.id) {
          openaiJobId = event.response.id;
          logger.info(`OpenAI background job started: ${openaiJobId} for job ${jobData.id}`);
          
          if (progressCallback) {
            await progressCallback({
              job_id: jobData.id,
              progress: 15,
              message: `OpenAI job ${openaiJobId} started`,
              current_step: 'processing',
              metadata: {
                openai_job_id: openaiJobId,
                sequence_number: cursor,
              },
            });
          }
        }

        if (event.type === 'response.image_generation_call.partial_image') {
          partialCount++;
          const progress = Math.min(85, 15 + partialCount * 35); // Progress from 15% to 85%

          // Convert base64 to data URL for immediate use
          const partialImageDataUrl = `data:image/png;base64,${event.partial_image_b64}`;
          partialImages.push(partialImageDataUrl);

          if (progressCallback) {
            await progressCallback({
              job_id: jobData.id,
              progress,
              message: `Partial image ${partialCount} received`,
              current_step: 'generating',
              metadata: {
                openai_job_id: openaiJobId,
                partial_image_index: event.partial_image_index,
                partial_count: partialCount,
                sequence_number: cursor,
              },
            });
          }

          logger.info(
            `Received partial image ${partialCount} (index ${event.partial_image_index}) for OpenAI job ${openaiJobId} -> job ${jobData.id}`
          );
        } else if (event.type.includes('done')) {
          // Stream is complete
          if (progressCallback) {
            await progressCallback({
              job_id: jobData.id,
              progress: 95,
              message: 'Finalizing image...',
              current_step: 'finalizing',
              metadata: {
                openai_job_id: openaiJobId,
                sequence_number: cursor,
              },
            });
          }
        }
      }
    } catch (streamError) {
      // If we have an OpenAI job ID, we can potentially recover by polling
      if (openaiJobId) {
        logger.warn(
          `Background streaming failed for OpenAI job ${openaiJobId}, but we have job ID for potential recovery: ${streamError.message}`
        );
        throw new Error(`Background streaming interrupted for trackable job ${openaiJobId}: ${streamError.message}`);
      } else {
        throw new Error(`Background streaming failed before job ID was obtained: ${streamError.message}`);
      }
    }

    // Check if we received any partial images
    if (partialImages.length === 0) {
      const errorMsg = openaiJobId 
        ? `No partial images received from OpenAI background job ${openaiJobId}`
        : 'No partial images received from OpenAI background streaming response';
      throw new Error(errorMsg);
    }

    logger.info(`Background streaming successful for OpenAI job ${openaiJobId} -> job ${jobData.id}`);
    
    return await this.finalizeImageProcessing(jobData, partialImages, partialCount, progressCallback, {
      openai_job_id: openaiJobId,
      sequence_number: cursor,
      approach: 'background_streaming'
    });
  }

  private async processWithStreaming(jobData: JobData, progressCallback?: ProgressCallback): Promise<JobResult> {
    const payload = jobData.payload as any;
    const model = payload.model || this.defaultModel;
    const size = payload.size || this.defaultSize;
    const quality = payload.quality || this.defaultQuality;

    // Get the prompt from either prompt or description field
    const prompt = payload.prompt || payload.description;
    if (!prompt) {
      throw new Error('Job must contain either "prompt" or "description" field');
    }

    logger.info(`Processing image generation job with model ${model}, size ${size} with streaming`);

    // Report initial progress
    if (progressCallback) {
      await progressCallback({
        job_id: jobData.id,
        progress: 10,
        message: `Starting image generation with ${model} (streaming)`,
        current_step: 'initializing',
      });
    }

    // Use Responses API with streaming for progress updates
    const stream = await this.client!.responses.create({
      model,
      input: prompt,
      stream: true as const,
      tools: [{ type: 'image_generation' as const, partial_images: 2 }],
    });

    let finalImageUrl: string | undefined;
    let revisedPrompt: string | undefined;
    let partialCount = 0;
    const partialImages: string[] = [];
    let streamTimeout: NodeJS.Timeout | null = null;

    // Set a timeout for streaming response
    const streamPromise = new Promise<void>((resolve, reject) => {
      streamTimeout = setTimeout(() => {
        reject(new Error('Streaming response timeout after 60 seconds'));
      }, 60000);

      // Process streaming response
      (async () => {
        try {
          for await (const event of stream) {
            if (event.type === 'response.image_generation_call.partial_image') {
              partialCount++;
              const progress = Math.min(85, 10 + partialCount * 35); // Progress from 10% to 85%

              // Convert base64 to buffer and then to data URL for immediate use
              const imageBuffer = Buffer.from(event.partial_image_b64, 'base64');
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
                    partial_count: partialCount,
                  },
                });
              }

              logger.info(
                `Received partial image ${partialCount} (index ${event.partial_image_index}) for job ${jobData.id}`
              );
            } else if (event.type.includes('done')) {
              // Stream is complete, need to get final image
              if (progressCallback) {
                await progressCallback({
                  job_id: jobData.id,
                  progress: 95,
                  message: 'Finalizing image...',
                  current_step: 'finalizing',
                });
              }
            }
          }
          resolve();
        } catch (error) {
          reject(error);
        }
      })();
    });

    try {
      await streamPromise;
    } finally {
      if (streamTimeout) {
        clearTimeout(streamTimeout);
      }
    }

    // Check if we received any partial images
    if (partialImages.length === 0) {
      throw new Error('No partial images received from OpenAI streaming response');
    }

    return await this.finalizeImageProcessing(jobData, partialImages, partialCount, progressCallback);
  }

  private async processWithoutStreaming(jobData: JobData, progressCallback?: ProgressCallback): Promise<JobResult> {
    const payload = jobData.payload as any;
    const model = payload.model || this.defaultModel;
    const size = payload.size || this.defaultSize;
    const quality = payload.quality || this.defaultQuality;

    // Get the prompt from either prompt or description field
    const prompt = payload.prompt || payload.description;
    if (!prompt) {
      throw new Error('Job must contain either "prompt" or "description" field');
    }

    logger.info(`Processing image generation job with model ${model}, size ${size} without streaming (fallback)`);

    // Report initial progress
    if (progressCallback) {
      await progressCallback({
        job_id: jobData.id,
        progress: 20,
        message: `Starting image generation with ${model} (non-streaming fallback)`,
        current_step: 'initializing',
      });
    }

    // Use regular DALL-E API as fallback
    try {
      const response = await this.client!.images.generate({
        model: model.includes('dall-e') ? model : 'dall-e-3', // Ensure valid model for direct API
        prompt,
        n: 1,
        size: size as any,
        quality: quality as any,
        response_format: 'b64_json',
      });

      if (progressCallback) {
        await progressCallback({
          job_id: jobData.id,
          progress: 80,
          message: 'Image generated successfully',
          current_step: 'processing',
        });
      }

      if (!response.data || response.data.length === 0 || !response.data[0].b64_json) {
        throw new Error('No image data received from OpenAI DALL-E API');
      }

      // Convert to data URL format for consistency with streaming approach
      const base64Data = response.data[0].b64_json;
      const dataUrl = `data:image/png;base64,${base64Data}`;
      const partialImages = [dataUrl];

      logger.info(`Non-streaming fallback successful for job ${jobData.id}`);

      return await this.finalizeImageProcessing(jobData, partialImages, 1, progressCallback);
    } catch (error) {
      logger.error(`Non-streaming fallback also failed: ${error.message}`);
      throw new Error(`Both streaming and non-streaming approaches failed: ${error.message}`);
    }
  }

  private async finalizeImageProcessing(
    jobData: JobData,
    partialImages: string[],
    partialCount: number,
    progressCallback?: ProgressCallback,
    openaiMetadata?: {
      openai_job_id?: string | null;
      sequence_number?: number | null;
      approach?: string;
    }
  ): Promise<JobResult> {
    const payload = jobData.payload as any;
    const model = payload.model || this.defaultModel;
    const size = payload.size || this.defaultSize;
    const quality = payload.quality || this.defaultQuality;

    // Process final image with optional asset saving
    let savedAsset: { filePath: string; fileName: string; fileUrl: string } | null = null;
    let finalImageUrl: string | undefined;

    if (partialImages.length > 0) {
      const finalImageDataUrl = partialImages[partialImages.length - 1];

      // Check if we should save assets (default: true)
      const saveAssets = payload.save_assets !== false; // Default to true unless explicitly false

      if (saveAssets) {
        // Extract MIME type and base64 data from data URL
        const mimeMatch = finalImageDataUrl.match(/^data:([^;]+);base64,/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
        const base64Data = finalImageDataUrl.replace(/^data:[^;]+;base64,/, '');
        savedAsset = await AssetSaver.saveAssetToCloud(base64Data, jobData.id, jobData, mimeType);

        finalImageUrl = savedAsset.fileUrl; // Use cloud storage URL as primary result
        logger.info(`Image saved and verified in cloud storage: ${savedAsset.fileName}`);
      } else {
        finalImageUrl = finalImageDataUrl; // Use data URL directly
        logger.info(`Image returned as data URL (save_assets=false)`);
      }

      if (progressCallback) {
        await progressCallback({
          job_id: jobData.id,
          progress: 100,
          message: saveAssets ? 'Image saved successfully' : 'Image generation complete',
          current_step: 'completed',
          metadata: {
            final_image_url: finalImageUrl,
            total_partial_images: partialCount,
            saved_asset: savedAsset,
            save_assets: saveAssets,
            ...openaiMetadata,
          },
        });
      }

      logger.info(
        `Final image ready for job ${jobData.id} (${partialCount} partial images, saved: ${saveAssets})${openaiMetadata?.openai_job_id ? ` OpenAI job: ${openaiMetadata.openai_job_id}` : ''}`
      );
    } else {
      throw new Error('No images available for finalization');
    }

    // Return minimal response like ComfyUI - asset is saved but URL not returned
    // The client can construct the URL from job metadata if needed
    return {
      success: true,
      data: {
        model_used: model,
        size: size,
        quality: quality,
        partial_images_received: partialCount,
        ...openaiMetadata,
      },
      processing_time_ms: 0, // Will be calculated by base class
    };
  }

  async cleanupService(): Promise<void> {
    this.client = null;
    this.currentStatus = 'offline';
    logger.info(`OpenAI Image connector ${this.connector_id} cleaned up`);
  }

  async cancelJob(jobId: string): Promise<void> {
    // OpenAI doesn't support job cancellation
    // For image generation, jobs are typically short-lived
    logger.info(
      `Job cancellation requested for ${jobId} (OpenAI image jobs cannot be cancelled once started)`
    );
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
