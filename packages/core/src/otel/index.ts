/**
 * OpenTelemetry Infrastructure for EMP Job Queue
 *
 * This module provides distributed tracing across all services.
 *
 * ## Quick Start
 *
 * 1. Initialize at service startup:
 * ```typescript
 * import { initTracer } from '@emp/core/otel';
 *
 * initTracer({
 *   serviceName: 'emp-api',
 *   serviceVersion: '1.0.0',
 *   collectorEndpoint: process.env.OTEL_COLLECTOR_ENDPOINT,
 *   environment: process.env.NODE_ENV
 * });
 * ```
 *
 * 2. Create spans in your code:
 * ```typescript
 * import { withSpan, addEmpAttributes } from '@emp/core/otel';
 *
 * await withSpan('emp-api', 'processJob', async (span) => {
 *   addEmpAttributes(span, { jobId: '123', userId: 'user-456' });
 *   // Your logic here
 * });
 * ```
 *
 * 3. Propagate context through Redis:
 * ```typescript
 * import { attachTraceContext, withTraceContext } from '@emp/core/otel';
 *
 * // When creating a job:
 * const jobWithContext = attachTraceContext(jobPayload);
 * await redis.xadd('jobs:queue', '*', 'data', JSON.stringify(jobWithContext));
 *
 * // When processing a job:
 * await withTraceContext(job._traceContext, async () => {
 *   // Process job - spans will be linked to parent trace
 * });
 * ```
 */

// Tracer initialization
export {
  initTracer,
  getTracer,
  shutdownTracer,
  type TracerConfig,
} from './tracer.js';

// Context propagation
export {
  extractTraceContext,
  withTraceContext,
  attachTraceContext,
  getTraceContextFromPayload,
  type TraceContext,
} from './context-propagation.js';

// Helper functions
export {
  withSpan,
  addEmpAttributes,
  recordEvent,
  getActiveSpan,
  withActiveSpan,
} from './helpers.js';

// Re-export OpenTelemetry API types for convenience
export {
  trace,
  context,
  type Span,
  type Tracer,
  SpanStatusCode,
  SpanKind,
} from '@opentelemetry/api';
