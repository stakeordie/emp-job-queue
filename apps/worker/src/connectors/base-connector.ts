// BaseConnector - Shared functionality for all service connectors
// Provides Redis connection, status reporting, and common lifecycle management

import {
  ConnectorInterface,
  ConnectorConfig,
  ServiceInfo,
  JobData,
  JobResult,
  ProgressCallback,
  HealthCheckCapabilities,
  ServiceJobStatus,
  ServiceSupportValidation,
  HealthCheckClass,
  HealthCheckRequirements,
  logger,
  ConnectorLogger,
} from '@emp/core';

// TODO: TELEMETRY REMOVED - Will add @emp/telemetry for connector lifecycle events
import Redis from 'ioredis';

// Re-export types for convenience
export type { HealthCheckCapabilities, ServiceJobStatus, ConnectorConfig } from '@emp/core';

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
  /**
   * Get required environment variables for this connector
   * Override in subclasses to specify connector-specific env vars
   */
  static getRequiredEnvVars(): Record<string, string> {
    return {
      // Common environment variables needed by all workers
      UNIFIED_MACHINE_STATUS: '${UNIFIED_MACHINE_STATUS:-false}',
      HUB_REDIS_URL: '${HUB_REDIS_URL}',
      MACHINE_ID: '${MACHINE_ID:-unknown}',
      WORKER_ID: '${WORKER_ID}',
    };
  }
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
  
  // Structured logging
  protected connectorLogger: ConnectorLogger;

  // Configuration
  protected config: ConnectorConfig;

  // TODO: TELEMETRY REMOVED - Will add @emp/telemetry client here

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

    // Initialize structured logging
    this.connectorLogger = new ConnectorLogger({
      machineId: process.env.MACHINE_ID || 'unknown',
      workerId: process.env.WORKER_ID || 'unknown',
      serviceType: this.service_type,
      connectorId: this.connector_id,
    });
  }

  // ============================================================================
  // Redis Connection and Status Reporting (Core BaseConnector functionality)
  // ============================================================================

  /**
   * Inject Redis connection from worker for status reporting
   * This replaces the need for connectors to create their own Redis connections
   */
  setRedisConnection(redis: Redis, workerId: string, machineId?: string): void {
    console.log(`🔴 [BASE-CONNECTOR-DEBUG] setRedisConnection() called with workerId: "${workerId}"`);
    this.redis = redis;
    this.workerId = workerId;
    this.machineId = machineId;
    console.log(`🔴 [BASE-CONNECTOR-DEBUG] this.workerId set to: "${this.workerId}"`);

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
    this.hubRedisUrl = process.env.HUB_REDIS_URL;
    if (!this.hubRedisUrl) {
      const errorMsg = `
❌ FATAL ERROR: HUB_REDIS_URL environment variable is not set!

The connector requires a Redis connection to function. Please set the HUB_REDIS_URL environment variable.

Examples:
  - Local development: HUB_REDIS_URL=redis://localhost:6379
  - Docker container:  HUB_REDIS_URL=redis://host.docker.internal:6379
  - Production:        HUB_REDIS_URL=redis://user:pass@your-redis-host:6379

Current environment variables containing HUB or REDIS:
${Object.keys(process.env).filter(k => k.includes('HUB') || k.includes('REDIS')).map(k => `  - ${k}=${process.env[k]}`).join('\n') || '  (none found)'}
`;
      console.error(errorMsg);
      logger.error(errorMsg);
      throw new Error('HUB_REDIS_URL environment variable is required');
    }
    
    console.log(`🔴 [BASE-CONNECTOR-DEBUG] initializeRedisConnection() - this.workerId BEFORE: "${this.workerId}"`);
    console.log(`🔴 [BASE-CONNECTOR-DEBUG] process.env.WORKER_ID: "${process.env.WORKER_ID}"`);
    
    // Only set workerId if it hasn't been injected via setRedisConnection()
    if (!this.workerId) {
      const workerIdPrefix = process.env.WORKER_ID || 'worker';
      this.workerId = `${workerIdPrefix}-${process.pid}`;
      console.log(`🔴 [BASE-CONNECTOR-DEBUG] Generated fallback workerId: "${this.workerId}"`);
    } else {
      console.log(`🔴 [BASE-CONNECTOR-DEBUG] Using injected workerId: "${this.workerId}"`);
    }
    
    console.log(`🔴 [BASE-CONNECTOR-DEBUG] Final this.workerId: "${this.workerId}"`);
    

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

      // TODO: TELEMETRY REMOVED - Rebuild with @emp/telemetry
      // Was: connector.status_changed event with connectorId, serviceType, workerId, machineId, previousStatus, newStatus, errorMessage, jobsProcessed, uptime, timestamp

      logger.info(
        `${this.service_type} connector ${this.connector_id} reported ${
          previousStatus ? 'changed' : 'initial'
        } status: ${statusReport.status}${errorMessage ? ` (${errorMessage})` : ''}`
      );
    } catch (error) {
      const sanitizedError = {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : 'UnknownError',
      };
      logger.error(`Failed to report status for connector ${this.connector_id}:`, sanitizedError);
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

      // Validate service support before proceeding
      const validation = await this.validateServiceSupport();

      if (validation.recommendedAction === 'fail') {
        const errorMsg = `Service validation failed for ${this.service_type} connector ${this.connector_id}: ${validation.errors.join(', ')}`;
        logger.error(errorMsg);
        this.currentStatus = 'error';
        await this.reportStatus('error', errorMsg);
        throw new Error(errorMsg);
      }

      if (validation.recommendedAction === 'warn') {
        logger.warn(
          `${this.service_type} connector ${this.connector_id} has limited capabilities: ${validation.warnings.join(', ')}`
        );
      }

      logger.info(
        `${this.service_type} connector ${this.connector_id} validation: ${validation.supportLevel} support level`
      );

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
    const jobLogger = this.connectorLogger.withJobContext(jobData.id || 'unknown');

    try {
      // TODO: TELEMETRY REMOVED - Rebuild with @emp/telemetry
      // Was: connector.job_received event with connectorId, serviceType, jobId, workerId, machineId, inputSize, model, timestamp

      // Log job received
      jobLogger.jobReceived({
        jobId: jobData.id || 'unknown',
        inputSize: JSON.stringify(jobData).length,
        model: (jobData.payload?.model as string) || 'unknown',
      });

      // Report that we're starting to process a job
      await this.reportJobStatusChange(true);

      // TODO: TELEMETRY REMOVED - Rebuild with @emp/telemetry
      // Was: connector.job_started event with connectorId, serviceType, jobId, workerId, machineId, timestamp

      jobLogger.jobStarted({ jobId: jobData.id || 'unknown' });

      // Call subclass job processing
      const result = await this.processJobImpl(jobData, progressCallback);

      // 🔧 BASE CONNECTOR ENHANCEMENT: Auto-populate image_url and mime_type from saved assets
      await this.populateAssetInfo(jobData, result);

      // Calculate processing time
      const duration = Date.now() - startTime;

      // TODO: TELEMETRY REMOVED - Rebuild with @emp/telemetry
      // Was: connector.job_completed event with connectorId, serviceType, jobId, workerId, machineId, duration, outputSize, success, timestamp

      // Log successful completion
      jobLogger.jobCompleted({
        jobId: jobData.id || 'unknown',
        duration,
        outputSize: JSON.stringify(result).length,
      });

      // Report that we're done processing
      await this.reportJobStatusChange(false);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Job processing failed';

      // TODO: TELEMETRY REMOVED - Rebuild with @emp/telemetry
      // Was: connector.job_failed event with connectorId, serviceType, jobId, workerId, machineId, duration, error, success, timestamp

      // Log job failure
      jobLogger.jobFailed({
        jobId: jobData.id || 'unknown',
        error: errorMessage,
        duration,
      });

      // Report error and return to idle
      await this.reportStatus('error', errorMessage);
      await this.reportJobStatusChange(false);

      // Return failed result
      return {
        success: false,
        error: errorMessage,
        processing_time_ms: Date.now() - startTime,
        service_metadata: {
          service_version: this.version,
        },
      };
    }
  }

  // ============================================================================
  // Asset Information Population (Base Connector Enhancement)
  // ============================================================================

  /**
   * Auto-populate image_url and mime_type from saved assets
   * Fixes .bin extension issues by using actual saved asset URLs
   */
  private async populateAssetInfo(jobData: JobData, result: JobResult): Promise<void> {
    const jobId = jobData.id || 'unknown';

    // Only process successful jobs
    if (!result.success) {
      logger.info(`🔧 .BIN FIX: Skipping asset population for failed job ${jobId}`);
      return;
    }

    try {
      // Log what we're analyzing
      logger.info(`\n🔧 ===== .BIN EXTENSION FIX ANALYSIS - JOB ${jobId} =====`);
      logger.info(`🔧 CONNECTOR: ${this.connector_id} (${this.service_type})`);

      // Check if this job used AssetSaver (has ctx.storage or ctx.filename)
      const ctx = (jobData as any).ctx || (jobData.payload as any)?.ctx;
      const hasCtx = !!ctx;
      const hasStorage = !!(ctx && ctx.storage);
      const hasFilename = !!(ctx && ctx.filename);

      logger.info(`🔧 CTX ANALYSIS: hasCtx=${hasCtx}, hasStorage=${hasStorage}, hasFilename=${hasFilename}`);
      if (ctx) {
        logger.info(`🔧 CTX DETAILS: ${JSON.stringify({
          prefix: ctx.prefix,
          filename: ctx.filename,
          bucket: ctx.storage?.bucket,
          cdnUrl: ctx.storage?.cdnUrl
        }, null, 2)}`);
      }

      if (!ctx || (!ctx.storage && !ctx.filename)) {
        logger.info(`🔧 SKIP REASON: Job ${jobId} doesn't use AssetSaver (no ctx.storage or ctx.filename)`);
        return;
      }

      // Log current result state BEFORE our fix
      const beforeImageUrl = (result.data as any)?.image_url;
      const beforeMimeType = (result.data as any)?.mime_type;
      const beforeOutputFiles = result.output_files;

      logger.info(`🔧 BEFORE FIX:`);
      logger.info(`🔧   - result.data.image_url: ${beforeImageUrl || 'NOT SET'}`);
      logger.info(`🔧   - result.data.mime_type: ${beforeMimeType || 'NOT SET'}`);
      logger.info(`🔧   - result.output_files: ${beforeOutputFiles ? `${beforeOutputFiles.length} files` : 'NOT SET'}`);
      if (beforeImageUrl && beforeImageUrl.includes('.bin')) {
        logger.info(`🔧   ❌ DETECTED .BIN EXTENSION ISSUE: ${beforeImageUrl}`);
      }

      // Look for saved asset information from the last progress metadata
      let savedAsset: { filePath?: string; fileName?: string; fileUrl?: string; mimeType?: string } | null = null;

      // Check if the result already has saved asset info in metadata
      if (result.metadata?.saved_asset) {
        savedAsset = result.metadata.saved_asset as any;
        logger.info(`🔧 FOUND SAVED ASSET IN METADATA: ${JSON.stringify(savedAsset, null, 2)}`);
      } else {
        logger.info(`🔧 NO SAVED ASSET FOUND IN result.metadata.saved_asset`);
      }

      // If we have saved asset info, populate the result
      if (savedAsset && savedAsset.fileUrl) {
        logger.info(`🔧 APPLYING FIX WITH SAVED ASSET:`);
        logger.info(`🔧   - fileUrl: ${savedAsset.fileUrl}`);
        logger.info(`🔧   - fileName: ${savedAsset.fileName}`);
        logger.info(`🔧   - mimeType: ${savedAsset.mimeType || 'will detect from extension'}`);

        // Populate output_files array
        if (!result.output_files) {
          result.output_files = [];
        }

        // Determine asset type and mime type
        const fileName = savedAsset.fileName || 'asset';
        const fileExtension = fileName.split('.').pop()?.toLowerCase() || '';
        let assetType: 'image' | 'video' | 'audio' | 'text' | 'binary' = 'binary';
        let mimeType = savedAsset.mimeType || 'application/octet-stream';

        logger.info(`🔧 EXTENSION ANALYSIS: fileName="${fileName}", extension="${fileExtension}"`);

        // Determine type from extension if mime type not available
        if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(fileExtension)) {
          assetType = 'image';
          if (!savedAsset.mimeType) {
            mimeType = fileExtension === 'jpg' ? 'image/jpeg' : `image/${fileExtension}`;
          }
        } else if (['mp4', 'webm', 'avi'].includes(fileExtension)) {
          assetType = 'video';
          if (!savedAsset.mimeType) {
            mimeType = `video/${fileExtension}`;
          }
        } else if (['mp3', 'wav', 'ogg'].includes(fileExtension)) {
          assetType = 'audio';
          if (!savedAsset.mimeType) {
            mimeType = `audio/${fileExtension}`;
          }
        }

        logger.info(`🔧 FINAL TYPE DETECTION: assetType="${assetType}", mimeType="${mimeType}"`);

        // Add to output_files
        result.output_files.push({
          filename: fileName,
          path: savedAsset.filePath || '',
          type: assetType,
          size_bytes: 0, // Could be populated if available
          mime_type: mimeType,
          metadata: {
            cdn_url: savedAsset.fileUrl,
            original_filename: ctx.filename, // Preserve original (potentially .bin) filename
          }
        });

        // Populate data.image_url and mime_type for backward compatibility
        if (!result.data) {
          result.data = {};
        }

        (result.data as any).image_url = savedAsset.fileUrl;
        (result.data as any).mime_type = mimeType;
        (result.data as any).content_type = assetType;

        // Log final result AFTER our fix
        logger.info(`🔧 AFTER FIX:`);
        logger.info(`🔧   - result.data.image_url: ${(result.data as any).image_url}`);
        logger.info(`🔧   - result.data.mime_type: ${(result.data as any).mime_type}`);
        logger.info(`🔧   - result.data.content_type: ${(result.data as any).content_type}`);
        logger.info(`🔧   - result.output_files: ${result.output_files.length} files`);

        // Show the key transformation
        if (beforeImageUrl !== (result.data as any).image_url) {
          logger.info(`🔧   ✅ FIXED URL TRANSFORMATION:`);
          logger.info(`🔧     FROM: ${beforeImageUrl || 'NOT SET'}`);
          logger.info(`🔧     TO:   ${(result.data as any).image_url}`);
          if (beforeImageUrl?.includes('.bin')) {
            logger.info(`🔧     🎉 .BIN EXTENSION ISSUE RESOLVED!`);
          }
        }

        logger.info(`🔧 ===== .BIN EXTENSION FIX COMPLETE - JOB ${jobId} =====\n`);
      } else {
        logger.info(`🔧 NO FIX APPLIED: No saved asset with fileUrl found`);
        logger.info(`🔧 RESULT WILL USE ORIGINAL VALUES from connector`);
        logger.info(`🔧 ===== .BIN EXTENSION FIX SKIPPED - JOB ${jobId} =====\n`);
      }
    } catch (error) {
      // Don't fail the job if asset population fails
      logger.error(`🔧 .BIN FIX ERROR for job ${jobId}:`, error);
      logger.info(`🔧 ===== .BIN EXTENSION FIX FAILED - JOB ${jobId} =====\n`);
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

  // New failure recovery methods - subclasses should implement, but have defaults
  getHealthCheckCapabilities(): HealthCheckCapabilities {
    // Default minimal implementation for backwards compatibility
    return {
      supportsBasicHealthCheck: true,
      supportsJobStatusQuery: false,
      supportsJobCancellation: false,
      supportsServiceRestart: false,
      supportsQueueIntrospection: false,
    };
  }

  async queryJobStatus(serviceJobId: string): Promise<ServiceJobStatus> {
    // Default implementation for connectors that don't support job status query
    return {
      serviceJobId,
      status: 'unknown',
      canReconnect: false,
      canCancel: false,
      errorMessage: 'This connector does not support job status queries',
    };
  }

  // Service support validation - implemented in base class with subclass override capability
  async validateServiceSupport(): Promise<ServiceSupportValidation> {
    try {
      const capabilities = this.getHealthCheckCapabilities();
      const requiredClass = this.getRequiredHealthCheckClass();
      const requirements = this.getHealthCheckRequirements(requiredClass);

      const missingCapabilities: string[] = [];
      const warnings: string[] = [];
      const errors: string[] = [];

      // Check required capabilities against what the service supports
      if (requirements.required.basicHealthCheck && !capabilities.supportsBasicHealthCheck) {
        missingCapabilities.push('basicHealthCheck');
        errors.push(
          'Service does not support basic health checking - connector cannot verify service availability'
        );
      }

      if (requirements.required.jobStatusQuery && !capabilities.supportsJobStatusQuery) {
        missingCapabilities.push('jobStatusQuery');
        errors.push(
          'Service does not support job status querying - connector cannot implement failure recovery'
        );
      }

      if (requirements.required.jobCancellation && !capabilities.supportsJobCancellation) {
        missingCapabilities.push('jobCancellation');
        warnings.push(
          'Service does not support job cancellation - timeout handling will be limited'
        );
      }

      if (requirements.required.serviceRestart && !capabilities.supportsServiceRestart) {
        missingCapabilities.push('serviceRestart');
        warnings.push(
          'Service does not support restart - manual intervention required for service recovery'
        );
      }

      if (requirements.required.queueIntrospection && !capabilities.supportsQueueIntrospection) {
        missingCapabilities.push('queueIntrospection');
        warnings.push(
          'Service does not support queue introspection - load balancing will be limited'
        );
      }

      // Determine support level and recommended action
      let supportLevel: 'full' | 'partial' | 'minimal' | 'unsupported';
      let recommendedAction: 'proceed' | 'warn' | 'fail';

      if (errors.length > 0) {
        supportLevel = 'unsupported';
        recommendedAction = 'fail';
      } else if (missingCapabilities.length === 0) {
        supportLevel = 'full';
        recommendedAction = 'proceed';
      } else if (warnings.length > 0) {
        supportLevel = 'partial';
        recommendedAction = 'warn';
      } else {
        supportLevel = 'minimal';
        recommendedAction = 'proceed';
      }

      return {
        isSupported: supportLevel !== 'unsupported',
        supportLevel,
        missingCapabilities,
        warnings,
        errors,
        recommendedAction,
      };
    } catch (error) {
      return {
        isSupported: false,
        supportLevel: 'unsupported',
        missingCapabilities: ['validation_failed'],
        warnings: [],
        errors: [
          `Failed to validate service support: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ],
        recommendedAction: 'fail',
      };
    }
  }

  // Health check class determination - subclasses can override
  protected getRequiredHealthCheckClass(): HealthCheckClass {
    // Default to STANDARD for production use
    return HealthCheckClass.STANDARD;
  }

  // Health check requirements - based on class level
  protected getHealthCheckRequirements(
    healthCheckClass: HealthCheckClass
  ): HealthCheckRequirements {
    switch (healthCheckClass) {
      case HealthCheckClass.MINIMAL:
        return {
          class: HealthCheckClass.MINIMAL,
          required: {
            basicHealthCheck: true,
            jobStatusQuery: false,
            jobCancellation: false,
            serviceRestart: false,
            queueIntrospection: false,
          },
          description: 'Minimal health checking - service availability only',
          failureRecoveryCapable: false,
        };

      case HealthCheckClass.STANDARD:
        return {
          class: HealthCheckClass.STANDARD,
          required: {
            basicHealthCheck: true,
            jobStatusQuery: true,
            jobCancellation: false,
            serviceRestart: false,
            queueIntrospection: false,
          },
          description: 'Standard health checking - service availability + job status querying',
          failureRecoveryCapable: true,
        };

      case HealthCheckClass.ADVANCED:
        return {
          class: HealthCheckClass.ADVANCED,
          required: {
            basicHealthCheck: true,
            jobStatusQuery: true,
            jobCancellation: true,
            serviceRestart: true,
            queueIntrospection: true,
          },
          description: 'Advanced health checking - full failure recovery and service management',
          failureRecoveryCapable: true,
        };

      case HealthCheckClass.CUSTOM:
        // Subclasses must override this method for custom requirements
        throw new Error(
          'Custom health check class requires subclass implementation of getHealthCheckRequirements()'
        );

      default:
        throw new Error(`Unknown health check class: ${healthCheckClass}`);
    }
  }
}
