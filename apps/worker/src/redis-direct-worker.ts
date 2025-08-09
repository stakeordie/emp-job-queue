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
logger.info(`🔧 [DEBUG] Reading WORKER_ID from process.env.WORKER_ID: ${process.env.WORKER_ID}`);
const WORKER_ID = process.env.WORKER_ID;
logger.info(`🔧 [DEBUG] WORKER_ID constant set to: ${WORKER_ID}`);

logger.info(`🔍 WORKER_ID from environment: ${WORKER_ID}`);
logger.info(`🔍 All environment variables: ${JSON.stringify({
  WORKER_ID: process.env.WORKER_ID,
  MACHINE_ID: process.env.MACHINE_ID,
  HUB_REDIS_URL: process.env.HUB_REDIS_URL
})}`);

if (!WORKER_ID) {
  logger.error('WORKER_ID environment variable is required');
  process.exit(1);
}
const HUB_REDIS_URL = process.env.HUB_REDIS_URL || 'redis://localhost:6379';
const MACHINE_ID = process.env.MACHINE_ID || os.hostname();

/**
 * Log comprehensive environment variable resolution for debugging
 * Shows which machine interface variables are resolved and their values
 */
function logEnvironmentVariables() {
  logger.info('🔍 Environment Variable Resolution Report:');

  // Core worker variables
  const coreVars = {
    WORKER_ID: process.env.WORKER_ID,
    MACHINE_ID: process.env.MACHINE_ID,
    HUB_REDIS_URL: process.env.HUB_REDIS_URL,
    NODE_ENV: process.env.NODE_ENV,
    ENV: process.env.ENV,
    CURRENT_ENV: process.env.CURRENT_ENV,
  };

  logger.info('📋 Core Variables:');
  Object.entries(coreVars).forEach(([key, value]) => {
    if (value !== undefined) {
      // Mask sensitive URLs
      const displayValue =
        key.includes('URL') && value ? value.replace(/\/\/[^:]*:[^@]*@/, '//***:***@') : value;
      logger.info(`   ${key}=${displayValue}`);
    } else {
      logger.warn(`   ${key}=<NOT SET>`);
    }
  });

  // Machine Interface Variables - from machine.interface.ts
  const machineInterfaceVars = {
    // Required
    HUB_REDIS_URL: process.env.HUB_REDIS_URL,
    WORKER_BUNDLE_MODE: process.env.WORKER_BUNDLE_MODE,
    UNIFIED_MACHINE_STATUS: process.env.UNIFIED_MACHINE_STATUS,

    // Optional
    MACHINE_HEALTH_PORT: process.env.MACHINE_HEALTH_PORT,
    MACHINE_LOG_LEVEL: process.env.MACHINE_LOG_LEVEL,
    EXPOSE_PORTS: process.env.EXPOSE_PORTS,
    WORKER_WEBSOCKET_AUTH_TOKEN: process.env.WORKER_WEBSOCKET_AUTH_TOKEN,
    WORKER_COMFYUI_REMOTE_TIMEOUT_SECONDS: process.env.WORKER_COMFYUI_REMOTE_TIMEOUT_SECONDS,
    WORKER_COMFYUI_REMOTE_MAX_CONCURRENT_JOBS:
      process.env.WORKER_COMFYUI_REMOTE_MAX_CONCURRENT_JOBS,
    STATIC_MODELS: process.env.STATIC_MODELS,
    COMFYUI_EXPOSE_PORTS: process.env.COMFYUI_EXPOSE_PORTS,
    COMFYUI_EXPOSED_HOST_PORT_BASE: process.env.COMFYUI_EXPOSED_HOST_PORT_BASE,
    COMFYUI_EXPOSED_CONTAINER_PORT_BASE: process.env.COMFYUI_EXPOSED_CONTAINER_PORT_BASE,
    COMFYUI_RESOURCE_BINDING: process.env.COMFYUI_RESOURCE_BINDING,
    OPENAI_IMAGE_MODEL: process.env.OPENAI_IMAGE_MODEL,
    OPENAI_DEBUG: process.env.OPENAI_DEBUG,

    // Defaults
    WORKER_MAX_CONCURRENT_JOBS: process.env.WORKER_MAX_CONCURRENT_JOBS,
    WORKER_HEALTH_CHECK_INTERVAL: process.env.WORKER_HEALTH_CHECK_INTERVAL,
  };

  logger.info('📋 Machine Interface Variables:');
  Object.entries(machineInterfaceVars).forEach(([key, value]) => {
    if (value !== undefined) {
      logger.info(`   ${key}=${value}`);
    } else {
      logger.warn(`   ${key}=<NOT SET>`);
    }
  });

  // Secret Variables (masked values)
  const secretVars = {
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY_ENCODED: process.env.AWS_SECRET_ACCESS_KEY_ENCODED,
    AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION,
    AZURE_STORAGE_ACCOUNT: process.env.AZURE_STORAGE_ACCOUNT,
    AZURE_STORAGE_KEY: process.env.AZURE_STORAGE_KEY,
    CLOUD_PROVIDER: process.env.CLOUD_PROVIDER,
    CLOUD_STORAGE_PROVIDER: process.env.CLOUD_STORAGE_PROVIDER,
    CLOUD_STORAGE_CONTAINER: process.env.CLOUD_STORAGE_CONTAINER,
    CLOUD_CDN_URL: process.env.CLOUD_CDN_URL,
    HF_TOKEN: process.env.HF_TOKEN,
    CIVITAI_TOKEN: process.env.CIVITAI_TOKEN,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OLLAMA_HOST: process.env.OLLAMA_HOST,
    OLLAMA_PORT: process.env.OLLAMA_PORT,
    OLLAMA_DEFAULT_MODEL: process.env.OLLAMA_DEFAULT_MODEL,
    EMPROPS_DEBUG_LOGGING: process.env.EMPROPS_DEBUG_LOGGING,
    WORKER_COMFYUI_REMOTE_HOST: process.env.WORKER_COMFYUI_REMOTE_HOST,
    WORKER_COMFYUI_REMOTE_PORT: process.env.WORKER_COMFYUI_REMOTE_PORT,
    WORKER_COMFYUI_REMOTE_USERNAME: process.env.WORKER_COMFYUI_REMOTE_USERNAME,
    WORKER_COMFYUI_REMOTE_PASSWORD: process.env.WORKER_COMFYUI_REMOTE_PASSWORD,
    AUTH_TOKEN: process.env.AUTH_TOKEN,
  };

  logger.info('🔐 Secret Variables (masked):');
  Object.entries(secretVars).forEach(([key, value]) => {
    if (value !== undefined) {
      // Mask secret values - show first/last few chars for verification
      const maskedValue =
        value.length > 8 ? `${value.slice(0, 4)}***${value.slice(-4)}` : '***MASKED***';
      logger.info(`   ${key}=${maskedValue}`);
    } else {
      logger.warn(`   ${key}=<NOT SET>`);
    }
  });

  // Service-specific variables (OpenAI, ComfyUI, etc.)
  const serviceVars = Object.keys(process.env)
    .filter(
      key =>
        key.startsWith('OPENAI_') ||
        key.startsWith('COMFYUI_') ||
        key.startsWith('SIMULATION_') ||
        key.startsWith('A1111_') ||
        key.startsWith('REPLICATE_') ||
        key.startsWith('OLLAMA_') ||
        key.startsWith('LOG_')
    )
    .filter(key => !machineInterfaceVars.hasOwnProperty(key) && !secretVars.hasOwnProperty(key));

  if (serviceVars.length > 0) {
    logger.info('🔧 Additional Service Variables:');
    serviceVars.forEach(key => {
      const value = process.env[key];
      // Mask potentially sensitive values
      const displayValue =
        (key.includes('TOKEN') || key.includes('KEY') || key.includes('SECRET')) && value
          ? value.length > 8
            ? `${value.slice(0, 4)}***${value.slice(-4)}`
            : '***MASKED***'
          : value;
      logger.info(`   ${key}=${displayValue}`);
    });
  }

  // Summary
  const totalResolved = Object.values({
    ...coreVars,
    ...machineInterfaceVars,
    ...secretVars,
  }).filter(v => v !== undefined).length;
  const totalExpected = Object.keys({ ...coreVars, ...machineInterfaceVars, ...secretVars }).length;

  logger.info(
    `📊 Environment Summary: ${totalResolved}/${totalExpected} expected variables resolved`
  );

  if (totalResolved < totalExpected) {
    logger.warn(
      '⚠️  Some expected environment variables are not set - this may cause configuration issues'
    );
  } else {
    logger.info('✅ All expected environment variables are resolved');
  }
}

async function main() {
  logger.info(`Starting Redis-direct worker ${WORKER_ID} on machine ${MACHINE_ID}  ^^^^^^`);

  // Log comprehensive environment variable resolution
  logEnvironmentVariables();

  logger.info(`Connecting to Redis at: ${HUB_REDIS_URL}`);

  // Initialize connector manager
  const connectorManager = new ConnectorManager();

  // Create Redis-direct worker
  logger.info(`🔧 [DEBUG] Calling RedisDirectBaseWorker constructor with WORKER_ID: ${WORKER_ID}`);
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
