/**
 * TypeScript definitions for Emp-Redis message types
 *
 * CRITICAL: This file must maintain 100% compatibility with the Python message system.
 * Any changes here must be coordinated with the Python core/core_types/base_messages.py
 *
 * Direct port from /core/client-types/messages.ts to ensure message compatibility
 */

import { Timestamp } from './timestamp.js';
import { JobRequirements } from './job.js';

/**
 * All possible message types in the system - MUST MATCH PYTHON EXACTLY
 */
export enum MessageType {
  // Setup Messages
  REGISTER_WORKER = 'register_worker',
  WORKER_REGISTERED = 'worker_registered',
  WORKER_HEARTBEAT = 'worker_heartbeat',
  WORKER_HEARTBEAT_ACK = 'worker_heartbeat_ack',
  WORKER_STATUS = 'worker_status',
  CONNECTION_ESTABLISHED = 'connection_established',

  // Job Workflow Messages
  SUBMIT_JOB = 'submit_job',
  JOB_ACCEPTED = 'job_accepted',
  JOB_AVAILABLE = 'job_available',
  CLAIM_JOB = 'claim_job',
  JOB_ASSIGNED = 'job_assigned',
  UPDATE_JOB_PROGRESS = 'update_job_progress',
  COMPLETE_JOB = 'complete_job',
  FAIL_JOB = 'fail_job',
  CANCEL_JOB = 'cancel_job',
  FORCE_RETRY_JOB = 'force_retry_job',
  JOB_COMPLETED_ACK = 'job_completed_ack',
  JOB_FAILED_ACK = 'job_failed_ack',

  // Status Messages
  REQUEST_JOB_STATUS = 'request_job_status',
  RESPONSE_JOB_STATUS = 'response_job_status',
  REQUEST_STATS = 'request_stats',
  RESPONSE_STATS = 'response_stats',
  SUBSCRIBE_STATS = 'subscribe_stats',
  SUBSCRIPTION_CONFIRMED = 'subscription_confirmed',
  STATS_BROADCAST = 'stats_broadcast',

  // Job Specific Messages
  SUBSCRIBE_JOB = 'subscribe_job',
  JOB_NOTIFICATIONS_SUBSCRIBED = 'job_notifications_subscribed',
  SUBSCRIBE_JOB_NOTIFICATIONS = 'subscribe_job_notifications',

  // Service Messages
  SERVICE_REQUEST = 'service_request',
  CONNECTOR_WS_STATUS = 'connector_ws_status',

  // System Messages
  ACK = 'ack',
  UNKNOWN = 'unknown',
  ERROR = 'error',

  // Legacy compatibility - these are used in some places
  JOB_UPDATE = 'job_update',
  JOB_COMPLETED = 'job_completed',

  // Additional message types
  SYSTEM_STATUS = 'system_status',
}

/**
 * Base interface for all messages - MUST MATCH PYTHON BaseMessage
 */
export interface BaseMessage {
  type: string;
  timestamp: Timestamp; // Always required, always a number (milliseconds)
  id?: string;
  source?: string;
  job_id?: string; // Many messages have job_id
  worker_id?: string; // Many messages have worker_id
  [key: string]: unknown; // Allow additional properties for flexibility
}

/**
 * Job model for job submission - MUST MATCH PYTHON Job
 */
export interface Job {
  id: string;
  type: string;
  priority: number;
  params: Record<string, unknown>;
  client_id?: string;
  timestamp: Timestamp;
}

/**
 * Worker identification - MUST MATCH PYTHON WorkerInfo
 */
export interface WorkerInfo {
  machine_id: string;
  gpu_id: number;
  worker_id?: string;
  timestamp: Timestamp;
}

// ============================================================================
// CLIENT TO SERVER MESSAGES
// ============================================================================

/**
 * Message to submit a new job - MUST MATCH PYTHON SubmitJobMessage
 */
export interface SubmitJobMessage extends BaseMessage {
  type: MessageType.SUBMIT_JOB;
  job_type: string;
  priority: number;
  payload: Record<string, unknown>;
  customer_id?: string;
  requirements?: JobRequirements;
  workflow_id?: string;
  workflow_priority?: number;
  workflow_datetime?: number;
  step_number?: number;
  timestamp: Timestamp;
}

