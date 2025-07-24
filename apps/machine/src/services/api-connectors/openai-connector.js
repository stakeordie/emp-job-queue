/**
 * OpenAI API Connector Service
 * Handles OpenAI API requests for text generation, image generation, etc.
 */

import { createLogger } from '../../utils/logger.js';

const logger = createLogger('openai-connector');

class OpenAIConnector {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    this.baseURL = config.baseURL || 'https://api.openai.com/v1';
    this.timeout = config.timeout || 60000; // 60 seconds
    
    if (!this.apiKey) {
      throw new Error('OpenAI API key is required');
    }
    
    logger.info('OpenAI Connector initialized', {
      baseURL: this.baseURL,
      timeout: this.timeout
    });
  }

  /**
   * Process a job request
   */
  async processJob(job) {
    logger.info('Processing OpenAI job', { 
      jobId: job.id, 
      type: job.type,
      model: job.params?.model 
    });

    try {
      let result;
      
      switch (job.type) {
        case 'text-completion':
        case 'chat-completion':
          result = await this.handleChatCompletion(job.params);
          break;
        case 'image-generation':
          result = await this.handleImageGeneration(job.params);
          break;
        case 'embeddings':
          result = await this.handleEmbeddings(job.params);
          break;
        default:
          throw new Error(`Unsupported job type: ${job.type}`);
      }

      logger.info('OpenAI job completed successfully', { jobId: job.id });
      return {
        success: true,
        result: result,
        metadata: {
          provider: 'openai',
          processingTime: Date.now() - job.startTime
        }
      };

    } catch (error) {
      logger.error('OpenAI job failed', { 
        jobId: job.id, 
        error: error.message 
      });
      
      return {
        success: false,
        error: error.message,
        metadata: {
          provider: 'openai',
          processingTime: Date.now() - job.startTime
        }
      };
    }
  }

  /**
   * Handle chat completion requests
   */
  async handleChatCompletion(params) {
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: params.model || 'gpt-3.5-turbo',
        messages: params.messages,
        max_tokens: params.max_tokens,
        temperature: params.temperature,
        top_p: params.top_p,
        ...params.options
      }),
      signal: AbortSignal.timeout(this.timeout)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    return await response.json();
  }

  /**
   * Handle image generation requests
   */
  async handleImageGeneration(params) {
    const response = await fetch(`${this.baseURL}/images/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: params.model || 'dall-e-3',
        prompt: params.prompt,
        n: params.n || 1,
        size: params.size || '1024x1024',
        quality: params.quality || 'standard',
        ...params.options
      }),
      signal: AbortSignal.timeout(this.timeout)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    return await response.json();
  }

  /**
   * Handle embeddings requests
   */
  async handleEmbeddings(params) {
    const response = await fetch(`${this.baseURL}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: params.model || 'text-embedding-ada-002',
        input: params.input,
        ...params.options
      }),
      signal: AbortSignal.timeout(this.timeout)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    return await response.json();
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const response = await fetch(`${this.baseURL}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        signal: AbortSignal.timeout(5000)
      });

      return {
        healthy: response.ok,
        status: response.status,
        provider: 'openai'
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        provider: 'openai'
      };
    }
  }
}

export default OpenAIConnector;