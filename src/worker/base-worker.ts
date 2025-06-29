// Base Worker Implementation - direct port from Python worker/base_worker.py
// Core worker logic with job processing loop and connector management

import { ConnectorManager } from './connector-manager.js';
import { WorkerClient } from './worker-client.js';
import { ConnectorInterface } from '../core/types/connector.js';
import { 
  WorkerCapabilities, 
  WorkerStatus, 
  SystemInfo, 
  HardwareSpecs, 
  CustomerAccessConfig,
  PerformanceConfig 
} from '../core/types/worker.js';
import { Job, JobStatus, JobProgress } from '../core/types/job.js';
import { BaseMessage, MessageType, JobAssignedMessage } from '../core/types/messages.js';
import { logger } from '../core/utils/logger.js';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

export class BaseWorker {
  private workerId: string;
  private connectorManager: ConnectorManager;
  private workerClient: WorkerClient;
  private capabilities: WorkerCapabilities;
  private status: WorkerStatus = WorkerStatus.INITIALIZING;
  private currentJobs = new Map<string, Job>();
  private isRunning = false;
  private jobProcessingInterval?: NodeJS.Timeout;
  private heartbeatInterval?: NodeJS.Timeout;
  private pollIntervalMs: number;
  private maxConcurrentJobs: number;

  constructor(
    workerId: string,
    connectorManager: ConnectorManager,
    workerClient: WorkerClient
  ) {
    this.workerId = workerId;
    this.connectorManager = connectorManager;
    this.workerClient = workerClient;
    
    // Configuration from environment - match Python patterns
    this.pollIntervalMs = parseInt(process.env.WORKER_POLL_INTERVAL_MS || '5000');
    this.maxConcurrentJobs = parseInt(process.env.WORKER_MAX_CONCURRENT_JOBS || '1');
    
    // Initialize capabilities from environment and system info
    this.capabilities = this.buildWorkerCapabilities();
    
    // Set up message handlers
    this.setupMessageHandlers();
  }

