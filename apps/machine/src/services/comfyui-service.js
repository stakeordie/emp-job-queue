import { BaseService } from './base-service.js';
import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'path';
import http from 'http';
import net from 'net';

export default class ComfyUIService extends BaseService {
  constructor(options = {}, config) {
    super('comfyui', options);
    this.config = config;
    this.gpu = options.gpu || 0;
    this.port = config.services.comfyui.basePort + this.gpu;
    this.workDir = process.env.WORKSPACE_DIR ? `${process.env.WORKSPACE_DIR}/ComfyUI` : `/workspace/ComfyUI`;
    this.process = null;
    this.pidFile = path.join(this.workDir, `comfyui-gpu${this.gpu}.pid`);
    this.mockFile = path.join(this.workDir, `comfyui-gpu${this.gpu}.mock`);
    this.argsFile = path.join(this.workDir, `comfyui-gpu${this.gpu}.args`);
    this.logFile = path.join(this.workDir, 'logs', `output-gpu${this.gpu}.log`);
    this.testMode = process.env.TEST_MODE === 'true';
    
    // GPU_MODE system: "actual" (real GPU) or "mock" (CPU mode)
    const gpuMode = process.env.GPU_MODE || 'actual';
    this.isGpuModeActual = gpuMode === 'actual';
    this.isGpuModeMock = gpuMode === 'mock';
    
    // Legacy support for old environment variables
    this.mockGpu = process.env.MOCK_GPU === '1'; 
    const legacyCpuMode = process.env.COMFYUI_CPU_MODE === 'true';
    
    // CPU mode logic: mock GPU mode OR legacy settings OR test mode always uses CPU
    this.cpuMode = this.isGpuModeMock || legacyCpuMode || this.testMode || this.mockGpu;
    
    this.logger.info(`🎮 GPU Mode Configuration:`, {
      GPU_MODE: gpuMode,
      isActual: this.isGpuModeActual,
      isMock: this.isGpuModeMock,
      cpuMode: this.cpuMode,
      testMode: this.testMode,
      gpu: this.gpu
    });
    
    this.comfyArgs = process.env.COMFY_ARGS || '';
  }

  async onStart() {
    this.logger.info(`Starting ComfyUI service for GPU ${this.gpu}`, {
      port: this.port,
      workDir: this.workDir,
      testMode: this.testMode
    });

    // Setup directories and logs
    await this.setupDirectories();
    await this.setupLogs();

    // Check if already running
    if (await this.isAlreadyRunning()) {
      this.logger.info('ComfyUI is already running');
      return;
    }

    // Ensure port is free
    await this.ensurePortFree();

    // Validate working directory
    await this.validateWorkingDirectory();

    // Start the process
    await this.startProcess();

    // Wait for service to be ready
    await this.waitForReady();

    this.logger.info(`ComfyUI service started successfully on port ${this.port}`);
  }

