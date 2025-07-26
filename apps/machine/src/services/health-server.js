import { BaseService } from './base-service.js';
import express from 'express';
import { createLogger } from '../utils/logger.js';
import { versionService } from './version-service.js';

const logger = createLogger('health-server');

export default class HealthServer extends BaseService {
  constructor(options = {}, config, pm2Manager) {
    super('health-server', options);
    this.config = config;
    this.pm2Manager = pm2Manager;
    this.port = options.port || 9090;
    this.server = null;
    this.app = null;
    this.startTime = Date.now(); // Track when health server started
  }

  async onStart() {
    logger.info(`Starting health server on port ${this.port}`);
    
    this.app = express();
    this.app.use(express.json());
    
    // Health endpoints
    this.app.get('/health', this.handleHealth.bind(this));
    this.app.get('/status', this.handleStatus.bind(this));
    this.app.get('/ready', this.handleReady.bind(this));
    this.app.get('/version', this.handleVersion.bind(this));
    
    // Service-specific endpoints
    this.app.get('/services', this.handleServices.bind(this));
    this.app.get('/services/:serviceName/health', this.handleServiceHealth.bind(this));
    this.app.get('/services/:serviceName/logs', this.handleServiceLogs.bind(this));
    
    this.server = this.app.listen(this.port, () => {
      logger.info(`Health server listening on port ${this.port}`);
    });
  }

  async onStop() {
    logger.info('Stopping health server...');
    
    if (this.server) {
      await new Promise((resolve) => {
        this.server.close(resolve);
      });
      this.server = null;
    }
    
    logger.info('Health server stopped successfully');
  }

  async onHealthCheck() {
    // Health server is healthy if it's listening
    return this.server && this.server.listening;
  }

