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
  smartTruncateObject,
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

    // Use your environment variable directly
    const fullUrl = process.env.GEMINI_NANO_BANANA_URL;
    if (!fullUrl) {
      throw new Error('GEMINI_NANO_BANANA_URL environment variable is required');
    }

    // Split the URL to get base and endpoint
    const urlParts = fullUrl.split('/v1beta/models/');
    const baseUrl = urlParts[0];
    const endpoint = '/v1beta/models/' + urlParts[1];

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

  async processJob(jobData: JobData, progressCallback: ProgressCallback): Promise<JobResult> {
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

      // Log the exact request being sent to Gemini API
      logger.info('🚀 Sending request to Gemini API:', {
        connector_id: this.connector_id,
        job_id: jobData.id,
        endpoint: this.geminiEndpoint,
        method: 'POST',
        base_url: this.config.base_url,
        full_url: `${this.config.base_url}${this.geminiEndpoint}`,
        request_payload: `[TRUNCATION-APPLIED-GEMINI-REQUEST] ${JSON.stringify(smartTruncateObject(geminiRequest), null, 2)}`,
      });

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
      const result = await super.processJob(modifiedJobData, async progressData => {
        // Map base connector progress to our progress range (30-80)
        const mappedProgress = 30 + progressData.progress * 0.5;
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
  private async convertImageUrlToGeminiFormat(
    imageUrl: string
  ): Promise<{ mime_type: string; data: string }> {
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
                data: converted.data,
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
   * Build the request payload for Gemini API in the correct format
   */
  private buildGeminiRequest(payload: any): any {
    // Transform the payload into Gemini's expected format
    const geminiRequest: any = {
      contents: [],
    };

    // Extract text prompt from various possible locations
    let textPrompt = '';
    if (payload.prompt) {
      textPrompt = payload.prompt;
    } else if (payload.text) {
      textPrompt = payload.text;
    } else if (
      payload.contents &&
      Array.isArray(payload.contents) &&
      payload.contents[0]?.parts?.[0]?.text
    ) {
      // Already in Gemini format, pass through
      return payload;
    } else if (typeof payload === 'string') {
      textPrompt = payload;
    } else {
      // Fallback: stringify the payload as a prompt
      textPrompt = JSON.stringify(payload);
    }

    // Build contents array with text part
    const contentParts: any[] = [{ text: textPrompt }];

    // Add any inline_data parts (images) that were processed
    if (payload.contents && Array.isArray(payload.contents)) {
      payload.contents.forEach((content: any) => {
        if (content.parts) {
          content.parts.forEach((part: any) => {
            if (part.inline_data || part.inlineData) {
              contentParts.push({
                inlineData: part.inline_data || part.inlineData,
              });
            }
          });
        }
      });
    }

    geminiRequest.contents = [
      {
        parts: contentParts,
      },
    ];

    logger.info('🔧 Built Gemini request:', {
      connector_id: this.connector_id,
      text_prompt_length: textPrompt.length,
      parts_count: contentParts.length,
      has_inline_data: contentParts.some(part => part.inlineData),
      request_structure: `[TRUNCATION-APPLIED-GEMINI-BUILD] ${JSON.stringify(smartTruncateObject(geminiRequest), null, 2)}`,
    });

    return geminiRequest;
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
      throw new Error(
        `Gemini API error: ${geminiResponse.error.message} (${geminiResponse.error.code})`
      );
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
      // Log detailed response structure for debugging when no images are returned
      logger.error('❌ No images returned from Gemini API. Analyzing response structure:', {
        connector_id: this.connector_id,
        job_id: jobData.id,
        has_candidates: !!(geminiResponse.candidates && geminiResponse.candidates.length > 0),
        candidates_count: geminiResponse.candidates?.length || 0,
        has_images_legacy: !!(geminiResponse.images && geminiResponse.images.length > 0),
        images_count: geminiResponse.images?.length || 0,
        has_error: !!geminiResponse.error,
      });

      // Log each candidate's parts structure in detail
      if (geminiResponse.candidates) {
        geminiResponse.candidates.forEach((candidate, candidateIndex) => {
          logger.error(`Candidate ${candidateIndex} analysis:`, {
            has_content: !!candidate.content,
            has_parts: !!(candidate.content && candidate.content.parts),
            parts_count: candidate.content?.parts?.length || 0,
            finish_reason: candidate.finishReason,
          });

          if (candidate.content && candidate.content.parts) {
            candidate.content.parts.forEach((part, partIndex) => {
              logger.error(`  Part ${partIndex}:`, {
                has_text: !!part.text,
                text_preview: part.text ? part.text.substring(0, 100) + '...' : null,
                has_inline_data: !!part.inlineData,
                inline_data_keys: part.inlineData ? Object.keys(part.inlineData) : [],
                part_keys: Object.keys(part),
              });
            });
          }
        });
      }

      // Log the response with smart truncation (preserves text, truncates base64)
      const smartTruncatedResponse = smartTruncateObject(geminiResponse, 5000);
      logger.error(
        `[TRUNCATION-APPLIED-GEMINI-RESPONSE] Full raw response (smart truncation): ${JSON.stringify(smartTruncatedResponse)}`
      );
      throw new Error(
        `No images returned from Gemini API. See logs for detailed response analysis.`
      );
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

    // Return result optimized for webhooks - exclude base64 when image is saved to prevent payload size issues
    const result: any = {
      content_type: 'image',
      image_url: savedImageUrl,
      raw_response: geminiResponse,
    };

    // Only include base64 data if image couldn't be saved to cloud storage
    // This prevents webhook payload size issues while maintaining fallback compatibility
    if (!savedImageUrl) {
      logger.warn(
        `🖼️ Including base64 data in result since cloud storage failed for job ${jobData.id}`
      );
      result.image_base64 = imageBase64Data;
    } else {
      logger.info(`🖼️ Excluding base64 data from result - image available at: ${savedImageUrl}`);
    }

    return result;
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
    return jobData.type === this.service_type || jobData.type === 'gem_nano_banana';
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
