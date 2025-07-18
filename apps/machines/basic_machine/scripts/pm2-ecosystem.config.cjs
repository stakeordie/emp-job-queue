// PM2 Ecosystem Configuration for Basic Machine
// Manages all services through PM2 instead of manual process management

const fs = require('fs');
const path = require('path');

// Load environment configuration
const configPath = '/service-manager/src/config/environment.js';
let config = {};
try {
  // Since we're in CommonJS context, we need to handle ES modules differently
  config = {};
} catch (e) {
  console.warn('Could not load config, using defaults');
}

// Helper to generate service configurations
function generateServiceConfig(serviceName, serviceOptions = {}) {
  const baseConfig = {
    cwd: '/service-manager',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    time: true,
    merge_logs: true,
    kill_timeout: 1000, // 1 second - we return jobs immediately for elastic scaling
    shutdown_with_message: true,
    listen_timeout: 3000,
    kill_retry_time: 100,
    env: {
      NODE_ENV: process.env.NODE_ENV || 'production',
      SERVICE_MANAGER_PATH: '/service-manager',
      WORKSPACE_PATH: '/workspace',
      ...serviceOptions.env
    }
  };

  // Add GPU-specific environment if provided
  if (serviceOptions.gpu !== undefined) {
    baseConfig.env.GPU_ID = serviceOptions.gpu;
    baseConfig.env.CUDA_VISIBLE_DEVICES = serviceOptions.gpu;
    baseConfig.name = `${serviceName}-gpu${serviceOptions.gpu}`;
  } else {
    baseConfig.name = serviceName;
  }

  // Set log files
  baseConfig.error_file = `/workspace/logs/${baseConfig.name}-error.log`;
  baseConfig.out_file = `/workspace/logs/${baseConfig.name}-out.log`;
  baseConfig.log_file = `/workspace/logs/${baseConfig.name}-combined.log`;

  return baseConfig;
}

// Build apps configuration
const apps = [];

// NOTE: No orchestrator service needed - index-pm2.js IS the orchestrator
// and runs as the main container process (PID 1)

// Add services based on configuration

// Redis Worker Services (per GPU) - disabled for testing PM2 without dependencies
const gpuCount = parseInt(process.env.NUM_GPUS || process.env.WORKER_NUM_GPUS || '1');
if (process.env.ENABLE_REDIS_WORKERS === 'true') {
  for (let gpu = 0; gpu < gpuCount; gpu++) {
    apps.push({
      ...generateServiceConfig('redis-worker', { gpu }),
      script: '/service-manager/src/services/standalone-wrapper.js',
      interpreter: 'node',
      args: ['redis-worker'],
      max_memory_restart: '2G',
      kill_timeout: 1000, // Fast shutdown for elastic scaling
      env: {
        ...generateServiceConfig('redis-worker', { gpu }).env,
        STANDALONE_MODE: 'true',
        WORKER_ID: `${process.env.WORKER_ID || 'basic-machine'}-gpu${gpu}`,
        USE_LOCAL_WORKER: 'true',
        // Use remote ComfyUI configuration if specified, otherwise map local ComfyUI port for this GPU
        WORKER_COMFYUI_HOST: process.env.WORKER_COMFYUI_HOST,
        WORKER_COMFYUI_PORT: process.env.WORKER_COMFYUI_PORT || (parseInt(process.env.COMFYUI_PORT_START || '8188') + gpu),
        WORKER_COMFYUI_USERNAME: process.env.WORKER_COMFYUI_USERNAME,
        WORKER_COMFYUI_PASSWORD: process.env.WORKER_COMFYUI_PASSWORD,
        WORKER_COMFYUI_TIMEOUT_SECONDS: process.env.WORKER_COMFYUI_TIMEOUT_SECONDS,
        WORKER_COMFYUI_MAX_CONCURRENT_JOBS: process.env.WORKER_COMFYUI_MAX_CONCURRENT_JOBS
      }
    });
  }
}

