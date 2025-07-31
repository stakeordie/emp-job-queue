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
    this.redis = new Redis(config.redisUrl);
    this.webhookProcessor = new WebhookProcessor(this.redis);

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // CORS support
    this.app.use(
      cors({
        origin: this.config.corsOrigins || ['*'],
        credentials: true,
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

    // Webhook management routes
    setupWebhookRoutes(this.app, this.webhookProcessor);

    // 404 handler
    this.app.use('*', (req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
      });
    });

    // Error handler
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
          connected: this.redis.status === 'ready',
          status: this.redis.status,
        },
        processor: {
          active_webhooks: this.webhookProcessor.getActiveWebhookCount(),
          total_deliveries: this.webhookProcessor.getTotalDeliveries(),
          failed_deliveries: this.webhookProcessor.getFailedDeliveries(),
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

  async start(): Promise<void> {
    try {
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
