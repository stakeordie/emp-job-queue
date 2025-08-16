// Connector types - interface definitions for service connectors

import { JobRequirements } from './job.js';

export interface ConnectorInterface {
  connector_id: string;
  service_type: string;
  version: string;

  // Redis connection injection for status reporting
  setRedisConnection(redis: unknown, workerId: string, machineId?: string): void;

  // Lifecycle methods
  initialize(): Promise<void>;
  cleanup(): Promise<void>;

  // Health and capability methods
  checkHealth(): Promise<boolean>;
  getAvailableModels(): Promise<string[]>;
  getServiceInfo(): Promise<ServiceInfo>;

  // Failure recovery capabilities (required for robust job management)
  getHealthCheckCapabilities(): HealthCheckCapabilities;
  queryJobStatus(serviceJobId: string): Promise<ServiceJobStatus>;
  validateServiceSupport(): Promise<ServiceSupportValidation>;

  // Status reporting
  startStatusReporting?(): void;
  stopStatusReporting?(): void;

  // Job processing
  canProcessJob(jobData: JobData): Promise<boolean>;
  processJob(jobData: JobData, progressCallback: ProgressCallback): Promise<JobResult>;
  cancelJob(jobId: string): Promise<void>;

  // Configuration
  updateConfiguration(config: ConnectorConfig): Promise<void>;
  getConfiguration(): ConnectorConfig;
}

export interface ServiceInfo {
  service_name: string;
  service_version: string;
  api_version?: string;
  base_url: string;
  status: 'online' | 'offline' | 'error';
  capabilities: ServiceCapabilities;
  resource_usage?: ResourceUsage;
  queue_info?: {
    pending_jobs: number;
    processing_jobs: number;
    average_processing_time: number;
  };
}

export interface ServiceCapabilities {
  supported_formats: string[];
  max_resolution?: {
    width: number;
    height: number;
  };
  supported_models: string[];
  features: string[];
  hardware_acceleration?: string[];
  concurrent_jobs?: number;
}

export interface ResourceUsage {
  cpu_usage: number;
  memory_usage_mb: number;
  gpu_usage?: number;
  gpu_memory_usage_mb?: number;
  vram_total_mb?: number;
  vram_used_mb?: number;
}

export interface ConnectorConfig {
  connector_id: string;
  service_type: string;
  base_url: string;
  auth?: {
    type: 'none' | 'basic' | 'bearer' | 'api_key';
    username?: string;
    password?: string;
    token?: string;
    api_key?: string;
  };
  timeout_seconds: number;
  retry_attempts: number;
  retry_delay_seconds: number;
  health_check_interval_seconds: number;
  max_concurrent_jobs: number;
  custom_headers?: Record<string, string>;
  settings?: Record<string, unknown>;
}

export interface JobData {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  requirements?: JobRequirements;
  metadata?: Record<string, unknown>;
}

export interface JobResult {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
  processing_time_ms: number;
  output_files?: OutputFile[];
  service_metadata?: {
    service_version: string;
    service_type?: string;
    service_job_id?: string; // Service-specific job ID (e.g., ComfyUI prompt_id)
    model_used?: string;
    processing_stats?: Record<string, unknown>;
  };
}

export interface OutputFile {
  filename: string;
  path: string;
  type: 'image' | 'video' | 'audio' | 'text' | 'binary';
  size_bytes: number;
  mime_type?: string;
  metadata?: Record<string, unknown>;
}

export type ProgressCallback = (progress: JobProgress) => Promise<void>;

export interface JobProgress {
  job_id: string;
  progress: number; // 0-100
  message?: string;
  current_step?: string;
  total_steps?: number;
  estimated_completion_ms?: number;
  metadata?: Record<string, unknown>;
}

// Specific connector types
export interface ComfyUIConnectorConfig extends ConnectorConfig {
  service_type: 'comfyui';
  settings: {
    websocket_url?: string;
    workflow_timeout_seconds?: number;
    image_format?: 'png' | 'jpg' | 'webp';
    image_quality?: number;
    save_workflow?: boolean;
  };
}

