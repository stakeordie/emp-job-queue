/**
 * OpenTelemetry Helper Functions
 * Convenience wrappers for common tracing patterns
 */
import { trace, context, Span, SpanStatusCode, SpanKind } from '@opentelemetry/api';

/**
 * Execute a function within a new span
 * Automatically handles errors and span lifecycle
 */
export async function withSpan<T>(
  tracerName: string,
  spanName: string,
  fn: (span: Span) => Promise<T>,
  options?: {
    kind?: SpanKind;
    attributes?: Record<string, string | number | boolean>;
  }
): Promise<T> {
  const tracer = trace.getTracer(tracerName);

  return tracer.startActiveSpan(
    spanName,
    {
      kind: options?.kind || SpanKind.INTERNAL,
      attributes: options?.attributes,
    },
    async (span) => {
      try {
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    }
  );
}

/**
 * Add EMP-specific attributes to a span
 * Standardizes attribute naming across services
 */
export function addEmpAttributes(
  span: Span,
  attributes: {
    jobId?: string;
    stepId?: string;
    machineId?: string;
    workerId?: string;
    userId?: string;
    workflowType?: string;
    [key: string]: string | number | boolean | undefined;
  }
): void {
  if (attributes.jobId) span.setAttribute('emp.job_id', attributes.jobId);
  if (attributes.stepId) span.setAttribute('emp.step_id', attributes.stepId);
  if (attributes.machineId) span.setAttribute('emp.machine_id', attributes.machineId);
  if (attributes.workerId) span.setAttribute('emp.worker_id', attributes.workerId);
  if (attributes.userId) span.setAttribute('emp.user_id', attributes.userId);
  if (attributes.workflowType) span.setAttribute('emp.workflow_type', attributes.workflowType);

  // Add any additional custom attributes with emp. prefix
  Object.entries(attributes).forEach(([key, value]) => {
    if (!['jobId', 'stepId', 'machineId', 'workerId', 'userId', 'workflowType'].includes(key)) {
      if (value !== undefined) {
        span.setAttribute(`emp.${key}`, value);
      }
    }
  });
}

/**
 * Record an event on the active span
 */
export function recordEvent(
  eventName: string,
  attributes?: Record<string, string | number | boolean>
): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.addEvent(eventName, attributes);
  }
}

/**
 * Get the current active span
 */
export function getActiveSpan(): Span | undefined {
  return trace.getActiveSpan();
}

/**
 * Execute function with specific span as active context
 */
export async function withActiveSpan<T>(
  span: Span,
  fn: () => Promise<T>
): Promise<T> {
  return context.with(trace.setSpan(context.active(), span), fn);
}
