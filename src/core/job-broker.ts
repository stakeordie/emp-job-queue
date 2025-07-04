// JobBroker implementation - priority + FIFO job selection with workflow inheritance
// Implements the core job matching algorithm from emp-redis

import { v4 as uuidv4 } from 'uuid';
import { RedisService } from './redis-service.js';
import { JobBrokerInterface } from './interfaces/job-broker.js';
import { Job, JobSubmissionRequest, JobStatus, WorkflowMetadata } from './types/job.js';
import { WorkerCapabilities } from './types/worker.js';
import { logger } from './utils/logger.js';

export class JobBroker implements JobBrokerInterface {
  private redis: RedisService;

  constructor(redisService: RedisService) {
    this.redis = redisService;
  }

  /**
   * Submit a job with workflow priority inheritance
   * If workflow_id is provided, inherits priority and datetime from workflow
   * Otherwise creates standalone job with current timestamp
   */
  async submitJob(request: JobSubmissionRequest): Promise<string> {
    const jobId = uuidv4();
    const currentTime = Date.now();

    let workflowPriority = request.priority || 50;
    let workflowDatetime = currentTime;
    const workflowId = request.workflow_id;

    // Handle workflow inheritance
    if (workflowId) {
      const metadata = await this.getWorkflowMetadata(workflowId);
      if (metadata) {
        // Inherit from existing workflow
        workflowPriority = metadata.priority;
        workflowDatetime = metadata.submitted_at;
        logger.info(
          `Job ${jobId} inheriting from workflow ${workflowId}: priority=${workflowPriority}, datetime=${workflowDatetime}`
        );
      } else {
        // Create new workflow if it doesn't exist
        await this.createWorkflow(workflowPriority, request.customer_id, workflowId);
        workflowDatetime = currentTime;
        logger.info(`Created new workflow ${workflowId} for job ${jobId}`);
      }
    } else if (request.workflow_priority !== undefined && request.workflow_datetime !== undefined) {
      // Explicit workflow inheritance (for jobs submitted as part of existing workflow)
      workflowPriority = request.workflow_priority;
      workflowDatetime = request.workflow_datetime;
    }

    const job: Omit<Job, 'id' | 'created_at' | 'status' | 'retry_count'> = {
      service_required: request.service_required,
      priority: workflowPriority,
      payload: request.payload,
      requirements: request.requirements,
      customer_id: request.customer_id,
      workflow_id: workflowId,
      workflow_priority: workflowPriority,
      workflow_datetime: workflowDatetime,
      step_number: request.step_number,
      max_retries: request.max_retries || 3,
    };

    // Submit job using Redis service (enhanced with workflow fields)
    const submittedJobId = await this.submitJobToRedis(
      jobId,
      job,
      workflowPriority,
      workflowDatetime
    );

    logger.info(
      `Job ${submittedJobId} submitted with workflow priority ${workflowPriority}, datetime ${workflowDatetime}`
    );
    return submittedJobId;
  }

  /**
   * Enhanced job submission to Redis with workflow-based scoring
   */
  private async submitJobToRedis(
    jobId: string,
    jobData: Omit<Job, 'id' | 'created_at' | 'status' | 'retry_count'>,
    workflowPriority: number,
    workflowDatetime: number
  ): Promise<string> {
    const now = new Date().toISOString();

    const job: Job = {
      ...jobData,
      id: jobId,
      created_at: now,
      status: JobStatus.PENDING,
      retry_count: 0,
    };

    // Store job details with workflow fields
    const jobRecord: Record<string, string> = {
      id: job.id,
      service_required: job.service_required,
      priority: job.priority.toString(),
      payload: JSON.stringify(job.payload),
      requirements: job.requirements ? JSON.stringify(job.requirements) : '',
      customer_id: job.customer_id || '',
      workflow_id: job.workflow_id || '',
      workflow_priority: job.workflow_priority?.toString() || '',
      workflow_datetime: job.workflow_datetime?.toString() || '',
      step_number: job.step_number?.toString() || '',
      created_at: job.created_at,
      status: job.status,
      retry_count: job.retry_count.toString(),
      max_retries: job.max_retries.toString(),
    };

    await this.redis['redis'].hmset(`job:${jobId}`, jobRecord);

    // Critical: Use workflow-based scoring for proper priority inheritance
    // Score = priority * 1000000 + workflowDatetime
    // This ensures workflow steps stay grouped together
    const score = workflowPriority * 1000000 + (Number.MAX_SAFE_INTEGER - workflowDatetime);
    await this.redis['redis'].zadd('jobs:pending', score, jobId);

    logger.debug(
      `Job ${jobId} added to queue with score ${score} (priority=${workflowPriority}, datetime=${workflowDatetime})`
    );
    return jobId;
  }

