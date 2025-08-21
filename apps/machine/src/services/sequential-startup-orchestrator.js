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
   * Start services sequentially with connection validation
   * @param {Array} ecosystemConfig - PM2 ecosystem configuration
   */
  async startServicesSequentially(ecosystemConfig) {
    this.logger.info('🚀 Starting Sequential Startup Orchestrator');
    this.logger.info(`📋 Ports are predetermined in ecosystem config - no additional assignment needed`);
    
    // Separate services by type
    const healthServices = ecosystemConfig.apps.filter(app => app.name.includes('health'));
    const comfyuiServices = ecosystemConfig.apps.filter(app => app.name.includes('comfyui-gpu'));
    const redisWorkers = ecosystemConfig.apps.filter(app => app.name.includes('redis-worker'));

    // Start health services first
    for (const service of healthServices) {
      await this.startService(service, 'health');
    }

    // Group ComfyUI services with their corresponding Redis workers
    const servicePairs = this.createServicePairs(comfyuiServices, redisWorkers);
    
    this.logger.info(`📋 Found ${servicePairs.length} service pairs to start sequentially`);

    // Start each pair sequentially
    for (let i = 0; i < servicePairs.length; i++) {
      const pair = servicePairs[i];
      this.logger.info(`🔄 Starting service pair ${i + 1}/${servicePairs.length}: ${pair.comfyui.name} + ${pair.worker.name}`);
      
      try {
        // Step 1: Start ComfyUI service
        await this.startService(pair.comfyui, 'comfyui');
        
        // Step 2: Wait for ComfyUI to be ready
        await this.waitForComfyUIReady(pair);
        
        // Step 3: Start Redis worker
        await this.startService(pair.worker, 'redis-worker');
        
        // Step 4: Test connection between worker and service
        await this.testWorkerConnection(pair);
        
        this.logger.info(`✅ Service pair ${i + 1} started and validated successfully`);
        
      } catch (error) {
        this.logger.error(`❌ Failed to start service pair ${i + 1}: ${error.message}`);
        throw new Error(`Sequential startup failed at pair ${i + 1}: ${error.message}`);
      }
    }

    this.logger.info(`🎉 All ${servicePairs.length} service pairs started successfully`);
    return this.startedServices;
  }

  /**
   * Create pairs of ComfyUI services and their corresponding Redis workers
   * @param {Array} comfyuiServices - ComfyUI service configurations
   * @param {Array} redisWorkers - Redis worker configurations  
   */
  createServicePairs(comfyuiServices, redisWorkers) {
    const pairs = [];
    
    this.logger.info(`📋 Creating service pairs with ports from ecosystem config`);
    
    // Match services by GPU index
    for (const comfyuiService of comfyuiServices) {
      // Extract GPU index from service name (e.g., "comfyui-gpu0" -> "0")
      const gpuMatch = comfyuiService.name.match(/gpu(\d+)/);
      if (!gpuMatch) continue;
      
      const gpuIndex = gpuMatch[1];
      
      // Find corresponding Redis worker
      const correspondingWorker = redisWorkers.find(worker => 
        worker.name.includes(`comfyui-${gpuIndex}`) || worker.name.includes(`gpu${gpuIndex}`)
      );
      
      if (correspondingWorker) {
        const pair = {
          comfyui: comfyuiService,
          worker: correspondingWorker,
          gpuIndex: parseInt(gpuIndex)
        };
        
        // Extract and log the predetermined ports from service config
        let comfyuiPort = 'unknown';
        let workerPort = 'unknown';
        
        // Get ComfyUI port from service args or environment
        if (comfyuiService.args) {
          const portArg = comfyuiService.args.find(arg => arg.startsWith('--port='));
          if (portArg) {
            comfyuiPort = portArg.split('=')[1];
          }
        }
        if (comfyuiPort === 'unknown' && comfyuiService.env.COMFYUI_PORT) {
          comfyuiPort = comfyuiService.env.COMFYUI_PORT;
        }
        
        // Get Redis worker port from service args
        if (correspondingWorker.args) {
          const servicePortArg = correspondingWorker.args.find(arg => arg.startsWith('--service-port='));
          if (servicePortArg) {
            workerPort = servicePortArg.split('=')[1];
          }
        }
        
        this.logger.info(`🔌 GPU ${gpuIndex} pair: ComfyUI port ${comfyuiPort}, Worker connects to ${workerPort}`);
        
        pairs.push(pair);
      } else {
        this.logger.warn(`⚠️  No Redis worker found for ComfyUI service: ${comfyuiService.name}`);
      }
    }
    
    return pairs.sort((a, b) => a.gpuIndex - b.gpuIndex); // Sort by GPU index
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
      
      await execAsync(`echo '${configContent}' > ${tempConfigPath}`);
      
      // Start the service with PM2
      await execAsync(`pm2 start ${tempConfigPath}`);
      
      this.startedServices.push(serviceConfig.name);
      this.logger.info(`✅ Started ${serviceType}: ${serviceConfig.name}`);
      
      // Clean up temp file
      await execAsync(`rm -f ${tempConfigPath}`);
      
    } catch (error) {
      this.logger.error(`❌ Failed to start ${serviceType} ${serviceConfig.name}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Wait for ComfyUI service to be ready
   * @param {Object} servicePair - Service pair containing comfyui service and assigned port
   * @param {Number} maxWaitTime - Maximum wait time in milliseconds
   */
  async waitForComfyUIReady(servicePair, maxWaitTime = 60000) {
    // Extract port from ComfyUI service arguments (--port=8188) or environment
    let port = servicePair.comfyui.env.COMFYUI_PORT || '8188';
    
    // Check if port is specified in service args (--port=XXXX)
    if (servicePair.comfyui.args) {
      const portArg = servicePair.comfyui.args.find(arg => arg.startsWith('--port='));
      if (portArg) {
        port = portArg.split('=')[1];
        this.logger.info(`📍 Found port ${port} in ComfyUI service args`);
      }
    }
    
    const healthUrl = `http://localhost:${port}`;
    this.logger.info(`⏳ Waiting for ComfyUI service ${servicePair.comfyui.name} on port ${port} to be ready...`);
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        const response = await axios.get(healthUrl, { 
          timeout: 5000,
          validateStatus: () => true // Accept any status
        });
        
        if (response.status === 200 || response.status === 404) {
          this.logger.info(`✅ ComfyUI service on port ${port} is ready`);
          return true;
        }
      } catch (error) {
        // Service not ready yet, continue waiting
      }
      
      await this.sleep(2000); // Wait 2 seconds before retry
    }
    
    throw new Error(`ComfyUI service on port ${port} failed to become ready within ${maxWaitTime}ms`);
  }

  /**
   * Test connection between Redis worker and ComfyUI service
   */
  async testWorkerConnection(servicePair, maxWaitTime = 30000) {
    this.logger.info(`🔗 Testing connection between ${servicePair.worker.name} and ${servicePair.comfyui.name}`);
    
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
}