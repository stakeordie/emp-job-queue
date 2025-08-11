/**
 * Enhanced PM2 Ecosystem Generator
 * Worker-driven architecture using service mapping configuration
 * 
 * This generator integrates with the new service mapping system to create
 * PM2 ecosystem configurations based on worker specifications and hardware detection.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { HardwareDetector } from './hardware-detector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class EnhancedPM2EcosystemGenerator {
  constructor() {
    console.log(`🚀🚀🚀 [BUILD-VERIFICATION] NEW PM2 ECOSYSTEM GENERATOR BUILD ACTIVE - ${new Date().toISOString()}`);
    this.logger = {
      log: (msg) => console.log(`[Enhanced PM2 Generator] ${msg}`),
      warn: (msg) => console.warn(`[Enhanced PM2 Generator] ${msg}`),
      error: (msg) => console.error(`[Enhanced PM2 Generator] ${msg}`)
    };
    
    this.hardwareDetector = new HardwareDetector();
    this.serviceMapping = null;
    this.serviceEnvMapping = null;
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
      // Check multiple paths for service mapping - supports both bundled and non-bundled modes
      const possiblePaths = [
        '/workspace/worker-bundled/src/config/service-mapping.json',  // Bundled mode
        '/service-manager/src/config/service-mapping.json',           // Direct from service-manager
        path.join(__dirname, 'service-mapping.json'),                 // Same directory
        './src/config/service-mapping.json'                           // Relative path
      ];
      
      let serviceMappingPath = null;
      for (const testPath of possiblePaths) {
        if (fs.existsSync(testPath)) {
          serviceMappingPath = testPath;
          this.logger.log(`Found service mapping at: ${serviceMappingPath}`);
          break;
        }
      }
      
      if (!serviceMappingPath) {
        throw new Error(`Service mapping not found in any of these paths: ${possiblePaths.join(', ')}`);
      }
      
      const serviceMappingContent = fs.readFileSync(serviceMappingPath, 'utf8');
      this.serviceMapping = JSON.parse(serviceMappingContent);
      
      this.logger.log(`✅ Loaded service mapping with ${Object.keys(this.serviceMapping.workers).length} worker types`);
      
      // Load service environment mapping
      const serviceEnvMappingPath = path.join(__dirname, 'service-env-mapping.json');
      
      if (fs.existsSync(serviceEnvMappingPath)) {
        const serviceEnvMappingContent = fs.readFileSync(serviceEnvMappingPath, 'utf8');
        this.serviceEnvMapping = JSON.parse(serviceEnvMappingContent);
        this.logger.log(`✅ Loaded service environment mapping with ${Object.keys(this.serviceEnvMapping).length} service types`);
      } else {
        this.logger.warn(`Service environment mapping not found at: ${serviceEnvMappingPath}`);
        this.serviceEnvMapping = {};
      }
      
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
      
      if (!this.serviceMapping.workers[type]) {
        this.logger.warn(`Unknown worker type: ${type}, skipping`);
        continue;
      }
      
      // Handle 'auto' count for automatic hardware detection
      let count;
      if (countStr && countStr.toLowerCase() === 'auto') {
        const workerConfig = this.serviceMapping.workers[type];
        const resourceBinding = workerConfig.resource_binding;
        
        if (resourceBinding === 'gpu') {
          // For GPU workers, use detected GPU count
          count = this.hardwareResources?.gpuCount || parseInt(process.env.MACHINE_NUM_GPUS || '1');
          this.logger.log(`🔍 Auto-resolved ${type} GPU workers to ${count} (detected GPUs)`);
        } else if (resourceBinding === 'mock_gpu') {
          // For mock GPU, use a sensible default since there's no hardware constraint
          count = parseInt(process.env.MOCK_GPU_NUM || '2');
          this.logger.log(`🔍 Auto-resolved ${type} mock GPU workers to ${count} (from MOCK_GPU_NUM or default)`);
        } else if (resourceBinding === 'cpu') {
          // For CPU workers, use CPU core count
          count = this.hardwareResources?.cpuCount || parseInt(process.env.MACHINE_NUM_CPUS || '4');
          this.logger.log(`🔍 Auto-resolved ${type} CPU workers to ${count} (detected CPUs)`);
        } else {
          // Default for other resource bindings
          count = 1;
          this.logger.log(`🔍 Auto-resolved ${type} workers to ${count} (default for ${resourceBinding} binding)`);
        }
      } else {
        count = parseInt(countStr) || 1;
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
    if (workerConfig.services) {
      for (const serviceName of workerConfig.services) {
        const serviceConfig = this.serviceMapping.services[serviceName];
        if (serviceConfig && serviceConfig.type === 'internal') {
          const serviceApps = await this.generateServiceApps(workerType, instanceCount, workerConfig, serviceConfig, serviceName);
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
        // For mock_gpu binding, use worker config count; otherwise use actual GPU count
        let gpuCount;
        if (resourceBinding === 'mock_gpu') {
          // Count workers from machine config instead of env var
          gpuCount = requestedCount; // Use the actual worker count from config
        } else {
          gpuCount = this.hardwareResources?.gpuCount || parseInt(process.env.MACHINE_NUM_GPUS || '1');
        }
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
    this.logger.log(`🚀 [BUILD-VERIFICATION] NEW BUILD DEPLOYED - Enhanced PM2 Ecosystem Generator active at ${new Date().toISOString()}`);
    this.logger.log(`🔴 [PM2-GENERATOR-DEBUG] createRedisWorkerApp called with:`);
    this.logger.log(`🔴 [PM2-GENERATOR-DEBUG] - workerType: "${workerType}"`);
    this.logger.log(`🔴 [PM2-GENERATOR-DEBUG] - index: ${index}`);
    this.logger.log(`🔴 [PM2-GENERATOR-DEBUG] - MACHINE_ID env: "${process.env.MACHINE_ID}"`);
    
    const resourceBinding = workerConfig.resource_binding || 'shared';
    const isGpuBound = resourceBinding === 'gpu' || resourceBinding === 'mock_gpu';
    
    const generatedWorkerId = `${process.env.MACHINE_ID || 'unknown-machine'}-worker-${workerType}-${index}`;
    this.logger.log(`🔴 [PM2-GENERATOR-DEBUG] Generated WORKER_ID: "${generatedWorkerId}"`);
    
    // Generate environment variables
    const env = {
      NODE_ENV: 'production',
      LOG_LEVEL: 'info',
      WORKER_ID: generatedWorkerId,
      HUB_REDIS_URL: process.env.HUB_REDIS_URL || 'redis://localhost:6379',
      MACHINE_ID: process.env.MACHINE_ID || 'unknown',
      
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
   * 
   * ⚠️  CRITICAL MAINTENANCE NOTE ⚠️
   * 
   * This method is HARDCODED for specific service types and must be manually updated
   * every time a new service is added to the system. This is a known design limitation.
   * 
   * WHEN ADDING NEW SERVICES:
   * 1. Add new connector type check (e.g., 'newservicetype')
   * 2. Create corresponding createNewServiceApp() method
   * 3. Test PM2 ecosystem generation
   * 
   * CURRENT SUPPORTED SERVICES:
   * - comfyui (ComfyUIConnector)
   * - simulationhttp (SimulationHttpConnector) 
   * - simulation (SimulationConnector)
   * - simulationwebsocket (SimulationWebsocketConnector)
   * 
   * TODO: Refactor to data-driven approach using service-mapping.json configuration
   */
  async generateServiceApps(workerType, instanceCount, workerConfig, serviceConfig, actualServiceName) {
    const apps = [];
    
    // Use the actual service name from service mapping instead of deriving from connector
    const serviceName = actualServiceName;
    
    // Check connector type to determine service implementation  
    const connectorType = serviceConfig.connector.replace('Connector', '').toLowerCase();
    
    if (connectorType === 'comfyui') {
      for (let i = 0; i < instanceCount; i++) {
        apps.push(this.createComfyUIApp(serviceName, i));
      }
    } else if (connectorType === 'simulationhttp' || connectorType === 'simulation') {
      // Check if we're in mock_gpu mode to decide instance count
      const resourceBinding = serviceConfig.resource_binding || 'shared';
      const isMockGpu = resourceBinding === 'mock_gpu';
      
      if (isMockGpu) {
        // Create per-GPU simulation instances (like ComfyUI)
        for (let i = 0; i < instanceCount; i++) {
          apps.push(this.createSimulationApp(serviceName, i));
        }
      } else {
        // Single simulation service for the machine
        apps.push(this.createSimulationApp(serviceName));
      }
    } else if (connectorType === 'simulationwebsocket') {
      // WebSocket simulation service
      const resourceBinding = serviceConfig.resource_binding || 'shared';
      const isMockGpu = resourceBinding === 'mock_gpu';
      
      if (isMockGpu) {
        // Create per-GPU WebSocket simulation instances (like ComfyUI)
        for (let i = 0; i < instanceCount; i++) {
          apps.push(this.createSimulationWebSocketApp(serviceName, i));
        }
      } else {
        // Single WebSocket simulation service for the machine
        apps.push(this.createSimulationWebSocketApp(serviceName));
      }
    }
    
    return apps;
  }

  /**
   * Create ComfyUI service PM2 app
   */
  createComfyUIApp(serviceName, gpuIndex) {
    return {
      name: `${serviceName}-gpu${gpuIndex}`,
      script: 'src/services/standalone-wrapper.js',
      args: ['comfyui', `--gpu=${gpuIndex}`],
      cwd: '/service-manager',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '2G',
      restart_delay: 5000,
      error_file: `/workspace/logs/${serviceName}-gpu${gpuIndex}-error.log`,
      out_file: `/workspace/logs/${serviceName}-gpu${gpuIndex}-out.log`,
      log_file: `/workspace/logs/${serviceName}-gpu${gpuIndex}-combined.log`,
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
   * Create Simulation service PM2 app
   */
  createSimulationApp(serviceName, gpuIndex = null) {
    const isPerGpu = gpuIndex !== null;
    const name = isPerGpu ? `${serviceName}-gpu${gpuIndex}` : `${serviceName}-service`;
    const port = isPerGpu ? (8299 + gpuIndex) : 8299;
    
    return {
      name,
      script: 'src/services/standalone-wrapper.js',
      args: isPerGpu ? ['simulation', `--gpu=${gpuIndex}`] : ['simulation'],
      cwd: '/service-manager',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '5s',
      max_memory_restart: '512M',
      restart_delay: 2000,
      error_file: `/workspace/logs/${name}-error.log`,
      out_file: `/workspace/logs/${name}-out.log`,
      log_file: `/workspace/logs/${name}-combined.log`,
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        SIMULATION_PORT: port.toString(),
        SIMULATION_HOST: '0.0.0.0',
        ...(isPerGpu && {
          GPU_INDEX: gpuIndex.toString(),
          CUDA_VISIBLE_DEVICES: gpuIndex.toString()
        })
      }
    };
  }

  /**
   * Create Simulation WebSocket service PM2 app
   */
  createSimulationWebSocketApp(serviceName, gpuIndex = null) {
    const isPerGpu = gpuIndex !== null;
    const name = isPerGpu ? `${serviceName}-gpu${gpuIndex}` : `${serviceName}-service`;
    const port = isPerGpu ? (8399 + gpuIndex) : 8399; // WebSocket port range starting at 8399
    
    return {
      name,
      script: 'src/services/standalone-wrapper.js',
      args: isPerGpu ? ['simulation-websocket', `--gpu=${gpuIndex}`] : ['simulation-websocket'],
      cwd: '/service-manager',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '5s',
      max_memory_restart: '512M',
      restart_delay: 2000,
      error_file: `/workspace/logs/${name}-error.log`,
      out_file: `/workspace/logs/${name}-out.log`,
      log_file: `/workspace/logs/${name}-combined.log`,
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        PORT: port.toString(),
        HOST: '0.0.0.0',
        SIMULATION_WS_PROCESSING_TIME: '10',
        SIMULATION_WS_STEPS: '10',
        SIMULATION_WS_PROGRESS_INTERVAL_MS: '300',
        ...(isPerGpu && {
          GPU_INDEX: gpuIndex.toString(),
          CUDA_VISIBLE_DEVICES: gpuIndex.toString()
        })
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
    if (workerConfig.services) {
      for (const serviceName of workerConfig.services) {
        const serviceConfig = this.serviceMapping.services[serviceName];
        if (!serviceConfig) continue;
        
        const jobTypes = serviceConfig.job_types_accepted || [];
        const connectorName = serviceConfig.connector;
        
        this.logger.log(`🔍 Getting list of env vars for connector: ${connectorName} (job types: ${jobTypes.join(', ')})`);
        
        // Try to get env vars from the connector class itself
        try {
          // Attempt to load the connector class to get its required env vars
          const ConnectorClass = this.getConnectorClass(connectorName);
          if (ConnectorClass && typeof ConnectorClass.getRequiredEnvVars === 'function') {
            const envMapping = ConnectorClass.getRequiredEnvVars();
            
            // Process each environment variable from the connector
            for (const [envKey, envValue] of Object.entries(envMapping)) {
              const processedValue = this.processEnvValue(envValue, index);
              env[envKey] = processedValue;
            }
            this.logger.log(`📦 Loading ${Object.keys(envMapping).length} env vars into worker from connector ${connectorName}`);
            continue;
          }
        } catch (error) {
          // Fall back to config file if connector loading fails
          this.logger.warn(`Could not load connector ${connectorName}: ${error.message}`);
        }
        
        // Fallback: Use the service env mapping configuration file for each job type
        for (const jobType of jobTypes) {
          if (this.serviceEnvMapping && this.serviceEnvMapping[jobType]) {
            const envMapping = this.serviceEnvMapping[jobType];
            
            // Process each environment variable from the mapping
            for (const [envKey, envValue] of Object.entries(envMapping)) {
              const processedValue = this.processEnvValue(envValue, index);
              env[envKey] = processedValue;
            }
            this.logger.log(`📦 Loading ${Object.keys(envMapping).length} env vars into worker from config for job type ${jobType}`);
          } else {
            // No mapping found
            this.logger.warn(`No environment mapping found for job type: ${jobType}`);
          }
        }
      }
    }
    
    return env;
  }
  
  getConnectorClass(connectorName) {
    // This would need to be implemented to dynamically load connector classes
    // For now, return null to use the fallback config file approach
    return null;
  }
  
  processEnvValue(envValue, index) {
    // Handle ${VAR:-default} pattern
    const pattern = /\$\{([^:}]+)(?::-([^}]*))?\}/g;
    
    return envValue.replace(pattern, (match, varName, defaultValue) => {
      // Special handling for port variables that need index
      if (varName.includes('PORT') && varName.includes('COMFYUI')) {
        const basePort = parseInt(process.env[varName] || defaultValue || '8188');
        return (basePort + index).toString();
      }
      
      // Regular environment variable replacement
      return process.env[varName] || defaultValue || '';
    });
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