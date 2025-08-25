import Redis from 'ioredis';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);
const logger = createLogger('machine-status-aggregator');

/**
 * UNIFIED Machine Status Aggregator
 * 
 * Replaces all fragmented status reporting with one clean system:
 * - Builds complete machine structure from config
 * - Reports unified status every 15s + immediate on events
 * - Single Redis channel: machine:status:${machine_id}
 */
export class MachineStatusAggregator {
  constructor(config, telemetryClient = null) {
    console.info('[MachineStatusAggregator] Constructor called');
    this.config = config;
    this.machineId = config.machine.id;
    this.redis = null;
    this.isConnected = false;
    this.statusInterval = null;
    this.startTime = Date.now();
    this.serviceMapping = null;
    this.telemetryClient = telemetryClient;
    
    // Status update frequency from env var
    this.updateIntervalSeconds = parseInt(
      process.env.MACHINE_STATUS_UPDATE_INTERVAL_SECONDS || '10'
    );
    
    // Structure will be built during connect()
    this.structure = null;
    this.currentStatus = null;
    
    console.info(`[MachineStatusAggregator] Machine Status Aggregator initialized for ${this.machineId}`);
    console.info(`[MachineStatusAggregator] Update interval: ${this.updateIntervalSeconds}s`);
    console.info(`[MachineStatusAggregator] Telemetry client: ${telemetryClient ? 'enabled' : 'disabled'}`);
    logger.info(`Machine Status Aggregator initialized for ${this.machineId}`);
    logger.info(`Update interval: ${this.updateIntervalSeconds}s`);
  }

  /**
   * Load service mapping configuration
   */
  async loadServiceMapping() {
    if (this.serviceMapping) {
      return this.serviceMapping;
    }

    try {
      const possiblePaths = [
        '/workspace/src/config/service-mapping.json',
        '/service-manager/src/config/service-mapping.json', 
        './src/config/service-mapping.json',
        path.join(process.cwd(), 'src/config/service-mapping.json')
      ];

      let serviceMappingPath = null;
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          serviceMappingPath = p;
          break;
        }
      }

      if (!serviceMappingPath) {
        throw new Error(`service-mapping.json not found in paths: ${possiblePaths.join(', ')}`);
      }

      const serviceMappingContent = fs.readFileSync(serviceMappingPath, 'utf8');
      this.serviceMapping = JSON.parse(serviceMappingContent);
      
