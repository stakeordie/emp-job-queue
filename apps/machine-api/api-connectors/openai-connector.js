/**
 * OpenAI API Connector
 * Handles text generation, image generation, and other OpenAI API calls
 */

import OpenAI from 'openai';
import { createLogger } from '../../../machine-base/src/utils/logger.js';

const logger = createLogger('openai-connector');

export class OpenAIConnector {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    this.baseURL = config.baseURL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    this.maxConcurrentJobs = parseInt(config.maxConcurrentJobs || process.env.OPENAI_MAX_CONCURRENT_JOBS || '2');
    
    if (!this.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseURL
    });

    this.activeJobs = new Map();
    this.isRunning = false;
  }

  async start() {
    logger.info('Starting OpenAI connector...', {
      baseURL: this.baseURL,
      maxConcurrentJobs: this.maxConcurrentJobs
    });
    
    this.isRunning = true;
    
    // Test connection
    try {
      await this.client.models.list();
      logger.info('OpenAI connector started successfully');
    } catch (error) {
      logger.error('Failed to connect to OpenAI API:', error);
      throw error;
    }
  }

  async stop() {
    logger.info('Stopping OpenAI connector...');
    this.isRunning = false;
    
    // Wait for active jobs to complete
    const activeJobIds = Array.from(this.activeJobs.keys());
    if (activeJobIds.length > 0) {
      logger.info(`Waiting for ${activeJobIds.length} active jobs to complete...`);
      await Promise.all(Array.from(this.activeJobs.values()));
    }
    
    logger.info('OpenAI connector stopped');
  }

  async processJob(job) {
    if (this.activeJobs.size >= this.maxConcurrentJobs) {
      throw new Error(`Maximum concurrent jobs reached (${this.maxConcurrentJobs})`);
    }

    const jobId = job.id || `job-${Date.now()}`;
    logger.info(`Processing OpenAI job: ${jobId}`, { jobType: job.type });

    const jobPromise = this._executeJob(job);
    this.activeJobs.set(jobId, jobPromise);

    try {
      const result = await jobPromise;
      this.activeJobs.delete(jobId);
      return result;
    } catch (error) {
      this.activeJobs.delete(jobId);
      throw error;
    }
  }

  async _executeJob(job) {
    const startTime = Date.now();
    
    try {
      let result;
      
      switch (job.type) {
        case 'text-generation':
          result = await this._handleTextGeneration(job);
          break;
          
        case 'image-generation':
          result = await this._handleImageGeneration(job);
          break;
          
        case 'chat-completion':
          result = await this._handleChatCompletion(job);
          break;
          
        case 'embeddings':
          result = await this._handleEmbeddings(job);
          break;
          
        default:
          throw new Error(`Unsupported job type: ${job.type}`);
      }

      const duration = Date.now() - startTime;
      logger.info(`OpenAI job completed: ${job.id}`, { duration });
      
      return {
        success: true,
        result,
        duration,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`OpenAI job failed: ${job.id}`, { error: error.message, duration });
      
      return {
        success: false,
        error: error.message,
        duration,
        timestamp: new Date().toISOString()
      };
    }
  }

  async _handleTextGeneration(job) {
    const { prompt, model = 'gpt-3.5-turbo-instruct', ...options } = job.params;
    
    const response = await this.client.completions.create({
      model,
      prompt,
      max_tokens: options.max_tokens || 1000,
      temperature: options.temperature || 0.7,
      ...options
    });
    
    return {
      text: response.choices[0].text,
      usage: response.usage,
      model: response.model
    };
  }

  async _handleImageGeneration(job) {
    const { prompt, model = 'dall-e-3', ...options } = job.params;
    
    const response = await this.client.images.generate({
      model,
      prompt,
      size: options.size || '1024x1024',
      quality: options.quality || 'standard',
      n: options.n || 1,
      ...options
    });
    
    return {
      images: response.data.map(img => ({
        url: img.url,
        revised_prompt: img.revised_prompt
      }))
    };
  }

  async _handleChatCompletion(job) {
    const { messages, model = 'gpt-3.5-turbo', ...options } = job.params;
    
    const response = await this.client.chat.completions.create({
      model,
      messages,
      max_tokens: options.max_tokens || 1000,
      temperature: options.temperature || 0.7,
      ...options
    });
    
    return {
      message: response.choices[0].message,
      usage: response.usage,
      model: response.model
    };
  }

  async _handleEmbeddings(job) {
    const { input, model = 'text-embedding-ada-002', ...options } = job.params;
    
    const response = await this.client.embeddings.create({
      model,
      input,
      ...options
    });
    
    return {
      embeddings: response.data,
      usage: response.usage,
      model: response.model
    };
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      activeJobs: this.activeJobs.size,
      maxConcurrentJobs: this.maxConcurrentJobs,
      apiEndpoint: this.baseURL
    };
  }
}