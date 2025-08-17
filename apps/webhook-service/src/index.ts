/**
 * Webhook Service Entry Point
 *
 * Microservice for handling webhook notifications in the EMP Job Queue system.
 * Listens to Redis events and delivers HTTP webhooks to registered endpoints.
 */

import { config as dotenvConfig } from 'dotenv';

// Initialize OpenTelemetry FIRST before any other imports
if (process.env.OTEL_ENABLED === 'true') {
  try {
    // Generate webhook service IDs using WEBHOOK_BASE_ID + DASH0_DATASET pattern
    if (!process.env.MACHINE_ID) {
      const webhookBaseId = process.env.WEBHOOK_BASE_ID;
      const dataset = process.env.DASH0_DATASET;
      
      if (!webhookBaseId) {
        throw new Error('FATAL: WEBHOOK_BASE_ID environment variable is required for webhook service identification.');
      }
      if (!dataset) {
        throw new Error('FATAL: DASH0_DATASET environment variable is required for webhook service identification.');
      }
      
      process.env.MACHINE_ID = `${webhookBaseId}-${dataset}`;
    }
    
    if (!process.env.WORKER_ID) {
      // Webhook doesn't have separate workers, use same as MACHINE_ID
      process.env.WORKER_ID = process.env.MACHINE_ID;
    }
    
    // JobInstrumentation is an object with methods, not a constructor
    const { JobInstrumentation } = await import('@emp/core');
    
    // Validate required environment variables for OTEL client
    const requiredOtelVars = ['SERVICE_NAME', 'SERVICE_VERSION', 'DASH0_DATASET', 'MACHINE_ID', 'WORKER_ID'];
    const missingVars = requiredOtelVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      throw new Error(`FATAL: Missing required OTEL environment variables: ${missingVars.join(', ')}. MACHINE_ID and WORKER_ID must be set by deployment configuration.`);
    }
    
    // Set OTEL endpoint if not already configured
    if (!process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) {
      if (!process.env.OTEL_COLLECTOR_TRACES_ENDPOINT) {
        throw new Error('FATAL: Either OTEL_EXPORTER_OTLP_TRACES_ENDPOINT or OTEL_COLLECTOR_TRACES_ENDPOINT must be set for telemetry.');
      }
      process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = process.env.OTEL_COLLECTOR_TRACES_ENDPOINT;
    }
    
    console.log('✅ OTEL instrumentation initialized');
    
    // Send startup trace and log events
    const { logger } = await import('@emp/core');
    logger.info('🚀 Webhook Service OTEL and Fluent Bit setup completed', {
      machine_id: process.env.MACHINE_ID,
      worker_id: process.env.WORKER_ID,
      service_name: process.env.SERVICE_NAME,
      build_date: process.env.BUILD_DATE,
      event_type: 'startup_complete',
      timestamp: new Date().toISOString()
    });
    
    // Send startup ping trace event directly to OTEL collector
    const traceId = Array.from({length: 32}, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const spanId = Array.from({length: 16}, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const startTime = Date.now();
    
    const traceData = {
      resourceSpans: [{
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "emp-webhook-service" }},
            { key: "machine.id", value: { stringValue: process.env.MACHINE_ID }},
            { key: "deployment.environment", value: { stringValue: process.env.NODE_ENV }}
          ]
        },
        scopeSpans: [{
          spans: [{
            traceId,
            spanId,
            name: 'webhook.startup.ping',
            kind: 1, // SPAN_KIND_SERVER
            startTimeUnixNano: `${startTime * 1000000}`,
            endTimeUnixNano: `${(startTime + 1) * 1000000}`,
            attributes: [
              { key: "event.name", value: { stringValue: "webhook.startup.ping" }},
              { key: "machine.id", value: { stringValue: process.env.MACHINE_ID }},
              { key: "service.name", value: { stringValue: process.env.SERVICE_NAME }},
              { key: "build.date", value: { stringValue: process.env.BUILD_DATE }},
              { key: "startup.timestamp", value: { stringValue: new Date().toISOString() }}
            ]
          }]
        }]
      }]
    };
    
    try {
      const response = await fetch(process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(traceData)
      });
      
      if (response.ok) {
        console.log('📡 Startup ping trace sent successfully (webhook.startup.ping)');
      } else {
        console.warn(`⚠️ Failed to send startup ping trace: ${response.status}`);
      }
    } catch (error) {
      console.warn('⚠️ Error sending startup ping trace:', error.message);
    }
    
    console.log('📡 Startup telemetry events sent');
  } catch (error) {
    console.warn('⚠️ OTEL instrumentation failed to initialize:', error.message);
  }
}

import { WebhookServer } from './webhook-server.js';
import { logger } from '@emp/core';

// Load environment variables from profile-specific env file
import { existsSync } from 'fs';
const envFile = existsSync('.env.local-dev') ? '.env.local-dev' : '.env.local';
dotenvConfig({ path: envFile });

// Configuration from environment variables
const config = {
  port: parseInt(process.env.WEBHOOK_SERVICE_PORT || '3332'),
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
    const server = new WebhookServer(config);

    // Setup graceful shutdown
    process.on('SIGTERM', () => gracefulShutdown(server));
    process.on('SIGINT', () => gracefulShutdown(server));

    // Start the server
    await server.start();

    logger.info('✅ Webhook Service ready', {
      port: config.port,
      healthCheck: `http://localhost:${config.port}/health`,
    });
  } catch (error) {
    logger.error('Failed to start webhook service:', error);
    process.exit(1);
  }
}

// Start the service
main().catch(error => {
  logger.error('Fatal error during startup:', error);
  process.exit(1);
});
