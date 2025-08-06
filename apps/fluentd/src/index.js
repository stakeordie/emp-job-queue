#!/usr/bin/env node

/**
 * Fluentd Log Aggregation Service Companion
 * 
 * This Node.js service runs alongside Fluentd to provide:
 * - Health monitoring and metrics collection
 * - Configuration management 
 * - Redis failover queue monitoring
 * - Integration with EMP Job Queue monitoring system
 */

const express = require('express');
const Redis = require('ioredis');
const winston = require('winston');
const compression = require('compression');
const helmet = require('helmet');
const cors = require('cors');

// Configure logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'fluentd-companion',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

class FluentdCompanion {
  constructor() {
    this.app = express();
    this.redis = null;
    this.metrics = {
      startTime: Date.now(),
      logsProcessed: 0,
      errors: 0,
      redisFailoverCount: 0,
      lastHealthCheck: null
    };
    
    this.setupExpress();
    this.setupRedis();
    this.setupRoutes();
    this.setupMonitoring();
  }

  setupExpress() {
    // Security and performance middleware
    this.app.use(helmet());
    this.app.use(compression());
    this.app.use(cors({
      origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3333'],
      credentials: true
    }));
    this.app.use(express.json({ limit: '1mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info('HTTP request', {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          duration,
          userAgent: req.get('User-Agent')
        });
      });
      next();
    });
  }

  setupRedis() {
    if (!process.env.REDIS_HOST) {
      logger.warn('Redis not configured, failover monitoring disabled');
      return;
    }

    this.redis = new Redis({
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: 2, // Same DB as Fluentd failover
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });

    this.redis.on('connect', () => {
      logger.info('Connected to Redis for failover monitoring');
    });

    this.redis.on('error', (error) => {
      logger.error('Redis connection error', { error: error.message });
      this.metrics.errors++;
    });
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', async (req, res) => {
      try {
        const health = await this.getHealthStatus();
        res.json(health);
        this.metrics.lastHealthCheck = new Date().toISOString();
      } catch (error) {
        logger.error('Health check failed', { error: error.message });
        res.status(500).json({ 
          status: 'unhealthy', 
          error: error.message 
        });
      }
    });

    // Metrics endpoint (Prometheus format)
    this.app.get('/metrics', (req, res) => {
      const metrics = this.getPrometheusMetrics();
      res.set('Content-Type', 'text/plain');
      res.send(metrics);
    });

    // Fluentd proxy health check
    this.app.get('/fluentd/health', async (req, res) => {
      try {
        const response = await fetch('http://localhost:24220/api/plugins.json');
        if (response.ok) {
          const data = await response.json();
          res.json({
            status: 'healthy',
            fluentd: data
          });
        } else {
          throw new Error(`Fluentd health check failed: ${response.status}`);
        }
      } catch (error) {
        logger.error('Fluentd health check failed', { error: error.message });
        res.status(503).json({
          status: 'unhealthy',
          error: error.message
        });
      }
    });

    // Redis failover queue status
    this.app.get('/failover-queue', async (req, res) => {
      if (!this.redis) {
        return res.json({ 
          status: 'disabled',
          message: 'Redis not configured' 
        });
      }

      try {
        const keys = await this.redis.keys('fluentd_failed_logs:*');
        const queueInfo = await Promise.all(
          keys.map(async (key) => {
            const length = await this.redis.llen(key);
            return { key, length };
          })
        );

        res.json({
          status: 'ok',
          queues: queueInfo,
          totalItems: queueInfo.reduce((sum, q) => sum + q.length, 0)
        });
      } catch (error) {
        logger.error('Failed to get failover queue status', { error: error.message });
        res.status(500).json({ 
          status: 'error', 
          error: error.message 
        });
      }
    });

    // Configuration endpoint
    this.app.get('/config', (req, res) => {
      const config = {
        environment: process.env.NODE_ENV,
        serviceName: process.env.SERVICE_NAME,
        dash0Dataset: process.env.DASH0_DATASET,
        redisConfigured: !!process.env.REDIS_HOST,
        tlsEnabled: !!(process.env.TLS_CERT_PATH && process.env.TLS_KEY_PATH),
        ports: {
          forward: 24224,
          forwardTLS: 24225,
          http: 8888,
          monitoring: 24220,
          prometheus: 9880,
          companion: process.env.PORT || 3000
        },
        features: {
          buffering: true,
          redisFailover: !!this.redis,
          prometheus: true,
          tlsSupport: !!(process.env.TLS_CERT_PATH),
          customDash0Plugin: true
        }
      };

      res.json(config);
    });

    // Manual failover queue processing (for ops)
    this.app.post('/failover-queue/process', async (req, res) => {
      if (!this.redis) {
        return res.status(400).json({ 
          error: 'Redis not configured' 
        });
      }

      try {
        const processed = await this.processFailoverQueue();
        res.json({
          status: 'completed',
          logsProcessed: processed,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('Manual failover processing failed', { error: error.message });
        res.status(500).json({ 
          error: error.message 
        });
      }
    });
  }

  setupMonitoring() {
    // Periodic health checks
    setInterval(async () => {
      try {
        await this.collectMetrics();
      } catch (error) {
        logger.error('Metrics collection failed', { error: error.message });
        this.metrics.errors++;
      }
    }, 30000); // Every 30 seconds

    // Monitor failover queue
    if (this.redis) {
      setInterval(async () => {
        try {
          await this.monitorFailoverQueue();
        } catch (error) {
          logger.error('Failover queue monitoring failed', { error: error.message });
        }
      }, 60000); // Every minute
    }
  }

  async getHealthStatus() {
    const uptime = Date.now() - this.metrics.startTime;
    
    // Check Fluentd health
    let fluentdHealth = 'unknown';
    try {
      const response = await fetch('http://localhost:24220/api/plugins.json', {
        timeout: 5000
      });
      fluentdHealth = response.ok ? 'healthy' : 'unhealthy';
    } catch (error) {
      fluentdHealth = 'unreachable';
    }

    // Check Redis health
    let redisHealth = 'disabled';
    if (this.redis) {
      try {
        await this.redis.ping();
        redisHealth = 'healthy';
      } catch (error) {
        redisHealth = 'unhealthy';
      }
    }

    const overall = (fluentdHealth === 'healthy' && 
                    (redisHealth === 'healthy' || redisHealth === 'disabled')) 
                    ? 'healthy' : 'degraded';

    return {
      status: overall,
      uptime: Math.floor(uptime / 1000),
      components: {
        fluentd: fluentdHealth,
        redis: redisHealth,
        companion: 'healthy'
      },
      metrics: {
        ...this.metrics,
        timestamp: new Date().toISOString()
      }
    };
  }

  getPrometheusMetrics() {
    const uptime = Math.floor((Date.now() - this.metrics.startTime) / 1000);
    
    return `
# HELP fluentd_companion_uptime_seconds Total uptime of the companion service
# TYPE fluentd_companion_uptime_seconds counter
fluentd_companion_uptime_seconds ${uptime}

# HELP fluentd_companion_logs_processed_total Total number of logs processed
# TYPE fluentd_companion_logs_processed_total counter
fluentd_companion_logs_processed_total ${this.metrics.logsProcessed}

# HELP fluentd_companion_errors_total Total number of errors encountered
# TYPE fluentd_companion_errors_total counter  
fluentd_companion_errors_total ${this.metrics.errors}

# HELP fluentd_companion_redis_failover_count Total failover events to Redis
# TYPE fluentd_companion_redis_failover_count counter
fluentd_companion_redis_failover_count ${this.metrics.redisFailoverCount}
`.trim();
  }

  async collectMetrics() {
    // This would integrate with Fluentd metrics collection
    // For now, just log that we're monitoring
    logger.debug('Collecting metrics', {
      uptime: Date.now() - this.metrics.startTime,
      ...this.metrics
    });
  }

  async monitorFailoverQueue() {
    if (!this.redis) return;

    try {
      const keys = await this.redis.keys('fluentd_failed_logs:*');
      const totalItems = await Promise.all(
        keys.map(key => this.redis.llen(key))
      ).then(lengths => lengths.reduce((sum, len) => sum + len, 0));

      if (totalItems > 1000) {
        logger.warn('High number of logs in failover queue', {
          totalItems,
          queues: keys.length
        });
      }

      // Auto-process if queue is getting large
      if (totalItems > 10000) {
        logger.info('Auto-processing large failover queue', { totalItems });
        await this.processFailoverQueue();
      }
    } catch (error) {
      logger.error('Failover queue monitoring error', { error: error.message });
    }
  }

  async processFailoverQueue() {
    // This would implement logic to retry failed logs
    // For now, just return a placeholder
    logger.info('Processing failover queue (placeholder implementation)');
    return 0;
  }

  async start() {
    const port = process.env.PORT || 3000;
    
    return new Promise((resolve) => {
      this.app.listen(port, '0.0.0.0', () => {
        logger.info('Fluentd companion service started', {
          port,
          environment: process.env.NODE_ENV,
          redisConfigured: !!this.redis
        });
        resolve();
      });
    });
  }

  async stop() {
    logger.info('Shutting down fluentd companion service');
    
    if (this.redis) {
      await this.redis.quit();
    }
    
    // Express server shutdown would go here
    process.exit(0);
  }
}

// Start the service
const companion = new FluentdCompanion();

companion.start().catch(error => {
  logger.error('Failed to start fluentd companion', { error: error.message });
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => companion.stop());
process.on('SIGTERM', () => companion.stop());

module.exports = FluentdCompanion;