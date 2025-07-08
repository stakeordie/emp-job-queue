// A1111 Connector - HTTP-based connection to Automatic1111 service
// Direct port from Python worker/connectors/a1111_connector.py

import axios, { AxiosInstance } from 'axios';
import {
  ConnectorInterface,
  JobData,
  JobResult,
  ProgressCallback,
  A1111ConnectorConfig,
  ServiceInfo,
} from '../../core/types/connector.js';
import { logger } from '../../core/utils/logger.js';

export class A1111Connector implements ConnectorInterface {
  connector_id: string;
  service_type = 'a1111';
  version = '1.0.0';
  private config: A1111ConnectorConfig;
  private httpClient: AxiosInstance;

  constructor(connectorId: string) {
    this.connector_id = connectorId;

    // Build configuration from environment (matching Python patterns)
    const host = process.env.WORKER_A1111_HOST || 'localhost';
    const port = parseInt(process.env.WORKER_A1111_PORT || '7860');
    const username = process.env.WORKER_A1111_USERNAME;
    const password = process.env.WORKER_A1111_PASSWORD;

    this.config = {
      connector_id: this.connector_id,
      service_type: this.service_type as 'a1111',
      base_url: `http://${host}:${port}`,
      auth:
        username && password
          ? {
              type: 'basic',
              username,
              password,
            }
          : { type: 'none' },
      timeout_seconds: parseInt(process.env.WORKER_A1111_TIMEOUT_SECONDS || '300'),
      retry_attempts: 3,
      retry_delay_seconds: 2,
      health_check_interval_seconds: 30,
      max_concurrent_jobs: parseInt(process.env.WORKER_A1111_MAX_CONCURRENT_JOBS || '1'),
      settings: {
        enable_api: process.env.WORKER_A1111_ENABLE_API !== 'false',
        save_images: process.env.WORKER_A1111_SAVE_IMAGES !== 'false',
        save_grid: process.env.WORKER_A1111_SAVE_GRID !== 'false',
        image_format: (process.env.WORKER_A1111_IMAGE_FORMAT as 'png' | 'jpg' | 'webp') || 'png',
        jpeg_quality: parseInt(process.env.WORKER_A1111_JPEG_QUALITY || '95'),
        png_compression: parseInt(process.env.WORKER_A1111_PNG_COMPRESSION || '6'),
      },
    };

    // Initialize HTTP client with authentication
    this.httpClient = axios.create({
      baseURL: this.config.base_url,
      timeout: this.config.timeout_seconds * 1000,
      headers: this.getAuthHeaders(),
    });
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (
      this.config.auth?.type === 'basic' &&
      this.config.auth.username &&
      this.config.auth.password
    ) {
      const credentials = Buffer.from(
        `${this.config.auth.username}:${this.config.auth.password}`
      ).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    }

    return headers;
  }

  async initialize(): Promise<void> {
    logger.info(`Initializing A1111 connector ${this.connector_id} at ${this.config.base_url}`);

    // Test connection
    await this.checkHealth();

    logger.info(`A1111 connector ${this.connector_id} initialized successfully`);
  }

  async cleanup(): Promise<void> {
    logger.info(`Cleaning up A1111 connector ${this.connector_id}`);
  }

  async checkHealth(): Promise<boolean> {
    try {
      // Try to get API info to check if service is running
      const response = await this.httpClient.get('/sdapi/v1/options');
      return response.status === 200;
    } catch (error) {
      logger.error(`A1111 health check failed:`, error);
      return false;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await this.httpClient.get('/sdapi/v1/sd-models');
      const models = response.data || [];

      const modelNames = models.map(model => model.title || model.model_name || 'unknown');
      logger.info(`Found ${modelNames.length} models in A1111`);

      return modelNames;
    } catch (error) {
      logger.error('Failed to get A1111 models:', error);
      return [];
    }
  }

