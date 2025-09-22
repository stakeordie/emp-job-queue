// OpenAI Text-to-Image Connector - Handles text-to-image generation using OpenAI SDK
// Uses the OpenAI responses API for text-to-image generation tasks

import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
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

export class OpenAIText2ImgConnector extends OpenAIBaseConnector {
  service_type = 'image_generation' as const; // Will be set by constructor from service mapping
  version = '1.0.0';

  private defaultModel: string;
  private defaultSize: string;
  private defaultQuality: string;

  /**
   * Get required environment variables for OpenAI Image connector
   */
  static getRequiredEnvVars(): Record<string, string> {
    return {
      ...super.getRequiredEnvVars(), // Include base connector env vars
      ...OpenAIBaseConnector.getBaseOpenAIEnvVars(), // Include shared OpenAI env vars
      OPENAI_IMAGE_MODEL: '${OPENAI_IMAGE_MODEL:-gpt-4.1}',
      OPENAI_IMAGE_SIZE: '${OPENAI_IMAGE_SIZE:-1024x1024}',
      OPENAI_IMAGE_QUALITY: '${OPENAI_IMAGE_QUALITY:-standard}',
      OPENAI_IMAGE_MAX_CONCURRENT_JOBS: '${OPENAI_IMAGE_MAX_CONCURRENT_JOBS:-3}',
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
      max_concurrent_jobs: parseInt(process.env.OPENAI_IMAGE_MAX_CONCURRENT_JOBS || '3'),
    };

    super(connectorId, config);

    // Set service_type from constructor config (overrides hardcoded value)
    this.service_type = config.service_type;

    // Image-specific configuration
    this.defaultModel = process.env.OPENAI_IMAGE_MODEL || 'gpt-4.1';
    this.defaultSize = process.env.OPENAI_IMAGE_SIZE || '1024x1024';
    this.defaultQuality = process.env.OPENAI_IMAGE_QUALITY || 'standard';

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
      // Use base class OpenAI client initialization
      await this.initializeOpenAIClient();

      // Test the connection
      await this.checkHealth();

      this.currentStatus = 'idle';
      logger.info(`OpenAI Image connector ${this.connector_id} initialized successfully`);
    } catch (error) {
      this.currentStatus = 'error';
      throw new Error(`Failed to initialize OpenAI Image connector: ${error.message}`);
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
          'background_polling',
          'job_tracking',
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
    // Initialize intelligent logging for this job
    if (progressCallback) {
      this.initializeIntelligentLogging(jobData.id, progressCallback);
    }

    // Report job start with intelligent interpretation
    await this.reportIntelligentLog(
      `Starting OpenAI image generation job ${jobData.id} with model ${this.defaultModel}`,
      'info',
      'openai_job_start'
    );

    // Enhanced debugging context
    const debugContext = {
      jobId: jobData.id,
      environment: process.env.CURRENT_ENV || process.env.NODE_ENV || 'unknown',
      apiKey: this.apiKey ? `${this.apiKey.slice(0, 8)}...${this.apiKey.slice(-4)}` : 'MISSING',
      baseURL: this.baseURL,
      defaultModel: this.defaultModel,
      payload: JSON.stringify(jobData.payload, null, 2),
      cloudProvider: process.env.CLOUD_STORAGE_PROVIDER,
      cloudContainer: process.env.CLOUD_STORAGE_CONTAINER,
      cloudCdnUrl: process.env.CLOUD_CDN_URL,
      azureAccount: process.env.AZURE_STORAGE_ACCOUNT,
      azureKeySet: !!process.env.AZURE_STORAGE_KEY,
      timestamp: new Date().toISOString()
    };

    logger.info(`🔍 OpenAI Image Job Debug Context:\n${JSON.stringify(debugContext, null, 2)}`);

    if (!this.client) {
      const error = new Error(`OpenAI client not initialized. API Key: ${debugContext.apiKey}, Base URL: ${debugContext.baseURL}`);
      
      // Report initialization failure with intelligent interpretation
      await this.reportIntelligentLog(
        `OpenAI client initialization failed: ${error.message}`,
        'error',
        'openai_initialization_failed'
      );
      
      logger.error(`❌ Client initialization failed: ${error.message}`);
      throw error;
    }

    const errors: Array<{method: string, error: string, stack?: string}> = [];

    // Use background + polling as the primary approach (reliable + trackable)
    try {
      await this.reportIntelligentLog(
        `Attempting background polling for OpenAI image job ${jobData.id}`,
        'info',
        'openai_background_polling_start'
      );
      
      return await this.processWithBackgroundPolling(jobData, progressCallback);
    } catch (backgroundError) {
      const errorDetails = {
        method: 'background_polling',
        error: backgroundError.message,
        stack: backgroundError.stack,
        name: backgroundError.name,
        cause: backgroundError.cause
      };
      errors.push(errorDetails);
      
      logger.warn(`⚠️  Background polling failed for job ${jobData.id}:\n${JSON.stringify(errorDetails, null, 2)}`);
      
      try {
        logger.info(`🔄 Falling back to traditional streaming for job ${jobData.id}`);
        return await this.processWithStreaming(jobData, progressCallback);
      } catch (streamingError) {
        const streamingErrorDetails = {
          method: 'traditional_streaming',
          error: streamingError.message,
          stack: streamingError.stack,
          name: streamingError.name,
          cause: streamingError.cause
        };
        errors.push(streamingErrorDetails);
        
        logger.warn(`⚠️  Traditional streaming failed for job ${jobData.id}:\n${JSON.stringify(streamingErrorDetails, null, 2)}`);
        
        try {
          logger.info(`🔄 Falling back to non-streaming for job ${jobData.id}`);
          return await this.processWithoutStreaming(jobData, progressCallback);
        } catch (fallbackError) {
          const fallbackErrorDetails = {
            method: 'non_streaming',
            error: fallbackError.message,
            stack: fallbackError.stack,
            name: fallbackError.name,
            cause: fallbackError.cause
          };
          errors.push(fallbackErrorDetails);
          
          // Comprehensive failure report
          const failureReport = {
            jobId: jobData.id,
            environment: debugContext.environment,
            debugContext,
            allErrors: errors,
            timestamp: new Date().toISOString()
          };
          
          logger.error(`❌ ALL THREE APPROACHES FAILED for job ${jobData.id}:\n${JSON.stringify(failureReport, null, 2)}`);
          
          const comprehensiveError = new Error(
            `OpenAI Image generation failed completely. Environment: ${debugContext.environment}. ` +
            `Errors: Background Polling (${backgroundError.message}), Streaming (${streamingError.message}), ` +
            `Fallback (${fallbackError.message}). See logs for full debug context.`
          );
          comprehensiveError.name = 'OpenAIComprehensiveFailure';
          (comprehensiveError as any).debugContext = debugContext;
          (comprehensiveError as any).allErrors = errors;
          
          throw comprehensiveError;
        }
      }
    }
  }