export interface A1111ConnectorConfig extends ConnectorConfig {
  service_type: 'a1111';
  settings: {
    enable_api?: boolean;
    save_images?: boolean;
    save_grid?: boolean;
    image_format?: 'png' | 'jpg' | 'webp';
    jpeg_quality?: number;
    png_compression?: number;
  };
}

export interface RestConnectorConfig extends ConnectorConfig {
  service_type: 'rest_sync' | 'rest_async';
  settings: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    response_format: 'json' | 'text' | 'binary';
    polling_interval_ms?: number; // for async
    completion_endpoint?: string; // for async
    status_field?: string; // field to check for completion
    result_field?: string; // field containing the result
  };
}

export interface WebSocketConnectorConfig extends ConnectorConfig {
  service_type: 'websocket';
  settings: {
    websocket_url: string;
    protocol?: string;
    heartbeat_interval_ms?: number;
    reconnect_delay_ms?: number;
    max_reconnect_attempts?: number;
  };
}

// Health Check Framework - Required capabilities for failure recovery
export interface HealthCheckCapabilities {
  // Basic health checking
  supportsBasicHealthCheck: boolean;
  basicHealthCheckEndpoint?: string;

  // Job status querying (critical for failure recovery)
  supportsJobStatusQuery: boolean;
  jobStatusQueryEndpoint?: string;
  jobStatusQueryMethod?: 'GET' | 'POST';

  // Job cancellation (required for timeout handling)
  supportsJobCancellation: boolean;
  jobCancellationEndpoint?: string;
  jobCancellationMethod?: 'POST' | 'DELETE';

  // Service restart/recovery
  supportsServiceRestart: boolean;
  serviceRestartEndpoint?: string;

  // Queue introspection (helpful for load balancing)
  supportsQueueIntrospection: boolean;
  queueIntrospectionEndpoint?: string;

  // Custom health check requirements
  customHealthCheckRequirements?: string[];
  minimumApiVersion?: string;
}

export interface ServiceJobStatus {
  serviceJobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'unknown';
  progress?: number; // 0-100
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  canReconnect: boolean; // Can we reconnect to this job?
  canCancel: boolean; // Can we cancel this job?
  metadata?: Record<string, unknown>;
}

export interface ServiceSupportValidation {
  isSupported: boolean;
  supportLevel: 'full' | 'partial' | 'minimal' | 'unsupported';
  missingCapabilities: string[];
  warnings: string[];
  errors: string[];
  recommendedAction: 'proceed' | 'warn' | 'fail';
}

// Health Check Classes - Different levels of support required
export enum HealthCheckClass {
  // Minimal - Can only check if service is alive (basic deployment)
  MINIMAL = 'minimal',

  // Standard - Can check health + query job status (production ready)
  STANDARD = 'standard',

  // Advanced - Full failure recovery support (enterprise ready)
  ADVANCED = 'advanced',

  // Custom - Service has unique requirements
  CUSTOM = 'custom',
}

export interface HealthCheckRequirements {
  class: HealthCheckClass;
  required: {
    basicHealthCheck: boolean;
    jobStatusQuery: boolean;
    jobCancellation: boolean;
    serviceRestart: boolean;
    queueIntrospection: boolean;
  };
  description: string;
  failureRecoveryCapable: boolean;
}

export interface SimulationConnectorConfig extends ConnectorConfig {
  service_type: 'simulation';
  settings: {
    min_processing_time_ms: number;
    max_processing_time_ms: number;
    failure_rate: number; // 0-1
    progress_update_interval_ms: number;
    simulate_chunks?: boolean;
    chunk_size?: number;
  };
}

// Connector registry
export interface ConnectorRegistry {
  registerConnector(connector: ConnectorInterface): void;
  unregisterConnector(connectorId: string): void;
  getConnector(connectorId: string): ConnectorInterface | undefined;
  getConnectorsByServiceType(serviceType: string): ConnectorInterface[];
  getAllConnectors(): ConnectorInterface[];
  getConnectorHealth(): Promise<Record<string, boolean>>;
}

// Connector factory
export interface ConnectorFactory {
  createConnector(config: ConnectorConfig): Promise<ConnectorInterface>;
  getSupportedServiceTypes(): string[];
  validateConfig(config: ConnectorConfig): Promise<boolean>;
}
