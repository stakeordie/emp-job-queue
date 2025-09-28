/**
 * Telemetry Module - Redis Event Stream + Collector Architecture
 *
 * Simple telemetry API for distributed debugging and observability
 */

export * from './types.js';
export * from './event-client.js';
export * from './otel-types.js';

// Re-export commonly used items for convenience
export { EventTypes, StreamConfig } from './types.js';
export { createEventClient, createEventClientWithDefaults } from './event-client.js';
export { OtelSpan, EmpSpanTypes, EmpSpanFactory, EmpTraceContext } from './otel-types.js';