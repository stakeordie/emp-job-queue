// API Server Entry Point
import { config } from 'dotenv';

// Initialize unified telemetry client
import { createTelemetryClient } from '@emp/telemetry';

async function initializeTelemetry() {
  console.log('🚀 initializeTelemetry: Starting telemetry initialization for API service');
  
  try {
    // Generate API server IDs using API_BASE_ID + TELEMETRY_ENV pattern
    console.log(`🔍 initializeTelemetry: Checking MACHINE_ID environment variable`);
    if (!process.env.MACHINE_ID) {
      console.log(`🔍 initializeTelemetry: MACHINE_ID not set, generating from API_BASE_ID + TELEMETRY_ENV`);
      const apiBaseId = process.env.API_BASE_ID;
      const telemetryEnv = process.env.TELEMETRY_ENV;
      
      console.log(`🔍 initializeTelemetry: API_BASE_ID: ${apiBaseId}, TELEMETRY_ENV: ${telemetryEnv}`);
      
      if (!apiBaseId) {
        console.error('❌ initializeTelemetry: API_BASE_ID environment variable missing');
        throw new Error('FATAL: API_BASE_ID environment variable is required for API server identification.');
      }
      if (!telemetryEnv) {
        console.error('❌ initializeTelemetry: TELEMETRY_ENV environment variable missing');
        throw new Error('FATAL: TELEMETRY_ENV environment variable is required for API server identification.');
      }
      
      const machineId = `${apiBaseId}-${telemetryEnv}`;
      process.env.MACHINE_ID = machineId;
      console.log(`✅ initializeTelemetry: Generated MACHINE_ID: ${machineId}`);
    } else {
      console.log(`✅ initializeTelemetry: Using existing MACHINE_ID: ${process.env.MACHINE_ID}`);
    }
    
    if (!process.env.WORKER_ID) {
      console.log(`🔍 initializeTelemetry: WORKER_ID not set, using MACHINE_ID value`);
      // API doesn't have separate workers, use same as MACHINE_ID
      process.env.WORKER_ID = process.env.MACHINE_ID;
      console.log(`✅ initializeTelemetry: Set WORKER_ID: ${process.env.WORKER_ID}`);
    } else {
      console.log(`✅ initializeTelemetry: Using existing WORKER_ID: ${process.env.WORKER_ID}`);
    }

    console.log('🔧 initializeTelemetry: Creating telemetry client');
    // Create and initialize telemetry client
    const telemetryClient = createTelemetryClient('api');
    
    console.log('🔧 initializeTelemetry: Starting telemetry client startup');
    // Initialize with full pipeline testing
    const pipelineHealth = await telemetryClient.startup({
      testConnections: true,
      logConfiguration: true,
      sendStartupPing: true,
    });
    
    if (pipelineHealth?.overall === 'failed') {
      console.warn('⚠️ initializeTelemetry: Telemetry pipeline has failures but continuing API startup...');
    } else {
      console.log('✅ initializeTelemetry: Telemetry client startup completed successfully');
    }
    
    return telemetryClient;
  } catch (error) {
    console.error('❌ initializeTelemetry: Telemetry initialization failed:', error.message);
    console.warn('⚠️ initializeTelemetry: Continuing API startup without telemetry...');
    return null;
  }
}

// Store telemetry client globally for use in main()
let telemetryClient: any = null;

import { LightweightAPIServer } from './lightweight-api-server.js';
import { logger } from '@emp/core';

// Load environment variables from profile-specific env file
import { existsSync } from 'fs';
const envFile = existsSync('.env.local-dev') ? '.env.local-dev' : '.env.local';
config({ path: envFile });

// Also export components for library use
export * from './lightweight-api-server.js';
export * from './hybrid-client.js';

// Main execution when run directly
async function main() {
  const startupTime = Date.now();
  
  // Initialize telemetry first
  telemetryClient = await initializeTelemetry();
  
  // Demonstrate clean telemetry API
  if (telemetryClient) {
    console.log('📁 Setting up application log file monitoring...');
    await telemetryClient.log.addFile('/api-server/logs/application.log', 'api-app');
    
    // Write some test logs to demonstrate the pipeline
    await telemetryClient.log.info('API server startup initiated', {
      startup_time_ms: Date.now() - startupTime,
      environment: process.env.TELEMETRY_ENV
    });

    // Send a test metric
    await telemetryClient.otel.gauge('api.startup.phase.telemetry_complete', Date.now() - startupTime, {
      environment: process.env.TELEMETRY_ENV || 'unknown'
    }, 'ms');
  }
  
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
    
    // Log startup completion through telemetry
    if (telemetryClient) {
      const totalStartupTime = Date.now() - startupTime;
      await telemetryClient.log.info('API server startup completed successfully', {
        total_startup_time_ms: totalStartupTime,
        port: config.port,
        environment: process.env.TELEMETRY_ENV,
        server_ready: true
      });
      
      await telemetryClient.otel.gauge('api.startup.total_duration', totalStartupTime, {
        environment: process.env.TELEMETRY_ENV || 'unknown',
        status: 'success'
      }, 'ms');
    }
  } catch (error) {
    logger.error('Failed to start API server:', error);
    
    // Log startup failure through telemetry
    if (telemetryClient) {
      await telemetryClient.log.error('API server startup failed', {
        error: error.message,
        environment: process.env.TELEMETRY_ENV
      });
    }
    
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
