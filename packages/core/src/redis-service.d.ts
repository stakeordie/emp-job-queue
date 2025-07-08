import { RedisServiceInterface } from './interfaces/redis-service.js';
import { Job, JobStatus, JobProgress, JobResult, JobFilter, JobSearchResult } from './types/job.js';
import { WorkerCapabilities, WorkerInfo, WorkerFilter } from './types/worker.js';
import { EventBroadcaster } from './services/event-broadcaster.js';
export declare class RedisService implements RedisServiceInterface {
  private redis;
  private subscriber;
  private isConnectedFlag;
  private subscriptions;
  private eventBroadcaster?;
  constructor(redisUrl: string, eventBroadcaster?: EventBroadcaster);
  private setupEventHandlers;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  ping(): Promise<boolean>;
  submitJob(jobData: Omit<Job, 'id' | 'created_at' | 'status' | 'retry_count'>): Promise<string>;
  getJob(jobId: string): Promise<Job | null>;
  updateJobStatus(jobId: string, status: JobStatus): Promise<void>;
  updateJobProgress(jobId: string, progress: JobProgress): Promise<void>;
  completeJob(jobId: string, result: JobResult): Promise<void>;
  failJob(jobId: string, error: string, canRetry?: boolean): Promise<void>;
  cancelJob(jobId: string, reason: string): Promise<void>;
  claimJob(jobId: string, workerId: string): Promise<boolean>;
  releaseJob(jobId: string): Promise<void>;
  getNextJob(workerCapabilities: WorkerCapabilities): Promise<Job | null>;
  private canWorkerHandleJob;
  getJobQueuePosition(jobId: string): Promise<number>;
  getPendingJobs(limit?: number): Promise<Job[]>;
  getActiveJobs(workerId?: string): Promise<Job[]>;
  registerWorker(capabilities: WorkerCapabilities): Promise<void>;
  updateWorkerHeartbeat(workerId: string, systemInfo?: any): Promise<void>;
  publishMessage(channel: string, message: any): Promise<void>;
  subscribeToChannel(channel: string, callback: (message: any) => void): Promise<void>;
  unsubscribeFromChannel(channel: string): Promise<void>;
  getCompletedJobs(limit?: number): Promise<Job[]>;
  getFailedJobs(limit?: number): Promise<Job[]>;
  getAllJobs(limit?: number): Promise<Job[]>;
  /**
   * Detect and fix orphaned jobs - active jobs with no worker processing them
   * Also handles stuck jobs where workers stopped responding during processing
   */
  detectAndFixOrphanedJobs(): Promise<number>;
  /**
   * Detect jobs that are stuck because workers stopped responding
   * Uses heartbeat timeouts to determine if a worker is unresponsive
   */
  detectStuckJobs(): Promise<number>;
  /**
   * Release a stuck job back to the queue and increment retry count
   */
  private releaseStuckJob;
  searchJobs(filter: JobFilter, page?: number, pageSize?: number): Promise<JobSearchResult>;
  getJobsByStatus(status: JobStatus[], _limit?: number): Promise<Job[]>;
  getJobsByWorker(_workerId: string, _limit?: number): Promise<Job[]>;
  getJobsByCustomer(_customerId: string, _limit?: number): Promise<Job[]>;
  updateWorkerCapabilities(_workerId: string, _capabilities: WorkerCapabilities): Promise<void>;
  updateWorkerStatus(workerId: string, status: string, currentJobs?: string[]): Promise<void>;
  removeWorker(_workerId: string): Promise<void>;
  getWorker(_workerId: string): Promise<WorkerInfo | null>;
  getAllWorkers(): Promise<WorkerInfo[]>;
  getActiveWorkers(): Promise<WorkerInfo[]>;
  getIdleWorkers(): Promise<WorkerInfo[]>;
  findCapableWorkers(_jobRequirements: any): Promise<WorkerInfo[]>;
  searchWorkers(_filter: WorkerFilter): Promise<WorkerInfo[]>;
  getWorkerLastHeartbeat(_workerId: string): Promise<string | null>;
  cleanupStaleWorkers(_timeoutSeconds: number): Promise<string[]>;
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
  cleanupCompletedJobs(_olderThanHours: number): Promise<number>;
  cleanupFailedJobs(_olderThanDays: number): Promise<number>;
  optimizeJobQueue(): Promise<void>;
  exportJobData(_startDate?: string, _endDate?: string): Promise<Record<string, unknown>[]>;
  importJobData(_jobs: unknown[]): Promise<number>;
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
