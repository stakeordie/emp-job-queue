// Simulation Connector - for testing and development
// Enhanced to use BaseConnector for shared Redis connection and status reporting

import {
  JobData,
  JobResult,
  ProgressCallback,
  ConnectorConfig,
  ServiceInfo,
  logger,
} from '@emp/core';
import { BaseConnector } from './base-connector.js';

export class SimulationConnector extends BaseConnector {
  service_type = 'simulation';
  version = '1.0.0';
  private processingTimeMs: number;
  private steps: number;
  private failureRate: number;
  private progressIntervalMs: number;
  private healthCheckFailureRate: number;

  constructor(connectorId: string) {
    // Configuration from environment (matching Python patterns)
    const processingTimeMs = parseInt(process.env.WORKER_SIMULATION_PROCESSING_TIME || '5') * 1000;
    const steps = parseInt(process.env.WORKER_SIMULATION_STEPS || '10');
    const failureRate = parseFloat(process.env.WORKER_SIMULATION_FAILURE_RATE || '0.1');
    const progressIntervalMs = parseInt(
      process.env.WORKER_SIMULATION_PROGRESS_INTERVAL_MS || '200'
    );
    const healthCheckFailureRate = parseFloat(
      process.env.WORKER_SIMULATION_HEALTH_CHECK_FAILURE_RATE || '0.04'
    ); // 1 in 25

    // Initialize BaseConnector with simulation-specific config
    super(connectorId, {
      service_type: 'simulation',
      base_url: 'http://simulation',
      timeout_seconds: 60,
      retry_attempts: 3,
      retry_delay_seconds: 1,
      health_check_interval_seconds: 30,
      max_concurrent_jobs: 5,
      settings: {
        min_processing_time_ms: processingTimeMs,
        max_processing_time_ms: processingTimeMs,
        failure_rate: failureRate,
        progress_update_interval_ms: progressIntervalMs,
      },
    });

    this.connector_id = connectorId;
    this.processingTimeMs = processingTimeMs;
    this.steps = steps;
    this.failureRate = failureRate;
    this.progressIntervalMs = progressIntervalMs;
    this.healthCheckFailureRate = healthCheckFailureRate;
  }

  // BaseConnector implementation methods
  protected async initializeService(): Promise<void> {
    logger.info(
      `Simulation settings: ${this.processingTimeMs}ms processing, ${this.steps} steps, ${this.failureRate} failure rate`
    );
    // Simulation connector doesn't need service-specific initialization
  }

  protected async cleanupService(): Promise<void> {
    // Simulation connector doesn't need service-specific cleanup
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

  protected async processJobImpl(
    jobData: JobData,
    progressCallback: ProgressCallback
  ): Promise<JobResult> {
    const startTime = Date.now();
    logger.info(`Starting simulation job ${jobData.id}`);

    try {
      // Simulate random failure
      if (Math.random() < this.failureRate) {
        throw new Error(`Simulated failure for job ${jobData.id}`);
      }

      // Simulate processing with progress updates
      const stepDuration = this.processingTimeMs / this.steps;

      // Simulate health check failure scenario (1 in 25 jobs don't send complete_job)
      const shouldSimulateHealthCheckFailure = Math.random() < this.healthCheckFailureRate;

      for (let step = 0; step <= this.steps; step++) {
        const progress = Math.round((step / this.steps) * 100);

        // Don't send the final progress update if simulating health check failure
        if (shouldSimulateHealthCheckFailure && step === this.steps) {
          logger.warn(
            `Simulation job ${jobData.id}: Simulating missed complete_job message (health check test)`
          );
          // Job completes but final progress update is never sent - will trigger health check
          break;
        }

        await progressCallback({
          job_id: jobData.id,
          progress,
          message: `Processing step ${step}/${this.steps}`,
          current_step: `Step ${step}`,
          total_steps: this.steps,
          estimated_completion_ms:
            step < this.steps ? (this.steps - step) * Number(stepDuration) : 0,
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

  /**
   * Health check for stuck simulation jobs
   * Simulation-specific implementation that always recovers jobs since they complete instantly
   */
  async healthCheckJob(
    jobId: string
  ): Promise<{ action: string; reason: string; result?: unknown }> {
    logger.info(
      `Simulation health check for job ${jobId}: assuming completed (simulation always succeeds)`
    );

    // For simulation, we always assume the job completed successfully
    // This simulates the scenario where ComfyUI completed but didn't send complete_job message
    return {
      action: 'complete_job',
      reason: 'simulation_assumed_completed',
      result: {
        message: 'Simulation job recovered by health check',
        steps_completed: this.steps,
        processing_time_ms: this.processingTimeMs,
        simulation_id: `sim_recovered_${Date.now()}`,
        results: {
          iterations: this.steps,
          final_value: Math.random() * 100,
          convergence: true,
          recovered: true,
        },
      },
    };
  }

  // Status reporting is now handled by BaseConnector
  // The checkAndReportStatus method is inherited from BaseConnector
}
