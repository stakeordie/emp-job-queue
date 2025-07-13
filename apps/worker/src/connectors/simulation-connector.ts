// Simulation Connector - for testing and development
// Direct port from Python worker/connectors/simulation_connector.py

import {
  ConnectorInterface,
  JobData,
  JobResult,
  ProgressCallback,
  ConnectorConfig,
  ServiceInfo,
  logger,
} from '@emp/core';
import Redis from 'ioredis';

export class SimulationConnector implements ConnectorInterface {
  connector_id: string;
  service_type = 'simulation';
  version = '1.0.0';
  private config: ConnectorConfig;
  private processingTimeMs: number;
  private steps: number;
  private failureRate: number;
  private progressIntervalMs: number;
  private redis?: Redis;
  private statusReportingInterval?: NodeJS.Timeout;
  private workerId?: string;
  private lastReportedStatus?: string; // Track last reported status to prevent duplicates

  constructor(connectorId: string) {
    this.connector_id = connectorId;

    // Configuration from environment (matching Python patterns)
    this.processingTimeMs = parseInt(process.env.WORKER_SIMULATION_PROCESSING_TIME || '5') * 1000;
    this.steps = parseInt(process.env.WORKER_SIMULATION_STEPS || '10');
    this.failureRate = parseFloat(process.env.WORKER_SIMULATION_FAILURE_RATE || '0.1');
    this.progressIntervalMs = parseInt(process.env.WORKER_SIMULATION_PROGRESS_INTERVAL_MS || '200');

    this.config = {
      connector_id: this.connector_id,
      service_type: this.service_type,
      base_url: 'http://simulation',
      timeout_seconds: 60,
      retry_attempts: 3,
      retry_delay_seconds: 1,
      health_check_interval_seconds: 30,
      max_concurrent_jobs: 5,
      settings: {
        min_processing_time_ms: this.processingTimeMs,
        max_processing_time_ms: this.processingTimeMs,
        failure_rate: this.failureRate,
        progress_update_interval_ms: this.progressIntervalMs,
      },
    };
  }

  async initialize(): Promise<void> {
    logger.info(`Initializing Simulation connector ${this.connector_id}`);
    logger.info(
      `Simulation settings: ${this.processingTimeMs}ms processing, ${this.steps} steps, ${this.failureRate} failure rate`
    );

    // Initialize Redis connection for status reporting
    const redisUrl = process.env.HUB_REDIS_URL || 'redis://localhost:6379';
    this.workerId = process.env.WORKER_ID || 'unknown-worker';

    try {
      this.redis = new Redis(redisUrl);
      this.startStatusReporting();
      logger.info(
        `Simulation connector ${this.connector_id} connected to Redis and started status reporting`
      );
    } catch (error) {
      logger.warn(`Failed to connect to Redis for status reporting: ${error}`);
    }
  }

  async cleanup(): Promise<void> {
    logger.info(`Cleaning up Simulation connector ${this.connector_id}`);

    this.stopStatusReporting();

    if (this.redis) {
      await this.redis.quit();
      this.redis = undefined;
    }
  }

  async checkHealth(): Promise<boolean> {
    // Simulation connector is always healthy
    return true;
  }

  async getAvailableModels(): Promise<string[]> {
    // Simulation connector supports generic models
    return ['simulation-model-v1', 'simulation-model-v2', 'test-model'];
  }

  async getServiceInfo(): Promise<ServiceInfo> {
    return {
      service_name: 'Simulation Service',
      service_version: this.version,
      base_url: this.config.base_url,
      status: 'online',
      capabilities: {
        supported_formats: ['json'],
        supported_models: await this.getAvailableModels(),
        features: ['progress_tracking', 'cancellation', 'failure_simulation'],
        concurrent_jobs: this.config.max_concurrent_jobs,
      },
    };
  }

  async canProcessJob(jobData: JobData): Promise<boolean> {
    // Simulation connector can process any simulation job
    return jobData.type === 'simulation' || jobData.type === this.service_type;
  }

