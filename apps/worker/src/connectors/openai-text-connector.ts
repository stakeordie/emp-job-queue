// OpenAI Text Connector - Handles text generation using OpenAI SDK
// Uses the OpenAI chat completions API for text generation tasks

import OpenAI from 'openai';
import { BaseConnector } from './base-connector.js';
import { JobData, JobResult, ServiceInfo, HealthCheckClass, logger, ProgressCallback } from '@emp/core';

export class OpenAITextConnector extends BaseConnector {
  service_type = 'text_generation' as const;
  version = '1.0.0';
  
  private client: OpenAI | null = null;
  private apiKey: string;
  private baseURL: string;
  private defaultModel: string;
  private maxTokens: number;
  private temperature: number;
  
  /**
   * Get required environment variables for OpenAI Text connector
   */
  static getRequiredEnvVars(): Record<string, string> {
    return {
      OPENAI_API_KEY: '${OPENAI_API_KEY:-}',
      OPENAI_BASE_URL: '${OPENAI_BASE_URL:-https://api.openai.com/v1}',
      OPENAI_TEXT_MODEL: '${OPENAI_TEXT_MODEL:-gpt-4o-mini}',
      OPENAI_MAX_TOKENS: '${OPENAI_MAX_TOKENS:-4000}',
      OPENAI_TEMPERATURE: '${OPENAI_TEMPERATURE:-0.7}',
      OPENAI_TIMEOUT_SECONDS: '${OPENAI_TIMEOUT_SECONDS:-60}',
      OPENAI_RETRY_ATTEMPTS: '${OPENAI_RETRY_ATTEMPTS:-3}',
      OPENAI_RETRY_DELAY_SECONDS: '${OPENAI_RETRY_DELAY_SECONDS:-2}',
      OPENAI_HEALTH_CHECK_INTERVAL: '${OPENAI_HEALTH_CHECK_INTERVAL:-120}',
      OPENAI_TEXT_MAX_CONCURRENT_JOBS: '${OPENAI_TEXT_MAX_CONCURRENT_JOBS:-5}'
    };
  }

