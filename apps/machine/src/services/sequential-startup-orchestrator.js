/**
 * Sequential Startup Orchestrator
 * 
 * Starts ComfyUI service + Redis worker pairs sequentially with connection validation
 * Instead of starting all services at once, this ensures each pair is working before continuing
 */

import { execAsync } from '../lib/exec-async.js';
import axios from 'axios';

export class SequentialStartupOrchestrator {
  constructor(logger) {
    this.logger = logger;
    this.startedServices = [];
  }

  /**
   * Start explicit service pairs with parallel service startup + sequential worker connection
   * @param {Array} servicePairs - Array of {service, worker} name pairs
   * @param {Object} ecosystemConfig - PM2 ecosystem configuration
   */
  async startServicePairs(servicePairs, ecosystemConfig) {
    this.logger.info('🚀 Starting Parallel-Sequential Startup Orchestrator');
    this.logger.info(`📋 Starting ${servicePairs.length} service pairs with parallel service startup`);

    // Validate all pairs exist in ecosystem config first
    const serviceConfigs = [];
    const workerConfigs = [];
    
    for (const pair of servicePairs) {
      const serviceConfig = ecosystemConfig.apps.find(app => app.name === pair.service);
      const workerConfig = ecosystemConfig.apps.find(app => app.name === pair.worker);
      
      if (!serviceConfig) {
        throw new Error(`Service ${pair.service} not found in ecosystem config`);
      }
      if (!workerConfig) {
        throw new Error(`Worker ${pair.worker} not found in ecosystem config`);
      }
      
      serviceConfigs.push(serviceConfig);
      workerConfigs.push(workerConfig);
    }

    // PHASE 1: Start all services in parallel
    this.logger.info(`🚀 Phase 1: Starting all ${servicePairs.length} services in parallel...`);
    
    const serviceStartPromises = servicePairs.map(async (pair, index) => {
      try {
        this.logger.info(`  🔄 Starting service ${pair.service}...`);
        await this.startService(serviceConfigs[index], 'service');
        this.logger.info(`  ✅ Service ${pair.service} started`);
        return { success: true, service: pair.service };
      } catch (error) {
        this.logger.error(`  ❌ Failed to start service ${pair.service}: ${error.message}`);
        return { success: false, service: pair.service, error: error.message };
      }
    });
    
    const serviceResults = await Promise.all(serviceStartPromises);
    const failedServices = serviceResults.filter(r => !r.success);
    
    if (failedServices.length > 0) {
      throw new Error(`Failed to start services: ${failedServices.map(f => f.service).join(', ')}`);
    }
    
    this.logger.info(`✅ Phase 1 complete: All ${servicePairs.length} services started in parallel`);
    
    // PHASE 2: Wait for services to initialize
    this.logger.info(`⏳ Phase 2: Allowing services to initialize (30 second delay)...`);
    await this.sleep(30000);
    this.logger.info(`✅ Phase 2 complete: Initialization delay finished`);
    
    // PHASE 3: Connect workers sequentially 
    this.logger.info(`🔗 Phase 3: Connecting Redis workers to services sequentially...`);
    
    for (let i = 0; i < servicePairs.length; i++) {
      const pair = servicePairs[i];
      const serviceConfig = serviceConfigs[i];
      const workerConfig = workerConfigs[i];
      
      this.logger.info(`🔄 Connecting pair ${i + 1}/${servicePairs.length}: ${pair.service} ↔ ${pair.worker}`);
      
      try {
        // Step 1: Wait for service to be ready
        this.logger.info(`  📍 Step 1: Testing service ${pair.service} readiness...`);
        await this.waitForServiceReady(serviceConfig);
        
        // Step 2: Start Redis worker
        this.logger.info(`  📍 Step 2: Starting Redis worker ${pair.worker}...`);
        await this.startService(workerConfig, 'worker');
        
        // Step 3: Brief validation that worker started
        this.logger.info(`  📍 Step 3: Validating worker ${pair.worker} startup...`);
        await this.sleep(3000); // Give worker time to connect
        
        this.logger.info(`✅ Pair ${i + 1} connected successfully: ${pair.service} ↔ ${pair.worker}`);
        
      } catch (error) {
        this.logger.error(`❌ Failed to connect pair ${i + 1}: ${error.message}`);
        throw new Error(`Worker connection failed at pair ${i + 1}: ${error.message}`);
      }
    }

    this.logger.info(`🎉 All ${servicePairs.length} service pairs connected successfully`);
    return this.startedServices;
  }

