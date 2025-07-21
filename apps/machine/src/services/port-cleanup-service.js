import { BaseService } from './base-service.js';
import { execa } from 'execa';
import net from 'net';

export default class PortCleanupService extends BaseService {
  constructor(options = {}, config) {
    super('port-cleanup', options);
    this.config = config;
    this.basePort = config.services.comfyui?.basePort || 8188;
    this.gpuCount = config.machine?.gpu?.count || 1;
  }

  async onStart() {
    this.logger.info('Starting port cleanup service...');
    
    // Cleanup ComfyUI ports
    await this.cleanupComfyUIPorts();
    
    // Cleanup any other common AI service ports
    await this.cleanupCommonPorts();
    
    this.logger.info('Port cleanup completed successfully');
  }

  async onStop() {
    // Nothing to stop for cleanup service
    this.logger.info('Port cleanup service stopped');
  }

  async onHealthCheck() {
    return true; // Always healthy since it's a one-time operation
  }

  async cleanupComfyUIPorts() {
    this.logger.info(`Cleaning up ComfyUI ports for ${this.gpuCount} GPUs starting at ${this.basePort}`);
    
    for (let gpu = 0; gpu < this.gpuCount; gpu++) {
      const port = this.basePort + gpu;
      await this.cleanupPort(port, `comfyui-gpu${gpu}`);
    }
  }

  async cleanupCommonPorts() {
    // Common ports that might conflict
    const commonPorts = [8189, 8190, 8191, 8192];
    
    for (const port of commonPorts) {
      if (await this.isPortInUse(port)) {
        await this.cleanupPort(port, 'unknown-service');
      }
    }
  }

  async cleanupPort(port, serviceName) {
    try {
      if (await this.isPortInUse(port)) {
        this.logger.info(`Port ${port} is in use (${serviceName}), cleaning up...`);
        
        const pid = await this.findProcessByPort(port);
        if (pid) {
          this.logger.info(`Killing process ${pid} using port ${port}`);
          await this.killProcess(pid);
          
          // Wait and verify
          await this.sleep(2000);
          
          if (await this.isPortInUse(port)) {
            this.logger.warn(`Port ${port} is still in use after cleanup`);
            return false;
          } else {
            this.logger.info(`Successfully freed port ${port}`);
            return true;
          }
        } else {
          this.logger.warn(`Port ${port} in use but no process found`);
          return false;
        }
      } else {
        this.logger.debug(`Port ${port} is already free`);
        return true;
      }
    } catch (error) {
      this.logger.error(`Failed to cleanup port ${port}:`, error);
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
        this.logger.info(`Process ${pid} still alive, force killing...`);
        process.kill(pid, 'SIGKILL');
        await this.sleep(1000);
      }
    } catch (error) {
      // Process might already be dead
      this.logger.debug(`Error killing process ${pid}:`, error.message);
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

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}