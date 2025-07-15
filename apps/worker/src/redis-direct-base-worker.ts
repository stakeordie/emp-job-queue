// Redis-Direct Base Worker - Phase 1B Implementation
// Core worker logic with Redis-direct polling instead of WebSocket hub communication
//
// CRITICAL ARCHITECTURE NOTE:
// Workers are SINGLE-JOB processors. Each worker executes exactly ONE job at a time.
// - Multi-GPU machines run MULTIPLE workers (one per GPU)
// - Each worker connects to its own service port (worker0→8188, worker1→8189, etc.)
// - A 4x GPU machine = 4 separate workers = 4 separate service instances
// - This is NOT multi-threading - it's multiple single-threaded processes

import { ConnectorManager } from './connector-manager.js';
import { RedisDirectWorkerClient } from './redis-direct-worker-client.js';
import {
  WorkerCapabilities,
  WorkerStatus,
  LocationConfig,
  CostConfig,
  HardwareSpecs,
  CustomerAccessConfig,
  PerformanceConfig,
  Job,
  JobProgress,
  ConnectorStatus,
  logger,
} from '@emp/core';
import { WorkerDashboard } from './worker-dashboard.js';
import os from 'os';

export class RedisDirectBaseWorker {
  private workerId: string;
  private machineId: string;
  private connectorManager: ConnectorManager;
  private redisClient: RedisDirectWorkerClient;
  private capabilities: WorkerCapabilities;
  private status: WorkerStatus = WorkerStatus.INITIALIZING;
  private currentJobs = new Map<string, Job>();
  private jobStartTimes = new Map<string, number>();
  private jobTimeouts = new Map<string, NodeJS.Timeout>();
  private running = false;
  private jobTimeoutCheckInterval?: NodeJS.Timeout;
  private connectorStatusInterval?: NodeJS.Timeout;
  private lastConnectorStatuses: Record<string, ConnectorStatus> = {};
  private pollIntervalMs: number;
  private maxConcurrentJobs: number;
  private jobTimeoutMinutes: number;
  private dashboard?: WorkerDashboard;

  constructor(
    workerId: string,
    machineId: string,
    connectorManager: ConnectorManager,
    hubRedisUrl: string
  ) {
    this.workerId = workerId;
    this.machineId = machineId;
    this.connectorManager = connectorManager;
    this.redisClient = new RedisDirectWorkerClient(hubRedisUrl, workerId);

    // Configuration from environment - match existing patterns
    this.pollIntervalMs = parseInt(process.env.WORKER_POLL_INTERVAL_MS || '1000'); // Faster polling for Redis-direct
    // ENFORCED: Workers process exactly ONE job at a time - no concurrency within a worker
    this.maxConcurrentJobs = 1; // NEVER change this - workers are single-job processors
    this.jobTimeoutMinutes = parseInt(process.env.WORKER_JOB_TIMEOUT_MINUTES || '30');

    // Build capabilities
    this.capabilities = this.buildCapabilities();

    // DEBUG: Log built capabilities
    logger.info(`🔧 Built capabilities for worker ${this.workerId}:`);
    logger.info(`🔧   - services: ${JSON.stringify(this.capabilities.services)}`);
    logger.info(`🔧   - machine_id: ${this.capabilities.machine_id}`);

    logger.info(
      `Redis-direct worker ${this.workerId} initialized with ${this.maxConcurrentJobs} max concurrent jobs`
    );
  }

