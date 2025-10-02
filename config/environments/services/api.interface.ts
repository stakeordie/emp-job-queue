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


    //TELEMETRY
    "OTEL_COLLECTOR_ENDPOINT": "TELEMETRY_OTEL_COLLECTOR_URL",

    // Fluent Bit configuration
    "NODE_ENV": "API_NODE_ENV",
    "EMPROPS_API_URL":"EMPROPS_API_URL"
  },
  
  secret: {
    // Sensitive authentication tokens and API keys
    "AUTH_TOKEN": "AUTH_TOKEN",
    "DASH0_AUTH_TOKEN": "TELEMETRY_DASH0_AUTH_TOKEN",
    "EMPROPS_API_AUTH": "EMPROPS_API_AUTH",
    "EMPROPS_API_KEY": "EMPROPS_API_KEY",
    "DATABASE_URL": "DATABASE_URL"
  },
  
  optional: {
    // CORS and security
    "CORS_ORIGINS": "API_CORS_ORIGINS",
    "CURRENT_ENV": "API_ENV_PROFILE",

    // Performance tuning
    "LOG_LEVEL": "API_LOG_LEVEL"
  },
  defaults: {
    "SERVICE_TYPE": "api",
    "LOG_TO_FILE": "true"
  }
};