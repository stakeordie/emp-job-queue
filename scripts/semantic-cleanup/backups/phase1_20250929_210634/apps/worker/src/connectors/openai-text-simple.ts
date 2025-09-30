// Simplified OpenAI Text Connector using new abstractions
// Demonstrates how the base classes reduce boilerplate code

import OpenAI from 'openai';
import { OpenAIConnector } from './openai-connector.js';
import { StreamingMixin } from './streaming-mixin.js';
import { ConfigManager } from './config-manager.js';
import { AssetSaver } from './asset-saver.js';
import { JobData, JobResult, ProgressCallback, logger } from '@emp/core';

export class OpenAITextSimpleConnector extends OpenAIConnector {
  service_type = 'text_generation' as const;
  version = '1.1.0';

  private maxTokens: number;
  private temperature: number;

  constructor(connectorId: string = 'openai-text-simple') {
    // Use ConfigManager for environment parsing
    const configDefs = [
      ...ConfigManager.getOpenAIConfigDefinitions('OPENAI_TEXT', 'gpt-4o-mini'),
      {
        key: 'OPENAI_TEXT_MAX_TOKENS',
        template: '${OPENAI_TEXT_MAX_TOKENS:-4000}',
        type: 'number' as const,
        default: 4000,
        validator: (val: number) => val > 0 && val <= 32000,
        description: 'Maximum tokens to generate',
      },
      {
        key: 'OPENAI_TEXT_TEMPERATURE',
        template: '${OPENAI_TEXT_TEMPERATURE:-0.7}',
        type: 'number' as const,
        default: 0.7,
        validator: (val: number) => val >= 0 && val <= 2,
        description: 'Temperature for generation',
      },
      // Include streaming config
      ...Object.entries(StreamingMixin.getStreamingEnvVars('OPENAI_TEXT')).map(
        ([key, template]) => ({
          key,
          template,
          type: 'string' as const,
          description: 'Streaming configuration',
        })
      ),
    ];

    const parsedConfig = ConfigManager.parseConfig(configDefs);

    // Initialize with parsed configuration
    super(connectorId, 'text_generation', 'OPENAI_TEXT', 'gpt-4o-mini');

    // Set service-specific capabilities after initialization
    if (this.openaiConfig.openai_settings) {
      this.openaiConfig.openai_settings.supported_formats = ['text'];
      this.openaiConfig.openai_settings.features = [
        'chat_completion',
        'text_generation',
        'conversation',
        'system_prompts',
        'streaming_support',
        'custom_api_keys',
      ];
      this.openaiConfig.openai_settings.model_filter = (model: OpenAI.Model) =>
        model.id.includes('gpt') || model.id.includes('text');
    }

    this.maxTokens = parsedConfig.OPENAI_TEXT_MAX_TOKENS as number;
    this.temperature = parsedConfig.OPENAI_TEXT_TEMPERATURE as number;

    ConfigManager.logConfigSummary(parsedConfig, connectorId);
  }

  /**
   * Generate required environment variables using ConfigManager
   */
  static getRequiredEnvVars(): Record<string, string> {
    const configDefs = [
      ...ConfigManager.getOpenAIConfigDefinitions('OPENAI_TEXT', 'gpt-4o-mini'),
      {
        key: 'OPENAI_TEXT_MAX_TOKENS',
        template: '${OPENAI_TEXT_MAX_TOKENS:-4000}',
        type: 'number' as const,
        default: 4000,
      },
      {
        key: 'OPENAI_TEXT_TEMPERATURE',
        template: '${OPENAI_TEXT_TEMPERATURE:-0.7}',
        type: 'number' as const,
        default: 0.7,
      },
    ];

    return {
      ...ConfigManager.generateEnvVarTemplates(configDefs),
      ...StreamingMixin.getStreamingEnvVars('OPENAI_TEXT'),
      // Add asset saving requirements if needed
      ...AssetSaver.getBaseRequiredEnvVars(),
    };
  }

  async canProcessJobImpl(jobData: JobData): Promise<boolean> {
    const payload = jobData.payload as any;

    // Check if job has required fields for text generation
    return !!(payload.prompt || payload.messages);
  }

  async processJobImpl(jobData: JobData, progressCallback?: ProgressCallback): Promise<JobResult> {
    try {
      const payload = jobData.payload as any;
      const client = this.getClientForJob(jobData);

      // Extract parameters with defaults
      const model = payload.model || this.openaiConfig.openai_settings.default_model;
      const maxTokens = payload.max_tokens || this.maxTokens;
      const temperature =
        payload.temperature !== undefined ? payload.temperature : this.temperature;

      // Support both direct prompt and chat messages format
      let messages: OpenAI.ChatCompletionMessageParam[];

      if (payload.messages) {
        messages = payload.messages;
      } else if (payload.prompt) {
        const systemPrompt = payload.system_prompt || 'You are a helpful assistant.';
        messages = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: payload.prompt },
        ];
      } else {
        throw new Error('Job must contain either "prompt" or "messages" field');
      }

      logger.info(`Processing text generation job with model ${model}`);

      // Report initial progress
      await this.reportProgress(
        jobData.id,
        10,
        `Starting text generation with ${model}...`,
        'initializing',
        progressCallback
      );

      // Create streaming request
      const stream = await client.chat.completions.create({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        stream: true,
      });

      // Use StreamingMixin to process the stream
      const streamingConfig = StreamingMixin.getStreamingConfigFromEnv('OPENAI_TEXT');
      const streamResult = await StreamingMixin.processTextStream(stream, {
        jobId: jobData.id,
        progressCallback,
        streamingConfig,
        onToken: (token, totalTokens) => {
          // Optional: Log progress every N tokens
          if (totalTokens % 50 === 0) {
            logger.debug(`Generated ${totalTokens} tokens for job ${jobData.id}`);
          }
        },
      });

      if (!streamResult.success) {
        throw new Error(streamResult.error || 'Stream processing failed');
      }

      if (!streamResult.text.trim()) {
        throw new Error('No response generated from OpenAI');
      }

      // Optionally save text output to cloud storage
      let savedAsset = null;
      if (payload.save_output) {
        const textB64 = Buffer.from(streamResult.text).toString('base64');
        savedAsset = await AssetSaver.saveAssetToCloud(textB64, jobData.id, jobData, 'text/plain');
        logger.info(`Text output saved to cloud storage: ${savedAsset.fileName}`);
      }

      return {
        success: true,
        data: {
          text: streamResult.text,
          model_used: model,
          tokens_used: streamResult.tokensGenerated,
          finish_reason: 'stop',
        },
        processing_time_ms: 0, // Will be calculated by base class
        metadata: {
          model: model,
          service: 'openai_text_simple',
          tokens: {
            total: streamResult.tokensGenerated,
          },
          saved_asset: savedAsset,
        },
        service_metadata: {
          service_version: this.version,
          service_type: this.service_type,
          model_used: model,
        },
      };
    } catch (error) {
      logger.error(`OpenAI Text Simple processing failed: ${error.message}`);
      throw error;
    }
  }

  getConfigurationImpl(): Record<string, any> {
    return {
      max_tokens: this.maxTokens,
      temperature: this.temperature,
    };
  }
}
