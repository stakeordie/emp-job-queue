#!/usr/bin/env node
/**
 * PM2-aware entry point for Basic Machine
 * This version works with PM2 to manage all services
 */

import { createLogger } from './utils/logger.js';
import config from './config/environment.js';
import PM2ServiceManager from './lib/pm2-manager.cjs';
console.log("🔥🔥🔥 TOTALLY NEW VERSION LOADED - NO CACHE 🔥🔥🔥");
import http from 'http';
import { URL } from 'url';
import { RedisStartupNotifier } from './services/redis-startup-notifier.js';

const logger = createLogger('main-pm2');

// PM2 manager instance
const pm2Manager = new PM2ServiceManager();
const startupNotifier = new RedisStartupNotifier(config);
let startTime = null;

/**
 * Main application entry point - PM2 mode
 */
async function main() {
  logger.info('Starting Basic Machine in PM2 mode...', {
    version: '0.1.0',
    nodeVersion: process.version,
    gpuCount: config.machine.gpu.count,
    pm2Mode: true
  });

  startTime = Date.now();

  try {
    // Initialize Redis startup notifier
    await startupNotifier.connect();

    // Check if we're running under PM2
    const isPM2 = process.env.PM2_HOME || process.env.pm_id !== undefined;
    if (!isPM2) {
      logger.warn('Not running under PM2, but PM2 mode is enabled');
    }

    // Start PM2 services from ecosystem config
    logger.info('Starting PM2 services from ecosystem config...');
    await startPM2Services();
    
    // Verify services are running and healthy
    await verifyPM2Services();

    // Start health check server
    startHealthServer();

    // Notify startup complete
    const startupTime = Date.now() - startTime;
    logger.info(`Basic Machine ready in PM2 mode (${startupTime}ms)`);
    await startupNotifier.notifyStartupComplete();

  } catch (error) {
    logger.error('Failed to start Basic Machine:', error);
    await startupNotifier.notifyStartupFailed(error);
    process.exit(1);
  }
}

/**
 * Start PM2 services from ecosystem config
 */
async function startPM2Services() {
  logger.info('Starting PM2 daemon and services...');
  
  try {
    // Start PM2 daemon
    await pm2Manager.pm2Exec('ping');
    logger.info('PM2 daemon started');
    
    // Start services from ecosystem config in proper order: shared-setup -> comfyui-installer -> workers
    // First start shared setup
    await pm2Manager.pm2Exec('start /workspace/pm2-ecosystem.config.cjs --only shared-setup');
    logger.info('Shared setup service started');
    
    // Wait for shared setup to complete
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Start ComfyUI installer if enabled
    const enableComfyUI = process.env.ENABLE_COMFYUI === 'true';
    if (enableComfyUI) {
      await pm2Manager.pm2Exec('start /workspace/pm2-ecosystem.config.cjs --only comfyui-installer');
      logger.info('ComfyUI installer service started');
      
      // Wait for ComfyUI installation to complete
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Start ComfyUI service instances (per GPU)
      const gpuCount = parseInt(process.env.NUM_GPUS || '2');
      const comfyuiServices = [];
      for (let gpu = 0; gpu < gpuCount; gpu++) {
        comfyuiServices.push(`comfyui-gpu${gpu}`);
      }
      
      if (comfyuiServices.length > 0) {
        await pm2Manager.pm2Exec(`start /workspace/pm2-ecosystem.config.cjs --only ${comfyuiServices.join(',')}`);
        logger.info(`ComfyUI service instances started: ${comfyuiServices.join(', ')}`);
      }
    }
    
    // Start worker services
    await pm2Manager.pm2Exec('start /workspace/pm2-ecosystem.config.cjs --only redis-worker-gpu0,redis-worker-gpu1');
    logger.info('Worker services started from ecosystem config');
    
    // Save process list
    await pm2Manager.pm2Exec('save');
    logger.info('PM2 process list saved');
    
    // Wait a moment for services to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
  } catch (error) {
    logger.error('Failed to start PM2 services:', error);
    throw error;
  }
}

/**
 * Verify all PM2 services are running
 */