  private buildWorkerCapabilities(): WorkerCapabilities {
    // Get available services from environment - match Python env var patterns
    const servicesEnv = process.env.WORKER_CONNECTORS || process.env.SERVICES || process.env.CONNECTORS || '';
    const services = servicesEnv.split(',').map(s => s.trim()).filter(s => s);
    
    // Hardware specifications
    const hardware: HardwareSpecs = {
      gpu_count: parseInt(process.env.GPU_COUNT || '0'),
      gpu_memory_gb: parseInt(process.env.GPU_MEMORY_GB || '0'),
      gpu_model: process.env.GPU_MODEL || 'unknown',
      cpu_cores: os.cpus().length,
      cpu_threads: os.cpus().length * 2, // Estimate
      ram_gb: Math.round(os.totalmem() / (1024 * 1024 * 1024))
    };

    // Customer access configuration
    const customerAccess: CustomerAccessConfig = {
      isolation: (process.env.CUSTOMER_ISOLATION as any) || 'loose',
      allowed_customers: process.env.ALLOWED_CUSTOMERS?.split(',').map(s => s.trim()),
      denied_customers: process.env.DENIED_CUSTOMERS?.split(',').map(s => s.trim()),
      max_concurrent_customers: parseInt(process.env.MAX_CONCURRENT_CUSTOMERS || '10')
    };

    // Performance configuration
    const performance: PerformanceConfig = {
      concurrent_jobs: this.maxConcurrentJobs,
      quality_levels: (process.env.QUALITY_LEVELS || 'fast,balanced,quality').split(',').map(s => s.trim()),
      max_processing_time_minutes: parseInt(process.env.MAX_PROCESSING_TIME_MINUTES || '60')
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
        arch: os.arch()
      }
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
      
      logger.info(`Loaded ${connectors.length} connectors: ${connectors.map(c => c.connector_id).join(', ')}`);
      
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
      
      this.isRunning = true;
      this.status = WorkerStatus.IDLE;
      
      logger.info(`Worker ${this.workerId} started successfully`);
      
    } catch (error) {
      logger.error(`Failed to start worker ${this.workerId}:`, error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    logger.info(`Stopping worker ${this.workerId}...`);
    
    this.isRunning = false;
    this.status = WorkerStatus.STOPPING;
    
    // Stop intervals
    if (this.jobProcessingInterval) {
      clearInterval(this.jobProcessingInterval);
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    // Cancel current jobs
    for (const [jobId, job] of this.currentJobs) {
      try {
        await this.cancelJob(jobId);
        logger.info(`Cancelled job ${jobId} during shutdown`);
      } catch (error) {
        logger.error(`Failed to cancel job ${jobId}:`, error);
      }
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
    if (!this.isRunning || this.status !== WorkerStatus.IDLE) {
      return;
    }
    
    // Check if we can take more jobs
    if (this.currentJobs.size >= this.maxConcurrentJobs) {
      return;
    }
    
    try {
      // Request a job from the hub
      const job = await this.workerClient.requestJob(this.capabilities);
      
      if (job) {
        logger.info(`Received job ${job.id} of type ${job.type}`);
        await this.processJob(job);
      }
      
    } catch (error) {
      logger.error('Error requesting job from hub:', error);
    }
  }

  private async processJob(job: Job): Promise<void> {
    try {
      // Update status
      this.currentJobs.set(job.id, job);
      this.status = this.currentJobs.size >= this.maxConcurrentJobs ? WorkerStatus.BUSY : WorkerStatus.IDLE;
      
      // Find appropriate connector
      const connector = this.connectorManager.getConnectorByServiceType(job.type);
      if (!connector) {
        throw new Error(`No connector available for job type: ${job.type}`);
      }
      
      // Check if connector can process this job
      const canProcess = await connector.canProcessJob({
        id: job.id,
        type: job.type,
        payload: job.payload,
        requirements: job.requirements
      });
      
      if (!canProcess) {
        throw new Error(`Connector ${connector.connector_id} cannot process job ${job.id}`);
      }
      
      logger.info(`Processing job ${job.id} with connector ${connector.connector_id}`);
      
      // Process the job
      const result = await connector.processJob(
        {
          id: job.id,
          type: job.type,
          payload: job.payload,
          requirements: job.requirements
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
      this.currentJobs.delete(job.id);
      this.status = this.currentJobs.size > 0 ? WorkerStatus.BUSY : WorkerStatus.IDLE;
    }
  }

  private async reportJobProgress(jobId: string, progress: JobProgress): Promise<void> {
    try {
      await this.workerClient.reportProgress(jobId, progress);
    } catch (error) {
      logger.error(`Failed to report progress for job ${jobId}:`, error);
    }
  }

  private async completeJob(jobId: string, result: any): Promise<void> {
    try {
      await this.workerClient.completeJob(jobId, result);
      logger.info(`Job ${jobId} completed successfully`);
    } catch (error) {
      logger.error(`Failed to complete job ${jobId}:`, error);
    }
  }

  private async failJob(jobId: string, error: string): Promise<void> {
    try {
      await this.workerClient.failJob(jobId, error, true); // Allow retry
      logger.info(`Job ${jobId} failed: ${error}`);
    } catch (err) {
      logger.error(`Failed to fail job ${jobId}:`, err);
    }
  }

  private async cancelJob(jobId: string): Promise<void> {
    const job = this.currentJobs.get(jobId);
    if (!job) return;
    
    try {
      const connector = this.connectorManager.getConnectorByServiceType(job.type);
      if (connector) {
        await connector.cancelJob(jobId);
      }
      
      this.currentJobs.delete(jobId);
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
        await this.workerClient.sendHeartbeat(this.status, systemInfo);
      } catch (error) {
        logger.error('Failed to send heartbeat:', error);
      }
    }, heartbeatIntervalMs);
  }

  private getSystemInfo(): SystemInfo {
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    return {
      cpu_usage: 0, // TODO: Implement CPU usage calculation
      memory_usage: (usedMem / totalMem) * 100,
      memory_total_gb: Math.round(totalMem / (1024 * 1024 * 1024)),
      memory_available_gb: Math.round(freeMem / (1024 * 1024 * 1024)),
      disk_usage: 0, // TODO: Implement disk usage calculation
      disk_total_gb: 0,
      disk_available_gb: 0,
      uptime_seconds: process.uptime(),
      load_average: os.loadavg()
    };
  }

  private async handleMessage(message: BaseMessage): Promise<void> {
    switch (message.type) {
      case MessageType.JOB_ASSIGNED:
        await this.handleJobAssigned(message as JobAssignedMessage);
        break;
      case MessageType.JOB_CANCELLED:
        await this.handleJobCancelled(message as any);
        break;
      default:
        logger.debug(`Received unhandled message type: ${message.type}`);
    }
  }

  private async handleJobAssigned(message: JobAssignedMessage): Promise<void> {
    const job = message.job_data as any as Job;
    logger.info(`Assigned job ${job.id} via WebSocket`);
    await this.processJob(job);
  }

  private async handleJobCancelled(message: any): Promise<void> {
    const jobId = message.job_id;
    logger.info(`Received cancellation for job ${jobId}`);
    await this.cancelJob(jobId);
  }

  // Public getters and health checks
  isHealthy(): boolean {
    return this.isRunning && 
           this.workerClient.isConnected() &&
           this.status !== WorkerStatus.ERROR;
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
}