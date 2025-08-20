import { BaseService, ServiceStatus } from './base-service.js';
import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'path';

export default class RedisWorkerService extends BaseService {
  constructor(options, config) {
    super('redis-worker', options);
    this.config = config;
    this.gpu = options.gpu || 0;
    this.index = options.index !== undefined ? options.index : this.gpu;
    this.servicePort = options.servicePort; // Port for connecting to ComfyUI service
    // Use PM2-provided WORKER_ID if available, otherwise generate fallback
    this.workerId = process.env.WORKER_ID || `${config.machine.id}-worker-${this.index}`;
    console.log(`🔴 [REDIS-WORKER-SERVICE-DEBUG] workerId set to: "${this.workerId}" (from PM2: ${!!process.env.WORKER_ID})`);
    console.log(`🔌 [REDIS-WORKER-SERVICE-DEBUG] servicePort set to: ${this.servicePort} (from --service-port argument)`);
    console.log(`🔌 [REDIS-WORKER-SERVICE-DEBUG] GPU index: ${this.gpu}, Worker index: ${this.index}`);
    this.workerDir = `/tmp/worker_gpu${this.gpu}`;
    this.workerProcess = null;
  }

  async onStart() {
    // Ensure worker directory exists
    await this.setupWorkerDirectory();

    // Download worker package if needed
    await this.ensureWorkerPackage();

    // Create environment configuration
    await this.createEnvFile();

    // Start worker process
    await this.startWorkerProcess();
  }

