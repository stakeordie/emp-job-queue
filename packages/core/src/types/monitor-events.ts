/**
 * Monitor Event Types
 *
 * Real-time event system for monitor communication.
 * Replaces polling-based stats_broadcast with instant event updates.
 */

import { JobStatus, JobRequirements } from './job.js';

// Base event interface
export interface BaseMonitorEvent {
  type: string;
  timestamp: number;
}

// Subscription system
export type SubscriptionTopic =
  | 'workers' // All worker events
  | 'jobs' // All job events
  | 'jobs:progress' // Only progress updates
  | 'jobs:status' // Only status changes
  | 'system_stats' // System statistics
  | 'heartbeat'; // Connection health

export interface SubscriptionFilters {
  job_types?: string[];
  worker_ids?: string[];
  priority_range?: [number, number];
}

// Worker Events
export interface WorkerConnectedEvent extends BaseMonitorEvent {
  type: 'worker_connected';
  worker_id: string;
  worker_data: {
    id: string;
    status: string;
    capabilities: {
      gpu_count: number;
      gpu_memory_gb: number;
      gpu_model: string;
      cpu_cores: number;
      ram_gb: number;
      services: string[];
      models: string[];
      customer_access: string;
      max_concurrent_jobs: number;
    };
    connected_at: string;
    jobs_completed: number;
    jobs_failed: number;
  };
}

export interface WorkerDisconnectedEvent extends BaseMonitorEvent {
  type: 'worker_disconnected';
  worker_id: string;
}

export interface WorkerStatusChangedEvent extends BaseMonitorEvent {
  type: 'worker_status_changed';
  worker_id: string;
  old_status: string;
  new_status: string;
  current_job_id?: string;
}

// Job Events
export interface JobSubmittedEvent extends BaseMonitorEvent {
  type: 'job_submitted';
  job_id: string;
  job_data: {
    id: string;
    job_type: string;
    status: 'pending';
    priority: number;
    payload?: Record<string, unknown>;
    workflow_id?: string;
    workflow_priority?: number;
    workflow_datetime?: number;
    step_number?: number;
    customer_id?: string;
    requirements?: JobRequirements;
    created_at: number;
  };
}

export interface JobAssignedEvent extends BaseMonitorEvent {
  type: 'job_assigned';
  job_id: string;
  worker_id: string;
  old_status: 'pending';
  new_status: 'assigned';
  assigned_at: number;
}

export interface JobStatusChangedEvent extends BaseMonitorEvent {
  type: 'job_status_changed';
  job_id: string;
  old_status: JobStatus;
  new_status: JobStatus;
  worker_id?: string;
}

export interface JobProgressEvent extends BaseMonitorEvent {
  type: 'update_job_progress';
  job_id: string;
  worker_id: string;
  progress: number;
}

export interface JobCompletedEvent extends BaseMonitorEvent {
  type: 'complete_job';
  job_id: string;
  worker_id: string;
  result?: unknown;
  completed_at: number;
}

export interface JobFailedEvent extends BaseMonitorEvent {
  type: 'job_failed';
  job_id: string;
  worker_id?: string;
  error: string;
  failed_at: number;
}

// Connection & Control Events
export interface MonitorConnectEvent extends BaseMonitorEvent {
  type: 'monitor_connect';
  monitor_id: string;
  request_full_state: boolean;
}

export interface SubscribeEvent extends BaseMonitorEvent {
  type: 'subscribe';
  monitor_id: string;
  topics: SubscriptionTopic[];
  filters?: SubscriptionFilters;
}

export interface ResyncRequestEvent extends BaseMonitorEvent {
  type: 'resync_request';
  monitor_id: string;
  since_timestamp: number;
  max_events?: number;
}

export interface ResyncResponseEvent extends BaseMonitorEvent {
  type: 'resync_response';
  monitor_id: string;
  events: MonitorEvent[];
  has_more: boolean;
  oldest_available_timestamp: number;
}

export interface FullStateSnapshotEvent extends BaseMonitorEvent {
  type: 'full_state_snapshot';
  data: {
    workers: Record<string, unknown>;
    jobs: {
      pending: unknown[];
      active: unknown[];
      completed: unknown[];
      failed: unknown[];
    };
    system_stats: Record<string, number>;
  };
}

// Heartbeat & Health
export interface HeartbeatEvent extends BaseMonitorEvent {
  type: 'heartbeat';
  monitor_id: string;
}

export interface HeartbeatAckEvent extends BaseMonitorEvent {
  type: 'heartbeat_ack';
  monitor_id: string;
  server_timestamp: number;
  events_missed?: number;
}

// System Events
export interface SystemStatsEvent extends BaseMonitorEvent {
  type: 'system_stats';
  stats: {
    total_workers: number;
    active_workers: number;
    total_jobs: number;
    pending_jobs: number;
    active_jobs: number;
    completed_jobs: number;
    failed_jobs: number;
  };
}

// Union type for all events
export type MonitorEvent =
  | WorkerConnectedEvent
  | WorkerDisconnectedEvent
  | WorkerStatusChangedEvent
  | JobSubmittedEvent
  | JobAssignedEvent
  | JobStatusChangedEvent
  | JobProgressEvent
  | JobCompletedEvent
  | JobFailedEvent
  | MonitorConnectEvent
  | SubscribeEvent
  | ResyncRequestEvent
  | ResyncResponseEvent
  | FullStateSnapshotEvent
  | HeartbeatEvent
  | HeartbeatAckEvent
  | SystemStatsEvent;

// Monitor subscription tracking
export interface MonitorSubscription {
  monitor_id: string;
  topics: SubscriptionTopic[];
  filters?: SubscriptionFilters;
  connected_at: number;
  last_heartbeat: number;
}
