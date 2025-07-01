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
    const score = workflowPriority * 1000000 + workflowDatetime;
    await this.redis['redis'].zadd('jobs:pending', score, jobId);

    logger.debug(
      `Job ${jobId} added to queue with score ${score} (priority=${workflowPriority}, datetime=${workflowDatetime})`
    );
    return jobId;
  }

  /**
   * Get next job for worker using pull-based selection
   * Implements multi-dimensional capability matching
   */
  async getNextJobForWorker(workerCapabilities: WorkerCapabilities): Promise<Job | null> {
    // Get top 20 jobs to check (higher than Redis service default)
    const jobIds = await this.redis['redis'].zrevrange('jobs:pending', 0, 19);

    logger.debug(
      `Checking ${jobIds.length} pending jobs for worker ${workerCapabilities.worker_id}`
    );

    for (const jobId of jobIds) {
      const job = await this.redis.getJob(jobId);
      if (!job) {
        logger.warn(`Job ${jobId} not found, cleaning from queue`);
        await this.redis['redis'].zrem('jobs:pending', jobId);
        continue;
      }

      // Check worker capability match
      if (await this.canWorkerHandleJob(job, workerCapabilities)) {
        // Try to claim job atomically
        const claimed = await this.claimJob(jobId, workerCapabilities.worker_id);
        if (claimed) {
          logger.info(
            `Worker ${workerCapabilities.worker_id} claimed job ${jobId} (workflow: ${job.workflow_id || 'none'})`
          );
          return job;
        } else {
          logger.debug(`Job ${jobId} already claimed by another worker`);
        }
      } else {
        logger.debug(`Job ${jobId} requirements not met by worker ${workerCapabilities.worker_id}`);
      }
    }

    return null;
  }

  /**
   * Enhanced capability matching with workflow awareness
   */
  private async canWorkerHandleJob(job: Job, capabilities: WorkerCapabilities): Promise<boolean> {
    // Reuse the existing capability matching from RedisService
    // This ensures consistency with the existing implementation
    return await this.redis['canWorkerHandleJob'](job, capabilities);
  }

  /**
   * Check if any available workers can handle a job
   */
  async canAnyWorkerHandleJob(job: Job): Promise<boolean> {
    const workers = await this.redis.getActiveWorkers();

    for (const worker of workers) {
      if (await this.canWorkerHandleJob(job, worker.capabilities)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Mark jobs as unworkable if no available workers can handle them
   * This allows users to see stuck jobs and make decisions about canceling or modifying worker capabilities
   */
  async markUnworkableJobs(): Promise<string[]> {
    const markedJobs: string[] = [];

    // Get all pending jobs
    const jobIds = await this.redis['redis'].zrevrange('jobs:pending', 0, -1);

    for (const jobId of jobIds) {
      const job = await this.redis.getJob(jobId);
      if (!job) {
        // Clean up orphaned job IDs
        await this.redis['redis'].zrem('jobs:pending', jobId);
        continue;
      }

      // Check if any worker can handle this job
      const canBeHandled = await this.canAnyWorkerHandleJob(job);

      if (!canBeHandled) {
        // Mark job as unworkable
        await this.redis.updateJobStatus(jobId, JobStatus.UNWORKABLE);

        // Remove from pending queue and add to unworkable queue
        await this.redis['redis'].zrem('jobs:pending', jobId);
        await this.redis['redis'].zadd('jobs:unworkable', job.priority, jobId);

        markedJobs.push(jobId);
        logger.info(`Job ${jobId} marked as unworkable - no available workers can handle it`);
      }
    }

    if (markedJobs.length > 0) {
      logger.info(`Marked ${markedJobs.length} jobs as unworkable`);
    }

    return markedJobs;
  }

  /**
   * Get unworkable jobs that users might want to cancel or address
   */
  async getUnworkableJobs(): Promise<Job[]> {
    const jobIds = await this.redis['redis'].zrevrange('jobs:unworkable', 0, -1);
    const jobs: Job[] = [];

    for (const jobId of jobIds) {
      const job = await this.redis.getJob(jobId);
      if (job) {
        jobs.push(job);
      } else {
        // Clean up orphaned job ID
        await this.redis['redis'].zrem('jobs:unworkable', jobId);
      }
    }

    return jobs;
  }

  /**
   * Requeue an unworkable job (e.g., after new workers join or capabilities change)
   */
  async requeueUnworkableJob(jobId: string): Promise<boolean> {
    const job = await this.redis.getJob(jobId);
    if (!job || job.status !== JobStatus.UNWORKABLE) {
      return false;
    }

    // Check if job can now be handled
    const canBeHandled = await this.canAnyWorkerHandleJob(job);
    if (!canBeHandled) {
      logger.warn(`Job ${jobId} still cannot be handled by any worker`);
      return false;
    }

    // Move back to pending queue
    await this.redis['redis'].zrem('jobs:unworkable', jobId);

    // Use workflow-based scoring like other jobs
    const workflowPriority = job.workflow_priority || job.priority;
    const workflowDatetime = job.workflow_datetime || Date.now();
    const score = workflowPriority * 1000000 + workflowDatetime;

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
      (job.workflow_priority || job.priority) * 1000000 + (job.workflow_datetime || Date.now());

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
}
