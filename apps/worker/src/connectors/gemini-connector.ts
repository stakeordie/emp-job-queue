/**
 * Google Gemini Image Generation Connector
 * Service Type: gem_nano_banana
 * Based on SyncRESTConnector with automatic image URL to base64 conversion
 */

import {
  JobData,
  JobResult,
  ProgressCallback,
  ServiceInfo,
  ServiceSupportValidation,
  logger,
  ImageUrlConverter,
  imageUrlToMimeAndData,
} from '@emp/core';
import { AssetSaver } from './asset-saver.js';
import { RestSyncConnector, RestSyncConnectorConfig } from './rest-sync-connector.js';

interface GeminiGenerateImageRequest {
  prompt: string;
  // Optional parameters according to Gemini API
  number_of_images?: number;
  aspect_ratio?: '1:1' | '9:16' | '16:9' | '3:4' | '4:3';
  negative_prompt?: string;
  // Style reference image (will be auto-converted to base64)
  reference_image?: string;
  style_reference?: string;
  // Safety settings
  safety_filter_level?: 'block_most' | 'block_some' | 'block_few' | 'block_none';
}

interface GeminiImageResponse {
  candidates?: Array<{
    content: {
      parts: Array<{
        text?: string;
        inlineData?: {
          data: string; // Base64 encoded image
          mimeType: string; // e.g., "image/png"
        };
      }>;
    };
    finishReason?: string;
    safetyRatings?: any[];
  }>;
  // Legacy format for older models
  images?: Array<{
    bytes: string; // Base64 encoded image
    mime_type: string; // e.g., "image/png"
    safety_ratings?: any[];
    finish_reason?: string;
  }>;
  // Error handling
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

export class GeminiConnector extends RestSyncConnector {
  version = '1.0.0';
  private geminiEndpoint: string;

  // Define which fields should be auto-converted from URL to Gemini format
  private readonly imageUrlFields = ['image_url'];

  constructor(connectorId: string) {
    // Get API key from environment
    const apiKey = process.env.GEMINI_API_KEY || '';
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }

    // Use custom URL if provided, otherwise default to Google's API
    const fullUrl = process.env.GEMINI_NANO_BANANA_URL;
    let baseUrl: string;
    let endpoint: string;
    
    if (fullUrl && fullUrl.includes('/v1beta/models/')) {
      // Full URL provided - extract base URL and endpoint
      const urlParts = fullUrl.split('/v1beta/models/');
      baseUrl = urlParts[0];
      endpoint = '/v1beta/models/' + urlParts[1];
    } else {
      // Only base URL provided or use default
      baseUrl = fullUrl || 'https://generativelanguage.googleapis.com';
      endpoint = '/v1beta/models/imagen-3.0-generate-001:generateImage';
    }
    
    // Create config for Gemini
    const config: RestSyncConnectorConfig = {
      connector_id: connectorId,
      service_type: 'gem_nano_banana',
      base_url: baseUrl,
      timeout_seconds: 45, // Gemini can take up to 45 seconds
      retry_attempts: 3,
      retry_delay_seconds: 2,
      health_check_interval_seconds: 30,
      max_concurrent_jobs: 3, // Be respectful to Gemini API
      auth: {
        type: 'api_key',
        api_key: apiKey,
        api_key_header: 'x-goog-api-key',
      },
      settings: {
        method: 'POST',
        response_format: 'json',
      },
    };

    super(connectorId, config);
    
    // Store the endpoint for later use (after super() call)
    this.geminiEndpoint = endpoint;
  }

