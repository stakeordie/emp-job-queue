// Worker types - capabilities, status, and registration

export interface WorkerCapabilities {
  worker_id: string;
  machine_id?: string; // Physical machine identifier for multi-GPU setups
  services: string[]; // ["comfyui", "a1111"]
  job_service_required_map?: string[]; // For Redis function compatibility - same as services
  components?: string[] | 'all'; // ["text-to-image-xl"] or "all" for no filtering
  workflows?: string[] | 'all'; // ["workflow-v1.2", "workflow-v2.0"] or "all" for no filtering
  models?: Record<string, string[]> | 'all'; // Future: service -> model list or "all"
  hardware?: HardwareSpecs; // Future: actual hardware specs
  instance?: string; // "comfyui_gpu0" - which service instance to connect to
  customer_access?: CustomerAccessConfig;
  performance?: PerformanceConfig;
  location?: LocationConfig;
  cost?: CostConfig;
  workflow_id?: string; // Workflow restriction: only accept jobs with this workflow_id
  metadata?: Record<string, unknown>;
  [key: string]: unknown; // Allow assignment to Record<string, unknown>
}

export interface HardwareSpecs {
  gpu_memory_gb: number;
  gpu_model: string;
  ram_gb: number;
  storage_gb?: number;
  network_speed?: string;
}

export interface CustomerAccessConfig {
  isolation: 'strict' | 'loose' | 'none';
  allowed_customers?: string[];
  denied_customers?: string[];
  max_concurrent_customers?: number;
}

export interface PerformanceConfig {
  concurrent_jobs: number;
  quality_levels: string[]; // ['fast', 'balanced', 'quality']
  max_processing_time_minutes?: number;
  average_job_time_seconds?: number;
}

export interface LocationConfig {
  region: string;
  country?: string;
  compliance_zones: string[]; // ['gdpr', 'hipaa', 'ccpa']
  data_residency_requirements?: string[];
}

export interface CostConfig {
  tier: 'economy' | 'standard' | 'premium';
  rate_per_hour?: number;
  rate_per_job?: number;
  minimum_charge?: number;
}

export enum WorkerStatus {
  INITIALIZING = 'initializing',
  IDLE = 'idle',
  BUSY = 'busy',
  PAUSED = 'paused',
  STOPPING = 'stopping',
  OFFLINE = 'offline',
  ERROR = 'error',
  MAINTENANCE = 'maintenance',
}

export interface WorkerInfo {
  worker_id: string;
  capabilities: WorkerCapabilities;
  status: WorkerStatus;
  connected_at: string;
  last_heartbeat: string;
  current_jobs: string[];
  total_jobs_completed: number;
  total_jobs_failed: number;
  average_processing_time: number;
  uptime: number;
  version?: string;
  connector_statuses?: Record<string, ConnectorStatus>;
}

export interface ConnectorStatus {
  connector_id: string;
  status: 'active' | 'inactive' | 'error' | 'waiting_for_service' | 'connecting';
  version?: string;
  health_check_at?: string;
  error_message?: string;
  service_info?: {
    url?: string;
    models_loaded?: string[];
    memory_usage?: number;
    queue_length?: number;
  };
}

export interface SystemInfo {
  cpu_usage: number;
  memory_usage: number;
  memory_total_gb: number;
  memory_available_gb: number;
  gpu_usage?: number;
  gpu_memory_usage?: number;
  gpu_memory_total_gb?: number;
  gpu_memory_available_gb?: number;
  disk_usage: number;
  disk_total_gb: number;
  disk_available_gb: number;
  network_rx_mbps?: number;
  network_tx_mbps?: number;
  uptime_seconds: number;
  load_average?: number[];
  temperature?: {
    cpu?: number;
    gpu?: number;
  };
}

export interface WorkerRegistration {
  worker_id: string;
  capabilities: WorkerCapabilities;
  system_info: SystemInfo;
  connectors: string[];
  auth_token?: string;
  reconnection?: boolean;
}

export interface WorkerHeartbeat {
  worker_id: string;
  status: WorkerStatus;
  current_jobs: string[];
  system_info: SystemInfo;
  connector_statuses: Record<string, ConnectorStatus>;
  timestamp: string;
}

// Worker filtering and management
export interface WorkerFilter {
  status?: WorkerStatus[];
  services?: string[];
  min_gpu_memory?: number;
  customer_access?: string;
  region?: string;
  available_only?: boolean;
}

export interface WorkerMatch {
  worker: WorkerInfo;
  score: number;
  match_reasons: string[];
  compatibility_issues?: string[];
}

// Worker pool management
export interface WorkerPoolInfo {
  total_workers: number;
  active_workers: number;
  idle_workers: number;
  busy_workers: number;
  offline_workers: number;
  error_workers: number;
  average_cpu_usage: number;
  average_memory_usage: number;
  total_gpu_memory_gb: number;
  available_gpu_memory_gb: number;
  services_available: string[];
  models_available: Record<string, string[]>;
}
