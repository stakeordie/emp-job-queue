// Connector Logger - Normalized logging interface for different connector types
// Provides connector-specific log formatting and metadata enrichment

import { logger as baseLogger } from '../utils/logger.js';
import winston from 'winston';
// Fluent Bit transport removed - direct logging approach only

export interface ConnectorLogContext {
  machineId: string;
  workerId: string;
  serviceType: string;
  connectorId: string;
  jobId?: string;
  sessionId?: string;
}

export interface JobLogData {
  jobId: string;
  status?: 'received' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress?: number;
  error?: string;
  duration?: number;
  inputSize?: number;
  outputSize?: number;
  model?: string;
  queuePosition?: number;
  estimatedWaitTime?: number;
  resourceAllocation?: any;
  priority?: number;
  expectedDuration?: number;
  execution_step?: string;
  currentOperation?: string;
  elapsedTime?: number;
  estimatedRemaining?: number;
  [key: string]: any;
}

export interface CompletionMetrics {
  efficiency: number;
  cost: number;
  cacheHit: boolean;
  userScore: number;
}

export interface FailureAnalysis {
  type: string;
  category: string;
  recoverable: boolean;
  retryRecommended: boolean;
  resourceImpact: string;
  userImpact: string;
}

export class ConnectorLogger {
  private logger: winston.Logger;
  private context: ConnectorLogContext;

  constructor(context: ConnectorLogContext, enableDirectLogging: boolean = true) {
    this.context = context;

    // Create a child logger with connector-specific defaults
    this.logger = baseLogger.child({
      machine_id: context.machineId,
      worker_id: context.workerId,
      service_type: context.serviceType,
      connector_id: context.connectorId,
      component: 'connector',
    });

    // Direct logging approach - no external transport setup needed
    console.log(`✅ ConnectorLogger: Direct logging configured for ${context.connectorId}`);
  }

  // Fluent Bit transport removed - direct logging approach only

  // Standard logging methods
  info(message: string, meta?: any): void {
    this.logger.info(message, { ...meta, ...this.getLogMeta() });
  }

  warn(message: string, meta?: any): void {
    this.logger.warn(message, { ...meta, ...this.getLogMeta() });
  }

  error(message: string, error?: Error | any, meta?: any): void {
    const errorMeta =
      error instanceof Error ? { error: error.message, stack: error.stack } : { error };

    this.logger.error(message, { ...errorMeta, ...meta, ...this.getLogMeta() });
  }

  debug(message: string, meta?: any): void {
    this.logger.debug(message, { ...meta, ...this.getLogMeta() });
  }

  // Specialized logging methods for common connector events

  jobReceived(jobData: JobLogData): void {
    this.info('Job received', {
      event_type: 'job_received',
      job_id: jobData.jobId,
      job_status: 'received',
      model: jobData.model,
      input_size: jobData.inputSize,
      ...this.normalizeJobData(jobData),
    });
  }

  jobStarted(jobData: JobLogData): void {
    this.info('Job processing started', {
      event_type: 'job_started',
      job_id: jobData.jobId,
      job_status: 'processing',
      model: jobData.model,
      ...this.normalizeJobData(jobData),
    });
  }

  jobProgress(jobData: JobLogData): void {
    this.info('Job progress update', {
      event_type: 'job_progress',
      job_id: jobData.jobId,
      job_status: 'processing',
      progress: jobData.progress,
      ...this.normalizeJobData(jobData),
    });
  }

  jobCompleted(jobData: JobLogData): void {
    this.info('Job completed successfully', {
      event_type: 'job_completed',
      job_id: jobData.jobId,
      job_status: 'completed',
      duration: jobData.duration,
      output_size: jobData.outputSize,
      ...this.normalizeJobData(jobData),
    });
  }

  jobFailed(jobData: JobLogData & { error: string }): void {
    this.error('Job failed', jobData.error, {
      event_type: 'job_failed',
      job_id: jobData.jobId,
      job_status: 'failed',
      duration: jobData.duration,
      error_type: this.classifyError(jobData.error),
      ...this.normalizeJobData(jobData),
    });
  }

  healthCheck(status: 'healthy' | 'unhealthy', details?: any): void {
    const level = status === 'healthy' ? 'info' : 'warn';
    this.logger.log(level, `Health check: ${status}`, {
      event_type: 'health_check',
      health_status: status,
      health_details: details,
      ...this.getLogMeta(),
    });
  }

  serviceEvent(eventType: string, message: string, meta?: any): void {
    this.info(message, {
      event_type: `service_${eventType}`,
      ...meta,
    });
  }

  // Update context (useful for job-specific logging)
  withJobContext(jobId: string, sessionId?: string): ConnectorLogger {
    const newContext = { ...this.context, jobId, sessionId };
    return new ConnectorLogger(newContext, true); // direct logging always enabled
  }

  private getLogMeta(): any {
    return {
      timestamp: new Date().toISOString(),
      job_id: this.context.jobId,
      session_id: this.context.sessionId,
    };
  }

  private normalizeJobData(jobData: JobLogData): any {
    // Remove undefined values and normalize field names
    const normalized: any = {};

    Object.entries(jobData).forEach(([key, value]) => {
      if (value !== undefined) {
        normalized[key] = value;
      }
    });

    return normalized;
  }

  private classifyError(error: string): string {
    // Basic error classification for analytics
    if (error.includes('timeout')) return 'timeout';
    if (error.includes('memory') || error.includes('OOM')) return 'memory';
    if (error.includes('connection') || error.includes('network')) return 'network';
    if (error.includes('model') || error.includes('load')) return 'model';
    if (error.includes('validation') || error.includes('invalid')) return 'validation';
    return 'unknown';
  }
}
