// Simulation Service - PM2 compatible wrapper for SimulationHttpService
// Manages ComfyUI-compatible simulation server as a PM2 service

import { BaseService } from './base-service.js';
import { SimulationHttpService } from './simulation-http-service.js';

export default class SimulationService extends BaseService {
  constructor(options = {}, config) {
    super('simulation', options);
    this.config = config;
    this.port = parseInt(process.env.SIMULATION_PORT || '8299');
    this.host = process.env.SIMULATION_HOST || 'localhost';
    this.server = null;
  }

  async onStart() {
    this.logger.info(`Starting simulation service on ${this.host}:${this.port}`);
    
    try {
      // Create simulation server instance
      this.server = new SimulationHttpService({
        port: this.port,
        host: this.host
      });
      
      // Start the server
      await this.server.start();
      
      this.logger.info('Simulation service started successfully');
      
    } catch (error) {
      this.logger.error('Failed to start simulation service:', error);
      throw error;
    }
  }

  async onStop() {
    this.logger.info('Stopping simulation service...');
    
    if (this.server) {
      try {
        await this.server.stop();
        this.server = null;
        this.logger.info('Simulation service stopped successfully');
      } catch (error) {
        this.logger.error('Error stopping simulation service:', error);
      }
    }
  }

  async onHealthCheck() {
    if (!this.server) {
      return false;
    }
    
    try {
      // Simple health check - could be enhanced to ping the server
      return true;
    } catch (error) { // eslint-disable-line no-unreachable
      this.logger.debug('Health check failed:', error.message);
      return false;
    }
  }

  getMetadata() {
    return {
      port: this.port,
      host: this.host,
      status: this.server ? 'running' : 'stopped',
      endpoints: {
        rest: `http://${this.host}:${this.port}`,
        websocket: `ws://${this.host}:${this.port}`
      }
    };
  }
}