// ComfyUI Connector - WebSocket-based connection to ComfyUI service
// Direct port from Python worker/connectors/comfyui_connector.py

import { WebSocket } from 'ws';
import axios, { AxiosInstance } from 'axios';
import { ConnectorInterface, JobData, JobResult, JobProgress, ProgressCallback, ComfyUIConnectorConfig } from '../../core/types/connector.js';
import { logger } from '../../core/utils/logger.js';

export class ComfyUIConnector implements ConnectorInterface {
  connector_id: string;
  service_type = 'comfyui';
  version = '1.0.0';
  private config: ComfyUIConnectorConfig;
  private httpClient: AxiosInstance;
  private websocket: WebSocket | null = null;
  private isConnected = false;
  private activeJobs = new Map<string, { jobData: JobData; progressCallback: ProgressCallback }>();

  constructor(connectorId: string) {
    this.connector_id = connectorId;
    
    // Build configuration from environment (matching Python patterns)
    const host = process.env.WORKER_COMFYUI_HOST || 'localhost';
    const port = parseInt(process.env.WORKER_COMFYUI_PORT || '8188');
    const username = process.env.WORKER_COMFYUI_USERNAME;
    const password = process.env.WORKER_COMFYUI_PASSWORD;
    
    this.config = {
      connector_id: this.connector_id,
      service_type: this.service_type,
      base_url: `http://${host}:${port}`,
      auth: username && password ? {
        type: 'basic',
        username,
        password
      } : { type: 'none' },
      timeout_seconds: parseInt(process.env.WORKER_COMFYUI_TIMEOUT_SECONDS || '300'),
      retry_attempts: 3,
      retry_delay_seconds: 2,
      health_check_interval_seconds: 30,
      max_concurrent_jobs: parseInt(process.env.WORKER_COMFYUI_MAX_CONCURRENT_JOBS || '1'),
      settings: {
        websocket_url: `ws://${host}:${port}/ws`,
        workflow_timeout_seconds: parseInt(process.env.WORKER_COMFYUI_WORKFLOW_TIMEOUT_SECONDS || '600'),
        image_format: (process.env.WORKER_COMFYUI_IMAGE_FORMAT as any) || 'png',
        image_quality: parseInt(process.env.WORKER_COMFYUI_IMAGE_QUALITY || '95'),
        save_workflow: process.env.WORKER_COMFYUI_SAVE_WORKFLOW !== 'false'
      }
    };

    // Initialize HTTP client
    this.httpClient = axios.create({
      baseURL: this.config.base_url,
      timeout: this.config.timeout_seconds * 1000,
      auth: this.config.auth?.type === 'basic' ? {
        username: this.config.auth.username!,
        password: this.config.auth.password!
      } : undefined
    });
  }

  async initialize(): Promise<void> {
    logger.info(`Initializing ComfyUI connector ${this.connector_id} at ${this.config.base_url}`);
    
    // Test HTTP connection
    await this.checkHealth();
    
    // Connect WebSocket for real-time updates
    await this.connectWebSocket();
    
    logger.info(`ComfyUI connector ${this.connector_id} initialized successfully`);
  }

  async cleanup(): Promise<void> {
    logger.info(`Cleaning up ComfyUI connector ${this.connector_id}`);
    
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
    
    this.isConnected = false;
    this.activeJobs.clear();
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await this.httpClient.get('/system_stats');
      return response.status === 200;
    } catch (error) {
      logger.error(`ComfyUI health check failed:`, error);
      return false;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      // Get available checkpoints from ComfyUI
      const response = await this.httpClient.get('/object_info');
      const objectInfo = response.data;
      
      // Extract checkpoint models
      const checkpoints = objectInfo?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];
      
