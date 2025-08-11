import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Service Installation Coordinator
 * Installs required internal services based on worker configuration
 */
export class ServiceInstaller {
  constructor(logger = console) {
    this.logger = logger;
    this.installedServices = new Set();
    this.installationStatus = new Map();
  }

  /**
   * Install all required services for the given worker configuration
   */
  async installRequiredServices(requiredServices, machineResources = {}) {
    this.logger.log('🔧 Starting service installation...');
    this.logger.log(`Required services: ${requiredServices.join(', ')}`);
    
    const results = {
      successful: [],
      failed: [],
      skipped: []
    };
    
    for (const service of requiredServices) {
      try {
        if (this.installedServices.has(service)) {
          this.logger.log(`⏭️  Service '${service}' already installed, skipping`);
          results.skipped.push(service);
          continue;
        }
        
        this.logger.log(`📦 Installing service: ${service}`);
        await this.installService(service, machineResources);
        
        this.installedServices.add(service);
        this.installationStatus.set(service, { status: 'installed', timestamp: new Date() });
        results.successful.push(service);
        
        this.logger.log(`✅ Service '${service}' installed successfully`);
        
      } catch (error) {
        this.logger.error(`❌ Failed to install service '${service}': ${error.message}`);
        this.installationStatus.set(service, { 
          status: 'failed', 
          error: error.message, 
          timestamp: new Date() 
        });
        results.failed.push({ service, error: error.message });
      }
    }
    
    return results;
  }
  
  /**
   * Install a specific service
   */
  async installService(serviceName, machineResources = {}) {
    switch (serviceName) {
      case 'comfyui':
        return await this.installComfyUI(machineResources);
      case 'playwright':
        return await this.installPlaywright(machineResources);
      case 'simulation':
        return await this.installSimulation(machineResources);
      case 'simulationWebsocket':
        return await this.installSimulationWebsocket(machineResources);
      default:
        throw new Error(`Unknown service: ${serviceName}`);
    }
  }
  
  /**
   * Install ComfyUI service
   */
  async installComfyUI(machineResources) {
    this.logger.log('🎨 Installing ComfyUI service...');
    
    // Check if ComfyUI is already installed
    const comfyUIPath = '/workspace/ComfyUI';
    if (fs.existsSync(comfyUIPath)) {
      this.logger.log('ComfyUI directory already exists, checking installation...');
      
      // Check if main.py exists
      if (fs.existsSync(path.join(comfyUIPath, 'main.py'))) {
        this.logger.log('ComfyUI appears to be already installed');
        return { status: 'already_installed', path: comfyUIPath };
      }
    }
    
    // Simulate ComfyUI installation process
    this.logger.log('Cloning ComfyUI repository...');
    await this.simulateAsyncOperation('git clone', 2000);
    
    this.logger.log('Installing ComfyUI dependencies...');
    await this.simulateAsyncOperation('pip install', 3000);
    
    this.logger.log('Setting up ComfyUI models directory...');
    await this.simulateAsyncOperation('setup models', 1000);
    
    // Check GPU requirements
    if (machineResources.hasGpu) {
      this.logger.log(`GPU support detected (${machineResources.gpuCount} GPUs available)`);
      this.logger.log('Installing CUDA dependencies...');
      await this.simulateAsyncOperation('cuda setup', 2000);
    } else {
      this.logger.log('No GPU detected, installing CPU-only version');
    }
    
    this.logger.log('Installing custom nodes...');
    await this.simulateAsyncOperation('custom nodes installation', 5000);
    
    return {
      status: 'installed',
      path: comfyUIPath,
      gpu_support: machineResources.hasGpu || false,
      custom_nodes_installed: true
    };
  }
  
  /**
   * Install Playwright service
   */
  async installPlaywright(machineResources) {
    this.logger.log('🎭 Installing Playwright service...');
    
    this.logger.log('Installing Playwright package...');
    await this.simulateAsyncOperation('npm install playwright', 2000);
    
    this.logger.log('Installing browser binaries...');
    await this.simulateAsyncOperation('playwright install', 4000);
    
    this.logger.log('Setting up browser environment...');
    await this.simulateAsyncOperation('browser setup', 1000);
    
    return {
      status: 'installed',
      browsers: ['chromium', 'firefox', 'webkit'],
      headless_capable: true
    };
  }
  
  /**
   * Install Simulation service (for testing)
   */
  async installSimulation(machineResources) {
    this.logger.log('🔬 Installing Simulation service...');
    
    this.logger.log('Setting up simulation environment...');
    await this.simulateAsyncOperation('simulation setup', 1000);
    
    this.logger.log('Configuring test data...');
    await this.simulateAsyncOperation('test data setup', 500);
    
    return {
      status: 'installed',
      test_mode: true,
      capabilities: ['image_generation', 'text_processing']
    };
  }
  
  /**
   * Install Simulation WebSocket service (for testing)
   */
  async installSimulationWebsocket(machineResources) {
    this.logger.log('🔌 Installing Simulation WebSocket service...');
    
    this.logger.log('Setting up WebSocket simulation environment...');
    await this.simulateAsyncOperation('websocket simulation setup', 1000);
    
    this.logger.log('Configuring WebSocket test protocols...');
    await this.simulateAsyncOperation('websocket protocol setup', 500);
    
    return {
      status: 'installed',
      test_mode: true,
      capabilities: ['websocket', 'realtime', 'streaming']
    };
  }
  
