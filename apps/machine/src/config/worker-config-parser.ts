import { serviceMappingHelper, ConnectorConfig } from './service-mapping.js';

// Types for worker configuration
export interface WorkerSpec {
  connector: string;
  count: number;
  binding: 'gpu' | 'cpu' | 'shared' | 'mock_gpu';
}

export interface ParsedWorkerConfig {
  workers: WorkerSpec[];
  requiredServices: string[];
  requiredEnvVars: string[];
  gpuWorkers: WorkerSpec[];
  cpuWorkers: WorkerSpec[];
  sharedWorkers: WorkerSpec[];
  mockGpuWorkers: WorkerSpec[];
  totalWorkerCount: number;
  serviceInstances: ServiceInstance[];
}

export interface ServiceInstance {
  service: string;
  connector: string;
  instanceId: string;
  resourceBinding: 'gpu' | 'cpu' | 'shared' | 'mock_gpu';
  gpuId?: number;
  ports: number[];
  pm2Name: string;
  isMockGpu?: boolean; // Flag for mock GPU instances
}

export interface MachineResources {
  gpuCount: number;
  ramGB: number;
  hasGpu: boolean;
  cpuCores?: number;
}

export class WorkerConfigParser {
  private mapping = serviceMappingHelper;
  
  /**
   * Parse WORKERS environment variable
   * Format: "comfyui:2,openai:4,playwright:1" (resource binding from service-mapping.json)
   */
  parseWorkerConnectors(workerConnectorsStr: string): ParsedWorkerConfig {
    if (!workerConnectorsStr || workerConnectorsStr.trim() === '') {
      throw new Error('WORKERS cannot be empty');
    }
    
    const workerSpecs = this.parseWorkerSpecs(workerConnectorsStr);
    const requiredServices = this.mapping.getRequiredServices(workerSpecs.map(w => w.connector));
    const requiredEnvVars = this.mapping.getRequiredEnvVars(workerSpecs.map(w => w.connector));
    
    // Categorize workers by resource binding
    const gpuWorkers = workerSpecs.filter(w => w.binding === 'gpu');
    const cpuWorkers = workerSpecs.filter(w => w.binding === 'cpu');
    const sharedWorkers = workerSpecs.filter(w => w.binding === 'shared');
    const mockGpuWorkers = workerSpecs.filter(w => w.binding === 'mock_gpu');
    
    const totalWorkerCount = workerSpecs.reduce((sum, w) => sum + w.count, 0);
    
    return {
      workers: workerSpecs,
      requiredServices,
      requiredEnvVars,
      gpuWorkers,
      cpuWorkers, 
      sharedWorkers,
      mockGpuWorkers,
      totalWorkerCount,
      serviceInstances: [] // Will be populated by generateServiceInstances
    };
  }
  
  /**
   * Parse individual worker specifications from string
   */
  private parseWorkerSpecs(workerConnectorsStr: string): WorkerSpec[] {
    const parts = workerConnectorsStr.split(',').map(s => s.trim());
    const workerSpecs: WorkerSpec[] = [];
    
    for (const part of parts) {
      if (!part) continue;
      
      const [connector, countStr] = part.split(':');
      
      if (!connector || !countStr) {
        throw new Error(`Invalid WORKERS format: "${part}". Expected format: "connector:count"`);
      }
      
      const count = parseInt(countStr);
      if (isNaN(count) || count <= 0) {
        throw new Error(`Invalid worker count: "${countStr}". Must be a positive integer.`);
      }
      
      // Validate connector exists and get binding from service mapping
      if (!this.mapping.isValidConnector(connector)) {
        throw new Error(`Unknown connector: "${connector}". Check service-mapping.json for available connectors.`);
      }
      
      const connectorConfig = this.mapping.getConnector(connector)!;
      const binding = connectorConfig.resource_binding;
      
      workerSpecs.push({
        connector,
        count,
        binding: binding as 'gpu' | 'cpu' | 'shared'
      });
    }
    
    if (workerSpecs.length === 0) {
      throw new Error('No valid worker specifications found in WORKERS');
    }
    
    return workerSpecs;
  }
  
  /**
   * Generate service instances based on worker specs and machine resources
   */
  generateServiceInstances(
    config: ParsedWorkerConfig, 
    machineResources: MachineResources
  ): ServiceInstance[] {
    const instances: ServiceInstance[] = [];
    
    // Validate GPU requirements (real GPU workers only, not mock_gpu)
    const gpuWorkersCount = config.gpuWorkers.reduce((sum, w) => sum + w.count, 0);
    if (gpuWorkersCount > 0 && !machineResources.hasGpu) {
      throw new Error(`GPU workers specified but machine has no GPU available`);
    }
    if (gpuWorkersCount > machineResources.gpuCount) {
      throw new Error(`${gpuWorkersCount} GPU workers specified but only ${machineResources.gpuCount} GPUs available`);
    }
    
    // Mock GPU workers don't need actual GPUs - they simulate GPU behavior with CPU
    
    let currentGpuId = 0;
    
    // Process each worker spec
    for (const workerSpec of config.workers) {
      const connectorConfig = this.mapping.getConnector(workerSpec.connector)!;
      
      if (connectorConfig.type === 'internal') {
        // Create service instances for internal services
        for (let i = 0; i < workerSpec.count; i++) {
          // For mock_gpu, assign mock GPU IDs like real GPUs but mark as CPU mode
          const isMockGpu = workerSpec.binding === 'mock_gpu';
          const isRealGpu = workerSpec.binding === 'gpu';
          const mockGpuId = isMockGpu ? i : undefined; // Mock GPU ID is just the index
          const realGpuId = isRealGpu ? currentGpuId : undefined;
          
          const instance = this.createServiceInstance(
            workerSpec,
            connectorConfig,
            i,
            realGpuId || mockGpuId // Use real GPU ID if available, else mock GPU ID
          );
          
          // Mark mock GPU instances
          if (isMockGpu) {
            instance.isMockGpu = true;
          }
          
          instances.push(instance);
          
          if (isRealGpu) {
            currentGpuId++;
          }
        }
      } else {
        // External services don't need service instances
        // Workers will connect directly to external APIs
        console.log(`External connector "${workerSpec.connector}" - no service instance needed`);
      }
    }
    
    config.serviceInstances = instances;
    return instances;
  }
  
