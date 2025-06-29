// Worker Service Entry Point - direct port from Python worker/worker.py
// Distributed job processor with modular connector architecture

import { BaseWorker } from './base-worker.js';
import { ConnectorManager } from './connector-manager.js';
import { WorkerClient } from './worker-client.js';
import { logger } from '../core/utils/logger.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

class Worker {
  private baseWorker: BaseWorker;
  private isRunning = false;

  constructor() {
    const workerId = process.env.WORKER_ID || `worker-${Date.now()}`;
    const hubRedisUrl = process.env.HUB_REDIS_URL || process.env.REDIS_URL || 'redis://localhost:6379';
    const hubWsUrl = process.env.HUB_WS_URL || 'ws://localhost:3002';
    
    // Initialize connector manager
    const connectorManager = new ConnectorManager();
    
    // Initialize worker client for hub communication
    const workerClient = new WorkerClient(hubRedisUrl, hubWsUrl, workerId);
    
    // Initialize base worker
    this.baseWorker = new BaseWorker(workerId, connectorManager, workerClient);
  }

  async start(): Promise<void> {
    try {
      logger.info('Starting Worker service...');
      
      await this.baseWorker.start();
      
      this.isRunning = true;
      
      logger.info('Worker service started successfully');
      logger.info(`Worker ID: ${this.baseWorker.getWorkerId()}`);
      logger.info(`Connected services: ${this.baseWorker.getConnectedServices().join(', ')}`);
      
    } catch (error) {
      logger.error('Failed to start Worker service:', error);
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    logger.info('Stopping Worker service...');
    
    try {
      await this.baseWorker.stop();
      
      this.isRunning = false;
      logger.info('Worker service stopped successfully');
      
    } catch (error) {
      logger.error('Error stopping Worker service:', error);
      throw error;
    }
  }

  isHealthy(): boolean {
    return this.isRunning && this.baseWorker.isHealthy();
  }

  getWorkerId(): string {
    return this.baseWorker.getWorkerId();
  }
}

// Create and start worker instance
const worker = new Worker();

// Graceful shutdown handling
const shutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  try {
    await worker.stop();
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  shutdown('unhandledRejection');
});

// Start the worker
worker.start().catch(error => {
  logger.error('Failed to start worker:', error);
  process.exit(1);
});

export { Worker };