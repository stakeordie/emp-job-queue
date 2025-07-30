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
import { JobHealthMonitor, HealthCheckResult } from './job-health-monitor.js';
import path from 'path';
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
import { readFileSync } from 'fs';
import os from 'os';

/**
 * Get worker version from git tag or bundled package.json
 * Prioritizes git tag for releases, falls back to bundled version
 */
function getWorkerVersion(): string {
  try {
    // For releases: CI/CD should set WORKER_VERSION env var from git tag
    if (process.env.VERSION) {
      return process.env.VERSION;
    }

    // For downloaded releases, check if package.json exists in same directory as worker
    // PM2 runs from /tmp/worker_gpu{N} directory
    const currentDir = process.cwd();
    const localPackageJsonPath = path.join(currentDir, 'package.json');
    try {
      const packageJson = JSON.parse(readFileSync(localPackageJsonPath, 'utf8'));
      // If we find a package.json, use its version directly (git tag already has 'v' prefix)
      const version = packageJson.version || '1.0.0';
      // For release downloads, just return the version as-is (git tag like 'v0.0.47')
      return version === '1.0.0' ? 'v1.0.0-release' : version;
    } catch {
      // Continue to other paths
    }

    // In container, try to read from bundled worker package.json
    // This will have the version set by the bundle script
    const bundledPath = '/workspace/worker-bundled/package.json';
    try {
      const packageJson = JSON.parse(readFileSync(bundledPath, 'utf8'));
      return packageJson.version || 'unknown';
    } catch {
      // Try dist version (for development builds)
      const distPath = '/workspace/worker-dist/package.json';
      const packageJson = JSON.parse(readFileSync(distPath, 'utf8'));
      return packageJson.version || 'unknown';
    }
  } catch (_error) {
    // Final fallback
    return process.env.npm_package_version || 'dev-unknown';
  }
}

export class RedisDirectBaseWorker {
  private workerId: string;
  private machineId: string;
  private connectorManager: ConnectorManager;
  private redisClient: RedisDirectWorkerClient;
  private jobHealthMonitor: JobHealthMonitor;
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

    // Initialize job health monitor
    const healthCheckIntervalMs = parseInt(process.env.HEALTH_CHECK_INTERVAL_MS || '30000');
    const inactivityTimeoutMs = parseInt(
      process.env.WEBSOCKET_INACTIVITY_TIMEOUT_MS || '30000'
    );
    this.jobHealthMonitor = new JobHealthMonitor(
      connectorManager,
      healthCheckIntervalMs,
      inactivityTimeoutMs
    );

    // Configuration from environment - match existing patterns
    this.pollIntervalMs = parseInt(process.env.POLL_INTERVAL_MS || '1000'); // Faster polling for Redis-direct
    // ENFORCED: Workers process exactly ONE job at a time - no concurrency within a worker
    this.maxConcurrentJobs = 1; // NEVER change this - workers are single-job processors
    this.jobTimeoutMinutes = parseInt(process.env.JOB_TIMEOUT_MINUTES || '30');

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

