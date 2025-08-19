/**
 * FIXED Enhanced PM2 Ecosystem Generator
 * Replaces hardcoded connector logic with installer-based service creation
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { HardwareDetector } from './src/config/hardware-detector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class EnhancedPM2EcosystemGenerator {
  constructor() {
    const BUILD_TIMESTAMP = '2025-08-19T00:17:00.000Z';
    const FILE_VERSION = 'FIXED-v1';
    
    console.log(`🔥🔥🔥 [FIXED-PM2-GENERATOR] === FIXED PM2 ECOSYSTEM GENERATOR ACTIVE ===`);
    console.log(`🔥🔥🔥 [FIXED-PM2-GENERATOR] BUILD TIMESTAMP: ${BUILD_TIMESTAMP}`);
    console.log(`🔥🔥🔥 [FIXED-PM2-GENERATOR] FILE VERSION: ${FILE_VERSION}`);
    console.log(`🔥🔥🔥 [FIXED-PM2-GENERATOR] Current Time: ${new Date().toISOString()}`);
    
    this.logger = {
      log: (msg) => console.log(`[🔥 FIXED PM2 Generator ${new Date().toISOString()}] ${msg}`),
      warn: (msg) => console.warn(`[🔥 FIXED PM2 Generator ${new Date().toISOString()}] ${msg}`),
      error: (msg) => console.error(`[🔥 FIXED PM2 Generator ${new Date().toISOString()}] ${msg}`)
    };
    
    this.hardwareDetector = new HardwareDetector();
    this.serviceMapping = null;
    this.serviceEnvMapping = null;
    this.hardwareResources = null;
  }

  /**
   * Parse instances per GPU from service config
   */
  parseInstancesPerGpu(instancesPerGpuStr) {
    if (!instancesPerGpuStr) return 1;
    
    // Handle environment variable syntax: ${COMFYUI_INSTANCES_PER_GPU:-1}
    const match = instancesPerGpuStr.match(/\${.*:-(\d+)}/);
    if (match) {
      return parseInt(match[1]);
    }
    
    // Handle direct number
    const parsed = parseInt(instancesPerGpuStr);
    return isNaN(parsed) ? 1 : parsed;
  }

  /**
   * FIXED: Generate service apps using installer-based logic instead of hardcoded connector types
   */
  async generateServiceApps(workerType, instanceCount, workerConfig, serviceConfig, actualServiceName) {
    const apps = [];
    
    this.logger.log(`🔍 [FIXED-SERVICE-DEBUG] generateServiceApps called:`);
    this.logger.log(`🔍 [FIXED-SERVICE-DEBUG] - workerType: "${workerType}"`);
    this.logger.log(`🔍 [FIXED-SERVICE-DEBUG] - instanceCount: ${instanceCount}`);
    this.logger.log(`🔍 [FIXED-SERVICE-DEBUG] - actualServiceName: "${actualServiceName}"`);
    this.logger.log(`🔍 [FIXED-SERVICE-DEBUG] - serviceConfig.installer: "${serviceConfig.installer}"`);
    this.logger.log(`🔍 [FIXED-SERVICE-DEBUG] - serviceConfig.type: "${serviceConfig.type}"`);
    
    // FIXED: Use installer field instead of connector name parsing
    if (serviceConfig.type === 'internal') {
      this.logger.log(`✅ [FIXED-SERVICE-DEBUG] Service type is 'internal', proceeding with app creation`);
      
      // Calculate actual instance count based on GPU binding
      const instancesPerGpu = this.parseInstancesPerGpu(serviceConfig.service_instances_per_gpu);
      const gpuCount = this.hardwareResources?.gpus?.length || 1;
      const totalInstances = serviceConfig.is_gpu_bound ? instancesPerGpu * gpuCount : instancesPerGpu;
      
      this.logger.log(`🔍 [FIXED-SERVICE-DEBUG] Calculated instances: instancesPerGpu=${instancesPerGpu}, gpuCount=${gpuCount}, totalInstances=${totalInstances}`);
      
      for (let i = 0; i < totalInstances; i++) {
        this.logger.log(`🔍 [FIXED-SERVICE-DEBUG] Creating app ${i+1}/${totalInstances} for installer: "${serviceConfig.installer}"`);
        
        // FIXED: Use installer field to determine PM2 app creation method
        if (serviceConfig.installer === 'ComfyUIManagementClient') {
          this.logger.log(`✅ [FIXED-SERVICE-DEBUG] Creating ComfyUI app for instance ${i}`);
          apps.push(this.createComfyUIApp(actualServiceName, i));
        } else if (serviceConfig.installer === 'SimulationService') {
          this.logger.log(`✅ [FIXED-SERVICE-DEBUG] Creating Simulation app for instance ${i}`);
          apps.push(this.createSimulationApp(actualServiceName, i));
        } else {
          this.logger.error(`❌ [FIXED-SERVICE-DEBUG] Unknown service installer: "${serviceConfig.installer}"`);
          throw new Error(`Unknown service installer: ${serviceConfig.installer}. Add support in generateServiceApps.`);
        }
      }
    } else {
      this.logger.log(`❌ [FIXED-SERVICE-DEBUG] Service type is '${serviceConfig.type}', not 'internal'. Skipping app creation.`);
    }
    
    this.logger.log(`🎉 [FIXED-SERVICE-DEBUG] generateServiceApps returning ${apps.length} apps for "${actualServiceName}"`);
    return apps;
  }

  // ... (rest of the methods stay the same, just copy from the existing file)
}