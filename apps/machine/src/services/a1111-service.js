import { BaseService } from './base-service.js';
import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'path';
import http from 'http';
import net from 'net';

export default class A1111Service extends BaseService {
  constructor(options = {}, config) {
    super('a1111', options);
    this.config = config;
    this.gpu = options.gpu || 0;
    this.port = (config.services?.a1111?.basePort || 7860) + this.gpu;
    this.workDir = process.env.WORKSPACE_DIR ? `${process.env.WORKSPACE_DIR}/stable-diffusion-webui` : `/workspace/stable-diffusion-webui`;
    this.process = null;
    this.pidFile = path.join(this.workDir, `a1111-gpu${this.gpu}.pid`);
    this.logFile = path.join(this.workDir, 'logs', `output-gpu${this.gpu}.log`);
    this.testMode = process.env.TEST_MODE === 'true';
    
    // GPU_MODE system: "actual" (real GPU) or "mock" (CPU mode)
    const gpuMode = process.env.GPU_MODE || 'actual';
    this.isGpuModeActual = gpuMode === 'actual';
    this.isGpuModeMock = gpuMode === 'mock';
    
    // CPU mode logic
    this.cpuMode = this.isGpuModeMock || this.testMode;
    
    // Model paths configuration
    this.comfyuiCheckpointsPath = process.env.COMFYUI_CHECKPOINTS_PATH || '/workspace/ComfyUI/models/checkpoints';
    
    this.logger.info(`🎮 A1111 Configuration:`, {
      GPU_MODE: gpuMode,
      cpuMode: this.cpuMode,
      gpu: this.gpu,
      port: this.port,
      workDir: this.workDir,
      comfyuiCheckpointsPath: this.comfyuiCheckpointsPath
    });
    
    this.a1111Args = process.env.A1111_ARGS || '';
  }

  async onStart() {
    this.logger.info(`Starting A1111 service for GPU ${this.gpu}`, {
      port: this.port,
      workDir: this.workDir,
      testMode: this.testMode
    });

    // Setup directories and installation
    await this.setupDirectories();
    await this.setupLogs();
    await this.ensureInstallation();
    await this.setupModels();

    // Check if already running
    if (await this.isAlreadyRunning()) {
      this.logger.info('A1111 is already running');
      return;
    }

    // Ensure port is free
    await this.ensurePortFree();

    // Start the process
    await this.startProcess();

    // Wait for service to be ready
    await this.waitForReady();

    this.logger.info(`A1111 service started successfully on port ${this.port}`);
  }

  async onStop() {
    this.logger.info('Stopping A1111 service...');

    // Stop process using port
    await this.stopProcessByPort();

    // Stop process using PID file
    await this.stopProcessByPid();

    // Cleanup files
    await this.cleanupFiles();

    this.logger.info('A1111 service stopped successfully');
  }

  async onHealthCheck() {
    // Check if process is running
    if (!this.process || this.process.killed || this.process.exitCode !== null) {
      return false;
    }

    // Check if port is responsive
    try {
      const response = await this.makeHealthRequest();
      return response.statusCode === 200;
    } catch (error) {
      this.logger.debug('Health check failed:', error.message);
      return false;
    }
  }

  async setupDirectories() {
    try {
      const baseDir = process.env.WORKSPACE_DIR || '/workspace';
      await fs.ensureDir(baseDir);
      await fs.ensureDir(path.join(this.workDir, 'logs'));
      await fs.chmod(baseDir, 0o755);
    } catch (error) {
      throw new Error(`Failed to setup directories: ${error.message}`);
    }
  }

  async setupLogs() {
    try {
      await fs.ensureFile(this.logFile);
      await fs.chmod(this.logFile, 0o644);
    } catch (error) {
      throw new Error(`Failed to setup logs: ${error.message}`);
    }
  }

