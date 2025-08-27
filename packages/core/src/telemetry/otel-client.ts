// Universal OpenTelemetry Client - Simple functions to send traces and metrics from anywhere
// No SDK required - sends directly to local OTel Collector

import { getRequiredEnv } from '../utils/env.js';

/**
 * Send a trace span to the local OTel Collector
 * @param name - The span name (e.g., 'api.job.submit', 'worker.processing')
 * @param attributes - Key-value pairs of span attributes
 * @param options - Optional span configuration (duration, status, events)
 */
export async function sendTrace(
  name: string,
  attributes: Record<string, any> = {},
  options: {
    duration_ms?: number;
    status?: 'ok' | 'error';
    events?: Array<{ name: string; attributes?: Record<string, any> }>;
    parent_trace_id?: string;
    parent_span_id?: string;
  } = {}
): Promise<{ traceId: string; spanId: string }> {
  const collectorEndpoint = process.env.OTEL_COLLECTOR_TRACES_ENDPOINT || 'https://ingress.us-west-2.aws.dash0.com:4318/v1/traces';
  
  // Generate IDs
  const traceId = options.parent_trace_id || generateTraceId();
  const spanId = generateSpanId();
  
  // 🚨 BIG TRACE LOGGING: OTEL CLIENT CREATING SPAN
  console.log(`\n🚨🚨🚨 OTEL: CREATING SPAN '${name}'`);
  console.log(`🚨 PARENT_TRACE_ID: ${options.parent_trace_id || 'NONE - GENERATING NEW'}`);
  console.log(`🚨 FINAL TRACE_ID: ${traceId}`);
  console.log(`🚨 SPAN_ID: ${spanId}`);
  console.log(`🚨 PARENT_SPAN_ID: ${options.parent_span_id || 'NONE'}`);
  console.log(`🚨🚨🚨\n`);
  const startTime = Date.now() * 1000000; // nanoseconds
  const duration = (options.duration_ms || 1) * 1000000; // convert to nanoseconds
  
  // Build OTLP payload
  const payload = {
    resourceSpans: [{
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: process.env.SERVICE_NAME || 'emp-service' } },
          { key: 'service.version', value: { stringValue: process.env.SERVICE_VERSION || '1.0.0' } },
          { key: 'telemetry.dataset', value: { stringValue: process.env.DASH0_DATASET || 'development' } },
          { key: 'machine.id', value: { stringValue: process.env.MACHINE_ID || process.env.HOSTNAME || 'unknown' } },
          { key: 'worker.id', value: { stringValue: process.env.WORKER_ID || process.pid?.toString() || 'unknown' } }
        ]
      },
      scopeSpans: [{
        scope: {
          name: 'emp-telemetry',
          version: '1.0.0'
        },
        spans: [{
          traceId,
          spanId,
          ...(options.parent_span_id && { parentSpanId: options.parent_span_id }),
          name,
          kind: 1, // SPAN_KIND_INTERNAL
          startTimeUnixNano: startTime.toString(),
          endTimeUnixNano: (startTime + duration).toString(),
          attributes: Object.entries(attributes).map(([key, value]) => ({
            key,
            value: { stringValue: String(value) }
          })),
          events: (options.events || []).map(event => ({
            timeUnixNano: (startTime + Math.random() * duration).toString(),
            name: event.name,
            attributes: Object.entries(event.attributes || {}).map(([key, value]) => ({
              key,
              value: { stringValue: String(value) }
            }))
          })),
          status: {
            code: options.status === 'error' ? 2 : 1 // STATUS_CODE_ERROR : STATUS_CODE_OK
          }
        }]
      }]
    }]
  };

  try {
    const response = await fetch(collectorEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.warn(`Failed to send trace to collector: ${response.status} ${response.statusText}`);
    }

    return { traceId, spanId };

  } catch (error) {
    console.warn('Error sending trace to collector:', error.message);
    return { traceId: 'collector_unavailable', spanId: 'collector_unavailable' };
  }
}

/**
 * Send a metric to the local OTel Collector
 * @param name - The metric name (e.g., 'machine.gpu.count', 'job.duration')
 * @param value - The numeric value of the metric
 * @param attributes - Key-value pairs of metric attributes
 * @param type - The metric type: 'gauge' (point-in-time) or 'counter' (cumulative)
 */
export async function sendMetric(
  name: string,
  value: number,
  attributes: Record<string, any> = {},
  type: 'gauge' | 'counter' = 'gauge'
): Promise<void> {
  const collectorEndpoint = process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT || 'http://localhost:4318/v1/metrics';
  
  const timestamp = Date.now() * 1000000; // nanoseconds
  
  // Build OTLP metrics payload
  const payload = {
    resourceMetrics: [{
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: process.env.SERVICE_NAME || 'emp-service' } },
          { key: 'service.version', value: { stringValue: process.env.SERVICE_VERSION || '1.0.0' } },
          { key: 'telemetry.dataset', value: { stringValue: process.env.DASH0_DATASET || 'development' } },
          { key: 'machine.id', value: { stringValue: process.env.MACHINE_ID || 'unknown' } }
        ]
      },
      scopeMetrics: [{
        scope: {
          name: 'emp-metrics',
          version: '1.0.0'
        },
        metrics: [{
          name,
          description: `${type === 'counter' ? 'Counter' : 'Gauge'} metric: ${name}`,
          unit: '1',
          [type === 'counter' ? 'sum' : 'gauge']: {
            dataPoints: [{
              timeUnixNano: timestamp.toString(),
              [type === 'counter' ? 'asInt' : 'asDouble']: type === 'counter' ? Math.floor(value) : value,
              attributes: Object.entries(attributes).map(([key, value]) => ({
                key,
                value: { stringValue: String(value) }
              }))
            }],
            ...(type === 'counter' && {
              aggregationTemporality: 2, // AGGREGATION_TEMPORALITY_CUMULATIVE
              isMonotonic: true
            })
          }
        }]
      }]
    }]
  };

  try {
    const response = await fetch(collectorEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.warn(`Failed to send metric to collector: ${response.status} ${response.statusText}`);
    }

  } catch (error) {
    console.warn('Error sending metric to collector:', error.message);
  }
}

