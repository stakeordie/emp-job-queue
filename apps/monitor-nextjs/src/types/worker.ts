export type WorkerStatus = 'idle' | 'busy' | 'offline' | 'error';

export interface WorkerCapabilities {
  gpu_count: number;
  gpu_memory_gb: number;
  gpu_model: string;
  cpu_cores: number;
  ram_gb: number;
  services: string[];
  models: string[];
  customer_access: 'strict' | 'loose' | 'none';
  max_concurrent_jobs: number;
}

export interface Worker {
  id: string;
  status: WorkerStatus;
  capabilities: WorkerCapabilities;
  current_job_id?: string;
  connected_at: string;
  last_activity: string;
  
  // Stats
  jobs_completed: number;
  jobs_failed: number;
  total_processing_time: number;
  
  // Health
  cpu_usage?: number;
  memory_usage?: number;
  gpu_usage?: number;
  
  // Version info
  version?: string;
  build?: string;
}