/**
 * Message to request job status - MUST MATCH PYTHON RequestJobStatusMessage
 */
export interface RequestJobStatusMessage extends BaseMessage {
  type: MessageType.REQUEST_JOB_STATUS;
  job_id: string;
  timestamp: Timestamp;
}

/**
 * Message to register a worker - MUST MATCH PYTHON RegisterWorkerMessage
 */
export interface RegisterWorkerMessage extends BaseMessage {
  type: MessageType.REGISTER_WORKER;
  worker_id: string;
  capabilities?: Record<string, unknown>;
  subscribe_to_jobs?: boolean;
  status?: string;
  timestamp: Timestamp;
}

/**
 * Message to update job progress - MUST MATCH PYTHON UpdateJobProgressMessage
 */
export interface UpdateJobProgressMessage extends BaseMessage {
  type: MessageType.UPDATE_JOB_PROGRESS;
  job_id: string;
  worker_id: string;
  progress: number;
  status: string;
  message?: string;
  timestamp: Timestamp;
  client_id?: string; // Present in Python messages
  connector_details?: {
    connected: boolean;
    service: string;
    details: Record<string, unknown>;
    ws_url?: string;
    use_ssl?: boolean;
    current_job_id?: string;
    version?: string;
  };
}

/**
 * Message to complete a job - MUST MATCH PYTHON CompleteJobMessage
 */
export interface CompleteJobMessage extends BaseMessage {
  type: MessageType.COMPLETE_JOB;
  job_id: string;
  worker_id: string; // CRITICAL: This field was missing but required in Python
  result?: Record<string, unknown>;
  client_id?: string; // Present in Python messages
  timestamp: Timestamp;
}

/**
 * Message to cancel a job - MUST MATCH PYTHON CancelJobMessage
 */
export interface CancelJobMessage extends BaseMessage {
  type: MessageType.CANCEL_JOB;
  job_id: string;
  reason?: string;
  timestamp: Timestamp;
}

/**
 * Message to fail a job - MUST MATCH PYTHON FailJobMessage
 */
export interface FailJobMessage extends BaseMessage {
  type: MessageType.FAIL_JOB;
  job_id: string;
  worker_id: string;
  error?: string; // Optional in Python, should be optional here too
  retry?: boolean;
  timestamp: Timestamp;
}

/**
 * Message to claim a job - MUST MATCH PYTHON ClaimJobMessage
 */
export interface ClaimJobMessage extends BaseMessage {
  type: MessageType.CLAIM_JOB;
  worker_id: string;
  job_id: string;
  claim_timeout?: number;
  timestamp: Timestamp;
}

/**
 * Worker heartbeat message - MUST MATCH PYTHON WorkerHeartbeatMessage
 */
export interface WorkerHeartbeatMessage extends BaseMessage {
  type: MessageType.WORKER_HEARTBEAT;
  worker_id: string;
  status?: string;
  load?: number;
  system_info?: SystemInfo;
  timestamp: Timestamp;
}

/**
 * Worker status message - MUST MATCH PYTHON WorkerStatusMessage
 */
export interface WorkerStatusMessage extends BaseMessage {
  type: MessageType.WORKER_STATUS;
  worker_id: string;
  status?: string;
  capabilities?: Record<string, unknown>;
  current_job_id?: string;
  timestamp: Timestamp;
}

// ============================================================================
// SERVER TO CLIENT MESSAGES
// ============================================================================

/**
 * Message indicating a job has been accepted - MUST MATCH PYTHON JobAcceptedMessage
 */
export interface JobAcceptedMessage extends BaseMessage {
  type: MessageType.JOB_ACCEPTED;
  job_id: string;
  status: string;
  position?: number;
  estimated_start?: string;
  notified_workers?: number;
  timestamp: Timestamp;
}

/**
 * Message with job status information - MUST MATCH PYTHON ResponseJobStatusMessage
 */
export interface ResponseJobStatusMessage extends BaseMessage {
  type: MessageType.RESPONSE_JOB_STATUS;
  job_id: string;
  status: string;
  progress?: number;
  worker_id?: string;
  started_at?: number;
  completed_at?: number;
  result?: Record<string, unknown>;
  message?: string;
  client_id?: string; // Present in Python messages
  timestamp: Timestamp;
}

