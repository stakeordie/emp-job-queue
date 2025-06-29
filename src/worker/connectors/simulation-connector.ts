// Simulation Connector - for testing and development
// Direct port from Python worker/connectors/simulation_connector.py

import { ConnectorInterface, JobData, JobResult, JobProgress, ProgressCallback, ConnectorConfig } from '../../core/types/connector.js';
import { logger } from '../../core/utils/logger.js';

export class SimulationConnector implements ConnectorInterface {
  connector_id: string;
  service_type = 'simulation';
  version = '1.0.0';
  private config: ConnectorConfig;
  private processingTimeMs: number;
  private steps: number;
  private failureRate: number;
  private progressIntervalMs: number;

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
        progress_update_interval_ms: this.progressIntervalMs
      }
    };
  }

  async initialize(): Promise<void> {
    logger.info(`Initializing Simulation connector ${this.connector_id}`);
    logger.info(`Simulation settings: ${this.processingTimeMs}ms processing, ${this.steps} steps, ${this.failureRate} failure rate`);
  }

  async cleanup(): Promise<void> {
    logger.info(`Cleaning up Simulation connector ${this.connector_id}`);
  }

  async checkHealth(): Promise<boolean> {
    // Simulation connector is always healthy
    return true;
  }

  async getAvailableModels(): Promise<string[]> {
    // Simulation connector supports generic models
    return ['simulation-model-v1', 'simulation-model-v2', 'test-model'];
  }

  async getServiceInfo(): Promise<any> {
    return {
      service_name: 'Simulation Service',
      service_version: this.version,
      base_url: this.config.base_url,
      status: 'online',
      capabilities: {
        supported_formats: ['json'],
        supported_models: await this.getAvailableModels(),
        features: ['progress_tracking', 'cancellation', 'failure_simulation'],
        concurrent_jobs: this.config.max_concurrent_jobs
      }
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
          estimated_completion_ms: step < this.steps ? (this.steps - step) * stepDuration : 0
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
            convergence: true
          }
        },
        processing_time_ms: processingTime,
        service_metadata: {
          service_version: this.version,
          model_used: 'simulation-model-v1',
          processing_stats: {
            total_steps: this.steps,
            step_duration_ms: stepDuration,
            success_rate: 1 - this.failureRate
          }
        }
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
            total_steps: this.steps
          }
        }
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
}