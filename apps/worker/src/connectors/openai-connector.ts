// OpenAI Connector Base Class
// Abstracts common OpenAI SDK patterns for text, image, and other API endpoints

import OpenAI from 'openai';
import { BaseConnector } from './base-connector.js';
import {
  JobData,
  JobResult,
  ServiceInfo,
  HealthCheckClass,
  logger,
  ProgressCallback,
  ConnectorConfig,
} from '@emp/core';

export interface OpenAIConnectorConfig extends ConnectorConfig {
  openai_settings: {
    api_key: string;
    base_url: string;
    default_model: string;
    timeout_seconds: number;
    retry_attempts: number;
    model_filter?: (model: OpenAI.Model) => boolean;
    supported_formats?: string[];
    features?: string[];
  };
}

/**
 * Base class for OpenAI-based connectors (text, image, etc.)
 * Handles common OpenAI SDK initialization, health checks, and model management
 */
export abstract class OpenAIConnector extends BaseConnector {
  protected client: OpenAI | null = null;
  protected openaiConfig: OpenAIConnectorConfig;

  constructor(
    connectorId: string,
    serviceType: string,
    envPrefix: string, // e.g., 'OPENAI_TEXT', 'OPENAI_IMAGE'
    defaultModel: string,
    additionalConfig: Partial<OpenAIConnectorConfig> = {}
  ) {
    // Build base configuration from environment variables
    const baseConfig = {
      connector_id: connectorId,
      service_type: serviceType,
      base_url: process.env[`${envPrefix}_BASE_URL`] || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      timeout_seconds: parseInt(process.env[`${envPrefix}_TIMEOUT_SECONDS`] || process.env.OPENAI_TIMEOUT_SECONDS || '120'),
      retry_attempts: parseInt(process.env[`${envPrefix}_RETRY_ATTEMPTS`] || process.env.OPENAI_RETRY_ATTEMPTS || '3'),
      retry_delay_seconds: parseInt(process.env[`${envPrefix}_RETRY_DELAY_SECONDS`] || process.env.OPENAI_RETRY_DELAY_SECONDS || '5'),
      health_check_interval_seconds: parseInt(process.env[`${envPrefix}_HEALTH_CHECK_INTERVAL`] || process.env.OPENAI_HEALTH_CHECK_INTERVAL || '120'),
      max_concurrent_jobs: parseInt(process.env[`${envPrefix}_MAX_CONCURRENT_JOBS`] || '3'),
      ...additionalConfig,
    };

    // Build OpenAI-specific configuration
    const config: OpenAIConnectorConfig = {
      ...baseConfig,
      openai_settings: {
        api_key: process.env[`${envPrefix}_API_KEY`] || process.env.OPENAI_API_KEY || '',
        base_url: process.env[`${envPrefix}_BASE_URL`] || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        default_model: process.env[`${envPrefix}_MODEL`] || defaultModel,
        timeout_seconds: parseInt(process.env[`${envPrefix}_TIMEOUT_SECONDS`] || process.env.OPENAI_TIMEOUT_SECONDS || '120'),
        retry_attempts: parseInt(process.env[`${envPrefix}_RETRY_ATTEMPTS`] || process.env.OPENAI_RETRY_ATTEMPTS || '3'),
        ...((additionalConfig as any).openai_settings || {}),
      },
    };

    super(connectorId, config);
    this.openaiConfig = config;

    if (!this.openaiConfig.openai_settings.api_key) {
      throw new Error(`${connectorId} requires ${envPrefix}_API_KEY or OPENAI_API_KEY environment variable`);
    }

    logger.info(
      `OpenAI ${serviceType} connector ${connectorId} initialized with model ${this.openaiConfig.openai_settings.default_model}`
    );
  }

  /**
   * Generate environment variable requirements for this connector type
   * Note: This is a helper method, subclasses should implement getRequiredEnvVars() without parameters
   */
  static generateEnvVarsForPrefix(envPrefix: string): Record<string, string> {
    return {
      [`${envPrefix}_API_KEY`]: `\${${envPrefix}_API_KEY:-\${OPENAI_API_KEY:-}}`,
      [`${envPrefix}_BASE_URL`]: `\${${envPrefix}_BASE_URL:-\${OPENAI_BASE_URL:-https://api.openai.com/v1}}`,
      [`${envPrefix}_MODEL`]: `\${${envPrefix}_MODEL:-}`,
      [`${envPrefix}_TIMEOUT_SECONDS`]: `\${${envPrefix}_TIMEOUT_SECONDS:-\${OPENAI_TIMEOUT_SECONDS:-120}}`,
      [`${envPrefix}_RETRY_ATTEMPTS`]: `\${${envPrefix}_RETRY_ATTEMPTS:-\${OPENAI_RETRY_ATTEMPTS:-3}}`,
      [`${envPrefix}_RETRY_DELAY_SECONDS`]: `\${${envPrefix}_RETRY_DELAY_SECONDS:-\${OPENAI_RETRY_DELAY_SECONDS:-5}}`,
      [`${envPrefix}_HEALTH_CHECK_INTERVAL`]: `\${${envPrefix}_HEALTH_CHECK_INTERVAL:-\${OPENAI_HEALTH_CHECK_INTERVAL:-120}}`,
      [`${envPrefix}_MAX_CONCURRENT_JOBS`]: `\${${envPrefix}_MAX_CONCURRENT_JOBS:-3}`,
    };
  }

