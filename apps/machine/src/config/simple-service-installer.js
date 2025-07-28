/**
 * Service Installation Coordinator - JavaScript version
 * Simplified version for machine integration
 */

export class ServiceInstallationCoordinator {
  constructor() {
    this.logger = {
      log: (msg) => console.log(`[ServiceInstaller] ${msg}`),
      warn: (msg) => console.warn(`[ServiceInstaller] ${msg}`),
      error: (msg) => console.error(`[ServiceInstaller] ${msg}`)
    };
  }

  /**
   * Plan service installations based on worker configuration
   */
  async planInstallations(workerConfig, machineResources) {
    this.logger.log('Planning service installations...');
    
    const installations = [];
    const processedServices = new Set();
    
    // Process each required service
    for (const serviceName of workerConfig.services) {
      if (processedServices.has(serviceName)) {
        continue;
      }
      
      const { WorkerConfigurationParser } = await import('./worker-config-parser.js');
      const parser = new WorkerConfigurationParser();
      
      const serviceWorkers = workerConfig.workers.filter(w => {
        const mapping = parser.getServiceMapping(w.connector);
        return mapping?.service === serviceName;
      });
      
      if (serviceWorkers.length === 0) {
        continue;
      }
      
      const installation = await this.planServiceInstallation(serviceName, serviceWorkers, machineResources);
      installations.push(installation);
      processedServices.add(serviceName);
    }
    
    return installations;
  }

  /**
   * Plan installation for a specific service
   */
  async planServiceInstallation(serviceName, serviceWorkers, machineResources) {
    this.logger.log(`Planning installation for service: ${serviceName}`);
    
    const firstWorker = serviceWorkers[0];
    const { WorkerConfigurationParser } = await import('./worker-config-parser.js');
    const parser = new WorkerConfigurationParser();
    const mapping = parser.getServiceMapping(firstWorker.connector);
    
    const installation = {
      serviceName,
      serviceType: mapping?.type || 'unknown',
      installer: mapping?.installer,
      resourceBinding: mapping?.resource_binding || 'shared',
      instances: [],
      requirements: {
        hasGpu: mapping?.resource_binding === 'gpu',
        minRamGB: this.calculateMinRam(serviceName),
        ports: []
      }
    };
    
    // Generate service instances based on resource binding
    if (mapping?.resource_binding === 'gpu') {
      // GPU-bound service - one instance per GPU
      for (let gpu = 0; gpu < machineResources.gpuCount; gpu++) {
        installation.instances.push({
          instanceId: `${serviceName}-gpu${gpu}`,
          gpuId: gpu,
          port: (mapping?.port_base || 8000) + gpu,
          resourceBinding: 'gpu'
        });
      }
    } else {
      // CPU or shared service - single instance
      installation.instances.push({
        instanceId: serviceName,
        port: mapping?.port_base || 9000,
        resourceBinding: mapping?.resource_binding || 'shared'
      });
    }
    
    // Collect all ports
    installation.requirements.ports = installation.instances.map(i => i.port);
    
    return installation;
  }

  /**
   * Calculate minimum RAM requirement for a service
   */
  calculateMinRam(serviceName) {
    const ramRequirements = {
      'comfyui': 4,      // ComfyUI needs ~4GB per instance
      'playwright': 1,   // Playwright needs ~1GB
      'simulation': 0.5  // Simulation is lightweight
    };
    
    return ramRequirements[serviceName] || 0.5;
  }

  /**
   * Validate installations against machine capabilities
   */
  validateInstallations(installations, machineResources) {
    const validation = {
      valid: true,
      errors: [],
      warnings: [],
      totalRamGB: 0,
      gpuInstances: 0
    };
    
    for (const installation of installations) {
      // Check GPU requirements
      const gpuInstances = installation.instances.filter(i => i.resourceBinding === 'gpu').length;
      validation.gpuInstances += gpuInstances;
      
      if (gpuInstances > 0 && !machineResources.hasGpu) {
        validation.errors.push(`Service ${installation.serviceName} requires GPU but machine has none`);
        validation.valid = false;
      }
      
      if (gpuInstances > machineResources.gpuCount) {
        validation.errors.push(`Service ${installation.serviceName} requires ${gpuInstances} GPUs but machine only has ${machineResources.gpuCount}`);
        validation.valid = false;
      }
      
      // Check RAM requirements
      const serviceRam = installation.requirements.minRamGB * installation.instances.length;
      validation.totalRamGB += serviceRam;
      
      // Check port conflicts
      const usedPorts = new Set();
      for (const instance of installation.instances) {
        if (usedPorts.has(instance.port)) {
          validation.errors.push(`Port conflict detected: ${instance.port}`);
          validation.valid = false;
        }
        usedPorts.add(instance.port);
      }
    }
    
    // Check total RAM
    if (validation.totalRamGB > machineResources.ramGB) {
      validation.warnings.push(`Total RAM requirement (${validation.totalRamGB}GB) exceeds available RAM (${machineResources.ramGB}GB)`);
    }
    
    // Check total GPU usage
    if (validation.gpuInstances > machineResources.gpuCount) {
      validation.errors.push(`Total GPU instances (${validation.gpuInstances}) exceed available GPUs (${machineResources.gpuCount})`);
      validation.valid = false;
    }
    
    return validation;
  }

  /**
   * Generate installation summary
   */
  generateSummary(installations, machineResources) {
    const lines = [];
    
    lines.push('Service Installation Plan:');
    lines.push(`  Total Services: ${installations.length}`);
    
    let totalInstances = 0;
    let totalRam = 0;
    let totalGpuInstances = 0;
    
    for (const installation of installations) {
      totalInstances += installation.instances.length;
      totalRam += installation.requirements.minRamGB * installation.instances.length;
      totalGpuInstances += installation.instances.filter(i => i.resourceBinding === 'gpu').length;
      
      lines.push(`  - ${installation.serviceName}:`);
      lines.push(`    Type: ${installation.serviceType}`);
      lines.push(`    Instances: ${installation.instances.length}`);
      lines.push(`    Resource Binding: ${installation.resourceBinding}`);
      lines.push(`    Ports: [${installation.requirements.ports.join(', ')}]`);
      lines.push(`    RAM per instance: ${installation.requirements.minRamGB}GB`);
      
      if (installation.instances.length > 1) {
        installation.instances.forEach(instance => {
          const gpuInfo = instance.gpuId !== undefined ? ` (GPU ${instance.gpuId})` : '';
          lines.push(`      ${instance.instanceId}${gpuInfo}: port ${instance.port}`);
        });
      }
    }
    
    lines.push('');
    lines.push('Resource Summary:');
    lines.push(`  Total Service Instances: ${totalInstances}`);
    lines.push(`  Total RAM Required: ${totalRam}GB`);
    lines.push(`  Total GPU Instances: ${totalGpuInstances}`);
    lines.push(`  Machine GPUs Available: ${machineResources.gpuCount}`);
    lines.push(`  Machine RAM Available: ${machineResources.ramGB}GB`);
    
    return lines.join('\n');
  }
}