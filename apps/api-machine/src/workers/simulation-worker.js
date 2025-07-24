import axios from 'axios';
import { createLogger } from '../utils/logger.js';
import config from '../config/environment.js';

/**
 * Simulation Worker - Processes jobs using the simulation service
 * 
 * This worker connects to the local simulation service and processes jobs
 * as if they were real external API calls. It implements proper error
 * handling and retry logic as outlined in the failure recovery plan.
 */
export class SimulationWorker {
  constructor(workerId, redisClient) {
    this.workerId = workerId;
    this.redis = redisClient;
    this.logger = createLogger(`simulation-worker-${workerId}`);
    this.isRunning = false;
    this.currentJob = null;
    this.pollInterval = config.workers.pollInterval;
    
    // Service configuration
    this.simulationBaseUrl = `http://localhost:${config.services.simulation.port}`;
    this.httpTimeout = config.errorHandling.timeoutMinutes * 60 * 1000; // Convert to ms
    
    this.setupAxiosClient();
  }

  setupAxiosClient() {
    this.httpClient = axios.create({
      baseURL: this.simulationBaseUrl,
      timeout: this.httpTimeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `EmProps-API-Machine/${this.workerId}`
      }
    });

    // Request interceptor for logging
    this.httpClient.interceptors.request.use(
      (config) => {
        this.logger.debug('HTTP Request:', {
          method: config.method,
          url: config.url,
          timeout: config.timeout
        });
        return config;
      },
      (error) => {
        this.logger.error('HTTP Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.httpClient.interceptors.response.use(
      (response) => {
        this.logger.debug('HTTP Response:', {
          status: response.status,
          url: response.config.url
        });
        return response;
      },
      (error) => {
        return this.handleHttpError(error);
      }
    );
  }

  handleHttpError(error) {
    const errorInfo = {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      data: error.response?.data
    };

    // Classify error for retry logic
    const errorClassification = this.classifyError(error);
    
    this.logger.error('HTTP Error:', { ...errorInfo, classification: errorClassification });
    
    // Attach classification for retry logic
    error.isRetryable = errorClassification.isRetryable;
    error.errorType = errorClassification.type;
    
    return Promise.reject(error);
  }

  classifyError(error) {
    // Network/timeout errors - usually retryable
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return { type: 'timeout', isRetryable: true };
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return { type: 'connection', isRetryable: true };
    }

    // HTTP status code errors
    if (error.response) {
      const status = error.response.status;
      
      // 4xx errors - usually not retryable except for specific cases
      if (status >= 400 && status < 500) {
        if (status === 429) { // Rate limit
          return { type: 'rate_limit', isRetryable: true };
        }
        if (status === 408) { // Request timeout
          return { type: 'timeout', isRetryable: true };
        }
        return { type: 'client_error', isRetryable: false };
      }
      
      // 5xx errors - usually retryable
      if (status >= 500) {
        return { type: 'server_error', isRetryable: true };
      }
    }

    // Unknown errors - be conservative and don't retry
    return { type: 'unknown', isRetryable: false };
  }

  async start() {
    if (this.isRunning) {
      this.logger.warn('Worker is already running');
      return;
    }

    this.logger.info('Starting simulation worker...');
    this.isRunning = true;

    try {
      // Register worker with Redis
      await this.registerWorker();
      
      // Wait for simulation service to be ready
      await this.waitForSimulationService();
      
      // Start job processing loop
      this.processJobs();
      
      this.logger.info('Simulation worker started successfully');
    } catch (error) {
      this.logger.error('Failed to start simulation worker:', error);
      this.isRunning = false;
      throw error;
    }
  }

  async registerWorker() {
    const workerData = {
      worker_id: this.workerId,
      machine_id: config.machine.id,
      services: ['simulation', 'openai'], // Can handle both simulation and openai jobs
      status: 'idle',
      started_at: new Date().toISOString(),
      last_heartbeat: new Date().toISOString(),
      capabilities: {
        api_services: ['openai'],
        simulated: true,
        max_concurrent_jobs: 1
      }
    };

    await this.redis.hset(`worker:${this.workerId}`, workerData);
    await this.redis.sadd('workers:active', this.workerId);
    
    this.logger.info('Worker registered with Redis', { workerId: this.workerId });
  }

