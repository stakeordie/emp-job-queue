import { RedisService } from './redis-service.js';
import { JobBrokerInterface } from './interfaces/job-broker.js';
import { Job, JobSubmissionRequest, WorkflowMetadata } from './types/job.js';
import { WorkerCapabilities } from './types/worker.js';
export declare class JobBroker implements JobBrokerInterface {
  private redis;
  constructor(redisService: RedisService);
  /**
   * Submit a job with workflow priority inheritance
   * If workflow_id is provided, inherits priority and datetime from workflow
   * Otherwise creates standalone job with current timestamp
   */
  submitJob(request: JobSubmissionRequest): Promise<string>;
  /**
   * Enhanced job submission to Redis with workflow-based scoring
   */
  private submitJobToRedis;
  /**
   * Get next job for worker using simple FIFO selection
   * Phase 1A: Removed capability matching - any worker takes any job
   */
  getNextJobForWorker(workerCapabilities: WorkerCapabilities): Promise<Job | null>;
  /**
   * Requeue an unworkable job (e.g., after new workers join or capabilities change)
   */
  requeueUnworkableJob(jobId: string): Promise<boolean>;
  /**
   * Atomic job claiming to prevent race conditions
   */
  claimJob(jobId: string, workerId: string): Promise<boolean>;
  /**
   * Release job back to queue
   */
  releaseJob(jobId: string): Promise<void>;
  /**
   * Create or update workflow metadata
   */
  createWorkflow(priority: number, customerId?: string, workflowId?: string): Promise<string>;
  /**
   * Get workflow metadata
   */
  getWorkflowMetadata(workflowId: string): Promise<WorkflowMetadata | null>;
  /**
   * Update workflow status
   */
  updateWorkflowStatus(
    workflowId: string,
    status: 'active' | 'completed' | 'failed'
  ): Promise<void>;
  /**
   * Get job position in queue (0-based)
   */
  getQueuePosition(jobId: string): Promise<number>;
  /**
   * Get total queue depth
   */
  getQueueDepth(): Promise<number>;
  /**
   * Get job statistics
   */
  getJobStatistics(): Promise<{
    pending: number;
    active: number;
    completed: number;
    failed: number;
  }>;
  /**
   * Get all connected workers (for monitor full state)
   */
  getConnectedWorkers(): Promise<unknown[]>;
  /**
   * Get all jobs (for monitor full state)
   */
  getAllJobs(): Promise<unknown[]>;
  /**
   * Parse job data from Redis into consistent format
   */
  private parseJobData;
  /**
   * Archive completed and failed jobs older than specified time
   * Moves jobs from Redis to date-partitioned JSON files
   */
  archiveCompletedJobs(
    olderThanMinutes?: number,
    archiveDir?: string
  ): Promise<{
    archived: number;
    errors: number;
  }>;
  /**
   * Archive jobs by status (completed or failed)
   */
  private archiveJobsByStatus;
  /**
   * Write jobs to date-partitioned archive files
   */
  private writeJobsToArchive;
  /**
   * Get archived jobs for a specific date range
   */
  getArchivedJobs(
    status: 'completed' | 'failed',
    startDate: string,
    endDate: string,
    archiveDir?: string
  ): Promise<unknown[]>;
  /**
   * Clean up archive files older than specified days
   */
  cleanupArchives(
    olderThanDays?: number,
    archiveDir?: string
  ): Promise<{
    deleted: number;
    errors: number;
  }>;
}
//# sourceMappingURL=job-broker.d.ts.map
