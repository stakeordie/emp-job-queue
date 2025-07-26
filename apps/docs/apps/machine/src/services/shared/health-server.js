/**
 * Health Server - HTTP endpoints for machine health and status
 * Provides health checks, status reports, and service management endpoints
 */

import http from 'http';
import { URL } from 'url';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('health-server');

export class HealthServer {
  constructor(config, pm2Manager, statusAggregator) {
    this.config = config;
    this.pm2Manager = pm2Manager;
    this.statusAggregator = statusAggregator;
    this.server = null;
    this.startTime = Date.now();
  }

  async start() {
    const port = parseInt(process.env.MACHINE_HEALTH_PORT || '9090');
    
    await this.cleanupHealthPort(port);
    
    this.server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Content-Type', 'application/json');

      if (req.method === 'OPTIONS') {
        res.statusCode = 200;
        res.end();
        return;
      }

      try {
        await this.handleRequest(url, req, res);
      } catch (error) {
        logger.error('Health server error:', error);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: error.message }));
      }
    });

    this.server.listen(port, () => {
      logger.info(`Health server listening on port ${port}`);
    });

    this.server.on('error', (error) => {
      logger.error('Health server error:', error);
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${port} is already in use`);
        process.exit(1);
      }
    });
  }

  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(resolve);
      });
    }
  }

  async handleRequest(url, req, res) {
    switch (url.pathname) {
      case '/health':
        const health = await this.checkSystemHealth();
        res.statusCode = health.healthy ? 200 : 503;
        res.end(JSON.stringify(health, null, 2));
        break;

      case '/status':
        const status = await this.getSystemStatus();
        res.statusCode = 200;
        res.end(JSON.stringify(status, null, 2));
        break;

      case '/ready':
        const ready = this.startTime !== null;
        res.statusCode = ready ? 200 : 503;
        res.end(JSON.stringify({ ready }));
        break;

      case '/pm2/list':
        const services = await this.pm2Manager.getAllServicesStatus();
        res.statusCode = 200;
        res.end(JSON.stringify(services, null, 2));
        break;

      case '/pm2/logs':
        await this.handlePM2Logs(url, res);
        break;

      case '/restart/machine':
        if (req.method === 'POST') {
          await this.handleMachineRestart(res);
        } else {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
        break;

      case '/restart/service':
        if (req.method === 'POST') {
          await this.handleServiceRestart(url, res);
        } else {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
        break;

      case '/refresh-status':
        if (req.method === 'POST' || req.method === 'GET') {
          await this.handleStatusRefresh(res);
        } else {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
        break;

      default:
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Not found' }));
    }
  }

  async checkSystemHealth() {
    const health = {
      healthy: true,
      machine_type: this.config.machine.type,
      machine_id: this.config.machine.id,
      services: {},
      uptime: Date.now() - this.startTime
    };

    try {
      // Get PM2 service status
      const services = await this.pm2Manager.getAllServicesStatus();
      
      for (const service of services) {
        const isHealthy = service.status === 'online';
        health.services[service.name] = {
          healthy: isHealthy,
          status: service.status,
          pid: service.pid,
          restarts: service.restarts
        };
        
        if (!isHealthy) {
          health.healthy = false;
        }
      }

      // Check status aggregator Redis connection
      health.services['status-aggregator'] = {
        healthy: this.statusAggregator.isConnected,
        error: this.statusAggregator.isConnected ? null : 'Not connected to Redis'
      };
      
      if (!this.statusAggregator.isConnected) {
        health.healthy = false;
      }

    } catch (error) {
      logger.error('Health check failed:', error);
      health.healthy = false;
      health.error = error.message;
    }

    return health;
  }

  async getSystemStatus() {
    const status = {
      version: '1.0.0',
      machine_type: this.config.machine.type,
      machine_id: this.config.machine.id,
      uptime: Date.now() - this.startTime,
      services: {}
    };

    try {
      const services = await this.pm2Manager.getAllServicesStatus();
      services.forEach(service => {
        status.services[service.name] = service;
      });
    } catch (error) {
      logger.error('Failed to get service status:', error);
      status.error = error.message;
    }

    return status;
  }

  async handlePM2Logs(url, res) {
    const serviceName = url.searchParams.get('service');
    const lines = parseInt(url.searchParams.get('lines') || '50');
    
    if (serviceName) {
      const logs = await this.pm2Manager.getServiceLogs(serviceName, lines);
      res.statusCode = 200;
      res.end(logs);
    } else {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Service name required' }));
    }
  }

  async handleMachineRestart(res) {
    logger.info('🔄 Machine restart requested via API');
    res.statusCode = 200;
    res.end(JSON.stringify({ message: 'Machine restart initiated' }));
    
    setTimeout(async () => {
      try {
        logger.info('🔄 Executing machine restart...');
        await this.statusAggregator.shutdown();
        process.exit(0);
      } catch (error) {
        logger.error('❌ Error during machine restart:', error);
        process.exit(1);
      }
    }, 100);
  }

  async handleServiceRestart(url, res) {
    const serviceToRestart = url.searchParams.get('service');
    if (serviceToRestart) {
      try {
        logger.info(`🔄 Restarting PM2 service: ${serviceToRestart}`);
        await this.pm2Manager.restartService(serviceToRestart);
        res.statusCode = 200;
        res.end(JSON.stringify({ message: `Service ${serviceToRestart} restarted successfully` }));
      } catch (error) {
        logger.error(`❌ Error restarting service ${serviceToRestart}:`, error);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: `Failed to restart service: ${error.message}` }));
      }
    } else {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Service name required' }));
    }
  }

  async handleStatusRefresh(res) {
    logger.info('📊 Status refresh requested via API');
    try {
      await this.statusAggregator.collectAndPublishStatus();
      res.statusCode = 200;
      res.end(JSON.stringify({ 
        message: 'Status update triggered',
        machine_id: this.config.machine.id,
        timestamp: Date.now()
      }));
    } catch (error) {
      logger.error('Failed to trigger status update:', error);
      res.statusCode = 500;
      res.end(JSON.stringify({ 
        error: 'Failed to trigger status update',
        details: error.message
      }));
    }
  }

  async cleanupHealthPort(port) {
    const net = await import('net');
    const { execa } = await import('execa');
    
    const isInUse = await new Promise((resolve) => {
      const server = net.createServer();
      server.listen(port, () => {
        server.close(() => resolve(false));
      });
      server.on('error', () => resolve(true));
    });
    
    if (!isInUse) {
      logger.debug(`Health server port ${port} is available`);
      return;
    }
    
    logger.warn(`Health server port ${port} is in use, attempting cleanup...`);
    
    try {
      const { stdout } = await execa('lsof', ['-ti', `:${port}`]);
      const pid = parseInt(stdout.trim());
      
      if (pid) {
        logger.info(`Killing process ${pid} using port ${port}`);
        
        try {
          process.kill(pid, 'SIGTERM');
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          try {
            process.kill(pid, 0);
            logger.info(`Process ${pid} still alive, force killing...`);
            process.kill(pid, 'SIGKILL');
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch {
            // Process is dead
          }
        } catch (error) {
          logger.debug(`Error killing process ${pid}:`, error.message);
        }
      }
    } catch (error) {
      logger.warn(`Could not find process using port ${port}:`, error.message);
    }
  }
}