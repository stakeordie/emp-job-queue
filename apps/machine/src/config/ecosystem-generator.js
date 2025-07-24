#!/usr/bin/env node
/**
 * Dynamic PM2 Ecosystem Generator
 * Generates PM2 configuration based on MACHINE_TYPE and available resources
 */

import fs from 'fs';
import path from 'path';

const machineType = process.env.MACHINE_TYPE || 'gpu';
const numGpus = parseInt(process.env.MACHINE_NUM_GPUS || '1');
const enableComfyUI = process.env.MACHINE_ENABLE_COMFYUI === 'true';
const enableAPI = process.env.MACHINE_ENABLE_API === 'true';
const enableRedisWorkers = process.env.MACHINE_ENABLE_REDIS_WORKERS === 'true';
const apiWorkerCount = parseInt(process.env.MACHINE_API_WORKER_COUNT || '2');

console.log('Generating PM2 ecosystem config...', {
  machineType,
  numGpus,
  enableComfyUI,
  enableAPI,
  enableRedisWorkers,
  apiWorkerCount
});

/**
 * Generate base services (always included)
 */
function generateBaseServices() {
  return [
    {
      name: 'shared-setup',
      script: '/workspace/src/services/shared/shared-setup-service.js',
      interpreter: 'node',
      args: [],
      env: {
        NODE_ENV: process.env.NODE_ENV || 'production',
        MACHINE_TYPE: machineType,
        MACHINE_ID: process.env.MACHINE_ID || 'unified-machine-local'
      },
      autorestart: false,  // Run once and exit
      max_restarts: 3,
      min_uptime: '10s',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      out_file: '/workspace/logs/shared-setup-out.log',
      error_file: '/workspace/logs/shared-setup-error.log',
      combine_logs: true,
      log_file: '/workspace/logs/shared-setup-combined.log'
    },
    {
      name: 'simulation',
      script: '/workspace/src/services/shared/simulation-service.js',  
      interpreter: 'node',
      args: [],
      env: {
        NODE_ENV: process.env.NODE_ENV || 'production',
        MACHINE_TYPE: machineType,
        MACHINE_ID: process.env.MACHINE_ID || 'unified-machine-local',
        SIMULATION_PORT: process.env.SIMULATION_PORT || '8080'
      },
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      out_file: '/workspace/logs/simulation-out.log',
      error_file: '/workspace/logs/simulation-error.log',
      combine_logs: true,
      log_file: '/workspace/logs/simulation-combined.log'
    }
  ];
}

/**
 * Generate ComfyUI services (GPU machines)
 */
function generateComfyUIServices() {
  if (!enableComfyUI || (machineType !== 'gpu' && machineType !== 'hybrid')) {
    return [];
  }

  const services = [];
  
  for (let gpu = 0; gpu < numGpus; gpu++) {
    services.push({
      name: `comfyui-gpu${gpu}`,
      script: '/workspace/src/services/comfyui/comfyui-service.js',
      interpreter: 'node',
      args: [],
      env: {
        NODE_ENV: process.env.NODE_ENV || 'production',
        MACHINE_TYPE: machineType,
        MACHINE_ID: process.env.MACHINE_ID || 'unified-machine-local',
        GPU_ID: gpu.toString(),
        CUDA_VISIBLE_DEVICES: gpu.toString(),
        COMFYUI_PORT: (8188 + gpu).toString(),
        COMFYUI_GPU_ID: gpu.toString(),
        COMFYUI_LISTEN: '0.0.0.0',
        COMFYUI_ENABLE_CORS_HEADER: '*',
        COMFYUI_AUTO_LAUNCH_BROWSER: 'false'
      },
      autorestart: true,
      max_restarts: 10,
      min_uptime: '30s',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      out_file: `/workspace/logs/comfyui-gpu${gpu}-out.log`,
      error_file: `/workspace/logs/comfyui-gpu${gpu}-error.log`,
      combine_logs: true,
      log_file: `/workspace/logs/comfyui-gpu${gpu}-combined.log`
    });
  }

  return services;
}

/**
 * Generate API connector services (API machines)
 */