/**
 * Message indicating a job has been assigned - MUST MATCH PYTHON JobAssignedMessage
 */
export interface JobAssignedMessage extends BaseMessage {
  type: MessageType.JOB_ASSIGNED;
  job_id: string;
  worker_id: string;
  job_type: string;
  priority: number;
  params: Record<string, unknown>;
  job_data?: JobData; // Additional job data
  timestamp: Timestamp;
}

/**
 * Message indicating a job is available - MUST MATCH PYTHON JobAvailableMessage
 */
export interface JobAvailableMessage extends BaseMessage {
  type: MessageType.JOB_AVAILABLE;
  job_id: string;
  job_type: string;
  priority?: number;
  params_summary?: Record<string, unknown>;
  timestamp: Timestamp;
}

/**
 * Message indicating a job has been completed - MUST MATCH PYTHON JobCompletedMessage
 */
export interface JobCompletedMessage extends BaseMessage {
  type: MessageType.JOB_COMPLETED;
  job_id: string;
  worker_id?: string;
  status: string;
  priority?: number;
  position?: number;
  result?: Record<string, unknown>;
  timestamp: Timestamp;
}

/**
 * Message indicating a worker has been registered - MUST MATCH PYTHON WorkerRegisteredMessage
 */
export interface WorkerRegisteredMessage extends BaseMessage {
  type: MessageType.WORKER_REGISTERED;
  worker_id: string;
  status: string;
  timestamp: Timestamp;
}

/**
 * Connection established message - MUST MATCH PYTHON ConnectionEstablishedMessage
 */
export interface ConnectionEstablishedMessage extends BaseMessage {
  type: MessageType.CONNECTION_ESTABLISHED;
  message: string;
  timestamp: Timestamp;
}

/**
 * Error message - MUST MATCH PYTHON ErrorMessage
 */
export interface ErrorMessage extends BaseMessage {
  type: MessageType.ERROR;
  error: string;
  details?: Record<string, unknown>;
  timestamp: Timestamp;
}

// ============================================================================
// STATS AND SUBSCRIPTION MESSAGES
// ============================================================================

/**
 * Message to subscribe to stats updates - MUST MATCH PYTHON SubscribeStatsMessage
 */
export interface SubscribeStatsMessage extends BaseMessage {
  type: MessageType.SUBSCRIBE_STATS;
  enabled: boolean;
  timestamp: Timestamp;
}

/**
 * Message to request current stats - MUST MATCH PYTHON RequestStatsMessage
 */
export interface RequestStatsMessage extends BaseMessage {
  type: MessageType.REQUEST_STATS;
  timestamp: Timestamp;
}

/**
 * Message with stats response - MUST MATCH PYTHON ResponseStatsMessage
 */
export interface ResponseStatsMessage extends BaseMessage {
  type: MessageType.RESPONSE_STATS;
  stats: Record<string, unknown>;
  timestamp: Timestamp;
}

/**
 * Stats broadcast message - MUST MATCH PYTHON StatsBroadcastMessage
 */
export interface StatsBroadcastMessage extends BaseMessage {
  type: MessageType.STATS_BROADCAST;
  message_id: string;
  connections: {
    clients: string[];
    workers: string[];
    monitors: string[];
  };
  workers: Record<
    string,
    {
      status: string;
      connection_status: string;
      is_accepting_jobs: boolean;
      supported_job_types: string[];
      capabilities?: Record<string, unknown>;
      connected_at?: string;
      jobs_processed?: number;
      last_heartbeat?: string;
      current_job_id?: string;
    }
  >;
  subscriptions: {
    stats: string[];
    job_notifications: string[];
    jobs: Record<string, string[]>;
  };
  system: {
    queues: {
      priority: number;
      standard: number;
      total: number;
    };
    jobs: {
      total: number;
      status: {
        pending: number;
        active: number;
        completed: number;
        failed: number;
      };
      active_jobs: Array<{
        id: string;
        job_type: string;
        status: string;
        priority: number;
        worker_id?: string;
        created_at: string;
        updated_at?: string;
        progress?: number;
      }>;
      pending_jobs: Array<{
        id: string;
        job_type: string;
        status: string;
        priority: number;
        created_at: string;
        updated_at: string;
      }>;
      completed_jobs: Array<{
        id: string;
        job_type: string;
        status: string;
        priority: number;
        worker_id?: string;
        created_at: string;
        updated_at: string;
        progress?: number;
      }>;
      failed_jobs: Array<{
        id: string;
        job_type: string;
        status: string;
        priority: number;
        worker_id?: string;
        created_at: string;
        updated_at: string;
        progress?: number;
      }>;
    };
    workers: {
      total: number;
      status: {
        idle: number;
        working: number;
      };
      active_workers: Array<{
        id: string;
        status: string;
        connected_at: string;
        jobs_processed: number;
        last_heartbeat: string;
        current_job_id?: string;
      }>;
    };
  };
  timestamp: Timestamp;
}