/**
 * Create a trace span that automatically measures duration
 * @param name - The span name
 * @param attributes - Initial attributes for the span
 * @returns A span object with end() method to complete the span
 */
export function startSpan(
  name: string,
  attributes: Record<string, any> = {}
): {
  spanId: string;
  traceId: string;
  addEvent: (name: string, attributes?: Record<string, any>) => void;
  setAttributes: (attributes: Record<string, any>) => void;
  setStatus: (status: 'ok' | 'error') => void;
  end: () => Promise<void>;
} {
  const traceId = generateTraceId();
  const spanId = generateSpanId();
  const startTime = Date.now();
  const events: Array<{ name: string; attributes?: Record<string, any> }> = [];
  let status: 'ok' | 'error' = 'ok';
  let spanAttributes = { ...attributes };

  return {
    spanId,
    traceId,
    
    addEvent(name: string, eventAttributes?: Record<string, any>) {
      events.push({ name, attributes: eventAttributes });
    },
    
    setAttributes(newAttributes: Record<string, any>) {
      spanAttributes = { ...spanAttributes, ...newAttributes };
    },
    
    setStatus(newStatus: 'ok' | 'error') {
      status = newStatus;
    },
    
    async end() {
      const duration_ms = Date.now() - startTime;
      await sendTrace(name, spanAttributes, {
        duration_ms,
        status,
        events
      });
    }
  };
}

