// JobBroker interface - manages job submission and workflow priority inheritance

import { Job, JobSubmissionRequest, WorkflowMetadata } from '../types/job.js';
import { WorkerCapabilities } from '../types/worker.js';

export interface JobBrokerInterface {
  // Job submission with workflow inheritance
  submitJob(request: JobSubmissionRequest): Promise<string>;

  // Get next job for worker (pull-based selection)
  getNextJobForWorker(workerCapabilities: WorkerCapabilities): Promise<Job | null>;

  // Workflow management
  createWorkflow(priority: number, customerId?: string): Promise<string>;
  getWorkflowMetadata(workflowId: string): Promise<WorkflowMetadata | null>;
  updateWorkflowStatus(
    workflowId: string,
    status: 'active' | 'completed' | 'failed'
  ): Promise<void>;

  // Job management
  claimJob(jobId: string, workerId: string): Promise<boolean>;
  releaseJob(jobId: string): Promise<void>;

  // Queue inspection
  getQueuePosition(jobId: string): Promise<number>;
  getQueueDepth(): Promise<number>;

  // Statistics
  getJobStatistics(): Promise<{
    pending: number;
    active: number;
    completed: number;
    failed: number;
  }>;
}
