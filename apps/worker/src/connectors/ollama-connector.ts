// Ollama Connector - GPU-based local LLM worker
// Uses Ollama's REST API for text generation, chat completion, and embeddings

import { HTTPConnector, HTTPConnectorConfig } from './protocol/http-connector.js';
import { JobData, JobResult, ProgressCallback, ServiceInfo, logger, HealthCheckCapabilities, ServiceJobStatus, ServiceSupportValidation, ServiceCapabilities } from '@emp/core';
import { AxiosResponse } from 'axios';
import { AssetSaver } from './asset-saver.js';

interface OllamaModel {
  name: string;
  model: string;
  size: number;
  digest: string;
  details: {
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
  modified_at: string;
}

interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  template?: string;
  context?: number[];
  stream?: boolean;
  raw?: boolean;
  format?: 'json';
  images?: string[]; // base64 encoded images for multimodal models
  options?: {
    temperature?: number;
    top_k?: number;
    top_p?: number;
    num_predict?: number;
    num_ctx?: number;
    repeat_penalty?: number;
    stop?: string[];
  };
}

interface OllamaChatRequest {
  model: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    images?: string[]; // base64 encoded images
  }>;
  stream?: boolean;
  format?: 'json';
  options?: {
    temperature?: number;
    top_k?: number;
    top_p?: number;
    num_predict?: number;
    num_ctx?: number;
    repeat_penalty?: number;
    stop?: string[];
  };
}

interface OllamaEmbeddingRequest {
  model: string;
  prompt: string;
}

