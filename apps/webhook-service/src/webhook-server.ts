/**
 * Webhook Service Server
 *
 * Dedicated microservice for handling webhook notifications.
 * Listens to Redis events and delivers HTTP webhooks to registered endpoints.
 */

import express, { Request, Response } from 'express';
import { createServer, Server as HTTPServer } from 'http';
import Redis from 'ioredis';
import cors from 'cors';
import { logger } from '@emp/core';
import { WebhookProcessor } from './webhook-processor.js';
import { setupWebhookRoutes } from './routes/webhook-routes.js';

interface WebhookServerConfig {
  port: number;
  redisUrl: string;
  corsOrigins?: string[];
  telemetryClient?: any; // Optional telemetry client for OTEL events
}

export class WebhookServer {
  private app: express.Express;
  private httpServer: HTTPServer;
  private redis: Redis;
  private webhookProcessor: WebhookProcessor;
  private config: WebhookServerConfig;

  constructor(config: WebhookServerConfig) {
    this.config = config;
    this.app = express();
    this.httpServer = createServer(this.app);

    // Redis will be initialized later after connection retry
    this.redis = null as any;
    this.webhookProcessor = null as any;

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // CORS support
    const corsOrigins = this.config.corsOrigins || ['*'];
    logger.info('Setting up CORS with origins:', corsOrigins);

    this.app.use(
      cors({
        origin: (origin, callback) => {
          try {
            // Allow requests with no origin (like mobile apps or curl requests)
            if (!origin) {
              return callback(null, true);
            }

            // Check if origin is explicitly allowed
            if (corsOrigins.includes('*')) {
              return callback(null, true);
            }

            if (corsOrigins.includes(origin)) {
              return callback(null, true);
            }

            // Special case: allow localhost variants for development
            if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
              return callback(null, true);
            }

            logger.error('❌ CORS BLOCKED origin', {
              origin,
              corsOrigins,
              exactMatch: corsOrigins.includes(origin),
              containsLocalhost: origin.includes('localhost'),
            });
            return callback(new Error(`Not allowed by CORS: ${origin}`), false);
          } catch (error) {
            logger.error('💥 CORS callback error:', error);
            return callback(error, false);
          }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
      })
    );

    // JSON parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req, res, next) => {
      logger.debug(`${req.method} ${req.path}`, {
        headers: req.headers,
        query: req.query,
      });
      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint (must be before 404 handler)
    this.setupHealthcheck();

    // Note: Webhook management routes will be set up after webhookProcessor is initialized
    // Note: 404 and error handlers will be set up after webhook routes are configured
  }

