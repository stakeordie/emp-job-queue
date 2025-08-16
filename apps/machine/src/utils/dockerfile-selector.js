import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Determines the appropriate Dockerfile based on worker specifications
 * Ensures all services in a machine use compatible Dockerfiles
 */
export class DockerfileSelector {
  constructor(serviceMappingPath = null) {
    this.serviceMappingPath = serviceMappingPath || 
      path.join(__dirname, '../config/service-mapping.json');
    this.serviceMapping = null;
  }

  async loadServiceMapping() {
    if (!this.serviceMapping) {
      this.serviceMapping = await fs.readJSON(this.serviceMappingPath);
    }
    return this.serviceMapping;
  }

  /**
   * Parse worker spec string into structured format
   * @param {string} workerSpec - e.g., "comfyui:auto,simulation:20"
   * @returns {Array} Array of {type, count} objects
   */
  parseWorkerSpec(workerSpec) {
    if (!workerSpec) return [];
    
    return workerSpec.split(',').map(spec => {
      const [type, count] = spec.trim().split(':');
      return {
        type: type.trim(),
        count: count === 'auto' ? 'auto' : parseInt(count, 10)
      };
    });
  }

  /**
   * Get service configuration from worker type
   * @param {string} workerType - e.g., "comfyui", "openai", "simulation-websocket"
   * @returns {Object} Service configuration
   */
  getServiceForWorker(workerType) {
    const mapping = this.serviceMapping;
    
    // Check if it's a direct service name
    if (mapping.services[workerType]) {
      return mapping.services[workerType];
    }
    
    // Check worker mappings
    if (mapping.workers[workerType]) {
      // Return the first service from the worker's services array
      const firstService = mapping.workers[workerType].services[0];
      return mapping.services[firstService];
    }
    
    // Handle special cases
    if (workerType.startsWith('simulation')) {
      // Simulation can use either simulation-http or simulation-websocket
      return mapping.services['simulation-websocket'] || 
             mapping.services['simulation-http'];
    }
    
    throw new Error(`Unknown worker type: ${workerType}`);
  }

  /**
   * Determine the Dockerfile for a worker specification
   * @param {string} workerSpec - e.g., "comfyui:auto,simulation:20"
   * @returns {Object} {dockerfile, target, compatible, reason}
   */
  async selectDockerfile(workerSpec) {
    await this.loadServiceMapping();
    
    const workers = this.parseWorkerSpec(workerSpec);
    
    if (workers.length === 0) {
      return {
        dockerfile: 'Dockerfile',
        target: 'minimal-machine',
        compatible: true,
        reason: 'No workers specified, using minimal image'
      };
    }
    
    // Collect all required Dockerfiles
    const dockerfiles = new Map();
    const nonSimulationServices = [];
    
    for (const worker of workers) {
      // Skip simulation services in initial pass
      if (worker.type === 'simulation' || 
          worker.type.startsWith('simulation-')) {
        continue;
      }
      
      try {
        const service = this.getServiceForWorker(worker.type);
        const dockerfile = service.dockerfile || 'Dockerfile';
        const target = service.build_stage || 'base';
        
        nonSimulationServices.push(worker.type);
        
        if (dockerfiles.size > 0 && !dockerfiles.has(dockerfile)) {
          // Incompatible Dockerfiles detected
          return {
            dockerfile: null,
            target: null,
            compatible: false,
            reason: `Incompatible services: ${worker.type} requires ${dockerfile}, but other services require ${Array.from(dockerfiles.keys()).join(', ')}`
          };
        }
        
        dockerfiles.set(dockerfile, target);
      } catch (error) {
        return {
          dockerfile: null,
          target: null,
          compatible: false,
          reason: `Failed to resolve service for worker type '${worker.type}': ${error.message}`
        };
      }
    }
    
    // If only simulation services, use minimal image
    if (dockerfiles.size === 0 && workers.some(w => 
        w.type === 'simulation' || w.type.startsWith('simulation-'))) {
      return {
        dockerfile: 'Dockerfile',
        target: 'minimal-machine',
        compatible: true,
        reason: 'Simulation-only configuration, using minimal image for efficiency'
      };
    }
    
    // Return the selected Dockerfile
    const [dockerfile, target] = dockerfiles.entries().next().value || ['Dockerfile', 'base'];
    
    return {
      dockerfile,
      target,
      compatible: true,
      reason: `Selected ${dockerfile} for services: ${nonSimulationServices.join(', ')}`
    };
  }

  /**
   * Validate that a worker specification is compatible
   * @param {string} workerSpec - e.g., "comfyui:auto,openai:1"
   * @returns {Object} Validation result with details
   */
  async validateWorkerSpec(workerSpec) {
    const result = await this.selectDockerfile(workerSpec);
    
    if (!result.compatible) {
      return {
        valid: false,
        error: result.reason,
        suggestion: this.getSuggestion(workerSpec)
      };
    }
    
    return {
      valid: true,
      dockerfile: result.dockerfile,
      target: result.target,
      message: result.reason
    };
  }

  /**
   * Get suggestions for fixing incompatible worker specs
   * @param {string} workerSpec - The incompatible spec
   * @returns {string} Suggestion message
   */
  getSuggestion(workerSpec) {
    const workers = this.parseWorkerSpec(workerSpec);
    
    // Group workers by their required Dockerfile
    const groups = new Map();
    
    for (const worker of workers) {
      try {
        const service = this.getServiceForWorker(worker.type);
        const dockerfile = service.dockerfile || 'Dockerfile';
        
        if (!groups.has(dockerfile)) {
          groups.set(dockerfile, []);
        }
        groups.get(dockerfile).push(`${worker.type}:${worker.count}`);
      } catch (error) {
        // Skip unknown workers
      }
    }
    
    if (groups.size <= 1) {
      return 'Configuration should be compatible. Check for typos in worker types.';
    }
    
    const suggestions = [];
    for (const [dockerfile, workers] of groups) {
      suggestions.push(`Machine with ${dockerfile}: ${workers.join(',')}`);
    }
    
    return `Split into separate machines:\n${suggestions.join('\n')}`;
  }

  /**
   * Get Dockerfile metadata
   * @param {string} dockerfileName - Name of the Dockerfile
   * @returns {Object} Dockerfile metadata
   */
  getDockerfileInfo(dockerfileName) {
    const mapping = this.serviceMapping;
    
    if (!mapping.dockerfile_rules || !mapping.dockerfile_rules.dockerfiles) {
      return null;
    }
    
    return mapping.dockerfile_rules.dockerfiles[dockerfileName] || null;
  }
}

// Export singleton instance for convenience
export default new DockerfileSelector();