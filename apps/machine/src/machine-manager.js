#!/usr/bin/env node
/**
 * Unified Machine Entry Point
 * Supports GPU, API, and Hybrid machine types based on MACHINE_TYPE environment variable
 * Provides PM2 service management, Redis communication, and health monitoring
 */

import { createLogger } from './utils/logger.js';
import config from './config/environment.js';
import PM2ServiceManager from './lib/pm2-manager.js';
import { MachineStatusAggregator } from './services/machine-status-aggregator.js';
import HealthServer from './services/health-server.js';

const logger = createLogger('unified-machine');

// Global state
const pm2Manager = new PM2ServiceManager();
let statusAggregator = null;
let healthServer = null;
let startTime = null;

/**
 * Main application entry point
 */
async function main() {
  logger.info('Starting Unified Machine...', {
    version: '1.0.0',
    nodeVersion: process.version,
    machineType: config.machine.type,
    machineId: config.machine.id
  });

  try {
    // Check for existing instances
    await checkForExistingInstance();

    // Clean up any existing PM2 processes
    await cleanupExistingPM2Processes();

    // Generate PM2 ecosystem config based on machine type
    await generatePM2EcosystemConfig();

    startTime = Date.now();

    // Initialize machine status aggregator
    statusAggregator = new MachineStatusAggregator(config);
    await statusAggregator.connect();

    // Start PM2 services
    await startPM2Services();
    
    // Verify services are running
    await verifyPM2Services();

    // Start health server
    healthServer = new HealthServer(config, pm2Manager, statusAggregator);
    await healthServer.start();
    
    const startupTime = Date.now() - startTime;
    logger.info(`Unified Machine ready (${startupTime}ms)`, {
      machineType: config.machine.type,
      servicesStarted: await pm2Manager.list()
    });

  } catch (error) {
    logger.error('Failed to start Unified Machine:', error);
    process.exit(1);
  }
}

/**
 * Start PM2 services based on machine configuration
 */
async function startPM2Services() {
  logger.info('Starting PM2 services...');
  
  try {
    // Start PM2 daemon
    await pm2Manager.pm2Exec('ping');
    logger.info('PM2 daemon ready');
    
    // Start shared setup first (required by all machine types)
    await pm2Manager.pm2Exec('start /workspace/pm2-ecosystem.config.cjs --only shared-setup');
    logger.info('Shared setup service started');
    
    // Wait for shared setup to complete
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Start machine-specific services
    const machineType = config.machine.type;
    
    if (machineType === 'gpu' || machineType === 'hybrid') {
      await startGPUServices();
    }
    
    if (machineType === 'api' || machineType === 'hybrid') {
      await startAPIServices();
    }
    
    // Start workers last (after services are ready)
    await startWorkerServices();
    
    // Save process list
    await pm2Manager.pm2Exec('save');
    logger.info('PM2 process list saved');
    
  } catch (error) {
    logger.error('Failed to start PM2 services:', error);
    throw error;
  }
}

/**
 * Start GPU-specific services (ComfyUI)
 */
