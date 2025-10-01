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

// Allow profile selection via EMP_PROFILE environment variable
// Default to local-dev for backwards compatibility
const profile = process.env.EMP_PROFILE || 'local-dev';
const envFile = `.env.${profile}`;

if (existsSync(envFile)) {
  config({ path: envFile });
  console.log(`📋 Loaded environment from: ${envFile}`);
} else {
  // Fallback to .env.local if profile-specific file doesn't exist
  const fallback = '.env.local';
  if (existsSync(fallback)) {
    config({ path: fallback });
    console.log(`⚠️ Profile ${profile} not found, using: ${fallback}`);
  } else {
    console.warn(`⚠️ No environment file found for profile: ${profile}`);
  }
}

// Also export components for library use
export * from './lightweight-api-server.js';
export * from './hybrid-client.js';

// Main execution when run directly
async function main() {
  const startupTime = Date.now();

  // Initialize new OTLP-native telemetry client
  const collectorEndpoint = process.env.OTEL_COLLECTOR_ENDPOINT || 'http://localhost:4318';

  telemetryClient = createTelemetryClient({
    serviceName: 'emp-api',
    serviceVersion: '1.0.0',
    collectorEndpoint,
    environment: process.env.NODE_ENV || 'development'
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
      const corsEnv = process.env.CORS_ORIGINS;
      if (corsEnv) {
        const origins = corsEnv.split(',').map(origin => origin.trim());
        logger.debug('API CORS Origins configured:', origins);
        return origins;
      }
      logger.debug('API CORS Origins defaulting to wildcard');
      return ['*'];
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
