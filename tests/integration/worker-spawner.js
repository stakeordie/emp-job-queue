#!/usr/bin/env node

/**
 * GPU Server Worker Spawner
 * 
 * This script simulates a GPU server that can run multiple workers,
 * one for each GPU. Each worker connects to mock AI services and
 * processes jobs with realistic timing and behavior.
 */

const { spawn } = require('child_process');
const express = require('express');
const { createServer } = require('http');

const SERVER_ID = process.env.SERVER_ID || 'gpu-server-unknown';
const GPU_COUNT = parseInt(process.env.GPU_COUNT || '1');
const WORKERS_CONFIG = JSON.parse(process.env.WORKERS_CONFIG || '[]');

console.log(`🚀 Starting GPU Server: ${SERVER_ID} with ${GPU_COUNT} GPUs`);

class MockAIService {
  constructor(port, serviceName) {
    this.port = port;
    this.serviceName = serviceName;
    this.app = express();
    this.server = null;
    this.setupRoutes();
  }

  setupRoutes() {
    this.app.use(express.json());

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'healthy', service: this.serviceName, port: this.port });
    });

    // Mock job processing endpoint
    this.app.post('/process', async (req, res) => {
      const { jobId, payload } = req.body;
      
      // Simulate realistic processing time based on service
      const processingTime = this.getProcessingTime();
      
      console.log(`🎨 ${this.serviceName}:${this.port} processing job ${jobId} (estimated ${processingTime}ms)`);
      
      // Simulate processing
      await new Promise(resolve => setTimeout(resolve, processingTime));
      
      const result = {
        jobId,
        status: 'completed',
        result: {
          service: this.serviceName,
          processingTimeMs: processingTime,
          output: `Mock ${this.serviceName} output for: ${payload.prompt || 'default prompt'}`,
          generatedAt: new Date().toISOString()
        }
      };

      res.json(result);
    });

    // Service-specific endpoints
    if (this.serviceName === 'comfyui') {
      this.app.post('/prompt', (req, res) => this.handleComfyUIPrompt(req, res));
      this.app.get('/queue', (req, res) => res.json({ queue_running: [], queue_pending: [] }));
    } else if (this.serviceName === 'a1111') {
      this.app.post('/sdapi/v1/txt2img', (req, res) => this.handleA1111Generation(req, res));
      this.app.get('/sdapi/v1/options', (req, res) => res.json({ sd_model_checkpoint: 'mock-model' }));
    } else if (this.serviceName === 'flux') {
      this.app.post('/generate', (req, res) => this.handleFluxGeneration(req, res));
      this.app.get('/models', (req, res) => res.json({ models: ['flux-dev', 'flux-pro', 'flux-schnell'] }));
    }
  }

  getProcessingTime() {
    // Realistic processing times for testing
    const baseTimes = {
      comfyui: 2000,  // 2 seconds
      a1111: 1500,    // 1.5 seconds  
      flux: 3000      // 3 seconds
    };

    const base = baseTimes[this.serviceName] || 2000;
    return Math.floor(base + (Math.random() * 1000)); // Add some variance
  }

  async handleComfyUIPrompt(req, res) {
    const processingTime = this.getProcessingTime();
    await new Promise(resolve => setTimeout(resolve, processingTime));
    
    res.json({
      prompt_id: `mock-comfyui-${Date.now()}`,
      number: 1,
      node_errors: {}
    });
  }

  async handleA1111Generation(req, res) {
    const processingTime = this.getProcessingTime();
    await new Promise(resolve => setTimeout(resolve, processingTime));
    
    res.json({
      images: [`data:image/png;base64,mock-base64-data-${Date.now()}`],
      parameters: req.body,
      info: JSON.stringify({ seed: Math.floor(Math.random() * 1000000) })
    });
  }

  async handleFluxGeneration(req, res) {
    const processingTime = this.getProcessingTime();
    await new Promise(resolve => setTimeout(resolve, processingTime));
    
    res.json({
      id: `flux-${Date.now()}`,
      status: 'completed',
      image_url: `http://mock-storage/flux-${Date.now()}.png`,
      metadata: req.body
    });
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log(`✅ Mock ${this.serviceName} service running on port ${this.port}`);
          resolve();
        }
      });
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
    }
  }
}