  private buildCapabilities(): WorkerCapabilities {
    // Services this worker can handle
    const services = (
      process.env.WORKER_SERVICES ||
      process.env.WORKER_CONNECTORS ||
      'comfyui,a1111'
    )
      .split(',')
      .map(s => s.trim());

    // Hardware specs - Each worker represents ONE GPU + supporting resources
    const hardware: HardwareSpecs = {
      ram_gb: parseInt(process.env.WORKER_RAM_GB || '8'),
      gpu_memory_gb: parseInt(process.env.WORKER_GPU_MEMORY_GB || '8'),
      gpu_model: process.env.WORKER_GPU_MODEL || 'unknown',
    };

    // Customer access configuration
    const customerAccess: CustomerAccessConfig = {
      isolation:
        (process.env.WORKER_CUSTOMER_ISOLATION as 'strict' | 'loose' | 'none') ||
        (process.env.CUSTOMER_ISOLATION as 'strict' | 'loose' | 'none') ||
        'loose',
      allowed_customers: process.env.ALLOWED_CUSTOMERS?.split(',').map(s => s.trim()),
      denied_customers: process.env.DENIED_CUSTOMERS?.split(',').map(s => s.trim()),
      max_concurrent_customers: parseInt(process.env.MAX_CONCURRENT_CUSTOMERS || '10'),
    };

    // Performance configuration - Single job processing only
    const performance: PerformanceConfig = {
      concurrent_jobs: 1, // ENFORCED: Each worker processes exactly one job at a time
      quality_levels: (process.env.QUALITY_LEVELS || 'fast,balanced,quality')
        .split(',')
        .map(s => s.trim()),
      max_processing_time_minutes: parseInt(process.env.MAX_PROCESSING_TIME_MINUTES || '60'),
    };

    // Location configuration for geographic and compliance requirements
    const location: LocationConfig | undefined = process.env.WORKER_REGION
      ? {
          region: process.env.WORKER_REGION,
          country: process.env.WORKER_COUNTRY,
          compliance_zones: process.env.WORKER_COMPLIANCE?.split(',').map(s => s.trim()) || [],
          data_residency_requirements: process.env.WORKER_DATA_RESIDENCY?.split(',').map(s =>
            s.trim()
          ),
        }
      : undefined;

    // Cost configuration for pricing tiers
    const cost: CostConfig | undefined = process.env.WORKER_COST_TIER
      ? {
          tier: process.env.WORKER_COST_TIER as 'economy' | 'standard' | 'premium',
          rate_per_hour: process.env.WORKER_RATE_PER_HOUR
            ? parseFloat(process.env.WORKER_RATE_PER_HOUR)
            : undefined,
          rate_per_job: process.env.WORKER_RATE_PER_JOB
            ? parseFloat(process.env.WORKER_RATE_PER_JOB)
            : undefined,
          minimum_charge: process.env.WORKER_MINIMUM_CHARGE
            ? parseFloat(process.env.WORKER_MINIMUM_CHARGE)
            : undefined,
        }
      : undefined;

    // Parse array environment variables safely
    const parseJsonArray = (envVar: string | undefined): string[] => {
      if (!envVar) return [];
      try {
        // Handle both JSON arrays ["item1","item2"] and comma-separated strings "item1,item2"
        if (envVar.startsWith('[') && envVar.endsWith(']')) {
          return JSON.parse(envVar);
        } else {
          return envVar
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0);
        }
      } catch (error) {
        console.warn(`Failed to parse array from ${envVar}:`, error);
        return [];
      }
    };

    // Build base capabilities
    const capabilities: WorkerCapabilities = {
      worker_id: this.workerId,
      machine_id: this.machineId,
      services,
      hardware,
      models: {}, // Will be populated by connectors
      customer_access: customerAccess,
      performance,
      location,
      cost,
      metadata: {
        version: process.env.npm_package_version || '1.0.0',
        node_version: process.version,
        platform: os.platform(),
        arch: os.arch(),
      },
    };

    // Add custom capability fields from environment variables
    if (process.env.WORKER_ASSET_TYPE) {
      capabilities.asset_type = parseJsonArray(process.env.WORKER_ASSET_TYPE);
    }

    if (process.env.WORKER_MODELS) {
      capabilities.available_models = parseJsonArray(process.env.WORKER_MODELS);
    }

    if (process.env.WORKER_PERFORMANCE_TIER) {
      capabilities.performance_tier = process.env.WORKER_PERFORMANCE_TIER;
    }

    if (process.env.WORKER_FEATURES) {
      capabilities.features = parseJsonArray(process.env.WORKER_FEATURES);
    }

    if (process.env.WORKER_SPECIALIZATION) {
      capabilities.specialization = process.env.WORKER_SPECIALIZATION;
    }

