import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger.js';

export const ServiceStatus = {
  STOPPED: 'stopped',
  STARTING: 'starting',
  RUNNING: 'running',
  STOPPING: 'stopping',
  ERROR: 'error',
  RESTARTING: 'restarting'
};

export class BaseService extends EventEmitter {
  constructor(name, options = {}) {
    super();
    this.name = name;
    this.options = options;
    this.status = ServiceStatus.STOPPED;
    this.startTime = null;
    this.restartCount = 0;
    this.lastError = null;
    this.logger = createLogger(name, { gpu: options.gpu });
  }

  /**
   * Start the service
   * @returns {Promise<void>}
   */
  async start() {
    if (this.status === ServiceStatus.RUNNING) {
      this.logger.warn('Service is already running');
      return;
    }

    this.logger.info('Starting service...');
    this.status = ServiceStatus.STARTING;
    this.emit('status-change', this.status);

    try {
      await this.onStart();
      this.status = ServiceStatus.RUNNING;
      this.startTime = Date.now();
      this.lastError = null;
      this.emit('started');
      this.emit('status-change', this.status);
      this.logger.info('Service started successfully');
    } catch (error) {
      this.status = ServiceStatus.ERROR;
      this.lastError = error;
      this.emit('error', error);
      this.emit('status-change', this.status);
      this.logger.error('Failed to start service:', error);
      throw error;
    }
  }

  /**
   * Stop the service
   * @returns {Promise<void>}
   */
  async stop() {
    if (this.status === ServiceStatus.STOPPED) {
      this.logger.warn('Service is already stopped');
      return;
    }

    this.logger.info('Stopping service...');
    this.status = ServiceStatus.STOPPING;
    this.emit('status-change', this.status);

    try {
      await this.onStop();
      this.status = ServiceStatus.STOPPED;
      this.startTime = null;
      this.emit('stopped');
      this.emit('status-change', this.status);
      this.logger.info('Service stopped successfully');
    } catch (error) {
      this.logger.error('Error while stopping service:', error);
      // Still mark as stopped even if there was an error
      this.status = ServiceStatus.STOPPED;
      this.emit('status-change', this.status);
      throw error;
    }
  }

  /**
   * Restart the service
   * @returns {Promise<void>}
   */
  async restart() {
    this.logger.info('Restarting service...');
    this.status = ServiceStatus.RESTARTING;
    this.emit('status-change', this.status);
    this.restartCount++;

    try {
      await this.stop();
      await this.start();
      this.logger.info('Service restarted successfully');
    } catch (error) {
      this.logger.error('Failed to restart service:', error);
      throw error;
    }
  }

  /**
   * Check if the service is healthy
   * @returns {Promise<boolean>}
   */
  async isHealthy() {
    if (this.status !== ServiceStatus.RUNNING) {
      return false;
    }

    try {
      return await this.onHealthCheck();
    } catch (error) {
      this.logger.debug('Health check failed:', error);
      return false;
    }
  }

  /**
   * Get service status information
   * @returns {Object}
   */
  getStatus() {
    return {
      name: this.name,
      status: this.status,
      uptime: this.startTime ? Date.now() - this.startTime : 0,
      restartCount: this.restartCount,
      lastError: this.lastError ? {
        message: this.lastError.message,
        stack: this.lastError.stack
      } : null,
      metadata: this.getMetadata()
    };
  }

  /**
   * Get recent log entries
   * @param {number} limit - Number of entries to return
   * @returns {Array}
   */
  getLogs(limit = 100) {
    // This would be implemented by each service
    // to return recent log entries
    return [];
  }

  /**
   * Get service-specific metadata
   * @returns {Object}
   */
  getMetadata() {
    return {};
  }

  // Abstract methods to be implemented by subclasses

  /**
   * Service-specific start logic
   * @abstract
   * @returns {Promise<void>}
   */
  async onStart() {
    throw new Error('onStart() must be implemented by subclass');
  }

  /**
   * Service-specific stop logic
   * @abstract
   * @returns {Promise<void>}
   */
  async onStop() {
    throw new Error('onStop() must be implemented by subclass');
  }

  /**
   * Service-specific health check logic
   * @abstract
   * @returns {Promise<boolean>}
   */
  async onHealthCheck() {
    return true;
  }
}