class WorkerManager {
  constructor() {
    this.workers = [];
    this.mockServices = [];
    this.isShuttingDown = false;
  }

  async startMockServices() {
    // Determine which services we need based on worker configs
    const requiredServices = new Set();
    const servicesPorts = {
      comfyui: [8188, 8190],
      a1111: [7860, 7861],
      flux: [8189, 8191]
    };

    WORKERS_CONFIG.forEach(config => {
      config.services.forEach(service => requiredServices.add(service));
    });

    // Start mock services
    for (const service of requiredServices) {
      for (const port of servicesPorts[service] || []) {
        const mockService = new MockAIService(port, service);
        await mockService.start();
        this.mockServices.push(mockService);
      }
    }
  }

  async startWorkers() {
    console.log(`🔧 Starting ${WORKERS_CONFIG.length} workers...`);

    for (const workerConfig of WORKERS_CONFIG) {
      const worker = await this.spawnWorker(workerConfig);
      this.workers.push(worker);
    }

    console.log(`✅ All ${this.workers.length} workers started successfully`);
  }

  async spawnWorker(config) {
    return new Promise((resolve, reject) => {
      const env = {
        ...process.env,
        WORKER_ID: config.worker_id,
        GPU_ID: config.gpu_id.toString(),
        GPU_MEMORY_GB: config.gpu_memory_gb.toString(),
        GPU_MODEL: config.gpu_model,
        SERVICES: config.services.join(','),
        MODELS: JSON.stringify(config.models),
        CUSTOMER_ACCESS: JSON.stringify(config.customer_access || {}),
        MOCK_MODE: 'true',
        LOG_LEVEL: 'info'
      };

      // Set mock service URLs for each service
      config.services.forEach(service => {
        const urlKey = `mock_service_url_${service}`;
        const url = config[urlKey] || config.mock_service_url || `http://localhost:8188`;
        env[`${service.toUpperCase()}_URL`] = url;
      });

      console.log(`🔄 Spawning worker: ${config.worker_id} on GPU ${config.gpu_id} (${config.gpu_model})`);

      const worker = spawn('node', ['dist/worker/index.js'], {
        env,
        stdio: ['inherit', 'pipe', 'pipe']
      });

      // Log worker output with worker ID prefix
      worker.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter(line => line.trim());
        lines.forEach(line => {
          console.log(`[${config.worker_id}] ${line}`);
        });
      });

      worker.stderr.on('data', (data) => {
        console.error(`[${config.worker_id}] ERROR: ${data}`);
      });

      worker.on('close', (code) => {
        if (!this.isShuttingDown) {
          console.log(`⚠️  Worker ${config.worker_id} exited with code ${code}`);
        }
      });

      worker.on('error', (error) => {
        console.error(`❌ Worker ${config.worker_id} failed to start:`, error);
        reject(error);
      });

      // Give worker time to start
      setTimeout(() => {
        resolve({
          process: worker,
          config: config
        });
      }, 2000);
    });
  }

  async shutdown() {
    this.isShuttingDown = true;
    console.log('🛑 Shutting down GPU server...');

    // Stop all workers
    for (const worker of this.workers) {
      worker.process.kill('SIGTERM');
    }

    // Stop mock services
    for (const service of this.mockServices) {
      service.stop();
    }

    console.log('✅ GPU server shutdown complete');
  }
}

async function main() {
  const manager = new WorkerManager();

  // Handle graceful shutdown
  process.on('SIGTERM', () => manager.shutdown());
  process.on('SIGINT', () => manager.shutdown());

  try {
    // Start mock AI services first
    await manager.startMockServices();

    // Wait a bit for services to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Start all workers for this GPU server
    await manager.startWorkers();

    console.log(`🎯 GPU Server ${SERVER_ID} ready with ${WORKERS_CONFIG.length} workers`);

    // Keep the process alive
    process.on('exit', () => {
      manager.shutdown();
    });

  } catch (error) {
    console.error('❌ Failed to start GPU server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}