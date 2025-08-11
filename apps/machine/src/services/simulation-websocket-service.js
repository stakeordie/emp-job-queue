// WebSocket Simulation Server
// Pure WebSocket server for real-time bidirectional communication

import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../utils/logger.js';
import path from 'path';
import fs from 'fs-extra';
import { BlobServiceClient } from '@azure/storage-blob';

const logger = createLogger('simulation-websocket-server');

export class SimulationWebsocketService {
  constructor(options = {}) {
    this.port = options.port || parseInt(process.env.PORT) || 8399;
    this.host = options.host || process.env.HOST;
    this.server = createServer();
    this.wss = new WebSocketServer({ server: this.server });
    
    // Simulation configuration
    this.processingTimeMs = parseInt(process.env.SIMULATION_WS_PROCESSING_TIME || '10') * 1000;
    this.steps = parseInt(process.env.SIMULATION_WS_STEPS || '10');
    this.progressIntervalMs = parseInt(process.env.SIMULATION_WS_PROGRESS_INTERVAL_MS || '300');
    
    // Job tracking
    this.activeJobs = new Map();
    this.jobHistory = new Map();
    this.connectedClients = new Map(); // Map of client ID to WebSocket
    
    // Azure storage setup
    this.azureEnabled = !!(process.env.AZURE_STORAGE_ACCOUNT && process.env.AZURE_STORAGE_KEY);
    this.blobServiceClient = this.azureEnabled ? BlobServiceClient.fromConnectionString(
      `DefaultEndpointsProtocol=https;AccountName=${process.env.AZURE_STORAGE_ACCOUNT};AccountKey=${process.env.AZURE_STORAGE_KEY};EndpointSuffix=core.windows.net`
    ) : null;
    
    // Use test container when in test mode
    const isTestMode = process.env.STORAGE_TEST_MODE === 'true';
    this.containerName = isTestMode 
      ? (process.env.CLOUD_STORAGE_TEST_CONTAINER || 'emprops-share-test')
      : (process.env.CLOUD_STORAGE_CONTAINER || 'simulation-ws-outputs');
    
    this.setupWebSocket();
  }

  setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      const clientId = uuidv4();
      const clientIp = req.socket.remoteAddress;
      
      logger.info(`New WebSocket client connected: ${clientId} from ${clientIp}`);
      
      // Store client connection
      this.connectedClients.set(clientId, ws);
      
      // Send welcome message
      this.sendMessage(ws, {
        type: 'simulation_ready',
        client_id: clientId,
        server_version: '1.0.0',
        capabilities: {
          protocols: ['simulation-protocol'],
          features: ['real-time-progress', 'job-cancellation', 'status-query'],
          max_concurrent_jobs: 10,
          simulation_modes: ['fast', 'standard', 'detailed']
        }
      });
      