interface OllamaResponse {
  model: string;
  created_at: string;
  response?: string;
  message?: {
    role: string;
    content: string;
  };
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export class OllamaConnector extends HTTPConnector {
  service_type = 'ollama' as const;
  version = '1.0.0';

  private defaultModel: string;
  private availableModels: OllamaModel[] = [];
  private lastModelCheck: number = 0;
  private modelCheckInterval: number = 300000; // 5 minutes

  constructor(connectorId: string = 'ollama-gpu-worker') {
    const host = process.env.OLLAMA_HOST || 'localhost';
    const port = process.env.OLLAMA_PORT || '11434';
    const baseUrl = `http://${host}:${port}`;

    const config: HTTPConnectorConfig = {
      connector_id: connectorId,
      service_type: 'ollama',
      base_url: baseUrl,
      timeout_seconds: parseInt(process.env.OLLAMA_TIMEOUT_SECONDS || '300'),
      retry_attempts: parseInt(process.env.OLLAMA_RETRY_ATTEMPTS || '3'),
      retry_delay_seconds: parseInt(process.env.OLLAMA_RETRY_DELAY_SECONDS || '2'),
      health_check_interval_seconds: 30,
      max_concurrent_jobs: parseInt(process.env.OLLAMA_MAX_CONCURRENT_JOBS || '2'), // GPU workers typically handle fewer concurrent jobs

      // HTTP client configuration
      request_timeout_ms: parseInt(process.env.OLLAMA_REQUEST_TIMEOUT_MS || '300000'), // 5 minutes for large models
      user_agent: 'emp-ollama-worker/1.0.0',
      accept_header: 'application/json',
      content_type: 'application/json',

      // No authentication typically required for local Ollama
      auth: {
        type: 'none'
      },

      // Ollama specific settings
      keep_alive: true,
      connection_pool_size: 3,
      follow_redirects: true,
      max_redirects: 3,
    };

    super(connectorId, config);

    this.defaultModel = process.env.OLLAMA_DEFAULT_MODEL || 'llama3.2';

    logger.info(`🦙 Ollama Connector initialized:`, {
      host,
      port,
      baseUrl,
      defaultModel: this.defaultModel,
      maxConcurrentJobs: config.max_concurrent_jobs
    });

    // Load available models on startup
    this.refreshAvailableModels().catch(error => {
      logger.warn(`Failed to load Ollama models on startup: ${error.message}`);
    });
  }

  /**
   * Get required environment variables for Ollama worker
   */
  static getRequiredEnvVars(): Record<string, string> {
    return {
      ...super.getRequiredEnvVars(),
      'OLLAMA_HOST': '${OLLAMA_HOST:-localhost}',
      'OLLAMA_PORT': '${OLLAMA_PORT:-11434}',
      'OLLAMA_DEFAULT_MODEL': '${OLLAMA_DEFAULT_MODEL:-llama3.2}',
      'OLLAMA_TIMEOUT_SECONDS': '${OLLAMA_TIMEOUT_SECONDS:-300}',
      'OLLAMA_MAX_CONCURRENT_JOBS': '${OLLAMA_MAX_CONCURRENT_JOBS:-2}',
      'OLLAMA_REQUEST_TIMEOUT_MS': '${OLLAMA_REQUEST_TIMEOUT_MS:-300000}',
      // Add asset saving requirements
      ...AssetSaver.getBaseRequiredEnvVars(),
    };
  }

  async getServiceInfo(): Promise<ServiceInfo> {
    try {
      await this.refreshAvailableModels();

      return {
        service_name: 'Ollama Local LLM Service',
        service_version: this.version,
        base_url: this.config.base_url,
        status: 'online',
        capabilities: {
          supported_formats: ['text', 'json'],
          supported_models: this.availableModels.map(m => m.name),
          features: ['text_generation', 'chat_completion', 'embeddings', 'multimodal'],
          hardware_acceleration: ['gpu', 'cpu'],
          concurrent_jobs: this.config.max_concurrent_jobs,
        },
        resource_usage: {
          cpu_usage: 0,
          memory_usage_mb: 0,
          gpu_usage: 0,
          gpu_memory_usage_mb: 0,
        },
        queue_info: {
          pending_jobs: 0,
          processing_jobs: 0,
          average_processing_time: 30000, // 30 seconds estimate
        },
      };
    } catch (error) {
      logger.error(`Failed to get Ollama service info: ${error.message}`);
      return {
        service_name: 'Ollama Local LLM Service',
        service_version: this.version,
        base_url: this.config.base_url,
        status: 'error',
        capabilities: {
          supported_formats: ['text', 'json'],
          supported_models: [],
          features: ['text_generation', 'chat_completion', 'embeddings', 'multimodal'],
          hardware_acceleration: ['gpu', 'cpu'],
          concurrent_jobs: this.config.max_concurrent_jobs,
        },
        resource_usage: {
          cpu_usage: 0,
          memory_usage_mb: 0,
          gpu_usage: 0,
          gpu_memory_usage_mb: 0,
        },
        queue_info: {
          pending_jobs: 0,
          processing_jobs: 0,
          average_processing_time: 30000,
        },
      };
    }
  }

  async checkHealthImpl(): Promise<HealthCheckCapabilities> {
    try {
      // Check if Ollama is responding
      const response = await this.httpClient.get('/api/version');

      // Try to refresh models to ensure API is fully functional
      await this.refreshAvailableModels();

      return {
        supportsBasicHealthCheck: true,
        basicHealthCheckEndpoint: '/api/version',
        supportsJobStatusQuery: false, // Ollama doesn't provide job status endpoints
        supportsJobCancellation: false, // Ollama doesn't support job cancellation
        supportsServiceRestart: false, // Would require system-level restart
        supportsQueueIntrospection: false, // Ollama doesn't expose queue info
        customHealthCheckRequirements: ['models_available'],
        minimumApiVersion: '0.1.0',
      };
    } catch (error) {
      logger.error(`Ollama health check failed: ${error.message}`);
      return {
        supportsBasicHealthCheck: false,
        supportsJobStatusQuery: false,
        supportsJobCancellation: false,
        supportsServiceRestart: false,
        supportsQueueIntrospection: false,
        customHealthCheckRequirements: [],
      };
    }
  }

  async canProcessJob(jobData: JobData): Promise<boolean> {
    const payload = jobData.payload as any;

    // Check if this is a supported job type
    const jobType = payload.job_type || payload.operation || 'generate';
    const supportedTypes = ['generate', 'chat', 'embeddings', 'text_generation', 'chat_completion'];

    if (!supportedTypes.includes(jobType)) {
      return false;
    }

    // Check if we have required input
    const hasPrompt = !!(payload.prompt || payload.messages);
    if (!hasPrompt) {
      return false;
    }

    // Check if requested model is available (if specified)
    const requestedModel = payload.model || this.defaultModel;
    if (this.availableModels.length > 0) {
      const hasModel = this.availableModels.some(m => m.name === requestedModel || m.model === requestedModel);
      if (!hasModel) {
        logger.warn(`Requested model '${requestedModel}' not available. Available models: ${this.availableModels.map(m => m.name).join(', ')}`);
        return false;
      }
    }

    return true;
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      await this.refreshAvailableModels();
      return this.availableModels.map(model => model.name);
    } catch (error) {
      logger.warn(`Failed to get available Ollama models: ${error.message}`);
      return []; // Return empty array if models can't be fetched
    }
  }

