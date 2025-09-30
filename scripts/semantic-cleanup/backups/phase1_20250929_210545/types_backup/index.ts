// Core type definitions for emp-redis JavaScript rebuild
// Direct port from Python core/core_types and interfaces

// Export the timestamp type
export { Timestamp } from './timestamp.js';

// Export messages first, then override with more specific types
export * from './messages.js';
export { SystemInfo as MessageSystemInfo } from './messages.js';

// Job types - export canonical types
export { Job, JobRequirements, JobProgress, JobStatus, JobForensics } from './job.js';

// Worker types (may override some message types)
export {
  WorkerCapabilities,
  WorkerCapabilities as WorkerCapabilitiesDetailed,
  WorkerStatus,
  WorkerStatus as WorkerStatusDetailed,
  SystemInfo,
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

// Connector types - export all as type-only since they're interfaces
export type {
  ConnectorInterface,
  JobData as ConnectorJobData,
  JobResult as ConnectorJobResult,
  ProgressCallback,
  ConnectorConfig,
  ConnectorRegistry,
  ConnectorFactory,
  ServiceInfo,
  JobData,
  JobResult,
  RestConnectorConfig,
  A1111ConnectorConfig,
  ComfyUIConnectorConfig,
  WebSocketConnectorConfig,
  HealthCheckCapabilities,
  ServiceJobStatus,
  ServiceSupportValidation,
  HealthCheckRequirements,
  SimulationConnectorConfig,
  ServiceCapabilities,
  ResourceUsage,
  OutputFile,
} from './connector.js';

// Export HealthCheckClass enum separately since it's not an interface
export { HealthCheckClass } from './connector.js';

// Monitor event types
export * from './monitor-events.js';
