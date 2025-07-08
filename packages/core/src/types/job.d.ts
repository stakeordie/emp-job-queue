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
    step_number?: number;
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
export declare enum JobStatus {
    PENDING = "pending",
    QUEUED = "queued",
    ASSIGNED = "assigned",
    ACCEPTED = "accepted",
    IN_PROGRESS = "in_progress",
    COMPLETED = "completed",
    FAILED = "failed",
    CANCELLED = "cancelled",
    TIMEOUT = "timeout",
    UNWORKABLE = "unworkable"
}
export interface JobRequirements {
    service_type: string;
    component?: string | 'all';
    workflow?: string | 'all';
    models?: string[] | 'all';
    hardware?: {
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
    progress: number;
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
    service_required: string;
    payload: Record<string, unknown>;
    priority?: number;
    requirements?: JobRequirements;
    customer_id?: string;
    workflow_id?: string;
    workflow_priority?: number;
    workflow_datetime?: number;
    step_number?: number;
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
export interface JobQueueInfo {
    pending_count: number;
    active_count: number;
    completed_count: number;
    failed_count: number;
    average_processing_time: number;
    oldest_pending_job?: string;
}
export interface WorkflowMetadata {
    workflow_id: string;
    priority: number;
    submitted_at: number;
    customer_id?: string;
    status: 'active' | 'completed' | 'failed';
    total_steps?: number;
    completed_steps?: number;
}
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
//# sourceMappingURL=job.d.ts.map