  async processJob(jobData: JobData, progressCallback: ProgressCallback): Promise<JobResult> {
    const startTime = Date.now();
    logger.info(`Starting simulation job ${jobData.id}`);

    try {
      // Simulate random failure
      if (Math.random() < this.failureRate) {
        throw new Error(`Simulated failure for job ${jobData.id}`);
      }

      // Simulate processing with progress updates
      const stepDuration = this.processingTimeMs / this.steps;

      for (let step = 0; step <= this.steps; step++) {
        const progress = Math.round((step / this.steps) * 100);

        await progressCallback({
          job_id: jobData.id,
          progress,
          message: `Processing step ${step}/${this.steps}`,
          current_step: `Step ${step}`,
          total_steps: this.steps,
          estimated_completion_ms: step < this.steps ? (this.steps - step) * stepDuration : 0,
        });

        if (step < this.steps) {
          await this.sleep(stepDuration);
        }
      }

      const processingTime = Date.now() - startTime;

      // Generate simulation result
      const result: JobResult = {
        success: true,
        data: {
          message: 'Simulation completed successfully',
          steps_completed: this.steps,
          processing_time_ms: processingTime,
          job_payload: jobData.payload,
          simulation_id: `sim_${Date.now()}`,
          results: {
            iterations: this.steps,
            final_value: Math.random() * 100,
            convergence: true,
          },
        },
        processing_time_ms: processingTime,
        service_metadata: {
          service_version: this.version,
          model_used: 'simulation-model-v1',
          processing_stats: {
            total_steps: this.steps,
            step_duration_ms: stepDuration,
            success_rate: 1 - this.failureRate,
          },
        },
      };

      logger.info(`Simulation job ${jobData.id} completed in ${processingTime}ms`);
      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error(`Simulation job ${jobData.id} failed:`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown simulation error',
        processing_time_ms: processingTime,
        service_metadata: {
          service_version: this.version,
          processing_stats: {
            failed_at_step: Math.floor(Math.random() * this.steps),
            total_steps: this.steps,
          },
        },
      };
    }
  }

  async cancelJob(jobId: string): Promise<void> {
    logger.info(`Cancelling simulation job ${jobId}`);
    // Simulation jobs can be cancelled immediately
  }

  async updateConfiguration(config: ConnectorConfig): Promise<void> {
    this.config = { ...this.config, ...config };
    logger.info(`Updated configuration for simulation connector ${this.connector_id}`);
  }

  getConfiguration(): ConnectorConfig {
    return { ...this.config };
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Status reporting methods - now event-driven instead of periodic
  startStatusReporting(): void {
    if (!this.redis) {
      return;
    }

    // Send initial status immediately (first-time connection)
    this.reportStatus();

    // Note: No longer using periodic intervals - status will be reported on actual changes
    logger.info(
      `${this.service_type} connector ${this.connector_id} using event-driven status reporting`
    );
  }

  stopStatusReporting(): void {
    if (this.statusReportingInterval) {
      clearInterval(this.statusReportingInterval);
      this.statusReportingInterval = undefined;
    }
  }

  private async reportStatus(): Promise<void> {
    if (!this.redis || !this.workerId) {
      return;
    }

    try {
      const isHealthy = await this.checkHealth();
      const currentStatus = isHealthy ? 'active' : 'error';

      // Only report if status actually changed
      if (this.lastReportedStatus === currentStatus) {
        logger.debug(
          `${this.service_type} connector ${this.connector_id} status unchanged (${currentStatus}), skipping report`
        );
        return;
      }

      const serviceInfo = await this.getServiceInfo();

      const statusReport = {
        connector_id: this.connector_id,
        service_type: this.service_type,
        worker_id: this.workerId,
        status: currentStatus,
        service_info: serviceInfo,
        timestamp: new Date().toISOString(),
        last_health_check: Date.now(),
        status_changed: this.lastReportedStatus !== undefined, // true if this is a status change, false for initial report
        previous_status: this.lastReportedStatus,
      };

      // Publish to Redis channel for real-time updates
      await this.redis.publish(
        `connector_status:${this.service_type}`,
        JSON.stringify(statusReport)
      );

      // Also store in Redis hash for persistence
      await this.redis.hset(`connector_status:${this.workerId}:${this.service_type}`, {
        status: statusReport.status,
        last_update: statusReport.timestamp,
        service_info: JSON.stringify(statusReport.service_info),
      });

      // Update last reported status to prevent duplicates
      this.lastReportedStatus = currentStatus;

      logger.info(
        `Simulation connector ${this.connector_id} reported ${this.lastReportedStatus === statusReport.previous_status ? 'initial' : 'changed'} status: ${statusReport.status}`
      );
    } catch (error) {
      logger.error(`Failed to report status for connector ${this.connector_id}:`, error);
    }
  }

  /**
   * Manually trigger a status check (for event-driven updates)
   * This can be called when connector state might have changed
   */
  async checkAndReportStatus(): Promise<void> {
    await this.reportStatus();
  }
}
