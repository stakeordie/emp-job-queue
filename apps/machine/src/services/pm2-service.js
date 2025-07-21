import { BaseService } from './base-service.js';
import PM2ServiceManager from '../lib/pm2-manager.cjs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * PM2 Service wrapper for managing services through PM2
 * This allows the orchestrator to manage services via PM2 instead of directly
 */
export default class PM2Service extends BaseService {
  constructor(serviceName, options, serviceConfig) {
    super(serviceName, options);
    this.serviceConfig = serviceConfig;
    this.pm2Manager = new PM2ServiceManager();
    this.pm2Name = this.generatePM2Name(serviceName, options);
  }

  generatePM2Name(serviceName, options) {
    if (options.gpu !== undefined) {
      return `${serviceName}-gpu${options.gpu}`;
    }
    return serviceName;
  }

  async onStart() {
    this.logger.info(`Starting ${this.serviceName} via PM2...`);

    // Build PM2 configuration
    const pm2Config = {
      script: this.serviceConfig.script,
      cwd: this.serviceConfig.cwd || '/service-manager',
      instances: this.serviceConfig.instances || 1,
      max_memory_restart: this.serviceConfig.maxMemory || '1G',
      error_file: `/workspace/logs/${this.pm2Name}-error.log`,
      out_file: `/workspace/logs/${this.pm2Name}-out.log`,
      merge_logs: true,
      time: true,
      autorestart: this.serviceConfig.autorestart !== false,
      watch: this.serviceConfig.watch || false,
      env: {
        ...process.env,
        ...this.serviceConfig.env,
        SERVICE_NAME: this.serviceName,
        PM2_MANAGED: 'true'
      }
    };

    // Add GPU-specific environment variables
    if (this.options.gpu !== undefined) {
      pm2Config.env.GPU_ID = this.options.gpu;
      pm2Config.env.CUDA_VISIBLE_DEVICES = this.options.gpu;
    }

    try {
      // Start the service via PM2
      await this.pm2Manager.startService(this.pm2Name, pm2Config);
      
      // Wait for service to be ready
      await this.waitForServiceReady();
      
      this.logger.info(`${this.serviceName} started successfully via PM2`);
    } catch (error) {
      this.logger.error(`Failed to start ${this.serviceName} via PM2:`, error);
      throw error;
    }
  }

  async onStop() {
    this.logger.info(`Stopping ${this.serviceName} via PM2...`);
    
    try {
      await this.pm2Manager.stopService(this.pm2Name);
      this.logger.info(`${this.serviceName} stopped successfully`);
    } catch (error) {
      this.logger.error(`Failed to stop ${this.serviceName}:`, error);
      throw error;
    }
  }

  async onHealthCheck() {
    try {
      const status = await this.pm2Manager.getServiceStatus(this.pm2Name);
      
      if (status.status === 'not_found') {
        return false;
      }

      // Check if process is online
      if (status.status !== 'online') {
        this.logger.warn(`${this.serviceName} is not online: ${status.status}`);
        return false;
      }

      // Additional health checks can be added here
      // For example, checking if service-specific port is responding
      if (this.serviceConfig.healthCheck) {
        return await this.performServiceHealthCheck();
      }

      return true;
    } catch (error) {
      this.logger.error(`Health check failed for ${this.serviceName}:`, error);
      return false;
    }
  }

  async performServiceHealthCheck() {
    // Override in subclasses for service-specific health checks
    return true;
  }

  async waitForServiceReady() {
    const maxRetries = 30;
    const retryDelay = 2000;

    for (let i = 0; i < maxRetries; i++) {
      const status = await this.pm2Manager.getServiceStatus(this.pm2Name);
      
      if (status.status === 'online') {
        // Additional readiness check
        if (this.serviceConfig.readinessCheck) {
          const ready = await this.checkServiceReadiness();
          if (ready) {
            return;
          }
        } else {
          // If no readiness check defined, assume ready when online
          return;
        }
      }

      this.logger.debug(`Waiting for ${this.serviceName} to be ready... (${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }

    throw new Error(`${this.serviceName} failed to become ready within timeout`);
  }

  async checkServiceReadiness() {
    // Override in subclasses for service-specific readiness checks
    return true;
  }

  async restart() {
    this.logger.info(`Restarting ${this.serviceName} via PM2...`);
    await this.pm2Manager.restartService(this.pm2Name);
  }

  async reload() {
    this.logger.info(`Reloading ${this.serviceName} via PM2 (zero-downtime)...`);
    await this.pm2Manager.reloadService(this.pm2Name);
  }

  async scale(instances) {
    this.logger.info(`Scaling ${this.serviceName} to ${instances} instances...`);
    await this.pm2Manager.scaleService(this.pm2Name, instances);
  }

  async getLogs(lines = 50) {
    return await this.pm2Manager.getServiceLogs(this.pm2Name, lines);
  }

  async getMetrics() {
    const status = await this.pm2Manager.getServiceStatus(this.pm2Name);
    return {
      cpu: status.cpu,
      memory: status.memory,
      uptime: status.uptime,
      restarts: status.restarts,
      pid: status.pid
    };
  }
}

/**
 * Factory function to create PM2-managed services
 */
export function createPM2Service(serviceName, serviceConfig) {
  return class extends PM2Service {
    constructor(options) {
      super(serviceName, options, serviceConfig);
    }

    // Override health check if provided
    async performServiceHealthCheck() {
      if (serviceConfig.healthCheckFn) {
        return await serviceConfig.healthCheckFn(this);
      }
      return super.performServiceHealthCheck();
    }

    // Override readiness check if provided
    async checkServiceReadiness() {
      if (serviceConfig.readinessCheckFn) {
        return await serviceConfig.readinessCheckFn(this);
      }
      return super.checkServiceReadiness();
    }
  };
}