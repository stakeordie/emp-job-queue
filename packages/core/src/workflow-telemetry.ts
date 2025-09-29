/**
 * Workflow-Aware Telemetry Client
 *
 * Creates connected trace hierarchies instead of isolated events.
 * Inspired by OpenTelemetry demo patterns for distributed tracing.
 */


export interface WorkflowSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: number;
  endTime?: number;
  status: {
    code: number; // 1=OK, 2=ERROR
    message: string;
  };
  attributes: Record<string, any>;
  events: Array<{
    timestamp: number;
    name: string;
    attributes: Record<string, any>;
  }>;
}

export interface WorkflowContext {
  traceId: string;
  parentSpanId?: string;
  workflowName: string;
  workflowId: string;    // The overall workflow identifier
  jobId?: string;        // Individual job within the workflow (step)
  claimId?: string;      // Worker's claim to execute a job
  // Client/request identifiers
  generationId?: string; // Mini-app generation request identifier (same level as workflow)
  // Grouping/linking identifiers (like metadata)
  userId?: string;
  collectionId?: string; // Links workflows together (like userId)
  machineId?: string;
  workerId?: string;
}

export class WorkflowTelemetryClient {
  private activeSpans: Map<string, WorkflowSpan> = new Map();
  private eventEmitter: (span: WorkflowSpan) => void;
  private serviceName: string;

  constructor(eventEmitter: (span: WorkflowSpan) => void, serviceName: string = 'emp-job-queue') {
    this.eventEmitter = eventEmitter;
    this.serviceName = serviceName;
  }

  /**
   * Start a new workflow trace (root span)
   */
  startWorkflow(workflowName: string, attributes: Record<string, any> = {}): WorkflowContext {
    const traceId = this.generateTraceId();
    const context: WorkflowContext = {
      traceId,
      workflowName,
      workflowId: attributes.workflowId || this.generateTraceId(), // Use provided or generate
      jobId: attributes.jobId,
      claimId: attributes.claimId,
      generationId: attributes.generationId,
      userId: attributes.userId,
      collectionId: attributes.collectionId,
      machineId: attributes.machineId,
      workerId: attributes.workerId,
    };

    // Create root span
    this.startSpan(workflowName, context, {
      'workflow.type': 'root',
      'workflow.name': workflowName,
      ...attributes,
    });

    return context;
  }

  /**
   * Start a child span within a workflow
   */
  startSpan(operationName: string, context: WorkflowContext, attributes: Record<string, any> = {}): WorkflowSpan {
    const spanId = this.generateSpanId();
    const span: WorkflowSpan = {
      traceId: context.traceId,
      spanId,
      parentSpanId: context.parentSpanId,
      operationName,
      startTime: Date.now(),
      status: {
        code: 1, // OK by default
        message: '',
      },
      attributes: {
        'service.name': this.serviceName,
        'trace.workflow': context.workflowName,
        ...attributes,
      },
      events: [],
    };

    // Add correlation IDs for complete traceability
    span.attributes['emp.workflow.id'] = context.workflowId;        // Overall workflow identifier
    if (context.jobId) span.attributes['emp.job.id'] = context.jobId;          // Individual step within workflow
    if (context.claimId) span.attributes['emp.claim.id'] = context.claimId;    // Worker's claim to execute a job

    // Client/request identifiers
    if (context.generationId) span.attributes['emp.generation.id'] = context.generationId;  // Mini-app generation request

    // Grouping/linking identifiers
    if (context.userId) span.attributes['emp.user.id'] = context.userId;
    if (context.collectionId) span.attributes['emp.collection.id'] = context.collectionId;  // Links workflows together
    if (context.machineId) span.attributes['emp.machine.id'] = context.machineId;
    if (context.workerId) span.attributes['emp.worker.id'] = context.workerId;

    this.activeSpans.set(spanId, span);
    return span;
  }

  /**
   * Add an event to an active span
   */
  addSpanEvent(spanId: string, eventName: string, attributes: Record<string, any> = {}): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;

