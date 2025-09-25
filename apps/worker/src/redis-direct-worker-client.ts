// Redis-Direct Worker Client - Phase 1B Implementation
// Workers poll Redis directly, no WebSocket to hub required

import Redis from 'ioredis';
import {
  WorkerCapabilities,
  Job,
  JobProgress,
  JobStatus,
  MatchingResult,
  RedisJobData,
  logger,
  sanitizeBase64Data,
} from '@emp/core';

export class RedisDirectWorkerClient {
  private redis: Redis;
  private workerId: string;
  private hubRedisUrl: string;
  private isConnectedFlag = false;
  private pollIntervalMs: number;
  private heartbeatIntervalMs: number;
  private pollTimeout?: NodeJS.Timeout;
  private heartbeatTimeout?: NodeJS.Timeout;
  private currentStatus: 'idle' | 'busy' = 'idle';

  constructor(hubRedisUrl: string, workerId: string) {
    logger.info(
      `🔍 [WORKER-ID-DEBUG] RedisDirectWorkerClient constructor called with workerId: ${workerId}`
    );
    logger.info(`🔍 [WORKER-ID-DEBUG] WORKER_ID from env: ${process.env.WORKER_ID}`);
    this.hubRedisUrl = hubRedisUrl;
    this.workerId = workerId;
    logger.info(`🔍 [WORKER-ID-DEBUG] this.workerId set to: ${this.workerId}`);

    // Configuration from environment
    this.pollIntervalMs = parseInt(process.env.WORKER_POLL_INTERVAL_MS || '1000');
    this.heartbeatIntervalMs = parseInt(process.env.WORKER_HEARTBEAT_INTERVAL_MS || '30000');

    this.redis = new Redis(hubRedisUrl, {
      enableReadyCheck: true,
      maxRetriesPerRequest: 10,
      lazyConnect: false,
      connectTimeout: 10000,
      commandTimeout: 5000,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.redis.on('connect', () => {
      logger.info(
        `✅ Worker ${this.workerId} connected to Redis: ${this.maskRedisUrl(this.hubRedisUrl)}`
      );
      this.isConnectedFlag = true;
    });

    this.redis.on('disconnect', () => {
      logger.warn(
        `❌ Worker ${this.workerId} disconnected from Redis: ${this.maskRedisUrl(this.hubRedisUrl)}`
      );
      this.isConnectedFlag = false;
    });

    this.redis.on('error', error => {
      logger.error(
        `❌ Worker ${this.workerId} Redis connection error [${this.maskRedisUrl(this.hubRedisUrl)}]:`,
        error
      );
    });
  }

  async connect(capabilities: WorkerCapabilities): Promise<void> {
    try {
      logger.info(
        `🔄 Worker ${this.workerId} attempting connection to Redis: ${this.maskRedisUrl(this.hubRedisUrl)}`
      );
      logger.info(`🔄 Worker ${this.workerId} - initial currentStatus: ${this.currentStatus}`);

      await this.redis.ping();
      logger.info(`✅ Worker ${this.workerId} Redis connection successful`);

      // Register worker capabilities in Redis
      logger.info(`📝 Worker ${this.workerId} - registering worker capabilities`);
      await this.registerWorker(capabilities);

      // Start heartbeat
      logger.info(`💓 Worker ${this.workerId} - starting heartbeat`);
      this.startHeartbeat();

      this.isConnectedFlag = true;
      logger.info(
        `🚀 Worker ${this.workerId} connected and registered with Redis-direct mode (currentStatus: ${this.currentStatus})`
      );
    } catch (error) {
      logger.error(
        `❌ Failed to connect worker ${this.workerId} to Redis [${this.maskRedisUrl(this.hubRedisUrl)}]:`,
        error
      );
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = undefined;
    }

    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = undefined;
    }

    // Get worker data before deletion for the event
    const workerData = await this.redis.hgetall(`worker:${this.workerId}`);
    const capabilities = workerData.capabilities ? JSON.parse(workerData.capabilities) : {};

    // Publish worker disconnected event
    const workerDisconnectedEvent = {
      type: 'worker_disconnected',
      worker_id: this.workerId,
      machine_id: capabilities.machine_id || workerData.machine_id || 'unknown',
      timestamp: Date.now(),
    };

    await this.redis.publish('worker:events', JSON.stringify(workerDisconnectedEvent));

    // Publish offline status to worker_status channel
    await this.publishWorkerStatus('offline', capabilities);

    // Remove worker from active set
    await this.redis.srem('workers:active', this.workerId);
    await this.redis.del(`worker:${this.workerId}`);
    await this.redis.del(`worker:${this.workerId}:heartbeat`);

    await this.redis.quit();
    this.isConnectedFlag = false;

    logger.info(`Worker ${this.workerId} disconnected from Redis and published disconnected event`);
  }

  isConnected(): boolean {
    return this.isConnectedFlag;
  }

  /**
   * Check if worker is currently processing a job (in-memory flag)
   */

  /**
   * Register worker capabilities directly in Redis
   * DISABLED when using unified machine status reporting
   */
  private async registerWorker(capabilities: WorkerCapabilities): Promise<void> {
    logger.info(`🔍 [WORKER-ID-DEBUG] registerWorker called with workerId: ${this.workerId}`);
    logger.info(`🔍 [WORKER-ID-DEBUG] WORKER_ID env var: ${process.env.WORKER_ID}`);
    logger.info(`🔍 [WORKER-ID-DEBUG] capabilities.machine_id: ${capabilities.machine_id}`);
    logger.info(
      `📝 Worker ${this.workerId} - registerWorker called (UNIFIED_MACHINE_STATUS: ${process.env.UNIFIED_MACHINE_STATUS})`
    );

    // Skip individual worker registration if unified machine status is enabled
    if (process.env.UNIFIED_MACHINE_STATUS === 'true') {
      logger.info(
        `⏭️ Skipping individual worker registration for ${this.workerId} - using unified machine status`
      );
      return;
    }

    const now = new Date().toISOString();

    logger.info(
      `🔴 [WORKER-ID-TRACE] About to register in Redis with this.workerId: "${this.workerId}"`
    );

    const regObj = {
      worker_id: this.workerId,
      machine_id: capabilities.machine_id || 'unknown',
      capabilities: JSON.stringify(capabilities),
      status: 'idle',
      connected_at: now,
      last_heartbeat: now,
      total_jobs_completed: '0',
      total_jobs_failed: '0',
    };

    if (process.env.NODE_ENV !== 'production' && process.env.LOG_LEVEL === 'debug') {
      logger.debug(`About to register in Redis with this.workerId: "${regObj}"`);
    }

    // Store worker capabilities
    await this.redis.hmset(`worker:${this.workerId}`, regObj);

    // Add to active workers set
    await this.redis.sadd('workers:active', this.workerId);

    // Set heartbeat
    await this.redis.setex(`worker:${this.workerId}:heartbeat`, 60, now);

    // Publish worker connected event
    const workerConnectedEvent = {
      type: 'worker_connected',
      worker_id: this.workerId,
      machine_id: capabilities.machine_id || 'unknown',
      worker_data: {
        id: this.workerId,
        status: 'idle',
        capabilities: {
          gpu_count: 1, // Default to 1 GPU
          gpu_memory_gb: capabilities.hardware?.gpu_memory_gb || 0,
          gpu_model: capabilities.hardware?.gpu_model || 'Unknown',
          cpu_cores: 1, // Default to 1 CPU core
          ram_gb: capabilities.hardware?.ram_gb || 1,
          services: capabilities.services || [],
          models: Object.keys(capabilities.models || {}),
          customer_access: capabilities.customer_access?.isolation || 'none',
          max_concurrent_jobs: capabilities.performance?.concurrent_jobs || 1,
        },
        connected_at: now,
        jobs_completed: 0,
        jobs_failed: 0,
      },
      timestamp: Date.now(),
    };

    // Debug worker card data only in development/debug mode
    if (process.env.NODE_ENV !== 'production' && process.env.LOG_LEVEL === 'debug') {
      logger.debug('Publishing worker_connected event');
      logger.debug('capabilities.services that will show in UI:', JSON.stringify(capabilities.services));
      logger.debug('workerConnectedEvent.worker_data.capabilities.services:', JSON.stringify(capabilities.services || []));
      logger.debug('This is THE VALUE that the worker card will display as pills/tags!');
    }

    await this.redis.publish('worker:events', JSON.stringify(workerConnectedEvent));

    // Also publish to worker_status channel for API discovery
    await this.publishWorkerStatus('idle', capabilities);
    logger.info(
      `Worker ${this.workerId} registered capabilities in Redis and published connected event`
    );
  }

  async updateConnectorStatuses(connectorStatuses: Record<string, unknown>): Promise<void> {
    try {
      // Update the connector statuses in the worker's Redis data
      await this.redis.hset(
        `worker:${this.workerId}`,
        'connector_statuses',
        JSON.stringify(connectorStatuses)
      );

      logger.debug(
        `Updated connector statuses for worker ${this.workerId}:`,
        Object.keys(connectorStatuses)
      );
    } catch (error) {
      logger.error(`Failed to update connector statuses for worker ${this.workerId}:`, error);
    }
  }

  /**
   * Publish worker status to Redis for API discovery
   */
  private async publishWorkerStatus(
    status: 'idle' | 'busy' | 'offline' | 'error',
    capabilities?: WorkerCapabilities
  ): Promise<void> {
    try {
      // Get current worker data if capabilities not provided
      if (!capabilities) {
        const workerData = await this.redis.hgetall(`worker:${this.workerId}`);
        if (workerData.capabilities) {
          capabilities = JSON.parse(workerData.capabilities);
        }
      }

      // Use minimal capabilities if none provided - worker can still advertise services
      const safeCapabilities: WorkerCapabilities = capabilities || {
        worker_id: this.workerId,
        services: [], // No services if not specified
      };

      // Debug worker status only in development/debug mode
      if (process.env.NODE_ENV !== 'production' && process.env.LOG_LEVEL === 'debug') {
        logger.debug('Publishing worker status');
        logger.debug('safeCapabilities.services:', JSON.stringify(safeCapabilities.services || []));
      }

      const workerStatusReport = {
        worker_id: this.workerId,
        machine_id: safeCapabilities.machine_id || 'unknown',
        status: status,
        capabilities: {
          services: safeCapabilities.services || [],
          hardware: safeCapabilities.hardware || {},
          performance: safeCapabilities.performance || {},
          customer_access: safeCapabilities.customer_access || {},
          models: safeCapabilities.models || {},
        },
        timestamp: new Date().toISOString(),
        last_heartbeat: Date.now(),
        connected_at: safeCapabilities.connected_at || new Date().toISOString(),
      };

      // Debug final worker status report only in development/debug mode
      if (process.env.NODE_ENV !== 'production' && process.env.LOG_LEVEL === 'debug') {
        logger.debug('Final workerStatusReport.capabilities.services:', JSON.stringify(workerStatusReport.capabilities.services));
        logger.debug('This goes to worker_status channel - API/UI reads this!');
      }

      // Publish to worker_status channel for API discovery
      await this.redis.publish(
        `worker_status:${this.workerId}`,
        JSON.stringify(workerStatusReport)
      );

      logger.debug(`Published worker status for ${this.workerId}: ${status}`);
    } catch (error) {
      logger.error(`Failed to publish worker status for ${this.workerId}:`, error);
    }
  }

  /**
   * Start heartbeat to keep worker alive
   */
  private startHeartbeat(): void {
    const sendHeartbeat = async () => {
      try {
        const now = new Date().toISOString();

        // Update worker heartbeat
        await this.redis.hmset(`worker:${this.workerId}`, {
          last_heartbeat: now,
        });

        // Update heartbeat TTL key
        await this.redis.setex(`worker:${this.workerId}:heartbeat`, 60, now);

        logger.debug(`Worker ${this.workerId} heartbeat sent`);
      } catch (error) {
        logger.error(`Worker ${this.workerId} heartbeat failed:`, error);
      }
    };

    // Send initial heartbeat
    sendHeartbeat();

    // Schedule periodic heartbeats
    this.heartbeatTimeout = setInterval(sendHeartbeat, this.heartbeatIntervalMs);
  }

  /**
   * Get current worker status from Redis
   */
  private async getWorkerStatus(): Promise<string> {
    try {
      const status = await this.redis.hget(`worker:${this.workerId}`, 'status');
      return status || 'idle';
    } catch (error) {
      logger.error(`Worker ${this.workerId} failed to get status:`, error);
      return 'idle';
    }
  }

  /**
   * Update worker status in Redis
   */
  async updateWorkerStatus(status: 'idle' | 'busy', currentJobId?: string): Promise<void> {
    try {
      const oldStatus = this.currentStatus;

      const updates: Record<string, string> = {
        status,
        last_status_change: new Date().toISOString(),
      };

      if (currentJobId) {
        updates.current_job_id = currentJobId;
      } else {
        updates.current_job_id = '';
      }

      await this.redis.hmset(`worker:${this.workerId}`, updates);

      // Also publish worker status change to Redis pub/sub for real-time updates
      const statusEvent = {
        worker_id: this.workerId,
        old_status: oldStatus,
        new_status: status,
        current_job_id: currentJobId || '',
        timestamp: Date.now(),
      };

      await this.redis.publish('worker_status', JSON.stringify(statusEvent));

      // Update tracked status
      this.currentStatus = status;

      logger.info(
        `🔄 Worker ${this.workerId} status changed: ${oldStatus} -> ${status}${currentJobId ? ` (job: ${currentJobId})` : ''}`
      );
      logger.info(`📢 Worker ${this.workerId} published status change event`);
    } catch (error) {
      logger.error(`Worker ${this.workerId} failed to update status to ${status}:`, error);
    }
  }

  /**
   * Convert Redis job data (strings) to typed Job object
   */
  private convertRedisJobData(jobId: string, redisData: RedisJobData): Job {
    const job: Job = {
      id: jobId,
      service_required: redisData.service_required || redisData.job_type || 'unknown',
      priority: parseInt(redisData.priority || '50'),
      payload: this.safeJsonParse(redisData.payload, {}),
      requirements: this.safeJsonParse(redisData.requirements, undefined),
      customer_id: redisData.customer_id,
      created_at: redisData.created_at || new Date().toISOString(),
      assigned_at: redisData.assigned_at || new Date().toISOString(),
      started_at: redisData.started_at,
      completed_at: redisData.completed_at,
      failed_at: redisData.failed_at,
      worker_id: this.workerId, // Function assigns it to us
      status: JobStatus.ASSIGNED,
      retry_count: parseInt(redisData.retry_count || '0'),
      max_retries: parseInt(redisData.max_retries || '3'),
      last_failed_worker: redisData.last_failed_worker,
      processing_time: redisData.processing_time ? parseInt(redisData.processing_time) : undefined,
      estimated_completion: redisData.estimated_completion,
      workflow_id: redisData.workflow_id,
      workflow_priority: redisData.workflow_priority
        ? parseInt(redisData.workflow_priority)
        : undefined,
      workflow_datetime: redisData.workflow_datetime
        ? parseInt(redisData.workflow_datetime)
        : undefined,
      current_step: redisData.current_step ? parseInt(redisData.current_step) : undefined,
      // OTEL trace context for cross-service propagation
      job_trace_id: redisData.job_trace_id,
      job_span_id: redisData.job_span_id,
      workflow_trace_id: redisData.workflow_trace_id,
      workflow_span_id: redisData.workflow_span_id,
      // Storage context for asset saving (separate from payload to avoid sending to external APIs)
      ctx: redisData.ctx ? this.safeJsonParse(redisData.ctx, undefined) : undefined,
    };

    // 🚨 BIG TRACE LOGGING: JOB RETRIEVED FROM REDIS
    console.log(`\n🚨🚨🚨 WORKER: RETRIEVED JOB FROM REDIS`);
    console.log(`🚨 JOB: ${job.id}`);
    console.log(`🚨 WORKFLOW: ${job.workflow_id || 'NONE'}`);
    console.log(`🚨 RETRIEVED job_trace_id: ${job.job_trace_id || 'MISSING!!!'}`);
    console.log(`🚨 RETRIEVED job_span_id: ${job.job_span_id || 'MISSING!!!'}`);
    console.log(`🚨 RETRIEVED workflow_trace_id: ${job.workflow_trace_id || 'NONE'}`);
    console.log(`🚨 RETRIEVED workflow_span_id: ${job.workflow_span_id || 'NONE'}`);
    console.log(`🚨🚨🚨\n`);

    return job;
  }

  /**
   * Type-safe Redis Function wrapper for job matching
   */
  private async callFindMatchingJob(
    capabilities: WorkerCapabilities,
    maxScan = 100
  ): Promise<MatchingResult | null> {
    // Debug capabilities only in development/debug mode
    if (process.env.NODE_ENV !== 'production' && process.env.LOG_LEVEL === 'debug') {
      logger.debug('About to call findMatchingJob with:');
      logger.debug('Worker ID:', this.workerId);
      logger.debug('Capabilities services:', capabilities.services);
      logger.debug('Full capabilities:', JSON.stringify(capabilities, null, 2));
    }
    // Debug Redis call only in development/debug mode
    if (process.env.NODE_ENV !== 'production' && process.env.LOG_LEVEL === 'debug') {
      logger.debug('Max scan:', maxScan);
      logger.debug('Redis call: FCALL findMatchingJob 0 \'' + JSON.stringify(capabilities) + '\' ' + maxScan.toString());
    }
    
    const result = (await this.redis.call(
      'FCALL',
      'findMatchingJob',
      '0', // No keys
      JSON.stringify(capabilities),
      maxScan.toString()
    )) as string | null;
    
    // Debug result only in development/debug mode
    if (process.env.NODE_ENV !== 'production' && process.env.LOG_LEVEL === 'debug') {
      logger.debug('Redis function result:', result);
    }

    if (!result) {
      return null;
    }

    const parsedResult = this.safeJsonParse(result, null);
    if (!parsedResult) {
      logger.error(`Failed to parse Redis Function result:`, result);
      throw new Error('Redis Function returned unparseable result');
    }

    // Runtime type validation
    if (!parsedResult.jobId || !parsedResult.job) {
      logger.error(`Invalid Redis Function result format:`, parsedResult);
      throw new Error('Redis Function returned invalid result format');
    }

    return parsedResult as MatchingResult;
  }

  /**
   * Request a job using Redis Function for capability-based matching
   */
  async requestJob(capabilities: WorkerCapabilities): Promise<Job | null> {
    try {
      // Ensure worker_id is included in capabilities
      const capabilitiesWithId: WorkerCapabilities = {
        ...capabilities,
        worker_id: this.workerId,
      };

      logger.debug(`Worker ${this.workerId} - capabilities: ${JSON.stringify(capabilitiesWithId)}`);

      const matchResult = await this.callFindMatchingJob(capabilitiesWithId, 100);

      if (matchResult) {
        if (process.env.LOG_LEVEL === 'debug') {
          logger.debug(`Worker ${this.workerId} - claimed job ID: ${matchResult.jobId}`);
        }
      }

      if (!matchResult) {
        logger.debug(`Worker ${this.workerId} - No matching jobs available`);
        return null;
      }

      // Convert Redis job data to typed Job object
      const job = this.convertRedisJobData(matchResult.jobId, matchResult.job);

      // Worker status already updated by Redis Function, just publish the event
      const statusEvent = {
        worker_id: this.workerId,
        old_status: this.currentStatus,
        new_status: 'busy',
        current_job_id: job.id,
        timestamp: Date.now(),
      };

      // Update tracked status
      logger.info(
        `🔄 Worker ${this.workerId} - status change: ${this.currentStatus} → busy (job: ${job.id})`
      );
      this.currentStatus = 'busy';
      await this.redis.publish('worker_status', JSON.stringify(statusEvent));

      if (process.env.LOG_LEVEL === 'debug') {
        logger.debug(`Worker ${this.workerId} claimed job ${job.id} via Redis Function orchestration`);
      }
      logger.debug(
        `Job details: service=${job.service_required}, priority=${job.priority}, workflow=${job.workflow_id || 'none'}`
      );

      return job;
    } catch (error) {
      logger.error(`Worker ${this.workerId} job request failed:`, error);

      // Fall back to simple polling if function not available
      if (error instanceof Error && error.message.includes('ERR unknown command')) {
        logger.warn(`Redis Function not available, falling back to simple polling`);
        return this.requestJobSimple(capabilities);
      }

      return null;
    }
  }

  /**
   * Fallback: Poll Redis for jobs directly using simple FIFO (Phase 1B)
   */
  private async requestJobSimple(_capabilities: WorkerCapabilities): Promise<Job | null> {
    try {
      // Phase 1B: Simple Redis polling - get highest priority job
      const jobIds = await this.redis.zrevrange('jobs:pending', 0, 0);
      logger.info(
        `🔍 [DEBUG] Worker ${this.workerId} simple polling found ${jobIds.length} pending jobs`
      );

      if (jobIds.length === 0) {
        logger.debug(`Worker ${this.workerId} - No jobs available`);
        return null;
      }

      const jobId = jobIds[0];

      // Try to claim the job atomically
      const claimed = await this.claimJob(jobId);
      if (!claimed) {
        logger.debug(`Worker ${this.workerId} - Job ${jobId} already claimed`);
        return null;
      }

      // Get the full job details
      const job = await this.getJob(jobId);
      if (!job) {
        logger.warn(`Worker ${this.workerId} - Claimed job ${jobId} not found`);
        return null;
      }

      if (process.env.LOG_LEVEL === 'debug') {
        logger.debug(`Worker ${this.workerId} claimed job ${jobId} via Redis-direct polling`);
      }
      return job;
    } catch (error) {
      logger.error(`Worker ${this.workerId} job request failed:`, error);
      return null;
    }
  }

  /**
   * Claim a job atomically via Redis
   */
  private async claimJob(jobId: string): Promise<boolean> {
    try {
      // Simple atomic claim: remove from pending queue
      const removed = await this.redis.zrem('jobs:pending', jobId);
      if (removed === 0) {
        return false; // Job already claimed
      }

      // Update worker status to busy
      await this.updateWorkerStatus('busy', jobId);

      // Update job with worker assignment
      await this.redis.hmset(`job:${jobId}`, {
        worker_id: this.workerId,
        status: JobStatus.ASSIGNED,
        assigned_at: new Date().toISOString(),
      });

      // Add to worker's active jobs
      const jobData = await this.getJob(jobId);
      if (jobData) {
        await this.redis.hset(`jobs:active:${this.workerId}`, jobId, JSON.stringify(jobData));
      }

      // Publish job assignment to progress stream
      await this.redis.xadd(
        `progress:${jobId}`,
        '*',
        'job_id',
        jobId,
        'worker_id',
        this.workerId,
        'status',
        'assigned',
        'progress',
        '0',
        'message',
        'Job assigned to worker',
        'assigned_at',
        new Date().toISOString()
      );

      return true;
    } catch (error) {
      logger.error(`Worker ${this.workerId} failed to claim job ${jobId}:`, error);
      return false;
    }
  }

  /**
   * Get job details from Redis
   */
  private async getJob(jobId: string): Promise<Job | null> {
    try {
      const jobData = await this.redis.hgetall(`job:${jobId}`);
      if (!jobData.id) return null;

      return {
        id: jobData.id,
        service_required: jobData.service_required || 'unknown',
        priority: parseInt(jobData.priority || '50'),
        payload: this.safeJsonParse(jobData.payload, {}),
        requirements: this.safeJsonParse(jobData.requirements, undefined),
        customer_id: jobData.customer_id || undefined,
        created_at: jobData.created_at,
        assigned_at: jobData.assigned_at || undefined,
        started_at: jobData.started_at || undefined,
        completed_at: jobData.completed_at || undefined,
        failed_at: jobData.failed_at || undefined,
        worker_id: jobData.worker_id || undefined,
        status: jobData.status as JobStatus,
        retry_count: parseInt(jobData.retry_count || '0'),
        max_retries: parseInt(jobData.max_retries || '3'),
        last_failed_worker: jobData.last_failed_worker || undefined,
        processing_time: jobData.processing_time ? parseInt(jobData.processing_time) : undefined,
        estimated_completion: jobData.estimated_completion || undefined,
        // Storage context for asset saving (separate from payload to avoid sending to external APIs)
        ctx: jobData.ctx ? this.safeJsonParse(jobData.ctx, undefined) : undefined,
      };
    } catch (error) {
      logger.error(`Worker ${this.workerId} failed to get job ${jobId}:`, error);
      return null;
    }
  }

  /**
   * Publish job progress to Redis Stream instead of WebSocket
   */
  async sendJobProgress(jobId: string, progress: JobProgress): Promise<void> {
    try {
      logger.info(
        `🔄 Worker ${this.workerId} sending progress for job ${jobId}: ${progress.progress}% - ${progress.message || 'no message'}`
      );

      // Phase 1B: Publish progress to Redis Stream instead of WebSocket
      const streamResult = await this.redis.xadd(
        `progress:${jobId}`,
        '*',
        'job_id',
        jobId,
        'worker_id',
        this.workerId,
        'progress',
        progress.progress.toString(),
        'status',
        progress.status || 'in_progress',
        'message',
        progress.message || '',
        'current_step',
        progress.current_step || '',
        'total_steps',
        progress.total_steps?.toString() || '',
        'estimated_completion',
        progress.estimated_completion || '',
        'updated_at',
        new Date().toISOString()
      );

      logger.info(
        `✅ Worker ${this.workerId} wrote to Redis stream progress:${jobId} - ID: ${streamResult}`
      );

      // Also update job progress in hash for compatibility
      await this.redis.hmset(`job:${jobId}:progress`, {
        progress: progress.progress.toString(),
        status: progress.status || 'in_progress',
        message: progress.message || '',
        updated_at: new Date().toISOString(),
      });

      if (process.env.LOG_LEVEL === 'debug') {
        logger.debug(`Worker ${this.workerId} updated Redis hash job:${jobId}:progress`);
      }

      // Publish to Redis pub/sub for real-time delivery to API server
      const progressEvent = {
        job_id: jobId,
        worker_id: this.workerId,
        progress: progress.progress,
        status: progress.status || 'in_progress',
        message: progress.message || '',
        current_step: progress.current_step || '',
        total_steps: progress.total_steps || 0,
        estimated_completion: progress.estimated_completion || '',
        timestamp: Date.now(),
      };

      await this.redis.publish('update_job_progress', JSON.stringify(progressEvent));
      logger.info(
        `📢 Worker ${this.workerId} published real-time progress for job ${jobId}: ${progress.progress}%`
      );
    } catch (error) {
      logger.error(`Worker ${this.workerId} failed to send progress for job ${jobId}:`, error);
    }
  }

  /**
   * Update job status to processing when worker starts handling it
   */
  async startJobProcessing(jobId: string): Promise<void> {
    try {
      logger.info(`🚀 Worker ${this.workerId} starting job processing for ${jobId}`);

      // Worker status already set to busy by Redis Function when job was claimed
      // Update job status to IN_PROGRESS when processing begins
      await this.redis.hmset(`job:${jobId}`, {
        status: JobStatus.IN_PROGRESS,
        started_at: new Date().toISOString(),
      });

      logger.info(`✅ Worker ${this.workerId} updated job:${jobId} status to IN_PROGRESS`);

      // Publish job processing start to progress stream
      const streamResult = await this.redis.xadd(
        `progress:${jobId}`,
        '*',
        'job_id',
        jobId,
        'worker_id',
        this.workerId,
        'status',
        'processing',
        'progress',
        '0',
        'message',
        'Job processing started',
        'started_at',
        new Date().toISOString()
      );

      logger.info(
        `✅ Worker ${this.workerId} wrote processing start to stream progress:${jobId} - ID: ${streamResult}`
      );

      logger.debug(`Worker ${this.workerId} marked job ${jobId} as processing`);
    } catch (error) {
      logger.error(`Worker ${this.workerId} failed to start job processing for ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Complete a job via Redis
   */
  async completeJob(jobId: string, result: unknown): Promise<void> {
    try {
      logger.info(`🎉 Worker ${this.workerId} completing job ${jobId}`);

      // Fetch the job data to get workflow fields for completion event
      const jobData = await this.redis.hgetall(`job:${jobId}`);
      const completedAt = new Date().toISOString();

      // Debug logging for retry count - let's see what's actually in the job data
      logger.info(`🔍 Worker ${this.workerId} completing job ${jobId} - retry_count in jobData: "${jobData.retry_count}" (type: ${typeof jobData.retry_count})`);

      // Parse payload to check if retry_count is there
      let parsedPayload: any = {};
      try {
        parsedPayload = typeof jobData.payload === 'string' ? JSON.parse(jobData.payload) : jobData.payload || {};
        logger.info(`🔍 Parsed payload for job ${jobId}:`, {
          has_ctx: !!parsedPayload.ctx,
          ctx_retry_count: parsedPayload.ctx?.retry_count,
          ctx_retryCount: parsedPayload.ctx?.retryCount,
          payload_retry_count: parsedPayload.retry_count,
          payload_retryCount: parsedPayload.retryCount,
          full_payload: JSON.stringify(parsedPayload, null, 2)
        });
      } catch (e) {
        logger.warn(`Failed to parse payload for job ${jobId}: ${e.message}`);
      }

      // 🚨 CRITICAL: Create persistent completion attestation FIRST
      // This is the worker's authoritative "I finished this" record
      // Must happen BEFORE releasing the job to prevent orphaning

      // Create sanitized result for attestation (URLs only, no base64 data)
      const sanitizedResult = this.createSanitizedResultForAttestation(result as any);

      // Create raw service output with base64 scrubbed for debugging
      const rawServiceOutput = sanitizeBase64Data(result);

      // 🔍 COMPREHENSIVE ATTESTATION DEBUG - Log ALL available data
      logger.info(`🔍🔍🔍 COMPREHENSIVE ATTESTATION DEBUG for job ${jobId} 🔍🔍🔍`);
      logger.info(`📦 Raw jobData keys: ${Object.keys(jobData).join(', ')}`);
      logger.info(`📦 Raw jobData values:`, {
        id: jobData.id,
        workflow_id: jobData.workflow_id,
        service_required: jobData.service_required,
        retry_count: jobData.retry_count,
        max_retries: jobData.max_retries,
        status: jobData.status,
        priority: jobData.priority,
        payload_type: typeof jobData.payload,
        payload_length: jobData.payload?.length || 0,
        created_at: jobData.created_at,
        assigned_at: jobData.assigned_at,
        started_at: jobData.started_at
      });

      logger.info(`📦 Parsed payload structure:`, {
        type: typeof parsedPayload,
        keys: Object.keys(parsedPayload || {}),
        has_ctx: !!parsedPayload.ctx,
        ctx_keys: parsedPayload.ctx ? Object.keys(parsedPayload.ctx) : 'no ctx',
        ctx_full: parsedPayload.ctx || 'undefined',
        top_level_retry_count: parsedPayload.retry_count,
        top_level_retryCount: parsedPayload.retryCount
      });

      logger.info(`📦 Job result data:`, {
        result_type: typeof result,
        result_keys: result && typeof result === 'object' ? Object.keys(result) : 'not object',
        result_summary: result ? JSON.stringify(result, null, 2).substring(0, 200) + '...' : 'undefined'
      });

      // Get retry count from the same place asset-saver gets it: ctx.workflow_context.retry_attempt
      // parsedPayload.ctx is undefined, but jobData.ctx contains the workflow_context as JSON string
      let parsedCtx: any = null;
      try {
        parsedCtx = typeof jobData.ctx === 'string' ? JSON.parse(jobData.ctx) : jobData.ctx;
      } catch (error) {
        logger.warn(`Failed to parse jobData.ctx: ${error.message}`);
      }

      const retryCount =
        parsedCtx?.workflow_context?.retry_attempt ||
        parsedPayload.ctx?.retry_count ||
        parsedPayload.ctx?.retryCount ||
        parseInt(jobData.retry_count || '0');

      logger.info(`🔍 Final retry_count determination:`, {
        from_jobData_ctx_workflow_context_retry_attempt: parsedCtx?.workflow_context?.retry_attempt,
        from_ctx_retry_count: parsedPayload.ctx?.retry_count,
        from_ctx_retryCount: parsedPayload.ctx?.retryCount,
        from_jobData_retry_count: jobData.retry_count,
        final_retryCount: retryCount
      });

      // Extract raw request payload from job result for forensics
      const rawRequestPayload = (result as any)?.raw_request_payload || null;

      const workerCompletionRecord = {
        job_id: jobId,
        worker_id: this.workerId,
        status: 'completed',
        completed_at: completedAt,
        result: JSON.stringify(sanitizedResult),
        raw_service_output: JSON.stringify(rawServiceOutput),
        raw_service_request: rawRequestPayload ? JSON.stringify(rawRequestPayload) : null, // 🆕 Add raw request for forensics
        retry_count: retryCount,
        workflow_id: jobData.workflow_id || null,
        current_step: jobData.current_step || null,
        total_steps: jobData.total_steps || null,
        machine_id: process.env.MACHINE_ID || 'unknown',
        worker_version: process.env.VERSION || 'unknown',
        attestation_created_at: Date.now()
      };

      // Store worker completion attestation with 7-day TTL for recovery
      await this.redis.setex(
        `worker:completion:${jobId}`,
        7 * 24 * 60 * 60, // 7 days
        JSON.stringify(workerCompletionRecord)
      );

      logger.info(`🔐 Worker ${this.workerId} created completion attestation for job ${jobId} (retry: ${workerCompletionRecord.retry_count})`);

      // Update job status
      await this.redis.hmset(`job:${jobId}`, {
        status: JobStatus.COMPLETED,
        completed_at: completedAt,
      });

      logger.info(`✅ Worker ${this.workerId} updated job:${jobId} status to COMPLETED`);

      // Remove from worker's active jobs
      await this.redis.hdel(`jobs:active:${this.workerId}`, jobId);

      // Store result
      await this.redis.hset(
        'jobs:completed',
        jobId,
        JSON.stringify({
          success: true,
          data: result,
          completed_at: new Date().toISOString(),
        })
      );
      await this.redis.expire('jobs:completed', 24 * 60 * 60); // 24 hours

      // Publish completion to progress stream
      const streamResult = await this.redis.xadd(
        `progress:${jobId}`,
        '*',
        'job_id',
        jobId,
        'worker_id',
        this.workerId,
        'status',
        'completed',
        'progress',
        '100',
        'message',
        'Job completed successfully',
        'completed_at',
        new Date().toISOString()
      );

      logger.info(
        `✅ Worker ${this.workerId} wrote completion to stream progress:${jobId} - ID: ${streamResult}`
      );

      // Publish completion event to Redis pub/sub for real-time delivery
      const completionEvent = {
        job_id: jobId,
        worker_id: this.workerId,
        progress: 100,
        status: 'completed',
        message: 'Job completed successfully',
        result: result,
        timestamp: Date.now(),
        // Include workflow fields for webhook service workflow tracking
        ...(jobData.workflow_id && { workflow_id: jobData.workflow_id }),
        ...(jobData.current_step && { current_step: parseInt(jobData.current_step) }),
        ...(jobData.total_steps && { total_steps: parseInt(jobData.total_steps) }),
        ...(jobData.workflow_priority && {
          workflow_priority: parseInt(jobData.workflow_priority),
        }),
        ...(jobData.workflow_datetime && {
          workflow_datetime: parseInt(jobData.workflow_datetime),
        }),
      };

      await this.redis.publish('complete_job', JSON.stringify(completionEvent));
      logger.info(
        `📢 Worker ${this.workerId} published completion event for job ${jobId}${jobData.workflow_id ? ` (workflow: ${jobData.workflow_id}, step: ${jobData.current_step}/${jobData.total_steps})` : ''}`
      );

      // Update worker status back to idle
      await this.updateWorkerStatus('idle');

      // CRITICAL FIX: Clear processing flag to allow new jobs

      logger.info(
        `Worker ${this.workerId} completed job ${jobId} via Redis-direct and cleared processing flag`
      );
    } catch (error) {
      logger.error(`Worker ${this.workerId} failed to complete job ${jobId}:`, error);
      // Clear processing flag even on error to prevent worker from being stuck
      throw error;
    }
  }

  /**
   * Fail a job via Redis
   */
  async failJob(jobId: string, error: string, canRetry = true): Promise<void> {
    try {
      logger.info(`🔥 [DEBUG] Redis client failJob called: jobId=${jobId}, canRetry=${canRetry}, error="${error}"`);

      const job = await this.getJob(jobId);
      if (!job) {
        logger.warn(`Worker ${this.workerId} cannot fail job ${jobId} - not found`);
        return;
      }

      logger.info(`🔥 [DEBUG] Job found: status=${job.status}, retry_count=${job.retry_count}, max_retries=${job.max_retries}`);

      const newRetryCount = job.retry_count + 1;
      const shouldRetry = canRetry && newRetryCount < job.max_retries;
      const failedAt = new Date().toISOString();

      logger.info(`🔥 [DEBUG] Calculated: newRetryCount=${newRetryCount}, shouldRetry=${shouldRetry} (canRetry=${canRetry} && ${newRetryCount} < ${job.max_retries})`);

      // 🚨 CRITICAL: Create persistent failure attestation FIRST (for permanent failures)
      // This ensures we have proof the worker processed it, even if downstream verification fails
      if (!shouldRetry) {
        const workerFailureRecord = {
          job_id: jobId,
          worker_id: this.workerId,
          status: 'failed',
          failed_at: failedAt,
          error: error,
          raw_service_output: null, // TODO: Capture failed service responses when available
          raw_service_request: null, // TODO: Capture request payload when available for failure cases
          retry_count: newRetryCount,
          workflow_id: job.workflow_id || null,
          current_step: job.current_step || null,
          total_steps: job.total_steps || null,
          machine_id: process.env.MACHINE_ID || 'unknown',
          worker_version: process.env.VERSION || 'unknown',
          attestation_created_at: Date.now()
        };

        // Store worker failure attestation with 7-day TTL for recovery
        await this.redis.setex(
          `worker:completion:${jobId}`,
          7 * 24 * 60 * 60, // 7 days
          JSON.stringify(workerFailureRecord)
        );

        logger.info(`🔐 Worker ${this.workerId} created failure attestation for job ${jobId} (retry: ${newRetryCount})`);
      }

      if (shouldRetry) {
        // Return to queue for retry
        await this.redis.hmset(`job:${jobId}`, {
          status: JobStatus.PENDING,
          worker_id: '',
          assigned_at: '',
          retry_count: newRetryCount.toString(),
          last_failed_worker: this.workerId,
          failed_at: new Date().toISOString(),
        });

        // Re-add to pending queue with workflow-aware scoring (FIFO within priority)
        const effectivePriority = job.workflow_priority || job.priority;
        const effectiveDateTime = job.workflow_datetime || Date.parse(job.created_at);
        const score = effectivePriority * 1000000 + (Number.MAX_SAFE_INTEGER - effectiveDateTime);
        await this.redis.zadd('jobs:pending', score, jobId);

        logger.info(
          `Worker ${this.workerId} failed job ${jobId}, will retry (${newRetryCount}/${job.max_retries})`
        );
      } else {
        // Permanent failure
        logger.info(`🔥 [DEBUG] Setting job ${jobId} to FAILED status (shouldRetry=false)`);
        await this.redis.hmset(`job:${jobId}`, {
          status: JobStatus.FAILED,
          failed_at: new Date().toISOString(),
          retry_count: newRetryCount.toString(),
          last_failed_worker: this.workerId,
        });

        // Store in failed jobs
        await this.redis.hset(
          'jobs:failed',
          jobId,
          JSON.stringify({
            error,
            failed_at: new Date().toISOString(),
            retry_count: newRetryCount,
          })
        );
        await this.redis.expire('jobs:failed', 7 * 24 * 60 * 60); // 7 days

        logger.info(`🔥 [DEBUG] Job ${jobId} status updated to FAILED in Redis, stored in jobs:failed`);
        logger.info(
          `Worker ${this.workerId} permanently failed job ${jobId} after ${newRetryCount} attempts`
        );
      }

      // Remove from worker's active jobs
      await this.redis.hdel(`jobs:active:${this.workerId}`, jobId);

      // Publish failure to progress stream
      await this.redis.xadd(
        `progress:${jobId}`,
        '*',
        'job_id',
        jobId,
        'worker_id',
        this.workerId,
        'status',
        shouldRetry ? 'retrying' : 'failed',
        'message',
        error,
        'retry_count',
        newRetryCount.toString(),
        'will_retry',
        shouldRetry.toString(),
        'failed_at',
        new Date().toISOString()
      );

      // Publish job failure event for webhooks (for permanent failures only)
      if (!shouldRetry) {
        const failureEvent = {
          job_id: jobId,
          worker_id: this.workerId,
          status: 'failed',
          error: error,
          failed_at: new Date().toISOString(),
          retry_count: newRetryCount,
          can_retry: false,
          timestamp: Date.now(),
          // Include workflow fields for webhook service workflow tracking
          ...(job.workflow_id && { workflow_id: job.workflow_id }),
          ...(job.current_step && { current_step: job.current_step }),
          ...(job.total_steps && { total_steps: job.total_steps }),
          ...(job.workflow_priority && { workflow_priority: job.workflow_priority }),
          ...(job.workflow_datetime && { workflow_datetime: job.workflow_datetime }),
        };

        await this.redis.publish('job_failed', JSON.stringify(failureEvent));
        logger.info(
          `📢 Worker ${this.workerId} published failure event for job ${jobId}${job.workflow_id ? ` (workflow: ${job.workflow_id}, step: ${job.current_step}/${job.total_steps})` : ''}`
        );
      }

      // Update worker status back to idle
      await this.updateWorkerStatus('idle');

      // CRITICAL FIX: Clear processing flag to allow new jobs
    } catch (err) {
      logger.error(`Worker ${this.workerId} failed to fail job ${jobId}:`, err);
      // Clear processing flag even on error to prevent worker from being stuck
      throw err;
    }
  }

  /**
   * Start continuous job polling
   */
  startPolling(capabilities: WorkerCapabilities, onJobReceived: (job: Job) => void): void {
    const poll = async () => {
      try {
        if (!this.isConnected()) {
          logger.debug(`🔍 Worker ${this.workerId} - not connected, skipping poll`);
          return;
        }

        // Only poll for new jobs if we're not already busy (avoid wasteful Redis calls)
        if (this.currentStatus === 'idle') {
          const job = await this.requestJob(capabilities);
          if (job) {
            if (process.env.LOG_LEVEL === 'debug') {
              logger.debug(`Worker ${this.workerId} - received job: ${job.id}`);
            }
            onJobReceived(job);
          } else {
          }
        } else {
        }
      } catch (error) {
        logger.error(`Worker ${this.workerId} polling error:`, error);
      }

      // Schedule next poll
      this.pollTimeout = setTimeout(poll, this.pollIntervalMs);
    };

    // Start polling
    logger.info(
      `Worker ${this.workerId} starting Redis-direct job polling (${this.pollIntervalMs}ms interval, currentStatus: ${this.currentStatus})`
    );
    poll();
  }

  /**
   * Stop job polling
   */
  stopPolling(): void {
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = undefined;
      if (process.env.LOG_LEVEL === 'debug') {
        logger.debug(`Worker ${this.workerId} stopped job polling`);
      }
    }
  }

  /**
   * Publish machine lifecycle events to Redis
   */
  async publishMachineEvent(event: Record<string, unknown>): Promise<void> {
    try {
      const eventJson = JSON.stringify(event);
      logger.info(`📢 Publishing machine event to Redis channel 'machine:startup:events':`, {
        event_type: event.event_type,
        machine_id: event.machine_id,
        worker_id: event.worker_id,
        reason: event.reason,
        channel: 'machine:startup:events',
        payload_size: eventJson.length,
      });

      const result = await this.redis.publish('machine:startup:events', eventJson);

      logger.info(
        `✅ Machine event published successfully: ${event.event_type} for ${event.machine_id} (${result} subscribers received it)`
      );
    } catch (error) {
      logger.error(`❌ Failed to publish machine event:`, error);
      throw error;
    }
  }

  /**
   * Safely parse JSON, handling empty strings and malformed JSON
   */
  private safeJsonParse<T>(jsonString: unknown, defaultValue: T): T {
    if (typeof jsonString !== 'string') {
      return defaultValue;
    }

    const trimmed = jsonString.trim();
    if (trimmed === '') {
      return defaultValue;
    }

    try {
      return JSON.parse(trimmed);
    } catch (error) {
      logger.warn(`Failed to parse JSON: ${trimmed}`, error);
      return defaultValue;
    }
  }

  /**
   * Get the Redis connection for injection into connectors
   */
  getRedisConnection(): Redis | undefined {
    return this.isConnectedFlag ? this.redis : undefined;
  }

  /**
   * Create sanitized result for attestation - removes base64 data but keeps URLs
   * This prevents storing customer asset data in attestations
   */
  private createSanitizedResultForAttestation(result: any): any {
    return sanitizeBase64Data(result);
  }

  /**
   * Mask Redis URL for logging (hide password)
   */
  private maskRedisUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      if (urlObj.password) {
        urlObj.password = '***';
      }
      return urlObj.toString();
    } catch (_error) {
      // If URL parsing fails, just mask anything that looks like a password
      return url.replace(/:([^@:]+)@/, ':***@');
    }
  }
}
