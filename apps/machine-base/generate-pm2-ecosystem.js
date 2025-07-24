#!/usr/bin/env node
/**
 * Generate PM2 ecosystem config based on machine type and configuration
 * Supports: base, gpu, api, hybrid machine types
 */

import fs from 'fs';
import path from 'path';

const machineType = process.env.MACHINE_TYPE || 'base';
const gpuCount = parseInt(process.env.MACHINE_NUM_GPUS || '0');
const enableComfyUI = process.env.MACHINE_ENABLE_COMFYUI === 'true';
const enableAPI = process.env.MACHINE_ENABLE_API === 'true';
const enableRedisWorker = process.env.MACHINE_ENABLE_REDIS_WORKERS === 'true';

console.log(`Generating PM2 ecosystem config for ${machineType} machine...`);
console.log(`Configuration: GPUs=${gpuCount}, ComfyUI=${enableComfyUI}, API=${enableAPI}, Workers=${enableRedisWorker}`);

const apps = [];

// Shared setup service (required by all machine types)
apps.push({
  name: 'shared-setup',
  script: 'src/services/standalone-wrapper.js',
  args: ['shared-setup'],
  cwd: '/service-manager',
  instances: 1,
  autorestart: false, // Runs once
  max_restarts: 3,
  error_file: '/workspace/logs/shared-setup-error.log',
  out_file: '/workspace/logs/shared-setup-out.log',
  log_file: '/workspace/logs/shared-setup-combined.log',
  merge_logs: true,
  env: {
    NODE_ENV: 'production',
    LOG_LEVEL: 'info',
    MACHINE_TYPE: machineType
  }
});

// ComfyUI services (GPU and hybrid machines)
if ((machineType === 'gpu' || machineType === 'hybrid') && enableComfyUI && gpuCount > 0) {
  console.log(`Adding ComfyUI services for ${gpuCount} GPUs...`);
  
  for (let gpu = 0; gpu < gpuCount; gpu++) {
    apps.push({
      name: `comfyui-gpu${gpu}`,
      script: 'src/services/standalone-wrapper.js',
      args: ['comfyui', `--gpu=${gpu}`],
      cwd: '/service-manager',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '2G',
      restart_delay: 5000,
      error_file: `/workspace/logs/comfyui-gpu${gpu}-error.log`,
      out_file: `/workspace/logs/comfyui-gpu${gpu}-out.log`,
      log_file: `/workspace/logs/comfyui-gpu${gpu}-combined.log`,
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        GPU_INDEX: gpu.toString(),
        CUDA_VISIBLE_DEVICES: gpu.toString(),
        COMFYUI_PORT: (8188 + gpu).toString(),
        COMFYUI_CPU_MODE: process.env.COMFYUI_CPU_MODE || 'false',
        MACHINE_TYPE: machineType
      }
    });
  }
}

// API connector services (API and hybrid machines)
if ((machineType === 'api' || machineType === 'hybrid') && enableAPI) {
  console.log('Adding API connector services...');
  
  const apiConnectors = ['openai', 'replicate', 'runpod'];
  
  apiConnectors.forEach(connector => {
    apps.push({
      name: `${connector}-connector`,
      script: 'src/services/standalone-wrapper.js',
      args: ['api-connector', `--connector=${connector}`],
      cwd: '/service-manager',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '5s',
      max_memory_restart: '512M',
      restart_delay: 3000,
      error_file: `/workspace/logs/${connector}-connector-error.log`,
      out_file: `/workspace/logs/${connector}-connector-out.log`,
      log_file: `/workspace/logs/${connector}-connector-combined.log`,
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        API_CONNECTOR_TYPE: connector,
        MACHINE_TYPE: machineType,
        // Connector-specific configuration
        [`${connector.toUpperCase()}_API_KEY`]: process.env[`${connector.toUpperCase()}_API_KEY`] || '',
        [`${connector.toUpperCase()}_BASE_URL`]: process.env[`${connector.toUpperCase()}_BASE_URL`] || '',
        [`${connector.toUpperCase()}_MAX_CONCURRENT_JOBS`]: process.env[`${connector.toUpperCase()}_MAX_CONCURRENT_JOBS`] || '2'
      }
    });
  });
}

