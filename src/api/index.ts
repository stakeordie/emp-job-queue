#!/usr/bin/env node
// Lightweight API Entry Point - Phase 1C Implementation
// Replaces hub orchestration with simple HTTP + WebSocket API

import { LightweightAPIServer } from './lightweight-api-server.js';
import { logger } from '../core/utils/logger.js';

// Configuration from environment
const API_PORT = parseInt(process.env.API_PORT || process.env.HUB_PORT || '3001');
const REDIS_URL = process.env.REDIS_URL || process.env.HUB_REDIS_URL || 'redis://localhost:6379';
const CORS_ORIGINS = process.env.CORS_ORIGINS?.split(',') || ['*'];

async function main() {
  logger.info('🚀 Starting Lightweight API Server...');
  logger.info(`📍 Port: ${API_PORT}`);
  logger.info(`📊 Redis: ${REDIS_URL}`);
  logger.info(`🌐 CORS Origins: ${CORS_ORIGINS.join(', ')}`);

  const apiServer = new LightweightAPIServer({
    port: API_PORT,
    redisUrl: REDIS_URL,
    corsOrigins: CORS_ORIGINS,
  });

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down API server...`);
    try {
      await apiServer.stop();
      logger.info('API server shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await apiServer.start();

    logger.info('✅ Lightweight API Server is running');
    logger.info('📈 Connection stats:', apiServer.getConnectionStats());

    // Log stats periodically
    setInterval(() => {
      const stats = apiServer.getConnectionStats();
      if (stats.total_connections > 0) {
        logger.info('📊 Active connections:', stats);
      }
    }, 30000);

    // Keep the process alive
    process.stdin.resume();
  } catch (error) {
    logger.error('Failed to start API server:', error);
    process.exit(1);
  }
}

// Error handling
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', error => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Run the API server
main().catch(error => {
  logger.error('API server startup failed:', error);
  process.exit(1);
});