async function verifyPM2Services() {
  logger.info('Verifying PM2 services...');

  try {
    const services = await pm2Manager.getAllServicesStatus();
    
    // Log service status
    services.forEach(service => {
      logger.info(`Service ${service.name}: ${service.status}`, {
        pid: service.pid,
        memory: service.memory,
        cpu: service.cpu,
        uptime: service.uptime
      });
    });

    // Check if any services are not online
    const offlineServices = services.filter(s => s.status !== 'online');
    if (offlineServices.length > 0) {
      logger.warn('Some services are not online:', offlineServices.map(s => s.name));
      
      // Try to start offline services
      for (const service of offlineServices) {
        logger.info(`Attempting to start ${service.name}...`);
        try {
          await pm2Manager.restartService(service.name);
        } catch (error) {
          logger.error(`Failed to start ${service.name}:`, error);
        }
      }
    }

    // Individual service notifications removed - only single startup_complete event sent

  } catch (error) {
    logger.error('Failed to verify PM2 services:', error);
    throw error;
  }
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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.statusCode = 200;
      res.end();
      return;
    }

    try {
      switch (url.pathname) {
        case '/health':
          const health = await checkSystemHealth();
          res.statusCode = health.healthy ? 200 : 503;
          res.end(JSON.stringify(health, null, 2));
          break;

        case '/status':
          const status = await getSystemStatus();
          res.statusCode = 200;
          res.end(JSON.stringify(status, null, 2));
          break;

        case '/ready':
          const ready = startTime !== null;
          res.statusCode = ready ? 200 : 503;
          res.end(JSON.stringify({ ready }));
          break;

        case '/pm2/list':
          const services = await pm2Manager.getAllServicesStatus();
          res.statusCode = 200;
          res.end(JSON.stringify(services, null, 2));
          break;

        case '/pm2/logs':
          const serviceName = url.searchParams.get('service');
          const lines = parseInt(url.searchParams.get('lines') || '50');
          if (serviceName) {
            const logs = await pm2Manager.getServiceLogs(serviceName, lines);
            res.statusCode = 200;
            res.end(logs);
          } else {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Service name required' }));
          }
          break;

        case '/restart/machine':
          if (req.method === 'POST') {
            logger.info('🔄 Machine restart requested via API');
            res.statusCode = 200;
            res.end(JSON.stringify({ message: 'Machine restart initiated' }));
            
            // Schedule restart after response is sent
            setTimeout(async () => {
              try {
                logger.info('🔄 Executing machine restart...');
                
                // Send shutdown event to Redis first
                await startupNotifier.notifyShutdown('API restart request');
                
                // Exit container - Docker/PM2 will handle restart
                process.exit(0);
              } catch (error) {
                logger.error('❌ Error during machine restart:', error);
                process.exit(1);
              }
            }, 100);
          } else {
            res.statusCode = 405;
            res.end(JSON.stringify({ error: 'Method not allowed' }));
          }
          break;

        case '/restart/service':
          if (req.method === 'POST') {
            const serviceToRestart = url.searchParams.get('service');
            if (serviceToRestart) {
              try {
                logger.info(`🔄 Restarting PM2 service: ${serviceToRestart}`);
                await pm2Manager.restartService(serviceToRestart);
                res.statusCode = 200;
                res.end(JSON.stringify({ message: `Service ${serviceToRestart} restarted successfully` }));
              } catch (error) {
                logger.error(`❌ Error restarting service ${serviceToRestart}:`, error);
                res.statusCode = 500;
                res.end(JSON.stringify({ error: `Failed to restart service: ${error.message}` }));
              }
            } else {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Service name required' }));
            }
          } else {
            res.statusCode = 405;
            res.end(JSON.stringify({ error: 'Method not allowed' }));
          }
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

  server.on('error', (error) => {
    logger.error('Health server error:', error);
  });
}

/**
 * Check overall system health
 */
async function checkSystemHealth() {
  const health = {
    healthy: true,
    services: {},
    uptime: startTime ? Date.now() - startTime : 0
  };

  try {
    // Get PM2 service status
    const services = await pm2Manager.getAllServicesStatus();
    
    for (const service of services) {
      const isHealthy = service.status === 'online';
      health.services[service.name] = {
        healthy: isHealthy,
        status: service.status,
        pid: service.pid,
        restarts: service.restarts
      };
      
      if (!isHealthy) {
        health.healthy = false;
      }
    }

    // Check Redis notifier
    const redisHealth = await startupNotifier.healthCheck();
    health.services['redis-notifier'] = {
      healthy: redisHealth.healthy,
      error: redisHealth.error
    };
    
    if (!redisHealth.healthy) {
      health.healthy = false;
    }

  } catch (error) {
    logger.error('Health check failed:', error);
    health.healthy = false;
    health.error = error.message;
  }

  return health;
}

/**
 * Get system status
 */
async function getSystemStatus() {
  const status = {
    version: '0.1.0',
    uptime: startTime ? Date.now() - startTime : 0,
    pm2Mode: true,
    services: {}
  };

  try {
    const services = await pm2Manager.getAllServicesStatus();
    services.forEach(service => {
      status.services[service.name] = service;
    });
  } catch (error) {
    logger.error('Failed to get service status:', error);
    status.error = error.message;
  }

  return status;
}

/**
 * Graceful shutdown handler
 */
async function handleShutdown(signal) {
  logger.info(`🔴 Received ${signal}, IMMEDIATELY sending shutdown event to Redis...`);
  
  const shutdownReason = signal === 'SIGTERM' 
    ? 'Docker container shutdown' 
    : 'Manual interruption';
  
  // Set shutdown reason for child processes to inherit
  process.env.SHUTDOWN_REASON = shutdownReason;

  try {
    // CRITICAL: Send shutdown event to Redis FIRST, before anything else
    logger.info(`🚨 PRIORITY: Sending shutdown event to Redis before any other shutdown actions`);
    await startupNotifier.notifyShutdown(shutdownReason);
    logger.info(`✅ Shutdown event sent to Redis successfully`);
    
    // Small delay to ensure the event is transmitted
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // For elastic scaling: Return jobs to queue immediately, don't wait
    logger.info('🔄 Returning active jobs to queue for redistribution...');
    
    // Stop PM2 services quickly
    logger.info('🛑 Stopping PM2 services...');
    try {
      // Just kill everything quickly - we're ephemeral
      await pm2Manager.pm2Exec('kill');
      logger.info('✅ PM2 daemon killed');
    } catch (error) {
      logger.warn('⚠️ Error stopping PM2:', error.message);
      // Don't wait, just exit
    }
    
    // Now disconnect and exit
    await startupNotifier.disconnect();
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Error during shutdown:', error);
    // Even if shutdown notification fails, we should still exit
    process.exit(1);
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