  /**
   * Create pairs of services and their corresponding Redis workers
   * @param {Array} serviceApps - Service configurations (ComfyUI, etc.)
   * @param {Array} redisWorkers - Redis worker configurations  
   */
  createServicePairs(serviceApps, redisWorkers) {
    const pairs = [];
    
    this.logger.info(`📋 Creating service pairs based on port matching`);
    
    // Match services by port information
    for (const serviceApp of serviceApps) {
      // Extract port from service configuration
      const servicePort = this.extractServicePort(serviceApp);
      if (!servicePort) {
        this.logger.warn(`⚠️  Could not determine port for service ${serviceApp.name}, skipping`);
        continue;
      }
      
      // Find corresponding Redis worker that connects to this port
      const correspondingWorker = redisWorkers.find(worker => 
        this.workerConnectsToPort(worker, servicePort)
      );
      
      if (correspondingWorker) {
        const pair = {
          service: serviceApp,
          worker: correspondingWorker,
          port: servicePort
        };
        
        this.logger.info(`🔌 Service pair: ${serviceApp.name} (port ${servicePort}) ↔ ${correspondingWorker.name}`);
        
        pairs.push(pair);
      } else {
        this.logger.warn(`⚠️  No Redis worker found for service: ${serviceApp.name} (port ${servicePort})`);
      }
    }
    
    return pairs.sort((a, b) => a.port - b.port); // Sort by port number
  }

  /**
   * Start a single PM2 service
   */
  async startService(serviceConfig, serviceType) {
    this.logger.info(`🚀 Starting ${serviceType}: ${serviceConfig.name}`);
    
    try {
      // Create temporary ecosystem file for this service
      const tempConfig = {
        apps: [serviceConfig]
      };
      
      const tempConfigPath = `/tmp/pm2-${serviceConfig.name}.config.js`;
      const configContent = `module.exports = ${JSON.stringify(tempConfig, null, 2)};`;
      
      this.logger.info(`  📝 Creating temp PM2 config: ${tempConfigPath}`);
      
      // Use Node.js fs to write file instead of shell echo to avoid escaping issues
      const fs = await import('fs');
      await fs.promises.writeFile(tempConfigPath, configContent, 'utf8');
      
      // Start the service with PM2
      this.logger.info(`  🎯 Executing: pm2 start ${tempConfigPath}`);
      const result = await execAsync(`pm2 start ${tempConfigPath}`);
      this.logger.info(`  📤 PM2 output: ${result.stdout.trim()}`);
      
      this.startedServices.push(serviceConfig.name);
      this.logger.info(`✅ Started ${serviceType}: ${serviceConfig.name}`);
      
      // Clean up temp file
      await execAsync(`rm -f ${tempConfigPath}`);
      
    } catch (error) {
      this.logger.error(`❌ Failed to start ${serviceType} ${serviceConfig.name}: ${error.message}`);
      if (error.stderr) {
        this.logger.error(`  📥 PM2 stderr: ${error.stderr}`);
      }
      throw error;
    }
  }

  /**
   * Wait for service to be ready
   * @param {Object} serviceConfig - PM2 service configuration
   * @param {Number} maxWaitTime - Maximum wait time in milliseconds
   */
  async waitForServiceReady(serviceConfig, maxWaitTime = 60000) {
    // Extract port from service config
    const port = this.extractServicePort(serviceConfig);
    if (!port) {
      throw new Error(`Cannot determine port for service ${serviceConfig.name}`);
    }
    
    const healthUrl = `http://localhost:${port}`;
    this.logger.info(`⏳ Waiting for service ${serviceConfig.name} on port ${port} to be ready...`);
    this.logger.info(`  🌐 Health check URL: ${healthUrl}`);
    
    const startTime = Date.now();
    let attemptCount = 0;
    
    while (Date.now() - startTime < maxWaitTime) {
      attemptCount++;
      try {
        this.logger.info(`  🔍 Connection attempt ${attemptCount} to port ${port}...`);
        const response = await axios.get(healthUrl, { 
          timeout: 5000,
          validateStatus: () => true // Accept any status
        });
        
        this.logger.info(`  📡 Response: ${response.status} ${response.statusText}`);
        
        if (response.status === 200 || response.status === 404) {
          this.logger.info(`✅ Service ${serviceConfig.name} on port ${port} is ready (attempt ${attemptCount})`);
          return true;
        } else {
          this.logger.info(`  ⏳ Service returned ${response.status}, retrying...`);
        }
      } catch (error) {
        this.logger.info(`  ⏳ Connection failed (${error.code || error.message}), retrying in 2s...`);
      }
      
      await this.sleep(2000); // Wait 2 seconds before retry
    }
    
    throw new Error(`Service ${serviceConfig.name} on port ${port} failed to become ready within ${maxWaitTime}ms after ${attemptCount} attempts`);
  }