  async waitForSimulationService() {
    const maxAttempts = 10;
    const retryDelay = 2000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.httpClient.get('/health');
        this.logger.info('Simulation service is ready');
        return;
      } catch (error) {
        this.logger.warn(`Simulation service not ready (attempt ${attempt}/${maxAttempts}):`, error.message);
        
        if (attempt === maxAttempts) {
          throw new Error('Simulation service failed to become ready');
        }
        
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  async processJobs() {
    while (this.isRunning) {
      try {
        // Update heartbeat
        await this.updateHeartbeat();
        
        // Request a job from Redis
        const job = await this.requestJob();
        
        if (job) {
          await this.processJob(job);
        } else {
          // No jobs available, wait before polling again
          await new Promise(resolve => setTimeout(resolve, this.pollInterval));
        }
      } catch (error) {
        this.logger.error('Error in job processing loop:', error);
        
        // Wait before continuing to avoid tight error loops
        await new Promise(resolve => setTimeout(resolve, this.pollInterval * 2));
      }
    }
  }

  async requestJob() {
    try {
      // Use Redis function to find matching job
      const workerCapabilities = {
        worker_id: this.workerId,
        services: ['simulation', 'openai'],
        hardware: {
          cpu_cores: 2,
          ram_gb: 4
        }
      };

      const result = await this.redis.fcall(
        'findMatchingJob',
        0,
        JSON.stringify(workerCapabilities),
        100 // max_scan
      );

      if (result) {
        const jobData = JSON.parse(result);
        this.logger.info('Claimed job:', { jobId: jobData.jobId });
        return jobData;
      }

      return null;
    } catch (error) {
      this.logger.error('Failed to request job:', error);
      return null;
    }
  }

  async processJob(jobData) {
    const { jobId, job } = jobData;
    this.currentJob = { jobId, startTime: Date.now() };

    try {
      this.logger.info('Processing job:', {
        jobId,
        service: job.service_required,
        type: job.type
      });

      // Update job status to in_progress
      await this.updateJobStatus(jobId, 'in_progress', 'Job processing started');

      // Process the job based on its type
      let result;
      switch (job.service_required) {
        case 'openai':
          result = await this.processOpenAIJob(job);
          break;
        case 'simulation':
          result = await this.processSimulationJob(job);
          break;
        default:
          throw new Error(`Unsupported service: ${job.service_required}`);
      }

      // Job completed successfully
      await this.completeJob(jobId, result);

    } catch (error) {
      await this.failJob(jobId, error);
    } finally {
      this.currentJob = null;
      await this.updateWorkerStatus('idle');
    }
  }

  async processOpenAIJob(job) {
    const payload = JSON.parse(job.input || '{}');
    
    // Route to appropriate OpenAI endpoint simulation
    switch (payload.type) {
      case 'image_generation':
        return await this.generateImage(payload);
      case 'chat_completion':
        return await this.generateChatCompletion(payload);
      default:
        throw new Error(`Unsupported OpenAI job type: ${payload.type}`);
    }
  }

  async processSimulationJob(job) {
    // Generic simulation job processing
    const payload = JSON.parse(job.input || '{}');
    
    this.logger.info('Processing simulation job:', payload);
    
    // Simulate work with configurable delay
    const processingTime = payload.processing_time || 2000;
    await new Promise(resolve => setTimeout(resolve, processingTime));
    
    return {
      status: 'completed',
      message: 'Simulation job completed successfully',
      input: payload,
      processed_at: new Date().toISOString()
    };
  }

  async generateImage(payload) {
    const response = await this.httpClient.post('/v1/images/generations', {
      prompt: payload.prompt,
      size: payload.size || '1024x1024',
      n: payload.n || 1,
      quality: payload.quality || 'standard'
    });

    return {
      type: 'image_generation',
      images: response.data.data,
      created: response.data.created
    };
  }

  async generateChatCompletion(payload) {
    const response = await this.httpClient.post('/v1/chat/completions', {
      messages: payload.messages,
      model: payload.model || 'gpt-4',
      max_tokens: payload.max_tokens || 1000
    });

    return {
      type: 'chat_completion',
      choices: response.data.choices,
      usage: response.data.usage
    };
  }

  async completeJob(jobId, result) {
    try {
      // Update job in Redis
      await this.redis.hmset(`job:${jobId}`, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        result: JSON.stringify(result)
      });

      // Remove from active jobs
      await this.redis.hdel(`jobs:active:${this.workerId}`, jobId);

      // Publish completion event
      await this.redis.publish('job_completed', JSON.stringify({
        job_id: jobId,
        worker_id: this.workerId,
        result,
        completed_at: new Date().toISOString()
      }));

      this.logger.info('Job completed successfully:', { jobId });
    } catch (error) {
      this.logger.error('Failed to complete job:', { jobId, error });
    }
  }

  async failJob(jobId, error) {
    try {
      const errorData = {
        message: error.message,
        type: error.errorType || 'unknown',
        isRetryable: error.isRetryable || false,
        timestamp: new Date().toISOString()
      };

      await this.redis.hmset(`job:${jobId}`, {
        status: 'failed',
        failed_at: new Date().toISOString(),
        error: JSON.stringify(errorData),
        last_failed_worker: this.workerId
      });

      // Remove from active jobs
      await this.redis.hdel(`jobs:active:${this.workerId}`, jobId);

      // Publish failure event
      await this.redis.publish('job_failed', JSON.stringify({
        job_id: jobId,
        worker_id: this.workerId,
        error: errorData,
        failed_at: new Date().toISOString()
      }));

      this.logger.error('Job failed:', { jobId, error: errorData });
    } catch (redisError) {
      this.logger.error('Failed to record job failure:', { jobId, redisError });
    }
  }

  async updateJobStatus(jobId, status, message) {
    try {
      await this.redis.hmset(`job:${jobId}`, {
        status,
        updated_at: new Date().toISOString()
      });

      // Publish progress update
      await this.redis.publish('update_job_progress', JSON.stringify({
        job_id: jobId,
        worker_id: this.workerId,
        status,
        message,
        timestamp: Date.now()
      }));
    } catch (error) {
      this.logger.error('Failed to update job status:', { jobId, error });
    }
  }

  async updateWorkerStatus(status) {
    try {
      await this.redis.hmset(`worker:${this.workerId}`, {
        status,
        last_heartbeat: new Date().toISOString(),
        current_job_id: this.currentJob?.jobId || ''
      });
    } catch (error) {
      this.logger.error('Failed to update worker status:', error);
    }
  }

  async updateHeartbeat() {
    try {
      await this.redis.hset(`worker:${this.workerId}`, 'last_heartbeat', new Date().toISOString());
    } catch (error) {
      this.logger.debug('Failed to update heartbeat:', error);
    }
  }

  async stop() {
    this.logger.info('Stopping simulation worker...');
    this.isRunning = false;

    try {
      // Cleanup worker registration
      await this.redis.srem('workers:active', this.workerId);
      await this.redis.del(`worker:${this.workerId}`);
      
      this.logger.info('Simulation worker stopped');
    } catch (error) {
      this.logger.error('Error during worker cleanup:', error);
    }
  }
}