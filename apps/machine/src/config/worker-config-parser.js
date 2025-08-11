/**
 * Worker Configuration Parser - JavaScript version
 * Simplified version for machine integration
 */

import fs from 'fs';
import path from 'path';

export class WorkerConfigurationParser {
  constructor() {
    this.logger = {
      log: (msg) => console.log(`[WorkerConfigParser] ${msg}`),
      warn: (msg) => console.warn(`[WorkerConfigParser] ${msg}`),
      error: (msg) => console.error(`[WorkerConfigParser] ${msg}`)
    };
  }

  /**
   * Parse WORKER_CONNECTORS environment variable
   * Format: "comfyui:2,openai:4,playwright:1" or "comfyui:auto" (resource binding from service-mapping.json)
   */
  parseWorkerConnectors(workerConnectorsStr, hardwareResources = null) {
    if (!workerConnectorsStr || workerConnectorsStr.trim() === '') {
      throw new Error('WORKER_CONNECTORS cannot be empty');
    }
    
    this.logger.log(`Parsing worker connectors: ${workerConnectorsStr}`);
    
    const workerSpecs = this.parseWorkerSpecs(workerConnectorsStr);
    
    // Resolve 'auto' counts based on hardware resources
    this.resolveAutoCounts(workerSpecs, hardwareResources);
    
    const requiredServices = this.getRequiredServices(workerSpecs);
    
    // Categorize workers by resource binding
    const gpuWorkers = workerSpecs.filter(w => w.binding === 'gpu');
    const cpuWorkers = workerSpecs.filter(w => w.binding === 'cpu');
    const sharedWorkers = workerSpecs.filter(w => w.binding === 'shared');
    
    const totalWorkerCount = workerSpecs.reduce((sum, w) => sum + w.count, 0);
    
    return {
      workers: workerSpecs,
      services: Array.from(requiredServices),
      requiredServices: Array.from(requiredServices),
      gpuWorkers,
      cpuWorkers, 
      sharedWorkers,
      totalWorkers: totalWorkerCount,
      totalWorkerCount
    };
  }
  
  /**
   * Parse individual worker specifications from string
   * Now uses service mapping for binding instead of parsing from string
   */
  parseWorkerSpecs(workerConnectorsStr) {
    const parts = workerConnectorsStr.split(',').map(s => s.trim());
    const workerSpecs = [];
    
    for (const part of parts) {
      if (!part) continue;
      
      const [connector, countStr] = part.split(':');
      
      if (!connector || !countStr) {
        throw new Error(`Invalid WORKER_CONNECTORS format: "${part}". Expected format: "connector:count"`);
      }
      
      // Handle 'auto' for automatic GPU detection
      let count;
      if (countStr.toLowerCase() === 'auto') {
        count = 'auto'; // Will be resolved later based on resource binding
      } else {
        count = parseInt(countStr);
        if (isNaN(count) || count <= 0) {
          throw new Error(`Invalid worker count: "${countStr}". Must be a positive integer or 'auto'.`);
        }
      }
      
      // Get binding from service mapping instead of parsing from string
      const mapping = this.getServiceMapping(connector);
      if (!mapping) {
        throw new Error(`Unknown connector: "${connector}". Check service-mapping.json for supported connectors.`);
      }
      
      // Get resource binding from the first service (they should all be consistent)
      let binding = 'shared';
      if (mapping.services && mapping.services.length > 0) {
        const serviceMapping = this.getFullServiceMapping();
        const firstService = serviceMapping.services?.[mapping.services[0]];
        binding = firstService?.resource_binding || 'shared';
        
        // Handle environment variable expansion in resource_binding
        if (typeof binding === 'string' && binding.includes('${')) {
          // Extract environment variable name and default value
          const match = binding.match(/\$\{([^:}]+)(?::([^}]+))?\}/);
          if (match) {
            const [, envVar, defaultValue] = match;
            binding = process.env[envVar] || defaultValue || 'shared';
          }
        }
      }
      