  /**
   * Override processJob to add cloud storage integration (like OpenAI responses connector)
   */
  async processJob(jobData: JobData, progressCallback?: ProgressCallback): Promise<JobResult> {
    logger.info(`Processing Ollama job ${jobData.id}`);

    // Use HTTPConnector's processing first
    const result = await super.processJob(jobData, progressCallback);

    if (result.success && result.data) {
      // Save text assets to cloud storage and add URLs
      try {
        const resultData = result.data as any;

        // Save text content if present
        const textContent = resultData.text || resultData.message?.content;
        if (textContent && textContent.trim()) {
          const savedAsset = await this.saveResponseToStorage(textContent, jobData);
          if (savedAsset) {
            // Add saved asset info to metadata
            if (!resultData.metadata) resultData.metadata = {};
            resultData.metadata.saved_asset = savedAsset;
            logger.info(`Ollama response saved to cloud storage: ${savedAsset.fileName}`);
          }
        }

      } catch (error) {
        logger.error(`Failed to process assets for Ollama job ${jobData.id}: ${error.message}`);
        // Don't fail the job if storage fails - just log the error
      }
    }

    return result;
  }

  /**
   * Save Ollama response text to cloud storage (like OpenAI responses connector)
   */
  private async saveResponseToStorage(textContent: string, jobData: JobData): Promise<any> {
    try {
      if (!textContent.trim()) {
        logger.warn(`No text content to save for job ${jobData.id}`);
        return null;
      }

      // Convert text to base64 for storage
      const base64Content = Buffer.from(textContent.trim(), 'utf8').toString('base64');

      // Save to cloud storage using AssetSaver
      const savedAsset = await AssetSaver.saveAssetToCloud(
        base64Content,
        jobData.id,
        jobData,
        'text/plain'
      );

      return savedAsset;

    } catch (error) {
      logger.error(`Failed to save Ollama response to storage for job ${jobData.id}: ${error.message}`);
      return null;
    }
  }

  async processJobImpl(jobData: JobData, progressCallback?: ProgressCallback): Promise<JobResult> {
    const payload = jobData.payload as any;
    const jobType = payload.job_type || payload.operation || 'generate';
    const model = payload.model || this.defaultModel;

    try {
      logger.info(`🦙 Processing Ollama ${jobType} job with model ${model}`);

      if (progressCallback) {
        await progressCallback({
          job_id: jobData.id,
          progress: 10,
          message: `Starting ${jobType} with ${model}...`,
          current_step: 'initializing'
        });
      }

      let result: JobResult;

      switch (jobType) {
        case 'generate':
        case 'text_generation':
          result = await this.processGenerateJob(jobData, model, progressCallback);
          break;
        case 'chat':
        case 'chat_completion':
          result = await this.processChatJob(jobData, model, progressCallback);
          break;
        case 'embeddings':
          result = await this.processEmbeddingsJob(jobData, model, progressCallback);
          break;
        default:
          throw new Error(`Unsupported job type: ${jobType}`);
      }

      if (progressCallback) {
        await progressCallback({
          job_id: jobData.id,
          progress: 100,
          message: 'Job completed successfully',
          current_step: 'completed'
        });
      }

      return result;

    } catch (error) {
      logger.error(`🦙 Ollama job processing failed: ${error.message}`);
      throw error;
    }
  }