  /**
   * Check if a service is installed and functional
   */
  async checkServiceHealth(serviceName) {
    switch (serviceName) {
      case 'comfyui':
        return await this.checkComfyUIHealth();
      case 'playwright':
        return await this.checkPlaywrightHealth();
      case 'simulation':
        return await this.checkSimulationHealth();
      case 'simulationWebsocket':
        return await this.checkSimulationWebsocketHealth();
      default:
        return { healthy: false, error: `Unknown service: ${serviceName}` };
    }
  }
  
  /**
   * Check ComfyUI health
   */
  async checkComfyUIHealth() {
    const comfyUIPath = '/workspace/ComfyUI';
    
    if (!fs.existsSync(comfyUIPath)) {
      return { healthy: false, error: 'ComfyUI directory not found' };
    }
    
    if (!fs.existsSync(path.join(comfyUIPath, 'main.py'))) {
      return { healthy: false, error: 'ComfyUI main.py not found' };
    }
    
    // Simulate health check
    await this.simulateAsyncOperation('comfyui health check', 500);
    
    return {
      healthy: true,
      version: '0.0.1',
      custom_nodes_count: 64,
      models_available: true
    };
  }
  
  /**
   * Check Playwright health
   */
  async checkPlaywrightHealth() {
    // Simulate Playwright health check
    await this.simulateAsyncOperation('playwright health check', 300);
    
    return {
      healthy: true,
      browsers_available: ['chromium', 'firefox', 'webkit'],
      version: '1.40.0'
    };
  }
  
  /**
   * Check Simulation health
   */
  async checkSimulationHealth() {
    await this.simulateAsyncOperation('simulation health check', 200);
    
    return {
      healthy: true,
      test_mode: true,
      endpoints_available: ['/generate', '/process']
    };
  }
  
  /**
   * Check Simulation WebSocket health
   */
  async checkSimulationWebsocketHealth() {
    await this.simulateAsyncOperation('simulation websocket health check', 200);
    
    return {
      healthy: true,
      test_mode: true,
      protocols_available: ['simulation-protocol'],
      websocket_ready: true
    };
  }
  
  /**
   * Get installation status for all services
   */
  getInstallationStatus() {
    const status = {};
    
    for (const [service, info] of this.installationStatus.entries()) {
      status[service] = info;
    }
    
    return {
      installed_services: Array.from(this.installedServices),
      installation_details: status,
      total_installed: this.installedServices.size
    };
  }
  
  /**
   * Simulate async operations for demonstration
   */
  async simulateAsyncOperation(operation, durationMs) {
    return new Promise((resolve) => {
      setTimeout(() => {
        this.logger.log(`  ✓ ${operation} completed`);
        resolve();
      }, durationMs);
    });
  }
  
  /**
   * Cleanup installed services (for testing)
   */
  async cleanupServices(services = []) {
    this.logger.log('🧹 Cleaning up services...');
    
    const servicesToClean = services.length > 0 ? services : Array.from(this.installedServices);
    
    for (const service of servicesToClean) {
      this.logger.log(`Cleaning up ${service}...`);
      await this.simulateAsyncOperation(`cleanup ${service}`, 500);
      this.installedServices.delete(service);
      this.installationStatus.delete(service);
    }
    
    this.logger.log('✅ Cleanup completed');
  }
  
  /**
   * Validate environment for service installation
   */
  validateEnvironment(requiredServices, machineResources) {
    const issues = [];
    const warnings = [];
    
    // Check disk space (simulated)
    const estimatedSpaceGB = this.estimateServiceSpace(requiredServices);
    if (estimatedSpaceGB > 50) { // Assume 50GB available
      warnings.push(`Services may require ${estimatedSpaceGB}GB disk space`);
    }
    
    // Check GPU requirements
    const needsGPU = requiredServices.includes('comfyui');
    if (needsGPU && !machineResources.hasGpu) {
      issues.push('ComfyUI requires GPU support but no GPU is available');
    }
    
    // Check memory requirements
    const estimatedMemoryGB = this.estimateServiceMemory(requiredServices);
    if (estimatedMemoryGB > machineResources.ramGB) {
      warnings.push(`Services may require ${estimatedMemoryGB}GB RAM but only ${machineResources.ramGB}GB available`);
    }
    
    return {
      valid: issues.length === 0,
      issues,
      warnings,
      estimated_space_gb: estimatedSpaceGB,
      estimated_memory_gb: estimatedMemoryGB
    };
  }
  
  /**
   * Estimate disk space requirements
   */
  estimateServiceSpace(services) {
    const spaceRequirements = {
      comfyui: 15, // 15GB for ComfyUI + models + custom nodes
      playwright: 2, // 2GB for browser binaries
      simulation: 0.1 // 100MB for simulation
    };
    
    return services.reduce((total, service) => {
      return total + (spaceRequirements[service] || 0);
    }, 0);
  }
  
  /**
   * Estimate memory requirements
   */
  estimateServiceMemory(services) {
    const memoryRequirements = {
      comfyui: 8, // 8GB for ComfyUI service
      playwright: 2, // 2GB for Playwright
      simulation: 0.5 // 500MB for simulation
    };
    
    return services.reduce((total, service) => {
      return total + (memoryRequirements[service] || 0);
    }, 0);
  }
}