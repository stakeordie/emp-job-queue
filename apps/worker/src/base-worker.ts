// Base Worker Implementation - direct port from Python worker/base_worker.py
// Core worker logic with job processing loop and connector management 

import { ConnectorManager } from './connector-manager.js';
import { WorkerClient } from './worker-client.js';
import {
  WorkerCapabilities,
  WorkerStatus,
  HardwareSpecs,
  CustomerAccessConfig,
  PerformanceConfig,
  Job,
  JobProgress,
  BaseMessage,
  MessageType,
  JobAssignedMessage,
  MessageSystemInfo,
  WorkerStatus as MessageWorkerStatus,
  logger,
} from '@emp/core';
import { WorkerDashboard } from './worker-dashboard.js';
import os from 'os';

export class BaseWorker {
  private workerId: string;
  private connectorManager: ConnectorManager;
  private workerClient: WorkerClient;
  private capabilities: WorkerCapabilities;
  private status: WorkerStatus = WorkerStatus.INITIALIZING;
  private currentJobs = new Map<string, Job>();
  private jobStartTimes = new Map<string, number>();
  private jobTimeouts = new Map<string, NodeJS.Timeout>();
  private running = false;
  private jobProcessingInterval?: NodeJS.Timeout;
  private heartbeatInterval?: NodeJS.Timeout;
  private jobTimeoutCheckInterval?: NodeJS.Timeout;
  private pollIntervalMs: number;
  private maxConcurrentJobs: number;
  private jobTimeoutMinutes: number;
  private dashboard?: WorkerDashboard;

  constructor(workerId: string, connectorManager: ConnectorManager, workerClient: WorkerClient) {
    this.workerId = workerId;
    this.connectorManager = connectorManager;
    this.workerClient = workerClient;

    // Configuration from environment - match Python patterns
    this.pollIntervalMs = parseInt(process.env.WORKER_POLL_INTERVAL_MS || '5000');
    this.maxConcurrentJobs = parseInt(process.env.WORKER_MAX_CONCURRENT_JOBS || '1');
    this.jobTimeoutMinutes = parseInt(process.env.WORKER_JOB_TIMEOUT_MINUTES || '60');

    // Initialize capabilities from environment and system info
    this.capabilities = this.buildWorkerCapabilities();

    // Set up message handlers
    this.setupMessageHandlers();
  }