  async ensureInstallation() {
    try {
      // Check if A1111 is already installed
      if (await fs.pathExists(path.join(this.workDir, 'webui.py'))) {
        this.logger.info('A1111 installation found, skipping clone');
        return;
      }

      this.logger.info('Installing A1111...');
      
      // Clone A1111 with specific commit hash
      await execa('git', ['clone', 'https://github.com/AUTOMATIC1111/stable-diffusion-webui.git', this.workDir]);
      
      // Reset to specific commit hash
      await execa('git', ['reset', '--hard', 'cf2772fab0af5573da775e7437e6acdca424f26e'], {
        cwd: this.workDir
      });

      // Install Python requirements
      await execa('pip', ['install', '-r', 'requirements_versions.txt'], {
        cwd: this.workDir
      });

      this.logger.info('A1111 installation completed');
    } catch (error) {
      throw new Error(`Failed to install A1111: ${error.message}`);
    }
  }

  async setupModels() {
    try {
      const modelsDir = path.join(this.workDir, 'models');
      
      // Check if models directory already exists and has content
      if (await fs.pathExists(modelsDir)) {
        const entries = await fs.readdir(modelsDir);
        if (entries.length > 0) {
          this.logger.info('Models directory already exists with content, skipping setup');
          return;
        }
        // Remove empty directory
        await fs.remove(modelsDir);
      }

      this.logger.info('Setting up A1111 models from sd_models repo...');

      // Clone sd_models repo to A1111's models directory
      await execa('git', ['clone', 'git@github.com:stakeordie/sd_models.git', modelsDir], {
        env: {
          ...process.env,
          GIT_SSH_COMMAND: 'ssh -o StrictHostKeyChecking=no'
        }
      });

      // Remove .git directory to save space
      await fs.remove(path.join(modelsDir, '.git'));

      this.logger.info('A1111 models setup completed');
    } catch (error) {
      this.logger.error('Failed to setup models:', error);
      // Don't throw here - A1111 can still run without the custom models
      this.logger.warn('Continuing without custom models - A1111 will use default model paths');
    }
  }

  async isAlreadyRunning() {
    try {
      const pid = await this.readPidFile();
      if (pid && await this.isProcessRunning(pid)) {
        if (await this.isPortInUse(this.port)) {
          return true;
        }
      }
    } catch (error) {
      // PID file doesn't exist or process is not running
    }
    return false;
  }

  async ensurePortFree() {
    if (await this.isPortInUse(this.port)) {
      this.logger.warn(`Port ${this.port} is already in use, attempting to clear it...`);
      
      const pid = await this.findProcessByPort(this.port);
      if (pid) {
        this.logger.info(`Killing process ${pid} that is using port ${this.port}`);
        await this.killProcess(pid);
        
        await this.sleep(2000);
        
        if (await this.isPortInUse(this.port)) {
          throw new Error(`Port ${this.port} is still in use after cleanup attempt`);
        }
        
        this.logger.info(`Successfully cleared port ${this.port}`);
      } else {
        throw new Error(`Port ${this.port} is in use but no process found`);
      }
    }
  }

  async startProcess() {
    const cmd = this.buildCommand();
    
    this.logger.info(`Starting A1111 with command: ${cmd.join(' ')}`);

    // Set up environment
    const env = {
      ...process.env,
      PYTHONUNBUFFERED: '1'
    };

    // Add GPU settings if not in CPU mode
    if (!this.cpuMode) {
      env.CUDA_VISIBLE_DEVICES = this.gpu.toString();
    }

    // Start process using execa
    this.process = execa(cmd[0], cmd.slice(1), {
      cwd: this.workDir,
      env,
      stdout: 'pipe',
      stderr: 'pipe',
      detached: false
    });

    // Handle process events
    this.process.on('exit', (exitCode, signal) => {
      this.logger.info(`A1111 process exited with code ${exitCode}, signal ${signal}`);
      this.process = null;
      this.emit('process-exit', { code: exitCode, signal });
    });

    this.process.on('error', (error) => {
      this.logger.error('A1111 process error:', error);
      this.emit('error', error);
    });

    // Redirect output to log file and console
    const logStream = fs.createWriteStream(this.logFile, { flags: 'a' });
    this.process.stdout.pipe(logStream);
    this.process.stderr.pipe(logStream);
    
    // Save PID
    await this.savePidFile(this.process.pid);
  }

