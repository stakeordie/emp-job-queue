/**
 * Simulation WebSocket Connector
 * 
 * WebSocket-based simulation connector for real-time bidirectional communication.
 * Extends the protocol WebSocketConnector with simulation-specific logic.
 * 
 * Key features:
 * - Real-time progress updates via WebSocket
 * - Bidirectional communication
 * - Automatic reconnection
 * - Heartbeat/ping-pong for connection health
 */

import {
  JobData,
  JobResult,
  ServiceInfo,
  ServiceJobStatus,
  HealthCheckCapabilities,
  logger,
} from '@emp/core';
import { 
  WebSocketConnector, 
  WebSocketConnectorConfig,
  MessageType,
  WebSocketMessage 
} from './protocol/websocket-connector.js';

export class SimulationWebsocketConnector extends WebSocketConnector {
  service_type = 'simulation-websocket' as const;
  version = '1.0.0';

  // Simulation-specific settings
  private processingTimeMs: number;
  private steps: number;
  private progressIntervalMs: number;
  private healthCheckFailureRate: number;

  constructor(connectorId: string) {
    // Parse simulation-specific environment variables
    const processingTimeMs = parseInt(process.env.WORKER_SIMULATION_PROCESSING_TIME || '5') * 1000;
    const steps = parseInt(process.env.WORKER_SIMULATION_STEPS || '10');
    const progressIntervalMs = parseInt(
      process.env.WORKER_SIMULATION_PROGRESS_INTERVAL_MS || '200'
    );
    const healthCheckFailureRate = parseFloat(
      process.env.WORKER_SIMULATION_HEALTH_CHECK_FAILURE_RATE || '0.04'
    );

    // Create WebSocket configuration for simulation service
    const wsConfig: WebSocketConnectorConfig = {
      connector_id: connectorId,
      service_type: 'simulation-websocket',
      base_url: 'ws://localhost:8399',
      websocket_url: process.env.SIMULATION_WEBSOCKET_URL || 'ws://localhost:8399',
      timeout_seconds: 60,
      retry_attempts: 3,
      retry_delay_seconds: 1,
      health_check_interval_seconds: 30,
      max_concurrent_jobs: parseInt(process.env.SIMULATION_MAX_CONCURRENT_JOBS || '1'),
      
      // WebSocket specific settings
      connect_timeout_ms: 10000,
      heartbeat_interval_ms: 30000,
      heartbeat_message: { type: 'ping' },
      reconnect_delay_ms: 5000,
      max_reconnect_attempts: 5,
      message_timeout_ms: 60000,
      job_correlation_field: 'job_id',
      progress_message_type: 'simulation_progress',
      
      // Authentication (none for simulation)
      auth: { type: 'none' }
    };

    // Call parent constructor with config
    super(connectorId, wsConfig);

    // Store simulation-specific settings
    this.processingTimeMs = processingTimeMs;
    this.steps = steps;
    this.progressIntervalMs = progressIntervalMs;
    this.healthCheckFailureRate = healthCheckFailureRate;

    logger.info(`🔧 REBUILT WebSocket connector - URL FIX APPLIED!`, {
      connector: connectorId,
      processingTimeMs,
      steps,
      websocket_url: wsConfig.websocket_url,
      fix_timestamp: '2025-08-11T14:32:00Z',
      fix_note: 'Removed /ws path from URL to match service'
    });
  }

  // ========================================
  // Abstract Method Implementations
  // ========================================

  /**
   * Classify incoming WebSocket message type
   */
  protected classifyMessage(messageData: any): MessageType {
    if (!messageData || typeof messageData !== 'object') {
      return MessageType.UNKNOWN;
    }

    const messageType = messageData.type?.toLowerCase();
    
    switch (messageType) {
      case 'simulation_ready':
      case 'simulation_status':
      case 'job_status':
      case 'simulation_metrics':
        return MessageType.CONNECTION; // Use CONNECTION for status/metrics messages
      
      case 'simulation_started':
        return MessageType.JOB_SUBMIT; // Job has been submitted/accepted
      
      case 'simulation_progress':
        return MessageType.JOB_PROGRESS;
      
      case 'simulation_complete':
        return MessageType.JOB_COMPLETE;
      
      case 'simulation_error':
      case 'error':
      case 'simulation_cancelled':
        return MessageType.JOB_ERROR;
      
      case 'ping':
      case 'pong':
        return MessageType.HEARTBEAT;
      
      default:
        return MessageType.UNKNOWN;
    }
  }

  /**
   * Extract job ID from message
   */
  protected extractJobId(messageData: any): string | undefined {
    return messageData.job_id || messageData.jobId || messageData.id;
  }

  /**
   * Extract progress percentage from message
   */
  protected extractProgress(messageData: any): number {
    if (typeof messageData.progress === 'number') {
      return messageData.progress;
    }
    
    // Try to calculate from steps
    if (messageData.current_step && messageData.total_steps) {
      return Math.round((messageData.current_step / messageData.total_steps) * 100);
    }
    
    return 0;
  }

  /**
   * Parse job result from completion message
   */
  protected parseJobResult(messageData: any, originalJobData: JobData): JobResult {
    return {
      success: true,
      data: {
        message: 'Simulation completed via WebSocket',
        steps_completed: this.steps,
        processing_time_ms: messageData.processing_time_ms || this.processingTimeMs,
        job_payload: originalJobData.payload,
        simulation_id: messageData.simulation_id || `sim_ws_${Date.now()}`,
        results: messageData.results || {
          iterations: this.steps,
          final_value: Math.random() * 100,
          convergence: true,
          protocol: 'websocket',
        },
        output_url: messageData.output_url
      },
      processing_time_ms: messageData.processing_time_ms || this.processingTimeMs,
      service_metadata: {
        service_version: this.version,
        service_type: 'simulation-websocket',
        model_used: 'simulation-model-v1'
      },
    };
  }