  private async processWithBackgroundPolling(jobData: JobData, progressCallback?: ProgressCallback): Promise<JobResult> {
    const payload = jobData.payload as any;
    const model = payload.model || this.defaultModel;
    const size = payload.size || this.defaultSize;
    const quality = payload.quality || this.defaultQuality;

    // Enhanced validation and debugging
    const prompt = payload.prompt || payload.description;
    if (!prompt) {
      const validationError = new Error('Job must contain either "prompt" or "description" field');
      
      // Report validation error with intelligent interpretation
      await this.reportIntelligentLog(
        `OpenAI image job validation failed: ${validationError.message}`,
        'error',
        'openai_validation_failed'
      );
      
      logger.error(`❌ Background polling validation failed for job ${jobData.id}: ${validationError.message}`);
      logger.error(`📋 Payload received: ${JSON.stringify(payload, null, 2)}`);
      throw validationError;
    }

    // Use enhanced progress callback with intelligent logging
    const enhancedCallback = this.getEnhancedProgressCallback() || progressCallback;

    const requestConfig = {
      model,
      input: prompt,
      background: true,
      stream: false, // Changed: No streaming, use polling instead
      tools: [{ type: 'image_generation' as const }],
    };

    logger.info(`🎨 Processing image generation job ${jobData.id} with background polling:`);
    logger.info(`   Model: ${model}`);
    logger.info(`   Size: ${size}`);
    logger.info(`   Quality: ${quality}`);
    logger.info(`   Prompt: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`);
    logger.info(`   Config: ${JSON.stringify(requestConfig, null, 2)}`);

    // Report initial progress
    if (progressCallback) {
      await progressCallback({
        job_id: jobData.id,
        progress: 5,
        message: `Starting image generation with ${model} (background polling)`,
        current_step: 'initializing',
      });
    }

    // Create background job without streaming
    let response;
    try {
      logger.info(`🚀 Creating OpenAI background request for job ${jobData.id}`);
      response = await this.client!.responses.create(requestConfig);
      logger.info(`✅ OpenAI background job created successfully for job ${jobData.id}`);
    } catch (createError) {
      const detailedError = new Error(
        `Failed to create OpenAI background polling request: ${createError.message}. ` +
        `Config: ${JSON.stringify(requestConfig, null, 2)}`
      );
      detailedError.name = 'OpenAIBackgroundCreationError';
      (detailedError as any).originalError = createError;
      (detailedError as any).requestConfig = requestConfig;
      logger.error(`❌ Background job creation failed for job ${jobData.id}: ${detailedError.message}`);
      throw detailedError;
    }

    // Extract OpenAI job ID from response
    const openaiJobId = response.id;
    if (!openaiJobId) {
      throw new Error(`No OpenAI job ID returned from background request for job ${jobData.id}`);
    }

    logger.info(`✅ OpenAI background job created: ${openaiJobId} for job ${jobData.id}`);

    if (progressCallback) {
      await progressCallback({
        job_id: jobData.id,
        progress: 15,
        message: `OpenAI job ${openaiJobId} started, polling for completion`,
        current_step: 'processing',
        metadata: {
          openai_job_id: openaiJobId,
          approach: 'background_polling'
        },
      });
    }

    // NEW ARCHITECTURE: Poll for job resolution with image-specific terminal state logic
    const jobResult = await this.pollForJobResolution(
      openaiJobId,
      jobData.id,
      {
        terminalStates: ['completed', 'failed', 'cancelled'],
        validator: (response) => {
          // Image generation specific terminal state detection
          if (response.status === 'completed') {
            return { 
              isTerminal: true, 
              type: response.output && response.output.length > 0 ? 'has_output' : 'no_output'
            };
          }
          if (['failed', 'cancelled'].includes(response.status)) {
            return { isTerminal: true, type: response.status };
          }
          return { isTerminal: false };
        }
      },
      enhancedCallback
    );

    // NEW ARCHITECTURE: Resolve the job result with image-specific business logic
    const resolvedJob = await this.resolveJob(jobResult, (result) => {
      const openaiResponse = result.data;
      
      // Extract images from OpenAI response
      const images: string[] = [];
      const response = openaiResponse as any; // Type assertion for OpenAI response structure
      if (response.output && Array.isArray(response.output)) {
        for (const output of response.output) {
          if (output.type === 'image_generation_call' && output.result) {
            images.push(output.result);
          }
        }
      }

      // Image generation validation
      if (images.length === 0) {
        // Capture what OpenAI actually returned instead of images
        let actualResponse = 'No output provided';
        
        if (response.output && Array.isArray(response.output)) {
          // Look for text content in the response
          let textContent = '';
          for (const output of response.output) {
            if (output.type === 'message' && output.content) {
              for (const content of output.content) {
                if (content.type === 'output_text' && content.text) {
                  textContent = content.text;
                  break;
                }
              }
            }
          }
          
          // Also check for output_text field at root level
          if (!textContent && response.output_text) {
            textContent = response.output_text;
          }
          
          if (textContent) {
            // Include the actual text that was generated instead of an image
            actualResponse = `Generated text instead of image: "${textContent.substring(0, 500)}${textContent.length > 500 ? '...' : ''}"`;
          } else {
            const outputTypes = response.output.map((o: any) => o.type).join(', ');
            actualResponse = `Expected image_generation_call but got: [${outputTypes}]`;
          }
        }
        
        return {
          success: false,
          error: 'No image was generated - check that the prompt is asking for an image',
          actualResponse, // Capture what we actually received
          shouldRetry: false
        };
      }

      return {
        success: true,
        data: { images, metadata: result.metadata }
      };
    });

    if (!resolvedJob.success) {
      // Return failed result instead of throwing - let base worker handle it
      // Include the actual response in the error for webhook visibility
      const actualResponse = (resolvedJob as any).actualResponse;
      const errorWithDetails = actualResponse 
        ? `${resolvedJob.error}. ${actualResponse}`
        : resolvedJob.error;
        
      return {
        success: false,
        error: errorWithDetails,
        shouldRetry: resolvedJob.shouldRetry,
        processing_time_ms: 0, // Will be calculated by base class
        metadata: {
          actualResponse: actualResponse
        }
      } as any;
    }

    logger.info(`Text2img generation resolved successfully for job ${jobData.id} -> OpenAI job ${openaiJobId}`);
    
    // Convert base64 to data URLs for consistency with existing processing
    const dataUrls = resolvedJob.data.images.map(base64 => `data:image/png;base64,${base64}`);
    
    return await this.finalizeImageProcessing(jobData, dataUrls, dataUrls.length, progressCallback, {
      openai_job_id: openaiJobId,
      approach: 'resolution_polling',
      poll_attempts: resolvedJob.data.metadata?.pollAttempts || 0,
      total_poll_time_ms: resolvedJob.data.metadata?.totalElapsedTime || 0
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

    return await this.finalizeImageProcessing(jobData, partialImages, partialCount, progressCallback, {
      approach: 'traditional_streaming'
    });
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

      return await this.finalizeImageProcessing(jobData, partialImages, 1, progressCallback, {
        approach: 'non_streaming_fallback'
      });
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
      poll_attempts?: number;
      total_poll_time_ms?: number;
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
        try {
          logger.info(`💾 Starting asset saving for job ${jobData.id}`);
          
          // Extract MIME type and base64 data from data URL
          const mimeMatch = finalImageDataUrl.match(/^data:([^;]+);base64,/);
          const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
          const base64Data = finalImageDataUrl.replace(/^data:[^;]+;base64,/, '');
          
          const payload = jobData.payload as any;
          const assetSaveDebug = {
            jobId: jobData.id,
            mimeType,
            base64Length: base64Data.length,
            hasCtx: !!payload?.ctx,
            ctxPrefix: payload?.ctx?.prefix,
            ctxFilename: payload?.ctx?.filename,
            cloudProvider: process.env.CLOUD_STORAGE_PROVIDER,
            cloudContainer: process.env.CLOUD_STORAGE_CONTAINER,
            cloudCdnUrl: process.env.CLOUD_CDN_URL,
            environment: process.env.CURRENT_ENV || process.env.NODE_ENV
          };
          
          logger.info(`🔍 Asset save debug context:\n${JSON.stringify(assetSaveDebug, null, 2)}`);
          
          // Validate required data
          if (!base64Data || base64Data.length === 0) {
            throw new Error(`Invalid base64 data for job ${jobData.id}: empty or missing`);
          }
          
          if (base64Data.length < 100) {
            throw new Error(`Suspiciously short base64 data for job ${jobData.id}: ${base64Data.length} characters`);
          }
          
          logger.info(`💾 Calling AssetSaver.saveAssetToCloud for job ${jobData.id}`);
          savedAsset = await AssetSaver.saveAssetToCloud(base64Data, jobData.id, jobData, mimeType);
          
          if (!savedAsset || !savedAsset.fileUrl) {
            throw new Error(`AssetSaver returned invalid result for job ${jobData.id}: ${JSON.stringify(savedAsset)}`);
          }
          
          finalImageUrl = savedAsset.fileUrl; // Use cloud storage URL as primary result
          logger.info(`✅ Image saved and verified in cloud storage: ${savedAsset.fileName} -> ${savedAsset.fileUrl}`);
          
        } catch (assetError) {
          const assetErrorDetails = {
            error: assetError.message,
            name: assetError.name,
            stack: assetError.stack,
            jobId: jobData.id,
            environment: process.env.CURRENT_ENV || process.env.NODE_ENV,
            cloudProvider: process.env.CLOUD_STORAGE_PROVIDER,
            cloudContainer: process.env.CLOUD_STORAGE_CONTAINER,
            cloudCdnUrl: process.env.CLOUD_CDN_URL,
            azureAccount: process.env.AZURE_STORAGE_ACCOUNT,
            azureKeySet: !!process.env.AZURE_STORAGE_KEY,
            payload: JSON.stringify(payload, null, 2)
          };
          
          logger.error(`❌ Asset saving failed for job ${jobData.id}:\n${JSON.stringify(assetErrorDetails, null, 2)}`);
          
          const detailedAssetError = new Error(
            `Asset saving failed for job ${jobData.id} in environment ${assetErrorDetails.environment}: ${assetError.message}. ` +
            `Provider: ${assetErrorDetails.cloudProvider}, Container: ${assetErrorDetails.cloudContainer}. ` +
            `See logs for complete debug context.`
          );
          detailedAssetError.name = 'AssetSavingFailure';
          (detailedAssetError as any).assetErrorDetails = assetErrorDetails;
          throw detailedAssetError;
        }
      } else {
        finalImageUrl = finalImageDataUrl; // Use data URL directly
        logger.info(`📄 Image returned as data URL (save_assets=false)`);
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

    // Return response with saved asset metadata for base connector processing
    return {
      success: true,
      data: {
        model_used: model,
        size: size,
        quality: quality,
        partial_images_received: partialCount,
        ...openaiMetadata,
      },
      metadata: {
        saved_asset: savedAsset ? {
          filePath: savedAsset.filePath,
          fileName: savedAsset.fileName,
          fileUrl: savedAsset.fileUrl,
          mimeType: 'image/png', // OpenAI images are always PNG
        } : null,
        final_image_url: finalImageUrl,
        save_assets: payload.save_assets !== false,
        total_partial_images: partialCount,
      },
      processing_time_ms: 0, // Will be calculated by base class
    };
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