  /**
   * Get next job for worker using simple FIFO selection
   * Phase 1A: Removed capability matching - any worker takes any job
   */
  async getNextJobForWorker(workerCapabilities: WorkerCapabilities): Promise<Job | null> {
    // Simple approach: get highest priority job (FIFO within priority)
    const jobIds = await this.redis['redis'].zrevrange('jobs:pending', 0, 0);

    if (jobIds.length === 0) {
      logger.debug(`No pending jobs available for worker ${workerCapabilities.worker_id}`);
      return null;
    }

    const jobId = jobIds[0];
    const job = await this.redis.getJob(jobId);

    if (!job) {
      logger.warn(`Job ${jobId} not found, cleaning from queue`);
      await this.redis['redis'].zrem('jobs:pending', jobId);
      return null;
    }

    // Try to claim job atomically (no capability check)
    const claimed = await this.claimJob(jobId, workerCapabilities.worker_id);
    if (claimed) {
      logger.info(
        `Worker ${workerCapabilities.worker_id} claimed job ${jobId} (any-worker-any-job mode)`
      );
      return job;
    } else {
      logger.debug(`Job ${jobId} already claimed by another worker`);
      return null;
    }
  }

  // Phase 1A: Removed capability matching methods - no longer needed for any-worker-any-job

  /**
   * Requeue an unworkable job (e.g., after new workers join or capabilities change)
   */
  async requeueUnworkableJob(jobId: string): Promise<boolean> {
    const job = await this.redis.getJob(jobId);
    if (!job || job.status !== JobStatus.UNWORKABLE) {
      return false;
    }

    // Phase 1A: Skip capability checking - any worker can handle any job
    logger.info(`Job ${jobId} being re-queued - any worker can handle it now`);

    // Move back to pending queue
    await this.redis['redis'].zrem('jobs:unworkable', jobId);

    // Use workflow-based scoring like other jobs
    const workflowPriority = job.workflow_priority || job.priority;
    const workflowDatetime = job.workflow_datetime || Date.now();
    const score = workflowPriority * 1000000 + (Number.MAX_SAFE_INTEGER - workflowDatetime);

    await this.redis['redis'].zadd('jobs:pending', score, jobId);

    // Update job status
    await this.redis.updateJobStatus(jobId, JobStatus.PENDING);

    logger.info(`Job ${jobId} requeued from unworkable to pending`);
    return true;
  }

  /**
   * Atomic job claiming to prevent race conditions
   */
  async claimJob(jobId: string, workerId: string): Promise<boolean> {
    return await this.redis.claimJob(jobId, workerId);
  }

  /**
   * Release job back to queue
   */
  async releaseJob(jobId: string): Promise<void> {
    const job = await this.redis.getJob(jobId);
    if (!job) return;

    // Preserve workflow-based scoring when releasing
    const score =
      (job.workflow_priority || job.priority) * 1000000 +
      (Number.MAX_SAFE_INTEGER - (job.workflow_datetime || Date.now()));

    await this.redis['redis'].zadd('jobs:pending', score, jobId);
    await this.redis['redis'].hmset(`job:${jobId}`, {
      worker_id: '',
      status: JobStatus.PENDING,
      assigned_at: '',
    });

    logger.info(`Job ${jobId} released back to queue with score ${score}`);
  }

