import { EventEmitter } from 'events';
import { createLogger } from './utils/logger.js';
import config from './config/environment.js';
import { ServiceStatus } from './services/base-service.js';
import { RedisStartupNotifier } from './services/redis-startup-notifier.js';

const logger = createLogger('orchestrator');

export class ServiceOrchestrator extends EventEmitter {
  constructor() {
    super();
    this.services = new Map();
    this.startupPromises = new Map();
    this.isShuttingDown = false;
    this.startTime = null;
    this.startupNotifier = new RedisStartupNotifier(config);
  }

  /**
   * Start all configured services
   */
  async start() {
    logger.info('Starting Basic Machine orchestrator...');
    this.startTime = Date.now();

    try {
      // Initialize Redis startup notifier
      await this.startupNotifier.connect();

      // Phase 0: Shared directory setup
      logger.info('Phase 0: Setting up shared directories');
      await this.startupNotifier.notifyStep('phase_0_begin', { phase: 'shared_setup' });
      await this.startService('shared-setup');
      await this.startupNotifier.notifyStep('phase_0_complete', { phase: 'shared_setup' });

      // Phase 1: Core infrastructure
      logger.info('Phase 1: Starting core infrastructure services');
      await this.startupNotifier.notifyStep('phase_1_begin', { phase: 'core_infrastructure' });
      if (config.services.nginx.enabled) {
        await this.startService('nginx');
        await this.startupNotifier.notifyServiceStarted('nginx');
      } else {
        await this.startupNotifier.notifyStep('nginx_skipped', { reason: 'disabled' });
      }
      await this.startupNotifier.notifyStep('phase_1_complete', { phase: 'core_infrastructure' });

      // Phase 2: AI Services (parallel per GPU)
      logger.info(`Phase 2: Starting AI services for ${config.machine.gpu.count} GPUs`);
      if (config.machine.testMode) {
        logger.info('TEST MODE: Using NUM_GPUS from environment instead of detecting GPUs');
      }
      
      await this.startupNotifier.notifyStep('phase_2_begin', { 
        phase: 'ai_services', 
        gpu_count: config.machine.gpu.count 
      });
      
      const aiServices = [];
      
      for (let gpu = 0; gpu < config.machine.gpu.count; gpu++) {
        logger.info(`Starting services for GPU ${gpu}`);
        await this.startupNotifier.notifyStep(`gpu_${gpu}_begin`, { gpu });
        
        if (config.services.comfyui.enabled) {
          logger.info(`  - ComfyUI for GPU ${gpu}`);
          aiServices.push(this.startService('comfyui', { gpu }));
        }
        if (config.services.automatic1111.enabled) {
          logger.info(`  - Automatic1111 for GPU ${gpu}`);
          aiServices.push(this.startService('automatic1111', { gpu }));
        }
        if (config.services.redisWorker.enabled) {
          logger.info(`  - Redis Worker for GPU ${gpu}`);
          aiServices.push(this.startService('redis-worker', { gpu }));
        }
      }

      await Promise.all(aiServices);
      await this.startupNotifier.notifyStep('phase_2_complete', { phase: 'ai_services' });

      // Phase 3: Supporting services
      logger.info('Phase 3: Starting supporting services');
      await this.startupNotifier.notifyStep('phase_3_begin', { phase: 'supporting_services' });
      if (config.services.ollama.enabled) {
        await this.startService('ollama');
        await this.startupNotifier.notifyServiceStarted('ollama');
      } else {
        await this.startupNotifier.notifyStep('ollama_skipped', { reason: 'disabled' });
      }
      await this.startupNotifier.notifyStep('phase_3_complete', { phase: 'supporting_services' });

      const startupTime = Date.now() - this.startTime;
      logger.info(`All services started successfully in ${startupTime}ms`);
      
      // Notify startup complete
      await this.startupNotifier.notifyStartupComplete();
      
      this.emit('ready');
    } catch (error) {
      logger.error('Failed to start services:', error);
      await this.startupNotifier.notifyStartupFailed(error);
      await this.shutdown();
      throw error;
    }
  }

  /**
   * Start a specific service
   */
  async startService(serviceName, options = {}) {
    const serviceKey = this.getServiceKey(serviceName, options);
    
    // Check if already starting
    if (this.startupPromises.has(serviceKey)) {
      return this.startupPromises.get(serviceKey);
    }

    const startPromise = this._startService(serviceName, options);
    this.startupPromises.set(serviceKey, startPromise);
    
    try {
      await startPromise;
    } finally {
      this.startupPromises.delete(serviceKey);
    }
  }

