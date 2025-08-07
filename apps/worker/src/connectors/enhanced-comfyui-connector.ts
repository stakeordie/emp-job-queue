// Enhanced ComfyUI Connector - Demonstrates integration with new logging system
// Shows how to use ConnectorLogger for normalized, structured logging

import { ConnectorLogger, ComfyUILogSchema } from '@emp/core';
import { ComfyUIConnector } from './comfyui-connector.js';
import { JobData, JobResult, ProgressCallback } from '@emp/core';

export class EnhancedComfyUIConnector extends ComfyUIConnector {
  private connectorLogger?: ConnectorLogger;

  constructor(connectorId: string = 'comfyui') {
    super(connectorId);
    this.service_type = 'comfyui';
    
    // Initialize connector logger once we have worker context
    this.setupConnectorLogger();
  }

  private setupConnectorLogger(): void {
    try {
      // Get worker context from environment or parent worker
      const machineId = process.env.MACHINE_ID || this.machineId || 'unknown';
      const workerId = process.env.WORKER_ID || this.workerId || 'unknown';
      
      this.connectorLogger = new ConnectorLogger({
        machineId,
        workerId,
        serviceType: this.service_type,
        connectorId: this.connector_id,
      });

      this.connectorLogger.info('Enhanced ComfyUI connector initialized', {
        connector_version: this.version,
        machine_id: machineId,
        worker_id: workerId,
      });

    } catch (error) {
      // Fall back to base logger if ConnectorLogger fails
      console.warn('Failed to setup ConnectorLogger, using base logger', error);
    }
  }

  // Override job processing methods to add structured logging
  async processJob(jobData: JobData, progressCallback?: ProgressCallback): Promise<JobResult> {
    const startTime = Date.now();
    let jobLogger = this.connectorLogger;
    
    // Create job-specific logger context
    if (jobLogger && jobData.id) {
      jobLogger = jobLogger.withJobContext(jobData.id);
    }

    try {
      // Log job received with ComfyUI-specific data
      jobLogger?.jobReceived({
        jobId: jobData.id,
        model: this.extractModelFromPayload(jobData.payload),
        inputSize: JSON.stringify(jobData.payload).length,
        workflow_hash: this.calculateWorkflowHash(jobData.payload),
      });

      // Log job started
      jobLogger?.jobStarted({
        jobId: jobData.id,
        model: this.extractModelFromPayload(jobData.payload),
      });

      // Enhanced progress callback that logs progress
      const enhancedProgressCallback: ProgressCallback = (progress) => {
        jobLogger?.jobProgress({
          jobId: jobData.id,
          progress: progress.progress,
          execution_step: progress.status,
          queue_remaining: progress.queue_remaining,
        });
        
        // Call original callback
        if (progressCallback) {
          progressCallback(progress);
        }
      };

      // Call parent processJob method
      const result = await super.processJob(jobData, enhancedProgressCallback);
      
      const duration = Date.now() - startTime;

      // Log successful completion
      jobLogger?.jobCompleted({
        jobId: jobData.id,
        duration,
        outputSize: result.output_data ? JSON.stringify(result.output_data).length : 0,
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;

      // Log job failure with error classification
      jobLogger?.jobFailed({
        jobId: jobData.id,
        error: error.message,
        duration,
      });

      throw error;
    }
  }

  // Override health check to include logging
  async healthCheck(): Promise<any> {
    try {
      const health = await super.healthCheck();
      
      this.connectorLogger?.healthCheck('healthy', {
        api_available: health.api_available,
        models_loaded: health.models_loaded,
        queue_size: health.queue_size,
        vram_usage: health.vram_usage_mb,
      });

      return health;
      
    } catch (error) {
      this.connectorLogger?.healthCheck('unhealthy', {
        error: error.message,
        error_type: this.classifyHealthError(error.message),
      });
      
      throw error;
    }
  }

  // ComfyUI-specific logging methods
  logWebSocketMessage(messageType: string, data: any): void {
    this.connectorLogger?.debug('WebSocket message received', {
      event_type: 'websocket_message',
      websocket_message_type: messageType,
      prompt_id: data.prompt_id,
      client_id: data.client_id,
      node_id: data.node,
    } as Partial<ComfyUILogSchema>);
  }

  logModelLoad(modelName: string, loadTime: number): void {
    this.connectorLogger?.info('Model loaded', {
      event_type: 'model_loaded',
      model_name: modelName,
      load_time_ms: loadTime,
    });
  }

  logQueueUpdate(queueSize: number, processing: boolean): void {
    this.connectorLogger?.debug('Queue status updated', {
      event_type: 'queue_update',
      queue_remaining: queueSize,
      is_processing: processing,
    });
  }

  // Utility methods for log data extraction
  private extractModelFromPayload(payload: any): string | undefined {
    // Try to extract model information from ComfyUI workflow
    try {
      if (typeof payload === 'object' && payload.workflow) {
        // Look for checkpoint loader nodes
        for (const [nodeId, node] of Object.entries(payload.workflow)) {
          if (typeof node === 'object' && node['class_type'] === 'CheckpointLoaderSimple') {
            return node['inputs']?.['ckpt_name'];
          }
        }
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  private calculateWorkflowHash(payload: any): string {
    // Simple hash of workflow structure for tracking
    try {
      const workflowStr = JSON.stringify(payload.workflow || payload);
      return this.simpleHash(workflowStr).toString();
    } catch {
      return 'unknown';
    }
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }

  private classifyHealthError(error: string): string {
    if (error.includes('connection') || error.includes('ECONNREFUSED')) return 'connection';
    if (error.includes('timeout')) return 'timeout';
    if (error.includes('memory') || error.includes('CUDA')) return 'memory';
    if (error.includes('model')) return 'model';
    return 'unknown';
  }
}