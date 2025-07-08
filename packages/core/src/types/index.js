// Core type definitions for emp-redis JavaScript rebuild
// Direct port from Python core/core_types and interfaces
// Export messages first, then override with more specific types
export * from './messages.js';
// Job types - export canonical types
export { JobStatus } from './job.js';
// Worker types (may override some message types)
export { WorkerStatus, WorkerStatus as WorkerStatusDetailed, } from './worker.js';
// Monitor event types
export * from './monitor-events.js';
//# sourceMappingURL=index.js.map