  async getServiceInfo(): Promise<ServiceInfo> {
    try {
      const [optionsResponse, modelsResponse, progressResponse] = await Promise.allSettled([
        this.httpClient.get('/sdapi/v1/options'),
        this.httpClient.get('/sdapi/v1/sd-models'),
        this.httpClient.get('/sdapi/v1/progress'),
      ]);

      const options = optionsResponse.status === 'fulfilled' ? optionsResponse.value.data : {};
      const models = modelsResponse.status === 'fulfilled' ? modelsResponse.value.data : [];
      const progress = progressResponse.status === 'fulfilled' ? progressResponse.value.data : {};

      return {
        service_name: 'Automatic1111',
        service_version: 'unknown', // A1111 doesn't expose version easily
        base_url: this.config.base_url,
        status: 'online',
        capabilities: {
          supported_formats: ['png', 'jpg', 'webp'],
          max_resolution: {
            width: options.img2img_max_width || 2048,
            height: options.img2img_max_height || 2048,
          },
          supported_models: models.map(m => m.title || m.model_name),
          features: ['txt2img', 'img2img', 'inpainting', 'extras'],
          concurrent_jobs: this.config.max_concurrent_jobs,
        },
        queue_info: {
          pending_jobs: 0, // A1111 doesn't expose queue info
          processing_jobs: progress.active ? 1 : 0,
          average_processing_time: 0,
        },
      };
    } catch (error) {
      logger.error('Failed to get A1111 service info:', error);
      throw error;
    }
  }

  async canProcessJob(jobData: JobData): Promise<boolean> {
    return (
      jobData.type === 'a1111' &&
      (jobData.payload?.prompt !== undefined || jobData.payload?.init_images !== undefined)
    );
  }

