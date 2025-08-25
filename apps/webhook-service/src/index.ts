/**
 * Webhook Service Entry Point
 *
 * Microservice for handling webhook notifications in the EMP Job Queue system.
 * Listens to Redis events and delivers HTTP webhooks to registered endpoints.
 */

import { config as dotenvConfig } from 'dotenv';
import { createTelemetryClient } from '@emp/telemetry';

import { WebhookServer } from './webhook-server.js';
import { logger } from '@emp/core';

// Load environment variables from profile-specific env file
import { existsSync } from 'fs';
const envFile = existsSync('.env.local-dev') ? '.env.local-dev' : '.env.local';
dotenvConfig({ path: envFile });

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

    // Initialize TelemetryClient for standardized telemetry
    console.log('🔧 Initializing unified telemetry...');
    const telemetryClient = createTelemetryClient('webhook');
    
    // Set webhook-specific log file path
    telemetryClient.setLogFile('/webhook-server/logs/webhook-service.log');
    
    // Initialize telemetry without connection testing to avoid startup failures
    await telemetryClient.startup({
      testConnections: false,
      logConfiguration: true,
      sendStartupPing: true,
    });
    
    console.log('✅ Unified telemetry initialized for webhook service');

    // Create and start webhook server
    const server = new WebhookServer(config);

    // Setup graceful shutdown
    process.on('SIGTERM', () => gracefulShutdown(server));
    process.on('SIGINT', () => gracefulShutdown(server));

    // Start the server
    await server.start();

    // Send webhook service ready metric
    await telemetryClient.otel.gauge('webhook.service.ready', 1, {
      port: config.port.toString(),
      environment: process.env.NODE_ENV || 'development',
    });

    // Log webhook service ready
    await telemetryClient.log.info('✅ Webhook Service ready and accepting connections', {
      port: config.port,
      healthCheck: `http://localhost:${config.port}/health`,
      redis_url: config.redisUrl,
      cors_origins: config.corsOrigins.join(','),
      service_startup_complete: true,
    });

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