  async onStop() {
    this.logger.info('Stopping ComfyUI service...');

    // Stop process using port
    await this.stopProcessByPort();

    // Stop process using PID file
    await this.stopProcessByPid();

    // Cleanup files
    await this.cleanupFiles();

    this.logger.info('ComfyUI service stopped successfully');
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
      await fs.ensureDir(this.workDir);
      await fs.ensureDir(path.join(this.workDir, 'logs'));
      await fs.chmod(this.workDir, 0o755);
      await fs.chmod(path.join(this.workDir, 'logs'), 0o755);
    } catch (error) {
      throw new Error(`Failed to setup directories: ${error.message}`);
    }
  }

  async setupLogs() {
    try {
      // Create log file if it doesn't exist
      await fs.ensureFile(this.logFile);
      await fs.chmod(this.logFile, 0o644);
    } catch (error) {
      throw new Error(`Failed to setup logs: ${error.message}`);
    }
  }

  async isAlreadyRunning() {
    try {
      // Check PID file
      const pid = await this.readPidFile();
      if (pid && await this.isProcessRunning(pid)) {
        // Check if port is in use
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
      
      // Try to kill the process using this port
      const pid = await this.findProcessByPort(this.port);
      if (pid) {
        this.logger.info(`Killing process ${pid} that is using port ${this.port}`);
        await this.killProcess(pid);
        
        // Wait a moment and check again
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

  async validateWorkingDirectory() {
    try {
      await fs.access(this.workDir);
      await fs.access(path.join(this.workDir, 'main.py'));
    } catch (error) {
      throw new Error(`Working directory ${this.workDir} does not exist or main.py not found`);
    }
  }

  async startProcess() {
    // Build command
    const cmd = this.buildCommand();
    
    this.logger.info(`Starting ComfyUI with command: ${cmd.join(' ')}`);

    // Set up environment
    const env = {
      ...process.env,
      PYTHONUNBUFFERED: '1'
    };

    // Add GPU settings if not in CPU mode (i.e., actual GPU mode)
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
      this.logger.info(`ComfyUI process exited with code ${exitCode}, signal ${signal}`);
      this.process = null;
      this.emit('process-exit', { code: exitCode, signal });
    });

    this.process.on('error', (error) => {
      this.logger.error('ComfyUI process error:', error);
      this.emit('error', error);
    });

    // Redirect output to log file and console
    const logStream = fs.createWriteStream(this.logFile, { flags: 'a' });
    this.process.stdout.pipe(logStream);
    this.process.stderr.pipe(logStream);
    
    // Also log to console for debugging
    this.process.stdout.on('data', (data) => {
      this.logger.debug(`ComfyUI stdout: ${data.toString().trim()}`);
    });
    
    this.process.stderr.on('data', (data) => {
      this.logger.debug(`ComfyUI stderr: ${data.toString().trim()}`);
    });

    // Save PID and metadata
    await this.savePidFile(this.process.pid);
    await this.saveMetadataFiles();
  }

  buildCommand() {
    const cmd = [
      'python',
      'main.py',
      '--listen',
      '0.0.0.0',
      '--port',
      this.port.toString()
    ];

    // Add mode-specific args
    if (this.testMode || this.mockGpu || this.cpuMode) {
      this.logger.info(`Adding --cpu flag (Test Mode: ${this.testMode}, CPU Mode: ${this.cpuMode})`);
      cmd.push('--cpu');
    } else {
      // Add GPU device specification for GPU mode
      this.logger.info(`Adding --cuda-device ${this.gpu} for GPU mode`);
      cmd.push('--cuda-device', this.gpu.toString());
    }

    // Add additional args if provided and not conflicting
    if (this.comfyArgs && !cmd.includes('--cpu')) {
      this.logger.info(`Adding additional args: ${this.comfyArgs}`);
      cmd.push(...this.comfyArgs.split(' ').filter(arg => arg.trim()));
    } else if (this.comfyArgs && cmd.includes('--cpu')) {
      this.logger.info('Skipping COMFY_ARGS (--cpu already set)');
    }

    return cmd;
  }

  async waitForReady() {
    const maxAttempts = 60;
    const intervalMs = 1000;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        // Check if process is still running
        if (!this.process || this.process.killed || this.process.exitCode !== null) {
          throw new Error('Process exited during startup');
        }

        // Check if HTTP endpoint is responsive
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
        await this.onStop(); // Cleanup failed start
        throw new Error(`Service startup failed: ${error.message}`);
      }
    }

    await this.onStop(); // Cleanup timeout
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

    try {
      await fs.remove(this.mockFile);
    } catch (error) {
      // File might not exist
    }

    try {
      await fs.remove(this.argsFile);
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

  async saveMetadataFiles() {
    // Save GPU mode metadata (consistent with new GPU_MODE system)
    await fs.writeFile(this.mockFile, this.cpuMode ? '1' : '0');
    if (this.comfyArgs) {
      await fs.writeFile(this.argsFile, this.comfyArgs);
    }
  }

  async isProcessRunning(pid) {
    try {
      process.kill(pid, 0); // Signal 0 checks if process exists
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
      // Try graceful shutdown first
      process.kill(pid, 'SIGTERM');
      await this.sleep(2000);

      // Check if still running
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
        path: '/',
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
      gpuMode: process.env.GPU_MODE || 'actual',
      cpuMode: this.cpuMode,
      isGpuModeActual: this.isGpuModeActual,
      isGpuModeMock: this.isGpuModeMock,
      // Legacy fields for compatibility
      mockGpu: this.mockGpu,
      comfyArgs: this.comfyArgs,
      pid: this.process ? this.process.pid : null,
      processExitCode: this.process ? this.process.exitCode : null
    };
  }
}