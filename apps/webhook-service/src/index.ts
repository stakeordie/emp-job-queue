/**
 * Webhook Service Entry Point
 *
 * Microservice for handling webhook notifications in the EMP Job Queue system.
 * Listens to Redis events and delivers HTTP webhooks to registered endpoints.
 */

// Initialize unified telemetry client
import { createTelemetryClient } from '@emp/telemetry';

async function initializeTelemetry() {
  console.log('🚀 initializeTelemetry: Starting telemetry initialization for webhook service');
  
  try {
    // Generate webhook server IDs using WEBHOOK_BASE_ID + TELEMETRY_ENV pattern
    console.log(`🔍 initializeTelemetry: Checking MACHINE_ID environment variable`);
    if (!process.env.MACHINE_ID) {
      console.log(`🔍 initializeTelemetry: MACHINE_ID not set, generating from WEBHOOK_BASE_ID + TELEMETRY_ENV`);
      const webhookBaseId = process.env.WEBHOOK_BASE_ID;
      const telemetryEnv = process.env.TELEMETRY_ENV;
      
      console.log(`🔍 initializeTelemetry: WEBHOOK_BASE_ID: ${webhookBaseId}, TELEMETRY_ENV: ${telemetryEnv}`);
      
      if (!webhookBaseId) {
        console.error('❌ initializeTelemetry: WEBHOOK_BASE_ID environment variable missing');
        throw new Error('FATAL: WEBHOOK_BASE_ID environment variable is required for webhook service identification.');
      }
      if (!telemetryEnv) {
        console.error('❌ initializeTelemetry: TELEMETRY_ENV environment variable missing');
        throw new Error('FATAL: TELEMETRY_ENV environment variable is required for webhook service identification.');
      }
      
      const machineId = `${webhookBaseId}-${telemetryEnv}`;
      process.env.MACHINE_ID = machineId;
      console.log(`✅ initializeTelemetry: Generated MACHINE_ID: ${machineId}`);
    } else {
      console.log(`✅ initializeTelemetry: Using existing MACHINE_ID: ${process.env.MACHINE_ID}`);
    }
    
    if (!process.env.WORKER_ID) {
      console.log(`🔍 initializeTelemetry: WORKER_ID not set, using MACHINE_ID value`);
      // Webhook service doesn't have separate workers, use same as MACHINE_ID
      process.env.WORKER_ID = process.env.MACHINE_ID;
      console.log(`✅ initializeTelemetry: Set WORKER_ID: ${process.env.WORKER_ID}`);
    } else {
      console.log(`✅ initializeTelemetry: Using existing WORKER_ID: ${process.env.WORKER_ID}`);
    }

    console.log('🔧 initializeTelemetry: Creating telemetry client');
    // Create and initialize telemetry client
    const telemetryClient = createTelemetryClient('webhook');
    
    console.log('📁 initializeTelemetry: Adding log files before telemetry startup...');
    // Monitor actual Winston log files (core logger writes to LOG_DIR or /tmp)
    const logDir = process.env.LOG_DIR || '/tmp';
    await telemetryClient.log.addFile(`${logDir}/error.log`, 'webhook-error');
    await telemetryClient.log.addFile(`${logDir}/combined.log`, 'webhook-combined');
    console.log(`✅ initializeTelemetry: Log files added to monitoring (${logDir})`);
    
    console.log('🔧 initializeTelemetry: Starting telemetry client startup');
    // Initialize without connection testing to avoid startup failures
    const pipelineHealth = await telemetryClient.startup({
      testConnections: false,
      logConfiguration: true,
      sendStartupPing: true,
    });
    
    if (pipelineHealth?.overall === 'failed') {
      console.warn('⚠️ initializeTelemetry: Telemetry pipeline has failures but continuing webhook startup...');
    } else {
      console.log('✅ initializeTelemetry: Telemetry client startup completed successfully');
    }
    
    return telemetryClient;
  } catch (error) {
    console.error('❌ initializeTelemetry: Telemetry initialization failed:', error.message);
    console.warn('⚠️ initializeTelemetry: Continuing webhook startup without telemetry...');
    return null;
  }
}

// Store telemetry client globally for use in main()
let telemetryClient: any = null;

import { WebhookServer } from './webhook-server.js';
import { logger } from '@emp/core';

// Environment variables are loaded by dev-service.js script
// which handles both .env.{profile} and .env.secret.{profile} files

