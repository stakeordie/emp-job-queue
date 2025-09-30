/**
 * Trace Context Propagation for Redis
 *
 * OpenTelemetry context doesn't automatically flow through Redis.
 * We manually serialize/deserialize W3C Trace Context.
 */
import { context, trace, propagation, ROOT_CONTEXT, Context } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';

export interface TraceContext {
  traceparent: string;
  tracestate?: string;
}

const propagator = new W3CTraceContextPropagator();

/**
 * Extract current trace context as serializable object
 * Call this when creating a job to attach context
 */
export function extractTraceContext(): TraceContext | null {
  const currentContext = context.active();
  const span = trace.getSpan(currentContext);

  if (!span) {
    return null;
  }

  const carrier: Record<string, string> = {};
  propagation.inject(currentContext, carrier);

  return {
    traceparent: carrier['traceparent'],
    tracestate: carrier['tracestate'],
  };
}

/**
 * Execute a function within a restored trace context
 * Call this when processing a job to restore context
 */
export function withTraceContext<T>(
  traceContext: TraceContext | null,
  fn: () => Promise<T>
): Promise<T> {
  if (!traceContext?.traceparent) {
    return fn();
  }

  const carrier = {
    traceparent: traceContext.traceparent,
    ...(traceContext.tracestate && { tracestate: traceContext.tracestate }),
  };

  const extractedContext = propagation.extract(ROOT_CONTEXT, carrier);

  return context.with(extractedContext, fn);
}

/**
 * Attach trace context to a job payload
 */
export function attachTraceContext<T extends Record<string, any>>(payload: T): T & { _traceContext?: TraceContext } {
  const traceContext = extractTraceContext();

  if (!traceContext) {
    return payload;
  }

  return {
    ...payload,
    _traceContext: traceContext,
  };
}

/**
 * Extract trace context from a job payload
 */
export function getTraceContextFromPayload(payload: any): TraceContext | null {
  return payload?._traceContext || null;
}