      logger.info(`Loaded service mapping from ${serviceMappingPath}`);
      return this.serviceMapping;
    } catch (error) {
      logger.error('Failed to load service mapping:', error);
      throw error;
    }
  }

  /**
   * Convert worker type to actual services using service mapping
   */
  getServicesFromWorkerType(workerType) {
    console.log(`🚨🚨🚨 [MACHINE-STATUS-AGGREGATOR] getServicesFromWorkerType called with: "${workerType}"`);
    
    if (!this.serviceMapping) {
      console.log(`🚨🚨🚨 [MACHINE-STATUS-AGGREGATOR] ERROR: Service mapping not loaded!`);
      logger.warn('Service mapping not loaded, returning worker type as-is');
      return [workerType];
    }

    console.log(`🚨🚨🚨 [MACHINE-STATUS-AGGREGATOR] Service mapping loaded, checking for worker type "${workerType}"`);
    const workerConfig = this.serviceMapping.workers?.[workerType];
    
    if (!workerConfig || !workerConfig.services) {
      console.log(`🚨🚨🚨 [MACHINE-STATUS-AGGREGATOR] ERROR: Worker type "${workerType}" not found in service mapping!`);
      logger.warn(`Worker type ${workerType} not found in service mapping or has no services`);
      return [workerType];
    }

    console.log(`🚨🚨🚨 [MACHINE-STATUS-AGGREGATOR] SUCCESS: Found services for "${workerType}":`, workerConfig.services);
    logger.debug(`🔄 Converting worker type "${workerType}" → services: [${workerConfig.services.join(', ')}]`);
    return workerConfig.services;
  }

  /**
   * Get machine structure from service mapping instead of hardcoded config
   */
  async getStructureFromServiceMapping() {
    try {
      console.info('[MachineStatusAggregator] getStructureFromServiceMapping() called');
      
      // 🚨 CRITICAL: Load service mapping FIRST before any processing
      console.log('🚨🚨🚨 [MACHINE-STATUS-AGGREGATOR] Loading service mapping...');
      await this.loadServiceMapping();
      console.log('🚨🚨🚨 [MACHINE-STATUS-AGGREGATOR] Service mapping loaded successfully!');
      
      // Get worker types from WORKERS environment variable
      const workersEnv = process.env.WORKERS || '';
      console.info(`[MachineStatusAggregator] WORKERS env: ${workersEnv}`);
      
      const workerSpecs = workersEnv
        .split(',')
        .map(s => s.trim())
        .filter(s => s)
        .map(spec => {
          const [type, count] = spec.split(':');
          return { type, count: parseInt(count) || 1 };
        });
      
      console.info(`[MachineStatusAggregator] Parsed worker specs:`, JSON.stringify(workerSpecs));

      if (workerSpecs.length === 0) {
        throw new Error('[MachineStatusAggregator] SYSTEM IS FUCKED: No WORKERS environment variable specified. I cannot determine what services this machine should provide. Set WORKERS=worker-type:count environment variable.');
      }

      // Load service mapping
      const fs = await import('fs');
      const possiblePaths = [
        '/workspace/worker-bundled/src/config/service-mapping.json',
        '/service-manager/worker-bundled/src/config/service-mapping.json',
        '/workspace/src/config/service-mapping.json',
        '/service-manager/src/config/service-mapping.json',
        './src/config/service-mapping.json'
      ];
      
      let serviceMappingPath = null;
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          serviceMappingPath = p;
          break;
        }
      }
      
      if (!serviceMappingPath) {
        throw new Error(`[MachineStatusAggregator] SYSTEM IS FUCKED: service-mapping.json not found in any of these paths: ${possiblePaths.join(', ')}. I cannot determine what connectors and capabilities this machine should have. The worker bundle is broken.`);
      }

      const serviceMappingContent = fs.readFileSync(serviceMappingPath, 'utf8');
      const serviceMapping = JSON.parse(serviceMappingContent);
      
      // Extract capabilities and determine resource requirements
      const allCapabilities = new Set();
      const workers = [];
      let maxGpuCount = 1;
      
      for (const spec of workerSpecs) {
        const workerConfig = serviceMapping.workers?.[spec.type];
        if (workerConfig && workerConfig.services) {
          // Extract capabilities from services referenced by this worker
          for (const serviceName of workerConfig.services) {
            const serviceConfig = serviceMapping.services?.[serviceName];
            if (serviceConfig && serviceConfig.job_types_accepted) {
              serviceConfig.job_types_accepted.forEach(jobType => allCapabilities.add(jobType));
            }
          }
          
          // Get resource binding from the first service (they should all be consistent)
          let resourceBinding = 'shared';
          if (workerConfig.services.length > 0) {
            const firstService = serviceMapping.services?.[workerConfig.services[0]];
            resourceBinding = firstService?.resource_binding || 'shared';
          }
          
          workers.push({
            type: spec.type,
            count: spec.count,
            resourceBinding: resourceBinding
          });
          
          // Calculate GPU requirements
          if (resourceBinding === 'gpu' || resourceBinding === 'mock_gpu') {
            maxGpuCount = Math.max(maxGpuCount, spec.count);
          }
        } else {
          throw new Error(`[MachineStatusAggregator] SYSTEM IS FUCKED: Worker type '${spec.type}' not found in service mapping. Available worker types: ${Object.keys(serviceMapping.workers || {}).join(', ')}. Check your WORKERS environment variable.`);
        }
      }
      
      const capabilities = Array.from(allCapabilities);
      console.info(`[MachineStatusAggregator] Derived structure from service mapping:`);
      console.info(`  - Capabilities: ${capabilities.join(', ')}`);
      console.info(`  - Workers: ${workers.map(w => `${w.type}:${w.count}(${w.resourceBinding})`).join(', ')}`);
      console.info(`  - GPU Count: ${maxGpuCount}`);
      
      return { capabilities, workers, gpuCount: maxGpuCount };
      
    } catch (error) {
      console.error('[MachineStatusAggregator] Failed to load structure from service mapping:', error);
      console.error('[MachineStatusAggregator] Stack trace:', error.stack);
      // Don't re-throw - return empty structure to continue with empty state
      return { capabilities: [], workers: [], gpuCount: 1 };
    }
  }

  /**
   * Build static machine structure from PM2 ecosystem config (never changes)
   */
  async buildMachineStructure() {
    console.log('🔥🔥🔥 [BUILD-VERIFICATION] CODE REBUILD VERIFICATION - This should show if code was rebuilt!');
    console.log('🔥🔥🔥 [BUILD-VERIFICATION] Timestamp:', new Date().toISOString());
    console.log('[MachineStatusAggregator] DEBUG: buildMachineStructure() called');
    
    // 🚨 CRITICAL FIX: Load service mapping FIRST before building structure
    console.log('🚨🚨🚨 [MACHINE-STATUS-AGGREGATOR] Loading service mapping in buildMachineStructure...');
    await this.loadServiceMapping();
    console.log('🚨🚨🚨 [MACHINE-STATUS-AGGREGATOR] Service mapping loaded in buildMachineStructure!');
    
    const workers = {};
    const services = {};
    
    // Read the actual PM2 ecosystem config that was generated
    try {
      const fs = await import('fs');
      const ecosystemPath = '/workspace/pm2-ecosystem.config.cjs';
      
      if (!fs.existsSync(ecosystemPath)) {
        throw new Error(`PM2 ecosystem config not found at ${ecosystemPath} - machine is misconfigured`);
      }
      
      // Load the PM2 config (it's a CommonJS module)
      // Use dynamic import to load CommonJS from ES module
      const ecosystemModule = await import(`file://${ecosystemPath}`);
      const ecosystemConfig = ecosystemModule.default;
      
      console.log('[MachineStatusAggregator] DEBUG: Loaded PM2 ecosystem with', ecosystemConfig.apps.length, 'apps');
      
      // Parse workers from PM2 redis-worker apps
      for (const app of ecosystemConfig.apps) {
        if (app.name.startsWith('redis-worker-')) {
          // Use the WORKER_ID directly from PM2 environment (includes workerType)
          const connectors = app.env.CONNECTORS?.split(',') || [];
          const actualWorkerId = app.env.WORKER_ID || 'unknown-worker';
          
          // Extract worker type and index for structure metadata
          const appNameMatch = app.name.match(/redis-worker-(.+)-(\d+)$/);
          const workerType = appNameMatch ? appNameMatch[1] : connectors[0] || 'unknown';
          const workerIndex = appNameMatch ? parseInt(appNameMatch[2]) : parseInt(app.env.GPU_INDEX || '0');
          
          console.log('[MachineStatusAggregator] DEBUG: Creating worker structure for:', actualWorkerId);
          console.log('[MachineStatusAggregator] DEBUG: PM2 app name:', app.name);
          console.log('[MachineStatusAggregator] DEBUG: Raw Connectors from PM2:', connectors);
          
          // 🚨 CRITICAL FIX: Convert worker types to actual services using service mapping
          const actualServices = this.getServicesFromWorkerType(workerType);
          
          console.log(`🚨🚨🚨 [MACHINE-STATUS-AGGREGATOR] CRITICAL FIX APPLIED!`);
          console.log(`🚨🚨🚨 [MACHINE-STATUS-AGGREGATOR] Raw worker type from PM2: "${workerType}"`);
          console.log(`🚨🚨🚨 [MACHINE-STATUS-AGGREGATOR] Converted to services:`, actualServices);
          console.log(`🚨🚨🚨 [MACHINE-STATUS-AGGREGATOR] This should show ["simulation"] not ["sim"]!`);
          
          workers[actualWorkerId] = {
            worker_id: actualWorkerId,
            pm2_name: app.name,
            gpu_id: workerIndex,
            worker_type: workerType,
            resource_binding: app.env.GPU_INDEX !== undefined ? 'mock_gpu' : 'shared',
            services: actualServices,  // 🚨 FIX: Use actual services, not raw connectors
            connectors: connectors     // Keep raw connectors for reference
          };
          
          // 🚨 CRITICAL FIX: Create services for actual services, not raw connectors
          for (const serviceName of actualServices) {
            const serviceKey = `${actualWorkerId}.${serviceName}`;
            services[serviceKey] = {
              worker_id: actualWorkerId,
              service_type: serviceName,  // 🚨 FIX: Use actual service name
              pm2_name: app.name,
              status: 'unknown',
              health: 'unknown'
            };
          }
        }
      }
      
      // Extract capabilities from workers
      const capabilities = [...new Set(Object.values(workers).flatMap(w => w.services))];
      
      // Count GPUs from GPU-bound workers
      const gpuCount = Math.max(1, ...Object.values(workers).map(w => w.gpu_id + 1));
      
      console.log('[MachineStatusAggregator] DEBUG: Built structure from PM2 config:');
      console.log('[MachineStatusAggregator] DEBUG: Workers:', Object.keys(workers));
      console.log('[MachineStatusAggregator] DEBUG: Services:', Object.keys(services));
      console.log('[MachineStatusAggregator] DEBUG: Capabilities:', capabilities);
      
      logger.info(`Built structure from PM2 config: ${Object.keys(workers).length} workers, ${Object.keys(services).length} services`);

      return {
        gpu_count: gpuCount,
        capabilities,
        workers,
        services
      };
      
    } catch (error) {
      logger.error('Failed to load PM2 ecosystem config:', error);
      throw error;
    }
  }

  /**
   * Signal that machine is fully ready and should start publishing status
   */
  async machineReady() {
    console.log('[MachineStatusAggregator] DEBUG: Machine is fully ready, starting status publishing');
    
    // Update machine phase to ready
    this.currentStatus.machine = {
      phase: 'ready',
      uptime_ms: Date.now() - this.startTime
    };
    
    // Send initial status now that everything is ready
    await this.publishStatus('machine_ready');
    
    logger.info('Machine is fully ready and visible to monitors');
  }

  /**
   * Build initial status with all components unknown
   */
  buildInitialStatus() {
    const workers = {};
    const services = {};

    // Initialize workers only if structure has been built
    if (this.structure && this.structure.workers) {
      for (const [workerId] of Object.entries(this.structure.workers)) {
        workers[workerId] = {
          is_connected: false,
          status: 'unknown',
          current_job_id: null,
          last_activity: null
        };
      }
    }

    // Initialize all services from structure
    if (this.structure && this.structure.services) {
      for (const [serviceKey, serviceInfo] of Object.entries(this.structure.services)) {
        services[serviceKey] = {
          ...serviceInfo,
          status: 'unknown',
          health: 'unknown',
          pm2_status: 'unknown'
        };
      }
    }

    return {
      machine: {
        phase: 'starting',
        uptime_ms: 0
      },
      workers,
      services
    };
  }

  /**
   * Connect to Redis and start status reporting
   */
  async connect() {
    try {
      console.info('[MachineStatusAggregator] connect() called - starting structure build');
      
      // Build machine structure from service mapping
      this.structure = await this.buildMachineStructure();
      this.currentStatus = this.buildInitialStatus();
      
      console.info(`[MachineStatusAggregator] Final structure: ${Object.keys(this.structure.workers).length} workers, ${Object.keys(this.currentStatus.services).length} services`);
      logger.info(`Structure: ${Object.keys(this.structure.workers).length} workers, ${Object.keys(this.currentStatus.services).length} services`);

      if (!this.config.redis.url) {
        logger.warn('Redis URL not configured, status reporting disabled');
        return;
      }

      this.redis = new Redis(this.config.redis.url, {
        enableReadyCheck: true,
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        lazyConnect: true
      });

      this.redis.on('connect', () => {
        logger.info('Machine status aggregator connected to Redis');
        this.isConnected = true;
      });

      this.redis.on('error', (error) => {
        logger.error('Redis connection error:', error);
        this.isConnected = false;
      });

      await this.redis.connect();
      
      // Subscribe to local machine events from workers
      await this.subscribeToWorkerEvents();
      
      // DON'T send initial status yet - wait until machine is fully ready
      // await this.publishStatus('initial');
      
      // Start periodic updates to prevent machine disconnection
      this.startPeriodicUpdates();
      
      logger.info(`Machine status aggregator started for ${this.machineId}`);
    } catch (error) {
      logger.error('Failed to connect machine status aggregator:', error);
    }
  }

  /**
   * Subscribe to events from workers within this machine
   */
  async subscribeToWorkerEvents() {
    // Create separate Redis connection for subscriptions
    this.eventSubscriber = new Redis(this.config.redis.url);
    
    // Subscribe to worker events for this machine
    await this.eventSubscriber.psubscribe(`machine:${this.machineId}:worker:*`);
    
    this.eventSubscriber.on('pmessage', async (pattern, channel, message) => {
      try {
        const eventData = JSON.parse(message);
        await this.handleWorkerEvent(eventData);
      } catch (error) {
        logger.error('Failed to process worker event:', error);
      }
    });
    
    logger.info(`Subscribed to worker events for machine ${this.machineId}`);
  }

  /**
   * Handle events from workers (job status, connector status, etc.)
   */
  async handleWorkerEvent(eventData) {
    const { worker_id, event_type, data } = eventData;
    
    logger.debug(`Received worker event: ${event_type} from ${worker_id}`);
    
    switch (event_type) {
      case 'worker_registered':
      case 'worker_connected': // Also handle worker_connected events from workers
        console.log('[MachineStatusAggregator] DEBUG: Worker registered/connected:', worker_id, 'with capabilities:', data.capabilities);
        
        // Add new worker to tracking
        this.currentStatus.workers[worker_id] = {
          worker_id,
          status: data.status || 'initializing',
          capabilities: data.capabilities || [],
          current_job_id: null,
          last_activity: Date.now(),
          is_connected: true,
          version: data.version,
          build_timestamp: data.build_timestamp,
          build_info: data.build_info
        };
        
        console.log('[MachineStatusAggregator] DEBUG: Added worker to currentStatus.workers, now have:', Object.keys(this.currentStatus.workers));
        
        // ALSO update the structure to include this worker
        this.structure.workers[worker_id] = {
          worker_id: worker_id,
          pm2_name: `redis-worker-${worker_id}`,
          gpu_id: 0,
          worker_type: data.capabilities?.[0] || 'unknown',
          resource_binding: 'mock_gpu',
          services: data.capabilities || [],
          connectors: data.capabilities || []
        };
        
        console.log('[MachineStatusAggregator] DEBUG: Added worker to structure.workers, now have:', Object.keys(this.structure.workers));
        
        // Create services in structure for this worker
        for (const capability of (data.capabilities || [])) {
          const serviceKey = `${worker_id}.${capability}`;
          this.structure.services[serviceKey] = {
            worker_id: worker_id,
            service_type: capability,
            pm2_name: `redis-worker-${worker_id}`,
            status: 'unknown',
            health: 'unknown'
          };
          
          // Also initialize in currentStatus.services
          this.currentStatus.services[serviceKey] = {
            worker_id: worker_id,
            service_type: capability,
            pm2_name: `redis-worker-${worker_id}`,
            status: 'unknown',
            health: 'unknown',
            pm2_status: 'unknown'
          };
        }
        
        logger.info(`Worker registered: ${worker_id}`, {
          capabilities: data.capabilities
        });
        await this.publishStatus('event_driven');
        break;
        
      case 'worker_status_changed':
        console.log('[MachineStatusAggregator] DEBUG: Worker status changed:', worker_id, 'status:', data.status, 'capabilities:', data.capabilities);
        
        if (this.currentStatus.workers[worker_id]) {
          console.log('[MachineStatusAggregator] DEBUG: Updating existing worker:', worker_id);
          this.currentStatus.workers[worker_id].status = data.status;
          this.currentStatus.workers[worker_id].current_job_id = data.current_job_id;
          this.currentStatus.workers[worker_id].last_activity = Date.now();
          this.currentStatus.workers[worker_id].is_connected = data.is_connected;
          // Store version info to verify latest code is running
          this.currentStatus.workers[worker_id].version = data.version;
          this.currentStatus.workers[worker_id].build_timestamp = data.build_timestamp;
          this.currentStatus.workers[worker_id].build_info = data.build_info;
          await this.publishStatus('event_driven');
        } else {
          console.log('[MachineStatusAggregator] DEBUG: New worker detected, treating as registration:', worker_id);
          // If worker doesn't exist yet, treat it as a registration
          await this.handleWorkerEvent({
            worker_id,
            event_type: 'worker_registered',
            data
          });
        }
        break;
        
      case 'connector_status_changed':
        const serviceKey = `${worker_id}.${data.service_type}`;
        if (this.currentStatus.services[serviceKey]) {
          this.currentStatus.services[serviceKey].status = data.status;
          this.currentStatus.services[serviceKey].health = data.health || 'unknown';
          await this.publishStatus('event_driven');
        }
        break;
        
      case 'job_started':
        if (this.currentStatus.workers[worker_id]) {
          this.currentStatus.workers[worker_id].status = 'busy';
          this.currentStatus.workers[worker_id].current_job_id = data.job_id;
          // Also mark the service as active
          const serviceKey = `${worker_id}.${data.service_type}`;
          if (this.currentStatus.services[serviceKey]) {
            this.currentStatus.services[serviceKey].status = 'active';
          }
          await this.publishStatus('event_driven');
        }
        break;
        
      case 'job_completed':
      case 'job_failed':
        if (this.currentStatus.workers[worker_id]) {
          this.currentStatus.workers[worker_id].status = 'idle';
          this.currentStatus.workers[worker_id].current_job_id = null;
          // Mark the service as inactive
          const serviceKey = `${worker_id}.${data.service_type}`;
          if (this.currentStatus.services[serviceKey]) {
            this.currentStatus.services[serviceKey].status = 'inactive';
          }
          await this.publishStatus('event_driven');
        }
        break;
    }
  }

  /**
   * Start periodic status collection and publishing
   */
  startPeriodicUpdates() {
    this.statusInterval = setInterval(async () => {
      await this.collectAndPublishStatus();
    }, this.updateIntervalSeconds * 1000);

    logger.info(`Started periodic status updates every ${this.updateIntervalSeconds}s`);
  }

  /**
   * Collect current status from all components and publish
   */
  async collectAndPublishStatus() {
    try {
      // Update machine status
      this.currentStatus.machine = {
        phase: 'ready', // TODO: Determine from component health
        uptime_ms: Date.now() - this.startTime
      };

      // Collect PM2 service status
      await this.collectPM2Status();
      
      // Collect service health
      await this.collectServiceHealth();
      
      // Collect worker status (from Redis workers if available)
      await this.collectWorkerStatus();

      // Publish unified status
      await this.publishStatus('periodic');
      
    } catch (error) {
      logger.error('Failed to collect status:', error);
    }
  }

  /**
   * Collect PM2 process status for all services
   */
  async collectPM2Status() {
    try {
      const { stdout } = await execAsync('pm2 jlist --no-color');
      // eslint-disable-next-line no-control-regex
      const cleanOutput = stdout.replace(/\x1b\[[0-9;]*m/g, ''); // Strip ANSI codes
      const processes = JSON.parse(cleanOutput);
      
      // Update service PM2 status using actual PM2 process names from structure
      for (const [serviceKey, serviceInfo] of Object.entries(this.currentStatus.services)) {
        const processName = serviceInfo.pm2_name;
        
        if (processName) {
          const process = processes.find(p => p.name === processName);
          
          if (process) {
            this.currentStatus.services[serviceKey].pm2_status = process.pm2_env.status;
            this.currentStatus.services[serviceKey].status = 
              process.pm2_env.status === 'online' ? 'active' : 'inactive';
          } else {
            this.currentStatus.services[serviceKey].pm2_status = 'not_found';
            this.currentStatus.services[serviceKey].status = 'inactive';
          }
        }
      }
      
      // Update worker status based on their PM2 processes
      for (const [workerId, workerInfo] of Object.entries(this.structure.workers)) {
        const processName = workerInfo.pm2_name;
        
        if (processName && this.currentStatus.workers[workerId]) {
          const process = processes.find(p => p.name === processName);
          
          if (process) {
            // Worker is running if its PM2 process is online
            this.currentStatus.workers[workerId].is_connected = process.pm2_env.status === 'online';
            if (this.currentStatus.workers[workerId].status === 'unknown') {
              this.currentStatus.workers[workerId].status = process.pm2_env.status === 'online' ? 'idle' : 'offline';
            }
          }
        }
      }
    } catch (error) {
      logger.warn('Failed to collect PM2 status:', error);
    }
  }

  /**
   * Collect basic service health checks
   */
  async collectServiceHealth() {
    const healthChecks = {
      comfyui: (gpu) => this.checkHTTP(`http://localhost:${8188 + (gpu || 0)}`),
      simulation: (gpu) => this.checkHTTP(`http://localhost:${8299 + (gpu || 0)}`)
    };

    for (const [serviceKey] of Object.entries(this.currentStatus.services)) {
      const [workerId, serviceName] = serviceKey.split('.');
      const worker = this.structure.workers[workerId];
      
      if (worker && healthChecks[serviceName]) {
        try {
          // For GPU-bound workers use GPU ID, for shared workers use 0
          const portOffset = worker.gpu_id !== null ? worker.gpu_id : 0;
          const isHealthy = await healthChecks[serviceName](portOffset);
          this.currentStatus.services[serviceKey].health = isHealthy ? 'healthy' : 'unhealthy';
        } catch (error) {
          this.currentStatus.services[serviceKey].health = 'unknown';
        }
      } else if (worker && worker.resource_binding === 'shared') {
        // For shared workers without health checks, mark as healthy if PM2 is online
        const pm2Status = this.currentStatus.services[serviceKey]?.pm2_status;
        this.currentStatus.services[serviceKey].health = pm2Status === 'online' ? 'healthy' : 'unknown';
      }
    }
  }

  /**
   * Simple HTTP health check
   */
  async checkHTTP(url) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s timeout
      
      const response = await fetch(url, { 
        signal: controller.signal,
        headers: { 'Accept': 'text/html,application/json' }
      });
      
      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Collect worker status (placeholder - workers will report via events)
   */
  async collectWorkerStatus() {
    // Query Redis for current worker status to ensure periodic updates don't override real-time status
    try {
      for (const [workerId] of Object.entries(this.structure.workers)) {
        if (this.currentStatus.workers[workerId]) {
          // Check Redis for current worker status
          const workerKey = `worker:${workerId}`;
          const workerData = await this.redis.hgetall(workerKey);
          
          if (workerData && workerData.status) {
            // Update our cached status with the current Redis status
            this.currentStatus.workers[workerId].status = workerData.status;
            this.currentStatus.workers[workerId].current_job_id = workerData.current_job_id || null;
            this.currentStatus.workers[workerId].last_activity = workerData.last_activity || Date.now();
            
            logger.debug(`Updated worker ${workerId} status from Redis: ${workerData.status}`);
          }
        }
      }
    } catch (error) {
      logger.warn('Failed to collect worker status from Redis:', error);
    }
  }

  /**
   * Update worker status immediately (called by events)
   */
  async updateWorkerStatus(workerId, statusUpdate) {
    if (this.currentStatus.workers[workerId]) {
      this.currentStatus.workers[workerId] = {
        ...this.currentStatus.workers[workerId],
        ...statusUpdate
      };
      
      // Publish immediate update
      await this.publishStatus('event_driven');
      
      logger.debug(`Updated worker ${workerId} status:`, statusUpdate);
    }
  }

  /**
   * Update service status immediately (called by events)
   */
  async updateServiceStatus(serviceKey, statusUpdate) {
    if (this.currentStatus.services[serviceKey]) {
      this.currentStatus.services[serviceKey] = {
        ...this.currentStatus.services[serviceKey],
        ...statusUpdate
      };
      
      // Publish immediate update
      await this.publishStatus('event_driven');
      
      logger.debug(`Updated service ${serviceKey} status:`, statusUpdate);
    }
  }

  /**
   * Publish unified status message to Redis
   */
  async publishStatus(updateType = 'periodic') {
    if (!this.redis || !this.isConnected) {
      logger.warn('Redis not connected, skipping status publish');
      return;
    }

    const statusMessage = {
      machine_id: this.machineId,
      timestamp: Date.now(),
      update_type: updateType,
      structure: this.structure,
      status: this.currentStatus,
      health_url: `http://localhost:${process.env.MACHINE_HEALTH_PORT || 9090}/health`
    };


    try {
      const channel = `machine:status:${this.machineId}`;
      const message = JSON.stringify(statusMessage);
      
      const subscribers = await this.redis.publish(channel, message);
      
      // Send machine metrics via TelemetryClient (alongside Redis, doesn't replace it)
      await this.broadcastMachineMetrics(statusMessage);
      
      logger.debug(`Published ${updateType} status to ${subscribers} subscribers`, {
        machine_id: this.machineId,
        workers: Object.keys(this.currentStatus.workers).length,
        services: Object.keys(this.currentStatus.services).length
      });
      
    } catch (error) {
      logger.error('Failed to publish status:', error);
    }
  }

  /**
   * Broadcast machine metrics via TelemetryClient (replaces custom Dash0 broadcaster)
   */
  async broadcastMachineMetrics(statusMessage) {
    if (!this.telemetryClient) {
      return; // No telemetry client available
    }
    
    try {
      const machineStatus = statusMessage.status?.machine;
      const workers = statusMessage.status?.workers || {};
      const services = statusMessage.status?.services || {};
      
      // Common labels for all metrics
      const labels = {
        machine_id: this.machineId,
        update_type: statusMessage.update_type,
        machine_phase: machineStatus?.phase || 'unknown'
      };
      
      // Machine uptime metric
      if (machineStatus?.uptime_ms) {
        await this.telemetryClient.otel.gauge('machine.uptime_ms', machineStatus.uptime_ms, labels);
      }
      
      // Worker counts
      const workerList = Object.values(workers);
      const activeWorkerCount = workerList.filter(w => w.status === 'busy').length;
      const totalWorkerCount = workerList.length;
      
      await this.telemetryClient.otel.gauge('machine.workers.active', activeWorkerCount, labels);
      await this.telemetryClient.otel.gauge('machine.workers.total', totalWorkerCount, labels);
      
      // Service counts
      const serviceList = Object.values(services);
      const healthyServiceCount = serviceList.filter(s => s.health === 'healthy').length;
      const totalServiceCount = serviceList.length;
      
      await this.telemetryClient.otel.gauge('machine.services.healthy', healthyServiceCount, labels);
      await this.telemetryClient.otel.gauge('machine.services.total', totalServiceCount, labels);
      
      logger.debug(`📊 Sent machine metrics: ${totalWorkerCount} workers (${activeWorkerCount} active), ${healthyServiceCount}/${totalServiceCount} services healthy`);
      
    } catch (error) {
      logger.error('Error broadcasting machine metrics via TelemetryClient:', error);
    }
  }

  /**
   * Handle machine shutdown
   */
  async shutdown() {
    logger.info(`Shutting down machine status aggregator for ${this.machineId}`);
    
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
    }
    
    // Send final status
    this.currentStatus.machine.phase = 'shutdown';
    await this.publishStatus('shutdown');
    
    // TelemetryClient doesn't need explicit shutdown - handled by main process
    
    if (this.redis) {
      await this.redis.quit();
    }
  }

  /**
   * Get current status for debugging
   */
  getCurrentStatus() {
    return {
      machine_id: this.machineId,
      structure: this.structure,
      status: this.currentStatus,
      uptime_ms: Date.now() - this.startTime,
      is_connected: this.isConnected
    };
  }
}

export default MachineStatusAggregator;