// Redis Service Implementation - direct port from Python core/redis_service.py
// Maintains exact same Redis data structures and operations

import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { RedisServiceInterface } from './interfaces/redis-service.js';
import { Job, JobStatus, JobProgress, JobResult, JobFilter, JobSearchResult } from './types/job.js';
import { WorkerCapabilities, WorkerInfo, WorkerFilter, WorkerStatus } from './types/worker.js';
import { logger } from './utils/logger.js';

export class RedisService implements RedisServiceInterface {
  private redis: Redis;
  private subscriber: Redis;
  private isConnectedFlag = false;
  private subscriptions = new Map<string, (message) => void>();

  constructor(redisUrl: string) {
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
    logger.info('Redis service connected');
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
    jobData: Omit<Job, 'id' | 'created_at' | 'status' | 'retry_count'>
  ): Promise<string> {
    const jobId = uuidv4();
    const now = new Date().toISOString();

    const job: Job = {
      ...jobData,
      id: jobId,
      created_at: now,
      status: JobStatus.PENDING,
      retry_count: 0,
      max_retries: jobData.max_retries || 3,
    };

    // Store job details
    await this.redis.hmset(`job:${jobId}`, {
      id: job.id,
      type: job.type,
      priority: job.priority.toString(),
      payload: JSON.stringify(job.payload),
      requirements: job.requirements ? JSON.stringify(job.requirements) : '',
      customer_id: job.customer_id || '',
      created_at: job.created_at,
      status: job.status,
      retry_count: job.retry_count.toString(),
      max_retries: job.max_retries.toString(),
    });

    // Add to priority queue - matches Python's score calculation
    const score = job.priority * 1000 + Date.now();
    await this.redis.zadd('jobs:pending', score, jobId);

    logger.info(`Job ${jobId} submitted with priority ${job.priority}`);
    return jobId;
  }