  async processJob(jobData: JobData, progressCallback: ProgressCallback): Promise<JobResult> {
    const startTime = Date.now();
    logger.info(`Starting A1111 job ${jobData.id}`);

    try {
      // Determine job type (txt2img, img2img, etc.)
      const jobType = this.determineJobType(jobData.payload);

      // Process based on job type
      let result;
      switch (jobType) {
        case 'txt2img':
          result = await this.processTxt2Img(jobData, progressCallback);
          break;
        case 'img2img':
          result = await this.processImg2Img(jobData, progressCallback);
          break;
        default:
          throw new Error(`Unsupported A1111 job type: ${jobType}`);
      }

      const processingTime = Date.now() - startTime;

      logger.info(`A1111 job ${jobData.id} completed in ${processingTime}ms`);

      return {
        success: true,
        data: result,
        processing_time_ms: processingTime,
        output_files:
          result.images?.map((img: string, index: number) => ({
            filename: `image_${index}.png`,
            path: `output/${jobData.id}/image_${index}.png`,
            type: 'image' as const,
            size_bytes: Math.round(img.length * 0.75), // Estimate from base64
            mime_type: 'image/png',
          })) || [],
        service_metadata: {
          service_version: this.version,
          model_used: result.info?.sd_model_checkpoint || 'unknown',
          processing_stats: {
            job_type: jobType,
            seed: result.info?.seed,
            steps: result.info?.steps,
            cfg_scale: result.info?.cfg_scale,
            sampler: result.info?.sampler_name,
          },
        },
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error(`A1111 job ${jobData.id} failed:`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'A1111 processing failed',
        processing_time_ms: processingTime,
        service_metadata: {
          service_version: this.version,
        },
      };
    }
  }

  async cancelJob(jobId: string): Promise<void> {
    logger.info(`Cancelling A1111 job ${jobId}`);

    try {
      // A1111 has an interrupt endpoint
      await this.httpClient.post('/sdapi/v1/interrupt');
      logger.info(`Sent interrupt request for job ${jobId}`);
    } catch (error) {
      logger.error(`Failed to cancel A1111 job ${jobId}:`, error);
    }
  }

  private determineJobType(payload: Record<string, unknown>): string {
    if (Array.isArray(payload.init_images) && payload.init_images.length > 0) {
      return 'img2img';
    } else if (payload.prompt) {
      return 'txt2img';
    } else {
      throw new Error('Cannot determine A1111 job type from payload');
    }
  }

  private async processTxt2Img(
    jobData: JobData,
    progressCallback: ProgressCallback
  ): Promise<Record<string, unknown>> {
    const payload = {
      prompt: jobData.payload.prompt || '',
      negative_prompt: jobData.payload.negative_prompt || '',
      steps: jobData.payload.steps || 20,
      sampler_name: jobData.payload.sampler_name || 'Euler a',
      cfg_scale: jobData.payload.cfg_scale || 7,
      width: jobData.payload.width || 512,
      height: jobData.payload.height || 512,
      seed: jobData.payload.seed || -1,
      batch_size: jobData.payload.batch_size || 1,
      n_iter: jobData.payload.n_iter || 1,
      ...jobData.payload, // Allow override of any parameter
    };

    // Start progress tracking
    await progressCallback({
      job_id: jobData.id,
      progress: 10,
      message: 'Starting txt2img generation',
      current_step: 'Initializing',
    });

    // Submit generation request
    const response = await this.httpClient.post('/sdapi/v1/txt2img', payload);

    if (response.status !== 200) {
      throw new Error(`A1111 txt2img request failed with status ${response.status}`);
    }

    // Poll for completion with progress updates
    const steps = typeof payload.steps === 'number' ? payload.steps : 20;
    await this.pollForProgress(jobData.id, steps, progressCallback);

    return response.data;
  }

  private async processImg2Img(
    jobData: JobData,
    progressCallback: ProgressCallback
  ): Promise<Record<string, unknown>> {
    const payload = {
      init_images: jobData.payload.init_images || [],
      prompt: jobData.payload.prompt || '',
      negative_prompt: jobData.payload.negative_prompt || '',
      steps: jobData.payload.steps || 20,
      sampler_name: jobData.payload.sampler_name || 'Euler a',
      cfg_scale: jobData.payload.cfg_scale || 7,
      denoising_strength: jobData.payload.denoising_strength || 0.75,
      seed: jobData.payload.seed || -1,
      batch_size: jobData.payload.batch_size || 1,
      n_iter: jobData.payload.n_iter || 1,
      ...jobData.payload, // Allow override of any parameter
    };

    // Start progress tracking
    await progressCallback({
      job_id: jobData.id,
      progress: 10,
      message: 'Starting img2img generation',
      current_step: 'Initializing',
    });

    // Submit generation request
    const response = await this.httpClient.post('/sdapi/v1/img2img', payload);

    if (response.status !== 200) {
      throw new Error(`A1111 img2img request failed with status ${response.status}`);
    }

    // Poll for completion with progress updates
    const steps = typeof payload.steps === 'number' ? payload.steps : 20;
    await this.pollForProgress(jobData.id, steps, progressCallback);

    return response.data;
  }

  private async pollForProgress(
    jobId: string,
    totalSteps: number,
    progressCallback: ProgressCallback
  ): Promise<void> {
    const pollInterval = 1000; // Poll every second
    const maxPolls = 300; // Max 5 minutes
    let polls = 0;

    while (polls < maxPolls) {
      try {
        const progressResponse = await this.httpClient.get('/sdapi/v1/progress');
        const progressData = progressResponse.data;

        if (progressData.active) {
          const progress = Math.round((progressData.progress || 0) * 100);
          const currentStep = Math.round((progressData.progress || 0) * totalSteps);

          await progressCallback({
            job_id: jobId,
            progress,
            message: `Generating... Step ${currentStep}/${totalSteps}`,
            current_step: `Step ${currentStep}`,
            total_steps: totalSteps,
            estimated_completion_ms: progressData.eta_relative
              ? progressData.eta_relative * 1000
              : undefined,
          });

          if (progress >= 100) {
            break;
          }
        } else {
          // Generation completed
          await progressCallback({
            job_id: jobId,
            progress: 100,
            message: 'Generation completed',
            current_step: 'Finished',
          });
          break;
        }

        await this.sleep(pollInterval);
        polls++;
      } catch (error) {
        logger.error(`Failed to poll A1111 progress for job ${jobId}:`, error);
        break;
      }
    }

    if (polls >= maxPolls) {
      throw new Error(
        `A1111 job ${jobId} timed out after ${(maxPolls * pollInterval) / 1000} seconds`
      );
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async updateConfiguration(config: A1111ConnectorConfig): Promise<void> {
    this.config = { ...this.config, ...config };

    // Recreate HTTP client if base URL or auth changed
    if (config.base_url || config.auth) {
      this.httpClient = axios.create({
        baseURL: this.config.base_url,
        timeout: this.config.timeout_seconds * 1000,
        headers: this.getAuthHeaders(),
      });
    }

    logger.info(`Updated configuration for A1111 connector ${this.connector_id}`);
  }

  getConfiguration(): A1111ConnectorConfig {
    return { ...this.config };
  }
}