// Helper functions
function generateTraceId(): string {
  // 32 hex characters
  return Array.from({ length: 32 }, () => 
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

function generateSpanId(): string {
  // 16 hex characters
  return Array.from({ length: 16 }, () => 
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

// ============================================================================
// Workflow Lifecycle Instrumentation (Top Level)
// ============================================================================

// Workflow Lifecycle Data Interfaces
export interface WorkflowStartData {
  workflowId: string;
  totalSteps: number;
  userId?: string;
  workflowType: string;
  estimatedDuration?: number;
}

export interface WorkflowStepData {
  workflowId: string;
  stepNumber: number;
  totalSteps: number;
  jobId: string;
  stepType: string;
}

export interface WorkflowCompleteData {
  workflowId: string;
  totalSteps: number;
  completedSteps: number;
  duration: number;
  status: 'completed' | 'partial' | 'failed';
}

export interface WorkflowStepFailData {
  workflowId: string;
  stepNumber: number;
  jobId: string;
  error: string;
  failureType: string;
}

export interface WorkflowCancelData {
  workflowId: string;
  cancelReason: string;
  completedSteps: number;
  totalSteps: number;
}

export interface WorkflowTimeoutData {
  workflowId: string;
  timeoutAfter: number;
  completedSteps: number;
  totalSteps: number;
}

// Workflow Lifecycle Instrumentation - Multi-job workflows
export const WorkflowInstrumentation = {
  // Workflow orchestration
  start: (data: WorkflowStartData): Promise<SpanContext> => {
    const attributes = {
      'workflow.id': data.workflowId,
      'workflow.type': data.workflowType,
      'workflow.total_steps': data.totalSteps,
      'workflow.estimated_duration_ms': data.estimatedDuration?.toString() || 'unknown',
      'lifecycle.stage': 'workflow_start',
      'component.type': 'workflow-orchestrator'
    };

    if (data.userId) {
      attributes['user.id'] = data.userId;
    }

    const events = [
      {
        name: 'workflow.started',
        attributes: {
          'workflow.start_timestamp': new Date().toISOString(),
          'workflow.type': data.workflowType,
          'workflow.total_steps': data.totalSteps.toString()
        }
      }
    ];

    return sendTrace('workflow.start', attributes, {
      events,
      status: 'ok'
    });
  },

  stepSubmit: (data: WorkflowStepData, parent?: SpanContext): Promise<SpanContext> => {
    const attributes = {
      'workflow.id': data.workflowId,
      'workflow.step_number': data.stepNumber,
      'workflow.total_steps': data.totalSteps,
      'workflow.step_type': data.stepType,
      'job.id': data.jobId,
      'lifecycle.stage': 'workflow_step_submit',
      'component.type': 'workflow-orchestrator'
    };

    const events = [
      {
        name: 'workflow.step_submitted',
        attributes: {
          'step.timestamp': new Date().toISOString(),
          'step.number': data.stepNumber.toString(),
          'step.type': data.stepType,
          'step.job_id': data.jobId
        }
      }
    ];

    return sendTrace('workflow.step_submit', attributes, {
      events,
      status: 'ok',
      parent_trace_id: parent?.traceId,
      parent_span_id: parent?.spanId
    });
  },

  stepComplete: (data: WorkflowStepData, parent?: SpanContext): Promise<SpanContext> => {
    const attributes = {
      'workflow.id': data.workflowId,
      'workflow.step_number': data.stepNumber,
      'workflow.total_steps': data.totalSteps,
      'workflow.step_type': data.stepType,
      'job.id': data.jobId,
      'workflow.progress_percent': Math.round((data.stepNumber / data.totalSteps) * 100),
      'lifecycle.stage': 'workflow_step_complete',
      'component.type': 'workflow-orchestrator'
    };

    const events = [
      {
        name: 'workflow.step_completed',
        attributes: {
          'step.timestamp': new Date().toISOString(),
          'step.number': data.stepNumber.toString(),
          'step.type': data.stepType,
          'step.job_id': data.jobId,
          'step.progress': Math.round((data.stepNumber / data.totalSteps) * 100).toString()
        }
      }
    ];

    return sendTrace('workflow.step_complete', attributes, {
      events,
      status: 'ok',
      parent_trace_id: parent?.traceId,
      parent_span_id: parent?.spanId
    });
  },

  complete: (data: WorkflowCompleteData, parent?: SpanContext): Promise<SpanContext> => {
    const attributes = {
      'workflow.id': data.workflowId,
      'workflow.final_status': data.status,
      'workflow.total_steps': data.totalSteps,
      'workflow.completed_steps': data.completedSteps,
      'workflow.duration_ms': data.duration,
      'workflow.success': (data.status === 'completed').toString(),
      'workflow.completion_rate': Math.round((data.completedSteps / data.totalSteps) * 100),
      'lifecycle.stage': 'workflow_complete',
      'component.type': 'workflow-orchestrator'
    };

    const events = [
      {
        name: 'workflow.completed',
        attributes: {
          'workflow.completion_timestamp': new Date().toISOString(),
          'workflow.final_status': data.status,
          'workflow.duration_ms': data.duration.toString(),
          'workflow.completion_rate': Math.round((data.completedSteps / data.totalSteps) * 100).toString()
        }
      }
    ];

    return sendTrace('workflow.complete', attributes, {
      events,
      status: data.status === 'completed' ? 'ok' : 'error',
      duration_ms: data.duration,
      parent_trace_id: parent?.traceId,
      parent_span_id: parent?.spanId
    });
  },

  // Workflow error handling
  stepFail: (data: WorkflowStepFailData, parent?: SpanContext): Promise<SpanContext> => {
    const attributes = {
      'workflow.id': data.workflowId,
      'workflow.step_number': data.stepNumber,
      'workflow.step_failure_type': data.failureType,
      'job.id': data.jobId,
      'job.error': data.error,
      'lifecycle.stage': 'workflow_step_fail',
      'component.type': 'workflow-orchestrator'
    };

    const events = [
      {
        name: 'workflow.step_failed',
        attributes: {
          'step.failure_timestamp': new Date().toISOString(),
          'step.number': data.stepNumber.toString(),
          'step.job_id': data.jobId,
          'step.error': data.error,
          'step.failure_type': data.failureType
        }
      }
    ];

    return sendTrace('workflow.step_fail', attributes, {
      events,
      status: 'error',
      parent_trace_id: parent?.traceId,
      parent_span_id: parent?.spanId
    });
  },

  cancel: (data: WorkflowCancelData, parent?: SpanContext): Promise<SpanContext> => {
    const attributes = {
      'workflow.id': data.workflowId,
      'workflow.cancel_reason': data.cancelReason,
      'workflow.completed_steps': data.completedSteps,
      'workflow.total_steps': data.totalSteps,
      'workflow.completion_rate': Math.round((data.completedSteps / data.totalSteps) * 100),
      'lifecycle.stage': 'workflow_cancel',
      'component.type': 'workflow-orchestrator'
    };

    const events = [
      {
        name: 'workflow.cancelled',
        attributes: {
          'workflow.cancel_timestamp': new Date().toISOString(),
          'workflow.cancel_reason': data.cancelReason,
          'workflow.completed_steps': data.completedSteps.toString(),
          'workflow.completion_rate': Math.round((data.completedSteps / data.totalSteps) * 100).toString()
        }
      }
    ];

    return sendTrace('workflow.cancel', attributes, {
      events,
      status: 'error',
      parent_trace_id: parent?.traceId,
      parent_span_id: parent?.spanId
    });
  },

  timeout: (data: WorkflowTimeoutData, parent?: SpanContext): Promise<SpanContext> => {
    const attributes = {
      'workflow.id': data.workflowId,
      'workflow.timeout_after_ms': data.timeoutAfter,
      'workflow.completed_steps': data.completedSteps,
      'workflow.total_steps': data.totalSteps,
      'workflow.completion_rate': Math.round((data.completedSteps / data.totalSteps) * 100),
      'lifecycle.stage': 'workflow_timeout',
      'component.type': 'workflow-orchestrator'
    };

    const events = [
      {
        name: 'workflow.timed_out',
        attributes: {
          'workflow.timeout_timestamp': new Date().toISOString(),
          'workflow.timeout_after_ms': data.timeoutAfter.toString(),
          'workflow.completed_steps': data.completedSteps.toString(),
          'workflow.completion_rate': Math.round((data.completedSteps / data.totalSteps) * 100).toString()
        }
      }
    ];

    return sendTrace('workflow.timeout', attributes, {
      events,
      status: 'error',
      parent_trace_id: parent?.traceId,
      parent_span_id: parent?.spanId
    });
  }
};

// ============================================================================
// Job Lifecycle Instrumentation (Core Level)
// ============================================================================

// Job Lifecycle Data Interfaces
export interface JobSubmitData {
  jobId: string;
  jobType: string;
  priority: number;
  queueName?: string;
  submittedBy?: string;
  workflowId?: string;
  userId?: string;
  payload?: any; // The actual job payload that will be sent to services
  payloadSizeBytes?: number; // Size of payload for performance analysis
}

export interface JobSaveData {
  jobId: string;
  redisKey: string;
  queueScore?: number;
}

export interface JobClaimData {
  jobId: string;
  workerId: string;
  machineId: string;
  connectorId: string;
  serviceType: string;
  queueWaitTime: number;
}

export interface JobProcessData {
  jobId: string;
  connectorId: string;
  serviceType: string;
  estimatedDuration?: number;
}

export interface JobCompleteData {
  jobId: string;
  status: 'completed' | 'failed' | 'cancelled' | 'timeout';
  result?: any;
  error?: string;
  duration: number;
}

export interface JobMessageData {
  jobId: string;
  eventType: string;
  destination: string;
}

export interface JobArchiveData {
  jobId: string;
  archiveLocation: string;
}

export interface JobRetryData {
  jobId: string;
  retryCount: number;
  retryReason: string;
}

export interface JobFailData {
  jobId: string;
  error: string;
  failureType: string;
}

export interface JobTimeoutData {
  jobId: string;
  timeoutAfter: number;
  lastKnownState: string;
}

export interface JobRequeueData {
  jobId: string;
  requeueReason: string;
  newPriority?: number;
}

export interface SpanContext {
  traceId: string;
  spanId: string;
}

// Job Lifecycle Instrumentation - Universal for all jobs
export const JobInstrumentation = {
  // Core lifecycle - every job goes through these
  submit: (data: JobSubmitData, parent?: SpanContext): Promise<SpanContext> => {
    const attributes = {
      'job.id': data.jobId,
      'job.type': data.jobType,
      'job.priority': data.priority,
      'job.queue': data.queueName || 'default',
      'job.submitted_by': data.submittedBy || 'unknown',
      'lifecycle.stage': 'submission',
      'component.type': 'api-server'
    };

    // Add workflow context if available
    if (data.workflowId) {
      attributes['workflow.id'] = data.workflowId;
    }
    if (data.userId) {
      attributes['user.id'] = data.userId;
    }

    // Add payload information for analysis
    if (data.payload) {
      // Include serialized payload for debugging (truncated if too large)
      const payloadStr = JSON.stringify(data.payload);
      attributes['job.payload'] = payloadStr.length > 2000 
        ? payloadStr.substring(0, 2000) + '...[truncated]'
        : payloadStr;
      
      attributes['job.payload.size_bytes'] = data.payloadSizeBytes || payloadStr.length;
      
      // Extract key payload properties for easier querying
      if (data.payload.prompt) {
        attributes['job.payload.prompt'] = typeof data.payload.prompt === 'string' 
          ? data.payload.prompt.substring(0, 500) // Truncate long prompts
          : JSON.stringify(data.payload.prompt).substring(0, 500);
      }
      if (data.payload.model) {
        attributes['job.payload.model'] = data.payload.model;
      }
      if (data.payload.width && data.payload.height) {
        attributes['job.payload.dimensions'] = `${data.payload.width}x${data.payload.height}`;
      }
      if (data.payload.max_tokens) {
        attributes['job.payload.max_tokens'] = data.payload.max_tokens;
      }
      if (data.payload.temperature) {
        attributes['job.payload.temperature'] = data.payload.temperature;
      }
    }

    const events = [
      {
        name: 'job.submitted',
        attributes: {
          'submission.timestamp': new Date().toISOString(),
          'submission.queue': data.queueName || 'default',
          'submission.priority': data.priority.toString()
        }
      }
    ];

    return sendTrace('job.submit', attributes, {
      events,
      status: 'ok',
      parent_trace_id: parent?.traceId,
      parent_span_id: parent?.spanId
    });
  },

  saveToRedis: (data: JobSaveData, parent?: SpanContext): Promise<SpanContext> => {
    const attributes = {
      'job.id': data.jobId,
      'job.redis_key': data.redisKey,
      'job.queue_score': data.queueScore?.toString() || 'unknown',
      'lifecycle.stage': 'redis_storage',
      'component.type': 'api-server'
    };

    const events = [
      {
        name: 'job.redis_save',
        attributes: {
          'redis.operation': 'hmset',
          'redis.key': data.redisKey,
          'redis.timestamp': new Date().toISOString()
        }
      }
    ];

    return sendTrace('job.save_redis', attributes, {
      events,
      status: 'ok',
      parent_trace_id: parent?.traceId,
      parent_span_id: parent?.spanId
    });
  },

  claim: (data: JobClaimData, parent?: SpanContext): Promise<SpanContext> => {
    const attributes = {
      'job.id': data.jobId,
      'job.worker': data.workerId,
      'job.machine': data.machineId,
      'job.connector': data.connectorId,
      'job.service_type': data.serviceType,
      'job.queue_wait_time_ms': data.queueWaitTime,
      'lifecycle.stage': 'assignment',
      'component.type': 'worker'
    };

    const events = [
      {
        name: 'job.claimed',
        attributes: {
          'claim.timestamp': new Date().toISOString(),
          'claim.worker': data.workerId,
          'claim.machine': data.machineId,
          'claim.connector': data.connectorId,
          'claim.queue_wait_ms': data.queueWaitTime.toString()
        }
      }
    ];

    return sendTrace('job.claim', attributes, {
      events,
      status: 'ok',
      parent_trace_id: parent?.traceId,
      parent_span_id: parent?.spanId
    });
  },

  process: (data: JobProcessData, parent?: SpanContext): Promise<SpanContext> => {
    const attributes = {
      'job.id': data.jobId,
      'job.connector': data.connectorId,
      'job.service_type': data.serviceType,
      'job.estimated_duration_ms': data.estimatedDuration?.toString() || 'unknown',
      'lifecycle.stage': 'processing',
      'component.type': 'connector'
    };

    if (data.estimatedDuration) {
      attributes['job.estimated_duration_ms'] = data.estimatedDuration.toString();
    }

    const events = [
      {
        name: 'job.processing_started',
        attributes: {
          'processing.timestamp': new Date().toISOString(),
          'processing.connector': data.connectorId,
          'processing.service': data.serviceType
        }
      }
    ];

    return sendTrace('job.process', attributes, {
      events,
      status: 'ok',
      parent_trace_id: parent?.traceId,
      parent_span_id: parent?.spanId
    });
  },

  complete: (data: JobCompleteData, parent?: SpanContext): Promise<SpanContext> => {
    const attributes = {
      'job.id': data.jobId,
      'job.final_status': data.status,
      'job.duration_ms': data.duration,
      'job.success': (data.status === 'completed').toString(),
      'lifecycle.stage': 'completion',
      'component.type': 'connector'
    };

    // Add error details if failed
    if (data.error) {
      attributes['job.error_message'] = data.error;
      attributes['job.error_type'] = classifyJobError(data.error);
    }

    // Add result metadata if available
    if (data.result && typeof data.result === 'object') {
      attributes['job.result_size'] = JSON.stringify(data.result).length.toString();
      if (data.result.output_count) {
        attributes['job.output_count'] = data.result.output_count.toString();
      }
    }

    const events: Array<{ name: string; attributes?: Record<string, any> }> = [
      {
        name: 'job.completed',
        attributes: {
          'completion.timestamp': new Date().toISOString(),
          'completion.status': data.status,
          'completion.duration_ms': data.duration.toString()
        }
      }
    ];

    // Add error event if failed
    if (data.status !== 'completed' && data.error) {
      events.push({
        name: 'job.failed',
        attributes: {
          'error_message': data.error,
          'error_type': classifyJobError(data.error),
          'failure_timestamp': new Date().toISOString()
        }
      });
    }

    return sendTrace('job.complete', attributes, {
      events,
      status: data.status === 'completed' ? 'ok' : 'error',
      duration_ms: data.duration,
      parent_trace_id: parent?.traceId,
      parent_span_id: parent?.spanId
    });
  },

  sendCompleteMessage: (data: JobMessageData, parent?: SpanContext): Promise<SpanContext> => {
    const attributes = {
      'job.id': data.jobId,
      'job.event_type': data.eventType,
      'job.destination': data.destination,
      'lifecycle.stage': 'notification',
      'component.type': 'api-server'
    };

    const events = [
      {
        name: 'job.message_sent',
        attributes: {
          'message.timestamp': new Date().toISOString(),
          'message.type': data.eventType,
          'message.destination': data.destination
        }
      }
    ];

    return sendTrace('job.send_complete_msg', attributes, {
      events,
      status: 'ok',
      parent_trace_id: parent?.traceId,
      parent_span_id: parent?.spanId
    });
  },

  archive: (data: JobArchiveData, parent?: SpanContext): Promise<SpanContext> => {
    const attributes = {
      'job.id': data.jobId,
      'job.archive_location': data.archiveLocation,
      'lifecycle.stage': 'archival',
      'component.type': 'api-server'
    };

    const events = [
      {
        name: 'job.archived',
        attributes: {
          'archive.timestamp': new Date().toISOString(),
          'archive.location': data.archiveLocation
        }
      }
    ];

    return sendTrace('job.archive', attributes, {
      events,
      status: 'ok',
      parent_trace_id: parent?.traceId,
      parent_span_id: parent?.spanId
    });
  },

  // Error handling - subset of jobs
  retry: (data: JobRetryData, parent?: SpanContext): Promise<SpanContext> => {
    const attributes = {
      'job.id': data.jobId,
      'job.retry_count': data.retryCount,
      'job.retry_reason': data.retryReason,
      'lifecycle.stage': 'retry',
      'component.type': 'worker'
    };

    const events = [
      {
        name: 'job.retry_attempted',
        attributes: {
          'retry.timestamp': new Date().toISOString(),
          'retry.count': data.retryCount.toString(),
          'retry.reason': data.retryReason
        }
      }
    ];

    return sendTrace('job.retry', attributes, {
      events,
      status: 'ok',
      parent_trace_id: parent?.traceId,
      parent_span_id: parent?.spanId
    });
  },

  fail: (data: JobFailData, parent?: SpanContext): Promise<SpanContext> => {
    const attributes = {
      'job.id': data.jobId,
      'job.error': data.error,
      'job.failure_type': data.failureType,
      'lifecycle.stage': 'failure',
      'component.type': 'connector'
    };

    const events = [
      {
        name: 'job.permanent_failure',
        attributes: {
          'failure.timestamp': new Date().toISOString(),
          'failure.type': data.failureType,
          'failure.error': data.error
        }
      }
    ];

    return sendTrace('job.fail', attributes, {
      events,
      status: 'error',
      parent_trace_id: parent?.traceId,
      parent_span_id: parent?.spanId
    });
  },

  timeout: (data: JobTimeoutData, parent?: SpanContext): Promise<SpanContext> => {
    const attributes = {
      'job.id': data.jobId,
      'job.timeout_after_ms': data.timeoutAfter,
      'job.last_known_state': data.lastKnownState,
      'lifecycle.stage': 'timeout',
      'component.type': 'worker'
    };

    const events = [
      {
        name: 'job.timed_out',
        attributes: {
          'timeout.timestamp': new Date().toISOString(),
          'timeout.after_ms': data.timeoutAfter.toString(),
          'timeout.last_state': data.lastKnownState
        }
      }
    ];

    return sendTrace('job.timeout', attributes, {
      events,
      status: 'error',
      parent_trace_id: parent?.traceId,
      parent_span_id: parent?.spanId
    });
  },

  requeue: (data: JobRequeueData, parent?: SpanContext): Promise<SpanContext> => {
    const attributes = {
      'job.id': data.jobId,
      'job.requeue_reason': data.requeueReason,
      'job.new_priority': data.newPriority?.toString() || 'unchanged',
      'lifecycle.stage': 'requeue',
      'component.type': 'worker'
    };

    const events = [
      {
        name: 'job.requeued',
        attributes: {
          'requeue.timestamp': new Date().toISOString(),
          'requeue.reason': data.requeueReason,
          'requeue.new_priority': data.newPriority?.toString() || 'unchanged'
        }
      }
    ];

    return sendTrace('job.requeue', attributes, {
      events,
      status: 'ok',
      parent_trace_id: parent?.traceId,
      parent_span_id: parent?.spanId
    });
  }
};

// ============================================================================
// Job Service Process Instrumentation (Service Level)
// ============================================================================

// Service Processing Data Interfaces
export interface HttpRequestData {
  jobId: string;
  method: string;
  url: string;
  requestSize: number;
  timeout: number;
  headers?: Record<string, string>;
  payload?: string; // Request payload (truncated)
}

export interface PollData {
  jobId: string;
  pollUrl: string;
  pollInterval: number;
  maxAttempts: number;
  currentAttempt: number;
}

export interface WsConnectData {
  jobId: string;
  url: string;
  protocol?: string;
  timeout: number;
}

export interface WsSendData {
  jobId: string;
  messageType: string;
  messageSize: number;
  sequenceNumber?: number;
}

export interface WsProgressData {
  jobId: string;
  progress: number;
  currentNode?: string;
  estimatedTimeRemaining?: number;
}

export interface ImageGenData {
  jobId: string;
  imagesGenerated: number;
  totalSize: number;
  format: string;
  resolution?: string;
}

export interface ImageUploadData {
  jobId: string;
  imageCount: number;
  totalSize: number;
  storageProvider: string;
  cdnUrl?: string;
}

export interface CdnTestData {
  jobId: string;
  cdnUrls: string[];
  responseTime: number;
  allAccessible: boolean;
}

export interface ValidateData {
  jobId: string;
  validationType: string;
  validationResult: 'success' | 'failed';
  issues?: string[];
}

export interface SimulationData {
  jobId: string;
  simulationType: string;
  inputParameters: any;
  duration: number;
}

export interface ModelDownloadData {
  jobId: string;
  modelName: string;
  modelSize: number;
  downloadSpeed: number;
  cached: boolean;
}

export interface ComfyUIData {
  jobId: string;
  promptId: string;
  nodeCount: number;
  queuePosition?: number;
}

// Job Service Process Instrumentation - Service-specific processing
export const ProcessingInstrumentation = {
  // HTTP-based services (OpenAI, A1111, etc.)
  httpRequest: (data: HttpRequestData, parent?: SpanContext): Promise<SpanContext> => {
    const attributes: Record<string, any> = {
      'job.id': data.jobId,
      'http.method': data.method,
      'http.url': data.url,
      'http.request_size': data.requestSize,
      'http.timeout_ms': data.timeout,
      'process.type': 'http_request',
      'component.type': 'connector'
    };
    
    // Add payload if provided
    if (data.payload) {
      attributes['http.request.payload'] = data.payload;
    }

    const events = [
      {
        name: 'http.request_sent',
        attributes: {
          'request.timestamp': new Date().toISOString(),
          'request.method': data.method,
          'request.url': data.url,
          'request.size': data.requestSize.toString()
        }
      }
    ];

    return sendTrace('process.http_request', attributes, {
      events,
      status: 'ok',
      parent_trace_id: parent?.traceId,
      parent_span_id: parent?.spanId
    });
  },

  pollForCompletion: (data: PollData, parent?: SpanContext): Promise<SpanContext> => {
    const attributes = {
      'job.id': data.jobId,
      'poll.url': data.pollUrl,
      'poll.interval_ms': data.pollInterval,
      'poll.max_attempts': data.maxAttempts,
      'poll.current_attempt': data.currentAttempt,
      'process.type': 'polling',
      'component.type': 'connector'
    };

    const events = [
      {
        name: 'poll.attempt',
        attributes: {
          'poll.timestamp': new Date().toISOString(),
          'poll.attempt': data.currentAttempt.toString(),
          'poll.url': data.pollUrl
        }
      }
    ];

    return sendTrace('process.poll_completion', attributes, {
      events,
      status: 'ok',
      parent_trace_id: parent?.traceId,
      parent_span_id: parent?.spanId
    });
  },

  // WebSocket services (ComfyUI, etc.)  
  websocketConnect: (data: WsConnectData, parent?: SpanContext): Promise<SpanContext> => {
    const attributes = {
      'job.id': data.jobId,
      'ws.url': data.url,
      'ws.protocol': data.protocol || 'unknown',
      'ws.timeout_ms': data.timeout,
      'process.type': 'websocket_connect',
      'component.type': 'connector'
    };

    const events = [
      {
        name: 'websocket.connected',
        attributes: {
          'ws.timestamp': new Date().toISOString(),
          'ws.url': data.url,
          'ws.protocol': data.protocol || 'unknown'
        }
      }
    ];

    return sendTrace('process.ws_connect', attributes, {
      events,
      status: 'ok',
      parent_trace_id: parent?.traceId,
      parent_span_id: parent?.spanId
    });
  },

  websocketSend: (data: WsSendData, parent?: SpanContext): Promise<SpanContext> => {
    const attributes = {
      'job.id': data.jobId,
      'ws.message_type': data.messageType,
      'ws.message_size': data.messageSize,
      'ws.sequence_number': data.sequenceNumber?.toString() || 'unknown',
      'process.type': 'websocket_send',
      'component.type': 'connector'
    };

    const events = [
      {
        name: 'websocket.message_sent',
        attributes: {
          'ws.timestamp': new Date().toISOString(),
          'ws.message_type': data.messageType,
          'ws.size': data.messageSize.toString()
        }
      }
    ];

    return sendTrace('process.ws_send', attributes, {
      events,
      status: 'ok',
      parent_trace_id: parent?.traceId,
      parent_span_id: parent?.spanId
    });
  },

  websocketProgress: (data: WsProgressData, parent?: SpanContext): Promise<SpanContext> => {
    const attributes = {
      'job.id': data.jobId,
      'ws.progress_percent': data.progress,
      'ws.current_node': data.currentNode || 'unknown',
      'ws.estimated_time_remaining_ms': data.estimatedTimeRemaining?.toString() || 'unknown',
      'process.type': 'websocket_progress',
      'component.type': 'connector'
    };

    const events = [
      {
        name: 'websocket.progress_update',
        attributes: {
          'ws.timestamp': new Date().toISOString(),
          'ws.progress': data.progress.toString(),
          'ws.current_node': data.currentNode || 'unknown'
        }
      }
    ];

    return sendTrace('process.ws_progress', attributes, {
      events,
      status: 'ok',
      parent_trace_id: parent?.traceId,
      parent_span_id: parent?.spanId
    });
  },
  
  // Asset handling (all services)
  imageGeneration: (data: ImageGenData, parent?: SpanContext): Promise<SpanContext> => {
    const attributes = {
      'job.id': data.jobId,
      'image.count': data.imagesGenerated,
      'image.total_size': data.totalSize,
      'image.format': data.format,
      'image.resolution': data.resolution || 'unknown',
      'process.type': 'image_generation',
      'component.type': 'connector'
    };

    const events = [
      {
        name: 'image.generated',
        attributes: {
          'generation.timestamp': new Date().toISOString(),
          'generation.count': data.imagesGenerated.toString(),
          'generation.format': data.format,
          'generation.total_size': data.totalSize.toString()
        }
      }
    ];

    return sendTrace('process.image_generation', attributes, {
      events,
      status: 'ok',
      parent_trace_id: parent?.traceId,
      parent_span_id: parent?.spanId
    });
  },

  imageUpload: (data: ImageUploadData, parent?: SpanContext): Promise<SpanContext> => {
    const attributes = {
      'job.id': data.jobId,
      'upload.image_count': data.imageCount,
      'upload.total_size': data.totalSize,
      'upload.storage_provider': data.storageProvider,
      'upload.cdn_url': data.cdnUrl || 'unknown',
      'process.type': 'image_upload',
      'component.type': 'connector'
    };

    const events = [
      {
        name: 'image.uploaded',
        attributes: {
          'upload.timestamp': new Date().toISOString(),
          'upload.count': data.imageCount.toString(),
          'upload.provider': data.storageProvider,
          'upload.size': data.totalSize.toString()
        }
      }
    ];

    return sendTrace('process.image_upload', attributes, {
      events,
      status: 'ok',
      parent_trace_id: parent?.traceId,
      parent_span_id: parent?.spanId
    });
  },

  cdnTest: (data: CdnTestData, parent?: SpanContext): Promise<SpanContext> => {
    const attributes = {
      'job.id': data.jobId,
      'cdn.url_count': data.cdnUrls.length,
      'cdn.response_time_ms': data.responseTime,
      'cdn.all_accessible': data.allAccessible.toString(),
      'process.type': 'cdn_test',
      'component.type': 'connector'
    };

    const events = [
      {
        name: 'cdn.tested',
        attributes: {
          'cdn.timestamp': new Date().toISOString(),
          'cdn.url_count': data.cdnUrls.length.toString(),
          'cdn.response_time': data.responseTime.toString(),
          'cdn.success': data.allAccessible.toString()
        }
      }
    ];

    return sendTrace('process.cdn_test', attributes, {
      events,
      status: data.allAccessible ? 'ok' : 'error',
      parent_trace_id: parent?.traceId,
      parent_span_id: parent?.spanId
    });
  },

  validateOutput: (data: ValidateData, parent?: SpanContext): Promise<SpanContext> => {
    const attributes = {
      'job.id': data.jobId,
      'validation.type': data.validationType,
      'validation.result': data.validationResult,
      'validation.issues_count': data.issues?.length || 0,
      'process.type': 'output_validation',
      'component.type': 'connector'
    };

    const events = [
      {
        name: 'output.validated',
        attributes: {
          'validation.timestamp': new Date().toISOString(),
          'validation.type': data.validationType,
          'validation.result': data.validationResult,
          'validation.issues': data.issues?.join(',') || 'none'
        }
      }
    ];

    return sendTrace('process.validate_output', attributes, {
      events,
      status: data.validationResult === 'success' ? 'ok' : 'error',
      parent_trace_id: parent?.traceId,
      parent_span_id: parent?.spanId
    });
  },
  
  // Service-specific operations
  executeSimulation: (data: SimulationData, parent?: SpanContext): Promise<SpanContext> => {
    const attributes = {
      'job.id': data.jobId,
      'simulation.type': data.simulationType,
      'simulation.duration_ms': data.duration,
      'simulation.parameters_count': Object.keys(data.inputParameters).length,
      'process.type': 'simulation_execution',
      'component.type': 'connector'
    };

    const events = [
      {
        name: 'simulation.executed',
        attributes: {
          'simulation.timestamp': new Date().toISOString(),
          'simulation.type': data.simulationType,
          'simulation.duration': data.duration.toString()
        }
      }
    ];

    return sendTrace('process.execute_simulation', attributes, {
      events,
      status: 'ok',
      duration_ms: data.duration,
      parent_trace_id: parent?.traceId,
      parent_span_id: parent?.spanId
    });
  },

  downloadModel: (data: ModelDownloadData, parent?: SpanContext): Promise<SpanContext> => {
    const attributes = {
      'job.id': data.jobId,
      'model.name': data.modelName,
      'model.size_bytes': data.modelSize,
      'model.download_speed_bps': data.downloadSpeed,
      'model.cached': data.cached.toString(),
      'process.type': 'model_download',
      'component.type': 'connector'
    };

    const events = [
      {
        name: 'model.downloaded',
        attributes: {
          'download.timestamp': new Date().toISOString(),
          'download.model': data.modelName,
          'download.size': data.modelSize.toString(),
          'download.cached': data.cached.toString()
        }
      }
    ];

    return sendTrace('process.download_model', attributes, {
      events,
      status: 'ok',
      parent_trace_id: parent?.traceId,
      parent_span_id: parent?.spanId
    });
  },

  executeComfyUI: (data: ComfyUIData, parent?: SpanContext): Promise<SpanContext> => {
    const attributes = {
      'job.id': data.jobId,
      'comfyui.prompt_id': data.promptId,
      'comfyui.node_count': data.nodeCount,
      'comfyui.queue_position': data.queuePosition?.toString() || 'unknown',
      'process.type': 'comfyui_execution',
      'component.type': 'connector'
    };

    const events = [
      {
        name: 'comfyui.executed',
        attributes: {
          'comfyui.timestamp': new Date().toISOString(),
          'comfyui.prompt_id': data.promptId,
          'comfyui.nodes': data.nodeCount.toString()
        }
      }
    ];

    return sendTrace('process.execute_comfyui', attributes, {
      events,
      status: 'ok',
      parent_trace_id: parent?.traceId,
      parent_span_id: parent?.spanId
    });
  }
};

// Helper function to classify job errors
function classifyJobError(error: string): string {
  const errorLower = error.toLowerCase();
  if (errorLower.includes('timeout')) return 'timeout';
  if (errorLower.includes('memory') || errorLower.includes('oom')) return 'memory';
  if (errorLower.includes('network') || errorLower.includes('connection')) return 'network';
  if (errorLower.includes('validation') || errorLower.includes('invalid')) return 'validation';
  if (errorLower.includes('generation') || errorLower.includes('no image')) return 'generation';
  if (errorLower.includes('model') || errorLower.includes('load')) return 'model';
  if (errorLower.includes('permission') || errorLower.includes('auth')) return 'authorization';
  return 'unknown';
}

// Re-export for convenience
export { generateTraceId, generateSpanId };