  async getJob(jobId: string): Promise<Job | null> {
    const jobData = await this.redis.hgetall(`job:${jobId}`);
    if (!jobData.id) return null;

    return {
      id: jobData.id,
      type: jobData.type,
      priority: parseInt(jobData.priority),
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
  }

  async updateJobStatus(jobId: string, status: JobStatus): Promise<void> {
    const updateData: Record<string, string> = { status };

    if (status === JobStatus.COMPLETED) {
      updateData.completed_at = new Date().toISOString();
    } else if (status === JobStatus.FAILED) {
      updateData.failed_at = new Date().toISOString();
    } else if (status === JobStatus.IN_PROGRESS) {
      updateData.started_at = new Date().toISOString();
    }

    await this.redis.hmset(`job:${jobId}`, updateData);

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
    await this.publishMessage('job_progress', progress);
  }

  async completeJob(jobId: string, result: JobResult): Promise<void> {
    const now = new Date().toISOString();

    // Update job status
    await this.redis.hmset(`job:${jobId}`, {
      status: JobStatus.COMPLETED,
      completed_at: now,
      processing_time: result.processing_time?.toString() || '',
    });

    // Store result with TTL (24 hours like Python version)
    await this.redis.hset('jobs:completed', jobId, JSON.stringify(result));
    await this.redis.expire('jobs:completed', 24 * 60 * 60);

    // Remove from active jobs
    const job = await this.getJob(jobId);
    if (job?.worker_id) {
      await this.redis.hdel(`jobs:active:${job.worker_id}`, jobId);
    }

    // Publish completion
    await this.publishMessage('job_completed', {
      job_id: jobId,
      result,
      completed_at: now,
    });

    logger.info(`Job ${jobId} completed successfully`);
  }

  async failJob(jobId: string, error: string, canRetry = true): Promise<void> {
    const job = await this.getJob(jobId);
    if (!job) return;

    // Don't retry cancelled jobs - they should stay cancelled
    if (job.status === JobStatus.CANCELLED) {
      logger.info(`Job ${jobId} is already cancelled, ignoring failure`);
      return;
    }

    const now = new Date().toISOString();
    const newRetryCount = job.retry_count + 1;
    const shouldRetry = canRetry && newRetryCount < job.max_retries;

    // Update job
    const updateData: Record<string, string> = {
      retry_count: newRetryCount.toString(),
      failed_at: now,
    };

    if (shouldRetry) {
      updateData.status = JobStatus.PENDING;
      updateData.last_failed_worker = job.worker_id || '';
      updateData.worker_id = ''; // Clear worker assignment
      updateData.assigned_at = ''; // Clear assignment time
      // Re-add to queue with same priority
      const score = job.priority * 1000 + Date.now();
      await this.redis.zadd('jobs:pending', score, jobId);
    } else {
      updateData.status = JobStatus.FAILED;
      updateData.worker_id = ''; // Clear worker assignment
      // Store in failed jobs with TTL (7 days like Python version)
      await this.redis.hset(
        'jobs:failed',
        jobId,
        JSON.stringify({
          error,
          failed_at: now,
          retry_count: newRetryCount,
        })
      );
      await this.redis.expire('jobs:failed', 7 * 24 * 60 * 60);
    }

    await this.redis.hmset(`job:${jobId}`, updateData);

    // Remove from active jobs - be more thorough
    if (job.worker_id) {
      const removed = await this.redis.hdel(`jobs:active:${job.worker_id}`, jobId);
      logger.debug(
        `Removed job ${jobId} from active jobs for worker ${job.worker_id}: ${removed > 0 ? 'success' : 'not found'}`
      );
    }

    // Also check if job is in any other worker's active jobs (cleanup orphaned entries)
    const allActiveKeys = await this.redis.keys('jobs:active:*');
    for (const key of allActiveKeys) {
      const removed = await this.redis.hdel(key, jobId);
      if (removed > 0) {
        const workerId = key.replace('jobs:active:', '');
        logger.warn(`Cleaned up orphaned job ${jobId} from worker ${workerId}'s active jobs`);
      }
    }

    // Publish failure
    await this.publishMessage('job_failed', {
      job_id: jobId,
      error,
      retry_count: newRetryCount,
      will_retry: shouldRetry,
      failed_at: now,
    });

    logger.info(`Job ${jobId} failed: ${error} (retry ${newRetryCount}/${job.max_retries})`);
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
    // Remove from pending queue atomically
    const removed = await this.redis.zrem('jobs:pending', jobId);
    if (removed === 0) return false;

    const now = new Date().toISOString();

    // Update job with worker assignment
    await this.redis.hmset(`job:${jobId}`, {
      worker_id: workerId,
      status: JobStatus.ASSIGNED,
      assigned_at: now,
    });

    // Add to worker's active jobs
    const job = await this.getJob(jobId);
    if (job) {
      await this.redis.hset(`jobs:active:${workerId}`, jobId, JSON.stringify(job));
    }

    logger.info(`Job ${jobId} claimed by worker ${workerId}`);
    return true;
  }

  async releaseJob(jobId: string): Promise<void> {
    const job = await this.getJob(jobId);
    if (!job) return;

    // Remove from worker's active jobs
    if (job.worker_id) {
      await this.redis.hdel(`jobs:active:${job.worker_id}`, jobId);
    }

    // Return to pending queue
    const score = job.priority * 1000 + Date.now();
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
    // Get jobs from pending queue (highest priority first)
    const jobIds = await this.redis.zrevrange('jobs:pending', 0, 9); // Check top 10 jobs

    for (const jobId of jobIds) {
      const job = await this.getJob(jobId);
      if (!job) continue;

      // Check if worker can handle this job
      if (await this.canWorkerHandleJob(job, workerCapabilities)) {
        // Try to claim the job
        const claimed = await this.claimJob(jobId, workerCapabilities.worker_id);
        if (claimed) {
          return job;
        }
      }
    }

    return null;
  }

  private async canWorkerHandleJob(job: Job, capabilities: WorkerCapabilities): Promise<boolean> {
    // Check if worker was the last to fail this job
    if (job.last_failed_worker === capabilities.worker_id) {
      return false;
    }

    // Check service type compatibility - job.type is the primary service type
    if (job.type && !capabilities.services.includes(job.type)) {
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
      if (hw.cpu_cores && hw.cpu_cores !== 'all' && capabilities.hardware.cpu_cores < hw.cpu_cores)
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

    // Get all active jobs across all workers
    const workerKeys = await this.redis.keys('jobs:active:*');
    const allJobs: Job[] = [];

    for (const key of workerKeys) {
      const jobData = await this.redis.hgetall(key);
      allJobs.push(...Object.values(jobData).map(data => JSON.parse(data)));
    }

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

  // Placeholder implementations for remaining interface methods
  async getCompletedJobs(_limit = 50): Promise<Job[]> {
    return [];
  }
  async getFailedJobs(_limit = 50): Promise<Job[]> {
    return [];
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
    _workerId: string,
    _status: string,
    _currentJobs?: string[]
  ): Promise<void> {}
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
