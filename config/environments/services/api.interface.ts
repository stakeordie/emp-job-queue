/**
 * API Service Environment Interface
 * Pure job broker - only needs Redis, HTTP server, CORS, and auth
 */

export const ApiEnvInterface = {
  name: "api",
  location: "apps/api",
  
  required: {
    // Core Redis connection for job brokering
    "REDIS_URL": "REDIS_URL",
    
    // HTTP server configuration
    "API_PORT": "API_PORT",
    "API_HOST": "API_HOST",
    "WEBHOOK_SERVICE_URL": "WEBHOOK_SERVICE_URL"
  },
  
  optional: {
    // CORS and security
    "CORS_ORIGINS": "API_CORS_ORIGINS",
    "AUTH_TOKEN": "API_AUTH_TOKEN",
    
    // Performance tuning
    "LOG_LEVEL": "API_LOG_LEVEL"
  },
  secret: {
    "WS_AUTH_TOKEN": "API_AUTH_TOKEN"
  },
  defaults: {
    "PORT": "3001",
    "HOST": "0.0.0.0",
    "LOG_LEVEL": "info",
    "CORS_ORIGINS": "*"
  }
};