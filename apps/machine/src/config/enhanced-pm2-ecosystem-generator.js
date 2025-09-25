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
import { SERVICE_TYPES, WORKER_TYPES, isValidServiceType } from './service-types.js';
// import { getRequiredEnvInt } from '@emp/core/utils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class EnhancedPM2EcosystemGenerator {
  constructor() {
    const BUILD_TIMESTAMP = '2025-09-25T06:30:00.000Z';
    const FILE_VERSION = 'ENHANCED-DAEMON-LOGS-v1';

    console.log(`🎉🎉🎉 [ENHANCED-GENERATOR-CONSTRUCTOR] === ENHANCED PM2 ECOSYSTEM GENERATOR CONSTRUCTOR CALLED ===`);
    console.log(`🎉🎉🎉 [ENHANCED-GENERATOR-CONSTRUCTOR] BUILD TIMESTAMP: ${BUILD_TIMESTAMP}`);
    console.log(`🎉🎉🎉 [ENHANCED-GENERATOR-CONSTRUCTOR] FILE VERSION: ${FILE_VERSION}`);
    console.log(`🎉🎉🎉 [ENHANCED-GENERATOR-CONSTRUCTOR] Current Time: ${new Date().toISOString()}`);
    console.log(`🎉🎉🎉 [ENHANCED-GENERATOR-CONSTRUCTOR] CONSTRUCTOR EXECUTING SUCCESSFULLY`);

    this.logger = {
      log: (msg) => console.log(`[🔥 Enhanced Generator] ${msg}`),
      warn: (msg) => console.warn(`[🔥 Enhanced Generator] ${msg}`),
      error: (msg) => console.error(`[🔥 Enhanced Generator] ${msg}`)
    };
    
    this.hardwareDetector = new HardwareDetector();
    this.serviceMapping = null;
    this.serviceEnvMapping = null;
    this.hardwareResources = null;
    this.servicePairs = []; // Track service-worker pairs as they're created
  }

  /**
   * Main method to generate PM2 ecosystem configuration
   */
  async generateEcosystem() {
    try {
      this.logger.log('🔥🔥🔥 [ALT-ECOSYSTEM-TRACE] === STARTING generateEcosystem ===');
      this.logger.log('🔥🔥🔥 [ALT-ECOSYSTEM-TRACE] 🚀 Starting ALTERNATE enhanced PM2 ecosystem generation...');

      // Load service mapping configuration
      this.logger.log('⭐⭐⭐ [ECOSYSTEM-TRACE] Loading service mapping...');
      await this.loadServiceMapping();
      this.logger.log('⭐⭐⭐ [ECOSYSTEM-TRACE] Service mapping loaded successfully');
      
      // Detect hardware resources
      this.logger.log('⭐⭐⭐ [ECOSYSTEM-TRACE] Detecting hardware resources...');
      this.hardwareResources = await this.hardwareDetector.detectResources();
      this.logger.log('⭐⭐⭐ [ECOSYSTEM-TRACE] Hardware detection completed');
      
      // PROMINENT GPU DETECTION RESULT FOR ECOSYSTEM GENERATION
      console.log('');
      console.log('🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯');
      console.log('🎯 ECOSYSTEM GENERATOR: GPU DETECTION RESULT');
      console.log(`🎯 GPU COUNT: ${this.hardwareResources.gpuCount}`);
      console.log(`🎯 GPU MODEL: ${this.hardwareResources.gpuModel}`);
      console.log(`🎯 GPU VENDOR: ${this.hardwareResources.gpuVendor}`);
      console.log(`🎯 GPU MEMORY: ${this.hardwareResources.gpuMemoryGB}GB`);
      console.log(`🎯 HAS GPU: ${this.hardwareResources.hasGpu}`);
      console.log('🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯');
      console.log('');
      
      // Skip daemon services - now handled at system level in entrypoint
      this.logger.log('⭐⭐⭐ [ECOSYSTEM-TRACE] Skipping daemon services (handled at system level)...');
      this.logger.log('⭐⭐⭐ [ECOSYSTEM-TRACE] System-level services (Ollama, etc.) should already be running');

      // Parse worker specifications from environment
      this.logger.log('⭐⭐⭐ [ECOSYSTEM-TRACE] Parsing worker specifications...');
      const workerSpecs = this.parseWorkerSpecs();
      this.logger.log('⭐⭐⭐ [ECOSYSTEM-TRACE] Worker specs parsed. About to call generateApps with:');
      this.logger.log('⭐⭐⭐ [ECOSYSTEM-TRACE] workerSpecs: ' + JSON.stringify(workerSpecs));
      
      // Generate PM2 apps configuration
      this.logger.log('⭐⭐⭐ [ECOSYSTEM-TRACE] 🚀🚀🚀 CALLING generateApps...');
      const apps = await this.generateApps(workerSpecs);
      this.logger.log('⭐⭐⭐ [ECOSYSTEM-TRACE] 🎉🎉🎉 generateApps returned ' + apps.length + ' apps');
      
      // Write ecosystem configuration
      await this.writeEcosystemConfig(apps);
      
      this.logger.log('✅ Enhanced PM2 ecosystem generation completed successfully');
      
    } catch (error) {
      this.logger.error(`Enhanced PM2 ecosystem generation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Start daemon services (binary daemons like Ollama that don't run in PM2)
   */
  async startDaemonServices() {
    this.logger.log('🔍🔍🔍 [DAEMON-SERVICE-DETECTION] Starting daemon service detection...');

    // First get the worker specs to know what we actually need
    const workerSpecs = this.parseWorkerSpecs();
    this.logger.log(`🔍 [DAEMON-SERVICE-DETECTION] Worker specs: ${JSON.stringify(workerSpecs)}`);

    // Get services needed by these workers
    const neededServices = new Set();
    for (const spec of workerSpecs) {
      const workerConfig = this.serviceMapping.workers[spec.type];
      if (workerConfig && workerConfig.services) {
        workerConfig.services.forEach(service => neededServices.add(service));
      }
    }
    this.logger.log(`🔍 [DAEMON-SERVICE-DETECTION] Services needed by workers: ${Array.from(neededServices).join(', ')}`);

    // Log all available services for debugging
    const allServices = Object.entries(this.serviceMapping.services);
    this.logger.log(`🔍 [DAEMON-SERVICE-DETECTION] Total services in mapping: ${allServices.length}`);
    for (const [serviceName, serviceConfig] of allServices) {
      this.logger.log(`🔍 [DAEMON-SERVICE-DETECTION] Service: ${serviceName}, type: "${serviceConfig.type}"`);
    }

    // Filter for daemon services that are actually needed by current workers
    const daemonServices = Object.entries(this.serviceMapping.services)
      .filter(([serviceName, serviceConfig]) => {
        const isDaemonService = serviceConfig.type === SERVICE_TYPES.DAEMON_SERVICE ||
                               serviceConfig.type === SERVICE_TYPES.MANAGED_SERVICE; // Legacy support
        const isNeeded = neededServices.has(serviceName);
        this.logger.log(`🔍 [DAEMON-SERVICE-DETECTION] Service ${serviceName}: isDaemon=${isDaemonService}, isNeeded=${isNeeded}`);
        return isDaemonService && isNeeded;
      });

    this.logger.log(`🔍 [DAEMON-SERVICE-DETECTION] SERVICE_TYPES.DAEMON_SERVICE = "${SERVICE_TYPES.DAEMON_SERVICE}"`);
    this.logger.log(`🔍 [DAEMON-SERVICE-DETECTION] SERVICE_TYPES.MANAGED_SERVICE = "${SERVICE_TYPES.MANAGED_SERVICE}"`);

    if (daemonServices.length === 0) {
      this.logger.log('⚠️ [DAEMON-SERVICE-DETECTION] No daemon services needed by current workers - skipping daemon startup');
      return;
    }

    this.logger.log(`🎉 [DAEMON-SERVICE-DETECTION] Found ${daemonServices.length} daemon services needed by workers:`);

    for (const [serviceName, serviceConfig] of daemonServices) {
      console.log(`🚀🚀🚀 [DAEMON-SERVICE-LOOP] STARTING DAEMON SERVICE: ${serviceName} (${serviceConfig.type})`);
      this.logger.log(`🚀 [DAEMON-SERVICE-DETECTION] Starting: ${serviceName} (${serviceConfig.type})`);

      try {
        console.log(`🔧🔧🔧 [DAEMON-SERVICE-LOOP] CALLING startDaemonService for: ${serviceName}`);
        await this.startDaemonService(serviceName, serviceConfig);
        console.log(`✅✅✅ [DAEMON-SERVICE-LOOP] DAEMON SERVICE STARTED: ${serviceName}`);
        this.logger.log(`✅ Started daemon service: ${serviceName}`);
      } catch (error) {
        console.log(`❌❌❌ [DAEMON-SERVICE-LOOP] DAEMON SERVICE FAILED: ${serviceName} - ${error.message}`);
        this.logger.error(`❌ Failed to start daemon service ${serviceName}: ${error.message}`);
        this.logger.error(`❌ Stack trace: ${error.stack}`);
        // Don't throw - continue with other services and PM2 apps
        // The daemon client workers will handle connection failures
      }
    }

    console.log(`🎉🎉🎉 [DAEMON-SERVICE-LOOP] ALL DAEMON SERVICES PROCESSED (${daemonServices.length} total)`);
    this.logger.log(`🎉 All daemon services processed`);
  }

  /**
   * Start a single daemon service
   */
  async startDaemonService(serviceName, serviceConfig) {
    this.logger.log(`🚀🚀🚀 [DAEMON-INSTALLER] Starting daemon service: ${serviceName}`);
    this.logger.log(`🔧 [DAEMON-INSTALLER] Service config: ${JSON.stringify(serviceConfig, null, 2)}`);

    const { installer, installer_filename } = serviceConfig;

    if (!installer) {
      const errorMsg = `Daemon service ${serviceName} has no installer specified`;
      this.logger.error(`❌ [DAEMON-INSTALLER] ${errorMsg}`);
      throw new Error(errorMsg);
    }

    this.logger.log(`🔍 [DAEMON-INSTALLER] Installer class: ${installer}`);
    this.logger.log(`🔍 [DAEMON-INSTALLER] Installer filename: ${installer_filename || 'not specified'}`);

    try {
      // Use installer_filename if provided, otherwise fall back to auto-generation
      let installerPath;
      if (installer_filename) {
        installerPath = installer_filename;
        this.logger.log(`📂 [DAEMON-INSTALLER] Using explicit installer path: ${installerPath}`);
      } else {
        // Auto-generate path from installer class name (legacy support)
        installerPath = `./services/${installer.toLowerCase().replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase().replace('installer', '-installer')}.js`;
        this.logger.log(`🔧 [DAEMON-INSTALLER] Auto-generated installer path: ${installerPath}`);
      }

      this.logger.log(`📦 [DAEMON-INSTALLER] Loading installer module from: ${installerPath}`);
      const installerModule = await import(installerPath);
      this.logger.log(`✅ [DAEMON-INSTALLER] Installer module loaded successfully`);

      this.logger.log(`🔍 [DAEMON-INSTALLER] Looking for installer class: ${installer}`);
      const InstallerClass = installerModule.default || installerModule[installer];

      if (!InstallerClass) {
        const errorMsg = `Installer class ${installer} not found in ${installerPath}`;
        this.logger.error(`❌ [DAEMON-INSTALLER] ${errorMsg}`);
        this.logger.log(`🔍 [DAEMON-INSTALLER] Available exports: ${Object.keys(installerModule).join(', ')}`);
        throw new Error(errorMsg);
      }

      this.logger.log(`✅ [DAEMON-INSTALLER] Installer class found: ${InstallerClass.name}`);
      this.logger.log(`🔧 [DAEMON-INSTALLER] Creating installer instance...`);
      const installer_instance = new InstallerClass(serviceConfig);
      this.logger.log(`✅ [DAEMON-INSTALLER] Installer instance created`);

      console.log(`🚀🚀🚀 [DAEMON-INSTALLER] ABOUT TO CALL installer.install() for ${serviceName}...`);
      this.logger.log(`🚀 [DAEMON-INSTALLER] Calling installer.install() for ${serviceName}...`);

      const installStartTime = Date.now();
      await installer_instance.install();
      const installDuration = Date.now() - installStartTime;

      console.log(`🎉🎉🎉 [DAEMON-INSTALLER] installer.install() COMPLETED for ${serviceName} (${Math.round(installDuration / 1000)}s)`);
      this.logger.log(`🎉 [DAEMON-INSTALLER] Installer.install() completed successfully for ${serviceName}`);

      this.logger.log(`🎉🎉🎉 [DAEMON-INSTALLER] Daemon service ${serviceName} started successfully`);
    } catch (error) {
      this.logger.error(`💥 [DAEMON-INSTALLER] Failed to start daemon service ${serviceName}: ${error.message}`);
      this.logger.error(`💥 [DAEMON-INSTALLER] Stack trace: ${error.stack}`);
      throw new Error(`Failed to start ${serviceName}: ${error.message}`);
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
    this.logger.log('🔥🔥🔥 [PARSEWORKERSPECS-TRACE] === ENTERING parseWorkerSpecs ===');
    
    const workersEnv = process.env.WORKERS || '';
    this.logger.log('🔥🔥🔥 [PARSEWORKERSPECS-TRACE] WORKERS env var: "' + workersEnv + '"');
    
    const workerSpecs = [];
    
    if (!workersEnv) {
      this.logger.log('🔥🔥🔥 [PARSEWORKERSPECS-TRACE] ❌ No WORKERS env var found, using defaults');
      this.logger.warn('No WORKERS environment variable found, using defaults');
      return [{ type: 'simulation', count: 1 }];
    }
    
    this.logger.log('🔥🔥🔥 [PARSEWORKERSPECS-TRACE] ✅ WORKERS env var found, parsing...');
    const specs = workersEnv.split(',').map(s => s.trim()).filter(s => s);
    this.logger.log('🔥🔥🔥 [PARSEWORKERSPECS-TRACE] Split specs: ' + JSON.stringify(specs));
    
    for (const spec of specs) {
      const [type, countStr] = spec.split(':');
      
      if (!this.serviceMapping.workers[type]) {
        this.logger.warn(`Unknown worker type: ${type}, skipping`);
        continue;
      }
      
      // Handle 'auto' count with new worker type logic
      let count;
      if (countStr && countStr.toLowerCase() === 'auto') {
        const workerConfig = this.serviceMapping.workers[type];
        const workerType = workerConfig.type || 'direct_worker'; // Default for existing configs
        const scalingStrategy = workerConfig.scaling_strategy;
        const isGpuBound = workerConfig.is_gpu_bound;
        const gpuMode = process.env.GPU_MODE || 'actual';

        if (workerType === WORKER_TYPES.SERVICE_CLIENT) {
          // Service client workers scale based on concurrency, not GPUs
          if (scalingStrategy === 'concurrency') {
            count = parseInt(process.env[`${type.toUpperCase()}_CONCURRENCY`]) || 2;
            this.logger.log(`🔍 Auto-resolved ${type} ${workerType} workers to ${count} (concurrency-based)`);
          } else {
            count = 1; // Default for service client workers
            this.logger.log(`🔍 Auto-resolved ${type} ${workerType} workers to ${count} (default)`);
          }
        } else if (workerType === WORKER_TYPES.DAEMON_CLIENT) {
          // Daemon client workers should scale based on the daemon's GPU capacity
          // Even though the workers don't use GPU directly, they send requests to a daemon that does
          if (scalingStrategy === 'concurrency' && isGpuBound === false) {
            // Check if this daemon actually needs GPU resources by looking at the daemon service config
            const daemonServices = workerConfig.services || [];
            let daemonUsesGpu = false;
            for (const serviceName of daemonServices) {
              const serviceConfig = this.serviceMapping.services[serviceName];
              if (serviceConfig && serviceConfig.type === 'daemon_service') {
                // For daemon services like Ollama, scale based on GPU count to prevent oversubscription
                daemonUsesGpu = true;
                break;
              }
            }

            if (daemonUsesGpu) {
              if (gpuMode === 'mock') {
                count = Math.max(1, parseInt(process.env.NUM_GPUS) || 1);
              } else {
                count = Math.max(1, this.hardwareResources.gpuCount);
              }
              this.logger.log(`🔍 Auto-resolved ${type} ${workerType} workers to ${count} (GPU-limited daemon capacity)`);
            } else {
              count = parseInt(process.env[`${type.toUpperCase()}_CONCURRENCY`]) || 2;
              this.logger.log(`🔍 Auto-resolved ${type} ${workerType} workers to ${count} (concurrency-based)`);
            }
          } else {
            count = 1; // Default for daemon client workers
            this.logger.log(`🔍 Auto-resolved ${type} ${workerType} workers to ${count} (default)`);
          }
        } else if (isGpuBound) {
          // GPU-bound direct workers (traditional pattern)
          if (gpuMode === 'mock') {
            count = 1;
            this.logger.log(`🔍 Auto-resolved ${type} GPU workers to ${count} (GPU_MODE=mock: auto=1)`);
          } else {
            count = this.hardwareResources.gpuCount;
            this.logger.log(`🔍 Auto-resolved ${type} GPU workers to ${count} (GPU_MODE=actual: auto=detected GPUs)`);
          }
        } else {
          // Non-GPU-bound direct workers: auto = 1
          count = 1;
          this.logger.log(`🔍 Auto-resolved ${type} workers to ${count} (non-GPU-bound: auto=1)`);
        }
      } else {
        // For specific numbers, apply worker type constraints
        const requestedCount = parseInt(countStr) || 1;
        const workerConfig = this.serviceMapping.workers[type];
        const workerType = workerConfig.type || 'direct_worker';
        const isGpuBound = workerConfig.is_gpu_bound;
        const gpuMode = process.env.GPU_MODE || 'actual';

        if (workerType === WORKER_TYPES.SERVICE_CLIENT || workerType === WORKER_TYPES.DAEMON_CLIENT) {
          // Client workers: use requested count (no GPU limits)
          count = requestedCount;
          this.logger.log(`🔍 Using ${type} ${workerType} workers: ${count} (no GPU constraints)`);
        } else if (isGpuBound && gpuMode === 'actual') {
          // GPU-bound direct workers in actual mode: limit to detected GPU count
          count = Math.min(requestedCount, this.hardwareResources.gpuCount);
          if (count < requestedCount) {
            this.logger.log(`🔍 Limited ${type} workers from ${requestedCount} to ${count} (GPU_MODE=actual: limited by available GPUs)`);
          } else {
            this.logger.log(`🔍 Using ${type} workers: ${count} (GPU_MODE=actual: within available GPUs)`);
          }
        } else {
          // GPU-bound workers in mock mode OR non-GPU-bound workers: use requested count
          count = requestedCount;
          this.logger.log(`🔍 Using ${type} workers: ${count} (GPU_MODE=mock or non-GPU-bound: use requested count)`);
        }
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
    this.logger.log(`💥💥💥 [GENERATEAPPS-TRACE] === ENTERED generateApps ===`);
    this.logger.log(`💥💥💥 [GENERATEAPPS-TRACE] workerSpecs: ${JSON.stringify(workerSpecs)}`);
    this.logger.log(`💥💥💥 [GENERATEAPPS-TRACE] workerSpecs.length: ${workerSpecs.length}`);
    
    const apps = [];
    
    // Add health server (no more shared-setup - removed earlier)
    this.logger.log(`💥💥💥 [GENERATEAPPS-TRACE] Adding health server app...`);
    apps.push(this.createHealthServerApp());
    this.logger.log(`💥💥💥 [GENERATEAPPS-TRACE] Health server app added. Current apps count: ${apps.length}`);
    
    // Fluent Bit runs as separate process, not through PM2
    
    // Generate apps for each worker specification
    this.logger.log(`🚨🚨🚨 [GENERATEWORKERAPPS-TRACE] === ABOUT TO LOOP THROUGH ${workerSpecs.length} WORKER SPECS ===`);
    
    for (const spec of workerSpecs) {
      this.logger.log(`🚨🚨🚨 [GENERATEWORKERAPPS-TRACE] === PROCESSING WORKER SPEC ===`);
      this.logger.log(`🚨🚨🚨 [GENERATEWORKERAPPS-TRACE] spec.type: "${spec.type}"`);
      this.logger.log(`🚨🚨🚨 [GENERATEWORKERAPPS-TRACE] spec.count: ${spec.count}`);
      
      const workerConfig = this.serviceMapping.workers[spec.type];
      this.logger.log(`🚨🚨🚨 [GENERATEWORKERAPPS-TRACE] workerConfig found: ${!!workerConfig}`);
      this.logger.log(`🚨🚨🚨 [GENERATEWORKERAPPS-TRACE] workerConfig: ${JSON.stringify(workerConfig)}`);
      
      this.logger.log(`🚨🚨🚨 [GENERATEWORKERAPPS-TRACE] 🚀🚀🚀 CALLING generateWorkerApps for "${spec.type}"`);
      const workerApps = await this.generateWorkerApps(spec.type, spec.count, workerConfig);
      this.logger.log(`🚨🚨🚨 [GENERATEWORKERAPPS-TRACE] 🎉🎉🎉 generateWorkerApps returned ${workerApps.length} apps`);
      
      apps.push(...workerApps);
    }
    
    this.logger.log(`📊 Generated ${apps.length} PM2 app configurations`);
    
    return apps;
  }

  /**
   * Generate PM2 apps for a specific worker type
   */
  async generateWorkerApps(workerType, requestedCount, workerConfig) {
    this.logger.log(`🎯🎯🎯 [GENERATEWORKERAPPS-ENTRY] === ENTERED generateWorkerApps ===`);
    this.logger.log(`🎯🎯🎯 [GENERATEWORKERAPPS-ENTRY] workerType: "${workerType}"`);
    this.logger.log(`🎯🎯🎯 [GENERATEWORKERAPPS-ENTRY] requestedCount: ${requestedCount}`);
    this.logger.log(`🎯🎯🎯 [GENERATEWORKERAPPS-ENTRY] workerConfig: ${JSON.stringify(workerConfig)}`);
    
    const apps = [];
    
    // Determine actual instance count based on resource binding
    const instanceCount = this.calculateInstanceCount(workerConfig, requestedCount);
    
    // Generate Redis worker instances first and store them
    const workerApps = [];
    for (let i = 0; i < instanceCount; i++) {
      const app = this.createRedisWorkerApp(workerType, i, workerConfig, instanceCount);
      apps.push(app);
      workerApps.push(app);
    }
    
    // Generate service-specific apps (ComfyUI, etc.) if needed
    this.logger.log(`🔥🔥🔥 [GENERATESERVICEAPPS-TRACE] === CHECKING IF generateServiceApps SHOULD BE CALLED ===`);
    this.logger.log(`🔥🔥🔥 [GENERATESERVICEAPPS-TRACE] workerType: "${workerType}"`);
    this.logger.log(`🔥🔥🔥 [GENERATESERVICEAPPS-TRACE] workerConfig: ${JSON.stringify(workerConfig)}`);
    this.logger.log(`🔥🔥🔥 [GENERATESERVICEAPPS-TRACE] workerConfig.services exists: ${!!workerConfig.services}`);
    this.logger.log(`🔥🔥🔥 [GENERATESERVICEAPPS-TRACE] workerConfig.services value: ${JSON.stringify(workerConfig.services)}`);
    
    if (workerConfig.services) {
      this.logger.log(`🔥🔥🔥 [GENERATESERVICEAPPS-TRACE] ✅ CONDITION MET: workerConfig.services exists`);
      this.logger.log(`🔥🔥🔥 [GENERATESERVICEAPPS-TRACE] Processing ${workerConfig.services.length} services for worker "${workerType}"`);
      
      for (const serviceName of workerConfig.services) {
        this.logger.log(`🔥🔥🔥 [GENERATESERVICEAPPS-TRACE] === PROCESSING SERVICE: "${serviceName}" ===`);
        
        const serviceConfig = this.serviceMapping.services[serviceName];
        this.logger.log(`🔥🔥🔥 [GENERATESERVICEAPPS-TRACE] Service config lookup result: ${!!serviceConfig}`);
        this.logger.log(`🔥🔥🔥 [GENERATESERVICEAPPS-TRACE] Service config: ${JSON.stringify(serviceConfig)}`);
        
        if (serviceConfig) {
          this.logger.log(`🔥🔥🔥 [GENERATESERVICEAPPS-TRACE] ✅ CONDITION MET: serviceConfig exists`);
          this.logger.log(`🔥🔥🔥 [GENERATESERVICEAPPS-TRACE] Service type: "${serviceConfig.type}"`);
          
          if (serviceConfig.type === 'internal') {
            this.logger.log(`🔥🔥🔥 [GENERATESERVICEAPPS-TRACE] ✅ CONDITION MET: serviceConfig.type === 'internal'`);
            this.logger.log(`🔥🔥🔥 [GENERATESERVICEAPPS-TRACE] 🚀🚀🚀 CALLING generateServiceApps for "${serviceName}"`);
            
            const serviceApps = await this.generateServiceApps(workerType, instanceCount, workerConfig, serviceConfig, serviceName);
            
            this.logger.log(`🔥🔥🔥 [GENERATESERVICEAPPS-TRACE] 🎉🎉🎉 generateServiceApps returned ${serviceApps.length} apps for "${serviceName}"`);
            apps.push(...serviceApps);
            
            // Capture service-worker pairs using actual app names that were just created
            this.captureServicePairs(serviceApps, workerApps, serviceName);
          } else {
            this.logger.log(`🔥🔥🔥 [GENERATESERVICEAPPS-TRACE] ❌ CONDITION FAILED: serviceConfig.type !== 'internal' (got "${serviceConfig.type}")`);
            this.logger.log(`🔥🔥🔥 [GENERATESERVICEAPPS-TRACE] External service "${serviceName}" - no service pairing needed`);
          }
        } else {
          this.logger.log(`🔥🔥🔥 [GENERATESERVICEAPPS-TRACE] ❌ CONDITION FAILED: serviceConfig not found for "${serviceName}"`);
          this.logger.log(`🔥🔥🔥 [GENERATESERVICEAPPS-TRACE] Available service names: ${JSON.stringify(Object.keys(this.serviceMapping.services))}`);
        }
      }
    } else {
      this.logger.log(`🔥🔥🔥 [GENERATESERVICEAPPS-TRACE] ❌ CONDITION FAILED: workerConfig.services does not exist`);
      this.logger.log(`🔥🔥🔥 [GENERATESERVICEAPPS-TRACE] workerConfig keys: ${JSON.stringify(Object.keys(workerConfig))}`);
    }
    
    return apps;
  }

  /**
   * Parse instances per GPU from service config string
   */
  parseInstancesPerGpu(instancesPerGpuStr) {
    if (!instancesPerGpuStr) return 1;
    
    console.log(`🔍 [FIXED-PARSE-DEBUG ${new Date().toISOString()}] Parsing instancesPerGpu: "${instancesPerGpuStr}"`);
    
    // Handle environment variable syntax: ${COMFYUI_INSTANCES_PER_GPU:-1}
    const match = instancesPerGpuStr.match(/\${.*:-(\d+)}/);
    if (match) {
      const parsed = parseInt(match[1]);
      console.log(`✅ [FIXED-PARSE-DEBUG ${new Date().toISOString()}] Parsed from env syntax: ${parsed}`);
      return parsed;
    }
    
    // Handle direct number
    const parsed = parseInt(instancesPerGpuStr);
    const result = isNaN(parsed) ? 1 : parsed;
    console.log(`✅ [FIXED-PARSE-DEBUG ${new Date().toISOString()}] Parsed as direct number: ${result}`);
    return result;
  }

  /**
   * Calculate actual instance count based on GPU binding and hardware
   */
  calculateInstanceCount(workerConfig, requestedCount) {
    const isGpuBound = workerConfig.is_gpu_bound;
    
    if (!isGpuBound) {
      // Non-GPU-bound workers: use requested count
      return requestedCount;
    }
    
    // GPU-bound workers: apply GPU_MODE logic
    const gpuMode = process.env.GPU_MODE || 'actual';
    
    if (gpuMode === 'mock') {
      // Mock mode: use requested count (no hardware limits)
      return requestedCount;
    } else {
      // Actual mode: limit to detected GPU count (hardware detector handles detection)
      return Math.min(requestedCount, this.hardwareResources.gpuCount);
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
        ...process.env, // Pass through ALL environment variables
        
        // Override/add specific values
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
    
    const isGpuBound = workerConfig.is_gpu_bound;
    
    const generatedWorkerId = `${process.env.MACHINE_ID || 'unknown-machine'}-worker-${workerType}-${index}`;
    this.logger.log(`🔴 [PM2-GENERATOR-DEBUG] Generated WORKER_ID: "${generatedWorkerId}"`);
    
    // Generate environment variables - start with ALL current environment variables
    const env = {
      ...process.env, // Pass through ALL environment variables
      
      // Override/add specific values
      NODE_ENV: 'production',
      LOG_LEVEL: 'info',
      WORKER_ID: generatedWorkerId,
      HUB_REDIS_URL: (() => {
        const redisUrl = process.env.HUB_REDIS_URL;
        if (!redisUrl) {
          const errorMsg = `
❌ FATAL ERROR: HUB_REDIS_URL environment variable is not set during PM2 ecosystem generation!

The PM2 ecosystem generator requires HUB_REDIS_URL to be set BEFORE the container starts.

This is a CRITICAL deployment configuration error. The environment variable must be available
when the container initializes, not just at runtime.

For Railway/Vast.ai/Docker deployments:
  1. Set HUB_REDIS_URL in your deployment configuration
  2. Ensure it's injected as an environment variable when starting the container
  3. For Docker: docker run -e HUB_REDIS_URL=redis://... 
  4. For Railway: Add to service environment variables (not just build)

Debugging information:
  - Container start time: ${new Date().toISOString()}
  - Service: ${workerType}
  - Worker index: ${index}
  - Environment check:
${Object.keys(process.env).filter(k => k.includes('HUB') || k.includes('REDIS')).map(k => `    - ${k}=${process.env[k]}`).join('\n') || '    (no HUB_ or REDIS variables found)'}

This container will now exit. Please fix the deployment configuration and restart.
`;
          console.error(errorMsg);
          require('fs').writeFileSync('/tmp/redis-url-error.log', errorMsg);
          process.exit(1);
        }
        return redisUrl;
      })(),
      MACHINE_ID: process.env.MACHINE_ID || 'unknown',
      
      // Disable ConnectorLogger Fluent Bit transport - use file tailing instead
      DISABLE_FLUENT_BIT_LOGGING: 'true',
      
      // Worker type specification
      CONNECTORS: workerType,
      
      // Resource binding handled via --cuda-device argument, not environment variables
      
      // Copy worker-specific environment variables
      ...this.getWorkerEnvironmentVars(workerConfig),
      
      // Service-specific configuration
      ...this.getServiceEnvironmentVars(workerConfig, index)
    };

    const appName = isGpuBound ? `redis-worker-${workerType}-gpu${index}` : `redis-worker-${workerType}-${index}`;

    // For ComfyUI workers, add the service port as an argument
    const args = ['redis-worker', isGpuBound ? `--cuda-device=${index}` : `--index=${index}`];
    if (workerConfig.services && workerConfig.services.includes('comfyui')) {
      const basePort = parseInt(process.env.COMFYUI_BASE_PORT || '8188');
      const servicePort = basePort + index;
      args.push(`--service-port=${servicePort}`);
      this.logger.log(`🔌 Adding --service-port=${servicePort} for Redis worker index ${index}`);
    }

    return {
      name: appName,
      script: 'src/services/standalone-wrapper.js',
      args,
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
    
    console.log(`🔍 [FIXED-SERVICE-DEBUG ${new Date().toISOString()}] generateServiceApps called:`);
    console.log(`🔍 [FIXED-SERVICE-DEBUG ${new Date().toISOString()}] - workerType: "${workerType}"`);
    console.log(`🔍 [FIXED-SERVICE-DEBUG ${new Date().toISOString()}] - instanceCount: ${instanceCount}`);
    console.log(`🔍 [FIXED-SERVICE-DEBUG ${new Date().toISOString()}] - actualServiceName: "${actualServiceName}"`);
    console.log(`🔍 [FIXED-SERVICE-DEBUG ${new Date().toISOString()}] - serviceConfig.installer: "${serviceConfig.installer}"`);
    console.log(`🔍 [FIXED-SERVICE-DEBUG ${new Date().toISOString()}] - serviceConfig.type: "${serviceConfig.type}"`);
    console.log(`🔍 [FIXED-SERVICE-DEBUG ${new Date().toISOString()}] - serviceConfig.is_gpu_bound: ${serviceConfig.is_gpu_bound}`);
    
    // FIXED: Handle different service types - pm2_service creates PM2 apps, managed_service handled separately
    if (serviceConfig.type === 'pm2_service') {
      console.log(`✅ [FIXED-SERVICE-DEBUG ${new Date().toISOString()}] Service type is 'pm2_service', proceeding with PM2 app creation`);
      
      // Use the same instance count as the Redis workers to ensure matching pairs
      const totalInstances = instanceCount;
      
      console.log(`🔍 [FIXED-SERVICE-DEBUG ${new Date().toISOString()}] Instance calculation:`);
      console.log(`🔍 [FIXED-SERVICE-DEBUG ${new Date().toISOString()}] - Redis workers created: ${instanceCount}`);
      console.log(`🔍 [FIXED-SERVICE-DEBUG ${new Date().toISOString()}] - Service instances to create: ${totalInstances}`);
      
      for (let i = 0; i < totalInstances; i++) {
        console.log(`🔍 [FIXED-SERVICE-DEBUG ${new Date().toISOString()}] Creating app ${i+1}/${totalInstances} for installer: "${serviceConfig.installer}"`);
        
        // FIXED: Use installer field instead of hardcoded connector parsing
        if (serviceConfig.installer === 'ComfyUIManagementClient') {
          console.log(`✅ [FIXED-SERVICE-DEBUG ${new Date().toISOString()}] Creating ComfyUI app for instance ${i}`);
          apps.push(this.createComfyUIApp(actualServiceName, i));
        } else if (serviceConfig.installer === 'SimulationService') {
          console.log(`✅ [FIXED-SERVICE-DEBUG ${new Date().toISOString()}] Creating Simulation app for instance ${i}`);
          apps.push(this.createSimulationApp(actualServiceName, i));
        } else if (serviceConfig.installer === null) {
          console.log(`✅ [FIXED-SERVICE-DEBUG ${new Date().toISOString()}] Creating minimal service app for null installer (${actualServiceName}) instance ${i}`);
          // Handle null installer services (like simulation-websocket)
          if (actualServiceName.includes('simulation-websocket')) {
            apps.push(this.createSimulationWebSocketApp(actualServiceName, i));
          } else {
            // Generic null installer handler - minimal service with no specific installer logic
            apps.push(this.createMinimalServiceApp(actualServiceName, i));
          }
        } else {
          console.error(`❌ [FIXED-SERVICE-DEBUG ${new Date().toISOString()}] Unknown service installer: "${serviceConfig.installer}"`);
          throw new Error(`Unknown service installer: ${serviceConfig.installer}. Add support in generateServiceApps.`);
        }
      }
    } else if (serviceConfig.type === 'daemon_service') {
      console.log(`ℹ️ [FIXED-SERVICE-DEBUG ${new Date().toISOString()}] Service type is 'daemon_service' - singleton daemon, no PM2 apps created here`);
      // Daemon services (like Ollama) are handled separately as daemons
      // They don't create PM2 apps - they run as standalone daemon processes
    } else if (serviceConfig.type === 'managed_service') {
      console.log(`ℹ️ [FIXED-SERVICE-DEBUG ${new Date().toISOString()}] Service type is 'managed_service' - legacy managed service, no PM2 apps created here`);
      // Legacy managed services - handled like daemon services
    } else if (serviceConfig.type === 'external_api' || serviceConfig.type === 'external_service') {
      console.log(`ℹ️ [FIXED-SERVICE-DEBUG ${new Date().toISOString()}] Service type is '${serviceConfig.type}' - external service, no local apps created`);
      // External services don't require local PM2 apps
    } else {
      console.log(`❌ [FIXED-SERVICE-DEBUG ${new Date().toISOString()}] Unknown service type: '${serviceConfig.type}'. Supported types: pm2_service, daemon_service, managed_service, external_api, external_service`);
    }
    
    console.log(`🎉 [FIXED-SERVICE-DEBUG ${new Date().toISOString()}] generateServiceApps returning ${apps.length} apps for "${actualServiceName}"`);
    return apps;
  }

  /**
   * Create ComfyUI service PM2 app
   */
  createComfyUIApp(serviceName, gpuIndex) {
    console.log('');
    console.log('🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢');
    console.log(`🟢 CREATING COMFYUI APP: ${serviceName}-gpu${gpuIndex}`);
    console.log(`🟢 GPU Index: ${gpuIndex}`);
    console.log(`🟢 --cuda-device argument will be set to: ${gpuIndex}`);
    console.log('🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢');
    console.log('');
    
    const app = {
      name: `${serviceName}-gpu${gpuIndex}`,
      script: 'src/services/standalone-wrapper.js',
      args: ['comfyui', `--cuda-device=${gpuIndex}`, `--port=${8188 + gpuIndex}`],
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
        ...process.env, // Pass through ALL environment variables
        
        // Override/add specific values
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        COMFYUI_PORT: (8188 + gpuIndex).toString(),
        COMFYUI_CPU_MODE: process.env.COMFYUI_CPU_MODE || 'false'
      }
    };
    
    console.log('');
    console.log('✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅');
    console.log(`✅ COMFYUI APP CREATED SUCCESSFULLY: ${app.name}`);
    console.log(`✅ Port: ${app.env.COMFYUI_PORT}`);
    console.log(`✅ --cuda-device argument: ${gpuIndex}`);
    console.log('✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅');
    console.log('');
    
    return app;
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
        ...process.env, // Pass through ALL environment variables
        
        // Override/add specific values
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        SIMULATION_PORT: port.toString(),
        SIMULATION_HOST: '0.0.0.0'
        // GPU isolation handled via command line arguments, not environment variables
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
        ...process.env, // Pass through ALL environment variables
        
        // Override/add specific values
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        PORT: port.toString(),
        HOST: '0.0.0.0',
        SIMULATION_WS_PROCESSING_TIME: '10',
        SIMULATION_WS_STEPS: '10',
        SIMULATION_WS_PROGRESS_INTERVAL_MS: '300'
        // GPU isolation handled via command line arguments, not environment variables
      }
    };
  }

  /**
   * Create minimal service PM2 app for null installer services
   */
  createMinimalServiceApp(serviceName, instanceIndex = 0) {
    const name = `${serviceName}-${instanceIndex}`;
    const port = 8300 + instanceIndex; // Default port range starting at 8300
    
    return {
      name,
      script: 'src/services/standalone-wrapper.js',
      args: [serviceName, `--index=${instanceIndex}`],
      cwd: '/service-manager',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '5s',
      max_memory_restart: '256M',
      restart_delay: 2000,
      error_file: `/workspace/logs/${name}-error.log`,
      out_file: `/workspace/logs/${name}-out.log`,
      log_file: `/workspace/logs/${name}-combined.log`,
      merge_logs: true,
      env: {
        ...process.env, // Pass through ALL environment variables
        
        // Override/add specific values
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        PORT: port.toString(),
        HOST: '0.0.0.0'
        // No specific installer logic - minimal service
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
    
    // Direct service-specific environment variables (bypasses complex job type mapping)
    if (workerConfig.services) {
      for (const serviceName of workerConfig.services) {
        if (serviceName === 'comfyui') {
          // Set ComfyUI port directly based on worker index
          const basePort = parseInt(process.env.COMFYUI_BASE_PORT || '8188');
          env.COMFYUI_PORT = (basePort + index).toString();
          this.logger.log(`🔌 Setting COMFYUI_PORT=${env.COMFYUI_PORT} for worker index ${index}`);
        }
      }
    }
    
    // Handle service-specific configuration (legacy complex mapping)
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
    const ecosystemConfig = { 
      apps,
      servicePairs: this.servicePairs // Include captured service pairs
    };
    const configPath = '/workspace/pm2-ecosystem.config.cjs';
    const configContent = `module.exports = ${JSON.stringify(ecosystemConfig, null, 2)};`;
    
    try {
      fs.writeFileSync(configPath, configContent);
      
      this.logger.log(`✅ Generated PM2 ecosystem config: ${configPath}`);
      this.logger.log(`📊 Services configured: ${apps.length} total`);
      this.logger.log(`🔗 Service pairs tracked: ${this.servicePairs.length} pairs`);
      
      // Log service breakdown
      const serviceTypes = {};
      apps.forEach(app => {
        const type = app.name.split('-')[0];
        serviceTypes[type] = (serviceTypes[type] || 0) + 1;
      });
      
      Object.entries(serviceTypes).forEach(([type, count]) => {
        this.logger.log(`   - ${type}: ${count}`);
      });
      
      // Log service pairs summary
      if (this.servicePairs.length > 0) {
        this.logger.log(`🔗 Generated ${this.servicePairs.length} service pairs:`);
        this.servicePairs.forEach((pair, index) => {
          this.logger.log(`   ${index + 1}. ${pair.service} ↔ ${pair.worker} (port: ${pair.port})`);
        });
      }
      
    } catch (error) {
      this.logger.error(`Failed to write ecosystem config: ${error.message}`);
      throw error;
    }
  }

  /**
   * Capture service-worker pairs using the actual apps that were just created
   */
  captureServicePairs(serviceApps, workerApps, serviceName) {
    this.logger.log(`🔗 Capturing service pairs for ${serviceName} (${serviceApps.length} services, ${workerApps.length} workers)`);
    
    // Pair each service with its corresponding worker (by index)
    for (let i = 0; i < serviceApps.length && i < workerApps.length; i++) {
      const serviceApp = serviceApps[i];
      const workerApp = workerApps[i];
      
      const pair = {
        service: serviceApp.name,
        worker: workerApp.name,
        serviceType: serviceName,
        port: this.extractPortFromApp(serviceApp)
      };
      
      this.servicePairs.push(pair);
      this.logger.log(`   🔗 Added pair: ${pair.service} ↔ ${pair.worker} (port: ${pair.port})`);
    }
  }

  /**
   * Extract port from a service app configuration
   */
  extractPortFromApp(serviceApp) {
    // Check args for --port=XXXX
    if (serviceApp.args) {
      const portArg = serviceApp.args.find(arg => arg.startsWith('--port='));
      if (portArg) {
        return parseInt(portArg.split('=')[1]);
      }
    }
    
    // Check environment variables
    if (serviceApp.env) {
      if (serviceApp.env.COMFYUI_PORT) {
        return parseInt(serviceApp.env.COMFYUI_PORT);
      }
      if (serviceApp.env.PORT) {
        return parseInt(serviceApp.env.PORT);
      }
      if (serviceApp.env.SIMULATION_PORT) {
        return parseInt(serviceApp.env.SIMULATION_PORT);
      }
      if (serviceApp.env.SERVICE_PORT) {
        return parseInt(serviceApp.env.SERVICE_PORT);
      }
    }
    
    return null;
  }
}