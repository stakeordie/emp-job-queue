#!/usr/bin/env node
/**
 * API Machine Entry Point
 * 
 * Lightweight service for processing external API jobs through the EmProps Job Queue.
 * Designed for Railway deployment with minimal resource usage.
 */

import Redis from 'ioredis';
import { createLogger } from './utils/logger.js';
import config from './config/environment.js';
import { SimulationService } from './services/simulation-service.js';
import { SimulationWorker } from './workers/simulation-worker.js';

const logger = createLogger('api-machine');

// Global state
let redisClient = null;
let simulationService = null;
let workers = [];
let isShuttingDown = false;

/**
 * Main application entry point
 */
async function main() {
  logger.info('Starting API Machine...', {
    version: '0.1.0',
    machineId: config.machine.id,
    environment: config.machine.environment,
    services: config.workers.services
  });

  try {
    // Initialize Redis connection
    await initializeRedis();
    
    // Start simulation service if enabled
    if (config.services.simulation.enabled) {
      await startSimulationService();
    }
    
    // Start workers
    await startWorkers();
    
    // Setup health check server
    await startHealthServer();
    
    logger.info('API Machine started successfully', {
      machineId: config.machine.id,
      workersStarted: workers.length,
      simulationEnabled: config.services.simulation.enabled
    });

  } catch (error) {
    logger.error('Failed to start API Machine:', error);
    await shutdown(1);
  }
}

/**
 * Initialize Redis connection
 */
async function initializeRedis() {
  logger.info('Connecting to Redis...', {
    host: config.redis.host,
    port: config.redis.port,
    db: config.redis.db
  });

  redisClient = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    db: config.redis.db,
    retryDelayOnFailover: 100,
    retryConnections: 3,
    maxRetriesPerRequest: 3,
    lazyConnect: true
  });

  redisClient.on('connect', () => {
    logger.info('Redis connection established');
  });

  redisClient.on('error', (error) => {
    logger.error('Redis connection error:', error);
  });

  redisClient.on('close', () => {
    logger.warn('Redis connection closed');
  });

  // Test connection
  await redisClient.connect();
  await redisClient.ping();
  
  logger.info('Redis connection verified');
}

/**
 * Start simulation service for testing
 */
async function startSimulationService() {
  logger.info('Starting simulation service...');
  
  simulationService = new SimulationService();
  await simulationService.start();
  
  logger.info('Simulation service started on port', config.services.simulation.port);
}

/**
 * Start worker processes
 */
async function startWorkers() {
  logger.info('Starting workers...', {
    count: config.workers.count,
    services: config.workers.services
  });

  const workerPromises = [];
  
  for (let i = 0; i < config.workers.count; i++) {
    const workerId = `${config.machine.id}-worker-${i}`;
    
    // For now, only start simulation workers
    // OpenAI workers will be added in Phase 1
    if (config.workers.services.includes('simulation')) {
      const worker = new SimulationWorker(workerId, redisClient);
      workers.push(worker);
      workerPromises.push(worker.start());
    }
  }

  await Promise.all(workerPromises);
  
  logger.info(`Started ${workers.length} workers`);
}

/**
 * Start health check HTTP server
 */
async function startHealthServer() {
  const express = await import('express');
  const app = express.default();
  
  // JSON middleware
  app.use(express.json());
  
  // CORS headers
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    next();
  });

  // Health check endpoint
  app.get('/health', async (req, res) => {
    try {
      const health = {
        status: 'healthy',
        machine_id: config.machine.id,
        machine_type: config.machine.type,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        redis: {
          connected: redisClient && redisClient.status === 'ready'
        },
        services: {
          simulation: {
            enabled: config.services.simulation.enabled,
            running: simulationService !== null
          }
        },
        workers: {
          count: workers.length,
          status: workers.map(worker => ({
            id: worker.workerId,
            running: worker.isRunning,
            currentJob: worker.currentJob
          }))
        }
      };

      const isHealthy = health.redis.connected && 
                       workers.every(w => w.isRunning) &&
                       (!config.services.simulation.enabled || simulationService !== null);

      res.status(isHealthy ? 200 : 503).json(health);
    } catch (error) {
      logger.error('Health check error:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // Status endpoint with detailed information
  app.get('/status', async (req, res) => {
    try {
      const status = {
        machine: {
          id: config.machine.id,
          type: config.machine.type,
          environment: config.machine.environment,
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          version: '0.1.0'
        },
        redis: {
          status: redisClient?.status,
          connected: redisClient && redisClient.status === 'ready',
          config: {
            host: config.redis.host,
            port: config.redis.port,
            db: config.redis.db
          }
        },
        workers: workers.map(worker => ({
          id: worker.workerId,
          running: worker.isRunning,
          currentJob: worker.currentJob,
          startTime: worker.startTime
        })),
        services: {
          simulation: {
            enabled: config.services.simulation.enabled,
            running: simulationService !== null,
            port: config.services.simulation.port
          }
        }
      };

      res.json(status);
    } catch (error) {
      logger.error('Status endpoint error:', error);
      res.status(500).json({
        error: error.message
      });
    }
  });

  // Ready endpoint (for Railway health checks)
  app.get('/ready', (req, res) => {
    const ready = workers.length > 0 && workers.every(w => w.isRunning);
    res.status(ready ? 200 : 503).json({ ready });
  });

  // Start server
  const server = app.listen(config.server.healthPort, config.server.host, () => {
    logger.info(`Health server listening on ${config.server.host}:${config.server.healthPort}`);
  });

  server.on('error', (error) => {
    logger.error('Health server error:', error);
  });

  return server;
}

/**
 * Graceful shutdown handler
 */
async function shutdown(exitCode = 0) {
  if (isShuttingDown) {
    logger.warn('Shutdown already in progress');
    return;
  }

  isShuttingDown = true;
  logger.info('Shutting down API Machine...');

  try {
    // Stop workers
    logger.info('Stopping workers...');
    const workerStopPromises = workers.map(worker => worker.stop());
    await Promise.all(workerStopPromises);
    
    // Stop simulation service
    if (simulationService) {
      logger.info('Stopping simulation service...');
      await simulationService.stop();
    }
    
    // Close Redis connection
    if (redisClient) {
      logger.info('Closing Redis connection...');
      await redisClient.quit();
    }
    
    logger.info('API Machine shutdown complete');
    process.exit(exitCode);
    
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Signal handlers
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM signal');
  shutdown(0);
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT signal');
  shutdown(0);
});

// Error handlers
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  shutdown(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  shutdown(1);
});

// Start the application
main().catch((error) => {
  logger.error('Fatal error during startup:', error);
  process.exit(1);
});