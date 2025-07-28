#!/usr/bin/env node
/**
 * Worker-Driven PM2 Ecosystem Generator 
 * This is the new generator that integrates with the existing machine startup process
 * 
 * This file replaces the original generate-pm2-ecosystem.js when worker-driven mode is enabled
 */

import { EnhancedPM2EcosystemGenerator } from './src/config/enhanced-pm2-ecosystem-generator.js';
import { detectHardwareResources } from './src/config/hardware-detector.js';

async function main() {
  try {
    console.log('🚀 Generating PM2 ecosystem using worker-driven architecture...');
    
    // Check if worker-driven mode is enabled
    const workerConnectors = process.env.WORKER_CONNECTORS;
    const useWorkerDriven = workerConnectors && workerConnectors.includes(':');
    
    if (useWorkerDriven) {
      console.log('✅ Worker-driven mode detected, using enhanced generator');
      
      // Use the enhanced generator
      const generator = new EnhancedPM2EcosystemGenerator();
      await generator.generateEcosystem();
      
    } else {
      console.log('⚠️  Legacy mode detected, falling back to original generator');
      
      // Fall back to original logic for backward compatibility
      await generateLegacyEcosystem();
    }
    
    console.log('✅ PM2 ecosystem generation completed successfully');
    
  } catch (error) {
    console.error('❌ PM2 ecosystem generation failed:', error);
    process.exit(1);
  }
}

/**
 * Legacy ecosystem generation for backward compatibility
 */
async function generateLegacyEcosystem() {
  const fs = await import('fs');
  
  const gpuCount = parseInt(process.env.MACHINE_NUM_GPUS || '2');
  const enableComfyUI = process.env.MACHINE_ENABLE_COMFYUI === 'true';
  const enableSimulation = process.env.MACHINE_ENABLE_SIMULATION === 'true';
  const enableRedisWorker = process.env.MACHINE_ENABLE_REDIS_WORKERS === 'true';

  console.log(`Generating legacy PM2 ecosystem config for ${gpuCount} GPUs...`);

  const apps = [];

  // Shared setup service (runs once)
  apps.push({
    name: 'shared-setup',
    script: 'src/services/standalone-wrapper.js',
    args: ['shared-setup'],
    cwd: '/service-manager',
    instances: 1,
    autorestart: false,
    max_restarts: 3,
    error_file: '/workspace/logs/shared-setup-error.log',
    out_file: '/workspace/logs/shared-setup-out.log',
    log_file: '/workspace/logs/shared-setup-combined.log',
    merge_logs: true,
    env: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'info'
    }
  });

  if (enableComfyUI) {
    // ComfyUI instances (one per GPU)
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
          COMFYUI_CPU_MODE: process.env.COMFYUI_CPU_MODE || 'false'
        }
      });
    }
  }

  // Redis worker instances (one per GPU) - only if enabled
  if (enableRedisWorker) {
    for (let gpu = 0; gpu < gpuCount; gpu++) {
      apps.push({
        name: `redis-worker-gpu${gpu}`,
        script: 'src/services/standalone-wrapper.js',
        args: ['redis-worker', `--gpu=${gpu}`],
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
          HUB_REDIS_URL: process.env.HUB_REDIS_URL || 'redis://localhost:6379',
          MACHINE_ID: process.env.MACHINE_ID || 'unknown',
          WORKER_ID_PREFIX: 'worker',
          CONNECTORS: process.env.WORKER_CONNECTORS || 'simulation,comfyui',
          COMFYUI_HOST: process.env.WORKER_COMFYUI_HOST || 'localhost',
          COMFYUI_PORT: process.env.WORKER_COMFYUI_PORT || (8188 + gpu).toString(),
          WEBSOCKET_AUTH_TOKEN: process.env.WORKER_WEBSOCKET_AUTH_TOKEN || '',
          COMFYUI_TIMEOUT_SECONDS: process.env.WORKER_COMFYUI_TIMEOUT_SECONDS || '300',
          COMFYUI_MAX_CONCURRENT_JOBS: process.env.WORKER_COMFYUI_MAX_CONCURRENT_JOBS || '1',
          COMFYUI_USERNAME: process.env.WORKER_COMFYUI_USERNAME || '',
          COMFYUI_PASSWORD: process.env.WORKER_COMFYUI_PASSWORD || '',
          SIMULATION_MAX_CONCURRENT_JOBS: process.env.WORKER_SIMULATION_MAX_CONCURRENT_JOBS || '1',
          POLL_INTERVAL_MS: process.env.WORKER_POLL_INTERVAL_MS || '1000',
          JOB_TIMEOUT_MINUTES: process.env.WORKER_JOB_TIMEOUT_MINUTES || '30',
          QUALITY_LEVELS: process.env.WORKER_QUALITY_LEVELS || 'fast,balanced,quality',
          DEBUGGING_ENABLED: process.env.WORKER_DEBUGGING_ENABLED || 'false',
          DEVELOPMENT_MODE: process.env.WORKER_DEVELOPMENT_MODE || 'false'
        }
      });
    }
  }

  // Simulation service (if enabled)
  if (enableSimulation) {
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
        LOG_LEVEL: 'info'
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

  console.log(`✅ Generated legacy PM2 ecosystem config: ${configPath}`);
  console.log(`📊 Services configured: ${apps.length} total`);
  console.log(`   - Shared setup: 1`);
  if (enableComfyUI) {
    console.log(`   - ComfyUI instances: ${gpuCount}`);
  }
  if (enableRedisWorker) {
    console.log(`   - Redis workers: ${gpuCount}`);
  }
  if (enableSimulation) {
    console.log(`   - Simulation: 1`);
  }
}

// Run the main function
main();