  private async processGenerateJob(jobData: JobData, model: string, progressCallback?: ProgressCallback): Promise<JobResult> {
    const payload = jobData.payload as any;

    const request: OllamaGenerateRequest = {
      model,
      prompt: payload.prompt,
      system: payload.system_prompt || payload.system,
      stream: false, // We'll handle streaming separately if needed
      options: {
        temperature: payload.temperature,
        top_k: payload.top_k,
        top_p: payload.top_p,
        num_predict: payload.max_tokens || payload.num_predict,
        num_ctx: payload.context_length || payload.num_ctx,
        repeat_penalty: payload.repeat_penalty,
        stop: payload.stop,
      },
    };

    // Remove undefined values
    Object.keys(request.options!).forEach(key => {
      if (request.options![key] === undefined) {
        delete request.options![key];
      }
    });

    if (progressCallback) {
      await progressCallback({
        job_id: jobData.id,
        progress: 30,
        message: 'Sending request to Ollama...',
        current_step: 'processing'
      });
    }

    const startTime = Date.now();
    const response = await this.httpClient.post('/api/generate', request);
    const endTime = Date.now();

    const ollamaResponse = response.data as OllamaResponse;

    if (!ollamaResponse.response) {
      throw new Error('No response generated from Ollama');
    }

    return {
      success: true,
      data: {
        text: ollamaResponse.response,
        model_used: ollamaResponse.model,
        context: ollamaResponse.context,
      },
      processing_time_ms: endTime - startTime,
      metadata: {
        model: ollamaResponse.model,
        service: 'ollama',
        tokens: {
          prompt_tokens: ollamaResponse.prompt_eval_count || 0,
          completion_tokens: ollamaResponse.eval_count || 0,
          total_tokens: (ollamaResponse.prompt_eval_count || 0) + (ollamaResponse.eval_count || 0),
        },
        timing: {
          total_duration: ollamaResponse.total_duration,
          load_duration: ollamaResponse.load_duration,
          prompt_eval_duration: ollamaResponse.prompt_eval_duration,
          eval_duration: ollamaResponse.eval_duration,
        },
      },
      service_metadata: {
        service_version: this.version,
        service_type: this.service_type,
        model_used: ollamaResponse.model,
      },
    };
  }

  private async processChatJob(jobData: JobData, model: string, progressCallback?: ProgressCallback): Promise<JobResult> {
    const payload = jobData.payload as any;

    let messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;

    if (payload.messages) {
      messages = payload.messages;
    } else if (payload.prompt) {
      messages = [
        { role: 'user', content: payload.prompt }
      ];

      if (payload.system_prompt || payload.system) {
        messages.unshift({ role: 'system', content: payload.system_prompt || payload.system });
      }
    } else {
      throw new Error('Chat job must contain either "messages" or "prompt" field');
    }

    const request: OllamaChatRequest = {
      model,
      messages,
      stream: false,
      options: {
        temperature: payload.temperature,
        top_k: payload.top_k,
        top_p: payload.top_p,
        num_predict: payload.max_tokens || payload.num_predict,
        num_ctx: payload.context_length || payload.num_ctx,
        repeat_penalty: payload.repeat_penalty,
        stop: payload.stop,
      },
    };

    // Remove undefined values
    Object.keys(request.options!).forEach(key => {
      if (request.options![key] === undefined) {
        delete request.options![key];
      }
    });

    if (progressCallback) {
      await progressCallback({
        job_id: jobData.id,
        progress: 30,
        message: 'Sending chat request to Ollama...',
        current_step: 'processing'
      });
    }

    const startTime = Date.now();
    const response = await this.httpClient.post('/api/chat', request);
    const endTime = Date.now();

    const ollamaResponse = response.data as OllamaResponse;

    if (!ollamaResponse.message?.content) {
      throw new Error('No response generated from Ollama chat');
    }

    return {
      success: true,
      data: {
        message: ollamaResponse.message,
        text: ollamaResponse.message.content,
        model_used: ollamaResponse.model,
      },
      processing_time_ms: endTime - startTime,
      metadata: {
        model: ollamaResponse.model,
        service: 'ollama_chat',
        tokens: {
          prompt_tokens: ollamaResponse.prompt_eval_count || 0,
          completion_tokens: ollamaResponse.eval_count || 0,
          total_tokens: (ollamaResponse.prompt_eval_count || 0) + (ollamaResponse.eval_count || 0),
        },
        timing: {
          total_duration: ollamaResponse.total_duration,
          load_duration: ollamaResponse.load_duration,
          prompt_eval_duration: ollamaResponse.prompt_eval_duration,
          eval_duration: ollamaResponse.eval_duration,
        },
      },
      service_metadata: {
        service_version: this.version,
        service_type: this.service_type,
        model_used: ollamaResponse.model,
      },
    };
  }

