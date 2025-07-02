// Redis-Direct Base Worker - Phase 1B Implementation
// Core worker logic with Redis-direct polling instead of WebSocket hub communication

import { ConnectorManager } from './connector-manager.js';
import { RedisDirectWorkerClient } from './redis-direct-worker-client.js';
import {
  WorkerCapabilities,
  WorkerStatus,
  HardwareSpecs,
  CustomerAccessConfig,
  PerformanceConfig,
} from '../core/types/worker.js';
import { Job, JobProgress, JobStatus } from '../core/types/job.js';
import { logger } from '../core/utils/logger.js';
import { WorkerDashboard } from './worker-dashboard.js';
import os from 'os';

export class RedisDirectBaseWorker {
  private workerId: string;
  private connectorManager: ConnectorManager;
  private redisClient: RedisDirectWorkerClient;
  private capabilities: WorkerCapabilities;
  private status: WorkerStatus = WorkerStatus.INITIALIZING;
  private currentJobs = new Map<string, Job>();
  private jobStartTimes = new Map<string, number>();
  private jobTimeouts = new Map<string, NodeJS.Timeout>();
  private running = false;
  private jobTimeoutCheckInterval?: NodeJS.Timeout;
  private pollIntervalMs: number;
  private maxConcurrentJobs: number;
  private jobTimeoutMinutes: number;
  private dashboard?: WorkerDashboard;

  constructor(workerId: string, connectorManager: ConnectorManager, hubRedisUrl: string) {
    this.workerId = workerId;
    this.connectorManager = connectorManager;
    this.redisClient = new RedisDirectWorkerClient(hubRedisUrl, workerId);

    // Configuration from environment - match existing patterns
    this.pollIntervalMs = parseInt(process.env.WORKER_POLL_INTERVAL_MS || '1000'); // Faster polling for Redis-direct
    this.maxConcurrentJobs = parseInt(process.env.WORKER_MAX_CONCURRENT_JOBS || '1');
    this.jobTimeoutMinutes = parseInt(process.env.WORKER_JOB_TIMEOUT_MINUTES || '30');

    // Build capabilities
    this.capabilities = this.buildCapabilities();

    logger.info(
      `Redis-direct worker ${this.workerId} initialized with ${this.maxConcurrentJobs} max concurrent jobs`
    );
  }

  private buildCapabilities(): WorkerCapabilities {
    // Services this worker can handle
    const services = (process.env.WORKER_SERVICES || 'comfyui,a1111').split(',').map(s => s.trim());

    // Hardware specs
    const hardware: HardwareSpecs = {
      cpu_cores: parseInt(process.env.WORKER_CPU_CORES || os.cpus().length.toString()),
      ram_gb: parseInt(process.env.WORKER_RAM_GB || '8'),
      gpu_memory_gb: parseInt(process.env.WORKER_GPU_MEMORY_GB || '8'),
      gpu_model: process.env.WORKER_GPU_MODEL || 'unknown',
    };

    // Customer access configuration
    const customerAccess: CustomerAccessConfig = {
      isolation: (process.env.CUSTOMER_ISOLATION as 'strict' | 'loose' | 'none') || 'loose',
      allowed_customers: process.env.ALLOWED_CUSTOMERS?.split(',').map(s => s.trim()),
      denied_customers: process.env.DENIED_CUSTOMERS?.split(',').map(s => s.trim()),
      max_concurrent_customers: parseInt(process.env.MAX_CONCURRENT_CUSTOMERS || '10'),
    };

    // Performance configuration
    const performance: PerformanceConfig = {
      concurrent_jobs: this.maxConcurrentJobs,
      quality_levels: (process.env.QUALITY_LEVELS || 'fast,balanced,quality')
        .split(',')
        .map(s => s.trim()),
      max_processing_time_minutes: parseInt(process.env.MAX_PROCESSING_TIME_MINUTES || '60'),
    };

    return {
      worker_id: this.workerId,
      services,
      hardware,
      models: {}, // Will be populated by connectors
      customer_access: customerAccess,
      performance,
      metadata: {
        version: process.env.npm_package_version || '1.0.0',
        node_version: process.version,
        platform: os.platform(),
        arch: os.arch(),
      },
    };
  }

  async start(): Promise<void> {
    if (this.running) {
      logger.warn(`Worker ${this.workerId} is already running`);
      return;
    }

    try {
      logger.info(`Starting Redis-direct worker ${this.workerId}...`);

      // Connect to Redis and register
      await this.redisClient.connect(this.capabilities);

      // Load and initialize connectors
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
      this.capabilities.services = connectors.map(c => c.service_type);

      this.status = WorkerStatus.IDLE;
      this.running = true;

      // Start job polling
      this.startJobPolling();

      // Start job timeout checker
      this.startJobTimeoutChecker();

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

    // Stop job polling
    this.redisClient.stopPolling();

    // Stop job timeout checker
    if (this.jobTimeoutCheckInterval) {
      clearInterval(this.jobTimeoutCheckInterval);
      this.jobTimeoutCheckInterval = undefined;
    }

    // Cancel any ongoing jobs
    for (const [jobId, job] of this.currentJobs) {
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

    // Set up progress callback
    const onProgress = async (progress: JobProgress) => {
      await this.redisClient.sendJobProgress(job.id, progress);
    };

    // Process the job (convert to connector interface)
    const jobData = {
      id: job.id,
      type: job.service_required,
      payload: job.payload,
      requirements: job.requirements,
    };
    const result = await connector.processJob(jobData, onProgress);

    // Complete the job
    await this.completeJob(job.id, result);
  }

  private async completeJob(jobId: string, result: unknown): Promise<void> {
    try {
      await this.redisClient.completeJob(jobId, result);
      this.finishJob(jobId);
      logger.info(`Worker ${this.workerId} completed job ${jobId}`);
    } catch (error) {
      logger.error(`Worker ${this.workerId} failed to complete job ${jobId}:`, error);
      await this.failJob(jobId, error instanceof Error ? error.message : 'Failed to complete job');
    }
  }

  private async failJob(jobId: string, error: string, canRetry = true): Promise<void> {
    try {
      await this.redisClient.failJob(jobId, error, canRetry);
      this.finishJob(jobId);
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

  getCapabilities(): WorkerCapabilities {
    return this.capabilities;
  }

  isRunning(): boolean {
    return this.running;
  }

  isConnected(): boolean {
    return this.redisClient.isConnected();
  }
}
