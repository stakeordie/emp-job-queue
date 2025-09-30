// TODO-SEMANTIC: This file contains "Job" types that should be "Step" - worker processing unit
// Job types - core job definitions and lifecycle management

// TODO-SEMANTIC: This 'Job' interface should be 'Step' - represents what workers process
export interface Job {
  id: string;
  service_required: string;
  priority: number;
  payload: Record<string, unknown>;
  requirements?: JobRequirements;
  customer_id?: string;
  workflow_id?: string;
  workflow_priority?: number;
  workflow_datetime?: number;
  current_step?: number;
  total_steps?: number;
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
  // Service job tracking for external systems
  service_job_id?: string; // External service ID (e.g., ComfyUI prompt_id)
  service_submitted_at?: string; // When job was submitted to external service
  last_service_check?: string; // Last time we verified status with external service
  service_status?: string; // Last known status from external service
  // OTEL trace context for cross-service propagation
  job_trace_id?: string; // Trace ID from job submission span
  job_span_id?: string; // Span ID from job submission span
  workflow_trace_id?: string; // Trace ID from workflow step span (if applicable)
  workflow_span_id?: string; // Span ID from workflow step span (if applicable)
  // Storage context for asset saving (separate from payload to avoid sending to external APIs)
  ctx?: Record<string, unknown>; // Storage configuration (bucket, CDN, etc.)
  // Forensics and debugging data
  forensics?: JobForensics;
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
  UNWORKABLE = 'unworkable', // No available workers can handle this job
}

export interface JobRequirements {
  service_type: string;
  component?: string | 'all'; // Optional component filtering, defaults to "all"
  workflow?: string | 'all'; // Optional workflow filtering, defaults to "all"
  models?: string[] | 'all'; // Future: model filtering, "all" = no filtering
  hardware?: {
    // Future: hardware requirements
    gpu_memory_gb?: number | 'all';
    cpu_cores?: number | 'all';
    ram_gb?: number | 'all';
  };
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
  raw_request_payload?: unknown; // Raw request sent to the service for forensics
}

export interface JobSubmissionRequest {
  service_required: string;
  payload: Record<string, unknown>;
  priority?: number;
  requirements?: JobRequirements;
  customer_id?: string;
  workflow_id?: string;
  workflow_priority?: number;
  workflow_datetime?: number;
  current_step?: number;
  total_steps?: number;
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

// Workflow metadata for priority inheritance
export interface WorkflowMetadata {
  workflow_id: string;
  priority: number;
  submitted_at: number;
  customer_id?: string;
  status: 'active' | 'completed' | 'failed';
  total_steps?: number;
  completed_steps?: number;
}

// Job filtering and searching
export interface JobFilter {
  status?: JobStatus[];
  type?: string[];
  customer_id?: string;
  worker_id?: string;
  workflow_id?: string;
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

// Job attestation from Redis (worker failure/completion records)
export interface JobAttestation {
  attestation_key: string;
  attestation_type: 'worker_failure' | 'worker_completion' | 'workflow_failure' | 'workflow_completion' | 'failure_retry' | 'failure_permanent' | 'unknown_attestation';
  job_id?: string;
  workflow_id?: string;
  worker_id?: string;
  error_message?: string;
  status?: string;
  timestamp?: number;
  failed_at?: number;
  completed_at?: number;
  retry_count?: number;
  can_retry?: boolean;
  will_retry?: boolean;
  workflow_impact?: string;
  failure_type?: string; // From structured failure classification
  failure_reason?: string; // From structured failure classification
  failure_description?: string; // From structured failure classification
  retrieved_at: number;
  [key: string]: any; // Allow additional dynamic properties from Redis
}

// Comprehensive job forensics for debugging and recovery
export interface JobForensics {
  // Creation source tracking
  source_system?: string; // 'emprops-api', 'mini-app', 'direct-api', etc.
  source_user_id?: string; // User who triggered the job
  source_session_id?: string; // Session/request ID
  source_ip?: string; // IP address of origin
  source_user_agent?: string; // User agent if web request
  created_by_api_key?: string; // API key used (anonymized)

  // Submission pathway
  submission_method?: 'http' | 'websocket' | 'direct' | 'webhook';
  original_request_id?: string; // Original HTTP request ID
  emprops_collection_id?: string; // EmProps collection that generated this
  emprops_workflow_name?: string; // EmProps workflow name

  // Processing lifecycle events
  lifecycle_events?: JobLifecycleEvent[];

  // Error tracking
  error_chain?: JobError[];
  last_known_error?: string;
  error_category?: 'network' | 'timeout' | 'validation' | 'resource' | 'external_api' | 'internal' | 'unknown';