/**
 * Message to subscribe to job updates - MUST MATCH PYTHON SubscribeJobMessage
 */
export interface SubscribeJobMessage extends BaseMessage {
  type: MessageType.SUBSCRIBE_JOB;
  job_id: string;
  timestamp: Timestamp;
}

/**
 * Message to subscribe to job notifications - MUST MATCH PYTHON SubscribeJobNotificationsMessage
 */
export interface SubscribeJobNotificationsMessage extends BaseMessage {
  type: MessageType.SUBSCRIBE_JOB_NOTIFICATIONS;
  enabled: boolean;
  timestamp: Timestamp;
}

/**
 * Subscription confirmed message - MUST MATCH PYTHON SubscriptionConfirmedMessage
 */
export interface SubscriptionConfirmedMessage extends BaseMessage {
  type: MessageType.SUBSCRIPTION_CONFIRMED;
  subscription_type: string;
  timestamp: Timestamp;
}

/**
 * Job notifications subscribed message - MUST MATCH PYTHON JobNotificationsSubscribedMessage
 */
export interface JobNotificationsSubscribedMessage extends BaseMessage {
  type: MessageType.JOB_NOTIFICATIONS_SUBSCRIBED;
  worker_id: string;
  timestamp: Timestamp;
}

/**
 * Service request message - MUST MATCH PYTHON ServiceRequestMessage
 */
export interface ServiceRequestMessage extends BaseMessage {
  type: MessageType.SERVICE_REQUEST;
  job_id: string;
  worker_id: string;
  service: string; // Python uses "service", not "service_type"
  request_type: string; // Python field
  content: Record<string, unknown>; // Python uses "content", not "payload"
  timestamp: Timestamp;
}

/**
 * Connector WebSocket status message - MUST MATCH PYTHON ConnectorWSStatusMessage
 */
export interface ConnectorWSStatusMessage extends BaseMessage {
  type: MessageType.CONNECTOR_WS_STATUS;
  worker_id: string;
  connector_type: string;
  status: string;
  details?: Record<string, unknown>;
  timestamp: Timestamp;
}

/**
 * Message for acknowledging receipt - MUST MATCH PYTHON AckMessage
 */
export interface AckMessage extends BaseMessage {
  type: MessageType.ACK;
  message_id?: string;
  original_type?: string;
  timestamp: Timestamp;
}

/**
 * Message for unknown message types - MUST MATCH PYTHON UnknownMessage
 */
export interface UnknownMessage extends BaseMessage {
  type: MessageType.UNKNOWN;
  content: string;
  timestamp: Timestamp;
}

/**
 * Job update message (legacy compatibility)
 */
export interface JobUpdateMessage extends BaseMessage {
  type: MessageType.JOB_UPDATE;
  job_id: string;
  status: string;
  priority?: number;
  position?: number;
  progress?: number;
  eta?: string;
  message?: string;
  timestamp: Timestamp;
}

// ============================================================================
// BACKWARD COMPATIBILITY ALIASES
// ============================================================================

/**
 * @deprecated Use RequestJobStatusMessage instead
 */
export interface GetJobStatusMessage extends RequestJobStatusMessage {
  type: MessageType.REQUEST_JOB_STATUS;
}

/**
 * @deprecated Use ResponseJobStatusMessage instead
 */
