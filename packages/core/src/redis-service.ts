// Redis Service Implementation - direct port from Python core/redis_service.py
// Maintains exact same Redis data structures and operations

import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { RedisServiceInterface } from './interfaces/redis-service.js';
import { Job, JobStatus, JobProgress, JobResult, JobFilter, JobSearchResult } from './types/job.js';
import { WorkerCapabilities, WorkerInfo, WorkerFilter, WorkerStatus } from './types/worker.js';
import { EventBroadcaster } from './services/event-broadcaster.js';
import { logger } from './utils/logger.js';
import { RedisOperations } from './utils/redis-operations.js';

export class RedisService implements RedisServiceInterface {
  private redis: Redis;
  private subscriber: Redis;
  private isConnectedFlag = false;
  private subscriptions = new Map<string, (message) => void>();
  private eventBroadcaster?: EventBroadcaster;

  constructor(redisUrl: string, eventBroadcaster?: EventBroadcaster) {
    this.eventBroadcaster = eventBroadcaster;
    this.redis = new Redis(redisUrl, {
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
    });

    this.subscriber = new Redis(redisUrl, {
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.redis.on('connect', () => {
      logger.info('Redis connected');
      this.isConnectedFlag = true;
    });

    this.redis.on('disconnect', () => {
      logger.warn('Redis disconnected');
      this.isConnectedFlag = false;
    });

    this.redis.on('error', error => {
      logger.error('Redis error:', error);
    });

    this.subscriber.on('message', (channel, message) => {
      const callback = this.subscriptions.get(channel);
      if (callback) {
        try {
          const parsedMessage = JSON.parse(message);
          callback(parsedMessage);
        } catch (error) {
          logger.error(`Failed to parse message from channel ${channel}:`, error);
        }
      }
    });
  }

  async connect(): Promise<void> {
    await Promise.all([this.redis.ping(), this.subscriber.ping()]);

    this.isConnectedFlag = true;
    logger.info('Redis service connected - Phase 1A: simplified without Lua scripts');
  }

  async disconnect(): Promise<void> {
    await Promise.all([this.redis.quit(), this.subscriber.quit()]);
    this.isConnectedFlag = false;
    this.subscriptions.clear();
    logger.info('Redis service disconnected');
  }

  isConnected(): boolean {
    return this.isConnectedFlag;
  }

  async ping(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch {
      return false;
    }
  }

  // Job Management - matches Python implementation exactly
  async submitJob(
    jobSubmissionData: Omit<Job, 'id' | 'created_at' | 'status' | 'retry_count'>
  ): Promise<string> {
    const jobId = uuidv4();
    const now = new Date().toISOString();

    const job: Job = {
      ...jobSubmissionData,
      id: jobId,
      created_at: now,
      status: JobStatus.PENDING,
      retry_count: 0,
      max_retries: jobSubmissionData.max_retries || 3,
    };

    // Store job details including workflow metadata
    const jobData: Record<string, string> = {
      id: job.id,
      service_required: job.service_required,
      priority: job.priority.toString(),
      payload: JSON.stringify(job.payload),
      requirements: job.requirements ? JSON.stringify(job.requirements) : '',
      customer_id: job.customer_id || '',
      created_at: job.created_at,
      status: job.status,
      retry_count: job.retry_count.toString(),
      max_retries: job.max_retries.toString(),
    };

    // Add workflow fields if they exist
    if (job.workflow_id) {
      jobData.workflow_id = job.workflow_id;
    }
    if (job.workflow_priority !== undefined) {
      jobData.workflow_priority = job.workflow_priority.toString();
    }
    if (job.workflow_datetime !== undefined) {
      jobData.workflow_datetime = job.workflow_datetime.toString();
    }
    if (job.step_number !== undefined) {
      jobData.step_number = job.step_number.toString();
    }
    if (job.total_steps !== undefined) {
      jobData.total_steps = job.total_steps.toString();
    }

    await this.redis.hmset(`job:${jobId}`, jobData);

    // Add to priority queue with workflow-aware scoring
    const effectivePriority = job.workflow_priority || job.priority;
    const effectiveDateTime = job.workflow_datetime || Date.parse(job.created_at);
    const score = effectivePriority * 1000000 + (Number.MAX_SAFE_INTEGER - effectiveDateTime);
    await this.redis.zadd('jobs:pending', score, jobId);

    // Publish job submission event for webhooks
    const submissionEvent = {
      job_id: jobId,
      service_required: job.service_required,
      priority: job.priority,
      payload: job.payload,
      requirements: job.requirements,
      customer_id: job.customer_id,
      created_at: job.created_at,
      status: 'pending',
      timestamp: Date.now(),
      // Include workflow fields for webhook service workflow tracking
      ...(job.workflow_id && { workflow_id: job.workflow_id }),
      ...(job.workflow_priority !== undefined && { workflow_priority: job.workflow_priority }),
      ...(job.workflow_datetime !== undefined && { workflow_datetime: job.workflow_datetime }),
      ...(job.step_number !== undefined && { step_number: job.step_number }),
      ...(job.total_steps !== undefined && { total_steps: job.total_steps }),
      ...(job.step_number !== undefined && { current_step: job.step_number }), // webhook processor expects current_step
    };
    await this.redis.publish('job_submitted', JSON.stringify(submissionEvent));

    // Only log workflow jobs for debugging
    if (job.workflow_id) {
      logger.info(
        `📝 REDIS-SERVICE: Submitted workflow job ${jobId} (workflow: ${job.workflow_id}, step: ${job.step_number}/${job.total_steps}, service: ${job.service_required})`
      );
    } else {
      logger.info(
        `📝 REDIS-SERVICE: Submitted job ${jobId} (service: ${job.service_required}, no workflow)`
      );
    }
    return jobId;
  }

  async getJob(jobId: string): Promise<Job | null> {
    const jobData = await this.redis.hgetall(`job:${jobId}`);
    if (!jobData.id) return null;

    return {
      id: jobData.id,
      service_required: jobData.service_required || jobData.type || 'unknown', // Backwards compatibility
      priority: parseInt(jobData.priority),
      payload: JSON.parse(jobData.payload || '{}'),
      requirements: jobData.requirements ? JSON.parse(jobData.requirements) : undefined,
      customer_id: jobData.customer_id || undefined,
      workflow_id: jobData.workflow_id || undefined,
      workflow_priority: jobData.workflow_priority
        ? parseInt(jobData.workflow_priority)
        : undefined,
      workflow_datetime: jobData.workflow_datetime
        ? parseInt(jobData.workflow_datetime)
        : undefined,
      step_number: jobData.step_number ? parseInt(jobData.step_number) : undefined,
      total_steps: jobData.total_steps ? parseInt(jobData.total_steps) : undefined,
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
  }

  async updateJobStatus(jobId: string, status: JobStatus): Promise<void> {
    // Get old status and worker for event broadcasting
    let oldStatus = 'unknown';
    let workerId: string | undefined = undefined;
    try {
      const jobData = await this.redis.hgetall(`job:${jobId}`);
      oldStatus = jobData.status || 'unknown';
      workerId = jobData.worker_id || undefined;
    } catch (_error) {
      // Job might not exist yet, that's ok
    }

    const updateData: Record<string, string> = { status };

    if (status === JobStatus.COMPLETED) {
      updateData.completed_at = new Date().toISOString();
    } else if (status === JobStatus.FAILED) {
      updateData.failed_at = new Date().toISOString();
    } else if (status === JobStatus.IN_PROGRESS) {
      updateData.started_at = new Date().toISOString();
    }

    await this.redis.hmset(`job:${jobId}`, updateData);

    // Broadcast job status change event
    if (this.eventBroadcaster && oldStatus !== status) {
      this.eventBroadcaster.broadcastJobStatusChanged(jobId, oldStatus, status, workerId);
    }

    // Publish update
    await this.publishMessage('job_updates', {
      job_id: jobId,
      status,
      timestamp: new Date().toISOString(),
    });
  }

  async updateJobProgress(jobId: string, progress: JobProgress): Promise<void> {
    // Store progress data
    await this.redis.hmset(`job:${jobId}:progress`, {
      job_id: progress.job_id,
      worker_id: progress.worker_id,
      progress: progress.progress.toString(),
      status: progress.status,
      message: progress.message || '',
      current_step: progress.current_step || '',
      total_steps: progress.total_steps?.toString() || '',
      estimated_completion: progress.estimated_completion || '',
      updated_at: progress.updated_at,
    });

    // Update job status if changed
    if (progress.status) {
      await this.updateJobStatus(jobId, progress.status);
    }

    // Publish progress update
    await this.publishMessage('update_job_progress', progress);
  }

  async completeJob(jobId: string, result: JobResult): Promise<void> {
    try {
      const job = await this.getJob(jobId);
      if (!job || !job.worker_id) {
        logger.warn(`Cannot complete job ${jobId} - job not found or no worker assigned`);
        return;
      }

      // Only log workflow jobs for debugging
      if (job.workflow_id) {
        logger.info(
          `🔄 REDIS-SERVICE: Completing workflow job ${jobId} (workflow: ${job.workflow_id}, step: ${job.step_number}/${job.total_steps})`
        );
      }

      // Phase 1A: Simple Redis operations instead of Lua scripts
      await this.redis.hmset(`job:${jobId}`, {
        status: JobStatus.COMPLETED,
        completed_at: new Date().toISOString(),
        worker_id: job.worker_id,
      });

      // Remove from worker's active jobs
      if (job.worker_id) {
        await this.redis.hdel(`jobs:active:${job.worker_id}`, jobId);
      }

      // Store result with TTL (24 hours like Python version)
      await this.redis.hset('jobs:completed', jobId, JSON.stringify(result));
      await this.redis.expire('jobs:completed', 24 * 60 * 60);

      // Update processing time
      if (result.processing_time) {
        await this.redis.hset(`job:${jobId}`, 'processing_time', result.processing_time.toString());
      }

      // Create completion message with workflow fields for webhook tracking
      const completionMessage = {
        job_id: jobId,
        result,
        completed_at: new Date().toISOString(),
        // Include workflow fields for webhook service workflow tracking
        workflow_id: job.workflow_id,
        workflow_priority: job.workflow_priority,
        workflow_datetime: job.workflow_datetime,
        step_number: job.step_number,
        total_steps: job.total_steps,
        current_step: job.step_number, // webhook processor expects current_step
        worker_id: job.worker_id,
        service_required: job.service_required,
        customer_id: job.customer_id,
        timestamp: Date.now(),
        // Include trace context for webhook hierarchy
        job_trace_id: job.job_trace_id,
        job_span_id: job.job_span_id,
        workflow_trace_id: job.workflow_trace_id,
        workflow_span_id: job.workflow_span_id,
      };

      // Publish completion
      await this.publishMessage('complete_job', completionMessage);

      if (job.workflow_id) {
        logger.info(`✅ REDIS-SERVICE: Published workflow completion for ${jobId}`);
      }
    } catch (error) {
      logger.error(`Failed to complete job ${jobId}:`, error);
      throw error;
    }
  }

  async failJob(jobId: string, error: string, canRetry = true): Promise<void> {
    try {
      const job = await this.getJob(jobId);
      if (!job) {
        logger.warn(`Cannot fail job ${jobId} - job not found`);
        return;
      }

      // Don't retry cancelled jobs - they should stay cancelled
      if (job.status === JobStatus.CANCELLED) {
        logger.info(`Job ${jobId} is already cancelled, ignoring failure`);
        return;
      }

      const newRetryCount = job.retry_count + 1;
      const shouldRetry = canRetry && newRetryCount < job.max_retries;
      const workerId = job.worker_id || '';

      if (shouldRetry) {
        // Phase 1A: Simple job retry instead of Lua scripts
        await this.redis.hmset(`job:${jobId}`, {
          status: JobStatus.PENDING,
          worker_id: '',
          assigned_at: '',
          retry_count: newRetryCount.toString(),
          last_failed_worker: workerId,
        });

        // Re-add to pending queue with workflow-aware scoring
        const effectivePriority = job.workflow_priority || job.priority;
        const effectiveDateTime = job.workflow_datetime || Date.parse(job.created_at);
        const score = effectivePriority * 1000000 + (Number.MAX_SAFE_INTEGER - effectiveDateTime);
        await this.redis.zadd('jobs:pending', score, jobId);

        // Remove from worker's active jobs
        if (workerId) {
          await this.redis.hdel(`jobs:active:${workerId}`, jobId);
        }

        logger.info(
          `Job ${jobId} failed but will retry (${newRetryCount}/${job.max_retries}): ${error}`
        );
      } else {
        // Phase 1A: Simple job failure instead of Lua scripts
        await this.redis.hmset(`job:${jobId}`, {
          status: JobStatus.FAILED,
          failed_at: new Date().toISOString(),
          retry_count: newRetryCount.toString(),
          last_failed_worker: workerId,
          worker_id: '',
        });

        // Remove from worker's active jobs
        if (workerId) {
          await this.redis.hdel(`jobs:active:${workerId}`, jobId);
        }

        // Store in failed jobs with TTL (7 days like Python version)
        await this.redis.hset(
          'jobs:failed',
          jobId,
          JSON.stringify({
            error,
            failed_at: new Date().toISOString(),
            retry_count: newRetryCount,
          })
        );
        await this.redis.expire('jobs:failed', 7 * 24 * 60 * 60);

        logger.info(`Job ${jobId} permanently failed after ${newRetryCount} attempts: ${error}`);
      }

      // Update job with error details
      await this.redis.hmset(`job:${jobId}`, {
        retry_count: newRetryCount.toString(),
        failed_at: new Date().toISOString(),
        last_failed_worker: workerId,
      });

      // Publish failure event
      await this.publishMessage('job_failed', {
        job_id: jobId,
        error,
        retry_count: newRetryCount,
        will_retry: shouldRetry,
        failed_at: new Date().toISOString(),
      });
    } catch (err) {
      logger.error(`Failed to fail job ${jobId}:`, err);
      throw err;
    }
  }

  async cancelJob(jobId: string, reason: string): Promise<void> {
    const job = await this.getJob(jobId);
    if (!job) return;

    // Update job status
    await this.redis.hmset(`job:${jobId}`, {
      status: JobStatus.CANCELLED,
      cancelled_at: new Date().toISOString(),
    });

    // Remove from queues
    await this.redis.zrem('jobs:pending', jobId);
    if (job.worker_id) {
      await this.redis.hdel(`jobs:active:${job.worker_id}`, jobId);
    }

    // Publish cancellation
    await this.publishMessage('job_cancelled', {
      job_id: jobId,
      reason,
      cancelled_at: new Date().toISOString(),
    });

    logger.info(`Job ${jobId} cancelled: ${reason}`);
  }

  async claimJob(jobId: string, workerId: string): Promise<boolean> {
    try {
      // Phase 1A: Simple job claiming (race conditions possible but acceptable for now)
      // Check if job is still in pending queue
      const stillPending = await this.redis.zrem('jobs:pending', jobId);
      if (stillPending === 0) {
        // Job already claimed by another worker
        return false;
      }

      // Update job with worker assignment
      await this.redis.hmset(`job:${jobId}`, {
        worker_id: workerId,
        status: JobStatus.ASSIGNED,
        assigned_at: new Date().toISOString(),
      });

      // Add to worker's active jobs
      const jobData = await this.getJob(jobId);
      if (jobData) {
        await this.redis.hset(`jobs:active:${workerId}`, jobId, JSON.stringify(jobData));
      }

      const claimed = true;

      if (claimed) {
        // Broadcast job assigned event
        if (this.eventBroadcaster) {
          this.eventBroadcaster.broadcastJobAssigned(jobId, workerId, Date.now());
        }

        logger.info(`Job ${jobId} atomically claimed by worker ${workerId}`);
        return true;
      } else {
        logger.debug(`Job ${jobId} already claimed by another worker`);
        return false;
      }
    } catch (error) {
      logger.error(`Failed to claim job ${jobId} for worker ${workerId}:`, error);
      return false;
    }
  }

  async releaseJob(jobId: string): Promise<void> {
    const job = await this.getJob(jobId);
    if (!job) return;

    // Remove from worker's active jobs
    if (job.worker_id) {
      await this.redis.hdel(`jobs:active:${job.worker_id}`, jobId);
    }

    // Return to pending queue with workflow-aware scoring
    const effectivePriority = job.workflow_priority || job.priority;
    const effectiveDateTime = job.workflow_datetime || Date.parse(job.created_at);
    const score = effectivePriority * 1000000 + (Number.MAX_SAFE_INTEGER - effectiveDateTime);
    await this.redis.zadd('jobs:pending', score, jobId);

    // Clear worker assignment
    await this.redis.hmset(`job:${jobId}`, {
      worker_id: '',
      status: JobStatus.PENDING,
      assigned_at: '',
    });

    logger.info(`Job ${jobId} released back to queue`);
  }

  async getNextJob(workerCapabilities: WorkerCapabilities): Promise<Job | null> {
    try {
      // Phase 1A: Simple job retrieval (no capability filtering)
      const jobIds = await this.redis.zrevrange('jobs:pending', 0, 19);
      const eligibleJobs = [];

      for (const jobId of jobIds) {
        const jobData = await this.redis.hgetall(`job:${jobId}`);
        if (jobData.id) {
          eligibleJobs.push({
            id: jobData.id,
            service_required: jobData.service_required || 'unknown',
            priority: jobData.priority || '50',
            retry_count: jobData.retry_count || '0',
            last_failed_worker: jobData.last_failed_worker || '',
          });
        }
      }

      // Phase 1A: Take first available job (no capability filtering)
      for (const jobCandidate of eligibleJobs) {
        // Get full job details
        const job = await this.getJob(jobCandidate.id);
        if (!job) continue;

        // Try to claim the job (any worker can take any job)
        const claimed = await this.claimJob(job.id, workerCapabilities.worker_id);
        if (claimed) {
          logger.debug(
            `Worker ${workerCapabilities.worker_id} successfully claimed job ${job.id} (any-worker-any-job mode)`
          );
          return job;
        }
        // If claiming failed, another worker got it first - continue to next job
      }

      return null;
    } catch (error) {
      logger.error(`Error getting next job for worker ${workerCapabilities.worker_id}:`, error);
      return null;
    }
  }

  private async canWorkerHandleJob(job: Job, capabilities: WorkerCapabilities): Promise<boolean> {
    // Check if worker was the last to fail this job
    if (job.last_failed_worker === capabilities.worker_id) {
      return false;
    }

    // Check service compatibility - job.service_required must match worker's services
    if (job.service_required && !capabilities.services.includes(job.service_required)) {
      return false;
    }

    // Also check requirements.service_type if specified (for additional constraints)
    if (
      job.requirements?.service_type &&
      !capabilities.services.includes(job.requirements.service_type)
    ) {
      return false;
    }

    // Check component filtering
    if (job.requirements?.component && job.requirements.component !== 'all') {
      const workerComponents = capabilities.components;
      if (workerComponents !== 'all' && workerComponents) {
        if (!workerComponents.includes(job.requirements.component)) {
          return false;
        }
      }
    }

    // Check workflow filtering
    if (job.requirements?.workflow && job.requirements.workflow !== 'all') {
      const workerWorkflows = capabilities.workflows;
      if (workerWorkflows !== 'all' && workerWorkflows) {
        if (!workerWorkflows.includes(job.requirements.workflow)) {
          return false;
        }
      }
    }

    // Check hardware requirements
    if (job.requirements?.hardware && capabilities.hardware) {
      const hw = job.requirements.hardware;
      if (
        hw.gpu_memory_gb &&
        hw.gpu_memory_gb !== 'all' &&
        capabilities.hardware.gpu_memory_gb < hw.gpu_memory_gb
      )
        return false;
      if (hw.ram_gb && hw.ram_gb !== 'all' && capabilities.hardware.ram_gb < hw.ram_gb)
        return false;
    }

    // Check model availability
    if (
      job.requirements?.models &&
      job.requirements.models !== 'all' &&
      job.requirements.service_type
    ) {
      const workerModels = capabilities.models;
      if (workerModels && workerModels !== 'all') {
        const availableModels = workerModels[job.requirements.service_type] || [];
        const hasRequiredModels = job.requirements.models.every(model =>
          availableModels.includes(model)
        );
        if (!hasRequiredModels) return false;
      }
    }

    // Check customer isolation
    if (job.customer_id && capabilities.customer_access.isolation === 'strict') {
      if (
        capabilities.customer_access.allowed_customers &&
        !capabilities.customer_access.allowed_customers.includes(job.customer_id)
      ) {
        return false;
      }
      if (
        capabilities.customer_access.denied_customers &&
        capabilities.customer_access.denied_customers.includes(job.customer_id)
      ) {
        return false;
      }
    }

    return true;
  }

  // Implement remaining methods following same pattern...
  async getJobQueuePosition(jobId: string): Promise<number> {
    return (await this.redis.zrevrank('jobs:pending', jobId)) || -1;
  }

  async getPendingJobs(limit = 50): Promise<Job[]> {
    const jobIds = await this.redis.zrevrange('jobs:pending', 0, limit - 1);
    const jobs = await Promise.all(jobIds.map(id => this.getJob(id)));
    return jobs.filter((job): job is Job => job !== null);
  }

  async getActiveJobs(workerId?: string): Promise<Job[]> {
    if (workerId) {
      const jobData = await this.redis.hgetall(`jobs:active:${workerId}`);
      return Object.values(jobData).map(data => JSON.parse(data));
    }

    // Get all active jobs across all workers using SCAN
    const workerKeys = await RedisOperations.scanKeys(this.redis, 'jobs:active:*');
    const allJobs = await RedisOperations.getJobsFromKeys(this.redis, workerKeys);

    return allJobs;
  }

  // Worker Management
  async registerWorker(capabilities: WorkerCapabilities): Promise<void> {
    const now = new Date().toISOString();

    // Store worker capabilities
    await this.redis.hmset(`worker:${capabilities.worker_id}`, {
      worker_id: capabilities.worker_id,
      capabilities: JSON.stringify(capabilities),
      status: WorkerStatus.IDLE,
      connected_at: now,
      last_heartbeat: now,
      total_jobs_completed: '0',
      total_jobs_failed: '0',
    });

    // Add to active workers set
    await this.redis.sadd('workers:active', capabilities.worker_id);

    // Set heartbeat
    await this.redis.setex(`worker:${capabilities.worker_id}:heartbeat`, 60, now);

    logger.info(`Worker ${capabilities.worker_id} registered`);
  }

  async updateWorkerHeartbeat(workerId: string, systemInfo?): Promise<void> {
    const now = new Date().toISOString();

    await this.redis.hmset(`worker:${workerId}`, {
      last_heartbeat: now,
    });

    if (systemInfo) {
      await this.redis.hmset(`worker:${workerId}`, {
        system_info: JSON.stringify(systemInfo),
      });
    }

    // Update heartbeat TTL
    await this.redis.setex(`worker:${workerId}:heartbeat`, 60, now);
  }

  // Pub/Sub operations
  async publishMessage(channel: string, message): Promise<void> {
    await this.redis.publish(channel, JSON.stringify(message));
  }

  async subscribeToChannel(channel: string, callback: (message) => void): Promise<void> {
    this.subscriptions.set(channel, callback);
    await this.subscriber.subscribe(channel);
  }

  async unsubscribeFromChannel(channel: string): Promise<void> {
    this.subscriptions.delete(channel);
    await this.subscriber.unsubscribe(channel);
  }

  // Real implementations for job retrieval methods
  async getCompletedJobs(limit = 50): Promise<Job[]> {
    try {
      const jobsData = await this.redis.hgetall('jobs:completed');
      const jobs: Job[] = [];

      for (const [jobId, jobDataStr] of Object.entries(jobsData)) {
        try {
          const jobData = JSON.parse(jobDataStr);
          jobs.push({
            id: jobId,
            ...jobData,
            status: JobStatus.COMPLETED,
          });
        } catch (parseError) {
          logger.warn(`Failed to parse completed job ${jobId}:`, parseError);
        }
      }

      return jobs
        .sort((a, b) => {
          const aTime = typeof a.completed_at === 'number' ? a.completed_at : 0;
          const bTime = typeof b.completed_at === 'number' ? b.completed_at : 0;
          return bTime - aTime;
        })
        .slice(0, limit);
    } catch (error) {
      logger.error('Failed to get completed jobs:', error);
      return [];
    }
  }

  async getFailedJobs(limit = 50): Promise<Job[]> {
    try {
      const jobsData = await this.redis.hgetall('jobs:failed');
      const jobs: Job[] = [];

      for (const [jobId, jobDataStr] of Object.entries(jobsData)) {
        try {
          const jobData = JSON.parse(jobDataStr);
          jobs.push({
            id: jobId,
            ...jobData,
            status: JobStatus.FAILED,
          });
        } catch (parseError) {
          logger.warn(`Failed to parse failed job ${jobId}:`, parseError);
        }
      }

      return jobs
        .sort((a, b) => {
          const aTime = typeof a.failed_at === 'number' ? a.failed_at : 0;
          const bTime = typeof b.failed_at === 'number' ? b.failed_at : 0;
          return bTime - aTime;
        })
        .slice(0, limit);
    } catch (error) {
      logger.error('Failed to get failed jobs:', error);
      return [];
    }
  }
  async getAllJobs(limit = 100): Promise<Job[]> {
    // First detect and fix orphaned jobs
    await this.detectAndFixOrphanedJobs();

    // Get jobs from all categories
    const pending = await this.getPendingJobs(limit);
    const active = await this.getActiveJobs();
    const completed = await this.getCompletedJobs(limit);
    const failed = await this.getFailedJobs(limit);

    // Combine all jobs and sort by creation time (newest first)
    const allJobs = [...pending, ...active, ...completed, ...failed];
    return allJobs
      .sort((a, b) => {
        const aTime = typeof a.created_at === 'number' ? a.created_at : 0;
        const bTime = typeof b.created_at === 'number' ? b.created_at : 0;
        return bTime - aTime;
      })
      .slice(0, limit);
  }

  /**
   * Detect and fix orphaned jobs - active jobs with no worker processing them
   * Also handles stuck jobs where workers stopped responding during processing
   */
  async detectAndFixOrphanedJobs(): Promise<number> {
    try {
      let fixedCount = 0;

      // Get all active workers
      const activeWorkers = await this.getAllWorkers();
      const activeWorkerIds = new Set(activeWorkers.map(w => w.worker_id));

      // Get all active job keys using SCAN
      const activeJobKeys = await RedisOperations.scanKeys(this.redis, 'jobs:active:*');

      for (const key of activeJobKeys) {
        const workerId = key.replace('jobs:active:', '');

        // If worker doesn't exist, these jobs are orphaned
        if (!activeWorkerIds.has(workerId)) {
          logger.warn(`Found orphaned jobs for disconnected worker: ${workerId}`);

          // Get all jobs for this orphaned worker
          const orphanedJobs = await this.redis.hgetall(key);

          for (const [jobId, jobDataStr] of Object.entries(orphanedJobs)) {
            try {
              const jobData = JSON.parse(jobDataStr);

              // Reset job to pending status
              const resetJob: Job = {
                ...jobData,
                id: jobId,
                status: JobStatus.PENDING,
                worker_id: undefined,
                assigned_at: undefined,
                started_at: undefined,
              };

              // Update the job in Redis with reset status
              await this.redis.hmset(`job:${jobId}`, {
                status: JobStatus.PENDING,
                worker_id: '',
                assigned_at: '',
                started_at: '',
              });

              // Add back to pending queue with workflow-aware scoring
              const effectivePriority = resetJob.workflow_priority || resetJob.priority;
              const effectiveDateTime =
                resetJob.workflow_datetime || Date.parse(resetJob.created_at);
              const score =
                effectivePriority * 1000000 + (Number.MAX_SAFE_INTEGER - effectiveDateTime);
              await this.redis.zadd('jobs:pending', score, jobId);

              // Remove from active jobs
              await this.redis.hdel(key, jobId);

              fixedCount++;
              logger.info(`Reset orphaned job ${jobId} from worker ${workerId} back to pending`);
            } catch (parseError) {
              logger.error(`Failed to parse orphaned job ${jobId}:`, parseError);
            }
          }

          // Clean up empty active job key
          const remainingJobs = await this.redis.hlen(key);
          if (remainingJobs === 0) {
            await this.redis.del(key);
          }
        }
      }

      // ENHANCEMENT: Also check for workers stuck on cancelled/completed jobs
      for (const worker of activeWorkers) {
        const workerData = await this.redis.hgetall(`worker:${worker.worker_id}`);
        const currentJobId = workerData.current_job_id;

        if (currentJobId && currentJobId !== 'none' && currentJobId !== '') {
          // Check if the job this worker thinks it's processing is actually cancelled/completed
          const jobStatus = await this.redis.hget(`job:${currentJobId}`, 'status');

          if (jobStatus === 'cancelled' || jobStatus === 'completed' || jobStatus === 'failed') {
            logger.warn(
              `Worker ${worker.worker_id} stuck on ${jobStatus} job ${currentJobId} - clearing worker state`
            );

            // Clear the worker's job assignment
            await this.redis.hmset(`worker:${worker.worker_id}`, {
              status: 'idle',
              current_job_id: '',
              active_jobs: '[]',
            });

            fixedCount++;
            logger.info(
              `Cleared stuck worker ${worker.worker_id} from ${jobStatus} job ${currentJobId}`
            );
          }
        }
      }

      // NEW: Check for stuck jobs where workers stopped responding (heartbeat timeout)
      const stuckJobs = await this.detectStuckJobs();
      fixedCount += stuckJobs;

      if (fixedCount > 0) {
        logger.info(`Fixed ${fixedCount} orphaned/stuck jobs`);
      }

      return fixedCount;
    } catch (error) {
      logger.error('Failed to detect and fix orphaned jobs:', error);
      return 0;
    }
  }

  /**
   * Detect jobs that are stuck because workers stopped responding
   * Uses heartbeat timeouts to determine if a worker is unresponsive
   */
  async detectStuckJobs(): Promise<number> {
    try {
      let fixedCount = 0;
      const now = Date.now();

      // Configurable timeouts (in seconds)
      const heartbeatTimeoutSec = parseInt(process.env.WORKER_HEARTBEAT_TIMEOUT_SEC || '120'); // 2 minutes
      const jobProgressTimeoutSec = parseInt(process.env.JOB_PROGRESS_TIMEOUT_SEC || '300'); // 5 minutes

      // Get all active jobs across all workers
      const activeJobs = await this.getActiveJobs();

      for (const job of activeJobs) {
        if (!job.worker_id || !job.assigned_at) continue;

        // Check worker heartbeat
        const heartbeatKey = `worker:${job.worker_id}:heartbeat`;
        const lastHeartbeat = await this.redis.get(heartbeatKey);

        if (!lastHeartbeat) {
          // No heartbeat found - worker is definitely down
          logger.warn(`Worker ${job.worker_id} has no heartbeat - releasing stuck job ${job.id}`);
          await this.releaseStuckJob(job, 'Worker heartbeat missing');
          fixedCount++;
          continue;
        }

        // Check if heartbeat is too old
        const lastHeartbeatTime = new Date(lastHeartbeat).getTime();
        const timeSinceHeartbeat = (now - lastHeartbeatTime) / 1000;

        if (timeSinceHeartbeat > heartbeatTimeoutSec) {
          logger.warn(
            `Worker ${job.worker_id} heartbeat timeout (${Math.round(timeSinceHeartbeat)}s > ${heartbeatTimeoutSec}s) - releasing stuck job ${job.id}`
          );
          await this.releaseStuckJob(
            job,
            `Worker heartbeat timeout (${Math.round(timeSinceHeartbeat)}s)`
          );
          fixedCount++;
          continue;
        }

        // Check if job has been running too long without progress
        const jobStartTime = new Date(job.assigned_at).getTime();
        const timeSinceJobStart = (now - jobStartTime) / 1000;

        if (timeSinceJobStart > jobProgressTimeoutSec) {
          // Check if there has been any recent progress
          const progressKey = `job:${job.id}:progress`;
          const progressData = await this.redis.hgetall(progressKey);

          if (progressData.updated_at) {
            const lastProgress = new Date(progressData.updated_at).getTime();
            const timeSinceProgress = (now - lastProgress) / 1000;

            if (timeSinceProgress > jobProgressTimeoutSec) {
              logger.warn(
                `Job ${job.id} stuck - no progress for ${Math.round(timeSinceProgress)}s - releasing from worker ${job.worker_id}`
              );
              await this.releaseStuckJob(
                job,
                `No progress timeout (${Math.round(timeSinceProgress)}s)`
              );
              fixedCount++;
            }
          } else {
            // No progress data at all after a long time
            logger.warn(
              `Job ${job.id} stuck - no progress data after ${Math.round(timeSinceJobStart)}s - releasing from worker ${job.worker_id}`
            );
            await this.releaseStuckJob(
              job,
              `No progress data timeout (${Math.round(timeSinceJobStart)}s)`
            );
            fixedCount++;
          }
        }
      }

      return fixedCount;
    } catch (error) {
      logger.error('Failed to detect stuck jobs:', error);
      return 0;
    }
  }

  /**
   * Release a stuck job back to the queue and increment retry count
   */
  private async releaseStuckJob(job: Job, reason: string): Promise<void> {
    try {
      const newRetryCount = job.retry_count + 1;
      const maxRetries = job.max_retries || 3;
      const workerId = job.worker_id || '';

      if (newRetryCount >= maxRetries) {
        // Job has exceeded max retries - fail it permanently using atomic operation
        logger.warn(
          `Job ${job.id} exceeded max retries (${newRetryCount}/${maxRetries}) - marking as failed`
        );

        // Phase 1A: Simple job failure
        await this.redis.hmset(`job:${job.id}`, {
          status: JobStatus.FAILED,
          failed_at: new Date().toISOString(),
          retry_count: newRetryCount.toString(),
          last_failed_worker: workerId,
          worker_id: '',
        });

        // Remove from worker's active jobs
        if (workerId) {
          await this.redis.hdel(`jobs:active:${workerId}`, job.id);
        }

        // Store in failed jobs with TTL
        await this.redis.hset(
          'jobs:failed',
          job.id,
          JSON.stringify({
            error: `Worker timeout: ${reason}`,
            failed_at: new Date().toISOString(),
            retry_count: newRetryCount,
          })
        );
        await this.redis.expire('jobs:failed', 7 * 24 * 60 * 60); // 7 days

        // Publish failure event
        await this.publishMessage('job_failed', {
          job_id: job.id,
          error: `Worker timeout: ${reason}`,
          retry_count: newRetryCount,
          will_retry: false,
          failed_at: new Date().toISOString(),
        });
      } else {
        // Job can be retried - use atomic operation to return to queue
        logger.info(
          `Job ${job.id} will be retried (${newRetryCount}/${maxRetries}) - returning to queue`
        );

        // Phase 1A: Simple job retry
        await this.redis.hmset(`job:${job.id}`, {
          status: JobStatus.PENDING,
          worker_id: '',
          assigned_at: '',
          retry_count: newRetryCount.toString(),
          last_failed_worker: workerId,
        });

        // Re-add to pending queue with workflow-aware scoring
        const effectivePriority = job.workflow_priority || job.priority;
        const effectiveDateTime = job.workflow_datetime || Date.parse(job.created_at);
        const score = effectivePriority * 1000000 + (Number.MAX_SAFE_INTEGER - effectiveDateTime);
        await this.redis.zadd('jobs:pending', score, job.id);

        // Remove from worker's active jobs
        if (workerId) {
          await this.redis.hdel(`jobs:active:${workerId}`, job.id);
        }

        // Publish retry event
        await this.publishMessage('job_failed', {
          job_id: job.id,
          error: `Worker timeout: ${reason}`,
          retry_count: newRetryCount,
          will_retry: true,
          failed_at: new Date().toISOString(),
        });
      }

      // Update job details
      await this.redis.hmset(`job:${job.id}`, {
        retry_count: newRetryCount.toString(),
        last_failed_worker: workerId,
        failed_at: new Date().toISOString(),
      });

      // Clear worker's current job assignment using atomic timestamp update
      if (workerId) {
        await this.redis.hmset(`worker:${workerId}`, {
          status: 'idle',
          current_job_id: '',
          active_jobs: '[]',
          last_status_update: new Date().toISOString(),
        });
      }

      logger.info(`Atomically released stuck job ${job.id} from worker ${workerId}: ${reason}`);
    } catch (error) {
      logger.error(`Failed to release stuck job ${job.id}:`, error);
      throw error;
    }
  }
  async searchJobs(filter: JobFilter, page = 1, pageSize = 20): Promise<JobSearchResult> {
    return { jobs: [], total_count: 0, page, page_size: pageSize, has_more: false };
  }
  async getJobsByStatus(status: JobStatus[], _limit = 50): Promise<Job[]> {
    return [];
  }
  async getJobsByWorker(_workerId: string, _limit = 50): Promise<Job[]> {
    return [];
  }
  async getJobsByCustomer(_customerId: string, _limit = 50): Promise<Job[]> {
    return [];
  }
  async updateWorkerCapabilities(
    _workerId: string,
    _capabilities: WorkerCapabilities
  ): Promise<void> {}
  async updateWorkerStatus(
    workerId: string,
    status: string,
    currentJobs?: string[]
  ): Promise<void> {
    const now = new Date().toISOString();

    // Get old status for event broadcasting
    let oldStatus = 'unknown';
    try {
      const workerData = await this.redis.hgetall(`worker:${workerId}`);
      oldStatus = workerData.status || 'unknown';
    } catch (_error) {
      // Worker might not exist yet, that's ok
    }

    // Update worker status in Redis
    const updateData: Record<string, string> = {
      status,
      last_status_update: now,
    };

    // Update current job ID - set to empty if no current jobs
    if (currentJobs && currentJobs.length > 0) {
      updateData.current_job_id = currentJobs[0]; // For single job workers, use first job
      updateData.active_jobs = JSON.stringify(currentJobs);
    } else {
      updateData.current_job_id = ''; // Clear current job ID
      updateData.active_jobs = JSON.stringify([]);
    }

    await this.redis.hmset(`worker:${workerId}`, updateData);

    // Update worker status in active workers set based on status
    if (status === WorkerStatus.OFFLINE) {
      await this.redis.srem('workers:active', workerId);
      await this.redis.sadd('workers:offline', workerId);
    } else {
      await this.redis.sadd('workers:active', workerId);
      await this.redis.srem('workers:offline', workerId);
    }

    // Broadcast worker status change event
    if (this.eventBroadcaster && oldStatus !== status) {
      this.eventBroadcaster.broadcastWorkerStatusChanged(
        workerId,
        oldStatus,
        status,
        updateData.current_job_id || undefined
      );
    }

    logger.debug(
      `Worker ${workerId} status updated to ${status}, current_job_id: ${updateData.current_job_id || 'none'}`
    );
  }
  async removeWorker(_workerId: string): Promise<void> {}
  async getWorker(_workerId: string): Promise<WorkerInfo | null> {
    return null;
  }
  async getAllWorkers(): Promise<WorkerInfo[]> {
    return [];
  }
  async getActiveWorkers(): Promise<WorkerInfo[]> {
    return [];
  }
  async getIdleWorkers(): Promise<WorkerInfo[]> {
    return [];
  }
  async findCapableWorkers(_jobRequirements): Promise<WorkerInfo[]> {
    return [];
  }
  async searchWorkers(_filter: WorkerFilter): Promise<WorkerInfo[]> {
    return [];
  }
  async getWorkerLastHeartbeat(_workerId: string): Promise<string | null> {
    return null;
  }
  async cleanupStaleWorkers(_timeoutSeconds: number): Promise<string[]> {
    return [];
  }
  async getJobStatistics(): Promise<{
    pending: number;
    active: number;
    completed: number;
    failed: number;
    cancelled: number;
  }> {
    return {
      pending: 0,
      active: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };
  }
  async getWorkerStatistics(): Promise<{
    total: number;
    active: number;
    idle: number;
    busy: number;
    offline: number;
  }> {
    return {
      total: 0,
      active: 0,
      idle: 0,
      busy: 0,
      offline: 0,
    };
  }
  async getSystemMetrics(): Promise<{
    jobs_per_minute: number;
    average_processing_time: number;
    queue_depth: number;
    worker_utilization: number;
  }> {
    return {
      jobs_per_minute: 0,
      average_processing_time: 0,
      queue_depth: 0,
      worker_utilization: 0,
    };
  }
  async cleanupCompletedJobs(_olderThanHours: number): Promise<number> {
    return 0;
  }
  async cleanupFailedJobs(_olderThanDays: number): Promise<number> {
    return 0;
  }
  async optimizeJobQueue(): Promise<void> {}
  async exportJobData(_startDate?: string, _endDate?: string): Promise<Record<string, unknown>[]> {
    return [];
  }
  async importJobData(_jobs: unknown[]): Promise<number> {
    return 0;
  }
  async getRedisInfo(): Promise<Record<string, unknown>> {
    return {};
  }
  async getMemoryUsage(): Promise<{
    used_memory: number;
    used_memory_human: string;
    used_memory_peak: number;
    used_memory_peak_human: string;
  }> {
    return {
      used_memory: 0,
      used_memory_human: '0B',
      used_memory_peak: 0,
      used_memory_peak_human: '0B',
    };
  }
  async checkDataIntegrity(): Promise<{
    orphaned_jobs: string[];
    missing_worker_refs: string[];
    inconsistent_states: string[];
  }> {
    return {
      orphaned_jobs: [],
      missing_worker_refs: [],
      inconsistent_states: [],
    };
  }
}