  private getServicesFromMapping(): string[] {
    try {
      // Get worker types from WORKERS environment variable
      const workersEnv = process.env.WORKERS || '';
      const workerSpecs = workersEnv
        .split(',')
        .map(s => s.trim())
        .filter(s => s)
        .map(spec => spec.split(':')[0]); // Extract type from "type:count"

      if (workerSpecs.length === 0) {
        throw new Error('SYSTEM IS FUCKED: No WORKERS environment variable specified. I cannot determine what services this worker should provide. Set WORKERS=worker-type:count environment variable.');
      }

      // Load service mapping
      const fs = require('fs');
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
        throw new Error(`SYSTEM IS FUCKED: service-mapping.json not found in any of these paths: ${possiblePaths.join(', ')}. I cannot determine what capabilities this worker should have. The worker bundle is broken.`);
      }

      const serviceMappingContent = fs.readFileSync(serviceMappingPath, 'utf8');
      const serviceMapping = JSON.parse(serviceMappingContent);
      
      // Extract capabilities from all worker types
      const allCapabilities = new Set<string>();
      
      for (const workerType of workerSpecs) {
        const workerConfig = serviceMapping.workers?.[workerType];
        if (workerConfig && workerConfig.service) {
          for (const service of workerConfig.service) {
            if (service.capability) {
              if (Array.isArray(service.capability)) {
                service.capability.forEach(cap => allCapabilities.add(cap));
              } else {
                allCapabilities.add(service.capability);
              }
            }
          }
        } else {
          throw new Error(`SYSTEM IS FUCKED: Worker type '${workerType}' not found in service mapping. Available worker types: ${Object.keys(serviceMapping.workers || {}).join(', ')}. Check your WORKERS environment variable.`);
        }
      }
      
      const capabilities = Array.from(allCapabilities);
      logger.info(`Derived capabilities from service mapping: ${capabilities.join(', ')}`);
      return capabilities;
      
    } catch (error) {
      logger.error('Failed to load capabilities from service mapping:', error);
      throw error; // Re-throw the error instead of using fallback
    }
  }

  private buildCapabilities(): WorkerCapabilities {
    // Services this worker can handle - derive from service mapping
    const services = this.getServicesFromMapping();

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
        version: getWorkerVersion(),
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

    if (process.env.DEBUGGING_ENABLED) {
      capabilities.debugging_enabled = process.env.DEBUGGING_ENABLED === 'true';
    }

    if (process.env.WORKER_EXPERIMENTAL_MODE) {
      capabilities.experimental_mode = process.env.WORKER_EXPERIMENTAL_MODE === 'true';
    }

    if (process.env.DEVELOPMENT_MODE) {
      capabilities.development_mode = process.env.DEVELOPMENT_MODE === 'true';
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

      // Set parent worker reference for immediate status updates
      this.connectorManager.setParentWorker(this);
      logger.info(`Set parent worker reference in ConnectorManager for worker ${this.workerId}`);

      // Load and initialize connectors AFTER Redis injection and parent worker setup
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

      // Send worker connected event with version info
      await this.sendMachineEvent('worker_status_changed', {
        status: 'idle',
        is_connected: true,
        current_job_id: null,
        last_activity: Date.now(),
        version: getWorkerVersion(), // Use actual Git release version
        build_timestamp: Date.now(), // Timestamp for build verification
        build_info: 'status-events-v2',
      });

      // Start job polling
      this.startJobPolling();

      // Start job timeout checker
      this.startJobTimeoutChecker();

      // Start periodic connector status updates
      this.startConnectorStatusUpdates();

      // Setup and start job health monitoring
      this.jobHealthMonitor.setHealthCheckCallback(async (jobId, job, result) => {
        await this.handleHealthCheckResult(jobId, job, result);
      });
      this.jobHealthMonitor.start();

      // TODO: Start dashboard if enabled (requires interface compatibility)
      // if (process.env.WORKER_DASHBOARD_ENABLED === 'true') {
      //   const port = parseInt(process.env.WORKER_DASHBOARD_PORT || '3003');
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

    // Stop job health monitoring
    this.jobHealthMonitor.stop();

    // Cancel any ongoing jobs
    for (const [jobId, _job] of this.currentJobs) {
      await this.failJob(jobId, 'Worker shutdown', false);
    }

    // Clear job timeouts
    this.jobTimeouts.forEach(timeout => clearTimeout(timeout));
    this.jobTimeouts.clear();

    // Dashboard removed - no longer used

    // Disconnect from Redis
    await this.redisClient.disconnect();

    this.status = WorkerStatus.OFFLINE;

    // Send worker disconnected event
    await this.sendMachineEvent('worker_status_changed', {
      status: 'offline',
      is_connected: false,
      current_job_id: null,
      last_activity: Date.now(),
    });

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

    // Start health monitoring for this job
    this.jobHealthMonitor.startMonitoring(job);

    // Send worker busy event
    await this.sendMachineEvent('worker_status_changed', {
      status: 'busy',
      is_connected: true,
      current_job_id: job.id,
      last_activity: Date.now(),
      version: getWorkerVersion(),
      build_timestamp: Date.now(),
      build_info: 'status-events-v2',
    });

    // Set job timeout
    const timeoutMs = this.jobTimeoutMinutes * 60 * 1000;
    const timeout = setTimeout(() => {
      this.handleJobTimeout(job.id);
    }, timeoutMs);
    this.jobTimeouts.set(job.id, timeout);

    logger.info(`Worker ${this.workerId} starting job ${job.id} (${job.service_required})`);
    
    // Log the complete job structure for debugging - shows everything the worker has access to
    logger.info(`📋 Complete Job Structure:`, job);

    try {
      await this.processJob(job);
    } catch (error) {
      logger.error(`Worker ${this.workerId} job ${job.id} processing failed:`, error);
      await this.failJob(job.id, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async processJob(job: Job): Promise<void> {
    const connector = await this.connectorManager.getConnectorByService(job.service_required);
    if (!connector) {
      throw new Error(`No connector available for service: ${job.service_required}`);
    }

    // Update job status to IN_PROGRESS when processing begins
    await this.redisClient.startJobProcessing(job.id);

    // Send job started event to machine aggregator
    if (process.env.UNIFIED_MACHINE_STATUS === 'true') {
      await this.sendMachineEvent('job_started', {
        job_id: job.id,
        service_type: job.service_required,
      });
    }

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
      await this.finishJob(jobId);

      // Send job completed event to machine aggregator
      if (process.env.UNIFIED_MACHINE_STATUS === 'true' && job) {
        await this.sendMachineEvent('job_completed', {
          job_id: jobId,
          service_type: job.service_required,
        });
      }

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
      await this.finishJob(jobId);

      // Send job failed event to machine aggregator
      if (process.env.UNIFIED_MACHINE_STATUS === 'true' && job) {
        await this.sendMachineEvent('job_failed', {
          job_id: jobId,
          service_type: job.service_required,
          error: error,
        });
      }

      // Update connector to 'error' when job fails
      if (job) {
        await this.updateConnectorStatus(job.service_required, 'error', error);
      }

      logger.error(`Worker ${this.workerId} failed job ${jobId}: ${error}`);
    } catch (err) {
      logger.error(`Worker ${this.workerId} failed to fail job ${jobId}:`, err);
    }
  }

  private async finishJob(jobId: string): Promise<void> {
    this.currentJobs.delete(jobId);
    this.jobStartTimes.delete(jobId);

    // Stop health monitoring for this job
    this.jobHealthMonitor.stopMonitoring(jobId);

    // Clear timeout
    const timeout = this.jobTimeouts.get(jobId);
    if (timeout) {
      clearTimeout(timeout);
      this.jobTimeouts.delete(jobId);
    }

    // Update status
    const newStatus = this.currentJobs.size > 0 ? WorkerStatus.BUSY : WorkerStatus.IDLE;
    const statusChanged = this.status !== newStatus;
    this.status = newStatus;

    // Send status change event if status changed
    if (statusChanged) {
      await this.sendMachineEvent('worker_status_changed', {
        status: this.status === WorkerStatus.IDLE ? 'idle' : 'busy',
        is_connected: true,
        current_job_id: this.currentJobs.size > 0 ? Array.from(this.currentJobs.keys())[0] : null,
        last_activity: Date.now(),
        version: getWorkerVersion(),
        build_timestamp: Date.now(),
        build_info: 'status-events-v2',
      });
    }

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

  /**
   * Handle the result of a health check (called by JobHealthMonitor)
   */
  private async handleHealthCheckResult(
    jobId: string,
    job: Job,
    healthResult: HealthCheckResult
  ): Promise<void> {
    switch (healthResult.action) {
      case 'complete_job':
        logger.info(`Health check found completed job ${jobId}, completing it`);
        await this.completeJob(
          jobId,
          healthResult.result || { recovered: true, reason: healthResult.reason }
        );
        break;

      case 'fail_job':
        logger.warn(
          `Health check detected failed job ${jobId}, failing it: ${healthResult.reason}`
        );
        await this.failJob(jobId, `Health check failure: ${healthResult.reason}`, false);
        break;

      case 'return_to_queue':
        logger.warn(`Health check requests job ${jobId} return to queue: ${healthResult.reason}`);
        await this.failJob(jobId, `Health check recovery: ${healthResult.reason}`, true);
        break;

      case 'continue_monitoring':
        logger.info(
          `Health check indicates job ${jobId} is still processing normally: ${healthResult.reason}`
        );
        // Restart health monitoring for this job
        this.jobHealthMonitor.startMonitoring(job);
        break;

      default:
        logger.warn(`Unknown health check action for job ${jobId}: ${healthResult.action}`);
        break;
    }
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
    // Skip individual connector status updates if unified machine status is enabled
    if (process.env.UNIFIED_MACHINE_STATUS === 'true') {
      logger.info(
        `Skipping individual connector status updates for worker ${this.workerId} - using unified machine status`
      );
      return;
    }

    // Send initial status immediately
    this.sendConnectorStatusUpdate();

    // Start periodic status monitoring (every 3 seconds for real-time monitoring)
    this.connectorStatusInterval = setInterval(async () => {
      await this.sendConnectorStatusUpdate();
    }, 3000);

    logger.info(
      `Started periodic connector status reporting for worker ${this.workerId} (3s interval)`
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

      // If using unified machine status, send event to machine aggregator
      if (process.env.UNIFIED_MACHINE_STATUS === 'true') {
        await this.sendMachineEvent('connector_status_changed', {
          service_type: serviceType,
          status: status,
          health: errorMessage ? 'unhealthy' : 'healthy',
        });
      } else {
        // Immediately publish to Redis (this will trigger sendConnectorStatusUpdate)
        await this.sendConnectorStatusUpdate();
      }

      logger.debug(`Updated connector ${serviceType} status to ${status}`);
    } catch (error) {
      logger.warn(`Failed to update connector status for ${serviceType}:`, error);
    }
  }

  /**
   * Force an immediate connector status update (for event-driven updates)
   * Call this when a connector health status changes
   */
  public async forceConnectorStatusUpdate(): Promise<void> {
    logger.debug(`Force updating connector statuses for worker ${this.workerId}`);
    await this.sendConnectorStatusUpdate();
  }

  /**
   * Update WebSocket activity timestamp for a job
   * Called by connectors when they receive WebSocket messages
   */
  public updateJobWebSocketActivity(jobId: string): void {
    if (this.currentJobs.has(jobId)) {
      this.jobHealthMonitor.updateWebSocketActivity(jobId);
    }
  }

  /**
   * Send event to machine status aggregator
   */
  private async sendMachineEvent(eventType: string, data: unknown): Promise<void> {
    try {
      const redis = this.redisClient.getRedisConnection();
      if (!redis) return;

      const event = {
        worker_id: this.workerId,
        event_type: eventType,
        data: data,
        timestamp: Date.now(),
      };

      const channel = `machine:${this.machineId}:worker:${this.workerId}`;
      await redis.publish(channel, JSON.stringify(event));

      logger.debug(`Sent machine event: ${eventType} to ${channel}`);
    } catch (error) {
      logger.warn(`Failed to send machine event ${eventType}:`, error);
    }
  }
}
