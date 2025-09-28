/**
 * OpenTelemetry-Compliant Telemetry Types
 *
 * Structured to map directly to OTEL spans, traces, and semantic conventions
 * Based on OTEL semantic conventions and Dash0 best practices
 */

export interface OtelSpan {
  // OTEL Core Fields
  traceId: string;           // 128-bit trace identifier
  spanId: string;            // 64-bit span identifier
  parentSpanId?: string;     // Parent span ID for hierarchy
  operationName: string;     // Span name (what operation this represents)

  // Timing
  startTime: number;         // Unix timestamp in nanoseconds
  endTime?: number;          // Unix timestamp in nanoseconds (for completed spans)
  duration?: number;         // Duration in nanoseconds

  // Status
  status: SpanStatus;

  // Resource Attributes (Service-level)
  resource: ResourceAttributes;

  // Span Attributes (Operation-level)
  attributes: SpanAttributes;

  // Events (logs within spans)
  events?: SpanEvent[];

  // Links to other spans/traces
  links?: SpanLink[];
}

export interface SpanStatus {
  code: SpanStatusCode;
  message?: string;
}

export enum SpanStatusCode {
  UNSET = 0,
  OK = 1,
  ERROR = 2
}

export interface ResourceAttributes {
  // OTEL Semantic Conventions - Service
  'service.name': string;           // e.g., "emp-api", "emp-worker", "emp-machine"
  'service.version': string;        // e.g., "1.0.0"
  'service.instance.id': string;    // e.g., "api-1", "worker-abc123"

  // Deployment
  'deployment.environment': string; // e.g., "development", "staging", "production"

  // EMP-Specific Resource Attributes
  'emp.machine.id'?: string;        // Physical machine identifier
  'emp.machine.pool'?: string;      // e.g., "fast-lane", "standard", "heavy"
  'emp.worker.type'?: string;       // e.g., "comfyui", "ollama", "simulation"
  'emp.deployment.region'?: string; // e.g., "us-west-2", "eu-central-1"
}

export interface SpanAttributes extends Record<string, any> {
  // HTTP Attributes (for API operations)
  'http.method'?: string;           // GET, POST, etc.
  'http.url'?: string;             // Full URL
  'http.status_code'?: number;     // 200, 404, 500, etc.
  'http.route'?: string;           // /api/jobs/{id}

  // Database Attributes (for Redis operations)
  'db.system'?: string;            // "redis"
  'db.operation'?: string;         // "xadd", "xreadgroup", "fcall"
  'db.redis.database_index'?: number;

  // Job Processing Attributes
  'emp.job.id'?: string;           // Unique job identifier
  'emp.job.type'?: string;         // "image_generation", "text_processing"
  'emp.job.priority'?: string;     // "low", "normal", "high", "urgent"
  'emp.job.queue'?: string;        // Queue name
  'emp.job.retry_count'?: number;  // Retry attempt number

  // Worker Attributes
  'emp.worker.id'?: string;        // Worker instance identifier
  'emp.worker.capabilities'?: string[]; // ["comfyui", "gpu", "cuda"]
  'emp.worker.queue'?: string;     // Queue being processed

  // Machine Attributes
  'emp.machine.id'?: string;       // Machine identifier
  'emp.machine.gpu_count'?: number;
  'emp.machine.memory_gb'?: number;
  'emp.machine.disk_gb'?: number;
  'emp.machine.provider'?: string; // "salad", "vast", "local"

  // Business Logic Attributes
  'emp.user.id'?: string;          // User who submitted job
  'emp.model.name'?: string;       // AI model being used
  'emp.model.size_gb'?: number;    // Model size
  'emp.processing.stage'?: string; // "preprocessing", "inference", "postprocessing"

  // Error Attributes
  'error'?: boolean;               // True if operation failed
  'error.type'?: string;           // "TimeoutError", "ValidationError"
  'error.message'?: string;        // Human-readable error
  'error.stack'?: string;          // Stack trace
}

export interface SpanEvent {
  name: string;                    // Event name
  timestamp: number;               // Unix timestamp in nanoseconds
  attributes?: Record<string, any>; // Event-specific attributes
}

export interface SpanLink {
  traceId: string;
  spanId: string;
  attributes?: Record<string, any>;
}

