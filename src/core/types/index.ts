// Core type definitions for emp-redis JavaScript rebuild
// Direct port from Python core/core_types and interfaces

// Export messages first, then override with more specific types
export * from './messages.js';

// Job types (commented out to avoid conflicts - types are in messages.js)
// export * from './job.js';

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
  ConnectorStatus
} from './worker.js';

// Connector types
export * from './connector.js';