  private async processEmbeddingsJob(jobData: JobData, model: string, progressCallback?: ProgressCallback): Promise<JobResult> {
    const payload = jobData.payload as any;

    const request: OllamaEmbeddingRequest = {
      model,
      prompt: payload.prompt || payload.text || payload.input,
    };

    if (!request.prompt) {
      throw new Error('Embeddings job must contain "prompt", "text", or "input" field');
    }

    if (progressCallback) {
      await progressCallback({
        job_id: jobData.id,
        progress: 30,
        message: 'Generating embeddings with Ollama...',
        current_step: 'processing'
      });
    }

    const startTime = Date.now();
    const response = await this.httpClient.post('/api/embeddings', request);
    const endTime = Date.now();

    const embeddings = response.data.embedding;

    if (!embeddings || !Array.isArray(embeddings)) {
      throw new Error('No embeddings generated from Ollama');
    }

    return {
      success: true,
      data: {
        embeddings,
        model_used: model,
        dimensions: embeddings.length,
      },
      processing_time_ms: endTime - startTime,
      metadata: {
        model,
        service: 'ollama_embeddings',
        embedding_dimensions: embeddings.length,
      },
      service_metadata: {
        service_version: this.version,
        service_type: this.service_type,
        model_used: model,
      },
    };
  }

  private async refreshAvailableModels(): Promise<void> {
    const now = Date.now();

    // Only refresh if it's been more than modelCheckInterval since last check
    if (now - this.lastModelCheck < this.modelCheckInterval) {
      return;
    }

    try {
      const response = await this.httpClient.get('/api/tags');
      this.availableModels = response.data.models || [];
      this.lastModelCheck = now;

      logger.debug(`🦙 Refreshed Ollama models: ${this.availableModels.map(m => m.name).join(', ')}`);
    } catch (error) {
      logger.warn(`Failed to refresh Ollama models: ${error.message}`);
      // Don't throw - we can still operate with cached models or default behavior
    }
  }

  getConfigurationImpl(): Record<string, any> {
    return {
      default_model: this.defaultModel,
      available_models: this.availableModels.map(m => m.name),
      base_url: this.config.base_url,
      max_concurrent_jobs: this.config.max_concurrent_jobs,
      timeout_seconds: this.config.timeout_seconds,
    };
  }

  // Abstract method implementations required by HTTPConnector

  protected buildRequestPayload(jobData: JobData): any {
    const payload = jobData.payload as any;
    const jobType = payload.job_type || payload.operation || 'generate';
    const model = payload.model || this.defaultModel;

    switch (jobType) {
      case 'generate':
      case 'text_generation':
        return {
          model,
          prompt: payload.prompt,
          system: payload.system_prompt || payload.system,
          stream: false,
          options: {
            temperature: payload.temperature,
            top_k: payload.top_k,
            top_p: payload.top_p,
            num_predict: payload.max_tokens || payload.num_predict,
            num_ctx: payload.context_length || payload.num_ctx,
            repeat_penalty: payload.repeat_penalty,
            stop: payload.stop,
          },
        };

      case 'chat':
      case 'chat_completion':
        let messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;

        if (payload.messages) {
          messages = payload.messages;
        } else if (payload.prompt) {
          messages = [{ role: 'user', content: payload.prompt }];
          if (payload.system_prompt || payload.system) {
            messages.unshift({ role: 'system', content: payload.system_prompt || payload.system });
          }
        } else {
          throw new Error('Chat job must contain either "messages" or "prompt" field');
        }

        return {
          model,
          messages,
          stream: false,
          options: {
            temperature: payload.temperature,
            top_k: payload.top_k,
            top_p: payload.top_p,
            num_predict: payload.max_tokens || payload.num_predict,
            num_ctx: payload.context_length || payload.num_ctx,
            repeat_penalty: payload.repeat_penalty,
            stop: payload.stop,
          },
        };

      case 'embeddings':
        return {
          model,
          prompt: payload.prompt || payload.text || payload.input,
        };

      default:
        throw new Error(`Unsupported job type: ${jobType}`);
    }
  }