  // Worker and machine tracking
  attempted_workers?: string[]; // All workers that tried this job
  worker_assignment_history?: WorkerAssignment[];
  machine_locations?: string[]; // Geographic/cloud regions attempted

  // External system interaction
  external_api_calls?: ExternalApiCall[];
  webhook_attempts?: WebhookAttempt[];

  // Recovery and retry tracking
  recovery_attempts?: RecoveryAttempt[];
  manual_interventions?: ManualIntervention[];

  // Performance and resource usage
  queue_wait_time_ms?: number; // Time spent in queue before assignment
  total_processing_time_ms?: number; // Total time from creation to completion/failure
  resource_usage?: ResourceUsage;

  // State consistency tracking
  state_checks?: StateCheck[];
  cross_system_refs?: CrossSystemReference[];

  // Enhanced attestation tracking (for missing attempt logs issue)
  attestations?: JobAttestation[];

  // Structured failure classification (from 2-tiered failure system)
  structured_failure?: {
    failure_type: string;
    failure_reason: string;
    failure_description: string;
    classified_at: number;
  };

  // Status consistency verification
  status_consistency?: {
    redis_status?: string;
    emprops_status?: string;
    discrepancy_detected?: boolean;
    source_priority: 'redis' | 'emprops';
    verified_at: number;
  };
}

export interface JobLifecycleEvent {
  timestamp: string;
  event: 'created' | 'queued' | 'assigned' | 'started' | 'progress_update' | 'completed' | 'failed' | 'retry' | 'cancelled' | 'stuck_detected' | 'released';
  actor: string; // worker_id, system component, user_id
  details?: Record<string, unknown>;
  system_state?: Record<string, unknown>; // Redis state snapshot at time of event
}

export interface JobError {
  timestamp: string;
  source: 'worker' | 'api' | 'external_service' | 'timeout' | 'validation' | 'system';
  error_code?: string;
  error_message: string;
  stack_trace?: string;
  context?: Record<string, unknown>;
  recovery_suggested?: string;
  permanent?: boolean; // True if this is a permanent failure that shouldn't be retried
}

export interface WorkerAssignment {
  worker_id: string;
  machine_id?: string;
  assigned_at: string;
  released_at?: string;
  assignment_duration_ms?: number;
  assignment_reason: 'capability_match' | 'retry' | 'manual' | 'failover';
  result: 'completed' | 'failed' | 'timeout' | 'worker_disconnect' | 'manual_release';
}

export interface ExternalApiCall {
  timestamp: string;
  api_endpoint: string;
  method: string;
  request_id?: string;
  response_status?: number;
  response_time_ms?: number;
  error?: string;
  retry_count?: number;
}

export interface WebhookAttempt {
  timestamp: string;
  webhook_url: string;
  attempt_number: number;
  response_status?: number;
  response_time_ms?: number;
  error?: string;
  will_retry: boolean;
  retry_at?: string;
}

export interface RecoveryAttempt {
  timestamp: string;
  recovery_type: 'automatic_retry' | 'worker_reassignment' | 'manual_retry' | 'state_reset' | 'external_api_retry';
  triggered_by: string;
  success: boolean;
  details?: Record<string, unknown>;
}

export interface ManualIntervention {
  timestamp: string;
  operator: string; // Who performed the intervention
  action: 'retry' | 'cancel' | 'reset' | 'reassign' | 'debug' | 'force_complete';
  reason: string;
  notes?: string;
}

export interface ResourceUsage {
  peak_memory_mb?: number;
  cpu_time_ms?: number;
  disk_io_mb?: number;
  network_io_mb?: number;
  gpu_time_ms?: number;
}

export interface StateCheck {
  timestamp: string;
  check_type: 'cross_system_consistency' | 'redis_integrity' | 'external_api_sync';
  expected_state: Record<string, unknown>;
  actual_state: Record<string, unknown>;
  discrepancies?: string[];
  auto_resolved?: boolean;
}

export interface CrossSystemReference {
  system: 'emprops-api' | 'mini-app' | 'external-webhook';
  reference_id: string; // Database ID, request ID, etc.
  reference_type: 'database_record' | 'api_request' | 'webhook_delivery' | 'user_session';
  last_verified?: string;
  status?: 'active' | 'completed' | 'failed' | 'unknown';
}

// Enhanced job status response with forensics
export interface JobStatusResponseWithForensics extends JobStatusResponse {
  forensics?: JobForensics;
  similar_failures?: Job[]; // Other jobs that failed with similar patterns
  recovery_suggestions?: RecoverySuggestion[];
}

export interface RecoverySuggestion {
  type: 'retry' | 'reassign' | 'manual_review' | 'system_fix' | 'user_contact';
  confidence: 'high' | 'medium' | 'low';
  description: string;
  automated_action_available: boolean;
  estimated_success_rate?: number;
}