// Redis worker services
if (enableRedisWorker) {
  console.log('Adding Redis worker services...');
  
  // GPU workers (GPU and hybrid machines)
  if ((machineType === 'gpu' || machineType === 'hybrid') && gpuCount > 0) {
    for (let gpu = 0; gpu < gpuCount; gpu++) {
      apps.push({
        name: `redis-worker-gpu${gpu}`,
        script: 'src/services/standalone-wrapper.js',
        args: ['redis-worker', `--gpu=${gpu}`, '--type=gpu'],
        cwd: '/service-manager',
        instances: 1,
        autorestart: true,
        max_restarts: 10,
        min_uptime: '10s',
        max_memory_restart: '1G',
        restart_delay: 3000,
        error_file: `/workspace/logs/redis-worker-gpu${gpu}-error.log`,
        out_file: `/workspace/logs/redis-worker-gpu${gpu}-out.log`,
        log_file: `/workspace/logs/redis-worker-gpu${gpu}-combined.log`,
        merge_logs: true,
        env: {
          NODE_ENV: 'production',
          LOG_LEVEL: 'info',
          GPU_INDEX: gpu.toString(),
          WORKER_ID: `worker-gpu${gpu}`,
          WORKER_TYPE: 'gpu',
          MACHINE_TYPE: machineType,
          // Worker configuration
          HUB_REDIS_URL: process.env.HUB_REDIS_URL || 'redis://localhost:6379',
          MACHINE_ID: process.env.MACHINE_ID || 'unknown',
          CONNECTORS: process.env.WORKER_CONNECTORS || 'simulation,comfyui',
          COMFYUI_HOST: process.env.WORKER_COMFYUI_HOST || 'localhost',
          COMFYUI_PORT: process.env.WORKER_COMFYUI_PORT || (8188 + gpu).toString(),
          WEBSOCKET_AUTH_TOKEN: process.env.WORKER_WEBSOCKET_AUTH_TOKEN || '',
          COMFYUI_TIMEOUT_SECONDS: process.env.WORKER_COMFYUI_TIMEOUT_SECONDS || '300'
        }
      });
    }
  }
  
  // API workers (API and hybrid machines)
  if (machineType === 'api' || machineType === 'hybrid') {
    const apiWorkerCount = parseInt(process.env.API_WORKER_COUNT || '2');
    for (let i = 0; i < apiWorkerCount; i++) {
      apps.push({
        name: `redis-worker-api${i}`,
        script: 'src/services/standalone-wrapper.js',
        args: ['redis-worker', `--worker=${i}`, '--type=api'],
        cwd: '/service-manager',
        instances: 1,
        autorestart: true,
        max_restarts: 10,
        min_uptime: '10s',
        max_memory_restart: '512M',
        restart_delay: 3000,
        error_file: `/workspace/logs/redis-worker-api${i}-error.log`,
        out_file: `/workspace/logs/redis-worker-api${i}-out.log`,
        log_file: `/workspace/logs/redis-worker-api${i}-combined.log`,
        merge_logs: true,
        env: {
          NODE_ENV: 'production',
          LOG_LEVEL: 'info',
          WORKER_ID: `worker-api${i}`,
          WORKER_TYPE: 'api',
          MACHINE_TYPE: machineType,
          // Worker configuration
          HUB_REDIS_URL: process.env.HUB_REDIS_URL || 'redis://localhost:6379',
          MACHINE_ID: process.env.MACHINE_ID || 'unknown',
          CONNECTORS: process.env.API_WORKER_CONNECTORS || 'openai,replicate,runpod',
          WEBSOCKET_AUTH_TOKEN: process.env.WORKER_WEBSOCKET_AUTH_TOKEN || '',
          API_TIMEOUT_SECONDS: process.env.API_TIMEOUT_SECONDS || '120'
        }
      });
    }
  }
}

// Simulation service (for testing - all machine types can have this)
if (process.env.MACHINE_ENABLE_SIMULATION === 'true') {
  console.log('Adding simulation service...');
  
  apps.push({
    name: 'simulation',
    script: 'src/services/standalone-wrapper.js',
    args: ['simulation'],
    cwd: '/service-manager',
    instances: 1,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '5s',
    max_memory_restart: '512M',
    restart_delay: 2000,
    error_file: '/workspace/logs/simulation-error.log',
    out_file: '/workspace/logs/simulation-out.log',
    log_file: '/workspace/logs/simulation-combined.log',
    merge_logs: true,
    env: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'info',
      MACHINE_TYPE: machineType
    }
  });
}

const ecosystemConfig = {
  apps: apps
};

// Write the ecosystem config
const configPath = '/workspace/pm2-ecosystem.config.cjs';
const configContent = `module.exports = ${JSON.stringify(ecosystemConfig, null, 2)};`;

fs.writeFileSync(configPath, configContent);

console.log(`✅ Generated PM2 ecosystem config: ${configPath}`);
console.log(`📊 Services configured for ${machineType} machine: ${apps.length} total`);

// Log service breakdown
const serviceBreakdown = apps.reduce((acc, app) => {
  const category = app.name.includes('gpu') ? 'GPU Services' :
                   app.name.includes('api') ? 'API Services' :
                   app.name.includes('worker') ? 'Worker Services' :
                   app.name.includes('connector') ? 'Connector Services' :
                   'System Services';
  acc[category] = (acc[category] || 0) + 1;
  return acc;
}, {});

Object.entries(serviceBreakdown).forEach(([category, count]) => {
  console.log(`   - ${category}: ${count}`);
});