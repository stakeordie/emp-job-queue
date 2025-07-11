import {
  Job,
  JobStatus,
  JobProgress,
  JobResult,
  JobFilter,
  JobSearchResult,
} from '../types/job.js';
import { WorkerCapabilities, WorkerInfo, WorkerFilter } from '../types/worker.js';
export interface RedisServiceInterface {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  ping(): Promise<boolean>;
  submitJob(job: Omit<Job, 'id' | 'created_at' | 'status' | 'retry_count'>): Promise<string>;
  getJob(jobId: string): Promise<Job | null>;
  updateJobStatus(jobId: string, status: JobStatus): Promise<void>;
  updateJobProgress(jobId: string, progress: JobProgress): Promise<void>;
  completeJob(jobId: string, result: JobResult): Promise<void>;
  failJob(jobId: string, error: string, canRetry?: boolean): Promise<void>;
  cancelJob(jobId: string, reason: string): Promise<void>;
  claimJob(jobId: string, workerId: string): Promise<boolean>;
  releaseJob(jobId: string): Promise<void>;
  getNextJob(workerCapabilities: WorkerCapabilities): Promise<Job | null>;
  getJobQueuePosition(jobId: string): Promise<number>;
  getPendingJobs(limit?: number): Promise<Job[]>;
  getActiveJobs(workerId?: string): Promise<Job[]>;
  getCompletedJobs(limit?: number): Promise<Job[]>;
  getFailedJobs(limit?: number): Promise<Job[]>;
  getAllJobs(limit?: number): Promise<Job[]>;
  detectAndFixOrphanedJobs(): Promise<number>;
  searchJobs(filter: JobFilter, page?: number, pageSize?: number): Promise<JobSearchResult>;
  getJobsByStatus(status: JobStatus[], limit?: number): Promise<Job[]>;
  getJobsByWorker(workerId: string, limit?: number): Promise<Job[]>;
  getJobsByCustomer(customerId: string, limit?: number): Promise<Job[]>;
  registerWorker(workerCapabilities: WorkerCapabilities): Promise<void>;
  updateWorkerCapabilities(workerId: string, capabilities: WorkerCapabilities): Promise<void>;
  updateWorkerStatus(workerId: string, status: string, currentJobs?: string[]): Promise<void>;
  removeWorker(workerId: string): Promise<void>;
  getWorker(workerId: string): Promise<WorkerInfo | null>;
  getAllWorkers(): Promise<WorkerInfo[]>;
  getActiveWorkers(): Promise<WorkerInfo[]>;
  getIdleWorkers(): Promise<WorkerInfo[]>;
  findCapableWorkers(jobRequirements: any): Promise<WorkerInfo[]>;
  searchWorkers(filter: WorkerFilter): Promise<WorkerInfo[]>;
  updateWorkerHeartbeat(workerId: string, systemInfo?: any): Promise<void>;
  getWorkerLastHeartbeat(workerId: string): Promise<string | null>;
  cleanupStaleWorkers(timeoutSeconds: number): Promise<string[]>;
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
  publishMessage(channel: string, message: unknown): Promise<void>;
  subscribeToChannel(channel: string, callback: (message: unknown) => void): Promise<void>;
  unsubscribeFromChannel(channel: string): Promise<void>;
  cleanupCompletedJobs(olderThanHours: number): Promise<number>;
  cleanupFailedJobs(olderThanDays: number): Promise<number>;
  optimizeJobQueue(): Promise<void>;
  exportJobData(startDate?: string, endDate?: string): Promise<unknown[]>;
  importJobData(jobs: unknown[]): Promise<number>;
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
//# sourceMappingURL=redis-service.d.ts.map
