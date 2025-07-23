// BaseConnector - Shared functionality for all service connectors
// Provides Redis connection, status reporting, and common lifecycle management

import {
  ConnectorInterface,
  ConnectorConfig,
  ServiceInfo,
  JobData,
  JobResult,
  ProgressCallback,
  logger,
} from '@emp/core';
import Redis from 'ioredis';

export type ConnectorStatus =
  | 'starting'
  | 'waiting_for_service'
  | 'connecting'
  | 'idle'
  | 'active'
  | 'error'
  | 'offline';

export interface StatusReport {
  connector_id: string;
  service_type: string;
  worker_id: string;
  status: ConnectorStatus;
  service_info: ServiceInfo;
  timestamp: string;
  last_health_check: number;
  status_changed: boolean;
  previous_status?: ConnectorStatus;
  error_message?: string;
  jobs_processed?: number;
  uptime_seconds?: number;
}

export abstract class BaseConnector implements ConnectorInterface {
  // Required interface properties
  public connector_id: string = '';
  public service_type: string = '';
  public version: string = '';

  // Redis connection for status reporting
  protected redis?: Redis;
  protected workerId?: string;
  protected machineId?: string;
  protected hubRedisUrl?: string;
  protected parentWorker?: any; // Reference to parent worker for immediate updates

  // Status tracking
  protected currentStatus: ConnectorStatus = 'starting';
  protected lastReportedStatus?: ConnectorStatus;
  protected statusReportingInterval?: NodeJS.Timeout;
  protected startTime: number = Date.now();
  protected jobsProcessed: number = 0;

  // Configuration
  protected config: ConnectorConfig;

  constructor(connectorId: string, config?: Partial<ConnectorConfig>) {
    this.connector_id = connectorId;

    // Build default configuration
    this.config = {
      connector_id: this.connector_id,
      service_type: this.service_type,
      base_url: process.env.SERVICE_BASE_URL || 'http://localhost',
      timeout_seconds: parseInt(process.env.SERVICE_TIMEOUT_SECONDS || '60'),
      retry_attempts: parseInt(process.env.SERVICE_RETRY_ATTEMPTS || '3'),
      retry_delay_seconds: parseInt(process.env.SERVICE_RETRY_DELAY_SECONDS || '1'),
      health_check_interval_seconds: parseInt(process.env.SERVICE_HEALTH_CHECK_INTERVAL || '30'),
      max_concurrent_jobs: parseInt(process.env.SERVICE_MAX_CONCURRENT_JOBS || '5'),
      ...config,
    };
  }

  // ============================================================================
  // Redis Connection and Status Reporting (Core BaseConnector functionality)
  // ============================================================================

  /**
   * Inject Redis connection from worker for status reporting
   * This replaces the need for connectors to create their own Redis connections
   */
  setRedisConnection(redis: Redis, workerId: string, machineId?: string): void {
    this.redis = redis;
    this.workerId = workerId;
    this.machineId = machineId;

    logger.info(
      `${this.service_type} connector ${this.connector_id} received Redis connection injection`
    );
  }

  /**
   * Set reference to parent worker for immediate status updates
   */
  setParentWorker(worker: any): void {
    this.parentWorker = worker;
  }

  protected async initializeRedisConnection(): Promise<void> {
    this.hubRedisUrl = process.env.HUB_REDIS_URL || 'redis://localhost:6379';
    const workerIdPrefix = process.env.WORKER_ID || 'worker';
    this.workerId = `${workerIdPrefix}-${process.pid}`;

    try {
      this.redis = new Redis(this.hubRedisUrl, {
        enableReadyCheck: true,
        maxRetriesPerRequest: 10,
        lazyConnect: false,
        connectTimeout: 10000,
        commandTimeout: 5000,
      });

      logger.info(
        `${this.service_type} connector ${this.connector_id} connected to Redis for status reporting`
      );
    } catch (error) {
      logger.warn(
        `Failed to connect to Redis for connector ${this.connector_id} status reporting:`,
        error
      );
      throw error;
    }
  }

  protected async cleanupRedisConnection(): Promise<void> {
    this.stopStatusReportingInternal();

    if (this.redis) {
      try {
        // Report offline status before disconnecting
        await this.reportStatus('offline');
        await this.redis.quit();
        this.redis = undefined;
        logger.info(`${this.service_type} connector ${this.connector_id} disconnected from Redis`);
      } catch (error) {
        logger.warn(`Error disconnecting Redis for connector ${this.connector_id}:`, error);
      }
    }
  }

