// Message types - direct port from Python core/core_types/base_messages.py
// Maintains same message structure for compatibility

export enum MessageType {
  // Job lifecycle messages
  JOB_SUBMISSION = 'job_submission',
  JOB_ASSIGNED = 'job_assigned',
  JOB_PROGRESS = 'job_progress',
  JOB_COMPLETED = 'job_completed',
  JOB_FAILED = 'job_failed',
  JOB_CANCELLED = 'job_cancelled',
  JOB_AVAILABLE = 'job_available',
  COMPLETE_JOB = 'complete_job',
  FAIL_JOB = 'fail_job',
  
  // Worker messages
  WORKER_REGISTRATION = 'worker_registration',
  WORKER_STATUS = 'worker_status',
  WORKER_HEARTBEAT = 'worker_heartbeat',
  WORKER_DISCONNECT = 'worker_disconnect',
  
  // Service messages
  SERVICE_REQUEST = 'service_request',
  
  // System messages
  SYSTEM_STATUS = 'system_status',
  ERROR = 'error'
}

export interface BaseMessage {
  id: string;
  type: MessageType;
  timestamp: string;
  source?: string;
}

// Job Messages
export interface JobSubmissionMessage extends BaseMessage {
  type: MessageType.JOB_SUBMISSION;
  job_id: string;
  job_type: string;
  priority: number;
  payload: Record<string, any>;
  customer_id?: string;
  requirements?: JobRequirements;
}

export interface JobAssignedMessage extends BaseMessage {
  type: MessageType.JOB_ASSIGNED;
  job_id: string;
  worker_id: string;
  job_data: JobData;
}

export interface JobProgressMessage extends BaseMessage {
  type: MessageType.JOB_PROGRESS;
  job_id: string;
  worker_id: string;
  progress: number;
  status: string;
  message?: string;
  estimated_completion?: string;
}

export interface JobCompletedMessage extends BaseMessage {
  type: MessageType.JOB_COMPLETED;
  job_id: string;
  worker_id: string;
  result: JobResult;
  processing_time?: number;
}

export interface JobFailedMessage extends BaseMessage {
  type: MessageType.JOB_FAILED;
  job_id: string;
  worker_id: string;
  error: string;
  retry_count?: number;
  can_retry?: boolean;
}

export interface JobAvailableMessage extends BaseMessage {
  type: MessageType.JOB_AVAILABLE;
  job_id: string;
  job_type: string;
  priority: number;
  requirements?: JobRequirements;
  last_failed_worker?: string;
}

export interface CompleteJobMessage extends BaseMessage {
  type: MessageType.COMPLETE_JOB;
  job_id: string;
  result: JobResult;
}

export interface FailJobMessage extends BaseMessage {
  type: MessageType.FAIL_JOB;
  job_id: string;
  error: string;
  retry: boolean;
}

// Worker Messages
export interface WorkerRegistrationMessage extends BaseMessage {
  type: MessageType.WORKER_REGISTRATION;
  worker_id: string;
  capabilities: WorkerCapabilities;
  connectors: string[];
}

export interface WorkerStatusMessage extends BaseMessage {
  type: MessageType.WORKER_STATUS;
  worker_id: string;
  status: WorkerStatus;
  current_job_id?: string;
  connector_statuses?: Record<string, any>;
}

export interface WorkerHeartbeatMessage extends BaseMessage {
  type: MessageType.WORKER_HEARTBEAT;
  worker_id: string;
  status: WorkerStatus;
  system_info?: SystemInfo;
}

// Service Messages
export interface ServiceRequestMessage extends BaseMessage {
  type: MessageType.SERVICE_REQUEST;
  job_id: string;
  worker_id: string;
  service_type: string;
  endpoint: string;
  method: string;
  url: string;
  payload?: Record<string, any>;
}

// System Messages
export interface SystemStatusMessage extends BaseMessage {
  type: MessageType.SYSTEM_STATUS;
  active_workers: number;
  pending_jobs: number;
  active_jobs: number;
  completed_jobs: number;
}

export interface ErrorMessage extends BaseMessage {
  type: MessageType.ERROR;
  error: string;
  context?: Record<string, any>;
}

// Supporting types
export interface JobRequirements {
  service_type: string;
  hardware?: {
    gpu_memory_gb?: number;
    cpu_cores?: number;
    ram_gb?: number;
  };
  models?: string[];
  customer_isolation?: 'strict' | 'loose' | 'none';
  geographic_region?: string;
  compliance?: string[];
}

export interface JobData {
  id: string;
  type: string;
  priority: number;
  payload: Record<string, any>;
  requirements?: JobRequirements;
  customer_id?: string;
  created_at: string;
  assigned_at?: string;
  started_at?: string;
}

export interface JobResult {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: Record<string, any>;
  processing_time?: number;
  output_files?: string[];
}

export interface WorkerCapabilities {
  worker_id: string;
  services: string[];
  hardware: {
    gpu_count: number;
    gpu_memory_gb: number;
    gpu_model: string;
    cpu_cores: number;
    ram_gb: number;
  };
  models: Record<string, string[]>;
  customer_access: {
    isolation: 'strict' | 'loose' | 'none';
    allowed_customers?: string[];
    denied_customers?: string[];
  };
  performance: {
    concurrent_jobs: number;
    quality_levels: string[];
  };
}

export enum WorkerStatus {
  IDLE = 'idle',
  BUSY = 'busy',
  OFFLINE = 'offline',
  ERROR = 'error'
}

export interface SystemInfo {
  cpu_usage: number;
  memory_usage: number;
  gpu_usage?: number;
  gpu_memory_usage?: number;
  disk_usage: number;
  uptime: number;
}

// WebSocket message wrapper
export interface WebSocketMessage {
  id: string;
  type: string;
  data: BaseMessage;
  chunk_info?: {
    chunk_id: string;
    chunk_index: number;
    total_chunks: number;
    data_hash: string;
  };
}

// Chunked message handling
export interface ChunkedMessage {
  chunk_id: string;
  total_chunks: number;
  chunks: Map<number, string>;
  data_hash: string;
  created_at: number;
}