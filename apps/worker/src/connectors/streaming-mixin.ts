// Streaming Connector Mixin
// Provides common patterns for streaming API responses with progress callbacks

import { logger, ProgressCallback } from '@emp/core';

export interface StreamingConfig {
  enable_streaming?: boolean;
  progress_interval?: number; // How often to report progress (in items/tokens)
  chunk_timeout_ms?: number; // Timeout between chunks
  max_response_size?: number; // Maximum response size
}

export interface StreamingProgress {
  jobId: string;
  itemsProcessed: number;
  totalItems?: number;
  responseSize: number;
  currentStep: string;
  progressCallback?: ProgressCallback;
}

/**
 * Mixin providing streaming functionality for connectors
 * Handles progress reporting, timeouts, and response accumulation
 */
export class StreamingMixin {
  
  /**
   * Process a streaming response with progress tracking
   */
  static async processStream<T>(
    stream: AsyncIterable<T>,
    processor: (chunk: T, state: StreamingProgress) => Promise<boolean>, // returns true to continue
    config: {
      jobId: string;
      progressCallback?: ProgressCallback;
      streamingConfig?: StreamingConfig;
      initialStep?: string;
    }
  ): Promise<{
    success: boolean;
    itemsProcessed: number;
    responseSize: number;
    error?: string;
  }> {
    const {
      jobId,
      progressCallback,
      streamingConfig = {},
      initialStep = 'streaming'
    } = config;

    const {
      progress_interval = 10,
      chunk_timeout_ms = 30000,
      max_response_size = 50 * 1024 * 1024, // 50MB default
    } = streamingConfig;

    let itemsProcessed = 0;
    let responseSize = 0;
    let lastProgressReport = 0;
    let lastChunkTime = Date.now();

    const state: StreamingProgress = {
      jobId,
      itemsProcessed: 0,
      responseSize: 0,
      currentStep: initialStep,
      progressCallback,
    };

    try {
      // Report initial progress
      await this.reportStreamingProgress(state, 5, `Starting ${initialStep}...`);

      for await (const chunk of stream) {
        const chunkTime = Date.now();
        
        // Check for chunk timeout
        if (chunkTime - lastChunkTime > chunk_timeout_ms) {
          throw new Error(`Stream timeout: no data received for ${chunk_timeout_ms}ms`);
        }
        lastChunkTime = chunkTime;

        // Update state
        itemsProcessed++;
        state.itemsProcessed = itemsProcessed;
        
        // Estimate chunk size (rough approximation)
        const chunkSize = JSON.stringify(chunk).length;
        responseSize += chunkSize;
        state.responseSize = responseSize;

        // Check max response size
        if (responseSize > max_response_size) {
          throw new Error(`Response size exceeded maximum (${max_response_size} bytes)`);
        }

        // Process the chunk
        const shouldContinue = await processor(chunk, state);
        if (!shouldContinue) {
          logger.info(`Stream processing stopped by processor at item ${itemsProcessed}`);
          break;
        }

        // Report progress periodically
        if (itemsProcessed - lastProgressReport >= progress_interval) {
          const progress = Math.min(95, 5 + (itemsProcessed * 0.9)); // 5% to 95%
          await this.reportStreamingProgress(
            state,
            progress,
            `Processed ${itemsProcessed} items (${Math.round(responseSize / 1024)}KB)`,
            { items_processed: itemsProcessed, response_size_kb: Math.round(responseSize / 1024) }
          );
          lastProgressReport = itemsProcessed;
        }
      }

      // Report completion
      await this.reportStreamingProgress(state, 100, 'Stream processing completed');

      return {
        success: true,
        itemsProcessed,
        responseSize,
      };

    } catch (error) {
      logger.error(`Stream processing failed for job ${jobId}:`, error);
      
      // Report error
      if (progressCallback) {
        await progressCallback({
          job_id: jobId,
          progress: 0,
          message: `Stream error: ${error.message}`,
          current_step: 'error',
          metadata: { 
            items_processed: itemsProcessed,
            response_size: responseSize,
            error: error.message 
          },
        });
      }

      return {
        success: false,
        itemsProcessed,
        responseSize,
        error: error.message,
      };
    }
  }

