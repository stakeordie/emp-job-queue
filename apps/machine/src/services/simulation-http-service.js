// ComfyUI-compatible Simulation Server
// Express app that mimics ComfyUI's REST API and WebSocket interface

import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../utils/logger.js';
import path from 'path';
import fs from 'fs-extra';
import { BlobServiceClient } from '@azure/storage-blob';

const logger = createLogger('simulation-server');

export class SimulationHttpService {
  constructor(options = {}) {
    this.port = options.port || 8188;
    this.host = options.host || 'localhost';
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    
    // Simulation configuration
    this.processingTimeMs = parseInt(process.env.SIMULATION_PROCESSING_TIME || '15') * 1000;
    this.steps = parseInt(process.env.SIMULATION_STEPS || '10');
    this.progressIntervalMs = parseInt(process.env.SIMULATION_PROGRESS_INTERVAL_MS || '500');
    
    // Job tracking
    this.activeJobs = new Map();
    this.jobHistory = new Map();
    this.connectedClients = new Set();
    
    // Azure storage setup
    this.azureEnabled = !!(process.env.AZURE_STORAGE_ACCOUNT && process.env.AZURE_STORAGE_KEY);
    this.blobServiceClient = this.azureEnabled ? BlobServiceClient.fromConnectionString(
      `DefaultEndpointsProtocol=https;AccountName=${process.env.AZURE_STORAGE_ACCOUNT};AccountKey=${process.env.AZURE_STORAGE_KEY};EndpointSuffix=core.windows.net`
    ) : null;
    
    // Use test container when in test mode
    const isTestMode = process.env.STORAGE_TEST_MODE === 'true';
    this.containerName = isTestMode 
      ? (process.env.CLOUD_STORAGE_TEST_CONTAINER || 'emprops-share-test')
      : (process.env.CLOUD_STORAGE_CONTAINER || 'simulation-outputs');
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    // CORS for development
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });
    
    // Logging
    this.app.use((req, res, next) => {
      logger.debug(`${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    // Root health check endpoint (for simple GET requests)
    this.app.get('/', (req, res) => {
      res.json({
        status: 'ok',
        service: 'simulation-server',
        port: this.port,
        active_jobs: this.activeJobs.size,
        uptime: process.uptime(),
        timestamp: Date.now()
      });
    });

    // Dedicated health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'simulation-server',
        port: this.port,
        active_jobs: this.activeJobs.size,
        total_jobs_processed: this.jobHistory.size,
        uptime: process.uptime(),
        memory_usage: process.memoryUsage(),
        timestamp: Date.now()
      });
    });

    // System stats endpoint (ComfyUI compatibility)
    this.app.get('/system_stats', (req, res) => {
      res.json({
        system: {
          os: process.platform,
          python_version: 'Simulation',
          embedded_python: false
        },
        devices: [
          {
            name: 'Simulation GPU',
            type: 'simulation',
            index: 0,
            vram_total: 24 * 1024 * 1024 * 1024, // 24GB
            vram_free: 20 * 1024 * 1024 * 1024    // 20GB free
          }
        ],
        queue_remaining: this.activeJobs.size,
        queue_size: this.activeJobs.size
      });
    });

    // Object info endpoint (model information)
    this.app.get('/object_info', (req, res) => {
      res.json({
        CheckpointLoaderSimple: {
          input: {
            required: {
              ckpt_name: [
                [
                  'simulation-model-v1.safetensors',
                  'simulation-model-v2.safetensors',
                  'test-model.ckpt',
                  'stable-diffusion-v1-5.safetensors'
                ]
              ]
            }
          },
          output: ['MODEL', 'CLIP', 'VAE'],
          category: 'loaders'
        }
      });
    });

    // Queue status endpoint
    this.app.get('/queue', (req, res) => {
      const queueRunning = Array.from(this.activeJobs.values()).map(job => ({
        prompt: job.workflow,
        prompt_id: job.prompt_id,
        number: job.number,
        node_errors: {}
      }));
      
      res.json({
        queue_running: queueRunning,
        queue_pending: []
      });
    });

    // Job submission endpoint
    this.app.post('/prompt', async (req, res) => {
      try {
        const { prompt, extra_data } = req.body;
        
        if (!prompt) {
          return res.status(400).json({ error: 'No prompt provided' });
        }

        const prompt_id = uuidv4();
        const client_id = extra_data?.client_id || 'default';
        
        const job = {
          prompt_id,
          client_id,
          workflow: prompt,
          number: this.activeJobs.size + 1,
          status: 'queued',
          created_at: Date.now(),
          outputs: {},
          error: null
        };

        this.activeJobs.set(prompt_id, job);
        
        // Send queue update to WebSocket clients
        this.broadcastQueueUpdate();
        
        // Start processing job asynchronously
        this.processJob(job);
        
        res.json({
          prompt_id,
          number: job.number,
          node_errors: {}
        });
        
      } catch (error) {
        logger.error('Error submitting job:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Job history endpoint
    this.app.get('/history/:prompt_id', (req, res) => {
      const { prompt_id } = req.params;
      
      const job = this.jobHistory.get(prompt_id);
      if (!job) {
        return res.json({});
      }

      res.json({
        [prompt_id]: {
          prompt: job.workflow,
          outputs: job.outputs,
          status: job.status,
          execution_time: job.execution_time,
          error: job.error
        }
      });
    });

    // Full history endpoint
    this.app.get('/history', (req, res) => {
      const history = {};
      for (const [prompt_id, job] of this.jobHistory) {
        history[prompt_id] = {
          prompt: job.workflow,
          outputs: job.outputs,
          status: job.status,
          execution_time: job.execution_time,
          error: job.error
        };
      }
      res.json(history);
    });

    // Image view endpoint (for generated images)
    this.app.get('/view', async (req, res) => {
      const { filename, subfolder, type } = req.query;
      
      try {
        // Check if this is a simulation file and we have Azure storage
        if (filename && filename.startsWith('simulation_') && this.azureEnabled) {
          // Look for the file in job history to get Azure URL
          for (const [jobId, job] of this.jobHistory) {
            if (job.outputs && job.outputs['1'] && job.outputs['1'].images) {
              const image = job.outputs['1'].images.find(img => img.filename === filename);
              if (image && image.azure_url) {
                // Redirect to Azure URL
                return res.redirect(image.azure_url);
              }
            }
          }
        }
        
        // Fallback: generate a simple placeholder
        const now = new Date();
        const placeholder = `Simulation File: ${filename}
Subfolder: ${subfolder || 'none'}
Type: ${type || 'output'}
Generated: ${now.toISOString()}
Local Time: ${now.toLocaleString()}

Note: This is a simulation placeholder file.
${this.azureEnabled ? 'Azure storage is enabled.' : 'Azure storage is not configured.'}
`;
        
        res.type('text/plain').send(placeholder);
      } catch (error) {
        logger.error('Error serving view endpoint:', error);
        res.status(500).json({ error: 'Failed to serve file' });
      }
    });

    // Interrupt endpoint
    this.app.post('/interrupt', (req, res) => {
      // Cancel all active jobs
      for (const [prompt_id, job] of this.activeJobs) {
        this.cancelJob(prompt_id);
      }
      res.json({ message: 'All jobs interrupted' });
    });

    // HTTP Connector compatible endpoint (for refactored simulation connector)
    this.app.post('/process', async (req, res) => {
      try {
        const { job_id, job_type, payload, simulation_config } = req.body;
        
        if (!job_id) {
          return res.status(400).json({ error: 'No job_id provided' });
        }

        // Convert to ComfyUI-style prompt
        const prompt = {
          simulation_job: {
            job_id,
            job_type,
            payload,
            config: simulation_config || {}
          }
        };

        const prompt_id = job_id; // Use job_id as prompt_id for traceability
        const client_id = 'http-connector';
        
        const job = {
          prompt_id,
          client_id,
          workflow: prompt,
          number: this.activeJobs.size + 1,
          status: 'queued',
          created_at: Date.now(),
          outputs: {},
          error: null,
          http_request: true // Mark as HTTP request for synchronous response
        };

        this.activeJobs.set(prompt_id, job);
        
        // Send queue update to WebSocket clients
        this.broadcastQueueUpdate();
        
        // Start processing job asynchronously (don't wait!)
        this.processJob(job);
        
        // Return immediately with job ID for polling
        res.json({
          simulation_id: prompt_id,
          status: 'processing',
          message: 'Job submitted for processing'
        });
        
      } catch (error) {
        logger.error('Error processing HTTP job:', error);
        res.status(500).json({ error: error.message });
      }
    });
  }

  setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      logger.info('WebSocket client connected');
      this.connectedClients.add(ws);
      
      // Send initial queue state
      this.sendQueueUpdate(ws);
      
      ws.on('close', () => {
        logger.info('WebSocket client disconnected');
        this.connectedClients.delete(ws);
      });
      
      ws.on('error', (error) => {
        logger.error('WebSocket error:', error);
        this.connectedClients.delete(ws);
      });
    });
  }

  // Synchronous version for HTTP requests
  async processJobSync(job) {
    await this.processJob(job);
    return job;
  }

  async processJob(job) {
    const startTime = Date.now();
    
    try {
      logger.info(`Starting simulation job ${job.prompt_id}`);
      
      // Send job started event
      this.broadcastMessage({
        type: 'execution_start',
        data: {
          prompt_id: job.prompt_id,
          timestamp: Date.now()
        }
      });
      
      // Simulate processing with progress updates
      const stepDuration = this.processingTimeMs / this.steps;
      
      for (let step = 0; step <= this.steps; step++) {
        const progress = Math.round((step / this.steps) * 100);
        
        // Send progress update
        this.broadcastMessage({
          type: 'progress',
          data: {
            prompt_id: job.prompt_id,
            value: progress,
            max: 100,
            node: step < this.steps ? `Step ${step + 1}` : 'Complete'
          }
        });
        
        if (step < this.steps) {
          await this.sleep(stepDuration);
        }
      }
      
      // Generate simulated output with Azure upload
      const filename = `simulation_${job.prompt_id}.txt`;
      const now = new Date();
      const mockContent = `Simulation Output Generated
=========================

Job ID: ${job.prompt_id}
Created: ${now.toISOString()}
Local Time: ${now.toLocaleString()}
Processing Time: ${Date.now() - startTime}ms
Steps Completed: ${this.steps}
Simulation Model: simulation-model-v1
Status: Success

Workflow Input:
${JSON.stringify(job.workflow, null, 2)}

Result:
- Iterations: ${this.steps}
- Final Value: ${Math.random() * 100}
- Convergence: true
- Processing Duration: ${Date.now() - startTime}ms

Generated at: ${now.toISOString()}
`;

      // Save to Azure and get URL
      const azureUrl = await this.saveMockFileToAzure(filename, job.prompt_id, mockContent);
      
      const outputs = {
        '1': {
          images: [
            {
              filename: filename,
              subfolder: '',
              type: 'output',
              azure_url: azureUrl // Include Azure URL in output
            }
          ]
        }
      };
      
      const execution_time = Date.now() - startTime;
      
      // Complete the job
      job.status = 'success';
      job.outputs = outputs;
      job.execution_time = execution_time;
      
      // Move to history
      this.jobHistory.set(job.prompt_id, { ...job });
      this.activeJobs.delete(job.prompt_id);
      
      // Send completion event
      this.broadcastMessage({
        type: 'execution_success',
        data: {
          prompt_id: job.prompt_id,
          timestamp: Date.now(),
          node_errors: {}
        }
      });
      
      this.broadcastQueueUpdate();
      
      logger.info(`Simulation job ${job.prompt_id} completed in ${execution_time}ms`);
      
    } catch (error) {
      logger.error(`Simulation job ${job.prompt_id} failed:`, error);
      
      const execution_time = Date.now() - startTime;
      
      job.status = 'error';
      job.error = error.message;
      job.execution_time = execution_time;
      
      // Move to history
      this.jobHistory.set(job.prompt_id, { ...job });
      this.activeJobs.delete(job.prompt_id);
      
      // Send error event
      this.broadcastMessage({
        type: 'execution_error',
        data: {
          prompt_id: job.prompt_id,
          timestamp: Date.now(),
          exception_message: error.message,
          exception_type: 'SimulationError'
        }
      });
      
      this.broadcastQueueUpdate();
    }
  }

  cancelJob(prompt_id) {
    const job = this.activeJobs.get(prompt_id);
    if (job) {
      job.status = 'cancelled';
      job.error = 'Job cancelled';
      
      this.jobHistory.set(prompt_id, { ...job });
      this.activeJobs.delete(prompt_id);
      
      this.broadcastMessage({
        type: 'execution_interrupted',
        data: {
          prompt_id,
          timestamp: Date.now()
        }
      });
      
      this.broadcastQueueUpdate();
    }
  }

  broadcastMessage(message) {
    const messageStr = JSON.stringify(message);
    this.connectedClients.forEach(ws => {
      if (ws.readyState === ws.OPEN) {
        ws.send(messageStr);
      }
    });
  }

  broadcastQueueUpdate() {
    this.connectedClients.forEach(ws => {
      this.sendQueueUpdate(ws);
    });
  }

  sendQueueUpdate(ws) {
    if (ws.readyState === ws.OPEN) {
      const queueRunning = Array.from(this.activeJobs.values()).map(job => ({
        prompt: job.workflow,
        prompt_id: job.prompt_id,
        number: job.number
      }));
      
      ws.send(JSON.stringify({
        type: 'status',
        data: {
          status: {
            queue_running: queueRunning,
            queue_pending: []
          }
        }
      }));
    }
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async saveMockFileToAzure(filename, jobId, content) {
    if (!this.azureEnabled) {
      logger.warn('Azure storage not configured, skipping file upload');
      return null;
    }

    try {
      // Create container if it doesn't exist
      const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
      await containerClient.createIfNotExists({ access: 'blob' });

      // Create blob name with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const blobName = `simulation-outputs/${timestamp}/${filename}`;
      
      // Get blob client
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      
      // Upload text content
      await blockBlobClient.upload(content, content.length, {
        blobHTTPHeaders: { blobContentType: 'text/plain' }
      });
      
      const azureUrl = blockBlobClient.url;
      logger.info(`Mock file uploaded to Azure: ${azureUrl}`);
      
      return azureUrl;
    } catch (error) {
      logger.error('Failed to upload mock file to Azure:', error);
      return null;
    }
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, this.host, (error) => {
        if (error) {
          reject(error);
        } else {
          logger.info(`Simulation server running on http://${this.host}:${this.port}`);
          logger.info(`WebSocket server running on ws://${this.host}:${this.port}`);
          resolve();
        }
      });
    });
  }

  async stop() {
    return new Promise((resolve) => {
      // Cancel all active jobs
      for (const [prompt_id] of this.activeJobs) {
        this.cancelJob(prompt_id);
      }
      
      // Close WebSocket connections
      this.connectedClients.forEach(ws => {
        ws.close();
      });
      
      // Close HTTP server
      this.server.close(() => {
        logger.info('Simulation server stopped');
        resolve();
      });
    });
  }
}