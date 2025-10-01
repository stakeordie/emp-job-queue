/**
 * Webhook Service Entry Point
 *
 * Microservice for handling webhook notifications in the EMP Job Queue system.
 * Listens to Redis events and delivers HTTP webhooks to registered endpoints.
 */

import { createTelemetryClient } from '@emp/telemetry';
import type { EmpTelemetryClient } from '@emp/telemetry';

// Store telemetry client globally
export let telemetryClient: EmpTelemetryClient | null = null;

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

  // Initialize new OTLP-native telemetry client
  if (!process.env.OTEL_COLLECTOR_ENDPOINT) {
    throw new Error('FATAL: OTEL_COLLECTOR_ENDPOINT environment variable is required. No defaults allowed.');
  }
  if (!process.env.NODE_ENV) {
    throw new Error('FATAL: NODE_ENV environment variable is required. No defaults allowed.');
  }

  const collectorEndpoint = process.env.OTEL_COLLECTOR_ENDPOINT;

  telemetryClient = createTelemetryClient({
    serviceName: 'emp-webhook',
    serviceVersion: '1.0.0',
    collectorEndpoint,
    environment: process.env.NODE_ENV
  });
  console.log(`✅ Telemetry initialized (endpoint: ${collectorEndpoint})`);

  try {
    logger.info('🚀 Starting Webhook Service', {
      config: {
        port: config.port,
        redisUrl: config.redisUrl,
        corsOrigins: config.corsOrigins,
      },
      environment: process.env.NODE_ENV,
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
