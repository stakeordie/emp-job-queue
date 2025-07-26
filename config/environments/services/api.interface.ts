/**
 * API Service Environment Interface
 * Pure job broker - only needs Redis, HTTP server, CORS, and auth
 */

export const ApiEnvInterface = {
  name: "api",
  location: "apps/api",
  file_name: ".env",
  
  required: {
    // Core Redis connection for job brokering
    "REDIS_URL": "REDIS_URL",
    
    // HTTP server configuration
    "PORT": "REDIS-API_PORT",
    "HOST": "REDIS-API_HOST",
  },
  
  optional: {
    // CORS and security
    "CORS_ORIGINS": "REDIS-API_CORS_ORIGINS",
    "AUTH_TOKEN": "REDIS-API_AUTH_TOKEN",
    
    // Performance tuning
    "LOG_LEVEL": "REDIS-API_LOG_LEVEL",
  },
  
  defaults: {
    "PORT": "3001",
    "HOST": "0.0.0.0",
    "LOG_LEVEL": "info",
    "CORS_ORIGINS": "*",
  }
};