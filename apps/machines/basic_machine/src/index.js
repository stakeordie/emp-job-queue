#!/usr/bin/env node

import { createLogger } from './utils/logger.js';
import config from './config/environment.js';
import { ServiceOrchestrator } from './orchestrator.js';
import http from 'http';
import { URL } from 'url';

const logger = createLogger('main');

// Global orchestrator instance
let orchestrator = null;

/**
 * Main application entry point
 */
async function main() {
  logger.info('Starting Basic Machine...', {
    version: '0.1.0',
    nodeVersion: process.version,
    gpuCount: config.machine.gpu.count,
    services: Object.entries(config.services)
      .filter(([_, s]) => s.enabled)
      .map(([name]) => name)
  });

  // Create orchestrator
  orchestrator = new ServiceOrchestrator();

  // Set up event handlers
  orchestrator.on('ready', () => {
    logger.info('Basic Machine is ready');
  });

  orchestrator.on('service-error', ({ service, error }) => {
    logger.error(`Service error in ${service}:`, error);
  });

  // Start services
  try {
    await orchestrator.start();
  } catch (error) {
    logger.error('Failed to start Basic Machine:', error);
    process.exit(1);
  }

  // Start health check server
  startHealthServer();

  // Keep process alive
  process.stdin.resume();
}

/**
 * Start health check HTTP server
 */
function startHealthServer() {
  const port = process.env.HEALTH_PORT || 9090;
  
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    try {
      switch (url.pathname) {
        case '/health':
          const health = await orchestrator.checkHealth();
          res.statusCode = health.healthy ? 200 : 503;
          res.end(JSON.stringify(health, null, 2));
          break;

        case '/status':
          const status = orchestrator.getStatus();
          res.statusCode = 200;
          res.end(JSON.stringify(status, null, 2));
          break;

        case '/ready':
          const ready = orchestrator.getStatus().uptime > 0;
          res.statusCode = ready ? 200 : 503;
          res.end(JSON.stringify({ ready }));
          break;

        default:
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'Not found' }));
      }
    } catch (error) {
      logger.error('Health check error:', error);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: error.message }));
    }
  });

  server.listen(port, () => {
    logger.info(`Health check server listening on port ${port}`);
  });

  // Handle server errors
  server.on('error', (error) => {
    logger.error('Health server error:', error);
  });
}

/**
 * Graceful shutdown handler
 */
async function handleShutdown(signal) {
  logger.info(`Received ${signal}, starting graceful shutdown...`);

  if (orchestrator) {
    try {
      await orchestrator.shutdown();
      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  } else {
    process.exit(0);
  }
}

// Register shutdown handlers
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start application
main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});