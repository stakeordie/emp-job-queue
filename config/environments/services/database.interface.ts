/**
 * Database Service Environment Interface
 * Manages Prisma connection and migrations for the shared database
 */

export const DatabaseEnvInterface = {
  name: "database",
  location: "packages/database",

  required: {
    "NODE_ENV": "API_NODE_ENV",
    "PRISMA_TELEMETRY_DISABLED": "DATABASE_PRISMA_TELEMETRY_DISABLED"
  },

  secret: {
    // Sensitive database connection strings
    "DATABASE_URL": "DATABASE_URL",
    "DIRECT_URL": "DATABASE_DIRECT_URL"
  },

  optional: {
    // Performance tuning
    "LOG_LEVEL": "API_LOG_LEVEL"
  },
  defaults: {

  }
};