  private buildWorkerCapabilities(): WorkerCapabilities {
    // Get available services from environment - match Python env var patterns
    const servicesEnv =
      process.env.WORKER_CONNECTORS || process.env.SERVICES || process.env.CONNECTORS || '';
    const services = servicesEnv
      .split(',')
      .map(s => s.trim())
      .filter(s => s);

    // Hardware specifications
    const hardware: HardwareSpecs = {
      gpu_memory_gb: parseInt(process.env.GPU_MEMORY_GB || '0'),
      gpu_model: process.env.GPU_MODEL || 'unknown',
      ram_gb: Math.round(os.totalmem() / (1024 * 1024 * 1024)),
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

  private setupMessageHandlers(): void {
    this.workerClient.onMessage(async (message: BaseMessage) => {
      try {
        await this.handleMessage(message);
      } catch (error) {
        logger.error(`Error handling message ${message.id}:`, error);
      }
    });

    this.workerClient.onDisconnected(() => {
      logger.warn('Lost connection to hub, attempting to reconnect...');
      this.status = WorkerStatus.OFFLINE;
    });

    this.workerClient.onReconnected(() => {
      logger.info('Reconnected to hub');
      this.status = WorkerStatus.IDLE;
      // Re-register capabilities after reconnection
      this.registerWithHub().catch(error => {
        logger.error('Failed to re-register after reconnection:', error);
      });
    });
  }

  async start(): Promise<void> {
    try {
      logger.info(`Starting worker ${this.workerId}...`);

      // Load and initialize connectors
      await this.connectorManager.loadConnectors();
      const connectors = this.connectorManager.getAllConnectors();

      logger.info(
        `Loaded ${connectors.length} connectors: ${connectors.map(c => c.connector_id).join(', ')}`
      );

      // Update capabilities with connector models
      await this.updateCapabilitiesFromConnectors();

      // Connect to hub
      await this.workerClient.connect();

      // Register with hub
      await this.registerWithHub();

      // Start job processing loop
      this.startJobProcessingLoop();

      // Start heartbeat
      this.startHeartbeat();

      // Start job timeout monitoring
      this.startJobTimeoutMonitoring();

      // Start dashboard if enabled
      if (process.env.WORKER_DASHBOARD_ENABLED !== 'false') {
        const dashboardPort = parseInt(process.env.WORKER_DASHBOARD_PORT || '0'); // 0 = auto-assign
        this.dashboard = new WorkerDashboard(this, dashboardPort);
        await this.dashboard.start();
        logger.info(
          `🎛️  Worker ${this.workerId} dashboard available at ${this.dashboard.getUrl()}`
        );
        logger.info(
          `📊 Dashboard accessible on host machine at http://localhost:${this.dashboard.getPort()}`
        );
      }

      this.running = true;
      this.status = WorkerStatus.IDLE;

      logger.info(`Worker ${this.workerId} started successfully`);
    } catch (error) {
      logger.error(`Failed to start worker ${this.workerId}:`, error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.running) return;

    logger.info(`Stopping worker ${this.workerId}...`);

    this.running = false;
    this.status = WorkerStatus.STOPPING;

    // Stop intervals
    if (this.jobProcessingInterval) {
      clearInterval(this.jobProcessingInterval);
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.jobTimeoutCheckInterval) {
      clearInterval(this.jobTimeoutCheckInterval);
    }

    // Clear job timeouts
    for (const timeout of this.jobTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.jobTimeouts.clear();

    // Cancel current jobs
    for (const [jobId, _job] of this.currentJobs) {
      try {
        await this.cancelJob(jobId);
        logger.info(`Cancelled job ${jobId} during shutdown`);
      } catch (error) {
        logger.error(`Failed to cancel job ${jobId}:`, error);
      }
    }

    // Stop dashboard
    if (this.dashboard) {
      await this.dashboard.stop();
    }

    // Cleanup connectors
    await this.connectorManager.cleanup();

    // Disconnect from hub
    await this.workerClient.disconnect();

    this.status = WorkerStatus.OFFLINE;
    logger.info(`Worker ${this.workerId} stopped`);
  }

  private async updateCapabilitiesFromConnectors(): Promise<void> {
    const connectors = this.connectorManager.getAllConnectors();
    const models: Record<string, string[]> = {};

    for (const connector of connectors) {
      try {
        const availableModels = await connector.getAvailableModels();
        models[connector.service_type] = availableModels;
        logger.info(`Connector ${connector.connector_id} has ${availableModels.length} models`);
      } catch (error) {
        logger.warn(`Failed to get models from connector ${connector.connector_id}:`, error);
        models[connector.service_type] = [];
      }
    }

    this.capabilities.models = models;
    this.capabilities.services = connectors.map(c => c.service_type);
  }

  private async registerWithHub(): Promise<void> {
    await this.workerClient.registerWorker(this.capabilities);
    logger.info(`Worker ${this.workerId} registered with hub`);
  }

  private startJobProcessingLoop(): void {
    this.jobProcessingInterval = setInterval(async () => {
      try {
        await this.processJobLoop();
      } catch (error) {
        logger.error('Error in job processing loop:', error);
      }
    }, this.pollIntervalMs);
  }

  private async processJobLoop(): Promise<void> {
    if (!this.running || this.status !== WorkerStatus.IDLE) {
      return;
    }

    // CRITICAL FIX: Check if we can take more jobs
    if (this.currentJobs.size >= this.maxConcurrentJobs) {
      return;
    }

    try {
      // Request a job from the hub
      const job = await this.workerClient.requestJob(this.capabilities);

      if (job) {
        logger.info(`Received job ${job.id} of type ${job.service_required}`);
        await this.processJob(job);
      }
    } catch (error) {
      logger.error('Error requesting job from hub:', error);
    }
  }

  private async processJob(job: Job): Promise<void> {
    const startTime = Date.now();

    try {
      // CRITICAL FIX: Check if job is already being processed
      if (this.currentJobs.has(job.id)) {
        logger.warn(`Job ${job.id} is already being processed by this worker, ignoring duplicate`);
        return;
      }

      // Update status
      this.currentJobs.set(job.id, job);
      this.jobStartTimes.set(job.id, startTime);

      // Set up job timeout
      this.setupJobTimeout(job.id);

      // Record job start in dashboard
      if (this.dashboard) {
        this.dashboard.recordJobStarted(job);
      }
      const newStatus =
        this.currentJobs.size >= this.maxConcurrentJobs ? WorkerStatus.BUSY : WorkerStatus.IDLE;
      const statusChanged = this.status !== newStatus;
      this.status = newStatus;

      // Notify hub that we're now processing this job
      if (statusChanged || this.status === WorkerStatus.BUSY) {
        this.notifyStatusChange().catch(error => {
          logger.error(`Failed to notify hub of job start status:`, error);
        });
      }

      // Find appropriate connector
      const connector = this.connectorManager.getConnectorByServiceType(job.service_required);
      if (!connector) {
        throw new Error(`No connector available for job type: ${job.service_required}`);
      }

      // Check if connector can process this job
      const canProcess = await connector.canProcessJob({
        id: job.id,
        type: job.service_required,
        payload: job.payload,
        requirements: job.requirements,
      });

      if (!canProcess) {
        throw new Error(`Connector ${connector.connector_id} cannot process job ${job.id}`);
      }

      logger.info(`Processing job ${job.id} with connector ${connector.connector_id}`);

      // Process the job
      const result = await connector.processJob(
        {
          id: job.id,
          type: job.service_required,
          payload: job.payload,
          requirements: job.requirements,
        },
        async (progress: JobProgress) => {
          // Progress callback
          await this.reportJobProgress(job.id, progress);
        }
      );

      // Job completed successfully
      await this.completeJob(job.id, result);
    } catch (error) {
      logger.error(`Failed to process job ${job.id}:`, error);
      await this.failJob(job.id, error instanceof Error ? error.message : 'Unknown error');
    } finally {
      // Clean up
      this.cleanupJob(job.id);
    }
  }

  private async reportJobProgress(jobId: string, progress: JobProgress): Promise<void> {
    try {
      await this.workerClient.reportProgress(jobId, progress);

      // Also update heartbeat when reporting progress to indicate worker is actively working
      await this.workerClient.sendHeartbeat(
        this.status as MessageWorkerStatus,
        this.getSystemInfo()
      );
    } catch (error) {
      logger.error(`Failed to report progress for job ${jobId}:`, error);
    }
  }

  private async completeJob(jobId: string, result: unknown): Promise<void> {
    try {
      await this.workerClient.completeJob(jobId, result);

      // Record job completion in dashboard
      if (this.dashboard) {
        const job = this.currentJobs.get(jobId);
        const startTime = this.jobStartTimes.get(jobId);
        if (job && startTime) {
          const duration = Date.now() - startTime;
          this.dashboard.recordJobCompleted(job, result, duration);
        }
      }

      logger.info(`Job ${jobId} completed successfully`);
    } catch (error) {
      logger.error(`Failed to complete job ${jobId}:`, error);
    }
  }

  private async failJob(jobId: string, error: string): Promise<void> {
    try {
      await this.workerClient.failJob(jobId, error, true); // Allow retry

      // Record job failure in dashboard
      if (this.dashboard) {
        const job = this.currentJobs.get(jobId);
        const startTime = this.jobStartTimes.get(jobId);
        if (job && startTime) {
          const duration = Date.now() - startTime;
          this.dashboard.recordJobFailed(job, error, duration);
        }
      }

      logger.info(`Job ${jobId} failed: ${error}`);
    } catch (err) {
      logger.error(`Failed to fail job ${jobId}:`, err);
    }
  }

  private async cancelJob(jobId: string): Promise<void> {
    const job = this.currentJobs.get(jobId);
    if (!job) return;

    try {
      const connector = this.connectorManager.getConnectorByServiceType(job.service_required);
      if (connector) {
        await connector.cancelJob(jobId);
      }

      // Record job cancellation in dashboard
      if (this.dashboard) {
        const startTime = this.jobStartTimes.get(jobId);
        if (startTime) {
          const duration = Date.now() - startTime;
          this.dashboard.recordJobCancelled(job, duration);
        }
      }

      this.currentJobs.delete(jobId);
      this.jobStartTimes.delete(jobId);
      logger.info(`Job ${jobId} cancelled`);
    } catch (error) {
      logger.error(`Failed to cancel job ${jobId}:`, error);
    }
  }

  private startHeartbeat(): void {
    // Match Python env var pattern: WORKER_HEARTBEAT_INTERVAL (in seconds)
    const heartbeatIntervalSec = parseInt(process.env.WORKER_HEARTBEAT_INTERVAL || '30');
    const heartbeatIntervalMs = heartbeatIntervalSec * 1000;

    this.heartbeatInterval = setInterval(async () => {
      try {
        const systemInfo = this.getSystemInfo();
        await this.workerClient.sendHeartbeat(this.status as MessageWorkerStatus, systemInfo);
      } catch (error) {
        logger.error('Failed to send heartbeat:', error);
      }
    }, heartbeatIntervalMs);
  }

  private startJobTimeoutMonitoring(): void {
    // Check for timed-out jobs every 30 seconds
    this.jobTimeoutCheckInterval = setInterval(async () => {
      try {
        await this.checkJobTimeouts();
      } catch (error) {
        logger.error('Error checking job timeouts:', error);
      }
    }, 30000);
  }

  private setupJobTimeout(jobId: string): void {
    const timeoutMs = this.jobTimeoutMinutes * 60 * 1000;

    const timeout = setTimeout(async () => {
      logger.warn(`Job ${jobId} timed out after ${this.jobTimeoutMinutes} minutes`);
      await this.handleJobTimeout(jobId);
    }, timeoutMs);

    this.jobTimeouts.set(jobId, timeout);
  }

  private async checkJobTimeouts(): Promise<void> {
    const now = Date.now();
    const timeoutMs = this.jobTimeoutMinutes * 60 * 1000;

    for (const [jobId, startTime] of this.jobStartTimes) {
      if (now - startTime > timeoutMs) {
        logger.warn(`Job ${jobId} exceeded timeout of ${this.jobTimeoutMinutes} minutes`);
        await this.handleJobTimeout(jobId);
      }
    }
  }

  private async handleJobTimeout(jobId: string): Promise<void> {
    const job = this.currentJobs.get(jobId);
    if (!job) return;

    try {
      // Cancel the job in the connector
      const connector = this.connectorManager.getConnectorByServiceType(job.service_required);
      if (connector) {
        await connector.cancelJob(jobId);
      }

      // Release the job back to queue for retry
      await this.workerClient.releaseJob(jobId, 'Job timeout');

      // Record timeout in dashboard
      if (this.dashboard) {
        const startTime = this.jobStartTimes.get(jobId);
        if (startTime) {
          const duration = Date.now() - startTime;
          this.dashboard.recordJobFailed(job, 'Job timeout', duration);
        }
      }

      logger.warn(`Job ${jobId} timed out and released back to queue`);
    } catch (error) {
      logger.error(`Failed to handle timeout for job ${jobId}:`, error);
    } finally {
      this.cleanupJob(jobId);
    }
  }

  private cleanupJob(jobId: string): void {
    // Remove from tracking maps
    this.currentJobs.delete(jobId);
    this.jobStartTimes.delete(jobId);

    // Clear timeout
    const timeout = this.jobTimeouts.get(jobId);
    if (timeout) {
      clearTimeout(timeout);
      this.jobTimeouts.delete(jobId);
    }

    // Update worker status
    const newStatus = this.currentJobs.size > 0 ? WorkerStatus.BUSY : WorkerStatus.IDLE;
    const statusChanged = this.status !== newStatus;
    this.status = newStatus;

    // Notify hub of status change if worker went from busy to idle
    if (statusChanged && this.status === WorkerStatus.IDLE) {
      this.notifyStatusChange().catch(error => {
        logger.error(`Failed to notify hub of status change to idle:`, error);
      });
    }
  }

  private async notifyStatusChange(): Promise<void> {
    try {
      // Send status update to hub via WorkerClient
      const currentJobIds = Array.from(this.currentJobs.keys());
      await this.workerClient.sendStatusUpdate(this.status as MessageWorkerStatus, currentJobIds);
      logger.debug(`Worker ${this.workerId} notified hub of status change to ${this.status}`);
    } catch (error) {
      logger.error(`Failed to notify hub of status change:`, error);
      throw error;
    }
  }

  private getSystemInfo(): MessageSystemInfo {
    const _memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    return {
      cpu_usage: 0, // TODO: Implement CPU usage calculation
      memory_usage: (usedMem / totalMem) * 100,
      gpu_usage: undefined, // Optional field
      gpu_memory_usage: undefined, // Optional field
      disk_usage: 0, // TODO: Implement disk usage calculation
      uptime: process.uptime(),
    } as MessageSystemInfo;
  }

  private async handleMessage(message: BaseMessage): Promise<void> {
    switch (message.type) {
      case MessageType.JOB_ASSIGNED:
        await this.handleJobAssigned(message as JobAssignedMessage);
        break;
      case MessageType.CANCEL_JOB:
        if ('job_id' in message && typeof message.job_id === 'string') {
          await this.handleJobCancelled(message as BaseMessage & { job_id: string });
        }
        break;
      default:
        logger.debug(`Received unhandled message type: ${message.type}`);
    }
  }

  private async handleJobAssigned(message: JobAssignedMessage): Promise<void> {
    const job = message.job_data as unknown as Job;
    logger.info(`Assigned job ${job.id} via WebSocket`);
    await this.processJob(job);
  }

  private async handleJobCancelled(message: BaseMessage & { job_id: string }): Promise<void> {
    const jobId = message.job_id;
    logger.info(`Received cancellation for job ${jobId}`);
    await this.cancelJob(jobId);
  }

  // Public getters and health checks
  isHealthy(): boolean {
    return this.running && this.workerClient.isConnected() && this.status !== WorkerStatus.ERROR;
  }

  isRunning(): boolean {
    return this.running;
  }

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
    return { ...this.capabilities };
  }

  getConnectedServices(): string[] {
    return this.connectorManager.getAllConnectors().map(c => c.service_type);
  }

  getConnectorHealth(): Record<string, boolean> {
    const health: Record<string, boolean> = {};
    for (const connector of this.connectorManager.getAllConnectors()) {
      try {
        // This would need to be async in real implementation
        health[connector.connector_id] = true;
      } catch {
        health[connector.connector_id] = false;
      }
    }
    return health;
  }

  getConnectorManager(): ConnectorManager {
    return this.connectorManager;
  }
}