  buildCommand() {
    const cmd = [
      'python',
      'webui.py',
      '--listen',
      '--port',
      this.port.toString(),
      '--api',
      '--nowebui'  // Run in API-only mode
    ];

    // Point checkpoints to ComfyUI's directory
    cmd.push('--ckpt-dir', this.comfyuiCheckpointsPath);

    // Add mode-specific args
    if (this.cpuMode) {
      this.logger.info(`Adding --skip-torch-cuda-test and --use-cpu for CPU mode`);
      cmd.push('--skip-torch-cuda-test', '--use-cpu', 'all');
    } else {
      // Add GPU-specific optimizations
      this.logger.info(`Adding GPU optimizations for GPU ${this.gpu}`);
      cmd.push('--xformers');
    }

    // Add additional args if provided
    if (this.a1111Args) {
      this.logger.info(`Adding additional args: ${this.a1111Args}`);
      cmd.push(...this.a1111Args.split(' ').filter(arg => arg.trim()));
    }

    return cmd;
  }

  async waitForReady() {
    const maxAttempts = 120; // A1111 can take longer to start
    const intervalMs = 1000;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        if (!this.process || this.process.killed || this.process.exitCode !== null) {
          throw new Error('Process exited during startup');
        }

        try {
          const response = await this.makeHealthRequest();
          if (response.statusCode === 200) {
            this.logger.info(`Service is ready on port ${this.port}`);
            return;
          }
        } catch (error) {
          // Service not ready yet, continue waiting
        }

        await this.sleep(intervalMs);
      } catch (error) {
        await this.onStop();
        throw new Error(`Service startup failed: ${error.message}`);
      }
    }

    await this.onStop();
    throw new Error('Service startup timeout');
  }

  async stopProcessByPort() {
    try {
      const pid = await this.findProcessByPort(this.port);
      if (pid) {
        this.logger.info(`Found process ${pid} using port ${this.port}`);
        await this.killProcess(pid);
      }
    } catch (error) {
      this.logger.debug('No process found using port:', error.message);
    }
  }

  async stopProcessByPid() {
    try {
      const pid = await this.readPidFile();
      if (pid && await this.isProcessRunning(pid)) {
        this.logger.info(`Stopping process (PID: ${pid})`);
        await this.killProcess(pid);
      }
    } catch (error) {
      this.logger.debug('No PID file or process not running:', error.message);
    }
  }

  async cleanupFiles() {
    try {
      await fs.remove(this.pidFile);
    } catch (error) {
      // File might not exist
    }
  }

  async readPidFile() {
    try {
      const pidStr = await fs.readFile(this.pidFile, 'utf8');
      return parseInt(pidStr.trim());
    } catch (error) {
      return null;
    }
  }

  async savePidFile(pid) {
    await fs.writeFile(this.pidFile, pid.toString());
  }

  async isProcessRunning(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return false;
    }
  }

  async isPortInUse(port) {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.listen(port, () => {
        server.close(() => resolve(false));
      });
      server.on('error', () => resolve(true));
    });
  }

  async findProcessByPort(port) {
    try {
      const { stdout } = await execa('lsof', ['-ti', `:${port}`]);
      const pid = parseInt(stdout.trim());
      return pid || null;
    } catch (error) {
      return null;
    }
  }

  async killProcess(pid) {
    try {
      process.kill(pid, 'SIGTERM');
      await this.sleep(3000);

      if (await this.isProcessRunning(pid)) {
        this.logger.info('Process still alive, force killing...');
        process.kill(pid, 'SIGKILL');
        await this.sleep(1000);
      }
    } catch (error) {
      // Process might already be dead
    }
  }

  async makeHealthRequest() {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost',
        port: this.port,
        path: '/sdapi/v1/options',
        method: 'GET',
        timeout: 5000
      }, (res) => {
        resolve(res);
      });

      req.on('error', reject);
      req.on('timeout', () => reject(new Error('Health check timeout')));
      req.end();
    });
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getMetadata() {
    return {
      gpu: this.gpu,
      port: this.port,
      workDir: this.workDir,
      comfyuiCheckpointsPath: this.comfyuiCheckpointsPath,
      gpuMode: process.env.GPU_MODE || 'actual',
      cpuMode: this.cpuMode,
      a1111Args: this.a1111Args,
      pid: this.process ? this.process.pid : null,
      processExitCode: this.process ? this.process.exitCode : null,
      commitHash: 'cf2772fab0af5573da775e7437e6acdca424f26e'
    };
  }
}