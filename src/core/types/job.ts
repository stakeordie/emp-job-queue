// Job types - core job definitions and lifecycle management

export interface Job {
  id: string;
  type: string;
  priority: number;
  payload: Record<string, unknown>;
  requirements?: JobRequirements;
  customer_id?: string;
  created_at: string;
  assigned_at?: string;
  started_at?: string;
  completed_at?: string;
  failed_at?: string;
  worker_id?: string;
  status: JobStatus;
  retry_count: number;
  max_retries: number;
  last_failed_worker?: string;
  processing_time?: number;
  estimated_completion?: string;
}

export enum JobStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  ASSIGNED = 'assigned',
  ACCEPTED = 'accepted',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  TIMEOUT = 'timeout',
}

export interface JobRequirements {
  service_type: string;
  hardware?: {
    gpu_memory_gb?: number;
    cpu_cores?: number;
    ram_gb?: number;
    gpu_count?: number;
  };
  models?: string[];
  customer_isolation?: 'strict' | 'loose' | 'none';
  geographic_region?: string;
  compliance?: string[];
  quality_level?: 'fast' | 'balanced' | 'quality';
  timeout_minutes?: number;
}

export interface JobProgress {
  job_id: string;
  worker_id: string;
  progress: number; // 0-100
  status: JobStatus;
  message?: string;
  current_step?: string;
  total_steps?: number;
  estimated_completion?: string;
  updated_at: string;
}

export interface JobResult {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
  processing_time?: number;
  output_files?: string[];
  connector_info?: {
    connector_type: string;
    service_version?: string;
    processing_stats?: Record<string, unknown>;
  };
}

export interface JobSubmissionRequest {
  type: string;
  payload: Record<string, unknown>;
  priority?: number;
  requirements?: JobRequirements;
  customer_id?: string;
  max_retries?: number;
  timeout_minutes?: number;
}

export interface JobStatusResponse {
  job: Job;
  progress?: JobProgress;
  result?: JobResult;
  queue_position?: number;
  estimated_start?: string;
}

// Job queue management
export interface JobQueueInfo {
  pending_count: number;
  active_count: number;
  completed_count: number;
  failed_count: number;
  average_processing_time: number;
  oldest_pending_job?: string;
}

// Job filtering and searching
export interface JobFilter {
  status?: JobStatus[];
  type?: string[];
  customer_id?: string;
  worker_id?: string;
  created_after?: string;
  created_before?: string;
  priority_min?: number;
  priority_max?: number;
}

export interface JobSearchResult {
  jobs: Job[];
  total_count: number;
  page: number;
  page_size: number;
  has_more: boolean;
}