/**
 * EMP Job Processing Span Types
 * Standardized span names following OTEL semantic conventions
 */
export enum EmpSpanTypes {
  // API Operations
  HTTP_REQUEST = 'http.request',
  REDIS_OPERATION = 'redis.operation',

  // Job Lifecycle
  JOB_CREATE = 'emp.job.create',
  JOB_QUEUE = 'emp.job.queue',
  JOB_CLAIM = 'emp.job.claim',
  JOB_PROCESS = 'emp.job.process',
  JOB_COMPLETE = 'emp.job.complete',

  // Worker Operations
  WORKER_START = 'emp.worker.start',
  WORKER_POLL = 'emp.worker.poll',
  WORKER_EXECUTE = 'emp.worker.execute',

  // Machine Operations
  MACHINE_START = 'emp.machine.start',
  MACHINE_HEALTH_CHECK = 'emp.machine.health_check',
  MODEL_DOWNLOAD = 'emp.model.download',
  MODEL_LOAD = 'emp.model.load',

  // Processing Stages
  PREPROCESSING = 'emp.processing.preprocess',
  INFERENCE = 'emp.processing.inference',
  POSTPROCESSING = 'emp.processing.postprocess',
}

/**
 * Trace Context for EMP Job Processing
 * Follows W3C Trace Context specification
 */
export interface EmpTraceContext {
  traceId: string;                 // Unique across entire job lifecycle
  parentSpanId?: string;           // Current span ID becomes parent for child operations
  traceFlags: number;              // Sampling and other flags
  traceState?: string;             // Vendor-specific trace state
}

/**
 * EMP-Specific Span Factories
 * Pre-configured span templates for common operations
 */
export class EmpSpanFactory {
  static createJobSpan(
    operationType: EmpSpanTypes,
    jobId: string,
    traceContext: EmpTraceContext,
    attributes: Partial<SpanAttributes> = {}
  ): OtelSpan {
    return {
      traceId: traceContext.traceId,
      spanId: generateSpanId(),
      parentSpanId: traceContext.parentSpanId,
      operationName: operationType,
      startTime: Date.now() * 1_000_000, // Convert to nanoseconds
      status: { code: SpanStatusCode.UNSET },
      resource: getDefaultResourceAttributes(),
      attributes: {
        'emp.job.id': jobId,
        ...attributes
      }
    };
  }

  static createWorkerSpan(
    operationType: EmpSpanTypes,
    workerId: string,
    traceContext: EmpTraceContext,
    attributes: Partial<SpanAttributes> = {}
  ): OtelSpan {
    return {
      traceId: traceContext.traceId,
      spanId: generateSpanId(),
      parentSpanId: traceContext.parentSpanId,
      operationName: operationType,
      startTime: Date.now() * 1_000_000,
      status: { code: SpanStatusCode.UNSET },
      resource: getDefaultResourceAttributes(),
      attributes: {
        'emp.worker.id': workerId,
        ...attributes
      }
    };
  }

  static createMachineSpan(
    operationType: EmpSpanTypes,
    machineId: string,
    traceContext: EmpTraceContext,
    attributes: Partial<SpanAttributes> = {}
  ): OtelSpan {
    return {
      traceId: traceContext.traceId,
      spanId: generateSpanId(),
      parentSpanId: traceContext.parentSpanId,
      operationName: operationType,
      startTime: Date.now() * 1_000_000,
      status: { code: SpanStatusCode.UNSET },
      resource: getDefaultResourceAttributes(),
      attributes: {
        'emp.machine.id': machineId,
        ...attributes
      }
    };
  }
}

// Utility functions
function generateSpanId(): string {
  return Math.random().toString(16).substr(2, 16).padStart(16, '0');
}

function getDefaultResourceAttributes(): ResourceAttributes {
  return {
    'service.name': process.env.SERVICE_NAME || 'emp-service',
    'service.version': process.env.SERVICE_VERSION || '1.0.0',
    'service.instance.id': process.env.SERVICE_INSTANCE_ID || generateInstanceId(),
    'deployment.environment': process.env.NODE_ENV || 'development'
  };
}

function generateInstanceId(): string {
  return `${process.env.SERVICE_NAME || 'service'}-${Math.random().toString(36).substr(2, 8)}`;
}