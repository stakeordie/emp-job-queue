export type MessageType = 
  | 'submit_job'
  | 'job_assigned' 
  | 'update_job_progress'
  | 'complete_job'
  | 'job_failed'
  | 'worker_registration'
  | 'worker_status'
  | 'stats_broadcast'
  | 'heartbeat'
  | 'error'
  | 'sync_job_state'
  | 'cancel_job';

export interface BaseMessage {
  id: string;
  type: MessageType;
  timestamp: number;
  source?: string;
}

export interface SubmitJobMessage extends BaseMessage {
  type: 'submit_job';
  job_type: string;
  priority: number;
  payload: Record<string, unknown>;
  customer_id?: string;
  requirements?: Record<string, unknown>;
  workflow_id?: string;
  workflow_priority?: number;
  workflow_datetime?: number;
  step_number?: number;
}

export interface JobProgressMessage extends BaseMessage {
  type: 'update_job_progress';
  job_id: string;
  progress: number;
  status?: string;
  message?: string;
}

export interface JobCompletedMessage extends BaseMessage {
  type: 'complete_job';
  job_id: string;
  result?: unknown;
  worker_id: string;
}

export interface WorkerStatusMessage extends BaseMessage {
  type: 'worker_status';
  worker_id: string;
  status: string;
  current_job_id?: string;
}

export interface StatsBroadcastMessage extends BaseMessage {
  type: 'stats_broadcast';
  data: {
    workers: unknown[];
    jobs: unknown[];
    system: unknown;
  };
}

export interface SyncJobStateMessage extends BaseMessage {
  type: 'sync_job_state';
  job_id?: string;
}

export interface CancelJobMessage extends BaseMessage {
  type: 'cancel_job';
  job_id: string;
}