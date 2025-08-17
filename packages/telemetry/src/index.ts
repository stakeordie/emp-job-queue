/**
 * @emp/telemetry - Unified Telemetry Client
 * 
 * Provides a simple, consistent API for telemetry across all EMP services
 */

// Main client
export { 
  EmpTelemetryClient,
  createTelemetryClient,
  type TelemetryStartupOptions
} from './client.js';

// Configuration
export {
  TelemetryConfigManager,
  type TelemetryConfig,
  type ConfigOptions
} from './config.js';

// Connections
export {
  TelemetryConnectionManager,
  type ConnectionHealth,
  type PipelineHealth
} from './connections.js';