  async processJob(
    jobData: JobData,
    progressCallback: ProgressCallback
  ): Promise<JobResult> {
    try {
      await progressCallback({
        job_id: jobData.id,
        progress: 10,
        message: 'Processing Gemini image generation request...',
        current_step: 'Initializing',
      });

      // Preprocess payload - convert image URLs to base64
      const processedPayload = await this.preprocessPayload(jobData.payload);
      
      await progressCallback({
        job_id: jobData.id,
        progress: 20,
        message: 'Sending request to Google Gemini API...',
        current_step: 'Preparing request',
      });

      // Build the API endpoint and request
      const geminiRequest = this.buildGeminiRequest(processedPayload);

      // Use parent connector to make the actual HTTP request
      const modifiedJobData = {
        ...jobData,
        payload: {
          ...jobData.payload,
          endpoint: this.geminiEndpoint,
          method: 'POST',
          data: geminiRequest,
        },
      };

      await progressCallback({
        job_id: jobData.id,
        progress: 30,
        message: 'Waiting for Gemini response...',
        current_step: 'Calling Gemini API',
      });

      // Execute the request via parent connector
      const result = await super.processJob(modifiedJobData, async (progressData) => {
        // Map base connector progress to our progress range (30-80)
        const mappedProgress = 30 + (progressData.progress * 0.5);
        await progressCallback({
          job_id: jobData.id,
          progress: mappedProgress,
          message: progressData.message || 'Processing...',
          current_step: progressData.current_step || 'Processing',
        });
      });

      if (!result.success) {
        return result; // Pass through failure from base connector
      }

      await progressCallback({
        job_id: jobData.id,
        progress: 80,
        message: 'Processing Gemini response...',
        current_step: 'Processing response',
      });

      // Process the Gemini response - result data should be in result.data or similar
      const responseData = (result as any).data || result;
      const geminiResponse = responseData as GeminiImageResponse;
      const processedResult = await this.processGeminiResponse(geminiResponse, jobData);

      await progressCallback({
        job_id: jobData.id,
        progress: 100,
        message: 'Gemini image generation completed',
        current_step: 'Completed',
      });

      return {
        success: true,
        data: processedResult,
        processing_time_ms: result.processing_time_ms,
        metadata: {
          ...result.metadata,
          service: 'gemini',
          connector: 'gem_nano_banana',
          api_version: 'v1beta',
        },
      };

    } catch (error) {
      logger.error('Gemini connector error:', {
        connector_id: this.connector_id,
        job_id: jobData.id,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        error: `Gemini image generation failed: ${error instanceof Error ? error.message : String(error)}`,
        processing_time_ms: 0,
        metadata: {
          service: 'gemini',
          connector: 'gem_nano_banana',
          error_type: error instanceof Error ? error.constructor.name : 'UnknownError',
        },
      };
    }
  }

  /**
   * Preprocess payload to convert image_url fields to Gemini format
   */
  private async preprocessPayload(payload: any): Promise<any> {
    const processedPayload = await this.processImageUrlFields(payload);
    return processedPayload;
  }

  /**
   * Convert image_url to Gemini format using the generic function
   */
  private async convertImageUrlToGeminiFormat(imageUrl: string): Promise<{ mime_type: string; data: string }> {
    return await imageUrlToMimeAndData(imageUrl, {
      maxSizeBytes: 20 * 1024 * 1024, // 20MB limit for Gemini
      timeout: 30000, // 30 second timeout
    });
  }

  /**
   * Process payload and convert inline_data.image_url to inline_data.{mime_type, data}
   */
  private async processImageUrlFields(obj: any): Promise<any> {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    // Handle arrays
    if (Array.isArray(obj)) {
      const processed = [];
      for (const item of obj) {
        processed.push(await this.processImageUrlFields(item));
      }
      return processed;
    }

    // Handle objects
    const processed: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'inline_data' && value && typeof value === 'object' && !Array.isArray(value)) {
        const inlineData = value as any; // Cast to any for property access
        // Check if inline_data has image_url
        if (inlineData.image_url && typeof inlineData.image_url === 'string') {
          if (ImageUrlConverter.isValidImageUrl(inlineData.image_url)) {
            try {
              logger.info(`Converting inline_data.image_url to Gemini format`, {
                connector_id: this.connector_id,
                url: inlineData.image_url.substring(0, 100) + '...',
              });

              const converted = await this.convertImageUrlToGeminiFormat(inlineData.image_url);
              
              // Replace inline_data.image_url with inline_data.{mime_type, data}
              processed[key] = {
                mime_type: converted.mime_type,
                data: converted.data
              };
              
              logger.info(`✅ Successfully converted inline_data.image_url`, {
                connector_id: this.connector_id,
                mime_type: converted.mime_type,
              });

            } catch (error) {
              logger.error(`❌ Failed to convert inline_data.image_url: ${error.message}`);
              throw new Error(`Image conversion failed: ${error.message}`);
            }
          } else {
            // Not a valid image URL, keep inline_data as-is
            processed[key] = await this.processImageUrlFields(value);
          }
        } else {
          // inline_data without image_url, process recursively
          processed[key] = await this.processImageUrlFields(value);
        }
      } else if (value && typeof value === 'object') {
        // Recursively process nested objects/arrays
        processed[key] = await this.processImageUrlFields(value);
      } else {
        // Keep other values as-is
        processed[key] = value;
      }
    }