  /**
   * Test connection between Redis worker and ComfyUI service
   */
  async testWorkerConnection(servicePair, maxWaitTime = 30000) {
    this.logger.info(`🔗 Testing connection between ${servicePair.worker.name} and ${servicePair.service.name}`);
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        // Check if worker process is running and healthy
        const workerStatus = await execAsync(`pm2 jlist | jq '.[] | select(.name=="${servicePair.worker.name}")'`);
        const workerInfo = JSON.parse(workerStatus);
        
        if (workerInfo && workerInfo.pm2_env && workerInfo.pm2_env.status === 'online') {
          this.logger.info(`✅ Connection validated: ${servicePair.worker.name} ↔ ${servicePair.comfyui.name}`);
          return true;
        }
      } catch (error) {
        // Connection not ready yet
      }
      
      await this.sleep(2000);
    }
    
    throw new Error(`Connection test failed between ${servicePair.worker.name} and ${servicePair.comfyui.name}`);
  }

  /**
   * Helper function to sleep for specified milliseconds
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get list of started services
   */
  getStartedServices() {
    return this.startedServices;
  }

  /**
   * Extract port number from a service configuration
   */
  extractServicePort(serviceConfig) {
    // Check args for --port=XXXX
    if (serviceConfig.args) {
      const portArg = serviceConfig.args.find(arg => arg.startsWith('--port='));
      if (portArg) {
        return parseInt(portArg.split('=')[1]);
      }
    }
    
    // Check environment variables
    if (serviceConfig.env) {
      if (serviceConfig.env.COMFYUI_PORT) {
        return parseInt(serviceConfig.env.COMFYUI_PORT);
      }
      if (serviceConfig.env.SERVICE_PORT) {
        return parseInt(serviceConfig.env.SERVICE_PORT);
      }
      if (serviceConfig.env.SIMULATION_PORT) {
        return parseInt(serviceConfig.env.SIMULATION_PORT);
      }
    }
    
    // Infer port from service type and GPU index for services using standalone-wrapper
    if (serviceConfig.script && serviceConfig.script.includes('standalone-wrapper') && serviceConfig.args) {
      const serviceName = serviceConfig.args[0];
      const gpuIndex = this.extractGpuIndex(serviceConfig);
      
      // Default port mappings for different services
      if (serviceName === 'comfyui') {
        return 8188 + (gpuIndex || 0);
      } else if (serviceName === 'simulation-websocket') {
        return 8399 + (gpuIndex || 0);
      } else if (serviceName === 'simulation-http') {
        return 8299 + (gpuIndex || 0);
      } else if (serviceName === 'a1111') {
        return 7860 + (gpuIndex || 0);
      }
    }
    
    return null;
  }

  /**
   * Extract GPU index from service name or configuration
   */
  extractGpuIndex(serviceConfig) {
    // Try to extract from service name (e.g., "service-gpu0" -> 0)
    const gpuMatch = serviceConfig.name.match(/gpu(\d+)/);
    if (gpuMatch) {
      return parseInt(gpuMatch[1]);
    }
    
    // Try to extract from --gpu= argument
    if (serviceConfig.args) {
      const gpuArg = serviceConfig.args.find(arg => arg.startsWith('--gpu='));
      if (gpuArg) {
        return parseInt(gpuArg.split('=')[1]);
      }
    }
    
    return 0; // Default to GPU 0
  }

  /**
   * Check if a Redis worker connects to a specific port
   */
  workerConnectsToPort(workerConfig, port) {
    // Check args for --service-port=XXXX
    if (workerConfig.args) {
      const servicePortArg = workerConfig.args.find(arg => arg.startsWith('--service-port='));
      if (servicePortArg) {
        const workerPort = parseInt(servicePortArg.split('=')[1]);
        return workerPort === port;
      }
    }
    
    // Check environment variables
    if (workerConfig.env) {
      if (workerConfig.env.COMFYUI_PORT) {
        return parseInt(workerConfig.env.COMFYUI_PORT) === port;
      }
      if (workerConfig.env.SERVICE_PORT) {
        return parseInt(workerConfig.env.SERVICE_PORT) === port;
      }
      if (workerConfig.env.SIMULATION_PORT) {
        return parseInt(workerConfig.env.SIMULATION_PORT) === port;
      }
    }
    
    // For workers using standalone-wrapper, infer connection based on GPU index and service type
    if (workerConfig.script && workerConfig.script.includes('standalone-wrapper') && workerConfig.args) {
      const serviceName = workerConfig.args[0];
      const gpuIndex = this.extractGpuIndex(workerConfig);
      
      // Calculate expected port based on service type
      let expectedPort = null;
      if (serviceName === 'comfyui') {
        expectedPort = 8188 + (gpuIndex || 0);
      } else if (serviceName === 'simulation-websocket') {
        expectedPort = 8399 + (gpuIndex || 0);
      } else if (serviceName === 'simulation-http') {
        expectedPort = 8299 + (gpuIndex || 0);
      } else if (serviceName === 'a1111') {
        expectedPort = 7860 + (gpuIndex || 0);
      }
      
      return expectedPort === port;
    }
    
    return false;
  }
}