  /**
   * Create or update workflow metadata
   */
  async createWorkflow(
    priority: number,
    customerId?: string,
    workflowId?: string
  ): Promise<string> {
    const id = workflowId || uuidv4();
    const now = Date.now();

    const metadata: WorkflowMetadata = {
      workflow_id: id,
      priority,
      submitted_at: now,
      customer_id: customerId,
      status: 'active',
      total_steps: 0,
      completed_steps: 0,
    };

    await this.redis['redis'].hmset(`workflow:${id}:metadata`, {
      workflow_id: metadata.workflow_id,
      priority: metadata.priority.toString(),
      submitted_at: metadata.submitted_at.toString(),
      customer_id: metadata.customer_id || '',
      status: metadata.status,
      total_steps: metadata.total_steps?.toString() || '0',
      completed_steps: metadata.completed_steps?.toString() || '0',
    });

    // Set TTL for workflow metadata (24 hours)
    await this.redis['redis'].expire(`workflow:${id}:metadata`, 24 * 60 * 60);

    logger.info(`Workflow ${id} created with priority ${priority}`);
    return id;
  }

  /**
   * Get workflow metadata
   */
  async getWorkflowMetadata(workflowId: string): Promise<WorkflowMetadata | null> {
    const data = await this.redis['redis'].hgetall(`workflow:${workflowId}:metadata`);
    if (!data.workflow_id) return null;

    return {
      workflow_id: data.workflow_id,
      priority: parseInt(data.priority),
      submitted_at: parseInt(data.submitted_at),
      customer_id: data.customer_id || undefined,
      status: data.status as 'active' | 'completed' | 'failed',
      total_steps: data.total_steps ? parseInt(data.total_steps) : undefined,
      completed_steps: data.completed_steps ? parseInt(data.completed_steps) : undefined,
    };
  }

  /**
   * Update workflow status
   */
  async updateWorkflowStatus(
    workflowId: string,
    status: 'active' | 'completed' | 'failed'
  ): Promise<void> {
    await this.redis['redis'].hmset(`workflow:${workflowId}:metadata`, { status });
    logger.info(`Workflow ${workflowId} status updated to ${status}`);
  }

  /**
   * Get job position in queue (0-based)
   */
  async getQueuePosition(jobId: string): Promise<number> {
    return await this.redis.getJobQueuePosition(jobId);
  }

  /**
   * Get total queue depth
   */
  async getQueueDepth(): Promise<number> {
    return await this.redis['redis'].zcard('jobs:pending');
  }

  /**
   * Get job statistics
   */
  async getJobStatistics(): Promise<{
    pending: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    const [pending, completedKeys, failedKeys] = await Promise.all([
      this.redis['redis'].zcard('jobs:pending'),
      this.redis['redis'].hlen('jobs:completed'),
      this.redis['redis'].hlen('jobs:failed'),
    ]);

    const activeKeys = await this.redis['redis'].keys('jobs:active:*');
    let active = 0;
    for (const key of activeKeys) {
      active += await this.redis['redis'].hlen(key);
    }

    return {
      pending,
      active,
      completed: completedKeys,
      failed: failedKeys,
    };
  }

  /**
   * Get all connected workers (for monitor full state)
   */
  async getConnectedWorkers(): Promise<unknown[]> {
    try {
      const workerKeys = await this.redis['redis'].keys('workers:*');
      const workers = [];

      for (const key of workerKeys) {
        const workerId = key.replace('workers:', '');
        const workerData = await this.redis['redis'].hgetall(key);

        if (workerData && Object.keys(workerData).length > 0) {
          // Parse capabilities if it's a JSON string
          let capabilities = {};
          if (workerData.capabilities) {
            try {
              capabilities = JSON.parse(workerData.capabilities);
            } catch (_e) {
              capabilities = workerData.capabilities;
            }
          }

          workers.push({
            id: workerId,
            status: workerData.status || 'idle',
            capabilities,
            connected_at: workerData.connected_at || new Date().toISOString(),
            jobs_completed: parseInt(workerData.jobs_completed || '0'),
            jobs_failed: parseInt(workerData.jobs_failed || '0'),
            current_job_id: workerData.current_job_id || null,
            last_activity: workerData.last_activity || new Date().toISOString(),
          });
        }
      }

      return workers;
    } catch (error) {
      logger.error('Error getting connected workers:', error);
      return [];
    }
  }

