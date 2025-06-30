// Core type definitions for emp-redis JavaScript rebuild
// Direct port from Python core/core_types and interfaces

// Export the timestamp type
export { Timestamp } from './timestamp.js';

// Export messages first, then override with more specific types
export * from './messages.js';

// Job types - export canonical types
export {
  Job,
  JobRequirements,
  JobProgress,
  JobStatus
} from './job.js';

// Worker types (may override some message types)
export {
  WorkerCapabilities as WorkerCapabilitiesDetailed,
  WorkerStatus as WorkerStatusDetailed,
  SystemInfo as SystemInfoDetailed,
  WorkerInfo,
  WorkerRegistration,
  WorkerHeartbeat,
  WorkerFilter,
  WorkerMatch,
  WorkerPoolInfo,
  HardwareSpecs,
  CustomerAccessConfig,
  PerformanceConfig,
  LocationConfig,
  CostConfig,
  ConnectorStatus,
} from './worker.js';

// Connector types - import specific types to avoid conflicts
export {
  ConnectorInterface,
  JobData as ConnectorJobData,
  JobResult as ConnectorJobResult,
  ProgressCallback,
  ConnectorConfig,
  RestConnectorConfig,
  A1111ConnectorConfig,
  ComfyUIConnectorConfig,
  WebSocketConnectorConfig,
} from './connector.js';
