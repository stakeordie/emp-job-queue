import Redis from 'ioredis';
import os from 'os';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('redis-startup-notifier');

export class RedisStartupNotifier {
  constructor(config) {
    this.config = config;
    this.redis = null;
    this.workerId = `${config.machine.id}-startup-notifier`;
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
      
      logger.info('Redis startup notifier initialized');
    } catch (error) {
      logger.error('Failed to connect Redis startup notifier:', error);
      // Don't throw error - startup notifications are optional
    }
  }

  /**
   * Notify that machine is shutting down
   */
  async notifyShutdown(reason = 'Machine shutdown') {
    logger.info(`🔴 Beginning URGENT shutdown notification for machine ${this.config.machine.id}`);
    
    // Check if Redis connection is still alive
    if (!this.redis) {
      logger.error(`❌ Redis client is null, cannot send shutdown event for ${this.config.machine.id}`);
      return;
    }
    
    if (!this.isConnected) {
      logger.warn(`⚠️ Redis not connected, attempting to reconnect for shutdown event...`);
      try {
        await this.redis.ping();
        this.isConnected = true;
        logger.info(`✅ Redis reconnected for shutdown event`);
      } catch (error) {
        logger.error(`❌ Failed to reconnect to Redis for shutdown event:`, error);
        return;
      }
    }

    const shutdownEvent = {
      worker_id: this.workerId,
      machine_id: this.config.machine.id,
      event_type: 'shutdown',
      timestamp: Date.now(),
      reason: reason,
      uptime_ms: this.startupStartTime ? Date.now() - this.startupStartTime : 0,
      machine_config: {
        machine_id: this.config.machine.id,
        hostname: os.hostname()
      }
    };
    
    logger.info(`📤 Attempting to publish shutdown event:`, {
      machine_id: this.config.machine.id,
      worker_id: this.workerId,
      reason: reason,
      channel: 'machine:startup:events'
    });

    try {
      await this.publishStartupEvent(shutdownEvent);
      logger.info(`✅ Machine shutdown event published successfully for ${this.config.machine.id}: ${reason}`);
    } catch (error) {
      logger.error(`❌ Failed to publish shutdown event for ${this.config.machine.id}:`, error);
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
      startup_steps: this.startupSteps,
      machine_config: {
        machine_id: this.config.machine.id,
        gpu_count: this.config.machine.gpu.count,
        gpu_memory: this.config.machine.gpu.memoryGB,
        gpu_model: this.config.machine.gpu.model,
        hostname: os.hostname(),
        cpu_cores: os.cpus().length,
        ram_gb: Math.round(os.totalmem() / (1024 * 1024 * 1024)),
        services: Object.entries(this.config.services)
          .filter(([_, service]) => service.enabled)
          .map(([name]) => name)
      }
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
      stack: error.stack,
      machine_config: {
        machine_id: this.config.machine.id,
        gpu_count: this.config.machine.gpu.count,
        gpu_memory: this.config.machine.gpu.memoryGB,
        gpu_model: this.config.machine.gpu.model,
        hostname: os.hostname(),
        cpu_cores: os.cpus().length,
        ram_gb: Math.round(os.totalmem() / (1024 * 1024 * 1024)),
        services: Object.entries(this.config.services)
          .filter(([_, service]) => service.enabled)
          .map(([name]) => name)
      }
    };

    await this.publishStartupEvent(failedEvent);
    logger.error(`Startup failed for worker ${this.workerId} after ${totalTime}ms:`, error);
  }

  /**
   * Publish startup event to Redis
   */
  async publishStartupEvent(event) {
    if (!this.redis || !this.isConnected) {
      logger.warn(`⚠️ Redis not connected, skipping ${event.event_type} event for ${event.machine_id || this.config.machine.id}`);
      return;
    }

    try {
      const eventJson = JSON.stringify(event);
      logger.info(`📨 Publishing ${event.event_type} event to Redis channel 'machine:startup:events'`, {
        machine_id: event.machine_id || this.config.machine.id,
        event_type: event.event_type,
        payload_size: eventJson.length
      });
      
      // Publish to machine startup events channel
      const subscribers = await this.redis.publish('machine:startup:events', eventJson);
      logger.info(`✅ Event published to ${subscribers} subscribers`);
      
      // Also store in machine startup log with TTL (24 hours)
      const key = `machine:startup:${this.config.machine.id}:${event.event_type}:${Date.now()}`;
      await this.redis.setex(key, 24 * 60 * 60, eventJson);
      
      logger.info(`✅ Published and stored ${event.event_type} event for machine ${event.machine_id || this.config.machine.id}`);
    } catch (error) {
      logger.error(`❌ Failed to publish ${event.event_type} event:`, error);
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