// Hello World Service (example service)
if (process.env.ENABLE_HELLO_WORLD === 'true') {
  apps.push({
    ...generateServiceConfig('hello-world'),
    script: '/service-manager/src/services/standalone-wrapper.js',
    interpreter: 'node',
    args: ['hello-world'],
    max_memory_restart: '500M',
    env: {
      ...generateServiceConfig('hello-world').env,
      STANDALONE_MODE: 'true',
      HELLO_INTERVAL: process.env.HELLO_INTERVAL || 5000
    }
  });
}

// Shared Setup Service (runs once at startup)
apps.push({
  ...generateServiceConfig('shared-setup'),
  script: '/service-manager/src/services/standalone-wrapper.js',
  interpreter: 'node',
  args: ['shared-setup'],
  max_memory_restart: '500M',
  autorestart: false, // Run once
  env: {
    ...generateServiceConfig('shared-setup').env,
    STANDALONE_MODE: 'true'
  }
});

// NOTE: runtime-env-creator is now run in the entrypoint script before PM2 starts
// This ensures .env files are created before any services that need them

// ComfyUI Installer Service - DISABLED (now runs at build-time)
// Custom nodes and ComfyUI are pre-installed in the Docker image
// if (process.env.ENABLE_COMFYUI === 'true') {
//   apps.push({
//     ...generateServiceConfig('comfyui-installer'),
//     script: '/service-manager/src/services/standalone-wrapper.js',
//     interpreter: 'node',
//     args: ['comfyui-installer'],
//     max_memory_restart: '1G',
//     autorestart: false, // Run once for installation
//     env: {
//       ...generateServiceConfig('comfyui-installer').env,
//       STANDALONE_MODE: 'true',
//       COMFYUI_REPO_URL: process.env.COMFYUI_REPO_URL,
//       COMFYUI_BRANCH: process.env.COMFYUI_BRANCH,
//       COMFYUI_COMMIT: process.env.COMFYUI_COMMIT,
//       COMFYUI_PORT_START: process.env.COMFYUI_PORT_START,
//       WORKSPACE_PATH: process.env.WORKSPACE_PATH || '/workspace'
//     }
//   });
// }

// ComfyUI Service Instances (per GPU) - only if ComfyUI is enabled
if (process.env.ENABLE_COMFYUI === 'true') {
  for (let gpu = 0; gpu < gpuCount; gpu++) {
    const basePort = parseInt(process.env.COMFYUI_PORT_START || '8188');
    apps.push({
      ...generateServiceConfig('comfyui', { gpu }),
      script: '/service-manager/src/services/standalone-wrapper.js',
      interpreter: 'node',
      args: ['comfyui'],
      max_memory_restart: '4G', // ComfyUI can use more memory
      env: {
        ...generateServiceConfig('comfyui', { gpu }).env,
        STANDALONE_MODE: 'true',
        COMFYUI_PORT: basePort + gpu,
        COMFYUI_WORK_DIR: `/workspace/ComfyUI`
      }
    });
  }
}

// Simulation Service - ComfyUI-compatible simulation server
console.log('ENABLE_SIMULATION check:',
process.env.ENABLE_SIMULATION, 'type:',
typeof process.env.ENABLE_SIMULATION);
if (process.env.ENABLE_SIMULATION === 'true') {
  const simulationPort = parseInt(process.env.SIMULATION_PORT || '8299');
  console.log('Adding simulation service to PM2 apps, port:', simulationPort);
  const simulationConfig = {
    ...generateServiceConfig('simulation'),
    script: '/service-manager/src/services/standalone-wrapper.js',
    interpreter: 'node',
    args: ['simulation'],
    max_memory_restart: '1G',
    env: {
      ...generateServiceConfig('simulation').env,
      STANDALONE_MODE: 'true',
      SIMULATION_PORT: simulationPort,
      SIMULATION_HOST: process.env.SIMULATION_HOST || 'localhost'
    }
  };
  console.log('Simulation service config:', JSON.stringify(simulationConfig, null, 2));
  apps.push(simulationConfig);
} else {
  console.log('Simulation service NOT enabled. ENABLE_SIMULATION =', process.env.ENABLE_SIMULATION);
}

console.log('Total PM2 apps configured:', apps.length);
console.log('App names:', apps.map(app => app.name));

module.exports = {
  apps: apps
};