    if (process.env.WORKER_SLA_TIER) {
      capabilities.sla_tier = process.env.WORKER_SLA_TIER;
    }

    if (process.env.WORKER_LIMITATIONS) {
      capabilities.limitations = parseJsonArray(process.env.WORKER_LIMITATIONS);
    }

    if (process.env.WORKER_AVAILABILITY) {
      capabilities.availability = process.env.WORKER_AVAILABILITY;
    }

    if (process.env.WORKER_DEBUGGING_ENABLED) {
      capabilities.debugging_enabled = process.env.WORKER_DEBUGGING_ENABLED === 'true';
    }

    if (process.env.WORKER_EXPERIMENTAL_MODE) {
      capabilities.experimental_mode = process.env.WORKER_EXPERIMENTAL_MODE === 'true';
    }

    if (process.env.WORKER_DEVELOPMENT_MODE) {
      capabilities.development_mode = process.env.WORKER_DEVELOPMENT_MODE === 'true';
    }

    if (process.env.WORKER_MEMORY_CONSTRAINED) {
      capabilities.memory_constrained = process.env.WORKER_MEMORY_CONSTRAINED === 'true';
    }

    if (process.env.WORKER_MAX_BATCH_SIZE) {
      capabilities.max_batch_size = parseInt(process.env.WORKER_MAX_BATCH_SIZE);
    }

    if (process.env.WORKER_MULTI_SERVICE) {
      capabilities.multi_service = process.env.WORKER_MULTI_SERVICE === 'true';
    }

    if (process.env.WORKER_COMFYUI_VERSION) {
      capabilities.comfyui_version = process.env.WORKER_COMFYUI_VERSION;
    }

    if (process.env.WORKER_A1111_VERSION) {
      capabilities.a1111_version = process.env.WORKER_A1111_VERSION;
    }

    if (process.env.WORKER_WORKFLOW_ID) {
      capabilities.workflow_id = process.env.WORKER_WORKFLOW_ID;
    }

