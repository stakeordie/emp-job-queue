// Job types - what users submit (formerly Workflow types)
// A Job represents a user's request, which may contain one or more Steps

/**
 * Job - A user's request that may be processed as a single step or multiple steps
 *
 * In the new semantic model:
 * - Job = What the user requested (formerly "Workflow")
 * - Step = Individual processing unit executed by workers (formerly "Job")
 */
export interface Job {
  id: string; // Unique identifier for this user request (formerly workflow_id)
  customer_id?: string;
  priority: number;
  created_at: string;
  updated_at?: string;
  status: JobStatus;

  // Steps that make up this job
  steps: JobStep[];

  // Metadata
  metadata?: Record<string, unknown>;

  // Timestamps
  started_at?: string;
  completed_at?: string;
  failed_at?: string;
}

/**
 * JobStep - Reference to a Step that is part of a Job
 */
export interface JobStep {
  step_id: string; // References a Step in the queue
  sequence?: number; // Order within the job
  status: StepStatus;
  started_at?: string;
  completed_at?: string;
  result?: unknown;
}

export enum JobStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum StepStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * JobSubmissionRequest - Request to submit a new job
 */
export interface JobSubmissionRequest {
  customer_id?: string;
  priority?: number;
  steps: StepSubmissionRequest[];
  metadata?: Record<string, unknown>;
}

/**
 * StepSubmissionRequest - Details for creating a step within a job
 */
export interface StepSubmissionRequest {
  service_required: string;
  payload: Record<string, unknown>;
  requirements?: unknown;
  sequence?: number;
}

// Note: These types represent the NEW semantic model
// For backwards compatibility during migration, see compatibility.ts
