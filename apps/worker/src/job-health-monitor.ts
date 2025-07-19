// Job Health Monitor - Encapsulates WebSocket inactivity detection and recovery
// Handles the complex health check process transparently for the main worker

import { Job, logger } from '@emp/core';
import { ConnectorManager } from './connector-manager.js';

interface JobHealthStatus {
  jobId: string;
  job: Job;
  startTime: number;
  lastWebSocketActivity: number;
}

export interface HealthCheckResult {
  action: 'complete_job' | 'fail_job' | 'return_to_queue' | 'continue_monitoring';
  reason: string;
  result?: unknown;
}

export class JobHealthMonitor {
  private activeJobs = new Map<string, JobHealthStatus>();
  private healthCheckInterval?: NodeJS.Timeout;
  private connectorManager: ConnectorManager;
  private healthCheckIntervalMs: number;
  private inactivityTimeoutMs: number;
  private onHealthCheckResult?: (
    jobId: string,
    job: Job,
    result: HealthCheckResult
  ) => Promise<void>;

  constructor(
    connectorManager: ConnectorManager,
    healthCheckIntervalMs = 30000,
    inactivityTimeoutMs = 30000
  ) {
    this.connectorManager = connectorManager;
    this.healthCheckIntervalMs = healthCheckIntervalMs;
    this.inactivityTimeoutMs = inactivityTimeoutMs;
  }

  /**
   * Start monitoring a job for WebSocket inactivity
   */
  startMonitoring(job: Job): void {
    const now = Date.now();
    this.activeJobs.set(job.id, {
      jobId: job.id,
      job,
      startTime: now,
      lastWebSocketActivity: now,
    });

    logger.debug(`Started health monitoring for job ${job.id}`);
  }

  /**
   * Update WebSocket activity timestamp (called when any WebSocket message received)
   */
  updateWebSocketActivity(jobId: string): void {
    const jobHealth = this.activeJobs.get(jobId);
    if (jobHealth) {
      jobHealth.lastWebSocketActivity = Date.now();
      logger.debug(`Updated WebSocket activity for job ${jobId}`);
    }
  }

  /**
   * Stop monitoring a job (called when job completes normally)
   */
  stopMonitoring(jobId: string): void {
    if (this.activeJobs.delete(jobId)) {
      logger.debug(`Stopped health monitoring for job ${jobId}`);
    }
  }

  /**
   * Set callback for health check results
   */
  setHealthCheckCallback(
    callback: (jobId: string, job: Job, result: HealthCheckResult) => Promise<void>
  ): void {
    this.onHealthCheckResult = callback;
  }

  /**
   * Start the health monitoring service
   */
  start(): void {
    if (this.healthCheckInterval) {
      logger.warn('JobHealthMonitor is already running');
      return;
    }

    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, this.healthCheckIntervalMs);

    logger.info(
      `JobHealthMonitor started (check interval: ${this.healthCheckIntervalMs}ms, inactivity timeout: ${this.inactivityTimeoutMs}ms)`
    );
  }

  /**
   * Stop the health monitoring service
   */
  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }

    this.activeJobs.clear();
    logger.info('JobHealthMonitor stopped');
  }

  /**
   * Check all active jobs for WebSocket inactivity and perform health checks
   */
  private async performHealthChecks(): Promise<void> {
    if (this.activeJobs.size === 0) {
      return;
    }

    const now = Date.now();
    const inactiveJobs: JobHealthStatus[] = [];

    // Find jobs with WebSocket inactivity
    for (const jobHealth of this.activeJobs.values()) {
      const inactivityTime = now - jobHealth.lastWebSocketActivity;

      if (inactivityTime >= this.inactivityTimeoutMs) {
        inactiveJobs.push(jobHealth);
      }
    }

    if (inactiveJobs.length === 0) {
      return;
    }

    logger.info(
      `Detected ${inactiveJobs.length} jobs with WebSocket inactivity >${this.inactivityTimeoutMs}ms`
    );

    // Perform health checks on inactive jobs
    for (const jobHealth of inactiveJobs) {
      await this.performJobHealthCheck(jobHealth);
    }
  }

  /**
   * Perform health check on a specific job
   */
  private async performJobHealthCheck(jobHealth: JobHealthStatus): Promise<void> {
    const { jobId, job } = jobHealth;
    const inactivityTime = Date.now() - jobHealth.lastWebSocketActivity;

    logger.info(
      `Performing health check on job ${jobId} (inactive for ${Math.round(inactivityTime / 1000)}s)`
    );

    try {
      // Get the connector for this job's service type
      const connector = this.connectorManager.getConnectorByServiceType(job.service_required);
      if (!connector) {
        logger.warn(`No connector found for job ${jobId} service ${job.service_required}`);
        return;
      }

      // Check if connector supports health checks
      if (!('healthCheckJob' in connector) || typeof connector.healthCheckJob !== 'function') {
        logger.debug(`Connector ${connector.service_type} does not support job health checks`);
        return;
      }

      // Perform the health check
      const healthResult = await (connector as { healthCheckJob: (jobId: string) => Promise<HealthCheckResult> }).healthCheckJob(jobId);
      logger.info(`Health check result for job ${jobId}:`, healthResult);

      // Stop monitoring this job since we're about to handle it
      this.stopMonitoring(jobId);

      // Notify the callback with the result
      if (this.onHealthCheckResult) {
        await this.onHealthCheckResult(jobId, job, healthResult);
      }
    } catch (error) {
      logger.error(`Health check failed for job ${jobId}:`, error);

      // Return job to queue on health check failure
      if (this.onHealthCheckResult) {
        await this.onHealthCheckResult(jobId, job, {
          action: 'return_to_queue',
          reason: 'health_check_error',
        });
      }
    }
  }

  /**
   * Get current monitoring statistics
   */
  getStats(): {
    activeJobsCount: number;
    oldestJobStartTime?: number;
    longestInactivityTime?: number;
  } {
    if (this.activeJobs.size === 0) {
      return { activeJobsCount: 0 };
    }

    const now = Date.now();
    let oldestJobStartTime = now;
    let longestInactivityTime = 0;

    for (const jobHealth of this.activeJobs.values()) {
      oldestJobStartTime = Math.min(oldestJobStartTime, jobHealth.startTime);
      longestInactivityTime = Math.max(
        longestInactivityTime,
        now - jobHealth.lastWebSocketActivity
      );
    }

    return {
      activeJobsCount: this.activeJobs.size,
      oldestJobStartTime,
      longestInactivityTime,
    };
  }
}