  /**
   * Extract error message from error response
   */
  protected extractErrorMessage(messageData: any): string {
    return messageData.error || messageData.message || 'Unknown simulation error';
  }

  /**
   * Build job submission message
   */
  protected buildJobMessage(jobData: JobData): any {
    return {
      type: 'simulation_job',
      job_id: jobData.id,
      job_type: jobData.type,
      payload: jobData.payload,
      config: {
        processing_time_ms: this.processingTimeMs,
        steps: this.steps,
        progress_interval_ms: this.progressIntervalMs,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Handle incoming WebSocket messages
   */
  protected onMessage(message: WebSocketMessage): void {
    logger.debug(`Simulation WebSocket received message: ${message.type}`, {
      jobId: message.jobId,
      messageType: message.type
    });

    // Handle simulation-specific messages
    switch (message.type) {
      case MessageType.CONNECTION:
        if (message.data?.type === 'simulation_ready') {
          logger.info('Simulation service ready', message.data);
        } else if (message.data?.type === 'simulation_status') {
          logger.info('Simulation status update', message.data);
        } else if (message.data?.type === 'simulation_metrics') {
          logger.debug('Simulation metrics received', message.data);
        }
        break;
      
      default:
        // Parent class handles job-related messages
        break;
    }
  }

  // ========================================
  // Service Information Methods
  // ========================================

  /**
   * Get available simulation models
   */
  async getAvailableModels(): Promise<string[]> {
    return ['simulation-model-v1', 'simulation-model-v2', 'websocket-model'];
  }

  /**
   * Get service information
   */
  async getServiceInfo(): Promise<ServiceInfo> {
    const wsConfig = this.wsConfig as WebSocketConnectorConfig;
    return {
      service_name: 'Simulation WebSocket Service',
      service_version: this.version,
      base_url: wsConfig.websocket_url || 'ws://localhost:8399/ws',
      status: this.connectionState === 'connected' ? 'online' : 'offline',
      capabilities: {
        supported_formats: ['json'],
        supported_models: await this.getAvailableModels(),
        features: [
          'real_time_progress',
          'bidirectional_communication',
          'failure_simulation',
          'websocket_protocol',
          'auto_reconnect',
        ],
        concurrent_jobs: this.config.max_concurrent_jobs,
      },
    };
  }

  /**
   * Check if this connector can process the job
   */
  async canProcessJob(jobData: JobData): Promise<boolean> {
    return (
      jobData.type === 'simulation' ||
      jobData.type === 'simulation-websocket' ||
      jobData.payload?.protocol === 'websocket'
    );
  }

  /**
   * Health check capabilities
   */
  getHealthCheckCapabilities(): HealthCheckCapabilities {
    return {
      supportsBasicHealthCheck: true,
      supportsJobStatusQuery: true,
      supportsJobCancellation: true, // WebSocket supports cancellation
      supportsServiceRestart: false,
      supportsQueueIntrospection: false,
    };
  }

  /**
   * Query job status via WebSocket
   */
  async queryJobStatus(jobId: string): Promise<ServiceJobStatus> {
    logger.debug(`Querying status for simulation WebSocket job`, {
      connector: this.connector_id,
      jobId,
    });

    if (this.connectionState !== 'connected') {
      return {
        serviceJobId: jobId,
        status: 'unknown',
        progress: 0,
        canReconnect: true, // WebSocket can reconnect
        canCancel: true, // WebSocket supports cancellation
      };
    }

    // Check if job is in active jobs
    const activeJob = this.activeJobs.get(jobId);
    if (activeJob) {
      return {
        serviceJobId: jobId,
        status: 'running',
        progress: 0, // Progress tracked separately, not on ActiveJob
        startedAt: new Date(activeJob.startTime).toISOString(),
        canReconnect: true,
        canCancel: true,
      };
    }

    // Send status query via WebSocket
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({
          serviceJobId: jobId,
          status: 'unknown',
          progress: 0,
          canReconnect: true,
          canCancel: true,
        });
      }, 5000);

      // Send status query message
      this.sendMessage({
        type: 'query_status',
        job_id: jobId,
        timestamp: new Date().toISOString(),
      });

      // Wait for response (handled in onMessage)
      // For now, return unknown status after timeout
      // In production, you'd track the response correlation
    });
  }

  /**
   * Cancel job via WebSocket
   */
  async cancelJob(jobId: string): Promise<void> {
    logger.info(`Cancelling simulation WebSocket job ${jobId}`);

    if (this.connectionState === 'connected') {
      try {
        const cancelMessage = {
          type: 'cancel_simulation',
          job_id: jobId,
          timestamp: new Date().toISOString(),
        };

        this.sendMessage(cancelMessage);
        logger.info(`Sent cancellation for simulation job ${jobId}`);
        
        // Remove from active jobs
        this.activeJobs.delete(jobId);
      } catch (error) {
        logger.error(`Failed to cancel simulation job ${jobId}:`, error);
        throw error;
      }
    } else {
      throw new Error('WebSocket not connected');
    }
  }
}