    return processed;
  }

  /**
   * Build the request payload for Gemini API - just pass through
   */
  private buildGeminiRequest(payload: any): any {
    // Just pass through the payload as-is - no validation or reformatting
    return payload;
  }

  /**
   * Process Gemini API response - identical pattern to OpenAI connector
   */
  private async processGeminiResponse(
    geminiResponse: GeminiImageResponse,
    jobData: JobData
  ): Promise<any> {
    // Handle API errors
    if (geminiResponse.error) {
      throw new Error(`Gemini API error: ${geminiResponse.error.message} (${geminiResponse.error.code})`);
    }

    let imageBase64Data = null;

    // Handle new Gemini format (candidates)
    if (geminiResponse.candidates && geminiResponse.candidates.length > 0) {
      for (const candidate of geminiResponse.candidates) {
        if (candidate.content && candidate.content.parts) {
          for (const part of candidate.content.parts) {
            if (part.inlineData && part.inlineData.data) {
              imageBase64Data = part.inlineData.data;
              break;
            }
          }
        }
        if (imageBase64Data) break;
      }
    }
    // Handle legacy Imagen format
    else if (geminiResponse.images && geminiResponse.images.length > 0) {
      imageBase64Data = geminiResponse.images[0].bytes;
    }

    if (!imageBase64Data) {
      throw new Error('No images returned from Gemini API');
    }

    // Try to save image to cloud storage (identical to OpenAI pattern)
    let savedImageUrl = null;
    try {
      const savedAsset = await AssetSaver.saveAssetToCloud(
        imageBase64Data,
        jobData.id,
        jobData,
        'image/png'
      );
      savedImageUrl = savedAsset.cdnUrl || savedAsset.fileUrl;
      logger.info(`🖼️ SUCCESS - Gemini image saved to: ${savedImageUrl}`);
    } catch (error) {
      logger.error(`🖼️ FAILED to save Gemini image to cloud storage: ${error.message}`);
    }

    // Return identical format to OpenAI connector
    return {
      content_type: 'image',
      image_base64: imageBase64Data,
      image_url: savedImageUrl,
      raw_response: geminiResponse,
    };
  }

  async validateServiceSupport(): Promise<ServiceSupportValidation> {
    // Add Gemini-specific validation - this method will be called by the framework
    return {
      isSupported: true,
      supportLevel: 'full',
      missingCapabilities: [],
      warnings: [],
      errors: [],
      recommendedAction: 'proceed',
    };
  }

  async canProcessJob(jobData: JobData): Promise<boolean> {
    // Check if this is a Gemini job
    return (jobData.type === this.service_type || jobData.type === 'gem_nano_banana');
  }

  async getServiceInfo(): Promise<ServiceInfo> {
    const baseInfo = await super.getServiceInfo();
    
    return {
      ...baseInfo,
      service_name: 'Google Gemini Image Generation',
      service_version: this.version,
      capabilities: {
        ...baseInfo.capabilities,
        features: [
          ...baseInfo.capabilities.features,
          'image_generation',
          'text_to_image', 
          'style_reference',
          'aspect_ratio_control',
          'safety_filtering',
        ],
      },
    };
  }
}