// Configuration from environment variables
const config = {
  port: (() => {
    if (!process.env.WEBHOOK_SERVICE_PORT) {
      throw new Error('WEBHOOK_SERVICE_PORT environment variable is required');
    }
    return parseInt(process.env.WEBHOOK_SERVICE_PORT);
  })(),
  redisUrl: (() => {
    const redisUrl = process.env.HUB_REDIS_URL;
    if (!redisUrl) {
      const errorMsg = `
❌ FATAL ERROR: HUB_REDIS_URL environment variable is not set!

The webhook service requires a Redis connection to function. Please set the HUB_REDIS_URL environment variable.

Examples:
  - Local development: HUB_REDIS_URL=redis://localhost:6379
  - Docker container:  HUB_REDIS_URL=redis://host.docker.internal:6379
  - Production:        HUB_REDIS_URL=redis://user:pass@your-redis-host:6379

If deploying to Railway, Vast.ai, or other platforms:
  1. Add HUB_REDIS_URL to your environment variables
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

      // Always include localhost for development
      if (!origins.includes('http://localhost:3333')) {
        origins.push('http://localhost:3333');
      }
      return origins;
    }

    return ['http://localhost:3333', 'http://localhost:3331', '*'];
  })(),
};

// Global error handlers
process.on('uncaughtException', error => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Graceful shutdown handler
async function gracefulShutdown(server: WebhookServer): Promise<void> {
  logger.info('Received shutdown signal, shutting down gracefully...');

  try {
    await server.stop();
    logger.info('✅ Webhook service shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Main function
async function main(): Promise<void> {
  const startupTime = Date.now();
  
  // Initialize telemetry first
  telemetryClient = await initializeTelemetry();
  
  // Demonstrate clean telemetry API
  if (telemetryClient) {
    // Write some test logs to demonstrate the pipeline
    await telemetryClient.log.info('🔍 VALIDATION: Webhook service startup initiated', {
      startup_time_ms: Date.now() - startupTime,
      environment: process.env.TELEMETRY_ENV,
      validation_type: 'webhook_startup',
      expected_pipeline: 'webhook-service.log → fluent-bit → fluentd → dash0'
    });

    // Send a test metric (non-fatal if it fails)
    try {
      await telemetryClient.otel.gauge('webhook.startup.phase.telemetry_complete', Date.now() - startupTime, {
        environment: process.env.TELEMETRY_ENV || 'unknown'
      }, 'ms');
    } catch (error) {
      console.warn('⚠️ Failed to send startup metric (non-fatal):', error.message);
    }
  }

  try {
    logger.info('🚀 Starting Webhook Service', {
      config: {
        port: config.port,
        redisUrl: config.redisUrl,
        corsOrigins: config.corsOrigins,
      },
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
      rawCorsEnv: process.env.CORS_ORIGINS,
    });

    // Create and start webhook server
    const server = new WebhookServer({
      ...config,
      telemetryClient
    });

    // Setup graceful shutdown
    process.on('SIGTERM', () => gracefulShutdown(server));
    process.on('SIGINT', () => gracefulShutdown(server));

    // Start the server
    await server.start();
    logger.info('Webhook server started successfully');
    
    // Log startup completion through telemetry
    if (telemetryClient) {
      const totalStartupTime = Date.now() - startupTime;
      await telemetryClient.log.info('✅ VALIDATION: Webhook service startup completed successfully', {
        total_startup_time_ms: totalStartupTime,
        port: config.port,
        environment: process.env.TELEMETRY_ENV,
        server_ready: true,
        validation_type: 'webhook_ready',
        expected_result: 'Webhook service is now accepting connections and logs are flowing to Dash0'
      });
      
      try {
        await telemetryClient.otel.gauge('webhook.startup.total_duration', totalStartupTime, {
          environment: process.env.TELEMETRY_ENV || 'unknown',
          status: 'success'
        }, 'ms');
        
        // Send webhook service ready metric
        await telemetryClient.otel.gauge('webhook.service.ready', 1, {
          port: config.port.toString(),
          environment: process.env.NODE_ENV || 'development',
        });
      } catch (error) {
        console.warn('⚠️ Failed to send startup metrics (non-fatal):', error.message);
      }

      // Log webhook service ready
      await telemetryClient.log.info('✅ Webhook Service ready and accepting connections', {
        port: config.port,
        healthCheck: `http://localhost:${config.port}/health`,
        redis_url: config.redisUrl,
        cors_origins: config.corsOrigins.join(','),
        service_startup_complete: true,
      });
    }

    logger.info('✅ Webhook Service ready', {
      port: config.port,
      healthCheck: `http://localhost:${config.port}/health`,
    });
  } catch (error) {
    logger.error('Failed to start webhook service:', error);
    
    // Log startup failure through telemetry
    if (telemetryClient) {
      await telemetryClient.log.error('Webhook service startup failed', {
        error: error.message,
        environment: process.env.TELEMETRY_ENV
      });
    }
    
    process.exit(1);
  }
}

// Start the service
main().catch(error => {
  logger.error('Fatal error during startup:', error);
  process.exit(1);
});
