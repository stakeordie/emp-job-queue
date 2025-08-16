import { Job, JobSubmissionRequest, WorkflowMetadata } from '../types/job.js';
import { WorkerCapabilities } from '../types/worker.js';
export interface JobBrokerInterface {
  submitJob(request: JobSubmissionRequest): Promise<string>;
  getNextJobForWorker(workerCapabilities: WorkerCapabilities): Promise<Job | null>;
  createWorkflow(priority: number, customerId?: string): Promise<string>;
  getWorkflowMetadata(workflowId: string): Promise<WorkflowMetadata | null>;
  updateWorkflowStatus(
    workflowId: string,
    status: 'active' | 'completed' | 'failed'
  ): Promise<void>;
  claimJob(jobId: string, workerId: string): Promise<boolean>;
  releaseJob(jobId: string): Promise<void>;
  getQueuePosition(jobId: string): Promise<number>;
  getQueueDepth(): Promise<number>;
  getJobStatistics(): Promise<{
    pending: number;
    active: number;
    completed: number;
    failed: number;
  }>;
}
//# sourceMappingURL=job-broker.d.ts.map