  /**
   * Process text streaming with token counting
   */
  static async processTextStream(
    stream: AsyncIterable<{ choices: Array<{ delta?: { content?: string } }> }>,
    config: {
      jobId: string;
      progressCallback?: ProgressCallback;
      streamingConfig?: StreamingConfig;
      onToken?: (token: string, totalTokens: number) => void;
    }
  ): Promise<{
    success: boolean;
    text: string;
    tokensGenerated: number;
    error?: string;
  }> {
    let fullText = '';
    let tokensGenerated = 0;

    const result = await this.processStream(
      stream,
      async (chunk, state) => {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          tokensGenerated++;
          
          // Call token callback if provided
          if (config.onToken) {
            config.onToken(delta, tokensGenerated);
          }
        }
        return true; // Continue processing
      },
      {
        ...config,
        initialStep: 'generating_text',
      }
    );

    return {
      success: result.success,
      text: fullText,
      tokensGenerated,
      error: result.error,
    };
  }

  /**
   * Process image streaming with base64 data
   */
  static async processImageStream(
    stream: AsyncIterable<{ type: string; partial_image_b64?: string; partial_image_index?: number }>,
    config: {
      jobId: string;
      progressCallback?: ProgressCallback;
      streamingConfig?: StreamingConfig;
      onPartialImage?: (imageData: string, index: number) => void;
    }
  ): Promise<{
    success: boolean;
    partialImages: string[];
    partialCount: number;
    error?: string;
  }> {
    const partialImages: string[] = [];
    let partialCount = 0;

    const result = await this.processStream(
      stream,
      async (event, state) => {
        if (event.type === 'response.image_generation_call.partial_image' && event.partial_image_b64) {
          partialCount++;
          const imageDataUrl = `data:image/png;base64,${event.partial_image_b64}`;
          partialImages.push(imageDataUrl);

          // Call partial image callback if provided
          if (config.onPartialImage) {
            config.onPartialImage(imageDataUrl, event.partial_image_index || partialCount);
          }

          // Update progress step
          state.currentStep = 'generating_image';
        }
        return true; // Continue processing
      },
      {
        ...config,
        initialStep: 'generating_image',
      }
    );

    return {
      success: result.success,
      partialImages,
      partialCount,
      error: result.error,
    };
  }

  /**
   * Helper to report streaming progress
   */
  private static async reportStreamingProgress(
    state: StreamingProgress,
    progress: number,
    message: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (state.progressCallback) {
      await state.progressCallback({
        job_id: state.jobId,
        progress,
        message,
        current_step: state.currentStep,
        metadata: {
          items_processed: state.itemsProcessed,
          response_size_bytes: state.responseSize,
          ...metadata,
        },
      });
    }
  }

  /**
   * Create streaming configuration from environment variables
   */
  static getStreamingConfigFromEnv(envPrefix: string): StreamingConfig {
    return {
      enable_streaming: process.env[`${envPrefix}_ENABLE_STREAMING`] !== 'false', // Default true
      progress_interval: parseInt(process.env[`${envPrefix}_PROGRESS_INTERVAL`] || '10'),
      chunk_timeout_ms: parseInt(process.env[`${envPrefix}_CHUNK_TIMEOUT_MS`] || '30000'),
      max_response_size: parseInt(process.env[`${envPrefix}_MAX_RESPONSE_SIZE`] || '52428800'), // 50MB
    };
  }

  /**
   * Get environment variables for streaming configuration
   */
  static getStreamingEnvVars(envPrefix: string): Record<string, string> {
    return {
      [`${envPrefix}_ENABLE_STREAMING`]: `\${${envPrefix}_ENABLE_STREAMING:-true}`,
      [`${envPrefix}_PROGRESS_INTERVAL`]: `\${${envPrefix}_PROGRESS_INTERVAL:-10}`,
      [`${envPrefix}_CHUNK_TIMEOUT_MS`]: `\${${envPrefix}_CHUNK_TIMEOUT_MS:-30000}`,
      [`${envPrefix}_MAX_RESPONSE_SIZE`]: `\${${envPrefix}_MAX_RESPONSE_SIZE:-52428800}`,
    };
  }
}