  async initializeService(): Promise<void> {
    try {
      this.client = new OpenAI({
        apiKey: this.openaiConfig.openai_settings.api_key,
        baseURL: this.openaiConfig.openai_settings.base_url,
        timeout: this.openaiConfig.openai_settings.timeout_seconds * 1000,
        maxRetries: this.openaiConfig.openai_settings.retry_attempts,
      });

      // Test the connection
      await this.checkHealth();

      this.currentStatus = 'idle';
      logger.info(`OpenAI connector ${this.connector_id} initialized successfully`);
    } catch (error) {
      this.currentStatus = 'error';
      throw new Error(`Failed to initialize OpenAI connector: ${error.message}`);
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
      logger.warn(`OpenAI connector health check failed: ${error.message}`);
      return false;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      if (!this.client) {
        return [this.openaiConfig.openai_settings.default_model];
      }

      const models = await this.client.models.list();
      let filteredModels = models.data;

      // Apply model filter if provided
      if (this.openaiConfig.openai_settings.model_filter) {
        filteredModels = models.data.filter(this.openaiConfig.openai_settings.model_filter);
      }

      return filteredModels.map(model => model.id);
    } catch (error) {
      logger.warn(`Failed to fetch OpenAI models: ${error.message}`);
      return [this.openaiConfig.openai_settings.default_model];
    }
  }

  protected getRequiredHealthCheckClass() {
    // API-only services use MINIMAL health checking (no job status query required)
    return HealthCheckClass.MINIMAL;
  }

  async getServiceInfo(): Promise<ServiceInfo> {
    const models = await this.getAvailableModels();

    return {
      service_name: `OpenAI ${this.service_type}`,
      service_version: this.version,
      base_url: this.openaiConfig.openai_settings.base_url,
      status:
        this.currentStatus === 'idle' || this.currentStatus === 'active'
          ? 'online'
          : this.currentStatus === 'offline'
            ? 'offline'
            : 'error',
      capabilities: {
        supported_formats: this.openaiConfig.openai_settings.supported_formats || [],
        supported_models: models,
        features: this.openaiConfig.openai_settings.features || [],
        concurrent_jobs: this.config.max_concurrent_jobs,
      },
    };
  }

  async canProcessJob(jobData: JobData): Promise<boolean> {
    const payload = jobData.payload as any;

    // Check if model is supported (if specified)
    if (payload.model) {
      const availableModels = await this.getAvailableModels();
      if (!availableModels.includes(payload.model)) {
        return false;
      }
    }

    // Delegate to subclass for service-specific validation
    return this.canProcessJobImpl(jobData);
  }

  /**
   * Create OpenAI client with custom API key if provided in job payload
   */
  protected getClientForJob(jobData: JobData): OpenAI {
    const payload = jobData.payload as any;
    
    // Use custom API key if provided, otherwise use default client
    if (payload.api_key && payload.api_key.trim()) {
      // Create a temporary client with the custom API key
      return new OpenAI({
        apiKey: payload.api_key.trim(),
        baseURL: this.openaiConfig.openai_settings.base_url,
        timeout: this.openaiConfig.openai_settings.timeout_seconds * 1000,
        maxRetries: this.openaiConfig.openai_settings.retry_attempts,
      });
    } else if (!this.client) {
      throw new Error('OpenAI client not initialized and no API key provided');
    }

    return this.client;
  }

  /**
   * Helper for progress reporting during streaming operations
   */
  protected async reportProgress(
    jobId: string,
    progress: number,
    message: string,
    step: string,
    progressCallback?: ProgressCallback,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (progressCallback) {
      await progressCallback({
        job_id: jobId,
        progress,
        message,
        current_step: step,
        metadata,
      });
    }
  }

  async cleanupService(): Promise<void> {
    this.client = null;
    this.currentStatus = 'offline';
    logger.info(`OpenAI connector ${this.connector_id} cleaned up`);
  }

  async cancelJob(jobId: string): Promise<void> {
    // OpenAI doesn't support job cancellation
    // For API calls, jobs are typically short-lived
    logger.info(
      `Job cancellation requested for ${jobId} (OpenAI jobs cannot be cancelled once started)`
    );
  }

  async updateConfiguration(config: any): Promise<void> {
    // Update configuration if needed
    logger.info(`Configuration update requested for OpenAI connector ${this.connector_id}`);
  }

  getConfiguration(): any {
    return {
      connector_id: this.connector_id,
      service_type: this.service_type,
      model: this.openaiConfig.openai_settings.default_model,
      max_concurrent_jobs: this.config.max_concurrent_jobs,
      ...this.getConfigurationImpl(),
    };
  }

  // Abstract methods for subclasses to implement
  abstract canProcessJobImpl(jobData: JobData): Promise<boolean>;
  abstract getConfigurationImpl(): Record<string, any>;
}