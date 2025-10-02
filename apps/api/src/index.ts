// API Server Entry Point
import { config } from 'dotenv';

// Initialize new OTLP-native telemetry
import { createTelemetryClient, EmpTelemetryClient } from '@emp/telemetry';

// Store telemetry client globally and export for use in other modules
export let telemetryClient: EmpTelemetryClient | null = null;

import { LightweightAPIServer } from './lightweight-api-server.js';
import { logger } from '@emp/core';

// Load environment variables from profile-specific env file
import { existsSync } from 'fs';

// Use CURRENT_ENV (set by env-management system)
// When running via Docker script (d:api:run), the env file is loaded first and contains CURRENT_ENV
// This allows the Docker script to control which env file is loaded
const profile = process.env.CURRENT_ENV;

if (profile) {
  // If profile is set, try to load the corresponding env file (may already be loaded by Docker)
  const envFile = `.env.${profile}`;

  if (existsSync(envFile)) {
    config({ path: envFile });
    console.log(`📋 Loaded environment from: ${envFile} (profile: ${profile})`);
  } else {
    // Env file doesn't exist - assume it's already loaded by Docker script
    console.log(`📋 Using pre-loaded environment (profile: ${profile})`);
  }
} else {
  // No profile specified - assume env file is already loaded by Docker script
  console.log(`📋 Using pre-loaded environment (no CURRENT_ENV set)`);
}

// Also export components for library use
export * from './lightweight-api-server.js';
export * from './hybrid-client.js';

// Main execution when run directly
async function main() {
  const startupTime = Date.now();

  // Initialize new OTLP-native telemetry client
  if (!process.env.OTEL_COLLECTOR_ENDPOINT) {
    throw new Error('FATAL: OTEL_COLLECTOR_ENDPOINT environment variable is required. No defaults allowed.');
  }
  const collectorEndpoint = process.env.OTEL_COLLECTOR_ENDPOINT;

  if (!process.env.NODE_ENV) {
    throw new Error('FATAL: NODE_ENV environment variable is required. No defaults allowed.');
  }

  telemetryClient = createTelemetryClient({
    serviceName: 'emp-api',
    serviceVersion: '1.0.0',
    collectorEndpoint,
    environment: process.env.NODE_ENV
  });
  
  // CRITICAL: API_PORT must be explicitly set - NO FALLBACKS
  if (!process.env.API_PORT) {
    throw new Error('FATAL: API_PORT environment variable is required. No defaults allowed.');
  }

  const config = {
    port: parseInt(process.env.API_PORT),
    redisUrl: (() => {
      const redisUrl = process.env.REDIS_URL;
      if (!redisUrl) {
        const errorMsg = `
❌ FATAL ERROR: REDIS_URL environment variable is not set!

The API server requires a Redis connection to function. Please set the REDIS_URL environment variable.

Examples:
  - Local development: REDIS_URL=redis://localhost:6379
  - Docker container:  REDIS_URL=redis://host.docker.internal:6379
  - Production:        REDIS_URL=redis://user:pass@your-redis-host:6379

If deploying to Railway, Vast.ai, or other platforms:
  1. Add REDIS_URL to your environment variables
  2. Ensure it's available BEFORE the container starts
  3. Restart the container after setting the variable

Current environment variables containing REDIS:
${Object.keys(process.env).filter(k => k.includes('REDIS')).map(k => `  - ${k}=${process.env[k]}`).join('\n') || '  (none found)'}
`;
        console.error(errorMsg);
        logger.error(errorMsg);
        process.exit(1);
      }
      return redisUrl;
    })(),
    corsOrigins: (() => {
      if (!process.env.CORS_ORIGINS) {
        throw new Error('FATAL: CORS_ORIGINS environment variable is required. No defaults allowed.');
      }
      const origins = process.env.CORS_ORIGINS.split(',').map(origin => origin.trim());
      logger.debug('API CORS Origins configured:', origins);
      return origins;
    })(),
  };

  logger.info('Starting API server with config:', config);

  const server = new LightweightAPIServer(config);

  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });

  try {
    await server.start();
    logger.info('API server started successfully');
  } catch (error) {
    logger.error('Failed to start API server:', error);
    process.exit(1);
  }
}

// Only run main if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    logger.error('Unhandled error in main:', error);
    process.exit(1);
  });
}