  async onStop() {
    if (this.workerProcess) {
      this.logger.info('Stopping worker process...');
      
      try {
        // Set shutdown reason in environment for worker to read
        process.env.SHUTDOWN_REASON = process.env.SHUTDOWN_REASON || 'Service stop requested';
        
        // Send SIGTERM for graceful shutdown
        this.workerProcess.kill('SIGTERM');
        
        // Wait up to 5 seconds for graceful shutdown
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            if (this.workerProcess && !this.workerProcess.killed) {
              this.logger.warn('Worker did not stop gracefully, forcing...');
              try {
                this.workerProcess.kill('SIGKILL');
              } catch (killError) {
                this.logger.error('Error force killing worker:', killError);
              }
            }
            resolve();
          }, 5000);

          // Wait for the process to complete
          this.workerProcess.then(() => {
            clearTimeout(timeout);
            resolve();
          }).catch((error) => {
            clearTimeout(timeout);
            // Process exit with error is expected during shutdown
            resolve();
          });
        });
      } catch (error) {
        this.logger.error('Error stopping worker process:', error);
      } finally {
        this.workerProcess = null;
      }
    }
  }

  async onHealthCheck() {
    // Check if process is running
    if (!this.workerProcess || this.workerProcess.killed) {
      return false;
    }

    // Check if process is still alive
    try {
      // For execa processes, check if the promise is still pending
      return this.workerProcess.pid > 0;
    } catch (error) {
      this.logger.debug('Health check failed:', error);
      return false;
    }
  }

  async setupWorkerDirectory() {
    this.logger.info(`Setting up worker directory: ${this.workerDir}`);
    
    await fs.ensureDir(this.workerDir);
    await fs.ensureDir(path.join(this.workerDir, 'logs'));
  }

  async ensureWorkerPackage() {
    const workerScript = path.join(this.workerDir, 'redis-direct-worker.js');
    
    // Check if worker already exists in this worker's directory
    if (await fs.pathExists(workerScript)) {
      this.logger.info('Worker package already exists in worker directory');
      return;
    }

    // UNIFIED ARCHITECTURE: Always copy from shared location
    // The entrypoint has already populated /workspace/worker-bundled for both local and remote modes
    await this.copyFromSharedLocation();
  }

  async copyFromSharedLocation() {
    const sharedLocation = '/workspace/worker-bundled';
    
    console.log('');
    console.log('🔄🔄🔄 COPYING WORKER FROM SHARED LOCATION 🔄🔄🔄');
    console.log('📁 Source:', sharedLocation);
    console.log('📁 Target:', this.workerDir);
    console.log('🔧 Unified architecture - same logic for local and remote modes');
    console.log('');
    
    this.logger.info(`Copying worker bundle from shared location: ${sharedLocation}`);
    
    try {
      // Check if shared location exists and has worker files
      if (!await fs.pathExists(sharedLocation)) {
        throw new Error(`Shared worker bundle location does not exist: ${sharedLocation}`);
      }
      
      const workerScript = path.join(sharedLocation, 'redis-direct-worker.js');
      if (!await fs.pathExists(workerScript)) {
        throw new Error(`Worker script not found in shared location: ${workerScript}`);
      }
      
      // Copy shared worker files to this worker's directory
      this.logger.info(`Copying shared worker files to: ${this.workerDir}`);
      await fs.copy(sharedLocation, this.workerDir, {
        overwrite: true,
        dereference: true
      });
      
      // Verify the copy was successful
      const targetWorkerScript = path.join(this.workerDir, 'redis-direct-worker.js');
      if (!await fs.pathExists(targetWorkerScript)) {
        throw new Error(`Worker script not found after copy: ${targetWorkerScript}`);
      }
      
      console.log('');
      console.log('✅✅✅ WORKER COPIED FROM SHARED LOCATION SUCCESSFULLY ✅✅✅');
      console.log('📁 Copied to:', this.workerDir);
      console.log('🚀 Worker ready to start');
      console.log('');
      
      this.logger.info('Worker files copied successfully from shared location');
    } catch (error) {
      console.log('');
      console.log('❌❌❌ FAILED TO COPY WORKER FROM SHARED LOCATION ❌❌❌');
      console.log('🔍 Shared location:', sharedLocation);
      console.log('🔍 Error:', error.message);
      console.log('');
      
      this.logger.error('Failed to copy worker from shared location:', error);
      throw error;
    }
  }

  async createEnvFile() {
    const envPath = path.join(this.workerDir, '.env');
    
    console.log(`🔌🔌🔌 [REDIS-WORKER-ENV-DEBUG] Creating environment file for worker`);
    console.log(`🔌🔌🔌 [REDIS-WORKER-ENV-DEBUG] Service port being set to: ${this.servicePort}`);
    console.log(`🔌🔌🔌 [REDIS-WORKER-ENV-DEBUG] Environment file path: ${envPath}`);
    
    // Debug: Log what we're getting from environment
    this.logger.info('DEBUG: Environment variables for ComfyUI worker:', {
      WORKER_COMFYUI_HOST: process.env.WORKER_COMFYUI_HOST,
      WORKER_COMFYUI_PORT: process.env.WORKER_COMFYUI_PORT,
      WORKER_COMFYUI_USERNAME: process.env.WORKER_COMFYUI_USERNAME,
      WORKER_COMFYUI_PASSWORD: process.env.WORKER_COMFYUI_PASSWORD ? '[SET]' : '[NOT SET]',
      WORKER_COMFYUI_TIMEOUT_SECONDS: process.env.WORKER_COMFYUI_TIMEOUT_SECONDS,
      WORKER_COMFYUI_MAX_CONCURRENT_JOBS: process.env.WORKER_COMFYUI_MAX_CONCURRENT_JOBS
    });
    
    const envContent = {
      HUB_REDIS_URL: this.config.redis.url,
      WORKER_ID: this.workerId,
      MACHINE_ID: this.config.machine.id,
      WORKERS: process.env.WORKERS || 'comfyui-remote:1',
      WORKER_WEBSOCKET_AUTH_TOKEN: this.config.redis.authToken || 'default-token',
      GPU_MEMORY_GB: this.config.machine.gpu.memoryGB,
      GPU_MODEL: this.config.machine.gpu.model,
      CUDA_VISIBLE_DEVICES: this.gpu.toString(),
      NODE_ENV: 'production',
      LOG_LEVEL: this.config.logging.level,
      // Pass through ComfyUI connection settings
      COMFYUI_HOST: 'localhost',
      COMFYUI_PORT: this.servicePort,
      WORKER_COMFYUI_USERNAME: process.env.WORKER_COMFYUI_USERNAME,
      WORKER_COMFYUI_PASSWORD: process.env.WORKER_COMFYUI_PASSWORD,
      WORKER_COMFYUI_TIMEOUT_SECONDS: process.env.WORKER_COMFYUI_TIMEOUT_SECONDS,
      WORKER_COMFYUI_MAX_CONCURRENT_JOBS: process.env.WORKER_COMFYUI_MAX_CONCURRENT_JOBS
    };

    console.log(`🔌🔌🔌 [REDIS-WORKER-ENV-DEBUG] Final environment variables being written:`);
    console.log(`🔌🔌🔌 [REDIS-WORKER-ENV-DEBUG] COMFYUI_HOST: ${envContent.COMFYUI_HOST}`);
    console.log(`🔌🔌🔌 [REDIS-WORKER-ENV-DEBUG] COMFYUI_PORT: ${envContent.COMFYUI_PORT}`);
    
    const envString = Object.entries(envContent)
      .map(([key, value]) => `${key}=${value || ''}`)
      .join('\n');

    await fs.writeFile(envPath, envString);
    this.logger.info('Created environment file', envContent);
    
    console.log(`🔌🔌🔌 [REDIS-WORKER-ENV-DEBUG] Environment file written with COMFYUI_PORT=${envContent.COMFYUI_PORT}`);
  }

  async startWorkerProcess() {
    this.logger.info('Starting worker process...');

    const workerScript = path.join(this.workerDir, 'redis-direct-worker.js');
    
    // Check if script exists
    if (!await fs.pathExists(workerScript)) {
      throw new Error(`Worker script not found: ${workerScript}`);
    }

    // Read the .env file we created and parse environment variables
    const envPath = path.join(this.workerDir, '.env');
    let envVars = {};
    
    if (await fs.pathExists(envPath)) {
      const envContent = await fs.readFile(envPath, 'utf8');
      envVars = envContent.split('\n')
        .filter(line => line.trim() && !line.startsWith('#'))
        .reduce((acc, line) => {
          const [key, ...valueParts] = line.split('=');
          if (key && valueParts.length > 0) {
            acc[key.trim()] = valueParts.join('=').trim();
          }
          return acc;
        }, {});
      
      this.logger.debug('Loaded environment variables from .env file', { 
        workerId: envVars.WORKER_ID,
        machineId: envVars.MACHINE_ID 
      });
    }

    // Start worker process using execa
    try {
      this.workerProcess = execa('node', [workerScript], {
        cwd: this.workerDir,
        env: {
          ...process.env,
          ...envVars, // Load environment variables from .env file
          CUDA_VISIBLE_DEVICES: this.gpu.toString()
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        killSignal: 'SIGTERM'
      });

      // Handle stdout
      this.workerProcess.stdout.on('data', (data) => {
        const lines = data.toString().trim().split('\n');
        lines.forEach(line => {
          if (line) {
            this.logger.info(`[Worker] ${line}`);
          }
        });
      });

      // Handle stderr  
      this.workerProcess.stderr.on('data', (data) => {
        const lines = data.toString().trim().split('\n');
        lines.forEach(line => {
          if (line) {
            this.logger.error(`[Worker] ${line}`);
          }
        });
      });

      // Handle process events
      this.workerProcess.then(() => {
        this.logger.info('Worker process completed normally');
        this.workerProcess = null;
      }).catch((error) => {
        this.logger.warn(`Worker process exited with error: ${error.message}`);
        this.workerProcess = null;
        
        // Emit error if unexpected exit during running state
        if (this.status === ServiceStatus.RUNNING) {
          this.emit('error', new Error(`Worker process failed: ${error.message}`));
        }
      });

      // Wait for worker to be ready
      await this.waitForWorkerReady();
      
      this.logger.info(`Worker process started successfully (PID: ${this.workerProcess.pid})`);
    } catch (error) {
      this.logger.error('Failed to start worker process:', error);
      throw error;
    }
  }

  async waitForWorkerReady() {
    const maxWait = 30000; // 30 seconds
    const checkInterval = 1000;
    const startTime = Date.now();

    this.logger.debug('Waiting for worker to be ready...');

    while (Date.now() - startTime < maxWait) {
      // Check if process died
      if (!this.workerProcess || this.workerProcess.pid <= 0) {
        throw new Error('Worker process died during startup');
      }

      // For now, just wait a bit for the worker to initialize
      // In the future, this could check Redis connection or worker status
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      
      // Simple readiness check - if process is still running after 5 seconds, assume ready
      if (Date.now() - startTime > 5000) {
        this.logger.debug('Worker appears to be ready');
        return;
      }
    }

    throw new Error('Worker failed to become ready within timeout');
  }

  getMetadata() {
    return {
      gpu: this.gpu,
      workerId: this.workerId,
      workerDir: this.workerDir,
      pid: this.workerProcess?.pid || null,
      connectors: this.config.worker.connectors
    };
  }
}