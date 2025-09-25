/**
 * Ollama Daemon Installer
 *
 * Simple installer for daemon services:
 * 1. Install binary
 * 2. Start daemon
 * 3. Wait for health check
 * 4. Download models
 *
 * This pattern works for: Ollama, vLLM, Redis, PostgreSQL, etc.
 */

import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'path';
import { createSafeLogger } from '../utils/safe-logger.js';
import http from 'http';

export class OllamaDaemonInstaller {
  constructor(serviceConfig = {}) {
    this.serviceConfig = serviceConfig;
    this.logger = createSafeLogger('ollama-daemon-installer');

    // Basic configuration
    this.workspacePath = process.env.WORKSPACE_PATH || '/workspace';
    this.ollamaPath = path.join(this.workspacePath, 'ollama');
    this.port = parseInt(process.env.OLLAMA_BASE_PORT || '11434');
    this.host = process.env.OLLAMA_HOST || 'localhost';

    // Installation configuration - resolve environment variables
    const installerConfig = serviceConfig.installer_config || {};

    // Helper function to resolve environment variables in config values
    const resolveEnvVars = (configValue, fallback) => {
      if (!configValue) return fallback;

      // Handle ${VAR:-default} pattern
      const envVarMatch = configValue.match(/^\$\{([^}]+)\}$/);
      if (envVarMatch) {
        const [fullMatch, envExpr] = envVarMatch;
        const [envVar, defaultValue] = envExpr.split(':-');
        return process.env[envVar] || defaultValue || fallback;
      }

      return configValue;
    };

    // Resolve models configuration
    const modelsConfig = resolveEnvVars(installerConfig.default_models, process.env.OLLAMA_DEFAULT_MODELS || 'llama3.2:1b');
    this.defaultModels = modelsConfig.split(',').map(m => m.trim());

    // Resolve model storage path
    this.modelStoragePath = resolveEnvVars(installerConfig.model_storage_path, path.join(this.ollamaPath, 'models'));

    // Resolve timeouts with proper parsing
    this.timeouts = {
      install: parseInt(resolveEnvVars(installerConfig.install_timeout, '300')) * 1000,  // 5 minutes
      modelDownload: parseInt(resolveEnvVars(installerConfig.model_download_timeout, '900')) * 1000, // 15 minutes
      healthCheck: 30000,
      startup: 60000
    };