  /**
   * Create a single service instance
   */
  private createServiceInstance(
    workerSpec: WorkerSpec,
    connectorConfig: ConnectorConfig,
    instanceIndex: number,
    gpuId?: number
  ): ServiceInstance {
    const service = connectorConfig.service!;
    const instanceId = `${service}-${instanceIndex}`;
    const pm2Name = gpuId !== undefined ? `${service}-gpu${gpuId}` : `${service}-${instanceIndex}`;
    
    // Calculate ports for this instance
    const ports = this.mapping.calculatePorts(workerSpec.connector, 1);
    const adjustedPorts = ports.map(port => {
      if (gpuId !== undefined && connectorConfig.port_increment) {
        return port + (gpuId * connectorConfig.port_increment);
      }
      return port + instanceIndex;
    });
    
    return {
      service,
      connector: workerSpec.connector,
      instanceId,
      resourceBinding: workerSpec.binding,
      gpuId,
      ports: adjustedPorts,
      pm2Name
    };
  }
  
  /**
   * Validate worker configuration against machine capabilities
   */
  validateConfiguration(
    config: ParsedWorkerConfig,
    machineResources: MachineResources
  ): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
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
    
    // Check for port conflicts
    const portConflicts = this.checkPortConflicts(config);
    if (portConflicts.length > 0) {
      errors.push(`Port conflicts detected: ${portConflicts.join(', ')}`);
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
  private estimateMemoryUsage(config: ParsedWorkerConfig): number {
    let totalMemoryGB = 0;
    
    for (const workerSpec of config.workers) {
      const connectorConfig = this.mapping.getConnector(workerSpec.connector)!;
      
      // Rough memory estimates per worker type
      let memoryPerWorker = 0;
      if (connectorConfig.service === 'comfyui') {
        memoryPerWorker = 4; // ComfyUI ~4GB per instance
      } else if (connectorConfig.service === 'playwright') {
        memoryPerWorker = 1; // Playwright ~1GB
      } else {
        memoryPerWorker = 0.5; // External APIs ~0.5GB per worker
      }
      
      totalMemoryGB += workerSpec.count * memoryPerWorker;
    }
    
    return Math.ceil(totalMemoryGB);
  }
  
  /**
   * Check for port conflicts between service instances
   */
  private checkPortConflicts(config: ParsedWorkerConfig): number[] {
    const usedPorts = new Set<number>();
    const conflicts: number[] = [];
    
    for (const instance of config.serviceInstances) {
      for (const port of instance.ports) {
        if (usedPorts.has(port)) {
          conflicts.push(port);
        } else {
          usedPorts.add(port);
        }
      }
    }
    
    return conflicts;
  }
  
  /**
   * Generate a summary of the worker configuration
   */
  generateSummary(config: ParsedWorkerConfig, machineResources: MachineResources): string {
    const lines: string[] = [];
    
    lines.push(`Worker Configuration Summary:`);
    lines.push(`  Total Workers: ${config.totalWorkerCount}`);
    lines.push(`  GPU Workers: ${config.gpuWorkers.length > 0 ? config.gpuWorkers.map(w => `${w.connector}:${w.count}`).join(', ') : 'none'}`);
    lines.push(`  CPU Workers: ${config.cpuWorkers.length > 0 ? config.cpuWorkers.map(w => `${w.connector}:${w.count}`).join(', ') : 'none'}`);
    lines.push(`  Shared Workers: ${config.sharedWorkers.length > 0 ? config.sharedWorkers.map(w => `${w.connector}:${w.count}`).join(', ') : 'none'}`);
    lines.push(`  Required Services: ${config.requiredServices.length > 0 ? config.requiredServices.join(', ') : 'none'}`);
    lines.push(`  Required Environment Variables: ${config.requiredEnvVars.length > 0 ? config.requiredEnvVars.join(', ') : 'none'}`);
    lines.push(`  Service Instances: ${config.serviceInstances.length}`);
    
    if (config.serviceInstances.length > 0) {
      lines.push(`  Instance Details:`);
      for (const instance of config.serviceInstances) {
        const gpuInfo = instance.gpuId !== undefined ? ` (GPU ${instance.gpuId})` : '';
        const portsInfo = instance.ports.length > 0 ? ` [ports: ${instance.ports.join(', ')}]` : '';
        lines.push(`    ${instance.pm2Name}: ${instance.service}${gpuInfo}${portsInfo}`);
      }
    }
    
    lines.push(`Machine Resources:`);
    lines.push(`  GPUs: ${machineResources.gpuCount} (available: ${machineResources.hasGpu})`);
    lines.push(`  RAM: ${machineResources.ramGB}GB`);
    lines.push(`  Estimated Memory Usage: ${this.estimateMemoryUsage(config)}GB`);
    
    return lines.join('\n');
  }
}

// Export singleton instance
export const workerConfigParser = new WorkerConfigParser();