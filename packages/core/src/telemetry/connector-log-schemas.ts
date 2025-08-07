// Connector Log Schemas - Defines normalized log formats for different connectors
// Ensures consistent log structure across different service types

export interface BaseLogSchema {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  event_type: string;
  machine_id: string;
  worker_id: string;
  service_type: string;
  connector_id: string;
  job_id?: string;
  session_id?: string;
  source: string;
}

// ComfyUI-specific log fields
export interface ComfyUILogSchema extends BaseLogSchema {
  service_type: 'comfyui';
  // ComfyUI-specific fields
  prompt_id?: string;
  client_id?: string;
  websocket_message_type?: string;
  queue_remaining?: number;
  execution_step?: string;
  node_id?: string;
  workflow_hash?: string;
  model_name?: string;
  vram_usage?: number;
}

// OpenAI-specific log fields
export interface OpenAILogSchema extends BaseLogSchema {
  service_type: 'openai' | 'openai-image' | 'openai-text';
  // OpenAI-specific fields
  model?: string;
  request_id?: string;
  token_usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  response_time_ms?: number;
  request_size_bytes?: number;
  response_size_bytes?: number;
}

// A1111 (Automatic1111) specific log fields  
export interface A1111LogSchema extends BaseLogSchema {
  service_type: 'a1111';
  // A1111-specific fields
  sampler?: string;
  steps?: number;
  cfg_scale?: number;
  seed?: number;
  width?: number;
  height?: number;
  batch_size?: number;
  model_checkpoint?: string;
  vae?: string;
}

// Simulation connector log fields
export interface SimulationLogSchema extends BaseLogSchema {
  service_type: 'simulation';
  // Simulation-specific fields
  simulation_type?: string;
  iteration?: number;
  total_iterations?: number;
  convergence?: number;
  parameters?: Record<string, any>;
}

// Generic REST connector log fields
export interface RestLogSchema extends BaseLogSchema {
  service_type: string; // Can be any REST-based service
  // REST-specific fields
  http_method?: string;
  endpoint?: string;
  status_code?: number;
  request_headers?: Record<string, string>;
  response_headers?: Record<string, string>;
  retry_count?: number;
  timeout_ms?: number;
}

// Union type of all supported schemas
export type ConnectorLogSchema = 
  | ComfyUILogSchema 
  | OpenAILogSchema 
  | A1111LogSchema 
  | SimulationLogSchema 
  | RestLogSchema;

// Schema mapping by service type
export const LOG_SCHEMA_MAP = {
  'comfyui': 'ComfyUILogSchema',
  'openai': 'OpenAILogSchema', 
  'openai-image': 'OpenAILogSchema',
  'openai-text': 'OpenAILogSchema',
  'a1111': 'A1111LogSchema',
  'simulation': 'SimulationLogSchema',
  // Generic fallback for unknown services
  'rest': 'RestLogSchema',
} as const;

// Field validation and normalization utilities
export class LogSchemaValidator {
  static validateAndNormalize(serviceType: string, logData: any): ConnectorLogSchema {
    const baseSchema: BaseLogSchema = {
      timestamp: logData.timestamp || new Date().toISOString(),
      level: logData.level || 'info',
      message: logData.message || '',
      event_type: logData.event_type || 'unknown',
      machine_id: logData.machine_id || 'unknown',
      worker_id: logData.worker_id || 'unknown',
      service_type: serviceType as any,
      connector_id: logData.connector_id || 'unknown',
      source: logData.source || 'connector',
      job_id: logData.job_id,
      session_id: logData.session_id,
    };

    // Service-specific normalization
    switch (serviceType) {
      case 'comfyui':
        return {
          ...baseSchema,
          prompt_id: logData.prompt_id,
          client_id: logData.client_id,
          websocket_message_type: logData.websocket_message_type,
          queue_remaining: logData.queue_remaining,
          execution_step: logData.execution_step,
          node_id: logData.node_id,
          workflow_hash: logData.workflow_hash,
          model_name: logData.model_name,
          vram_usage: logData.vram_usage,
        } as ComfyUILogSchema;

      case 'openai':
      case 'openai-image':
      case 'openai-text':
        return {
          ...baseSchema,
          model: logData.model,
          request_id: logData.request_id,
          token_usage: logData.token_usage,
          response_time_ms: logData.response_time_ms,
          request_size_bytes: logData.request_size_bytes,
          response_size_bytes: logData.response_size_bytes,
        } as OpenAILogSchema;

      case 'a1111':
        return {
          ...baseSchema,
          sampler: logData.sampler,
          steps: logData.steps,
          cfg_scale: logData.cfg_scale,
          seed: logData.seed,
          width: logData.width,
          height: logData.height,
          batch_size: logData.batch_size,
          model_checkpoint: logData.model_checkpoint,
          vae: logData.vae,
        } as A1111LogSchema;

      case 'simulation':
        return {
          ...baseSchema,
          simulation_type: logData.simulation_type,
          iteration: logData.iteration,
          total_iterations: logData.total_iterations,
          convergence: logData.convergence,
          parameters: logData.parameters,
        } as SimulationLogSchema;

      default:
        // Generic REST schema for unknown service types
        return {
          ...baseSchema,
          http_method: logData.http_method,
          endpoint: logData.endpoint,
          status_code: logData.status_code,
          request_headers: logData.request_headers,
          response_headers: logData.response_headers,
          retry_count: logData.retry_count,
          timeout_ms: logData.timeout_ms,
        } as RestLogSchema;
    }
  }

  static getRequiredFields(serviceType: string): string[] {
    const baseFields = ['timestamp', 'level', 'message', 'event_type', 'service_type', 'connector_id'];
    
    switch (serviceType) {
      case 'comfyui':
        return [...baseFields, 'prompt_id', 'client_id'];
      case 'openai':
      case 'openai-image':
      case 'openai-text':
        return [...baseFields, 'model', 'request_id'];
      case 'a1111':
        return [...baseFields, 'sampler', 'steps'];
      case 'simulation':
        return [...baseFields, 'simulation_type'];
      default:
        return [...baseFields, 'endpoint'];
    }
  }
}