      // Handle client messages
      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          await this.handleClientMessage(clientId, ws, message);
        } catch (error) {
          logger.error(`Failed to process message from ${clientId}:`, error);
          this.sendMessage(ws, {
            type: 'error',
            error: 'Invalid message format',
            details: error.message
          });
        }
      });
      
      // Handle ping/pong for keepalive
      ws.on('ping', () => {
        ws.pong();
      });
      
      ws.on('pong', () => {
        // Client is alive
        logger.debug(`Pong received from ${clientId}`);
      });
      
      // Handle disconnection
      ws.on('close', () => {
        logger.info(`Client ${clientId} disconnected`);
        this.connectedClients.delete(clientId);
        
        // Cancel any active jobs for this client
        this.cancelClientJobs(clientId);
      });
      
      ws.on('error', (error) => {
        logger.error(`WebSocket error for client ${clientId}:`, error);
      });
    });
    
    // Heartbeat interval to check client connections
    setInterval(() => {
      this.connectedClients.forEach((ws, clientId) => {
        if (ws.readyState === ws.OPEN) {
          ws.ping();
        } else {
          this.connectedClients.delete(clientId);
        }
      });
    }, 30000);
  }

  async handleClientMessage(clientId, ws, message) {
    logger.debug(`Message from ${clientId}: ${message.type}`);
    
    switch (message.type) {
      case 'ping':
        this.sendMessage(ws, { type: 'pong', timestamp: new Date().toISOString() });
        break;
        
      case 'simulation_job':
        await this.processSimulationJob(clientId, ws, message);
        break;
        
      case 'query_status':
        await this.queryJobStatus(clientId, ws, message.job_id);
        break;
        
      case 'cancel_simulation':
        await this.cancelJob(clientId, ws, message.job_id);
        break;
        
      case 'list_jobs':
        await this.listJobs(clientId, ws);
        break;
        
      case 'get_metrics':
        await this.getMetrics(clientId, ws);
        break;
        
      default:
        logger.warn(`Unknown message type from ${clientId}: ${message.type}`);
        this.sendMessage(ws, {
          type: 'error',
          error: 'Unknown message type',
          received_type: message.type
        });
    }
  }

  async processSimulationJob(clientId, ws, message) {
    const jobId = message.job_id || uuidv4();
    const config = message.config || {};
    
    // Use provided config or defaults
    const processingTime = config.processing_time_ms || this.processingTimeMs;
    const steps = config.steps || this.steps;
    const progressInterval = config.progress_interval_ms || this.progressIntervalMs;
    
    logger.info(`Starting simulation job ${jobId} for client ${clientId}`);
    
    // Track active job
    const jobInfo = {
      id: jobId,
      client_id: clientId,
      status: 'running',
      progress: 0,
      started_at: new Date().toISOString(),
      payload: message.payload,
      config: { processingTime, steps, progressInterval }
    };
    
    this.activeJobs.set(jobId, jobInfo);
    
    // Send initial acknowledgment
    this.sendMessage(ws, {
      type: 'simulation_started',
      job_id: jobId,
      estimated_completion_ms: processingTime
    });
    
    // Simulate processing with progress updates
    const stepDuration = processingTime / steps;
    let currentStep = 0;
    
    const progressTimer = setInterval(() => {
      if (currentStep >= steps) {
        clearInterval(progressTimer);
        this.completeJob(clientId, ws, jobId);
        return;
      }
      
      currentStep++;
      const progress = Math.round((currentStep / steps) * 100);
      
      // Update job info
      jobInfo.progress = progress;
      
      // Send progress update
      this.sendMessage(ws, {
        type: 'simulation_progress',
        job_id: jobId,
        progress,
        message: `Processing step ${currentStep}/${steps}`,
        current_step: currentStep,
        total_steps: steps,
        estimated_completion_ms: (steps - currentStep) * stepDuration
      });
      
      logger.debug(`Job ${jobId} progress: ${progress}%`);
      
    }, progressInterval);
    
    // Store timer reference for cancellation
    jobInfo.timer = progressTimer;
  }

  async completeJob(clientId, ws, jobId) {
    const jobInfo = this.activeJobs.get(jobId);
    if (!jobInfo) return;
    
    logger.info(`Completing simulation job ${jobId}`);
    
    // Generate results
    const results = {
      iterations: jobInfo.config.steps,
      final_value: Math.random() * 100,
      convergence: true,
      protocol: 'websocket',
      processing_time_ms: Date.now() - new Date(jobInfo.started_at).getTime()
    };
    
    // Generate output file if Azure is enabled
    let outputUrl = null;
    if (this.azureEnabled) {
      try {
        outputUrl = await this.saveToAzure(jobId, results);
      } catch (error) {
        logger.error(`Failed to save to Azure:`, error);
      }
    }
    
    // Move to history
    jobInfo.status = 'completed';
    jobInfo.completed_at = new Date().toISOString();
    jobInfo.results = results;
    jobInfo.output_url = outputUrl;
    this.jobHistory.set(jobId, jobInfo);
    this.activeJobs.delete(jobId);
    
    // Send completion message
    this.sendMessage(ws, {
      type: 'simulation_complete',
      job_id: jobId,
      simulation_id: `sim_ws_${jobId}`,
      results,
      output_url: outputUrl,
      processing_time_ms: results.processing_time_ms
    });
  }

  async cancelJob(clientId, ws, jobId) {
    const jobInfo = this.activeJobs.get(jobId);
    
    if (!jobInfo) {
      this.sendMessage(ws, {
        type: 'error',
        error: 'Job not found',
        job_id: jobId
      });
      return;
    }
    
    if (jobInfo.client_id !== clientId) {
      this.sendMessage(ws, {
        type: 'error',
        error: 'Unauthorized',
        job_id: jobId
      });
      return;
    }
    
    logger.info(`Cancelling job ${jobId}`);
    
    // Clear timer if exists
    if (jobInfo.timer) {
      clearInterval(jobInfo.timer);
    }
    
    // Update status
    jobInfo.status = 'cancelled';
    jobInfo.cancelled_at = new Date().toISOString();
    this.jobHistory.set(jobId, jobInfo);
    this.activeJobs.delete(jobId);
    
    // Send cancellation confirmation
    this.sendMessage(ws, {
      type: 'simulation_cancelled',
      job_id: jobId
    });
  }

  async queryJobStatus(clientId, ws, jobId) {
    const activeJob = this.activeJobs.get(jobId);
    const historicalJob = this.jobHistory.get(jobId);
    
    const job = activeJob || historicalJob;
    
    if (!job) {
      this.sendMessage(ws, {
        type: 'job_status',
        job_id: jobId,
        status: 'unknown'
      });
      return;
    }
    
    this.sendMessage(ws, {
      type: 'job_status',
      job_id: jobId,
      status: job.status,
      progress: job.progress || 0,
      started_at: job.started_at,
      completed_at: job.completed_at,
      cancelled_at: job.cancelled_at,
      results: job.results,
      metadata: {
        client_id: job.client_id,
        config: job.config
      }
    });
  }

  async listJobs(clientId, ws) {
    const clientActiveJobs = Array.from(this.activeJobs.values())
      .filter(job => job.client_id === clientId);
    
    const clientHistoricalJobs = Array.from(this.jobHistory.values())
      .filter(job => job.client_id === clientId)
      .slice(-10); // Last 10 jobs
    
    this.sendMessage(ws, {
      type: 'job_list',
      active_jobs: clientActiveJobs.map(job => ({
        id: job.id,
        status: job.status,
        progress: job.progress,
        started_at: job.started_at
      })),
      completed_jobs: clientHistoricalJobs.map(job => ({
        id: job.id,
        status: job.status,
        completed_at: job.completed_at,
        cancelled_at: job.cancelled_at
      }))
    });
  }

  async getMetrics(clientId, ws) {
    this.sendMessage(ws, {
      type: 'simulation_metrics',
      metrics: {
        connected_clients: this.connectedClients.size,
        active_jobs: this.activeJobs.size,
        completed_jobs: this.jobHistory.size,
        server_uptime: process.uptime(),
        memory_usage: process.memoryUsage(),
        configuration: {
          default_processing_time_ms: this.processingTimeMs,
          default_steps: this.steps,
          default_progress_interval_ms: this.progressIntervalMs
        }
      }
    });
  }

  cancelClientJobs(clientId) {
    // Cancel all active jobs for disconnected client
    this.activeJobs.forEach((job, jobId) => {
      if (job.client_id === clientId) {
        if (job.timer) {
          clearInterval(job.timer);
        }
        job.status = 'cancelled';
        job.cancelled_at = new Date().toISOString();
        job.cancel_reason = 'client_disconnected';
        this.jobHistory.set(jobId, job);
        this.activeJobs.delete(jobId);
        logger.info(`Cancelled job ${jobId} due to client disconnection`);
      }
    });
  }

  async saveToAzure(jobId, results) {
    if (!this.blobServiceClient) return null;
    
    try {
      const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
      await containerClient.createIfNotExists({ access: 'blob' });
      
      const blobName = `simulation-ws/${jobId}/results.json`;
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      
      const content = JSON.stringify(results, null, 2);
      await blockBlobClient.upload(content, Buffer.byteLength(content), {
        blobHTTPHeaders: { blobContentType: 'application/json' }
      });
      
      return blockBlobClient.url;
    } catch (error) {
      logger.error(`Failed to save to Azure:`, error);
      throw error;
    }
  }

  sendMessage(ws, message) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  async start() {
    logger.info(`🚀 STARTING WebSocket Simulation Service on ${this.host}:${this.port}`);
    logger.info(`🔧 SERVICE CONFIG: steps=${this.steps}, processingTime=${this.processingTimeMs}ms, progressInterval=${this.progressIntervalMs}ms`);
    
    return new Promise((resolve) => {
      this.server.listen(this.port, this.host, () => {
        logger.info(`✅ WEBSOCKET SERVICE STARTED - Server running on ws://${this.host}:${this.port}`);
        logger.info(`🎯 WebSocket endpoint ready for connections at ws://${this.host}:${this.port}`);
        logger.info(`Configuration: ${this.steps} steps, ${this.processingTimeMs}ms processing time`);
        logger.info(`Azure Storage: ${this.azureEnabled ? 'Enabled' : 'Disabled'}`);
        resolve();
      });
      
      this.server.on('error', (error) => {
        logger.error(`❌ WEBSOCKET SERVICE FAILED TO START:`, error);
        throw error;
      });
    });
  }

  async stop() {
    // Cancel all active jobs
    this.activeJobs.forEach((job, jobId) => {
      if (job.timer) {
        clearInterval(job.timer);
      }
    });
    
    // Close all WebSocket connections
    this.connectedClients.forEach((ws) => {
      ws.close(1000, 'Server shutting down');
    });
    
    // Close WebSocket server
    this.wss.close();
    
    // Close HTTP server
    return new Promise((resolve) => {
      this.server.close(() => {
        logger.info('Simulation WebSocket Server stopped');
        resolve();
      });
    });
  }
}

// Standalone execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = parseInt(process.env.PORT || process.argv[2] || '8399');
  const server = new SimulationWebsocketService({ port });
  
  server.start().catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });
  
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });
}

export default SimulationWebsocketService;