/**
 * API Service Environment Interface
 * Pure job broker - only needs Redis, HTTP server, CORS, and auth
 */

export const ApiEnvInterface = {
  name: "api",
  location: "apps/api",
  
  required: {
    // Core Redis connection for job brokering
    "HUB_REDIS_URL": "REDIS_URL",
    "REDIS_URL": "REDIS_URL",
    "API_BASE_ID": "API_BASE_ID",
    // HTTP server configuration
    "API_PORT": "API_PORT",
    "API_HOST": "API_HOST",
    "WEBHOOK_SERVICE_URL": "WEBHOOK_SERVICE_URL",
    "TELEMETRY_ENV":"TELEMETRY_DASH0_DATASET",
    "DASH0_DATASET":"TELEMETRY_DASH0_DATASET",
    "DASH0_TRACES_ENDPOINT": "TELEMETRY_DASH0_TRACES_ENDPOINT",
    "DASH0_METRICS_ENDPOINT": "TELEMETRY_DASH0_METRICS_ENDPOINT",
    "DASH0_ENDPOINT": "TELEMETRY_DASH0_ENDPOINT",
    "DASH0_LOGS_ENDPOINT": "TELEMETRY_DASH0_LOGS_ENDPOINT",
    "OTEL_ENABLED": "TELEMETRY_OTEL_ENABLED",
    "OTEL_COLLECTOR_TRACES_ENDPOINT": "TELEMETRY_OTEL_COLLECTOR_TRACES_ENDPOINT",
    "OTEL_COLLECTOR_METRICS_ENDPOINT": "TELEMETRY_OTEL_COLLECTOR_METRICS_ENDPOINT",
    "OTEL_SERVICE_NAME":"TELEMETRY_OTEL_SERVICE_NAME",
    "OTEL_SERVICE_VERSION":"TELEMETRY_OTEL_SERVICE_VERSION",
    
    // Required environment variables for OTEL client
    "SERVICE_NAME": "TELEMETRY_OTEL_SERVICE_NAME",
    "SERVICE_VERSION": "TELEMETRY_OTEL_SERVICE_VERSION",
    // Note: MACHINE_ID and WORKER_ID are set dynamically by machine/worker initialization code
    // Note: NODE_ENV not needed - use DASH0_DATASET for environment type
    
    // Fluent Bit configuration
    "FLUENTD_HOST": "TELEMETRY_FLUENTD_HOST",
    "FLUENTD_PORT": "TELEMETRY_FLUENTD_PORT",
    "FLUENTD_SECURE": "TELEMETRY_FLUENTD_SECURE",
    "NODE_ENV": "API_NODE_ENV"
  },
  
  secret: {
    // Sensitive authentication tokens and API keys
    "AUTH_TOKEN": "AUTH_TOKEN",
    "DASH0_API_KEY": "DASH0_API_KEY"
  },
  
  optional: {
    // CORS and security
    "CORS_ORIGINS": "API_CORS_ORIGINS",
    
    // Performance tuning
    "LOG_LEVEL": "API_LOG_LEVEL"
  },
  defaults: {
    "SERVICE_TYPE": "api",
    "LOG_TO_FILE": "true"
  }
};