  protected startStatusReportingInternal(): void {
    if (!this.redis) {
      logger.warn(`Cannot start status reporting for ${this.connector_id} - no Redis connection`);
      return;
    }

    // Send initial status immediately
    this.reportStatus(this.currentStatus);

    logger.info(
      `${this.service_type} connector ${this.connector_id} started event-driven status reporting`
    );
  }

  protected stopStatusReportingInternal(): void {
    if (this.statusReportingInterval) {
      clearInterval(this.statusReportingInterval);
      this.statusReportingInterval = undefined;
    }
  }

  protected async reportStatus(status?: ConnectorStatus, errorMessage?: string): Promise<void> {
    if (!this.redis || !this.workerId) {
      return;
    }

    try {
      const newStatus = status || this.currentStatus;

      // Only report if status actually changed or this is an error
      if (this.lastReportedStatus === newStatus && !errorMessage) {
        logger.debug(
          `${this.service_type} connector ${this.connector_id} status unchanged (${newStatus}), skipping report`
        );
        return;
      }

      const serviceInfo = await this.getServiceInfo();
      const now = new Date().toISOString();

      const statusReport: StatusReport = {
        connector_id: this.connector_id,
        service_type: this.service_type,
        worker_id: this.workerId,
        status: newStatus,
        service_info: serviceInfo,
        timestamp: now,
        last_health_check: Date.now(),
        status_changed: this.lastReportedStatus !== undefined,
        previous_status: this.lastReportedStatus,
        error_message: errorMessage,
        jobs_processed: this.jobsProcessed,
        uptime_seconds: Math.floor((Date.now() - this.startTime) / 1000),
      };

      // Publish to Redis channel for real-time updates
      await this.redis.publish(
        `connector_status:${this.service_type}`,
        JSON.stringify(statusReport)
      );

      // Store in Redis hash for persistence and service-centric indexing
      await this.redis.hset(`connector_status:${this.workerId}:${this.service_type}`, {
        status: statusReport.status,
        last_update: statusReport.timestamp,
        service_info: JSON.stringify(statusReport.service_info),
        error_message: statusReport.error_message || '',
        jobs_processed: statusReport.jobs_processed?.toString() || '0',
        uptime_seconds: statusReport.uptime_seconds?.toString() || '0',
      });

      // Service-centric indexing for fleet visibility
      await this.redis.hset(`service_index:${this.service_type}`, {
        [`${this.workerId}:${this.connector_id}`]: JSON.stringify({
          worker_id: this.workerId,
          connector_id: this.connector_id,
          status: statusReport.status,
          last_update: statusReport.timestamp,
        }),
      });

      // Update last reported status
      const previousStatus = this.lastReportedStatus;
      this.lastReportedStatus = newStatus;
      this.currentStatus = newStatus;

      logger.info(
        `${this.service_type} connector ${this.connector_id} reported ${
          previousStatus ? 'changed' : 'initial'
        } status: ${statusReport.status}${errorMessage ? ` (${errorMessage})` : ''}`
      );
    } catch (error) {
      logger.error(`Failed to report status for connector ${this.connector_id}:`, error);
    }
  }

  /**
   * Manually trigger a status check and report (for event-driven updates)
   */
  async checkAndReportStatus(): Promise<void> {
    try {
      const isHealthy = await this.checkHealth();
      const newStatus: ConnectorStatus = isHealthy ? 'idle' : 'error';
      await this.reportStatus(newStatus);
    } catch (error) {
      await this.reportStatus(
        'error',
        error instanceof Error ? error.message : 'Health check failed'
      );
    }
  }

  // Public interface methods (required by ConnectorInterface)
  startStatusReporting(): void {
    // Wrapper for protected method - already called in initialize()
    // This is here to satisfy the ConnectorInterface
    this.startStatusReportingInternal();
  }

  stopStatusReporting(): void {
    // Wrapper for protected method - already called in cleanup()
    // This is here to satisfy the ConnectorInterface
    this.stopStatusReportingInternal();
  }