export interface JobStatusMessage extends ResponseJobStatusMessage {
  type: MessageType.RESPONSE_JOB_STATUS;
}

/**
 * @deprecated Use RequestStatsMessage instead
 */
export interface GetStatsMessage extends RequestStatsMessage {
  type: MessageType.REQUEST_STATS;
}

/**
 * @deprecated Use ResponseStatsMessage instead
 */
export interface StatsResponseMessage extends ResponseStatsMessage {
  type: MessageType.RESPONSE_STATS;
}

/**
 * @deprecated Use SubmitJobMessage instead
 */
export interface JobSubmissionMessage extends SubmitJobMessage {
  type: MessageType.SUBMIT_JOB;
}

/**
 * @deprecated Use UpdateJobProgressMessage instead
 */
export interface JobProgressMessage extends UpdateJobProgressMessage {
  type: MessageType.UPDATE_JOB_PROGRESS;
}

/**
 * @deprecated Use FailJobMessage instead
 */
export interface JobFailedMessage extends FailJobMessage {
  type: MessageType.FAIL_JOB;
}

/**
 * @deprecated Use RegisterWorkerMessage instead
 */
export interface WorkerRegistrationMessage extends RegisterWorkerMessage {
  type: MessageType.REGISTER_WORKER;
}

/**
 * System status message
 */
export interface SystemStatusMessage extends BaseMessage {
  type: MessageType.SYSTEM_STATUS;
  active_workers: number;
  pending_jobs: number;
  active_jobs: number;
  completed_jobs: number;
  timestamp: Timestamp;
}

/**
 * Chunked message for large payloads
 */
export interface ChunkedMessage {
  chunk_id: string;
  total_chunks: number;
  chunks: Map<number, string>;
  data_hash: string;
  created_at: number;
}

/**
 * Chunked message chunk
 */
export interface ChunkedMessageChunk {
  chunkId: string;
  chunkIndex: number;
  totalChunks: number;
  data: string;
  dataHash: string;
}

// ============================================================================
// UNION TYPES
// ============================================================================

/**
 * Union type of all possible messages
 */
export type Message =
  | SubmitJobMessage
  | RequestJobStatusMessage
  | RegisterWorkerMessage
  | UpdateJobProgressMessage
  | CompleteJobMessage
  | FailJobMessage
  | ClaimJobMessage
  | WorkerHeartbeatMessage
  | WorkerStatusMessage
  | JobAcceptedMessage
  | ResponseJobStatusMessage
  | JobAssignedMessage
  | JobAvailableMessage
  | JobCompletedMessage
  | WorkerRegisteredMessage
  | ConnectionEstablishedMessage
  | ErrorMessage
  | SubscribeStatsMessage
  | RequestStatsMessage
  | ResponseStatsMessage
  | StatsBroadcastMessage
  | SubscribeJobMessage
  | SubscribeJobNotificationsMessage
  | SubscriptionConfirmedMessage
  | JobNotificationsSubscribedMessage
  | ServiceRequestMessage
  | ConnectorWSStatusMessage
  | AckMessage
  | UnknownMessage
  | JobUpdateMessage;

/**
 * Type guard to check if a message is of a specific type
 */
export function isMessageType<T extends Message>(
  message: Message,
  type: MessageType
): message is T {
  return message.type === type;
}

// ============================================================================
// SUPPORTING TYPES FOR COMPATIBILITY
// ============================================================================

/**
 * Worker status enumeration
 */
export enum WorkerStatus {
  IDLE = 'idle',
  BUSY = 'busy',
  OFFLINE = 'offline',
  ERROR = 'error',
}

/**
 * System information for monitoring
 */
export interface SystemInfo {
  cpu_usage: number;
  memory_usage: number;
  gpu_usage?: number;
  gpu_memory_usage?: number;
  disk_usage: number;
  uptime: number;
}

/**
 * Job data structure
 */
export interface JobData {
  id: string;
  type: string;
  priority: number;
  payload: Record<string, unknown>;
  requirements?: JobRequirements;
  customer_id?: string;
  created_at: string;
  assigned_at?: string;
  started_at?: string;
}

/**
 * Job result structure
 */
export interface JobResult {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
  processing_time?: number;
  output_files?: string[];
}