  /**
   * Get all jobs (for monitor full state)
   */
  async getAllJobs(): Promise<unknown[]> {
    try {
      const jobs = [];

      // Get pending jobs from sorted set
      const pendingJobs = await this.redis['redis'].zrange('jobs:pending', 0, -1);
      for (const jobId of pendingJobs) {
        const jobData = await this.redis['redis'].hgetall(`job:${jobId}`);
        if (jobData && Object.keys(jobData).length > 0) {
          jobs.push(this.parseJobData(jobId, jobData, 'pending'));
        }
      }

      // Get active jobs
      const activeKeys = await this.redis['redis'].keys('jobs:active:*');
      for (const key of activeKeys) {
        const activeJobs = await this.redis['redis'].hgetall(key);
        for (const [jobId, jobDataStr] of Object.entries(activeJobs)) {
          try {
            const jobData = JSON.parse(jobDataStr as string);
            jobs.push(this.parseJobData(jobId, jobData, 'active'));
          } catch (e) {
            logger.error(`Error parsing active job ${jobId}:`, e);
          }
        }
      }

      // Get completed jobs (limit to last 100)
      const completedJobs = await this.redis['redis'].hgetall('jobs:completed');
      const completedEntries = Object.entries(completedJobs).slice(-100);
      for (const [jobId, jobDataStr] of completedEntries) {
        try {
          const jobData = JSON.parse(jobDataStr as string);
          jobs.push(this.parseJobData(jobId, jobData, 'completed'));
        } catch (e) {
          logger.error(`Error parsing completed job ${jobId}:`, e);
        }
      }

      // Get failed jobs (limit to last 100)
      const failedJobs = await this.redis['redis'].hgetall('jobs:failed');
      const failedEntries = Object.entries(failedJobs).slice(-100);
      for (const [jobId, jobDataStr] of failedEntries) {
        try {
          const jobData = JSON.parse(jobDataStr as string);
          jobs.push(this.parseJobData(jobId, jobData, 'failed'));
        } catch (e) {
          logger.error(`Error parsing failed job ${jobId}:`, e);
        }
      }

      return jobs;
    } catch (error) {
      logger.error('Error getting all jobs:', error);
      return [];
    }
  }

  /**
   * Parse job data from Redis into consistent format
   */
  private parseJobData(jobId: string, jobData: Record<string, unknown>, status: string): unknown {
    // Parse nested JSON fields
    let payload = {};
    let requirements = {};

    if (jobData.payload) {
      try {
        payload = JSON.parse(jobData.payload as string);
      } catch (_e) {
        payload = jobData.payload;
      }
    }

    if (jobData.requirements) {
      try {
        requirements = JSON.parse(jobData.requirements as string);
      } catch (_e) {
        requirements = jobData.requirements;
      }
    }

    return {
      id: jobId,
      job_type: (jobData.job_type as string) || 'unknown',
      status: status,
      priority: parseInt((jobData.priority as string) || '50'),
      payload,
      customer_id: jobData.customer_id as string,
      requirements,
      workflow_id: jobData.workflow_id as string,
      workflow_priority: jobData.workflow_priority
        ? parseInt(jobData.workflow_priority as string)
        : undefined,
      workflow_datetime: jobData.workflow_datetime
        ? parseInt(jobData.workflow_datetime as string)
        : undefined,
      step_number: jobData.step_number ? parseInt(jobData.step_number as string) : undefined,
      created_at: parseInt((jobData.created_at as string) || Date.now().toString()),
      assigned_at: jobData.assigned_at ? parseInt(jobData.assigned_at as string) : undefined,
      started_at: jobData.started_at ? parseInt(jobData.started_at as string) : undefined,
      completed_at: jobData.completed_at ? parseInt(jobData.completed_at as string) : undefined,
      worker_id: jobData.worker_id as string,
      progress: jobData.progress ? parseInt(jobData.progress as string) : undefined,
      result: jobData.result,
      error: jobData.error as string,
      failure_count: parseInt((jobData.failure_count as string) || '0'),
    };
  }
}
