/**
 * API Service Environment Interface
 * Pure job broker - only needs Redis, HTTP server, CORS, and auth
 */

export const DatabaseEnvInterface = {
  name: "database",
  location: "packages/database",
  
  required: {
    "NODE_ENV": "API_NODE_ENV",
    "PRISMA_TELEMETRY_DISABLED": "DATABASE_PRISMA_TELEMETRY_DISABLED"
  },
  
  secret: {
    // Sensitive authentication tokens and API keys
    "DATABASE_URL": "DATABASE_URL",
    "SHADOW_DATABASE_URL": "DATABASE_SHADOW_URL"
  },
  
  optional: {
    // Performance tuning
    "LOG_LEVEL": "API_LOG_LEVEL"
  },
  defaults: {

  }
};