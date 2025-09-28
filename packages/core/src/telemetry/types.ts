/**
 * Redis Event Stream + Collector Architecture - Core Types
 *
 * Defines the event schema and configuration for the telemetry system
 */

export interface TelemetryEvent {
  /** Unix timestamp in milliseconds */
  timestamp: number;

  /** Source service name (api, worker, monitor, etc.) */
  service: string;

  /** Event type identifier (job.started, api.request, etc.) */
  eventType: string;

  /** Trace ID for correlating related events */
  traceId: string;

  /** Event payload data */
  data: Record<string, any>;

  /** Optional correlation IDs for event tracking */
  jobId?: string;
  workerId?: string;
  machineId?: string;
  userId?: string;

  /** Event severity level */
  level?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Configuration for Redis Stream telemetry
 */
export interface TelemetryConfig {
  /** Redis connection URL */
  redisUrl: string;

  /** Redis stream key for events */
  streamKey: string;

  /** Service name for this instance */
  serviceName: string;

  /** Maximum events to buffer locally if Redis unavailable */
  maxBufferSize: number;

  /** Batch size for flushing events */
  batchSize: number;

  /** Flush interval in milliseconds */
  flushInterval: number;
}

/**
 * Standard event types for consistent naming
 */
export const EventTypes = {
  // Job lifecycle events
  JOB_SUBMITTED: 'job.submitted',
  JOB_CLAIMED: 'job.claimed',
  JOB_STARTED: 'job.started',
  JOB_PROGRESS: 'job.progress',
  JOB_COMPLETED: 'job.completed',
  JOB_FAILED: 'job.failed',

  // API events
  API_REQUEST: 'api.request',
  API_RESPONSE: 'api.response',
  API_ERROR: 'api.error',

  // Worker events
  WORKER_REGISTERED: 'worker.registered',
  WORKER_HEARTBEAT: 'worker.heartbeat',
  WORKER_STATUS_CHANGED: 'worker.status.changed',

  // Machine events
  MACHINE_REGISTERED: 'machine.registered',
  MACHINE_STATUS_CHANGED: 'machine.status.changed',

  // System events
  SERVICE_STARTED: 'service.started',
  SERVICE_STOPPED: 'service.stopped',
  ERROR_OCCURRED: 'error.occurred',
  HEALTH_CHECK: 'health.check',

  // WebSocket events
  WEBSOCKET_CONNECTION: 'websocket.connection',
  WEBSOCKET_DISCONNECTION: 'websocket.disconnection',
  WEBSOCKET_ERROR: 'websocket.error',

  // Redis operation events
  REDIS_OPERATION: 'redis.operation',
  REDIS_CONNECTION: 'redis.connection',
  REDIS_ERROR: 'redis.error',

  // Custom events
  CUSTOM_DEBUG: 'custom.debug',
  CUSTOM_INFO: 'custom.info',
  CUSTOM_WARN: 'custom.warn',
  CUSTOM_ERROR: 'custom.error',
} as const;

/**
 * Redis Stream configuration constants
 */
export const StreamConfig = {
  /** Default stream key */
  DEFAULT_STREAM_KEY: 'telemetry:events',

  /** Consumer group for collectors */
  CONSUMER_GROUP: 'telemetry-collectors',

  /** Default batch size for reading events */
  DEFAULT_BATCH_SIZE: 100,

  /** Default buffer size for local events */
  DEFAULT_BUFFER_SIZE: 1000,

  /** Default flush interval (5 seconds) */
  DEFAULT_FLUSH_INTERVAL: 5000,
} as const;