  async handleHealth(req, res) {
    try {
      const services = await this.pm2Manager.getAllServicesStatus();
      const healthChecks = services.map(service => ({
        service: service.name,
        healthy: service.status === 'online',
        status: service.status,
        pid: service.pid,
        cpu: service.cpu,
        memory: service.memory,
        uptime: service.uptime,
        restarts: service.restarts
      }));
      
      
      const allHealthy = healthChecks.every(check => check.healthy);
      
      res.status(allHealthy ? 200 : 503).json({
        healthy: allHealthy,
        timestamp: new Date().toISOString(),
        machine_version: versionService.getVersion(),
        services: healthChecks
      });
    } catch (error) {
      logger.error('Health check failed:', error);
      res.status(500).json({
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  async handleStatus(req, res) {
    try {
      const serviceStatus = await this.getDetailedServiceStatus();
      
      res.json({
        machine_id: this.config.machine.id,
        timestamp: new Date().toISOString(),
        uptime_ms: this.startTime ? Date.now() - this.startTime : 0,
        services: serviceStatus
      });
    } catch (error) {
      logger.error('Status check failed:', error);
      res.status(500).json({
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  async getDetailedServiceStatus() {
    const serviceStatus = {};
    
    // Get all configured services (not just running ones)
    const configuredServices = this.getConfiguredServices();
    const runningServices = this.orchestrator.services;
    
    for (const [serviceName, serviceConfig] of Object.entries(configuredServices)) {
      const runningService = runningServices.get(serviceName);
      
      if (!serviceConfig.enabled) {
        serviceStatus[serviceName] = {
          status: 'not_configured',
          enabled: false,
          health: 'not_applicable',
          message: 'Service not enabled in configuration'
        };
      } else if (!runningService) {
        // Service is enabled but not running
        const installationStatus = await this.checkServiceInstallation(serviceName, serviceConfig);
        serviceStatus[serviceName] = {
          status: installationStatus.installed ? 'stopped' : 'not_installed',
          enabled: true,
          health: 'unknown',
          message: installationStatus.message,
          ...serviceConfig
        };
      } else {
        // Service is running, check its health
        try {
          const isHealthy = await runningService.isHealthy();
          const installationStatus = await this.checkServiceInstallation(serviceName, serviceConfig);
          
          serviceStatus[serviceName] = {
            status: runningService.status || 'unknown',
            enabled: true,
            health: isHealthy ? 'healthy' : 'unhealthy',
            installed: installationStatus.installed,
            started_at: runningService.startTime,
            uptime_ms: runningService.startTime ? Date.now() - runningService.startTime : 0,
            message: installationStatus.message,
            ...serviceConfig
          };
          
          // Add service-specific info
          if (serviceName.startsWith('comfyui')) {
            serviceStatus[serviceName].gpu = runningService.gpu;
            serviceStatus[serviceName].port = runningService.port;
            serviceStatus[serviceName].endpoint = `http://localhost:${runningService.port}`;
          }
          
          if (serviceName.startsWith('redis-worker')) {
            serviceStatus[serviceName].gpu = runningService.gpu;
          }
        } catch (error) {
          serviceStatus[serviceName] = {
            status: 'error',
            enabled: true,
            health: 'error',
            error: error.message,
            ...serviceConfig
          };
        }
      }
    }
    
    return serviceStatus;
  }

  getConfiguredServices() {
    const services = {};
    
    // Extract service configuration from config
    if (this.config.services.nginx.enabled) {
      services['nginx'] = {
        type: 'nginx',
        enabled: this.config.services.nginx.enabled,
        port: this.config.services.nginx.port
      };
    }
    
    if (this.config.services.comfyui.enabled) {
      for (let gpu = 0; gpu < this.config.machine.gpu.count; gpu++) {
        services[`comfyui-gpu${gpu}`] = {
          type: 'comfyui',
          enabled: this.config.services.comfyui.enabled,
          gpu: gpu,
          port: this.config.services.comfyui.basePort + gpu
        };
      }
    }
    
    if (this.config.services.automatic1111?.enabled) {
      for (let gpu = 0; gpu < this.config.machine.gpu.count; gpu++) {
        services[`automatic1111-gpu${gpu}`] = {
          type: 'automatic1111',
          enabled: this.config.services.automatic1111.enabled,
          gpu: gpu,
          port: this.config.services.automatic1111.basePort + gpu
        };
      }
    }
    
    if (this.config.services.redisWorker?.enabled) {
      for (let gpu = 0; gpu < this.config.machine.gpu.count; gpu++) {
        services[`redis-worker-gpu${gpu}`] = {
          type: 'redis-worker',
          enabled: this.config.services.redisWorker.enabled,
          gpu: gpu
        };
      }
    }
    
    if (this.config.services.ollama?.enabled) {
      services['ollama'] = {
        type: 'ollama',
        enabled: this.config.services.ollama.enabled,
        port: this.config.services.ollama.port
      };
    }
    
    // Always include health-server
    services['health-server'] = {
      type: 'health-server',
      enabled: true,
      port: this.port
    };
    
    return services;
  }

  async checkServiceInstallation(serviceName, serviceConfig) {
    try {
      switch (serviceConfig.type) {
        case 'comfyui':
          return await this.checkComfyUIInstallation(serviceConfig);
        case 'automatic1111':
          return await this.checkA1111Installation(serviceConfig);
        case 'nginx':
          return await this.checkNginxInstallation();
        case 'ollama':
          return await this.checkOllamaInstallation();
        case 'redis-worker':
          return await this.checkRedisWorkerInstallation();
        case 'health-server':
          return { installed: true, message: 'Health server is built-in' };
        default:
          return { installed: false, message: 'Unknown service type' };
      }
    } catch (error) {
      return { installed: false, message: `Installation check failed: ${error.message}` };
    }
  }

  async checkComfyUIInstallation(serviceConfig) {
    const fs = await import('fs-extra');
    const path = await import('path');
    
    const workDir = process.env.WORKSPACE_DIR ? 
      `${process.env.WORKSPACE_DIR}/comfyui_gpu${serviceConfig.gpu}` : 
      `/workspace/comfyui_gpu${serviceConfig.gpu}`;
    
    try {
      await fs.access(workDir);
      await fs.access(path.join(workDir, 'main.py'));
      return { installed: true, message: 'ComfyUI installation found' };
    } catch (error) {
      return { installed: false, message: `ComfyUI not installed: ${workDir}/main.py not found` };
    }
  }

  async checkA1111Installation(serviceConfig) {
    const fs = await import('fs-extra');
    const path = await import('path');
    
    const workDir = process.env.WORKSPACE_DIR ? 
      `${process.env.WORKSPACE_DIR}/stable-diffusion-webui` : 
      `/workspace/stable-diffusion-webui`;
    
    try {
      await fs.access(workDir);
      await fs.access(path.join(workDir, 'webui.py'));
      return { installed: true, message: 'Automatic1111 installation found' };
    } catch (error) {
      return { installed: false, message: `Automatic1111 not installed: ${workDir}/webui.py not found` };
    }
  }

  async checkNginxInstallation() {
    const { execa } = await import('execa');
    
    try {
      await execa('nginx', ['-v']);
      return { installed: true, message: 'Nginx is installed' };
    } catch (error) {
      return { installed: false, message: 'Nginx not installed or not in PATH' };
    }
  }

  async checkOllamaInstallation() {
    const { execa } = await import('execa');
    
    try {
      await execa('ollama', ['--version']);
      return { installed: true, message: 'Ollama is installed' };
    } catch (error) {
      return { installed: false, message: 'Ollama not installed or not in PATH' };
    }
  }

  async checkRedisWorkerInstallation() {
    const fs = await import('fs-extra');
    
    const workerPath = process.env.WORKER_LOCAL_PATH || '/workspace/worker-dist';
    
    try {
      await fs.access(workerPath);
      return { installed: true, message: 'Redis worker found' };
    } catch (error) {
      return { installed: false, message: `Redis worker not found at ${workerPath}` };
    }
  }

  async handleReady(req, res) {
    try {
      // Machine is ready if all enabled services are running and healthy
      const services = this.orchestrator.services;
      let allReady = true;
      
      for (const [serviceName, service] of services) {
        // Skip health-server itself in readiness check
        if (serviceName === 'health-server') continue;
        
        try {
          const isHealthy = await service.isHealthy();
          if (!isHealthy || service.status !== 'running') {
            allReady = false;
            break;
          }
        } catch (error) {
          allReady = false;
          break;
        }
      }
      
      res.status(allReady ? 200 : 503).json({
        ready: allReady,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Readiness check failed:', error);
      res.status(500).json({
        ready: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  async handleServices(req, res) {
    try {
      const services = this.orchestrator.services;
      const serviceList = [];
      
      for (const [serviceName, service] of services) {
        // Skip health-server itself
        if (serviceName === 'health-server') continue;
        
        const serviceInfo = {
          name: serviceName,
          type: service.name,
          status: service.status
        };
        
        // Add service-specific info
        if (serviceName.startsWith('comfyui')) {
          serviceInfo.gpu = service.gpu;
          serviceInfo.port = service.port;
          serviceInfo.endpoint = `http://localhost:${service.port}`;
        }
        
        if (serviceName.startsWith('redis-worker')) {
          serviceInfo.gpu = service.gpu;
        }
        
        serviceList.push(serviceInfo);
      }
      
      res.json({
        services: serviceList,
        count: serviceList.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Services list failed:', error);
      res.status(500).json({
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  async handleServiceHealth(req, res) {
    try {
      const serviceName = req.params.serviceName;
      const service = this.orchestrator.services.get(serviceName);
      
      if (!service) {
        return res.status(404).json({
          error: `Service ${serviceName} not found`,
          timestamp: new Date().toISOString()
        });
      }
      
      const isHealthy = await service.isHealthy();
      
      res.status(isHealthy ? 200 : 503).json({
        service: serviceName,
        healthy: isHealthy,
        status: service.status,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error(`Service health check failed for ${req.params.serviceName}:`, error);
      res.status(500).json({
        service: req.params.serviceName,
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  async handleServiceLogs(req, res) {
    try {
      const serviceName = req.params.serviceName;
      const limit = parseInt(req.query.limit) || 100;
      const service = this.orchestrator.services.get(serviceName);
      
      if (!service) {
        return res.status(404).json({
          error: `Service ${serviceName} not found`,
          timestamp: new Date().toISOString()
        });
      }
      
      const logs = service.getLogs ? service.getLogs(limit) : [];
      
      res.json({
        service: serviceName,
        logs: logs,
        count: logs.length,
        limit: limit,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error(`Service logs failed for ${req.params.serviceName}:`, error);
      res.status(500).json({
        service: req.params.serviceName,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  async handleVersion(req, res) {
    try {
      const versionInfo = versionService.getVersionInfo();
      
      res.json({
        ...versionInfo,
        uptime_seconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Version endpoint failed:', error);
      res.status(500).json({
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
}