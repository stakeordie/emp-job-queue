// Redis Service Interface - direct port from Python core/interfaces/redis_service_interface.py
// Defines contract for Redis operations

import {
// SEMANTIC NOTE: This interface uses "Job" for backwards compatibility
// In the new semantic model, these methods operate on "Steps" (worker processing units)
// Method names preserved for API compatibility during migration
//
// Examples:
// - submitJob() → submits a Step (worker processing unit)
// - getJob() → retrieves a Step
// - completeJob() → marks a Step as complete
  Job,
  JobStatus,
  JobProgress,
  JobResult,
  JobFilter,
  JobSearchResult,
} from '../types/job.js';
import { WorkerCapabilities, WorkerInfo, WorkerFilter } from '../types/worker.js';

export interface RedisServiceInterface {
  // Connection management
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  ping(): Promise<boolean>;

  // Job management
  submitJob(job: Omit<Job, 'id' | 'created_at' | 'status' | 'retry_count'>): Promise<string>;
  getJob(jobId: string): Promise<Job | null>;
  updateJobStatus(jobId: string, status: JobStatus): Promise<void>;
  updateJobProgress(jobId: string, progress: JobProgress): Promise<void>;
  completeJob(jobId: string, result: JobResult): Promise<void>;
  failJob(jobId: string, error: string, canRetry?: boolean): Promise<void>;
  cancelJob(jobId: string, reason: string): Promise<void>;
  claimJob(jobId: string, workerId: string): Promise<boolean>;
  releaseJob(jobId: string): Promise<void>;

  // Job queue operations
  getNextJob(workerCapabilities: WorkerCapabilities): Promise<Job | null>;
  getJobQueuePosition(jobId: string): Promise<number>;
  getPendingJobs(limit?: number): Promise<Job[]>;
  getActiveJobs(workerId?: string): Promise<Job[]>;
  getCompletedJobs(limit?: number): Promise<Job[]>;
  getFailedJobs(limit?: number): Promise<Job[]>;
  getAllJobs(limit?: number): Promise<Job[]>;
  detectAndFixOrphanedJobs(): Promise<number>;

  // Job search and filtering
  searchJobs(filter: JobFilter, page?: number, pageSize?: number): Promise<JobSearchResult>;
  getJobsByStatus(status: JobStatus[], limit?: number): Promise<Job[]>;
  getJobsByWorker(workerId: string, limit?: number): Promise<Job[]>;
  getJobsByCustomer(customerId: string, limit?: number): Promise<Job[]>;

  // Worker management
  registerWorker(workerCapabilities: WorkerCapabilities): Promise<void>;
  updateWorkerCapabilities(workerId: string, capabilities: WorkerCapabilities): Promise<void>;
  updateWorkerStatus(workerId: string, status: string, currentJobs?: string[]): Promise<void>;
  removeWorker(workerId: string): Promise<void>;
  getWorker(workerId: string): Promise<WorkerInfo | null>;
  getAllWorkers(): Promise<WorkerInfo[]>;
  getActiveWorkers(): Promise<WorkerInfo[]>;
  getIdleWorkers(): Promise<WorkerInfo[]>;

  // Worker filtering and search
  findCapableWorkers(jobRequirements): Promise<WorkerInfo[]>;
  searchWorkers(filter: WorkerFilter): Promise<WorkerInfo[]>;

  // Worker heartbeat and health
  updateWorkerHeartbeat(workerId: string, systemInfo?): Promise<void>;
  getWorkerLastHeartbeat(workerId: string): Promise<string | null>;
  cleanupStaleWorkers(timeoutSeconds: number): Promise<string[]>;

  // Statistics and monitoring
  getJobStatistics(): Promise<{
    pending: number;
    active: number;
    completed: number;
    failed: number;
    cancelled: number;
  }>;
  getWorkerStatistics(): Promise<{
    total: number;
    active: number;
    idle: number;
    busy: number;
    offline: number;
  }>;
  getSystemMetrics(): Promise<{
    jobs_per_minute: number;
    average_processing_time: number;
    queue_depth: number;
    worker_utilization: number;
  }>;

  // Pub/Sub operations
  publishMessage(channel: string, message: unknown): Promise<void>;
  subscribeToChannel(channel: string, callback: (message: unknown) => void): Promise<void>;
  unsubscribeFromChannel(channel: string): Promise<void>;

  // Data cleanup and maintenance
  cleanupCompletedJobs(olderThanHours: number): Promise<number>;
  cleanupFailedJobs(olderThanDays: number): Promise<number>;
  optimizeJobQueue(): Promise<void>;

  // Backup and recovery
  exportJobData(startDate?: string, endDate?: string): Promise<unknown[]>;
  importJobData(jobs: unknown[]): Promise<number>;

  // Health and diagnostics
  getRedisInfo(): Promise<Record<string, unknown>>;
  getMemoryUsage(): Promise<{
    used_memory: number;
    used_memory_human: string;
    used_memory_peak: number;
    used_memory_peak_human: string;
  }>;
  checkDataIntegrity(): Promise<{
    orphaned_jobs: string[];
    missing_worker_refs: string[];
    inconsistent_states: string[];
  }>;
}