      logger.info(`Found ${checkpoints.length} models in ComfyUI`);
      return checkpoints;
    } catch (error) {
      logger.error('Failed to get ComfyUI models:', error);
      return [];
    }
  }

  async getServiceInfo(): Promise<any> {
    try {
      const systemStats = await this.httpClient.get('/system_stats');
      const objectInfo = await this.httpClient.get('/object_info');
      
      return {
        service_name: 'ComfyUI',
        service_version: 'unknown', // ComfyUI doesn't expose version in API
        base_url: this.config.base_url,
        status: 'online',
        capabilities: {
          supported_formats: ['png', 'jpg', 'webp'],
          supported_models: await this.getAvailableModels(),
          features: ['workflow_processing', 'progress_tracking', 'websocket_updates'],
          concurrent_jobs: this.config.max_concurrent_jobs
        },
        resource_usage: systemStats.data,
        available_nodes: Object.keys(objectInfo.data || {}).length
      };
    } catch (error) {
      logger.error('Failed to get ComfyUI service info:', error);
      throw error;
    }
  }

  async canProcessJob(jobData: JobData): Promise<boolean> {
    return jobData.type === 'comfyui' && 
           jobData.payload?.workflow !== undefined;
  }

  async processJob(jobData: JobData, progressCallback: ProgressCallback): Promise<JobResult> {
    const startTime = Date.now();
    logger.info(`Starting ComfyUI job ${jobData.id}`);

    try {
      // Validate workflow
      const workflow = jobData.payload.workflow;
      if (!workflow) {
        throw new Error('No workflow provided in job payload');
      }

      // Store job for progress tracking
      this.activeJobs.set(jobData.id, { jobData, progressCallback });

      // Submit workflow to ComfyUI
      const promptId = await this.submitWorkflow(workflow);
      logger.info(`ComfyUI job ${jobData.id} submitted with prompt ID: ${promptId}`);

      // Wait for completion
      const result = await this.waitForCompletion(jobData.id, promptId, progressCallback);
      
      const processingTime = Date.now() - startTime;
      
      logger.info(`ComfyUI job ${jobData.id} completed in ${processingTime}ms`);
      
      return {
        success: true,
        data: result,
        processing_time_ms: processingTime,
        service_metadata: {
          service_version: this.version,
          model_used: this.extractModelFromWorkflow(workflow),
          processing_stats: {
            prompt_id: promptId,
            workflow_nodes: Object.keys(workflow).length
          }
        }
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error(`ComfyUI job ${jobData.id} failed:`, error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'ComfyUI processing failed',
        processing_time_ms: processingTime,
        service_metadata: {
          service_version: this.version
        }
      };
    } finally {
      this.activeJobs.delete(jobData.id);
    }
  }

  async cancelJob(jobId: string): Promise<void> {
    logger.info(`Cancelling ComfyUI job ${jobId}`);
    
    // Remove from active jobs
    this.activeJobs.delete(jobId);
    
    // ComfyUI doesn't have a direct cancel API, but we stop tracking the job
    // In a real implementation, you might need to interrupt the workflow
  }

  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.websocket = new WebSocket(this.config.settings.websocket_url!);

        this.websocket.on('open', () => {
          this.isConnected = true;
          logger.info(`ComfyUI WebSocket connected to ${this.config.settings.websocket_url}`);
          resolve();
        });

        this.websocket.on('message', (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleWebSocketMessage(message);
          } catch (error) {
            logger.error('Failed to parse ComfyUI WebSocket message:', error);
          }
        });

        this.websocket.on('error', (error) => {
          logger.error('ComfyUI WebSocket error:', error);
          this.isConnected = false;
          reject(error);
        });

        this.websocket.on('close', () => {
          logger.warn('ComfyUI WebSocket disconnected');
          this.isConnected = false;
        });

        // Connection timeout
        setTimeout(() => {
          if (!this.isConnected) {
            reject(new Error('ComfyUI WebSocket connection timeout'));
          }
        }, 10000);

      } catch (error) {
        reject(error);
      }
    });
  }

  private async submitWorkflow(workflow: any): Promise<string> {
    try {
      const response = await this.httpClient.post('/prompt', {
        prompt: workflow,
        client_id: this.connector_id
      });

      const promptId = response.data.prompt_id;
      if (!promptId) {
        throw new Error('No prompt ID returned from ComfyUI');
      }

      return promptId;
    } catch (error) {
      logger.error('Failed to submit workflow to ComfyUI:', error);
      throw error;
    }
  }

  private async waitForCompletion(jobId: string, promptId: string, progressCallback: ProgressCallback): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`ComfyUI job ${jobId} timed out after ${this.config.settings.workflow_timeout_seconds} seconds`));
      }, this.config.settings.workflow_timeout_seconds! * 1000);

      // Store completion handlers
      const originalJob = this.activeJobs.get(jobId);
      if (originalJob) {
        this.activeJobs.set(jobId, {
          ...originalJob,
          progressCallback: async (progress: JobProgress) => {
            await progressCallback(progress);
            
            // Check for completion
            if (progress.progress >= 100) {
              clearTimeout(timeout);
              
              // Get the results
              try {
                const result = await this.getJobResult(promptId);
                resolve(result);
              } catch (error) {
                reject(error);
              }
            }
          }
        });
      }
    });
  }

  private async getJobResult(promptId: string): Promise<any> {
    try {
      // Get history to find completed execution
      const historyResponse = await this.httpClient.get(`/history/${promptId}`);
      const history = historyResponse.data[promptId];
      
      if (!history) {
        throw new Error(`No history found for prompt ${promptId}`);
      }

      // Extract outputs from the execution
      const outputs = history.outputs || {};
      const images: string[] = [];
      
      // Process any image outputs
      for (const nodeId of Object.keys(outputs)) {
        const nodeOutput = outputs[nodeId];
        if (nodeOutput.images) {
          for (const image of nodeOutput.images) {
            const imageUrl = `${this.config.base_url}/view?filename=${image.filename}&subfolder=${image.subfolder || ''}&type=${image.type || 'output'}`;
            images.push(imageUrl);
          }
        }
      }

      return {
        prompt_id: promptId,
        outputs,
        images,
        execution_time: history.execution_time,
        status: history.status
      };
    } catch (error) {
      logger.error(`Failed to get ComfyUI job result for prompt ${promptId}:`, error);
      throw error;
    }
  }

  private handleWebSocketMessage(message: any): void {
    const { type, data } = message;
    
    switch (type) {
      case 'progress':
        this.handleProgressMessage(data);
        break;
      case 'executing':
        this.handleExecutingMessage(data);
        break;
      case 'executed':
        this.handleExecutedMessage(data);
        break;
      default:
        logger.debug(`Unhandled ComfyUI WebSocket message type: ${type}`);
    }
  }

  private async handleProgressMessage(data: any): Promise<void> {
    const { value, max } = data;
    const progress = max > 0 ? Math.round((value / max) * 100) : 0;
    
    // Update all active jobs with progress
    for (const [jobId, jobInfo] of this.activeJobs) {
      try {
        await jobInfo.progressCallback({
          job_id: jobId,
          progress,
          message: `Processing: ${value}/${max}`,
          current_step: `Step ${value}`,
          total_steps: max
        });
      } catch (error) {
        logger.error(`Failed to update progress for job ${jobId}:`, error);
      }
    }
  }

  private async handleExecutingMessage(data: any): Promise<void> {
    // Update active jobs when execution starts
    for (const [jobId, jobInfo] of this.activeJobs) {
      try {
        await jobInfo.progressCallback({
          job_id: jobId,
          progress: 10,
          message: 'Execution started',
          current_step: 'Starting workflow'
        });
      } catch (error) {
        logger.error(`Failed to update execution status for job ${jobId}:`, error);
      }
    }
  }

  private async handleExecutedMessage(data: any): Promise<void> {
    // Update active jobs when execution completes
    for (const [jobId, jobInfo] of this.activeJobs) {
      try {
        await jobInfo.progressCallback({
          job_id: jobId,
          progress: 100,
          message: 'Execution completed',
          current_step: 'Workflow finished'
        });
      } catch (error) {
        logger.error(`Failed to update completion status for job ${jobId}:`, error);
      }
    }
  }

  private extractModelFromWorkflow(workflow: any): string {
    // Try to find checkpoint loader node
    for (const nodeId of Object.keys(workflow)) {
      const node = workflow[nodeId];
      if (node.class_type === 'CheckpointLoaderSimple') {
        return node.inputs?.ckpt_name || 'unknown';
      }
    }
    return 'unknown';
  }

  async updateConfiguration(config: ComfyUIConnectorConfig): Promise<void> {
    this.config = { ...this.config, ...config };
    
    // Recreate HTTP client if base URL changed
    if (config.base_url) {
      this.httpClient = axios.create({
        baseURL: this.config.base_url,
        timeout: this.config.timeout_seconds * 1000,
        auth: this.config.auth?.type === 'basic' ? {
          username: this.config.auth.username!,
          password: this.config.auth.password!
        } : undefined
      });
    }
    
    logger.info(`Updated configuration for ComfyUI connector ${this.connector_id}`);
  }

  getConfiguration(): ComfyUIConnectorConfig {
    return { ...this.config };
  }
}