  /**
   * Set connector status externally (for job-based status updates)
   * This allows the worker to update connector status when jobs start/complete
   */
  async setStatus(status: ConnectorStatus, errorMessage?: string): Promise<void> {
    if (this.currentStatus !== status) {
      this.currentStatus = status;
      await this.reportStatus(status, errorMessage);
      logger.debug(`${this.service_type} connector ${this.connector_id} status set to: ${status}`);

      // Trigger immediate parent worker status update for real-time monitoring
      if (this.parentWorker && typeof this.parentWorker.forceConnectorStatusUpdate === 'function') {
        try {
          await this.parentWorker.forceConnectorStatusUpdate();
        } catch (error) {
          logger.warn(`Failed to trigger parent worker status update:`, error);
        }
      }
    }
  }

  /**
   * Report status change due to job processing
   */
  protected async reportJobStatusChange(isProcessing: boolean): Promise<void> {
    if (isProcessing) {
      await this.reportStatus('active');
    } else {
      this.jobsProcessed++;
      await this.reportStatus('idle');
    }
  }

  // ============================================================================
  // ConnectorInterface Implementation (Abstract methods for subclasses)
  // ============================================================================

  async initialize(): Promise<void> {
    logger.info(`Initializing ${this.service_type} connector ${this.connector_id}`);

    try {
      this.currentStatus = 'starting';

      // If Redis connection was injected, use it; otherwise create own connection
      if (!this.redis) {
        logger.warn(
          `${this.service_type} connector ${this.connector_id} - No Redis connection injected, creating own connection`
        );
        await this.initializeRedisConnection();
      }

      // Call subclass initialization
      await this.initializeService();

      // Start status reporting (only if we have Redis connection)
      if (this.redis) {
        this.startStatusReportingInternal();
      } else {
        logger.warn(
          `${this.service_type} connector ${this.connector_id} - No Redis connection, status reporting disabled`
        );
      }

      // Update status to idle after successful initialization
      this.currentStatus = 'idle';
      await this.reportStatus('idle');

      logger.info(`${this.service_type} connector ${this.connector_id} initialized successfully`);
    } catch (error) {
      this.currentStatus = 'error';
      await this.reportStatus(
        'error',
        error instanceof Error ? error.message : 'Initialization failed'
      );

      // Don't throw error - according to plan, register connector even if service is offline
      logger.warn(
        `${this.service_type} connector ${this.connector_id} initialization failed but connector will be registered:`,
        error
      );
    }
  }

  async cleanup(): Promise<void> {
    logger.info(`Cleaning up ${this.service_type} connector ${this.connector_id}`);

    try {
      // Call subclass cleanup first
      await this.cleanupService();
    } catch (error) {
      logger.warn(`Error in service cleanup for ${this.connector_id}:`, error);
    }

    // Clean up Redis connection (reports offline status)
    await this.cleanupRedisConnection();
  }

  async processJob(jobData: JobData, progressCallback: ProgressCallback): Promise<JobResult> {
    const startTime = Date.now();

    try {
      // Report that we're starting to process a job
      await this.reportJobStatusChange(true);

      // Call subclass job processing
      const result = await this.processJobImpl(jobData, progressCallback);

      // Report that we're done processing
      await this.reportJobStatusChange(false);

      return result;
    } catch (error) {
      // Report error and return to idle
      await this.reportStatus(
        'error',
        error instanceof Error ? error.message : 'Job processing failed'
      );
      await this.reportJobStatusChange(false);

      // Return failed result
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown job processing error',
        processing_time_ms: Date.now() - startTime,
        service_metadata: {
          service_version: this.version,
        },
      };
    }
  }

  // ============================================================================
  // Abstract methods that subclasses must implement
  // ============================================================================

  protected abstract initializeService(): Promise<void>;
  protected abstract cleanupService(): Promise<void>;
  protected abstract processJobImpl(
    jobData: JobData,
    progressCallback: ProgressCallback
  ): Promise<JobResult>;

  // Required by ConnectorInterface - subclasses must implement
  abstract checkHealth(): Promise<boolean>;
  abstract getAvailableModels(): Promise<string[]>;
  abstract getServiceInfo(): Promise<ServiceInfo>;
  abstract canProcessJob(jobData: JobData): Promise<boolean>;
  abstract cancelJob(jobId: string): Promise<void>;
  abstract updateConfiguration(config: ConnectorConfig): Promise<void>;
  abstract getConfiguration(): ConnectorConfig;
}
