#!/usr/bin/env node
/**
 * Standalone wrapper for services to run directly under PM2
 * This allows services to run without the orchestrator
 */

import { createLogger } from '../utils/logger.js';

const logger = createLogger('standalone-wrapper');

// Parse command line arguments
const args = process.argv.slice(2);
const serviceName = args[0];

if (!serviceName) {
  console.error('Usage: standalone-wrapper <service-name> [options]');
  process.exit(1);
}

// Map service names to their modules
const serviceModules = {
  'redis-worker': './redis-worker-service.js',
  'hello-world': './hello-world-service.js',
  'shared-setup': './shared-setup-service.js',
  'port-cleanup': './port-cleanup-service.js',
  'comfyui': './comfyui-service.js',
  'comfyui-installer': './comfyui-installer.js',
  'simulation': './simulation-service.js',
  'runtime-env-creator': './runtime-env-creator.js'
};

async function runStandaloneService() {
  logger.info(`Starting ${serviceName} in standalone mode...`);

  try {
    // Get module path
    const modulePath = serviceModules[serviceName];
    if (!modulePath) {
      throw new Error(`Unknown service: ${serviceName}`);
    }

    // Import service class
    const { default: ServiceClass } = await import(modulePath);

    // Parse options from environment
    const options = {};
    
    // Add GPU if specified
    if (process.env.GPU_ID !== undefined) {
      const gpuId = parseInt(process.env.GPU_ID);
      options.gpu = isNaN(gpuId) ? 0 : gpuId;
    }

    // Create config object with all required fields
    const config = {
      services: {
        [serviceName]: {
          enabled: true,
          ...parseServiceConfig(serviceName)
        },
        redis: {
          enabled: true
        }
      },
      redis: {
        url: process.env.HUB_REDIS_URL || 'redis://host.docker.internal:6379',
        authToken: process.env.WORKER_WEBSOCKET_AUTH_TOKEN
      },
      machine: {
        id: process.env.MACHINE_ID || process.env.CONTAINER_NAME || 'basic-machine',
        gpu: {
          count: parseInt(process.env.NUM_GPUS || '1') || 1,
          memoryGB: parseInt(process.env.GPU_MEMORY_GB || '16') || 16,
          model: process.env.GPU_MODEL || 'RTX 4090'
        }
      },
      worker: {
        downloadUrl: process.env.WORKER_DOWNLOAD_URL || 'https://github.com/stakeordie/emp-job-queue/releases/latest/download/emp-job-queue-worker.tar.gz',
        useLocalPath: process.env.WORKER_LOCAL_PATH,
        connectors: (process.env.WORKER_CONNECTORS || 'simulation').split(',').map(s => s.trim()).filter(s => s.length > 0)
      },
      logging: {
        level: process.env.LOG_LEVEL || 'info'
      }
    };

    // Add service-specific configuration
    if (serviceName === 'comfyui') {
      config.services.comfyui.basePort = parseInt(process.env.COMFYUI_PORT_START || '8188');
    }

    // Log config for debugging (hide sensitive data)
    const sanitizedConfig = { 
      ...config, 
      redis: { 
        ...config.redis, 
        authToken: config.redis.authToken ? '[REDACTED]' : undefined 
      } 
    };
    console.log('🔧 Standalone wrapper config:', JSON.stringify(sanitizedConfig, null, 2));

    // Validate service class
    if (!ServiceClass) {
      throw new Error(`Service module ${modulePath} does not export a default class`);
    }
    if (typeof ServiceClass !== 'function') {
      throw new Error(`Service module ${modulePath} default export is not a constructor`);
    }

    // Create service with appropriate parameters (hello-world only takes options)
    const service = serviceName === 'hello-world' 
      ? new ServiceClass(options) 
      : new ServiceClass(options, config);

    // Set up signal handlers
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}, shutting down ${serviceName}...`);
      try {
        await service.stop();
        logger.info(`${serviceName} stopped successfully`);
        process.exit(0);
      } catch (error) {
        logger.error(`Error stopping ${serviceName}:`, error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Validate service interface
    if (typeof service.start !== 'function') {
      throw new Error(`Service ${serviceName} does not implement start() method`);
    }

    // Start the service
    await service.start();
    logger.info(`${serviceName} started successfully in standalone mode`);

    // Keep process alive
    process.stdin.resume();

  } catch (error) {
    logger.error(`Failed to start ${serviceName}:`, error);
    process.exit(1);
  }
}

function parseServiceConfig(serviceNameParam) {
  const config = {};
  
  // Parse service-specific environment variables
  const prefix = serviceNameParam.toUpperCase().replace(/-/g, '_');
  
  Object.keys(process.env).forEach(key => {
    if (key.startsWith(prefix + '_')) {
      const configKey = key.substring(prefix.length + 1).toLowerCase();
      config[configKey] = process.env[key];
    }
  });

  return config;
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the service
runStandaloneService();