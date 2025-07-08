import Redis from 'ioredis';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('redis-startup-notifier');

export class RedisStartupNotifier {
  constructor(config) {
    this.config = config;
    this.redis = null;
    this.workerId = `${config.worker.idPrefix}-${config.machine.id}`;
    this.isConnected = false;
    this.startupSteps = [];
    this.startupStartTime = null;
  }

  /**
   * Connect to Redis and initialize startup notification
   */
  async connect() {
    try {
      if (!this.config.redis.url) {
        logger.warn('Redis URL not configured, startup notifications disabled');
        return;
      }

      this.redis = new Redis(this.config.redis.url, {
        enableReadyCheck: true,
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        lazyConnect: true
      });

      this.redis.on('connect', () => {
        logger.info('Redis startup notifier connected');
        this.isConnected = true;
      });

      this.redis.on('error', (error) => {
        logger.error('Redis startup notifier error:', error);
        this.isConnected = false;
      });

      this.redis.on('close', () => {
        logger.warn('Redis startup notifier disconnected');
        this.isConnected = false;
      });

      await this.redis.connect();
      
      // Initialize startup sequence
      this.startupStartTime = Date.now();
      await this.notifyStartupBegin();
      
      logger.info('Redis startup notifier initialized');
    } catch (error) {
      logger.error('Failed to connect Redis startup notifier:', error);
      // Don't throw error - startup notifications are optional
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect() {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
      this.isConnected = false;
    }
  }

  /**
   * Notify that worker startup has begun
   */
  async notifyStartupBegin() {
    if (!this.isConnected) return;

    const startupEvent = {
      worker_id: this.workerId,
      event_type: 'startup_begin',
      timestamp: new Date().toISOString(),
      startup_time: this.startupStartTime,
      machine_config: {
        gpu_count: this.config.machine.gpu.count,
        gpu_memory: this.config.machine.gpu.memoryGB,
        gpu_model: this.config.machine.gpu.model,
        services: Object.entries(this.config.services)
          .filter(([_, service]) => service.enabled)
          .map(([name]) => name)
      }
    };

    await this.publishStartupEvent(startupEvent);
    logger.info(`Notified startup begin for worker ${this.workerId}`);
  }

  /**
   * Notify a specific step in the startup process
   */
  async notifyStep(stepName, stepData = {}) {
    if (!this.isConnected) return;

    const stepEvent = {
      worker_id: this.workerId,
      event_type: 'startup_step',
      timestamp: new Date().toISOString(),
      elapsed_ms: Date.now() - this.startupStartTime,
      step_name: stepName,
      step_data: stepData
    };

    // Store step locally
    this.startupSteps.push(stepEvent);

    await this.publishStartupEvent(stepEvent);
    logger.debug(`Startup step: ${stepName}`, stepData);
  }

  /**
   * Notify that a service has started
   */
  async notifyServiceStarted(serviceName, serviceData = {}) {
    await this.notifyStep(`service_started_${serviceName}`, {
      service: serviceName,
      ...serviceData
    });
  }

  /**
   * Notify that a service has failed to start
   */
  async notifyServiceFailed(serviceName, error) {
    await this.notifyStep(`service_failed_${serviceName}`, {
      service: serviceName,
      error: error.message,
      stack: error.stack
    });
  }

  /**
   * Notify that startup has completed successfully
   */
  async notifyStartupComplete() {
    if (!this.isConnected) return;

    const totalTime = Date.now() - this.startupStartTime;
    const completeEvent = {
      worker_id: this.workerId,
      event_type: 'startup_complete',
      timestamp: new Date().toISOString(),
      total_startup_time_ms: totalTime,
      step_count: this.startupSteps.length,
      startup_steps: this.startupSteps
    };

    await this.publishStartupEvent(completeEvent);
    logger.info(`Startup complete for worker ${this.workerId} in ${totalTime}ms`);
  }

  /**
   * Notify that startup has failed
   */
  async notifyStartupFailed(error) {
    if (!this.isConnected) return;

    const totalTime = Date.now() - this.startupStartTime;
    const failedEvent = {
      worker_id: this.workerId,
      event_type: 'startup_failed',
      timestamp: new Date().toISOString(),
      total_startup_time_ms: totalTime,
      step_count: this.startupSteps.length,
      startup_steps: this.startupSteps,
      error: error.message,
      stack: error.stack
    };

    await this.publishStartupEvent(failedEvent);
    logger.error(`Startup failed for worker ${this.workerId} after ${totalTime}ms:`, error);
  }

  /**
   * Publish startup event to Redis
   */
  async publishStartupEvent(event) {
    if (!this.redis || !this.isConnected) {
      logger.debug('Redis not connected, skipping startup event:', event.event_type);
      return;
    }

    try {
      // Publish to worker startup events channel
      await this.redis.publish('worker:startup:events', JSON.stringify(event));
      
      // Also store in worker startup log with TTL (24 hours)
      const key = `worker:startup:${this.workerId}:${event.event_type}:${Date.now()}`;
      await this.redis.setex(key, 24 * 60 * 60, JSON.stringify(event));
      
      logger.debug(`Published startup event: ${event.event_type}`);
    } catch (error) {
      logger.error('Failed to publish startup event:', error);
    }
  }

  /**
   * Get startup progress for this worker
   */
  getStartupProgress() {
    return {
      worker_id: this.workerId,
      started_at: this.startupStartTime,
      elapsed_ms: this.startupStartTime ? Date.now() - this.startupStartTime : 0,
      step_count: this.startupSteps.length,
      steps: this.startupSteps,
      is_complete: false
    };
  }

  /**
   * Health check - verify Redis connection
   */
  async healthCheck() {
    if (!this.redis) return { healthy: false, error: 'Redis not configured' };
    
    try {
      await this.redis.ping();
      return { healthy: true };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }
}

export default RedisStartupNotifier;