  async _startService(serviceName, options) {
    const serviceKey = this.getServiceKey(serviceName, options);
    logger.info(`Starting service: ${serviceKey}`);

    try {
      // Dynamically import service module
      const ServiceClass = await this.loadServiceClass(serviceName);
      const service = new ServiceClass(options, config);

      // Set up event listeners
      service.on('error', (error) => {
        logger.error(`Service ${serviceKey} error:`, error);
        this.emit('service-error', { service: serviceKey, error });
      });

      service.on('status-change', (status) => {
        logger.debug(`Service ${serviceKey} status changed to: ${status}`);
        this.emit('service-status-change', { service: serviceKey, status });
      });

      // Store service instance
      this.services.set(serviceKey, service);

      // Start the service
      await service.start();
      
      // Notify Redis about successful service startup
      await this.startupNotifier.notifyServiceStarted(serviceKey, {
        service_type: serviceName,
        options: options,
        startup_time: Date.now() - this.startTime
      });
      
      logger.info(`Service ${serviceKey} started successfully`);
      return service;
    } catch (error) {
      logger.error(`Failed to start service ${serviceKey}:`, error);
      
      // Notify Redis about service startup failure
      await this.startupNotifier.notifyServiceFailed(serviceKey, error);
      
      throw error;
    }
  }

  /**
   * Load service class dynamically
   */
  async loadServiceClass(serviceName) {
    const serviceModules = {
      'shared-setup': './services/shared-setup-service.js',
      'nginx': './services/nginx-service.js',
      'comfyui': './services/comfyui-service.js',
      'automatic1111': './services/a1111-service.js',
      'redis-worker': './services/redis-worker-service.js',
      'ollama': './services/ollama-service.js'
    };

    const modulePath = serviceModules[serviceName];
    if (!modulePath) {
      throw new Error(`Unknown service: ${serviceName}`);
    }

    try {
      const module = await import(modulePath);
      return module.default;
    } catch (error) {
      // Service not implemented yet, return placeholder
      logger.warn(`Service ${serviceName} not implemented yet, using placeholder`);
      const { BaseService } = await import('./services/base-service.js');
      
      return class PlaceholderService extends BaseService {
        constructor(options) {
          super(serviceName, options);
        }
        
        async onStart() {
          this.logger.info('Placeholder service started');
        }
        
        async onStop() {
          this.logger.info('Placeholder service stopped');
        }
        
        async onHealthCheck() {
          return true;
        }
      };
    }
  }

  /**
   * Gracefully shutdown all services
   */
  async shutdown() {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    logger.info('Shutting down all services...');

    // Wait for any pending startups
    const pendingStartups = Array.from(this.startupPromises.values());
    if (pendingStartups.length > 0) {
      logger.info(`Waiting for ${pendingStartups.length} services to finish starting...`);
      await Promise.allSettled(pendingStartups);
    }

    // Stop services in reverse order
    const services = Array.from(this.services.entries()).reverse();
    
    for (const [key, service] of services) {
      try {
        logger.info(`Stopping service: ${key}`);
        await service.stop();
      } catch (error) {
        logger.error(`Error stopping service ${key}:`, error);
      }
    }

    logger.info('All services stopped');
    
    // Disconnect Redis startup notifier
    await this.startupNotifier.disconnect();
    
    this.emit('shutdown');
  }

  /**
   * Get status of all services
   */
  getStatus() {
    const status = {
      uptime: this.startTime ? Date.now() - this.startTime : 0,
      services: {}
    };

    for (const [key, service] of this.services) {
      status.services[key] = service.getStatus();
    }

    return status;
  }

  /**
   * Check overall system health
   */
  async checkHealth() {
    const healthChecks = [];
    
    for (const [key, service] of this.services) {
      healthChecks.push({
        service: key,
        checkPromise: service.isHealthy()
      });
    }

    // Add Redis startup notifier health check
    healthChecks.push({
      service: 'redis-startup-notifier',
      checkPromise: this.startupNotifier.healthCheck()
    });

    const results = await Promise.allSettled(
      healthChecks.map(({ checkPromise }) => checkPromise)
    );

    const health = {
      healthy: true,
      services: {},
      startup_progress: this.startupNotifier.getStartupProgress()
    };

    results.forEach((result, index) => {
      const { service } = healthChecks[index];
      
      if (service === 'redis-startup-notifier') {
        // Handle Redis notifier health check result
        const healthy = result.status === 'fulfilled' && result.value.healthy;
        health.services[service] = {
          healthy,
          error: result.status === 'rejected' ? result.reason.message : result.value.error
        };
      } else {
        // Handle regular service health check
        const healthy = result.status === 'fulfilled' && result.value === true;
        health.services[service] = {
          healthy,
          error: result.status === 'rejected' ? result.reason.message : null
        };
      }

      if (!health.services[service].healthy) {
        health.healthy = false;
      }
    });

    return health;
  }

  /**
   * Get unique service key
   */
  getServiceKey(serviceName, options) {
    if (options.gpu !== undefined) {
      return `${serviceName}-gpu${options.gpu}`;
    }
    return serviceName;
  }

  /**
   * Get specific service instance
   */
  getService(serviceName, options = {}) {
    const key = this.getServiceKey(serviceName, options);
    return this.services.get(key);
  }

  /**
   * Get all services of a specific type
   */
  getServicesByType(serviceName) {
    const services = [];
    for (const [key, service] of this.services) {
      if (key.startsWith(serviceName)) {
        services.push(service);
      }
    }
    return services;
  }
}