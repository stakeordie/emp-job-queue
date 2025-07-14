// A1111 Connector - HTTP REST connection to Automatic1111 service
// Enhanced to use RestConnector for shared Redis connection and status reporting

import { JobData, JobResult, ProgressCallback, ServiceInfo, logger } from '@emp/core';
import { RestConnector, RestConnectorConfig } from './rest-connector.js';

export class A1111Connector extends RestConnector {
  service_type = 'a1111' as const;
  version = '1.0.0';

  constructor(connectorId: string) {
    // Build configuration from environment (matching Python patterns)
    const host = process.env.WORKER_A1111_HOST || 'localhost';
    const port = parseInt(process.env.WORKER_A1111_PORT || '7860');
    const username = process.env.WORKER_A1111_USERNAME;
    const password = process.env.WORKER_A1111_PASSWORD;

    const config: Partial<RestConnectorConfig> = {
      service_type: 'a1111',
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
        method: 'POST',
        response_format: 'json',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body_format: 'json',
        polling_interval_ms: 1000,
      },
    };

    super(connectorId, config);
  }

  // RestConnector overrides
  async checkHealth(): Promise<boolean> {
    try {
      // Try to get API info to check if service is running
      const response = await this.makeRequest('GET', '/sdapi/v1/options');
      return response.status >= 200 && response.status < 300;
    } catch (error) {
      logger.debug(`A1111 health check failed:`, error);
      return false;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await this.makeRequest('GET', '/sdapi/v1/sd-models');
      const models = ((await this.parseResponse(response)) as any[]) || [];

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
        this.makeRequest('GET', '/sdapi/v1/options'),
        this.makeRequest('GET', '/sdapi/v1/sd-models'),
        this.makeRequest('GET', '/sdapi/v1/progress'),
      ]);

      const options =
        optionsResponse.status === 'fulfilled'
          ? ((await this.parseResponse(optionsResponse.value)) as any)
          : {};
      const models =
        modelsResponse.status === 'fulfilled'
          ? ((await this.parseResponse(modelsResponse.value)) as any[])
          : [];
      const progress =
        progressResponse.status === 'fulfilled'
          ? ((await this.parseResponse(progressResponse.value)) as any)
          : {};

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
          features: ['txt2img', 'img2img', 'inpainting', 'extras', 'async_processing'],
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

  // Override processJobImpl from BaseConnector to customize A1111 job processing
  protected async processJobImpl(
    jobData: JobData,
    progressCallback: ProgressCallback
  ): Promise<JobResult> {
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
      await this.makeRequest('POST', '/sdapi/v1/interrupt');
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
    const response = await this.makeRequest('POST', '/sdapi/v1/txt2img', payload);

    if (!response.ok) {
      throw new Error(`A1111 txt2img request failed with status ${response.status}`);
    }

    // Poll for completion with progress updates
    const steps = typeof payload.steps === 'number' ? payload.steps : 20;
    await this.pollForProgress(jobData.id, steps, progressCallback);

    return (await this.parseResponse(response)) as Record<string, unknown>;
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
    const response = await this.makeRequest('POST', '/sdapi/v1/img2img', payload);

    if (!response.ok) {
      throw new Error(`A1111 img2img request failed with status ${response.status}`);
    }

    // Poll for completion with progress updates
    const steps = typeof payload.steps === 'number' ? payload.steps : 20;
    await this.pollForProgress(jobData.id, steps, progressCallback);

    return (await this.parseResponse(response)) as Record<string, unknown>;
  }

  private async pollForProgress(
    jobId: string,
    totalSteps: number,
    progressCallback: ProgressCallback
  ): Promise<void> {
    const restConfig = this.config as RestConnectorConfig;
    const pollInterval = restConfig.settings.polling_interval_ms || 1000;
    const maxPolls = (restConfig.settings as any).a1111_max_polling_attempts || 300;
    let polls = 0;

    while (polls < maxPolls) {
      try {
        const progressResponse = await this.makeRequest('GET', '/sdapi/v1/progress');
        const progressData = (await this.parseResponse(progressResponse)) as any;

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

        await new Promise(resolve => setTimeout(resolve, pollInterval));
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

  // Use sleep method from BaseConnector

  async updateConfiguration(config: any): Promise<void> {
    this.config = { ...this.config, ...config };
    logger.info(`Updated configuration for A1111 connector ${this.connector_id}`);
  }

  getConfiguration(): any {
    return { ...this.config };
  }

  // RestConnector abstract method implementations
  protected getHealthEndpoint(): string {
    return '/sdapi/v1/options';
  }

  protected getJobEndpoint(): string {
    return '/sdapi/v1/txt2img'; // Default, overridden per job type
  }

  protected getStatusEndpoint(): string {
    return '/sdapi/v1/progress';
  }

  protected getCancelEndpoint(jobId: string): string | null {
    return '/sdapi/v1/interrupt';
  }

  protected getCompletionEndpoint(jobId: string): string | null {
    return null; // A1111 doesn't have separate completion endpoint
  }

  protected prepareJobPayload(jobData: JobData): unknown {
    const jobType = this.determineJobType(jobData.payload);

    if (jobType === 'txt2img') {
      return {
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
        ...jobData.payload,
      };
    } else if (jobType === 'img2img') {
      return {
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
        ...jobData.payload,
      };
    }

    return jobData.payload;
  }

  protected handleJobSubmissionResponse(jobData: JobData, responseData: unknown): Promise<void> {
    // A1111 returns results directly from submission, no additional handling needed
    return Promise.resolve();
  }

  protected async checkJobCompletion(
    jobData: JobData
  ): Promise<{ completed: boolean; result?: unknown }> {
    try {
      const progressResponse = await this.makeRequest('GET', '/sdapi/v1/progress');
      const progressData = (await this.parseResponse(progressResponse)) as any;

      if (!progressData.active) {
        return { completed: true };
      }

      return { completed: false };
    } catch (error) {
      logger.error(`Failed to check A1111 job completion:`, error);
      return { completed: false };
    }
  }

  protected extractProgressFromStatusResponse(
    responseData: unknown,
    jobData: JobData
  ): {
    progress: number;
    message?: string;
    current_step?: string;
    total_steps?: number;
    estimated_completion_ms?: number;
  } {
    const progressData = responseData as any;
    const steps = (jobData.payload.steps as number) || 20;

    const progress = Math.round((progressData.progress || 0) * 100);
    const currentStep = Math.round((progressData.progress || 0) * steps);

    return {
      progress,
      message: `Generating... Step ${currentStep}/${steps}`,
      current_step: `Step ${currentStep}`,
      total_steps: steps,
      estimated_completion_ms: progressData.eta_relative
        ? progressData.eta_relative * 1000
        : undefined,
    };
  }

  protected isJobCompleted(responseData: unknown): boolean {
    const progressData = responseData as any;
    return !progressData.active;
  }

  protected extractResultFromResponse(responseData: unknown): unknown {
    return responseData;
  }

  protected isAsyncJob(jobData: JobData): boolean {
    return true; // A1111 jobs are always async
  }

  protected extractJobId(responseData: unknown): string {
    // A1111 doesn't return job IDs, we track by our internal job ID
    return '';
  }

  protected extractJobStatus(responseData: unknown): string {
    const progressData = responseData as any;
    return progressData.active ? 'running' : 'completed';
  }

  protected extractJobProgress(responseData: unknown): number {
    const progressData = responseData as any;
    return Math.round((progressData.progress || 0) * 100);
  }

  protected extractJobResult(responseData: unknown): unknown {
    return responseData;
  }

  protected handleAsyncJobSubmission(jobData: JobData, responseData: unknown): Promise<string> {
    // A1111 doesn't return async job IDs, return our own job ID
    return Promise.resolve(jobData.id);
  }

  protected createProgressFromAsyncResponse(
    responseData: unknown,
    jobData: JobData
  ): {
    progress: number;
    message?: string;
    current_step?: string;
    total_steps?: number;
    estimated_completion_ms?: number;
  } {
    return this.extractProgressFromStatusResponse(responseData, jobData);
  }

  protected isJobComplete(responseData: unknown): boolean {
    const progressData = responseData as any;
    return !progressData.active;
  }

  protected isJobFailed(responseData: unknown): boolean {
    // A1111 doesn't typically report failures through status endpoint
    return false;
  }

  protected extractJobError(responseData: unknown): string {
    const errorData = responseData as any;
    return errorData.error || 'Unknown A1111 error';
  }
}