      workerSpecs.push({
        connector,
        count,
        binding
      });
    }
    
    if (workerSpecs.length === 0) {
      throw new Error('No valid worker specifications found in WORKER_CONNECTORS');
    }
    
    return workerSpecs;
  }
  
  /**
   * Resolve 'auto' counts based on hardware resources and resource binding
   */
  resolveAutoCounts(workerSpecs, hardwareResources) {
    for (const spec of workerSpecs) {
      if (spec.count === 'auto') {
        if (spec.binding === 'gpu') {
          // For GPU workers, use detected GPU count
          spec.count = hardwareResources?.gpuCount || parseInt(process.env.MACHINE_NUM_GPUS || '1');
          this.logger.log(`Auto-resolved ${spec.connector} GPU workers to ${spec.count} (detected GPUs)`);
        } else if (spec.binding === 'mock_gpu') {
          // For mock GPU, default to a reasonable number if not specified
          spec.count = parseInt(process.env.MOCK_GPU_NUM || '2');
          this.logger.log(`Auto-resolved ${spec.connector} mock GPU workers to ${spec.count} (from MOCK_GPU_NUM or default)`);
        } else if (spec.binding === 'cpu') {
          // For CPU workers, use CPU core count or default
          spec.count = hardwareResources?.cpuCount || parseInt(process.env.MACHINE_NUM_CPUS || '4');
          this.logger.log(`Auto-resolved ${spec.connector} CPU workers to ${spec.count} (detected CPUs)`);
        } else if (spec.binding === 'shared') {
          // For shared workers, use a default
          spec.count = 1;
          this.logger.log(`Auto-resolved ${spec.connector} shared workers to ${spec.count} (default for shared resources)`);
        } else {
          throw new Error(`Cannot auto-resolve worker count for unknown binding: ${spec.binding}`);
        }
      }
    }
  }

  /**
   * Get required services from worker specs
   */
  getRequiredServices(workerSpecs) {
    const services = new Set();
    const serviceMapping = this.getFullServiceMapping();
    
    workerSpecs.forEach(spec => {
      const mapping = this.getServiceMapping(spec.connector);
      if (mapping && mapping.services) {
        mapping.services.forEach(serviceName => {
          const serviceConfig = serviceMapping.services?.[serviceName];
          if (serviceConfig && serviceConfig.type === 'internal') {
            services.add(serviceName);
          }
        });
      }
    });
    
    return services;
  }
  
  /**
   * Get full service mapping from JSON file
   */
  getFullServiceMapping() {
    const serviceMappingPath = path.join(path.dirname(import.meta.url.replace('file://', '')), 'service-mapping.json');
    
    try {
      return JSON.parse(fs.readFileSync(serviceMappingPath, 'utf8'));
    } catch (error) {
      this.logger.error(`Failed to load service mapping from ${serviceMappingPath}: ${error.message}`);
      throw new Error(`Service mapping file not found or invalid. Cannot proceed without connector definitions.`);
    }
  }
  
  /**
   * Get service mapping for a connector from JSON file
   */
  getServiceMapping(connector) {
    const serviceMapping = this.getFullServiceMapping();
    // Look for the connector in the workers section
    return serviceMapping.workers[connector];
  }
  
  /**
   * Validate worker configuration against machine capabilities
   */
  validateConfiguration(config, machineResources) {
    const errors = [];
    const warnings = [];
    
    // Check GPU requirements
    const gpuWorkersCount = config.gpuWorkers.reduce((sum, w) => sum + w.count, 0);
    if (gpuWorkersCount > 0 && !machineResources.hasGpu) {
      errors.push(`Configuration requires ${gpuWorkersCount} GPU workers but machine has no GPU`);
    } else if (gpuWorkersCount > machineResources.gpuCount) {
      errors.push(`Configuration requires ${gpuWorkersCount} GPU workers but machine only has ${machineResources.gpuCount} GPUs`);
    }
    
    // Check memory requirements (basic estimation)
    const estimatedMemoryGB = this.estimateMemoryUsage(config);
    if (estimatedMemoryGB > machineResources.ramGB) {
      warnings.push(`Estimated memory usage (${estimatedMemoryGB}GB) may exceed available RAM (${machineResources.ramGB}GB)`);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  /**
   * Estimate memory usage for workers (rough calculation)
   */
  estimateMemoryUsage(config) {
    let totalMemoryGB = 0;
    const serviceMapping = this.getFullServiceMapping();
    
    for (const workerSpec of config.workers) {
      const mapping = this.getServiceMapping(workerSpec.connector);
      
      // Rough memory estimates per worker type based on services
      let memoryPerWorker = 0.5; // Default for external APIs
      
      if (mapping?.services) {
        for (const serviceName of mapping.services) {
          const serviceConfig = serviceMapping.services?.[serviceName];
          if (serviceConfig) {
            if (serviceConfig.connector === 'ComfyUIConnector') {
              memoryPerWorker = Math.max(memoryPerWorker, 4); // ComfyUI ~4GB per instance
            } else if (serviceConfig.connector === 'PlaywrightConnector') {
              memoryPerWorker = Math.max(memoryPerWorker, 1); // Playwright ~1GB
            }
          }
        }
      }
      
      totalMemoryGB += workerSpec.count * memoryPerWorker;
    }
    
    return Math.ceil(totalMemoryGB);
  }
  
  /**
   * Generate a summary of the worker configuration
   */
  generateSummary(config, machineResources) {
    const lines = [];
    
    lines.push(`Worker Configuration Summary:`);
    lines.push(`  Total Workers: ${config.totalWorkerCount}`);
    lines.push(`  GPU Workers: ${config.gpuWorkers.length > 0 ? config.gpuWorkers.map(w => `${w.connector}:${w.count}`).join(', ') : 'none'}`);
    lines.push(`  CPU Workers: ${config.cpuWorkers.length > 0 ? config.cpuWorkers.map(w => `${w.connector}:${w.count}`).join(', ') : 'none'}`);
    lines.push(`  Shared Workers: ${config.sharedWorkers.length > 0 ? config.sharedWorkers.map(w => `${w.connector}:${w.count}`).join(', ') : 'none'}`);
    lines.push(`  Required Services: ${config.requiredServices.length > 0 ? config.requiredServices.join(', ') : 'none'}`);
    
    lines.push(`Machine Resources:`);
    lines.push(`  GPUs: ${machineResources.gpuCount} (available: ${machineResources.hasGpu})`);
    lines.push(`  RAM: ${machineResources.ramGB}GB`);
    lines.push(`  Estimated Memory Usage: ${this.estimateMemoryUsage(config)}GB`);
    
    return lines.join('\n');
  }
}