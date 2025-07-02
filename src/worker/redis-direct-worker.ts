#!/usr/bin/env node
// Redis-Direct Worker Entry Point - Phase 1B Implementation
// Standalone worker that connects directly to Redis without WebSocket hub dependency

import { RedisDirectBaseWorker } from './redis-direct-base-worker.js';
import { ConnectorManager } from './connector-manager.js';
import { logger } from '../core/utils/logger.js';
import os from 'os';

// Worker configuration from environment
const WORKER_ID = process.env.WORKER_ID || `redis-direct-worker-${os.hostname()}-${process.pid}`;
const HUB_REDIS_URL = process.env.HUB_REDIS_URL || 'redis://localhost:6379';

async function main() {
  logger.info(`Starting Redis-direct worker ${WORKER_ID}...`);
  logger.info(`Connecting to Redis at: ${HUB_REDIS_URL}`);

  // Initialize connector manager
  const connectorManager = new ConnectorManager();

  // Create Redis-direct worker
  const worker = new RedisDirectBaseWorker(WORKER_ID, connectorManager, HUB_REDIS_URL);

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down worker...`);
    try {
      await worker.stop();
      logger.info('Worker shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    // Start the worker
    await worker.start();

    logger.info(`🚀 Redis-direct worker ${WORKER_ID} is running`);
    logger.info('Worker capabilities:');
    const capabilities = worker.getCapabilities();
    logger.info(`  - Services: ${capabilities.services.join(', ')}`);
    logger.info(`  - GPU Memory: ${capabilities.hardware.gpu_memory_gb}GB`);
    logger.info(`  - CPU Cores: ${capabilities.hardware.cpu_cores}`);
    logger.info(`  - RAM: ${capabilities.hardware.ram_gb}GB`);
    logger.info('Polling Redis for jobs...');

    // Keep the process alive
    process.stdin.resume();
  } catch (error) {
    logger.error('Failed to start worker:', error);
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

// Run the worker
main().catch(error => {
  logger.error('Worker startup failed:', error);
  process.exit(1);
});
