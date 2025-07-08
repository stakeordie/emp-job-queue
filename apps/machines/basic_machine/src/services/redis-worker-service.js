import { BaseService, ServiceStatus } from './base-service.js';
import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import * as tar from 'tar';
import pRetry from 'p-retry';

export default class RedisWorkerService extends BaseService {
  constructor(options, config) {
    super('redis-worker', options);
    this.config = config;
    this.gpu = options.gpu || 0;
    this.workerId = `${config.worker.idPrefix}-gpu${this.gpu}`;
    this.workerDir = `/tmp/worker_gpu${this.gpu}`;
    this.workerProcess = null;
    // Use GitHub releases URL for worker package
    this.downloadUrl = config.worker.downloadUrl || 'https://github.com/stakeordie/emp-job-queue/releases/latest/download/emp-job-queue-worker.tar.gz';
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
        // Send SIGTERM for graceful shutdown
        this.workerProcess.kill('SIGTERM');
        
        // Wait up to 10 seconds for graceful shutdown
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
          }, 10000);

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
    
    if (await fs.pathExists(workerScript)) {
      this.logger.info('Worker package already exists');
      return;
    }

    await this.downloadWorkerPackage();
  }

  async downloadWorkerPackage() {
    this.logger.info(`Downloading worker package from: ${this.downloadUrl}`);
    
    const tempFile = path.join('/tmp', `worker-${this.gpu}.tar.gz`);

    try {
      // Clean up any existing temp file
      await fs.remove(tempFile).catch(() => {});
      
      // Download with retry using wget for better reliability
      await pRetry(async () => {
        this.logger.debug(`Downloading to: ${tempFile}`);
        
        const { stdout, stderr } = await execa('wget', [
          '--no-check-certificate',
          '--timeout=60',
          '--tries=3',
          '-O', tempFile,
          this.downloadUrl
        ], {
          timeout: 120000
        });
        
        this.logger.debug('Download completed', { stdout: stdout.slice(0, 200) });
        
        // Verify file was downloaded
        const stats = await fs.stat(tempFile);
        if (stats.size === 0) {
          throw new Error('Downloaded file is empty');
        }
        
        this.logger.debug(`Downloaded file size: ${stats.size} bytes`);
      }, {
        retries: 3,
        onFailedAttempt: (error) => {
          this.logger.warn(`Download attempt ${error.attemptNumber} failed: ${error.message}`);
        }
      });

      // Extract package
      this.logger.info('Extracting worker package...');
      
      // Ensure worker directory is clean
      await fs.emptyDir(this.workerDir);
      await fs.ensureDir(path.join(this.workerDir, 'logs'));
      
      // Extract with tar
      await tar.extract({
        file: tempFile,
        cwd: this.workerDir,
        strip: 1,
        preservePaths: false
      });

      // Clean up temp file
      await fs.remove(tempFile);
      
      // Verify extraction
      const workerScript = path.join(this.workerDir, 'redis-direct-worker.js');
      if (!await fs.pathExists(workerScript)) {
        throw new Error('Worker script not found after extraction');
      }
      
      this.logger.info('Worker package downloaded and extracted successfully');
    } catch (error) {
      // Clean up on error
      await fs.remove(tempFile).catch(() => {});
      throw new Error(`Failed to download worker package: ${error.message}`);
    }
  }

  async createEnvFile() {
    const envPath = path.join(this.workerDir, '.env');
    
    const envContent = {
      HUB_REDIS_URL: this.config.redis.url,
      WORKER_ID: this.workerId,
      WORKER_CONNECTORS: this.config.worker.connectors.join(','),
      WORKER_WEBSOCKET_AUTH_TOKEN: this.config.redis.authToken || 'default-token',
      GPU_MEMORY_GB: this.config.machine.gpu.memoryGB || 16,
      GPU_MODEL: this.config.machine.gpu.model || 'RTX 4090',
      CUDA_VISIBLE_DEVICES: this.gpu.toString(),
      NODE_ENV: 'production',
      LOG_LEVEL: this.config.logging.level || 'info'
    };

    const envString = Object.entries(envContent)
      .map(([key, value]) => `${key}=${value || ''}`)
      .join('\n');

    await fs.writeFile(envPath, envString);
    this.logger.debug('Created environment file', { workerId: this.workerId, gpu: this.gpu });
  }

  async startWorkerProcess() {
    this.logger.info('Starting worker process...');

    const workerScript = path.join(this.workerDir, 'redis-direct-worker.js');
    
    // Check if script exists
    if (!await fs.pathExists(workerScript)) {
      throw new Error(`Worker script not found: ${workerScript}`);
    }

    // Start worker process using execa
    try {
      this.workerProcess = execa('node', [workerScript], {
        cwd: this.workerDir,
        env: {
          ...process.env,
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
      connectors: this.config.worker.connectors,
      downloadUrl: this.downloadUrl
    };
  }
}