async function startGPUServices() {
  if (!config.services?.comfyui?.enabled) {
    logger.info('ComfyUI services disabled, skipping...');
    return;
  }

  logger.info('Starting GPU services...');
  
  const gpuCount = config.machine.gpu.count;
  
  // Start ComfyUI instances (per GPU)
  const comfyuiServices = [];
  for (let gpu = 0; gpu < gpuCount; gpu++) {
    comfyuiServices.push(`comfyui-gpu${gpu}`);
  }
  
  if (comfyuiServices.length > 0) {
    await pm2Manager.pm2Exec(`start /workspace/pm2-ecosystem.config.cjs --only ${comfyuiServices.join(',')}`);
    logger.info(`ComfyUI services started: ${comfyuiServices.join(', ')}`);
    
    // Wait for ComfyUI services to initialize
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

/**
 * Start API-specific services (API connectors)
 */
async function startAPIServices() {
  if (!config.services?.api?.enabled) {
    logger.info('API services disabled, skipping...');
    return;
  }

  logger.info('Starting API services...');
  
  // Start API connector services
  const apiServices = ['openai-connector', 'replicate-connector', 'runpod-connector']
    .filter(service => config.services.api.connectors?.includes(service.replace('-connector', '')));
  
  if (apiServices.length > 0) {
    await pm2Manager.pm2Exec(`start /workspace/pm2-ecosystem.config.cjs --only ${apiServices.join(',')}`);
    logger.info(`API services started: ${apiServices.join(', ')}`);
    
    // Wait for API services to initialize
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
}

/**
 * Start worker services
 */
async function startWorkerServices() {
  if (!config.services?.redisWorker?.enabled) {
    logger.info('Redis workers disabled, skipping...');
    return;
  }

  logger.info('Starting worker services...');
  
  const machineType = config.machine.type;
  const workerServices = [];
  
  if (machineType === 'gpu' || machineType === 'hybrid') {
    const gpuCount = config.machine.gpu.count;
    for (let gpu = 0; gpu < gpuCount; gpu++) {
      workerServices.push(`redis-worker-gpu${gpu}`);
    }
  }
  
  if (machineType === 'api' || machineType === 'hybrid') {
    const apiWorkerCount = config.services?.api?.workerCount || 2;
    for (let i = 0; i < apiWorkerCount; i++) {
      workerServices.push(`redis-worker-api${i}`);
    }
  }
  
  if (workerServices.length > 0) {
    await pm2Manager.pm2Exec(`start /workspace/pm2-ecosystem.config.cjs --only ${workerServices.join(',')}`);
    logger.info(`Worker services started: ${workerServices.join(', ')}`);
  }
}

/**
 * Verify all PM2 services are running
 */
async function verifyPM2Services() {
  logger.info('Verifying PM2 services...');

  try {
    const services = await pm2Manager.getAllServicesStatus();
    
    services.forEach(service => {
      logger.info(`Service ${service.name}: ${service.status}`, {
        pid: service.pid,
        memory: service.memory,
        uptime: service.uptime
      });
    });

    const offlineServices = services.filter(s => s.status !== 'online');
    if (offlineServices.length > 0) {
      logger.warn('Some services are not online:', offlineServices.map(s => s.name));
      
      for (const service of offlineServices) {
        logger.info(`Attempting to start ${service.name}...`);
        try {
          await pm2Manager.restartService(service.name);
        } catch (error) {
          logger.error(`Failed to start ${service.name}:`, error);
        }
      }
    }

  } catch (error) {
    logger.error('Failed to verify PM2 services:', error);
    throw error;
  }
}

/**
 * Generate PM2 ecosystem config based on machine type
 */
async function generatePM2EcosystemConfig() {
  try {
    logger.info('Generating PM2 ecosystem config...', {
      machineType: config.machine.type,
      services: config.services
    });
    
    const { execa } = await import('execa');
    await execa('node', ['src/config/ecosystem-generator.js'], {
      cwd: '/workspace',
      env: {
        ...process.env,
        MACHINE_TYPE: config.machine.type,
        MACHINE_NUM_GPUS: config.machine.gpu.count.toString(),
        MACHINE_ENABLE_COMFYUI: config.services?.comfyui?.enabled ? 'true' : 'false',
        MACHINE_ENABLE_API: config.services?.api?.enabled ? 'true' : 'false',
        MACHINE_ENABLE_REDIS_WORKERS: config.services?.redisWorker?.enabled ? 'true' : 'false'
      }
    });
    
    logger.info('PM2 ecosystem config generated successfully');
    
  } catch (error) {
    logger.error('Failed to generate PM2 ecosystem config:', error);
    throw error;
  }
}

/**
 * Clean up existing PM2 processes
 */
async function cleanupExistingPM2Processes() {
  try {
    logger.info('Checking for existing PM2 processes...');
    
    try {
      await pm2Manager.pm2Exec('ping');
      logger.debug('PM2 daemon is responsive');
    } catch (error) {
      logger.info('PM2 daemon not running, will be started automatically');
      return;
    }
    
    const processes = await pm2Manager.list();
    
    if (Array.isArray(processes) && processes.length > 0) {
      logger.warn(`Found ${processes.length} existing PM2 processes, cleaning up...`);
      await pm2Manager.killAll();
      logger.info('Cleaned up existing PM2 processes');
      await new Promise(resolve => setTimeout(resolve, 3000));
    } else {
      logger.debug('No existing PM2 processes found');
    }
  } catch (error) {
    logger.warn('Could not cleanup existing PM2 processes:', error.message);
  }
}

/**
 * Check for existing instances
 */
async function checkForExistingInstance() {
  const healthPort = parseInt(process.env.MACHINE_HEALTH_PORT || '9090');
  
  try {
    const response = await fetch(`http://localhost:${healthPort}/health`, {
      method: 'GET',
      timeout: 2000
    });
    
    if (response.ok) {
      const health = await response.json();
      logger.warn('Found existing instance running:', health);
      logger.warn('This might indicate multiple instances - continuing anyway...');
    }
  } catch (error) {
    logger.debug('No existing instance detected on health port');
  }
}

/**
 * Graceful shutdown handler
 */
async function handleShutdown(signal) {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  
  try {
    // Send shutdown event to Redis first
    if (statusAggregator) {
      logger.info('Sending shutdown event to Redis...');
      await statusAggregator.shutdown();
    }
    
    // Stop health server
    if (healthServer) {
      logger.info('Stopping health server...');
      await healthServer.stop();
    }
    
    // Stop PM2 services
    logger.info('Stopping PM2 services...');
    await pm2Manager.pm2Exec('kill');
    
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

// Error handlers
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