  constructor(connectorId: string = 'openai-text') {
    const config = {
      connector_id: connectorId,
      service_type: 'text_generation',
      base_url: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      timeout_seconds: parseInt(process.env.OPENAI_TIMEOUT_SECONDS || '60'),
      retry_attempts: parseInt(process.env.OPENAI_RETRY_ATTEMPTS || '3'),
      retry_delay_seconds: parseInt(process.env.OPENAI_RETRY_DELAY_SECONDS || '2'),
      health_check_interval_seconds: parseInt(process.env.OPENAI_HEALTH_CHECK_INTERVAL || '120'),
      max_concurrent_jobs: parseInt(process.env.OPENAI_TEXT_MAX_CONCURRENT_JOBS || '5'),
    };

    super(connectorId, config);

    // OpenAI-specific configuration
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.baseURL = config.base_url;
    this.defaultModel = process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini';
    this.maxTokens = parseInt(process.env.OPENAI_MAX_TOKENS || '4000');
    this.temperature = parseFloat(process.env.OPENAI_TEMPERATURE || '0.7');

    if (!this.apiKey) {
      throw new Error('OpenAI Text connector requires OPENAI_API_KEY environment variable');
    }

    logger.info(`OpenAI Text connector ${connectorId} initialized with model ${this.defaultModel}`);
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
      logger.info(`OpenAI Text connector ${this.connector_id} initialized successfully`);
    } catch (error) {
      this.currentStatus = 'error';
      throw new Error(`Failed to initialize OpenAI Text connector: ${error.message}`);
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
      logger.warn(`OpenAI Text connector health check failed: ${error.message}`);
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
        .filter(model => model.id.includes('gpt') || model.id.includes('text'))
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
      service_name: 'OpenAI Text Generation',
      service_version: this.version,
      base_url: this.baseURL,
      status: (this.currentStatus === 'idle' || this.currentStatus === 'active') ? 'online' : 
              (this.currentStatus === 'offline') ? 'offline' : 'error',
      capabilities: {
        supported_formats: ['text'],
        supported_models: models,
        features: [
          'chat_completion',
          'text_generation', 
          'conversation',
          'system_prompts',
          'streaming_support'
        ],
        concurrent_jobs: this.config.max_concurrent_jobs
      }
    };
  }

  async canProcessJob(jobData: JobData): Promise<boolean> {
    const payload = jobData.payload as any;
    
    // Check if job has required fields for text generation
    if (!payload.prompt && !payload.messages) {
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
    try {
      const payload = jobData.payload as any;
      const model = payload.model || this.defaultModel;
      const maxTokens = payload.max_tokens || this.maxTokens;
      const temperature = payload.temperature !== undefined ? payload.temperature : this.temperature;

      // Use custom API key if provided, otherwise use default client
      let client = this.client;
      if (payload.api_key && payload.api_key.trim()) {
        // Create a temporary client with the custom API key
        client = new OpenAI({
          apiKey: payload.api_key.trim(),
          baseURL: this.baseURL,
          timeout: this.config.timeout_seconds * 1000,
          maxRetries: this.config.retry_attempts,
        });
      } else if (!this.client) {
        throw new Error('OpenAI client not initialized and no API key provided');
      }

      // Support both direct prompt and chat messages format
      let messages: OpenAI.ChatCompletionMessageParam[];
      
      if (payload.messages) {
        // Use provided messages directly
        messages = payload.messages;
      } else if (payload.prompt) {
        // Convert prompt to messages format
        const systemPrompt = payload.system_prompt || 'You are a helpful assistant.';
        messages = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: payload.prompt }
        ];
      } else {
        throw new Error('Job must contain either "prompt" or "messages" field');
      }

      logger.info(`Processing text generation job with model ${model}`);

      // Report initial progress
      if (progressCallback) {
        await progressCallback({
          job_id: jobData.id,
          progress: 10,
          message: `Starting text generation with ${model}...`,
          current_step: 'initializing'
        });
      }

      const stream = await client.chat.completions.create({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        stream: true,
      });

      let response = '';
      let tokensGenerated = 0;
      let totalTokens = 0;
      let promptTokens = 0;

      if (progressCallback) {
        await progressCallback({
          job_id: jobData.id,
          progress: 20,
          message: 'Generating text response...',
          current_step: 'generating'
        });
      }

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          response += delta;
          tokensGenerated++;
          
          // Report progress every 10 tokens or so
          if (tokensGenerated % 10 === 0 && progressCallback) {
            const progress = Math.min(90, 20 + (tokensGenerated * 0.7)); // Scale from 20% to 90%
            await progressCallback({
              job_id: jobData.id,
              progress,
              message: `Generated ${tokensGenerated} tokens...`,
              current_step: 'generating',
              metadata: { tokens_generated: tokensGenerated }
            });
          }
        }

        // Get usage info if available
        if (chunk.usage) {
          totalTokens = chunk.usage.total_tokens;
          promptTokens = chunk.usage.prompt_tokens;
        }
      }

      if (!response.trim()) {
        throw new Error('No response generated from OpenAI');
      }

      if (progressCallback) {
        await progressCallback({
          job_id: jobData.id,
          progress: 100,
          message: 'Text generation completed',
          current_step: 'completed',
          metadata: { 
            total_tokens: totalTokens || tokensGenerated,
            response_length: response.length 
          }
        });
      }

      return {
        success: true,
        data: {
          text: response,
          model_used: model,
          tokens_used: totalTokens || tokensGenerated,
          finish_reason: 'stop', // Streaming doesn't provide finish_reason in chunks
        },
        processing_time_ms: 0, // Will be calculated by base class
        metadata: {
          model: model,
          service: 'openai_text',
          tokens: {
            prompt: promptTokens || 0,
            completion: (totalTokens || tokensGenerated) - (promptTokens || 0),
            total: totalTokens || tokensGenerated,
          }
        },
        service_metadata: {
          service_version: this.version,
          service_type: this.service_type,
          model_used: model,
        }
      };
    } catch (error) {
      logger.error(`OpenAI Text processing failed: ${error.message}`);
      throw error;
    }
  }

  async cleanupService(): Promise<void> {
    this.client = null;
    this.currentStatus = 'offline';
    logger.info(`OpenAI Text connector ${this.connector_id} cleaned up`);
  }

  async cancelJob(jobId: string): Promise<void> {
    // OpenAI doesn't support job cancellation in the same way as streaming services
    // For now, this is a no-op as the API calls are typically short-lived
    logger.info(`Job cancellation requested for ${jobId} (OpenAI text jobs cannot be cancelled once started)`);
  }

  async updateConfiguration(config: any): Promise<void> {
    // Update configuration if needed
    logger.info(`Configuration update requested for OpenAI Text connector ${this.connector_id}`);
  }

  getConfiguration(): any {
    return {
      connector_id: this.connector_id,
      service_type: this.service_type,
      model: this.defaultModel,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      max_concurrent_jobs: this.config.max_concurrent_jobs,
    };
  }
}