// Redis-Direct Worker Client - Phase 1B Implementation
// Workers poll Redis directly, no WebSocket to hub required

import Redis from 'ioredis';
import { WorkerCapabilities } from '../core/types/worker.js';
import { Job, JobProgress, JobStatus } from '../core/types/job.js';
import { logger } from '../core/utils/logger.js';

export class RedisDirectWorkerClient {
  private redis: Redis;
  private workerId: string;
  private hubRedisUrl: string;
  private isConnectedFlag = false;
  private pollIntervalMs: number;
  private heartbeatIntervalMs: number;
  private pollTimeout?: NodeJS.Timeout;
  private heartbeatTimeout?: NodeJS.Timeout;

  constructor(hubRedisUrl: string, workerId: string) {
    this.hubRedisUrl = hubRedisUrl;
    this.workerId = workerId;

    // Configuration from environment
    this.pollIntervalMs = parseInt(process.env.WORKER_POLL_INTERVAL_MS || '1000');
    this.heartbeatIntervalMs = parseInt(process.env.WORKER_HEARTBEAT_INTERVAL_MS || '30000');

    this.redis = new Redis(hubRedisUrl, {
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.redis.on('connect', () => {
      logger.info(`Worker ${this.workerId} connected to Redis`);
      this.isConnectedFlag = true;
    });

    this.redis.on('disconnect', () => {
      logger.warn(`Worker ${this.workerId} disconnected from Redis`);
      this.isConnectedFlag = false;
    });

    this.redis.on('error', error => {
      logger.error(`Worker ${this.workerId} Redis error:`, error);
    });
  }

  async connect(capabilities: WorkerCapabilities): Promise<void> {
    try {
      await this.redis.ping();

      // Register worker capabilities in Redis
      await this.registerWorker(capabilities);

      // Start heartbeat
      this.startHeartbeat();

      this.isConnectedFlag = true;
      logger.info(`Worker ${this.workerId} connected and registered with Redis-direct mode`);
    } catch (error) {
      logger.error(`Failed to connect worker ${this.workerId}:`, error);
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

    // Remove worker from active set
    await this.redis.srem('workers:active', this.workerId);
    await this.redis.del(`worker:${this.workerId}`);
    await this.redis.del(`worker:${this.workerId}:heartbeat`);

    await this.redis.quit();
    this.isConnectedFlag = false;

    logger.info(`Worker ${this.workerId} disconnected from Redis`);
  }

  isConnected(): boolean {
    return this.isConnectedFlag;
  }

  /**
   * Register worker capabilities directly in Redis
   */
  private async registerWorker(capabilities: WorkerCapabilities): Promise<void> {
    const now = new Date().toISOString();

    // Store worker capabilities
    await this.redis.hmset(`worker:${this.workerId}`, {
      worker_id: this.workerId,
      capabilities: JSON.stringify(capabilities),
      status: 'idle',
      connected_at: now,
      last_heartbeat: now,
      total_jobs_completed: '0',
      total_jobs_failed: '0',
    });

    // Add to active workers set
    await this.redis.sadd('workers:active', this.workerId);

    // Set heartbeat
    await this.redis.setex(`worker:${this.workerId}:heartbeat`, 60, now);

    logger.info(`Worker ${this.workerId} registered capabilities in Redis`);
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
        old_status: 'unknown', // We don't track previous status in this client
        new_status: status,
        current_job_id: currentJobId || '',
        timestamp: Date.now(),
      };

      await this.redis.publish('worker_status', JSON.stringify(statusEvent));

      logger.info(
        `🔄 Worker ${this.workerId} status changed to: ${status}${currentJobId ? ` (job: ${currentJobId})` : ''}`
      );
      logger.info(`📢 Worker ${this.workerId} published status change event`);
    } catch (error) {
      logger.error(`Worker ${this.workerId} failed to update status to ${status}:`, error);
    }
  }

  /**
   * Poll Redis for jobs directly using simple FIFO
   */
  async requestJob(_capabilities: WorkerCapabilities): Promise<Job | null> {
    try {
      // Phase 1B: Simple Redis polling - get highest priority job
      const jobIds = await this.redis.zrevrange('jobs:pending', 0, 0);

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

      logger.info(`Worker ${this.workerId} claimed job ${jobId} via Redis-direct polling`);
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
        payload: JSON.parse(jobData.payload || '{}'),
        requirements: jobData.requirements ? JSON.parse(jobData.requirements) : undefined,
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

      logger.info(`✅ Worker ${this.workerId} updated Redis hash job:${jobId}:progress`);

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

      await this.redis.publish('job_progress', JSON.stringify(progressEvent));
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

      // Update worker status to busy (when starting job processing)
      await this.updateWorkerStatus('busy', jobId);

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

      // Update job status
      await this.redis.hmset(`job:${jobId}`, {
        status: JobStatus.COMPLETED,
        completed_at: new Date().toISOString(),
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
      };

      await this.redis.publish('job_progress', JSON.stringify(completionEvent));
      logger.info(`📢 Worker ${this.workerId} published completion event for job ${jobId}`);

      // Update worker status back to idle
      await this.updateWorkerStatus('idle');

      logger.info(`Worker ${this.workerId} completed job ${jobId} via Redis-direct`);
    } catch (error) {
      logger.error(`Worker ${this.workerId} failed to complete job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Fail a job via Redis
   */
  async failJob(jobId: string, error: string, canRetry = true): Promise<void> {
    try {
      const job = await this.getJob(jobId);
      if (!job) {
        logger.warn(`Worker ${this.workerId} cannot fail job ${jobId} - not found`);
        return;
      }

      const newRetryCount = job.retry_count + 1;
      const shouldRetry = canRetry && newRetryCount < job.max_retries;

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

      // Update worker status back to idle
      await this.updateWorkerStatus('idle');
    } catch (err) {
      logger.error(`Worker ${this.workerId} failed to fail job ${jobId}:`, err);
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
          return;
        }

        // CRITICAL FIX: Check if worker is already busy before requesting jobs
        const workerStatus = await this.getWorkerStatus();
        if (workerStatus === 'busy') {
          logger.debug(`Worker ${this.workerId} is ${workerStatus}, skipping job request`);
          // Schedule next poll
          this.pollTimeout = setTimeout(poll, this.pollIntervalMs);
          return;
        }

        const job = await this.requestJob(capabilities);
        if (job) {
          onJobReceived(job);
        }
      } catch (error) {
        logger.error(`Worker ${this.workerId} polling error:`, error);
      }

      // Schedule next poll
      this.pollTimeout = setTimeout(poll, this.pollIntervalMs);
    };

    // Start polling
    logger.info(
      `Worker ${this.workerId} starting Redis-direct job polling (${this.pollIntervalMs}ms interval)`
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
      logger.info(`Worker ${this.workerId} stopped job polling`);
    }
  }
}
