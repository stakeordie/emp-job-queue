import { Job, JobRequirements } from '../types/job.js';
import { WorkerCapabilities } from '../types/worker.js';
export interface RedisFunction {
  name: string;
  code: string;
  description?: string;
}
export interface FunctionLibrary {
  name: string;
  engine: string;
  functions: RedisFunction[];
}
export interface RedisJobData {
  id: string;
  service_required?: string;
  job_type?: string;
  priority?: string;
  payload?: string;
  requirements?: string;
  customer_id?: string;
  workflow_id?: string;
  workflow_priority?: string;
  workflow_datetime?: string;
  step_number?: string;
  created_at?: string;
  assigned_at?: string;
  started_at?: string;
  completed_at?: string;
  failed_at?: string;
  worker_id?: string;
  status?: string;
  retry_count?: string;
  max_retries?: string;
  last_failed_worker?: string;
  processing_time?: string;
  estimated_completion?: string;
  [key: string]: string | undefined;
}
export interface MatchingResult {
  jobId: string;
  job: RedisJobData;
}
export interface FunctionCallResult {
  success: boolean;
  data?: MatchingResult;
  error?: string;
}
export interface FindMatchingJobArgs {
  capabilities: WorkerCapabilities;
  maxScan?: number;
}
export interface RedisJobMatchingFunction {
  findMatchingJob(
    capabilities: WorkerCapabilities,
    maxScan?: number
  ): Promise<MatchingResult | null>;
}
export interface FunctionInfo {
  name: string;
  library: string;
  description?: string;
}
export interface FunctionInstallResult {
  success: boolean;
  functionsInstalled: string[];
  error?: string;
}
export interface MatchingContext {
  worker: WorkerCapabilities;
  job: Job;
  requirements: JobRequirements;
}
export interface MatchResult {
  matches: boolean;
  reason?: string;
  score?: number;
}
//# sourceMappingURL=types.d.ts.map
