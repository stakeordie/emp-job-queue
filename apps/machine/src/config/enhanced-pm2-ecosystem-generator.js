/**
 * Enhanced PM2 Ecosystem Generator
 * Worker-driven architecture using service mapping configuration
 * 
 * This generator integrates with the new service mapping system to create
 * PM2 ecosystem configurations based on worker specifications and hardware detection.
 */

import fs from 'fs';
import { HardwareDetector } from './hardware-detector.js';

export class EnhancedPM2EcosystemGenerator {
  constructor() {
    this.logger = {
      log: (msg) => console.log(`[Enhanced PM2 Generator] ${msg}`),
      warn: (msg) => console.warn(`[Enhanced PM2 Generator] ${msg}`),
      error: (msg) => console.error(`[Enhanced PM2 Generator] ${msg}`)
    };
    
    this.hardwareDetector = new HardwareDetector();
    this.serviceMapping = null;
    this.hardwareResources = null;
  }

  /**
   * Main method to generate PM2 ecosystem configuration
   */
  async generateEcosystem() {
    try {
      this.logger.log('🚀 Starting enhanced PM2 ecosystem generation...');

      // Load service mapping configuration
      await this.loadServiceMapping();
      
      // Detect hardware resources
      this.hardwareResources = await this.hardwareDetector.detectResources();
      
      // Parse worker specifications from environment
      const workerSpecs = this.parseWorkerSpecs();
      
      // Generate PM2 apps configuration
      const apps = await this.generateApps(workerSpecs);
      
      // Write ecosystem configuration
      await this.writeEcosystemConfig(apps);
      
      this.logger.log('✅ Enhanced PM2 ecosystem generation completed successfully');
      
    } catch (error) {
      this.logger.error(`Enhanced PM2 ecosystem generation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Load service mapping configuration
   */
  async loadServiceMapping() {
    try {
      const serviceMappingPath = '/workspace/worker-bundled/src/config/service-mapping.json';
      
      if (!fs.existsSync(serviceMappingPath)) {
        throw new Error(`Service mapping not found at: ${serviceMappingPath}`);
      }
      
      const serviceMappingContent = fs.readFileSync(serviceMappingPath, 'utf8');
      this.serviceMapping = JSON.parse(serviceMappingContent);
      
      this.logger.log(`✅ Loaded service mapping with ${Object.keys(this.serviceMapping.workers).length} worker types`);
      
    } catch (error) {
      this.logger.error(`Failed to load service mapping: ${error.message}`);
      throw error;
    }
  }

  /**
   * Parse worker specifications from environment variables
   * Format: "worker-type:count,worker-type:count"
   * Example: "comfyui:2,simulation:1,comfyui-remote:1"
   */
  parseWorkerSpecs() {
    const workersEnv = process.env.WORKERS || '';
    const workerSpecs = [];
    
    if (!workersEnv) {
      this.logger.warn('No WORKERS environment variable found, using defaults');
      return [{ type: 'simulation', count: 1 }];
    }
    
    const specs = workersEnv.split(',').map(s => s.trim()).filter(s => s);
    
    for (const spec of specs) {
      const [type, countStr] = spec.split(':');
      const count = parseInt(countStr) || 1;
      
      if (!this.serviceMapping.workers[type]) {
        this.logger.warn(`Unknown worker type: ${type}, skipping`);
        continue;
      }
      
      workerSpecs.push({ type, count });
    }
    
    this.logger.log(`📋 Parsed worker specifications: ${workerSpecs.map(s => `${s.type}:${s.count}`).join(', ')}`);
    
    return workerSpecs;
  }

  /**
   * Generate PM2 apps configuration based on worker specifications
   */
  async generateApps(workerSpecs) {
    const apps = [];
    
    // Add health server (no more shared-setup - removed earlier)
    apps.push(this.createHealthServerApp());
    
    // Generate apps for each worker specification
    for (const spec of workerSpecs) {
      const workerConfig = this.serviceMapping.workers[spec.type];
      const workerApps = await this.generateWorkerApps(spec.type, spec.count, workerConfig);
      apps.push(...workerApps);
    }
    
    this.logger.log(`📊 Generated ${apps.length} PM2 app configurations`);
    
    return apps;
  }

  /**
   * Generate PM2 apps for a specific worker type
   */
  async generateWorkerApps(workerType, requestedCount, workerConfig) {
    const apps = [];
    
    // Determine actual instance count based on resource binding
    const instanceCount = this.calculateInstanceCount(workerConfig, requestedCount);
    
    // Generate Redis worker instances
    for (let i = 0; i < instanceCount; i++) {
      const app = this.createRedisWorkerApp(workerType, i, workerConfig, instanceCount);
      apps.push(app);
    }
    
    // Generate service-specific apps (ComfyUI, etc.) if needed
    if (workerConfig.service) {
      for (const service of workerConfig.service) {
        if (service.type === 'internal') {
          const serviceApps = await this.generateServiceApps(workerType, instanceCount, workerConfig);
          apps.push(...serviceApps);
        }
      }
    }
    
    return apps;
  }

  /**
   * Calculate actual instance count based on resource binding and hardware
   */
  calculateInstanceCount(workerConfig, requestedCount) {
    const resourceBinding = workerConfig.resource_binding || 'shared';
    const binding = this.serviceMapping.resource_bindings[resourceBinding];
    
    if (!binding) {
      this.logger.warn(`Unknown resource binding: ${resourceBinding}, using requested count`);
      return requestedCount;
    }
    
    switch (binding.scaling) {
      case 'per_gpu':
        const gpuCount = this.hardwareResources?.gpuCount || parseInt(process.env.MACHINE_NUM_GPUS || '1');
        return Math.min(requestedCount, gpuCount);
        
      case 'per_machine':
        return 1; // One instance per machine regardless of request
        
      case 'unlimited':
        return requestedCount; // Use requested count for API services
        
      default:
        return requestedCount;
    }
  }

  /**
   * Create health server PM2 app
   */
  createHealthServerApp() {
    return {
      name: 'health-server',
      script: 'src/services/health-server.js',
      cwd: '/service-manager',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '5s',
      max_memory_restart: '512M',
      restart_delay: 2000,
      error_file: '/workspace/logs/health-server-error.log',
      out_file: '/workspace/logs/health-server-out.log',
      log_file: '/workspace/logs/health-server-combined.log',
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        SERVICE_MANAGER_PATH: '/service-manager',
        WORKSPACE_PATH: '/workspace'
      }
    };
  }

  /**
   * Create Redis worker PM2 app
   */
  createRedisWorkerApp(workerType, index, workerConfig, _totalInstances) {
    const resourceBinding = workerConfig.resource_binding || 'shared';
    const isGpuBound = resourceBinding === 'gpu' || resourceBinding === 'mock_gpu';
    
    // Generate environment variables
    const env = {
      NODE_ENV: 'production',
      LOG_LEVEL: 'info',
      WORKER_ID: isGpuBound ? `${workerType}-gpu${index}` : `${workerType}-${index}`,
      HUB_REDIS_URL: process.env.HUB_REDIS_URL || 'redis://localhost:6379',
      MACHINE_ID: process.env.MACHINE_ID || 'unknown',
      WORKER_ID_PREFIX: workerType,
      
      // Worker type specification
      CONNECTORS: workerType,
      
      // Resource binding specific
      ...(isGpuBound && {
        GPU_INDEX: index.toString(),
        CUDA_VISIBLE_DEVICES: index.toString()
      }),
      
      // Copy worker-specific environment variables
      ...this.getWorkerEnvironmentVars(workerConfig),
      
      // Service-specific configuration
      ...this.getServiceEnvironmentVars(workerConfig, index)
    };

    const appName = isGpuBound ? `redis-worker-${workerType}-gpu${index}` : `redis-worker-${workerType}-${index}`;

    return {
      name: appName,
      script: 'src/services/standalone-wrapper.js',
      args: ['redis-worker', isGpuBound ? `--gpu=${index}` : `--index=${index}`],
      cwd: '/service-manager',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '1G',
      restart_delay: 3000,
      error_file: `/workspace/logs/${appName}-error.log`,
      out_file: `/workspace/logs/${appName}-out.log`,
      log_file: `/workspace/logs/${appName}-combined.log`,
      merge_logs: true,
      env
    };
  }

  /**
   * Generate service-specific PM2 apps (e.g., ComfyUI)
   */
  async generateServiceApps(workerType, instanceCount, _workerConfig) {
    const apps = [];
    
    // Only generate for ComfyUI for now
    if (workerType === 'comfyui') {
      for (let i = 0; i < instanceCount; i++) {
        apps.push(this.createComfyUIApp(i));
      }
    }
    
    return apps;
  }

  /**
   * Create ComfyUI service PM2 app
   */
  createComfyUIApp(gpuIndex) {
    return {
      name: `comfyui-gpu${gpuIndex}`,
      script: 'src/services/standalone-wrapper.js',
      args: ['comfyui', `--gpu=${gpuIndex}`],
      cwd: '/service-manager',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '2G',
      restart_delay: 5000,
      error_file: `/workspace/logs/comfyui-gpu${gpuIndex}-error.log`,
      out_file: `/workspace/logs/comfyui-gpu${gpuIndex}-out.log`,
      log_file: `/workspace/logs/comfyui-gpu${gpuIndex}-combined.log`,
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        GPU_INDEX: gpuIndex.toString(),
        CUDA_VISIBLE_DEVICES: gpuIndex.toString(),
        COMFYUI_PORT: (8188 + gpuIndex).toString(),
        COMFYUI_CPU_MODE: process.env.COMFYUI_CPU_MODE || 'false'
      }
    };
  }

  /**
   * Get worker-specific environment variables
   */
  getWorkerEnvironmentVars(workerConfig) {
    const env = {};
    
    // Map common worker environment variables
    const workerEnvMap = {
      'POLL_INTERVAL_MS': process.env.WORKER_POLL_INTERVAL_MS || '1000',
      'JOB_TIMEOUT_MINUTES': process.env.WORKER_JOB_TIMEOUT_MINUTES || '30',
      'QUALITY_LEVELS': process.env.WORKER_QUALITY_LEVELS || 'fast,balanced,quality',
      'DEBUGGING_ENABLED': process.env.WORKER_DEBUGGING_ENABLED || 'false',
      'DEVELOPMENT_MODE': process.env.WORKER_DEVELOPMENT_MODE || 'false',
      'WEBSOCKET_AUTH_TOKEN': process.env.WORKER_WEBSOCKET_AUTH_TOKEN || ''
    };
    
    Object.assign(env, workerEnvMap);
    
    // Add required environment variables
    if (workerConfig.required_env) {
      for (const envVar of workerConfig.required_env) {
        const key = envVar.replace(/\$\{(.+)\}/, '$1').replace(/_VAR$/, '');
        if (process.env[key]) {
          env[key] = process.env[key];
        }
      }
    }
    
    return env;
  }

  /**
   * Get service-specific environment variables
   */
  getServiceEnvironmentVars(workerConfig, index) {
    const env = {};
    
    // Handle service-specific configuration
    if (workerConfig.service) {
      for (const service of workerConfig.service) {
        const capability = Array.isArray(service.capability) ? service.capability[0] : service.capability;
        
        switch (capability) {
          case 'comfyui':
            Object.assign(env, {
              COMFYUI_HOST: process.env.WORKER_COMFYUI_HOST || 'localhost',
              COMFYUI_PORT: process.env.WORKER_COMFYUI_PORT || (8188 + index).toString(),
              COMFYUI_TIMEOUT_SECONDS: process.env.WORKER_COMFYUI_TIMEOUT_SECONDS || '300',
              COMFYUI_MAX_CONCURRENT_JOBS: process.env.WORKER_COMFYUI_MAX_CONCURRENT_JOBS || '1',
              COMFYUI_USERNAME: process.env.WORKER_COMFYUI_USERNAME || '',
              COMFYUI_PASSWORD: process.env.WORKER_COMFYUI_PASSWORD || ''
            });
            break;
            
          case 'simulation':
            Object.assign(env, {
              SIMULATION_MAX_CONCURRENT_JOBS: process.env.WORKER_SIMULATION_MAX_CONCURRENT_JOBS || '1'
            });
            break;
        }
      }
    }
    
    return env;
  }

  /**
   * Write PM2 ecosystem configuration to file
   */
  async writeEcosystemConfig(apps) {
    const ecosystemConfig = { apps };
    const configPath = '/workspace/pm2-ecosystem.config.cjs';
    const configContent = `module.exports = ${JSON.stringify(ecosystemConfig, null, 2)};`;
    
    try {
      fs.writeFileSync(configPath, configContent);
      
      this.logger.log(`✅ Generated PM2 ecosystem config: ${configPath}`);
      this.logger.log(`📊 Services configured: ${apps.length} total`);
      
      // Log service breakdown
      const serviceTypes = {};
      apps.forEach(app => {
        const type = app.name.split('-')[0];
        serviceTypes[type] = (serviceTypes[type] || 0) + 1;
      });
      
      Object.entries(serviceTypes).forEach(([type, count]) => {
        this.logger.log(`   - ${type}: ${count}`);
      });
      
    } catch (error) {
      this.logger.error(`Failed to write ecosystem config: ${error.message}`);
      throw error;
    }
  }
}