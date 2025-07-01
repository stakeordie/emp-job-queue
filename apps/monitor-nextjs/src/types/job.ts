export type JobStatus = 
  | 'pending' 
  | 'assigned' 
  | 'active' 
  | 'completed' 
  | 'failed' 
  | 'cancelled' 
  | 'unworkable';

export interface JobRequirements {
  gpu_memory_gb?: number;
  cpu_cores?: number;
  ram_gb?: number;
  gpu_model?: string | 'all';
  customer_access?: 'strict' | 'loose' | 'none';
  models?: string[];
  service_types?: string[];
}

export interface Job {
  id: string;
  job_type: string;
  status: JobStatus;
  priority: number;
  payload: Record<string, unknown>;
  customer_id?: string;
  requirements?: JobRequirements;
  max_retries?: number;
  
  // Workflow fields
  workflow_id?: string;
  workflow_priority?: number;
  workflow_datetime?: number;
  step_number?: number;
  
  // Timestamps
  created_at: number;
  assigned_at?: number;
  started_at?: number;
  completed_at?: number;
  
  // Worker assignment
  worker_id?: string;
  
  // Progress and results
  progress?: number;
  result?: unknown;
  error?: string;
  failure_count?: number;
}

export interface JobSubmissionRequest {
  job_type: string;
  priority: number;
  payload: Record<string, unknown>;
  customer_id?: string;
  requirements?: JobRequirements;
  max_retries?: number;
  workflow_id?: string;
  workflow_priority?: number;
  workflow_datetime?: number;
  step_number?: number;
}

export interface JobFilter {
  status?: JobStatus[];
  job_type?: string[];
  priority_range?: [number, number];
  workflow_id?: string;
  worker_id?: string;
  date_range?: {
    start: Date;
    end: Date;
  };
}