  protected parseResponse(response: AxiosResponse, jobData: JobData): JobResult {
    const payload = jobData.payload as any;
    const jobType = payload.job_type || payload.operation || 'generate';
    const ollamaResponse = response.data as OllamaResponse;

    switch (jobType) {
      case 'generate':
      case 'text_generation':
        if (!ollamaResponse.response) {
          throw new Error('No response generated from Ollama');
        }
        return {
          success: true,
          data: {
            text: ollamaResponse.response,
            model_used: ollamaResponse.model,
            context: ollamaResponse.context,
          },
          processing_time_ms: 0, // Will be calculated by HTTPConnector
          metadata: {
            model: ollamaResponse.model,
            service: 'ollama',
            tokens: {
              prompt_tokens: ollamaResponse.prompt_eval_count || 0,
              completion_tokens: ollamaResponse.eval_count || 0,
              total_tokens: (ollamaResponse.prompt_eval_count || 0) + (ollamaResponse.eval_count || 0),
            },
            timing: {
              total_duration: ollamaResponse.total_duration,
              load_duration: ollamaResponse.load_duration,
              prompt_eval_duration: ollamaResponse.prompt_eval_duration,
              eval_duration: ollamaResponse.eval_duration,
            },
          },
          service_metadata: {
            service_version: this.version,
            service_type: this.service_type,
            model_used: ollamaResponse.model,
          },
        };

      case 'chat':
      case 'chat_completion':
        if (!ollamaResponse.message?.content) {
          throw new Error('No response generated from Ollama chat');
        }
        return {
          success: true,
          data: {
            message: ollamaResponse.message,
            text: ollamaResponse.message.content,
            model_used: ollamaResponse.model,
          },
          processing_time_ms: 0, // Will be calculated by HTTPConnector
          metadata: {
            model: ollamaResponse.model,
            service: 'ollama_chat',
            tokens: {
              prompt_tokens: ollamaResponse.prompt_eval_count || 0,
              completion_tokens: ollamaResponse.eval_count || 0,
              total_tokens: (ollamaResponse.prompt_eval_count || 0) + (ollamaResponse.eval_count || 0),
            },
            timing: {
              total_duration: ollamaResponse.total_duration,
              load_duration: ollamaResponse.load_duration,
              prompt_eval_duration: ollamaResponse.prompt_eval_duration,
              eval_duration: ollamaResponse.eval_duration,
            },
          },
          service_metadata: {
            service_version: this.version,
            service_type: this.service_type,
            model_used: ollamaResponse.model,
          },
        };

      case 'embeddings':
        const embeddings = response.data.embedding;
        if (!embeddings || !Array.isArray(embeddings)) {
          throw new Error('No embeddings generated from Ollama');
        }
        return {
          success: true,
          data: {
            embeddings,
            model_used: payload.model || this.defaultModel,
            dimensions: embeddings.length,
          },
          processing_time_ms: 0, // Will be calculated by HTTPConnector
          metadata: {
            model: payload.model || this.defaultModel,
            service: 'ollama_embeddings',
            embedding_dimensions: embeddings.length,
          },
          service_metadata: {
            service_version: this.version,
            service_type: this.service_type,
            model_used: payload.model || this.defaultModel,
          },
        };

      default:
        throw new Error(`Unsupported job type: ${jobType}`);
    }
  }

  protected validateServiceResponse(response: AxiosResponse): boolean {
    // Basic validation - Ollama should return 200 OK with valid JSON
    if (response.status !== 200) {
      return false;
    }

    const data = response.data;
    if (!data || typeof data !== 'object') {
      return false;
    }

    // For generate/chat responses, should have either 'response' or 'message'
    if (data.response !== undefined || data.message !== undefined) {
      return true;
    }

    // For embeddings, should have 'embedding' array
    if (Array.isArray(data.embedding)) {
      return true;
    }

    // For health checks and model lists
    if (data.version !== undefined || Array.isArray(data.models)) {
      return true;
    }

    return false;
  }

  protected getJobEndpoint(jobData: JobData): string {
    const payload = jobData.payload as any;
    const jobType = payload.job_type || payload.operation || 'generate';

    switch (jobType) {
      case 'generate':
      case 'text_generation':
        return '/api/generate';
      case 'chat':
      case 'chat_completion':
        return '/api/chat';
      case 'embeddings':
        return '/api/embeddings';
      default:
        throw new Error(`Unsupported job type: ${jobType}`);
    }
  }
}