    return capabilities;
  }

  async start(): Promise<void> {
    if (this.running) {
      logger.warn(`Worker ${this.workerId} is already running`);
      return;
    }

    try {
      logger.info(`Starting Redis-direct worker ${this.workerId}...`);

      // Connect to Redis first to establish connection
      await this.redisClient.connect(this.capabilities);

      // Pass Redis connection to ConnectorManager
      const redis = this.redisClient.getRedisConnection();
      if (redis) {
        this.connectorManager.setRedisConnection(redis, this.workerId, this.machineId);
        logger.info(`Injected Redis connection into ConnectorManager for worker ${this.workerId}`);
      } else {
        logger.warn(
          `No Redis connection available for ConnectorManager in worker ${this.workerId}`
        );
      }

      // Load and initialize connectors AFTER Redis injection
      await this.connectorManager.loadConnectors();

      // Update capabilities with model information from connectors
      const connectors = this.connectorManager.getAllConnectors();
      const models: Record<string, string[]> = {};
      for (const connector of connectors) {
        try {
          const availableModels = await connector.getAvailableModels();
          models[connector.service_type] = availableModels;
        } catch (error) {
          logger.warn(`Failed to get models from connector ${connector.connector_id}:`, error);
          models[connector.service_type] = [];
        }
      }
      this.capabilities.models = models;
      // Keep the services from buildCapabilities() - don't override with connector service types
      // Workers can handle multiple service types using different connectors

      this.status = WorkerStatus.IDLE;
      this.running = true;

      // Start job polling
      this.startJobPolling();

      // Start job timeout checker
      this.startJobTimeoutChecker();

      // Start periodic connector status updates
      this.startConnectorStatusUpdates();

      // TODO: Start dashboard if enabled (requires interface compatibility)
      // if (process.env.WORKER_DASHBOARD_ENABLED === 'true') {
      //   const port = parseInt(process.env.WORKER_DASHBOARD_PORT || '3003');
      //   this.dashboard = new WorkerDashboard(this, port);
      //   await this.dashboard.start();
      // }

      logger.info(`Redis-direct worker ${this.workerId} started successfully`);
    } catch (error) {
      logger.error(`Failed to start worker ${this.workerId}:`, error);
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.running) return;

    logger.info(`Stopping Redis-direct worker ${this.workerId}...`);

    this.running = false;

    // Send machine shutdown event to Redis before stopping
    try {
      const machineId = this.capabilities.machine_id;
      const shutdownReason = process.env.SHUTDOWN_REASON || 'Worker shutdown';
      await this.sendMachineShutdownEvent(machineId, shutdownReason);
    } catch (error) {
      logger.warn('Failed to send machine shutdown event:', error);
    }

    // Stop job polling
    this.redisClient.stopPolling();

    // Stop job timeout checker
    if (this.jobTimeoutCheckInterval) {
      clearInterval(this.jobTimeoutCheckInterval);
      this.jobTimeoutCheckInterval = undefined;
    }

    // Stop connector status updates
    if (this.connectorStatusInterval) {
      clearInterval(this.connectorStatusInterval);
      this.connectorStatusInterval = undefined;
    }

    // Cancel any ongoing jobs
    for (const [jobId, _job] of this.currentJobs) {
      await this.failJob(jobId, 'Worker shutdown', false);
    }

    // Clear job timeouts
    this.jobTimeouts.forEach(timeout => clearTimeout(timeout));
    this.jobTimeouts.clear();

    // Stop dashboard
    if (this.dashboard) {
      await this.dashboard.stop();
    }

    // Disconnect from Redis
    await this.redisClient.disconnect();

    this.status = WorkerStatus.OFFLINE;
    logger.info(`Redis-direct worker ${this.workerId} stopped`);
  }

  private async sendMachineShutdownEvent(machineId: string, reason: string): Promise<void> {
    try {
      const shutdownEvent = {
        event_type: 'shutdown',
        machine_id: machineId,
        worker_id: this.workerId,
        reason: reason,
        timestamp: Date.now(),
      };

      await this.redisClient.publishMachineEvent(shutdownEvent);
      logger.info(`📢 Published machine shutdown event for ${machineId}: ${reason}`);
    } catch (error) {
      logger.error('Failed to publish machine shutdown event:', error);
      throw error;
    }
  }

  private startJobPolling(): void {
    this.redisClient.startPolling(this.capabilities, async (job: Job) => {
      await this.handleJobAssignment(job);
    });
  }

  private async handleJobAssignment(job: Job): Promise<void> {
    if (this.currentJobs.size >= this.maxConcurrentJobs) {
      logger.warn(`Worker ${this.workerId} at max capacity, cannot take job ${job.id}`);
      // Job should be returned to queue, but Redis-direct client handles this
      return;
    }

    // CRITICAL FIX: Check if job is already being processed
    if (this.currentJobs.has(job.id)) {
      logger.warn(`Job ${job.id} is already being processed by this worker, ignoring duplicate`);
      return;
    }

    // CRITICAL FIX: Double-check worker status
    if (this.status === WorkerStatus.BUSY) {
      logger.warn(`Worker ${this.workerId} is already ${this.status}, cannot take job ${job.id}`);
      return;
    }

    this.currentJobs.set(job.id, job);
    this.jobStartTimes.set(job.id, Date.now());
    this.status = WorkerStatus.BUSY;

    // Set job timeout
    const timeoutMs = this.jobTimeoutMinutes * 60 * 1000;
    const timeout = setTimeout(() => {
      this.handleJobTimeout(job.id);
    }, timeoutMs);
    this.jobTimeouts.set(job.id, timeout);

    logger.info(`Worker ${this.workerId} starting job ${job.id} (${job.service_required})`);

    try {
      await this.processJob(job);
    } catch (error) {
      logger.error(`Worker ${this.workerId} job ${job.id} processing failed:`, error);
      await this.failJob(job.id, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async processJob(job: Job): Promise<void> {
    const connector = this.connectorManager.getConnectorByServiceType(job.service_required);
    if (!connector) {
      throw new Error(`No connector available for service: ${job.service_required}`);
    }

    // Update job status to IN_PROGRESS when processing begins
    await this.redisClient.startJobProcessing(job.id);

    // Update connector to 'active' when job starts
    await this.updateConnectorStatus(job.service_required, 'active');

    // Set up progress callback
    const onProgress = async (progress: JobProgress) => {
      await this.redisClient.sendJobProgress(job.id, progress);
    };

    // Transform payload for simulation mode when needed
    let transformedPayload = job.payload;
    if (connector.service_type === 'simulation' && job.service_required !== 'simulation') {
      transformedPayload = this.transformPayloadForSimulation(job.service_required, job.payload);
      logger.info(`Transformed ${job.service_required} payload for simulation mode`);
    }

    // Process the job (convert to connector interface)
    const jobData = {
      id: job.id,
      type: job.service_required,
      payload: transformedPayload,
      requirements: job.requirements,
    };
    const result = await connector.processJob(jobData, onProgress);

    // Small delay to ensure final progress updates are written to Redis
    await new Promise(resolve => setTimeout(resolve, 100));

    // Complete the job
    await this.completeJob(job.id, result);
  }

  private async completeJob(jobId: string, result: unknown): Promise<void> {
    try {
      // Get job info before completing to update connector status
      const job = this.currentJobs.get(jobId);

      await this.redisClient.completeJob(jobId, result);
      this.finishJob(jobId);

      // Update connector to 'idle' when job completes
      if (job) {
        await this.updateConnectorStatus(job.service_required, 'idle');
      }

      logger.info(`Worker ${this.workerId} completed job ${jobId}`);
    } catch (error) {
      logger.error(`Worker ${this.workerId} failed to complete job ${jobId}:`, error);
      await this.failJob(jobId, error instanceof Error ? error.message : 'Failed to complete job');
    }
  }

  private async failJob(jobId: string, error: string, canRetry = true): Promise<void> {
    try {
      // Get job info before failing to update connector status
      const job = this.currentJobs.get(jobId);

      await this.redisClient.failJob(jobId, error, canRetry);
      this.finishJob(jobId);

      // Update connector to 'error' when job fails
      if (job) {
        await this.updateConnectorStatus(job.service_required, 'error', error);
      }

      logger.error(`Worker ${this.workerId} failed job ${jobId}: ${error}`);
    } catch (err) {
      logger.error(`Worker ${this.workerId} failed to fail job ${jobId}:`, err);
    }
  }

  private finishJob(jobId: string): void {
    this.currentJobs.delete(jobId);
    this.jobStartTimes.delete(jobId);

    // Clear timeout
    const timeout = this.jobTimeouts.get(jobId);
    if (timeout) {
      clearTimeout(timeout);
      this.jobTimeouts.delete(jobId);
    }

    // Update status
    this.status = this.currentJobs.size > 0 ? WorkerStatus.BUSY : WorkerStatus.IDLE;

    // Ensure Redis status is updated when worker becomes idle
    if (this.status === WorkerStatus.IDLE) {
      this.redisClient.updateWorkerStatus('idle').catch(error => {
        logger.error(`Failed to update worker status to idle: ${error}`);
      });
    }
  }

  private handleJobTimeout(jobId: string): void {
    logger.warn(
      `Worker ${this.workerId} job ${jobId} timed out after ${this.jobTimeoutMinutes} minutes`
    );
    this.failJob(jobId, `Job timeout after ${this.jobTimeoutMinutes} minutes`, true);
  }

  private startJobTimeoutChecker(): void {
    this.jobTimeoutCheckInterval = setInterval(() => {
      const now = Date.now();
      for (const [jobId, startTime] of this.jobStartTimes) {
        const runtime = now - startTime;
        const timeoutMs = this.jobTimeoutMinutes * 60 * 1000;

        if (runtime > timeoutMs) {
          logger.warn(`Worker ${this.workerId} detected stuck job ${jobId}, failing it`);
          this.handleJobTimeout(jobId);
        }
      }
    }, 60000); // Check every minute
  }

  // Getters for external access
  getWorkerId(): string {
    return this.workerId;
  }

  getStatus(): WorkerStatus {
    return this.status;
  }

  getCurrentJobs(): Job[] {
    return Array.from(this.currentJobs.values());
  }

  async getCurrentCapabilitiesWithConnectorStatus(): Promise<
    WorkerCapabilities & { connector_statuses?: Record<string, unknown> }
  > {
    const capabilities = this.getCapabilities();

    try {
      // Get real-time connector statuses
      const connectorStatuses = await this.connectorManager.getConnectorStatuses();

      return {
        ...capabilities,
        connector_statuses: connectorStatuses,
      };
    } catch (error) {
      logger.warn(`Failed to get connector statuses for worker ${this.workerId}:`, error);
      return capabilities;
    }
  }

  getCapabilities(): WorkerCapabilities {
    return this.capabilities;
  }

  isRunning(): boolean {
    return this.running;
  }

  isConnected(): boolean {
    return this.redisClient.isConnected();
  }

  /**
   * Transform complex service payloads into simple simulation payloads
   */
  private transformPayloadForSimulation(
    serviceType: string,
    originalPayload: unknown
  ): Record<string, unknown> {
    const basePayload = {
      simulation_type: serviceType,
      original_payload_preserved: true,
      timestamp: new Date().toISOString(),
    };

    try {
      // Handle ComfyUI workflow payloads
      if (
        serviceType.includes('comfyui') &&
        typeof originalPayload === 'object' &&
        originalPayload !== null
      ) {
        const payload = originalPayload as Record<string, unknown>;

        if (payload.workflow && typeof payload.workflow === 'object') {
          const workflow = payload.workflow as Record<string, unknown>;
          const nodeCount = Object.keys(workflow).length;

          // Extract meaningful parameters from ComfyUI workflow
          let steps = 20; // default
          let seed = Math.floor(Math.random() * 1000000);
          let cfg = 7; // default

          // Look for KSampler node to extract parameters
          for (const nodeData of Object.values(workflow)) {
            if (typeof nodeData === 'object' && nodeData !== null) {
              const node = nodeData as Record<string, unknown>;
              if (
                node.class_type === 'KSampler' &&
                node.inputs &&
                typeof node.inputs === 'object'
              ) {
                const inputs = node.inputs as Record<string, unknown>;
                if (typeof inputs.steps === 'number') steps = inputs.steps;
                if (typeof inputs.seed === 'number') seed = inputs.seed;
                if (typeof inputs.cfg === 'number') cfg = inputs.cfg;
                break;
              }
            }
          }

          return {
            ...basePayload,
            workflow_nodes: nodeCount,
            steps: Math.min(steps, 25), // Cap steps for simulation
            seed: seed,
            cfg: cfg,
            simulation_message: `Simulating ComfyUI workflow with ${nodeCount} nodes`,
          };
        }
      }

      // Handle A1111 payloads
      if (
        serviceType.includes('a1111') &&
        typeof originalPayload === 'object' &&
        originalPayload !== null
      ) {
        const payload = originalPayload as Record<string, unknown>;

        return {
          ...basePayload,
          steps: typeof payload.steps === 'number' ? Math.min(payload.steps, 25) : 20,
          seed:
            typeof payload.seed === 'number' ? payload.seed : Math.floor(Math.random() * 1000000),
          cfg_scale: typeof payload.cfg_scale === 'number' ? payload.cfg_scale : 7,
          width: typeof payload.width === 'number' ? payload.width : 512,
          height: typeof payload.height === 'number' ? payload.height : 512,
          simulation_message: 'Simulating A1111 text-to-image generation',
        };
      }

      // Generic simulation payload for other service types
      return {
        ...basePayload,
        steps: 15,
        seed: Math.floor(Math.random() * 1000000),
        simulation_message: `Simulating ${serviceType} processing`,
        original_payload_summary: this.summarizePayload(originalPayload),
      };
    } catch (error) {
      logger.warn(`Failed to transform payload for ${serviceType}, using basic simulation:`, error);
      return {
        ...basePayload,
        steps: 10,
        seed: Math.floor(Math.random() * 1000000),
        simulation_message: `Basic simulation for ${serviceType} (payload transformation failed)`,
        error: 'payload_transformation_failed',
      };
    }
  }

  /**
   * Create a summary of the original payload for debugging
   */
  private summarizePayload(payload: unknown): Record<string, unknown> {
    if (typeof payload !== 'object' || payload === null) {
      return { type: typeof payload, value: payload };
    }

    const obj = payload as Record<string, unknown>;
    const summary: Record<string, unknown> = {
      type: 'object',
      keys: Object.keys(obj).length,
    };

    // Add a few sample keys for debugging
    const keys = Object.keys(obj).slice(0, 3);
    if (keys.length > 0) {
      summary.sample_keys = keys;
    }

    return summary;
  }

  private startConnectorStatusUpdates(): void {
    // Send initial status immediately
    this.sendConnectorStatusUpdate();

    // Start periodic status monitoring (every 15 seconds)
    this.connectorStatusInterval = setInterval(async () => {
      await this.sendConnectorStatusUpdate();
    }, 15000);

    logger.info(
      `Started periodic connector status reporting for worker ${this.workerId} (15s interval)`
    );
  }

  private async sendConnectorStatusUpdate(): Promise<void> {
    try {
      const currentStatuses = await this.connectorManager.getConnectorStatuses();

      // Check if any status changed
      if (this.hasStatusChanged(currentStatuses)) {
        await this.redisClient.updateConnectorStatuses(currentStatuses);

        // Publish real-time events for changed statuses
        await this.publishStatusChanges(currentStatuses);

        logger.debug(
          `Updated connector statuses for worker ${this.workerId}:`,
          Object.keys(currentStatuses)
            .map(key => `${key}:${currentStatuses[key].status}`)
            .join(', ')
        );
      }

      this.lastConnectorStatuses = currentStatuses;
    } catch (error) {
      logger.warn(`Failed to send connector status update for worker ${this.workerId}:`, error);
    }
  }

  private hasStatusChanged(currentStatuses: Record<string, ConnectorStatus>): boolean {
    // If no previous statuses, this is the first update
    if (Object.keys(this.lastConnectorStatuses).length === 0) {
      return true;
    }

    return Object.keys(currentStatuses).some(connectorId => {
      const current = currentStatuses[connectorId];
      const last = this.lastConnectorStatuses[connectorId];

      return (
        !last || current.status !== last.status || current.error_message !== last.error_message
      );
    });
  }

  private async publishStatusChanges(
    currentStatuses: Record<string, ConnectorStatus>
  ): Promise<void> {
    for (const [connectorId, status] of Object.entries(currentStatuses)) {
      const lastStatus = this.lastConnectorStatuses[connectorId];

      // Only publish if status actually changed
      if (!lastStatus || status.status !== lastStatus.status) {
        try {
          const statusData = {
            connector_id: connectorId,
            service_type: connectorId, // Assuming connector_id is the service type
            worker_id: this.workerId,
            machine_id: this.machineId,
            status: status.status,
            timestamp: Date.now(),
            error_message: status.error_message,
          };

          const redis = this.redisClient.getRedisConnection();
          if (redis) {
            await redis.publish(`connector_status:${connectorId}`, JSON.stringify(statusData));
          }

          logger.debug(
            `Published status change for ${connectorId}: ${lastStatus?.status || 'none'} → ${status.status}`
          );
        } catch (error) {
          logger.warn(`Failed to publish status change for ${connectorId}:`, error);
        }
      }
    }
  }

  private async updateConnectorStatus(
    serviceType: string,
    status: string,
    errorMessage?: string
  ): Promise<void> {
    try {
      // Update local connector manager
      await this.connectorManager.updateConnectorStatus(serviceType, status, errorMessage);

      // Immediately publish to Redis (this will trigger sendConnectorStatusUpdate)
      await this.sendConnectorStatusUpdate();

      logger.debug(`Updated connector ${serviceType} status to ${status}`);
    } catch (error) {
      logger.warn(`Failed to update connector status for ${serviceType}:`, error);
    }
  }
}