  private setupFinalHandlers(): void {
    // 404 handler (must be after all other routes)
    this.app.use('*', (req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
      });
    });

    // Error handler (must be last)
    this.app.use((error: Error, req: Request, res: Response, _next: express.NextFunction) => {
      logger.error('Webhook service error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    });
  }

  private setupHealthcheck(): void {
    this.app.get('/health', (req: Request, res: Response) => {
      const healthInfo = {
        status: 'ok',
        service: 'webhook-service',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        redis: {
          connected: this.redis ? this.redis.status === 'ready' : false,
          status: this.redis ? this.redis.status : 'initializing',
        },
        processor: {
          active_webhooks: this.webhookProcessor ? this.webhookProcessor.getActiveWebhookCount() : 0,
          total_deliveries: this.webhookProcessor ? this.webhookProcessor.getTotalDeliveries() : 0,
          failed_deliveries: this.webhookProcessor ? this.webhookProcessor.getFailedDeliveries() : 0,
          workflow_tracking: this.webhookProcessor ? this.webhookProcessor.getWorkflowStats() : { tracked: 0, completed: 0 },
        },
        request: {
          method: req.method,
          path: req.path,
          userAgent: req.headers['user-agent'] || 'unknown',
        },
      };

      logger.debug('Webhook service health check', healthInfo);
      res.json(healthInfo);
    });
  }

  private async testRedisConnection(): Promise<void> {
    // Simple ping-based test with robust error handling
    const testClient = new Redis(this.config.redisUrl, {
      lazyConnect: true,
      enableReadyCheck: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      commandTimeout: 3000,
    });

    // Suppress errors during testing
    testClient.on('error', () => {});

    try {
      await testClient.ping();
    } finally {
      try {
        await testClient.quit();
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  private async safeRedisOperation<T>(operation: () => Promise<T>, operationName: string): Promise<T | null> {
    // Wrapper for Redis operations that prevents crashes on disconnection
    try {
      return await operation();
    } catch (error) {
      logger.warn(`Webhook service Redis operation '${operationName}' failed (service continues):`, error.message);
      return null;
    }
  }

  private async connectToRedisWithRetry(): Promise<void> {
    const maxRetries = 999999; // Essentially infinite retries
    const retryInterval = 2000; // 2 seconds

    logger.info('🔄 Webhook service waiting for Redis to become available...');

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Test basic Redis connectivity
        await this.testRedisConnection();

        // If we get here, Redis is available - create ONE main connection and ONE subscriber
        this.redis = new Redis(this.config.redisUrl, {
          enableReadyCheck: false,
          lazyConnect: true,
          keepAlive: 30000,
          connectTimeout: 60000,
          commandTimeout: 15000,
          maxRetriesPerRequest: 5,
          autoResubscribe: true,
          autoResendUnfulfilledCommands: true,
        });

        const subscriber = new Redis(this.config.redisUrl, {
          enableReadyCheck: false,
          lazyConnect: true,
          keepAlive: 30000,
          connectTimeout: 60000,
          commandTimeout: 15000,
          maxRetriesPerRequest: 5,
          autoResubscribe: true,
          autoResendUnfulfilledCommands: true,
        });

        // Add robust error handlers with reconnection logic
        this.redis.on('error', (error) => {
          // Log error but don't crash - Redis client will auto-reconnect
          logger.warn('Webhook service Redis main connection error (auto-reconnecting):', error.message);
        });

        this.redis.on('reconnecting', (ms) => {
          logger.info(`Webhook service Redis main reconnecting in ${ms}ms...`);
        });

        this.redis.on('ready', () => {
          logger.info('Webhook service Redis main connection restored');
        });

        subscriber.on('error', (error) => {
          // Log error but don't crash - Redis client will auto-reconnect
          logger.warn('Webhook service Redis subscriber error (auto-reconnecting):', error.message);
        });

        subscriber.on('reconnecting', (ms) => {
          logger.info(`Webhook service Redis subscriber reconnecting in ${ms}ms...`);
        });

        subscriber.on('ready', () => {
          logger.info('Webhook service Redis subscriber connection restored');
        });

        // Test both connections
        await this.redis.ping();
        await subscriber.ping();

        // Create webhook processor with the established connections
        this.webhookProcessor = new WebhookProcessor(this.redis, this.config.telemetryClient, subscriber);

        // Now that webhookProcessor is initialized, set up webhook routes
        setupWebhookRoutes(this.app, this.webhookProcessor);
        logger.info('✅ Webhook routes configured with initialized processor');

        // Set up 404 and error handlers after all routes are configured
        this.setupFinalHandlers();
        logger.info('✅ Final handlers configured');

        logger.info('✅ Webhook service Redis connections established successfully');
        return;
      } catch (error) {
        // Only log every 30th attempt to reduce noise
        if (attempt === 1 || attempt % 30 === 0) {
          logger.info(`⏳ Webhook service waiting for Redis... (attempt ${attempt})`);
        }

        // Clean up failed connections
        if (this.redis) {
          try { await this.redis.quit(); } catch {}
          this.redis = null as any;
        }
        if (this.webhookProcessor) {
          this.webhookProcessor = null as any;
        }

        await new Promise(resolve => setTimeout(resolve, retryInterval));
      }
    }

    throw new Error('Failed to connect to Redis after maximum retries');
  }

  async start(): Promise<void> {
    try {
      // First, establish Redis connection with retry
      await this.connectToRedisWithRetry();

      // Start webhook processor (Redis event listener)
      await this.webhookProcessor.start();

      // Start HTTP server
      await new Promise<void>((resolve, reject) => {
        this.httpServer.listen(this.config.port, (error?: Error) => {
          if (error) {
            reject(error);
          } else {
            logger.info(`🚀 Webhook Service started`, {
              port: this.config.port,
              redis: this.config.redisUrl,
              pid: process.pid,
            });
            resolve();
          }
        });
      });
    } catch (error) {
      logger.error('Failed to start webhook service:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    logger.info('Stopping webhook service...');

    try {
      // Stop webhook processor
      await this.webhookProcessor.stop();

      // Close HTTP server
      await new Promise<void>(resolve => {
        this.httpServer.close(() => {
          logger.info('HTTP server closed');
          resolve();
        });
      });

      // Close Redis connection
      await this.redis.quit();
      logger.info('✅ Webhook service stopped gracefully');
    } catch (error) {
      logger.error('Error stopping webhook service:', error);
      throw error;
    }
  }

  getWebhookProcessor(): WebhookProcessor {
    return this.webhookProcessor;
  }
}
