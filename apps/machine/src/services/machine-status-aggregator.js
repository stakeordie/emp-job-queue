import Redis from 'ioredis';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '../utils/logger.js';

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
  constructor(config) {
    this.config = config;
    this.machineId = config.machine.id;
    this.redis = null;
    this.isConnected = false;
    this.statusInterval = null;
    this.startTime = Date.now();
    
    // Status update frequency from env var
    this.updateIntervalSeconds = parseInt(
      process.env.MACHINE_STATUS_UPDATE_INTERVAL_SECONDS || '10'
    );
    
    // Structure will be built during connect()
    this.structure = null;
    this.currentStatus = null;
    
    logger.info(`Machine Status Aggregator initialized for ${this.machineId}`);
    logger.info(`Update interval: ${this.updateIntervalSeconds}s`);
  }

  /**
   * Get machine structure from service mapping instead of hardcoded config
   */
  async getStructureFromServiceMapping() {
    try {
      // Get worker types from WORKERS environment variable
      const workersEnv = process.env.WORKERS || '';
      const workerSpecs = workersEnv
        .split(',')
        .map(s => s.trim())
        .filter(s => s)
        .map(spec => {
          const [type, count] = spec.split(':');
          return { type, count: parseInt(count) || 1 };
        });

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
        if (workerConfig && workerConfig.service) {
          // Extract capabilities
          for (const service of workerConfig.service) {
            if (service.capability) {
              if (Array.isArray(service.capability)) {
                service.capability.forEach(cap => allCapabilities.add(cap));
              } else {
                allCapabilities.add(service.capability);
              }
            }
          }
          
          // Determine resource binding
          const resourceBinding = workerConfig.resource_binding || 'shared';
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
      throw error; // Re-throw the error instead of using fallback
    }
  }

  /**
   * Build static machine structure from config (never changes)
   */
  async buildMachineStructure() {
    // Get capabilities and worker structure from service mapping
    const { capabilities, workers: workerStructure, gpuCount } = await this.getStructureFromServiceMapping();

    const workers = {};
    // Workers are created based on resource binding, workerIndex no longer needed

    // Create workers based on their resource binding
    for (const workerSpec of workerStructure) {
      if (workerSpec.resourceBinding === 'gpu' || workerSpec.resourceBinding === 'mock_gpu') {
        // GPU-bound workers: one worker per GPU up to the count specified
        for (let gpu = 0; gpu < Math.min(workerSpec.count, gpuCount); gpu++) {
          const workerId = `${this.machineId}-worker-${gpu}`;
          workers[workerId] = {
            worker_id: workerId,
            gpu_id: gpu,
            worker_type: workerSpec.type,
            resource_binding: workerSpec.resourceBinding,
            services: [...capabilities] // Each worker has all capabilities
          };
        }
      } else if (workerSpec.resourceBinding === 'shared' || workerSpec.resourceBinding === 'cpu') {
        // Shared/CPU workers: create specified count without GPU binding
        for (let i = 0; i < workerSpec.count; i++) {
          const workerId = `${this.machineId}-worker-${workerSpec.type}-${i}`;
          workers[workerId] = {
            worker_id: workerId,
            gpu_id: null, // No GPU binding for shared workers
            worker_type: workerSpec.type,
            resource_binding: workerSpec.resourceBinding,
            services: [...capabilities] // Each worker has all capabilities
          };
        }
      }
    }

    return {
      gpu_count: gpuCount,
      capabilities,
      workers
    };
  }

  /**
   * Build initial status with all components unknown
   */
  buildInitialStatus() {
    const workers = {};
    const services = {};

    // Initialize all workers as unknown
    for (const [workerId] of Object.entries(this.structure.workers)) {
      workers[workerId] = {
        is_connected: false,
        status: 'unknown',
        current_job_id: null,
        last_activity: null
      };

      // Initialize all services as unknown
      for (const serviceName of this.structure.capabilities) {
        const serviceKey = `${workerId}.${serviceName}`;
        services[serviceKey] = {
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
      // Build machine structure from service mapping
      this.structure = await this.buildMachineStructure();
      this.currentStatus = this.buildInitialStatus();
      
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
      
      // Send initial status (full structure, all unknown)
      await this.publishStatus('initial');
      
      // Start periodic status updates
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
      case 'worker_status_changed':
        if (this.currentStatus.workers[worker_id]) {
          this.currentStatus.workers[worker_id].status = data.status;
          this.currentStatus.workers[worker_id].current_job_id = data.current_job_id;
          this.currentStatus.workers[worker_id].last_activity = Date.now();
          this.currentStatus.workers[worker_id].is_connected = data.is_connected;
          // Store version info to verify latest code is running
          this.currentStatus.workers[worker_id].version = data.version;
          this.currentStatus.workers[worker_id].build_timestamp = data.build_timestamp;
          this.currentStatus.workers[worker_id].build_info = data.build_info;
          await this.publishStatus('event_driven');
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
      
      // Update service PM2 status
      for (const [serviceKey] of Object.entries(this.currentStatus.services)) {
        const [workerId, serviceName] = serviceKey.split('.');
        const worker = this.structure.workers[workerId];
        
        if (worker) {
          let processName;
          if (worker.gpu_id !== null && worker.gpu_id !== undefined) {
            // GPU-bound workers: serviceName-gpu{N}
            processName = `${serviceName}-gpu${worker.gpu_id}`;
          } else {
            // Shared/CPU workers: use worker type for process name
            processName = `${worker.worker_type}-worker`;
          }
          
          const process = processes.find(p => p.name === processName);
          
          if (process) {
            this.currentStatus.services[serviceKey].pm2_status = process.pm2_env.status;
            this.currentStatus.services[serviceKey].status = 
              process.pm2_env.status === 'online' ? 'active' : 'inactive';
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
    // Workers will report their status via updateWorkerStatus() events
    // This method is for any additional worker status collection if needed
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
      status: this.currentStatus
    };

    try {
      const channel = `machine:status:${this.machineId}`;
      const message = JSON.stringify(statusMessage);
      
      const subscribers = await this.redis.publish(channel, message);
      
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