function generateAPIServices() {
  if (!enableAPI || (machineType !== 'api' && machineType !== 'hybrid')) {
    return [];
  }

  const services = [];
  const apiConnectors = process.env.MACHINE_API_CONNECTORS?.split(',') || ['openai', 'replicate', 'runpod'];

  apiConnectors.forEach(connector => {
    services.push({
      name: `${connector}-connector`,
      script: `/workspace/src/services/api-connectors/${connector}-connector.js`,
      interpreter: 'node',
      args: [],
      env: {
        NODE_ENV: process.env.NODE_ENV || 'production',
        MACHINE_TYPE: machineType,
        MACHINE_ID: process.env.MACHINE_ID || 'unified-machine-local',
        CONNECTOR_TYPE: connector,
        // API-specific environment variables
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN,
        RUNPOD_API_KEY: process.env.RUNPOD_API_KEY
      },
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      out_file: `/workspace/logs/${connector}-connector-out.log`,
      error_file: `/workspace/logs/${connector}-connector-error.log`,
      combine_logs: true,
      log_file: `/workspace/logs/${connector}-connector-combined.log`
    });
  });

  return services;
}

/**
 * Generate Redis worker services
 */
function generateRedisWorkerServices() {
  if (!enableRedisWorkers) {
    return [];
  }

  const services = [];

  // GPU workers
  if (enableComfyUI && (machineType === 'gpu' || machineType === 'hybrid')) {
    for (let gpu = 0; gpu < numGpus; gpu++) {
      services.push({
        name: `redis-worker-gpu${gpu}`,
        script: '/workspace/src/services/shared/redis-worker-service.js',
        interpreter: 'node',
        args: [],
        env: {
          NODE_ENV: process.env.NODE_ENV || 'production',
          MACHINE_TYPE: machineType,
          MACHINE_ID: process.env.MACHINE_ID || 'unified-machine-local',
          WORKER_TYPE: 'gpu',
          WORKER_ID: `gpu${gpu}`,
          GPU_ID: gpu.toString(),
          CUDA_VISIBLE_DEVICES: gpu.toString(),
          COMFYUI_PORT: (8188 + gpu).toString(),
          REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379'
        },
        autorestart: true,
        max_restarts: 10,
        min_uptime: '10s',
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        merge_logs: true,
        out_file: `/workspace/logs/redis-worker-gpu${gpu}-out.log`,
        error_file: `/workspace/logs/redis-worker-gpu${gpu}-error.log`,
        combine_logs: true,
        log_file: `/workspace/logs/redis-worker-gpu${gpu}-combined.log`
      });
    }
  }

  // API workers
  if (enableAPI && (machineType === 'api' || machineType === 'hybrid')) {
    for (let i = 0; i < apiWorkerCount; i++) {
      services.push({
        name: `redis-worker-api${i}`,
        script: '/workspace/src/services/shared/redis-worker-service.js',
        interpreter: 'node',
        args: [],
        env: {
          NODE_ENV: process.env.NODE_ENV || 'production',
          MACHINE_TYPE: machineType,
          MACHINE_ID: process.env.MACHINE_ID || 'unified-machine-local',
          WORKER_TYPE: 'api',
          WORKER_ID: `api${i}`,
          REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379'
        },
        autorestart: true,
        max_restarts: 10,
        min_uptime: '10s',
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        merge_logs: true,
        out_file: `/workspace/logs/redis-worker-api${i}-out.log`,
        error_file: `/workspace/logs/redis-worker-api${i}-error.log`,
        combine_logs: true,
        log_file: `/workspace/logs/redis-worker-api${i}-combined.log`
      });
    }
  }

  return services;
}

/**
 * Generate complete PM2 ecosystem
 */
function generateEcosystem() {
  const apps = [
    ...generateBaseServices(),
    ...generateComfyUIServices(),
    ...generateAPIServices(),
    ...generateRedisWorkerServices()
  ];

  const ecosystem = {
    apps: apps
  };

  return ecosystem;
}

/**
 * Main execution
 */
function main() {
  try {
    const ecosystem = generateEcosystem();
    
    console.log(`Generated ecosystem with ${ecosystem.apps.length} services:`, 
      ecosystem.apps.map(app => app.name).join(', ')
    );

    // Write the ecosystem config
    const workspaceDir = process.env.NODE_ENV === 'development' ? '.' : '/workspace';
    const configPath = path.join(workspaceDir, 'pm2-ecosystem.config.cjs');
    const configContent = `module.exports = ${JSON.stringify(ecosystem, null, 2)};`;
    
    fs.writeFileSync(configPath, configContent);
    console.log(`Ecosystem config written to: ${configPath}`);

    // Also write a JSON version for easier inspection
    const jsonPath = path.join(workspaceDir, 'pm2-ecosystem.json');
    fs.writeFileSync(jsonPath, JSON.stringify(ecosystem, null, 2));
    console.log(`Ecosystem JSON written to: ${jsonPath}`);

    process.exit(0);
  } catch (error) {
    console.error('Failed to generate ecosystem:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}