#!/usr/bin/env node
// Redis-Direct Worker Entry Point - Phase 1B Implementation
// Standalone worker that connects directly to Redis without WebSocket hub dependency

import { RedisDirectBaseWorker } from './redis-direct-base-worker.js';
import { ConnectorManager } from './connector-manager.js';
import { logger } from '@emp/core';
import os from 'os';

// Export all connector classes for dynamic loading in bundled environment
export * from './connectors/index.js';

// Worker configuration from environment
// Use provided WORKER_ID directly (set by PM2 ecosystem generator)
// PM2 creates unique IDs like: simulation-0, simulation-1, comfyui-gpu0, comfyui-gpu1
const WORKER_ID = process.env.WORKER_ID;

if (!WORKER_ID) {
  logger.error('WORKER_ID environment variable is required');
  process.exit(1);
}
const HUB_REDIS_URL = process.env.HUB_REDIS_URL || 'redis://localhost:6379';
const MACHINE_ID = process.env.MACHINE_ID || os.hostname();

async function main() {
  logger.info(`Starting Redis-direct worker ${WORKER_ID} on machine ${MACHINE_ID}  ^^^^^^`);

  // Log received environment variables
  const envVars = Object.keys(process.env).filter(
    key =>
      key.startsWith('OPENAI_') ||
      key.startsWith('COMFYUI_') ||
      key.startsWith('SIMULATION_') ||
      key.startsWith('A1111_') ||
      key.startsWith('REPLICATE_') ||
      key.startsWith('OLLAMA_')
  );
  if (envVars.length > 0) {
    logger.debug(`Received ${envVars.length} ENV vars: ${envVars.join(', ')}`);
  } else {
    logger.debug(`No service-specific ENV vars received`);
  }

  logger.info(`Connecting to Redis at: ${HUB_REDIS_URL}`);

  // Initialize connector manager
  const connectorManager = new ConnectorManager();

  // Create Redis-direct worker
  const worker = new RedisDirectBaseWorker(WORKER_ID, MACHINE_ID, connectorManager, HUB_REDIS_URL);

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down worker...`);
    try {
      // Determine shutdown reason based on signal and environment
      let shutdownReason = `${signal} signal received`;
      if (signal === 'SIGTERM') {
        // SIGTERM is typically sent by Docker during container shutdown
        shutdownReason =
          process.env.NODE_ENV === 'production'
            ? 'Docker container shutdown'
            : 'Process termination requested';
      } else if (signal === 'SIGINT') {
        shutdownReason = 'Manual interruption (Ctrl+C)';
      }

      // Set environment variable so worker can access shutdown reason
      process.env.SHUTDOWN_REASON = shutdownReason;

      await worker.stop();
      logger.info(`Worker shutdown complete: ${shutdownReason}`);
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

    logger.info(`🚀 Worker ${WORKER_ID} ready`);
    const capabilities = worker.getCapabilities();
    logger.info(
      `📋 Services: ${capabilities.services.join(', ')} | GPU: ${capabilities.hardware.gpu_memory_gb}GB | RAM: ${capabilities.hardware.ram_gb}GB`
    );
    logger.info('🔄 Polling Redis for jobs...');

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