    span.events.push({
      timestamp: Date.now(),
      name: eventName,
      attributes,
    });
  }

  /**
   * Update span attributes
   */
  updateSpanAttributes(spanId: string, attributes: Record<string, any>): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;

    Object.assign(span.attributes, attributes);
  }

  /**
   * Mark span as failed with rich error details and debugging context
   */
  markSpanError(spanId: string, error: Error, debugContext: Record<string, any> = {}): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;

    span.status = {
      code: 2, // ERROR
      message: error.message,
    };

    // Standard error attributes
    span.attributes = {
      ...span.attributes,
      'error.name': error.name,
      'error.message': error.message,
      'error.stack': error.stack,
      'error.timestamp': Date.now(),
      ...debugContext,
    };

    // Add detailed exception event with full context
    this.addSpanEvent(spanId, 'exception', {
      'exception.type': error.name,
      'exception.message': error.message,
      'exception.stacktrace': error.stack,
      'exception.timestamp': new Date().toISOString(),
      // Include debug context in the event
      ...debugContext,
    });

    // Add error fingerprint for grouping similar errors
    const errorFingerprint = this.generateErrorFingerprint(error, debugContext);
    span.attributes['error.fingerprint'] = errorFingerprint;
  }

  /**
   * Record successful operation with rich context
   */
  markSpanSuccess(spanId: string, successContext: Record<string, any> = {}): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;

    span.status = {
      code: 1, // OK
      message: 'Success',
    };

    span.attributes = {
      ...span.attributes,
      'operation.success': true,
      'success.timestamp': Date.now(),
      ...successContext,
    };

    this.addSpanEvent(spanId, 'operation.completed', {
      'completion.timestamp': new Date().toISOString(),
      ...successContext,
    });
  }

  /**
   * Record step completion with progress tracking
   */
  recordStepCompletion(spanId: string, stepName: string, stepContext: Record<string, any> = {}): void {
    this.addSpanEvent(spanId, `step.${stepName}.completed`, {
      'step.name': stepName,
      'step.timestamp': new Date().toISOString(),
      ...stepContext,
    });

    this.updateSpanAttributes(spanId, {
      [`step.${stepName}.completed_at`]: Date.now(),
      ...stepContext,
    });
  }

  /**
   * Record resource usage and system state
   */
  recordResourceUsage(spanId: string, resources: {
    cpu_percent?: number;
    memory_mb?: number;
    disk_space_mb?: number;
    gpu_memory_mb?: number;
    network_bytes?: number;
  }): void {
    this.updateSpanAttributes(spanId, {
      'resource.cpu_percent': resources.cpu_percent,
      'resource.memory_mb': resources.memory_mb,
      'resource.disk_space_mb': resources.disk_space_mb,
      'resource.gpu_memory_mb': resources.gpu_memory_mb,
      'resource.network_bytes': resources.network_bytes,
      'resource.timestamp': Date.now(),
    });
  }

  /**
   * Generate error fingerprint for grouping similar errors
   */
  private generateErrorFingerprint(error: Error, context: Record<string, any>): string {
    const components = [
      error.name,
      error.message?.substring(0, 100), // First 100 chars of message
      context['operation.type'] || 'unknown',
      context['component.name'] || 'unknown',
    ];

    return Buffer.from(components.join('|')).toString('base64').substring(0, 16);
  }

  /**
   * Complete and emit a span
   */
  finishSpan(spanId: string, attributes: Record<string, any> = {}): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;

    span.endTime = Date.now();
    span.attributes = { ...span.attributes, ...attributes };

    // Add duration metrics
    span.attributes['span.duration_ms'] = span.endTime - span.startTime;

    // Emit span
    this.eventEmitter(span);

    // Remove from active spans
    this.activeSpans.delete(spanId);
  }

  /**
   * Create child context for nested operations
   */
  createChildContext(parentContext: WorkflowContext, parentSpanId: string): WorkflowContext {
    return {
      ...parentContext,
      parentSpanId,
    };
  }

  /**
   * Create Redis operation span with proper service attribution
   */
  async withRedisSpan<T>(
    operationName: string,
    context: WorkflowContext,
    operation: (span: WorkflowSpan, childContext: WorkflowContext) => Promise<T>,
    attributes: Record<string, any> = {}
  ): Promise<T> {
    return this.withSpan(operationName, context, operation, {
      'service.name': 'redis',
      'component': 'redis',
      ...attributes,
    });
  }

  /**
   * Convenience method: Execute operation with automatic span lifecycle
   */
  async withSpan<T>(
    operationName: string,
    context: WorkflowContext,
    operation: (span: WorkflowSpan, childContext: WorkflowContext) => Promise<T>,
    attributes: Record<string, any> = {}
  ): Promise<T> {
    const span = this.startSpan(operationName, context, attributes);
    const childContext = this.createChildContext(context, span.spanId);

    try {
      const result = await operation(span, childContext);
      this.finishSpan(span.spanId, { 'operation.success': true });
      return result;
    } catch (error) {
      this.markSpanError(span.spanId, error as Error);
      this.finishSpan(span.spanId, { 'operation.success': false });
      throw error;
    }
  }

  private generateTraceId(): string {
    return Math.random().toString(16).slice(2, 18).padStart(32, '0');
  }

  private generateSpanId(): string {
    return Math.random().toString(16).slice(2, 18).padStart(16, '0');
  }
}

/**
 * Pre-defined workflow types for EMP Job Queue
 */
export const EmpWorkflows = {
  JOB_SUBMISSION: 'emp.job.submission',
  JOB_PROCESSING: 'emp.job.processing',
  WORKER_REGISTRATION: 'emp.worker.registration',
  SYSTEM_HEALTH: 'emp.system.health',
  API_REQUEST: 'emp.api.request',
} as const;

/**
 * Pre-defined operation names for consistent tracing
 */
export const EmpOperations = {
  // API Operations
  API_REQUEST: 'api.request',
  API_RESPONSE: 'api.response',

  // Job Operations
  JOB_VALIDATION: 'job.validation',
  JOB_QUEUED: 'job.queued',
  JOB_CLAIMED: 'job.claimed',
  JOB_STARTED: 'job.started',
  JOB_COMPLETED: 'job.completed',
  JOB_FAILED: 'job.failed',

  // Worker Operations
  WORKER_CLAIM: 'worker.claim',
  WORKER_ASSIGNMENT: 'worker.assignment',
  WORKER_RELEASE: 'worker.release',

  // Redis Operations
  REDIS_OPERATION: 'redis.operation',
  REDIS_FUNCTION: 'redis.function',

  // ComfyUI Operations
  MODEL_DOWNLOAD: 'model.download',
  COMFYUI_INITIALIZE: 'comfyui.initialize',
  COMFYUI_WORKFLOW: 'comfyui.workflow',

  // System Operations
  HEALTH_CHECK: 'health.check',
  RESOURCE_MONITORING: 'resource.monitoring',
} as const;