    this.daemonProcess = null;
  }

  /**
   * Main installation entry point
   */
  async install() {
    const startTime = Date.now();
    try {
      console.log('🚀🚀🚀 === OLLAMA DAEMON INSTALLER STARTING ===');
      console.log(`🔧 Configuration: host=${this.host}, port=${this.port}, workspace=${this.workspacePath}`);
      console.log(`🔧 Models to download: ${this.defaultModels.join(', ')}`);
      console.log(`🔧 Model storage path: ${this.modelStoragePath}`);
      console.log(`🔧 Timeouts: install=${this.timeouts.install}ms, modelDownload=${this.timeouts.modelDownload}ms`);

      this.logger.info('🚀🚀🚀 === OLLAMA DAEMON INSTALLER STARTING ===');
      this.logger.info(`🔧 Configuration: host=${this.host}, port=${this.port}, workspace=${this.workspacePath}`);
      this.logger.info(`🔧 Models to download: ${this.defaultModels.join(', ')}`);
      this.logger.info(`🔧 Model storage path: ${this.modelStoragePath}`);
      this.logger.info(`🔧 Timeouts: install=${this.timeouts.install}ms, modelDownload=${this.timeouts.modelDownload}ms`);

      // 1. Setup directories
      this.logger.info('📋 STEP 1/4: Setting up directories...');
      await this.setupDirectories();
      this.logger.info('✅ STEP 1/4: Directory setup completed');

      // 2. Install Ollama binary
      this.logger.info('📋 STEP 2/4: Installing Ollama binary...');
      await this.installOllama();
      this.logger.info('✅ STEP 2/4: Binary installation completed');

      // 3. Start daemon
      this.logger.info('📋 STEP 3/4: Starting daemon...');
      await this.startDaemon();
      this.logger.info('✅ STEP 3/4: Daemon startup completed');

      // 4. Download models
      this.logger.info('📋 STEP 4/4: Downloading models...');
      await this.downloadModels();
      this.logger.info('✅ STEP 4/4: Model downloads completed');

      const duration = Date.now() - startTime;
      this.logger.info(`🎉🎉🎉 === OLLAMA DAEMON INSTALLATION COMPLETED SUCCESSFULLY ===`);
      this.logger.info(`⏱️ Total installation time: ${Math.round(duration / 1000)}s`);
      return true;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`💥💥💥 === OLLAMA DAEMON INSTALLATION FAILED ===`);
      this.logger.error(`❌ Error: ${error.message}`);
      this.logger.error(`❌ Stack: ${error.stack}`);
      this.logger.error(`⏱️ Failed after: ${Math.round(duration / 1000)}s`);
      throw error;
    }
  }

  /**
   * Setup directories
   */
  async setupDirectories() {
    this.logger.info('📁📁📁 Setting up Ollama directories...');

    try {
      this.logger.info(`📁 Creating main Ollama directory: ${this.ollamaPath}`);
      await fs.ensureDir(this.ollamaPath);
      this.logger.info(`✅ Main directory created: ${this.ollamaPath}`);

      this.logger.info(`📁 Creating model storage directory: ${this.modelStoragePath}`);
      await fs.ensureDir(this.modelStoragePath);
      this.logger.info(`✅ Model storage directory created: ${this.modelStoragePath}`);

      const logsPath = path.join(this.ollamaPath, 'logs');
      this.logger.info(`📁 Creating logs directory: ${logsPath}`);
      await fs.ensureDir(logsPath);
      this.logger.info(`✅ Logs directory created: ${logsPath}`);

      this.logger.info(`🔧 Setting permissions on ${this.ollamaPath} to 755`);
      await fs.chmod(this.ollamaPath, 0o755);
      this.logger.info(`✅ Permissions set successfully`);

      // Verify all directories exist
      const directories = [this.ollamaPath, this.modelStoragePath, logsPath];
      for (const dir of directories) {
        const exists = await fs.pathExists(dir);
        this.logger.info(`🔍 Verification: ${dir} exists: ${exists}`);
        if (!exists) {
          throw new Error(`Directory verification failed: ${dir} does not exist`);
        }
      }

      this.logger.info('🎉 All directories created and verified successfully');
    } catch (error) {
      this.logger.error(`💥 Directory setup failed: ${error.message}`);
      throw new Error(`Failed to setup directories: ${error.message}`);
    }
  }

  /**
   * Install Ollama binary
   */
  async installOllama() {
    this.logger.info('📦📦📦 Installing Ollama binary...');

    try {
      // Check if already installed
      this.logger.info('🔍 Checking if Ollama is already installed...');
      if (await this.isOllamaInstalled()) {
        const versionResult = await execa('ollama', ['--version'], { timeout: 5000 });
        this.logger.info(`✅ Ollama is already installed: ${versionResult.stdout}`);
        return;
      }
      this.logger.info('📥 Ollama not found, proceeding with installation');

      // Download install script
      console.log('🌐 EXECUTING: curl -fsSL https://ollama.ai/install.sh');
      this.logger.info('🌐 Downloading Ollama install script from https://ollama.ai/install.sh');
      const downloadStartTime = Date.now();
      const curlResult = await execa('curl', ['-fsSL', 'https://ollama.ai/install.sh'], {
        timeout: this.timeouts.install,
        stdio: 'pipe'
      });
      const downloadDuration = Date.now() - downloadStartTime;
      console.log(`✅ Install script downloaded (${Math.round(downloadDuration / 1000)}s, ${curlResult.stdout.length} bytes)`);
      this.logger.info(`✅ Install script downloaded successfully (${Math.round(downloadDuration / 1000)}s, ${curlResult.stdout.length} bytes)`);

      // Execute install script
      console.log('🔧 EXECUTING: sh (install script)');
      this.logger.info('🔧 Executing Ollama install script...');
      const installEnv = {
        ...process.env,
        OLLAMA_INSTALL_DIR: this.ollamaPath
      };
      this.logger.info(`🔧 Install environment: OLLAMA_INSTALL_DIR=${this.ollamaPath}`);

      const installStartTime = Date.now();
      const installResult = await execa('sh', [], {
        input: curlResult.stdout,
        timeout: this.timeouts.install,
        env: installEnv
      });
      const installDuration = Date.now() - installStartTime;
      console.log(`✅ Install script executed (${Math.round(installDuration / 1000)}s)`);

      this.logger.info(`✅ Install script executed successfully (${Math.round(installDuration / 1000)}s)`);
      if (installResult.stdout) {
        this.logger.info(`📋 Install stdout: ${installResult.stdout}`);
      }
      if (installResult.stderr) {
        this.logger.info(`📋 Install stderr: ${installResult.stderr}`);
      }

      // Verify installation
      this.logger.info('🔍 Verifying Ollama installation...');
      if (await this.isOllamaInstalled()) {
        const versionResult = await execa('ollama', ['--version'], { timeout: 5000 });
        this.logger.info(`🎉 Ollama successfully installed and verified: ${versionResult.stdout}`);
      } else {
        throw new Error('Ollama installation completed but binary not found in PATH');
      }

    } catch (error) {
      this.logger.error(`💥 Ollama installation failed: ${error.message}`);
      if (error.stderr) {
        this.logger.error(`💥 Error stderr: ${error.stderr}`);
      }
      if (error.stdout) {
        this.logger.error(`💥 Error stdout: ${error.stdout}`);
      }
      throw new Error(`Ollama installation failed: ${error.message}`);
    }
  }

  /**
   * Start Ollama daemon
   */
  async startDaemon() {
    this.logger.info('🚀🚀🚀 Starting Ollama daemon...');

    try {
      // Check if already running
      this.logger.info('🔍 Checking if Ollama daemon is already running...');
      if (await this.isDaemonRunning()) {
        this.logger.info('✅ Ollama daemon is already running and responding to health checks');
        return;
      }
      this.logger.info('📥 Ollama daemon not running, starting new instance');

      // Start daemon process
      this.logger.info('🔄 Starting Ollama daemon process...');
      await this.startOllamaDaemon();
      this.logger.info('✅ Ollama daemon process started');

      // Wait for daemon to be ready
      this.logger.info('⏳ Waiting for Ollama daemon to become ready...');
      await this.waitForDaemonReady();
      this.logger.info('✅ Ollama daemon is ready and responding to requests');

      this.logger.info('🎉 Ollama daemon started successfully');
    } catch (error) {
      this.logger.error(`💥 Failed to start Ollama daemon: ${error.message}`);
      throw new Error(`Failed to start Ollama daemon: ${error.message}`);
    }
  }

  /**
   * Start the ollama serve process
   */
  async startOllamaDaemon() {
    const logFile = path.join(this.ollamaPath, 'logs', 'ollama.log');

    try {
      const env = {
        ...process.env,
        OLLAMA_HOST: `${this.host}:${this.port}`,
        OLLAMA_MODELS: this.modelStoragePath,
        CUDA_VISIBLE_DEVICES: process.env.CUDA_VISIBLE_DEVICES || '',
      };

      this.logger.info(`🔧 Daemon environment configuration:`);
      this.logger.info(`   - OLLAMA_HOST: ${env.OLLAMA_HOST}`);
      this.logger.info(`   - OLLAMA_MODELS: ${env.OLLAMA_MODELS}`);
      this.logger.info(`   - CUDA_VISIBLE_DEVICES: ${env.CUDA_VISIBLE_DEVICES}`);
      this.logger.info(`   - Log file: ${logFile}`);

      console.log(`🆔 EXECUTING: ollama serve (host=${this.host}:${this.port})`);
      this.logger.info(`🚀 Spawning 'ollama serve' process on ${this.host}:${this.port}`);

      // Use spawn to start daemon in background
      const { spawn } = await import('child_process');
      this.daemonProcess = spawn('ollama', ['serve'], {
        env,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      console.log(`🆔 EXECUTING: ollama serve (PID: ${this.daemonProcess.pid})`);
      this.logger.info(`🆔 Daemon process spawned with PID: ${this.daemonProcess.pid}`);

      // Setup logging
      this.logger.info(`📋 Setting up log streaming to ${logFile}`);
      const logStream = fs.createWriteStream(logFile, { flags: 'a' });

      // Add timestamps to logs
      logStream.write(`\n=== OLLAMA DAEMON START ${new Date().toISOString()} ===\n`);

      this.daemonProcess.stdout.pipe(logStream);
      this.daemonProcess.stderr.pipe(logStream);

      // Also log to console for immediate feedback
      this.daemonProcess.stdout.on('data', (data) => {
        this.logger.info(`[OLLAMA-STDOUT] ${data.toString().trim()}`);
      });

      this.daemonProcess.stderr.on('data', (data) => {
        this.logger.info(`[OLLAMA-STDERR] ${data.toString().trim()}`);
      });

      // Handle process events
      this.daemonProcess.on('error', (error) => {
        this.logger.error(`💥 Daemon process error: ${error.message}`);
      });

      this.daemonProcess.on('exit', (code, signal) => {
        this.logger.info(`🔄 Daemon process exited with code ${code}, signal ${signal}`);
      });

      // Allow process to run independently
      this.daemonProcess.unref();

      // Give process a moment to start
      await new Promise(resolve => setTimeout(resolve, 1000));

      this.logger.info('✅ Ollama daemon process started and logging configured');
    } catch (error) {
      this.logger.error(`💥 Failed to start ollama serve: ${error.message}`);
      throw new Error(`Failed to start ollama serve: ${error.message}`);
    }
  }

  /**
   * Download default models
   */
  async downloadModels() {
    this.logger.info('📥📥📥 Downloading default models...');
    this.logger.info(`📋 Models to download: ${this.defaultModels.length} total`);
    this.logger.info(`⏱️ Timeout per model: ${Math.round(this.timeouts.modelDownload / 1000)}s`);

    let successCount = 0;
    let failCount = 0;
    const downloadTimes = [];

    for (let i = 0; i < this.defaultModels.length; i++) {
      const model = this.defaultModels[i];
      let downloadStartTime = Date.now();

      try {
        console.log(`📥 EXECUTING: ollama pull ${model} [${i + 1}/${this.defaultModels.length}]`);
        this.logger.info(`📥 [${i + 1}/${this.defaultModels.length}] Starting download: ${model}`);

        const result = await execa('ollama', ['pull', model], {
          timeout: this.timeouts.modelDownload,
          env: {
            ...process.env,
            OLLAMA_HOST: `${this.host}:${this.port}`
          }
        });
        const downloadDuration = Date.now() - downloadStartTime;
        downloadTimes.push(downloadDuration);

        console.log(`✅ Model downloaded: ${model} (${Math.round(downloadDuration / 1000)}s)`);
        this.logger.info(`✅ [${i + 1}/${this.defaultModels.length}] Model downloaded successfully: ${model} (${Math.round(downloadDuration / 1000)}s)`);
        if (result.stdout) {
          this.logger.info(`📋 Download output: ${result.stdout}`);
        }
        successCount++;

      } catch (error) {
        const downloadDuration = Date.now() - downloadStartTime;
        failCount++;
        console.log(`❌ Model download failed: ${model} (${Math.round(downloadDuration / 1000)}s) - ${error.message}`);
        this.logger.warn(`⚠️ [${i + 1}/${this.defaultModels.length}] Failed to download model ${model} after ${Math.round(downloadDuration / 1000)}s`);
        this.logger.warn(`⚠️ Error: ${error.message}`);
        if (error.stderr) {
          this.logger.warn(`⚠️ Error stderr: ${error.stderr}`);
        }
        if (error.stdout) {
          this.logger.warn(`⚠️ Error stdout: ${error.stdout}`);
        }
        // Continue with other models - don't fail entire installation
      }
    }

    // Summary
    const totalDownloadTime = downloadTimes.reduce((sum, time) => sum + time, 0);
    const avgDownloadTime = downloadTimes.length > 0 ? totalDownloadTime / downloadTimes.length : 0;

    this.logger.info('📊 Model download summary:');
    this.logger.info(`   - Total models: ${this.defaultModels.length}`);
    this.logger.info(`   - Successful: ${successCount}`);
    this.logger.info(`   - Failed: ${failCount}`);
    this.logger.info(`   - Total download time: ${Math.round(totalDownloadTime / 1000)}s`);
    this.logger.info(`   - Average per model: ${Math.round(avgDownloadTime / 1000)}s`);

    if (successCount > 0) {
      this.logger.info('🎉 Model downloads completed with at least one success');
    } else {
      this.logger.warn('⚠️ No models were downloaded successfully, but continuing installation');
    }
  }

  /**
   * Check if Ollama binary is installed
   */
  async isOllamaInstalled() {
    try {
      await execa('ollama', ['--version'], { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if daemon is running
   */
  async isDaemonRunning() {
    try {
      const response = await this.makeHealthRequest();
      return response.statusCode === 200;
    } catch {
      return false;
    }
  }

  /**
   * Wait for daemon to be ready
   */
  async waitForDaemonReady() {
    const maxRetries = 30; // 30 seconds
    let retries = 0;

    this.logger.info('⏳⏳⏳ Waiting for Ollama daemon to be ready...');
    this.logger.info(`🔍 Health check endpoint: http://${this.host}:${this.port}/api/tags`);
    this.logger.info(`⏱️ Timeout: ${maxRetries}s (checking every 1s)`);

    const startTime = Date.now();

    while (retries < maxRetries) {
      try {
        this.logger.info(`🔍 [${retries + 1}/${maxRetries}] Checking daemon health...`);
        const isRunning = await this.isDaemonRunning();

        if (isRunning) {
          const duration = Date.now() - startTime;
          this.logger.info(`🎉 Ollama daemon is ready and responding! (took ${Math.round(duration / 1000)}s)`);
          return;
        } else {
          this.logger.info(`❌ Health check failed, daemon not yet ready`);
        }
      } catch (error) {
        this.logger.info(`❌ Health check error: ${error.message}`);
      }

      retries++;
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (retries % 5 === 0) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        this.logger.info(`⏳ Still waiting... (${retries}/${maxRetries}) - ${elapsed}s elapsed`);
      }
    }

    const duration = Date.now() - startTime;
    const errorMsg = `Ollama daemon failed to become ready within ${maxRetries}s timeout (waited ${Math.round(duration / 1000)}s)`;
    this.logger.error(`💥 ${errorMsg}`);
    throw new Error(errorMsg);
  }

  /**
   * Make health check HTTP request
   */
  async makeHealthRequest() {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const req = http.request({
        hostname: this.host,
        port: this.port,
        path: '/api/tags',
        method: 'GET',
        timeout: this.timeouts.healthCheck
      }, (res) => {
        const duration = Date.now() - startTime;
        this.logger.info(`🔍 Health check response: ${res.statusCode} (${duration}ms)`);

        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          this.logger.info(`📋 Response body: ${body.slice(0, 200)}${body.length > 200 ? '...' : ''}`);
          resolve({ statusCode: res.statusCode, body });
        });
      });

      req.on('error', (error) => {
        const duration = Date.now() - startTime;
        this.logger.info(`❌ Health check failed after ${duration}ms: ${error.message}`);
        reject(error);
      });

      req.on('timeout', () => {
        const duration = Date.now() - startTime;
        this.logger.info(`⏱️ Health check timeout after ${duration}ms`);
        reject(new Error('Health check timeout'));
      });

      req.end();
    });
  }
}

export default OllamaDaemonInstaller;