/**
 * Webhook Service Entry Point
 *
 * Microservice for handling webhook notifications in the EMP Job Queue system.
 * Listens to Redis events and delivers HTTP webhooks to registered endpoints.
 */

import { WebhookServer } from './webhook-server.js';
import { logger } from '@emp/core';

// Configuration from environment variables
const config = {
  port: parseInt(process.env.WEBHOOK_SERVICE_PORT || '3332'),
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
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
