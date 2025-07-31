/**
 * Webhook Routes
 * 
 * Express routes for webhook management API endpoints.
 * Handles CRUD operations for webhook configurations and delivery monitoring.
 */

import { Router, Request, Response } from 'express';
import { WebhookProcessor } from '../webhook-processor.js';
import { logger, WebhookEventType, WebhookRetryConfig } from '@emp/core';

interface WebhookRequestBody {
  url?: string;
  events?: WebhookEventType[];
  active?: boolean;
  secret?: string;
  filters?: {
    job_types?: string[];
    priorities?: string[];
    machine_ids?: string[];
    worker_ids?: string[];
  };
  retry_config?: WebhookRetryConfig;
}

export function setupWebhookRoutes(app: any, webhookProcessor: WebhookProcessor): void {
  const router = Router();

  // POST /webhooks - Register a new webhook
  router.post('/', async (req: Request, res: Response) => {
    try {
      const config: WebhookRequestBody = req.body;

      // Validate required fields
      if (!config.url) {
        return res.status(400).json({
          success: false,
          error: 'URL is required',
        });
      }

      if (!config.events || !Array.isArray(config.events) || config.events.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Events array is required and must not be empty',
        });
      }

      // Validate URL format
      try {
        new URL(config.url);
      } catch {
        return res.status(400).json({
          success: false,
          error: 'Invalid URL format',
        });
      }

      const webhook = await webhookProcessor.registerWebhook({
        url: config.url,
        events: config.events,
        active: config.active ?? true,
        secret: config.secret,
        filters: config.filters || {},
        retry_config: config.retry_config || {
          max_attempts: 3,
          initial_delay_ms: 1000,
          backoff_multiplier: 2,
          max_delay_ms: 30000,
        },
      });

      logger.info('Webhook registered', {
        webhook_id: webhook.id,
        url: webhook.url,
        events: webhook.events,
      });

      res.status(201).json({
        success: true,
        data: webhook,
      });
    } catch (error) {
      logger.error('Error registering webhook:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // GET /webhooks - List all webhooks
  router.get('/', async (req: Request, res: Response) => {
    try {
      const webhooks = await webhookProcessor.getWebhooks();
      res.json({
        success: true,
        data: webhooks,
        count: webhooks.length,
      });
    } catch (error) {
      logger.error('Error fetching webhooks:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // GET /webhooks/:id - Get specific webhook
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const webhook = await webhookProcessor.getWebhook(id);

      if (!webhook) {
        return res.status(404).json({
          success: false,
          error: 'Webhook not found',
        });
      }

      res.json({
        success: true,
        data: webhook,
      });
    } catch (error) {
      logger.error('Error fetching webhook:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // PUT /webhooks/:id - Update webhook
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updates: WebhookRequestBody = req.body;

      // Validate URL if provided
      if (updates.url) {
        try {
          new URL(updates.url);
        } catch {
          return res.status(400).json({
            success: false,
            error: 'Invalid URL format',
          });
        }
      }

      const webhook = await webhookProcessor.updateWebhook(id, updates);

      if (!webhook) {
        return res.status(404).json({
          success: false,
          error: 'Webhook not found',
        });
      }

      logger.info('Webhook updated', {
        webhook_id: webhook.id,
        updates: Object.keys(updates),
      });

      res.json({
        success: true,
        data: webhook,
      });
    } catch (error) {
      logger.error('Error updating webhook:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // DELETE /webhooks/:id - Delete webhook
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const deleted = await webhookProcessor.deleteWebhook(id);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: 'Webhook not found',
        });
      }

      logger.info('Webhook deleted', { webhook_id: id });

      res.json({
        success: true,
        message: 'Webhook deleted successfully',
      });
    } catch (error) {
      logger.error('Error deleting webhook:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // POST /webhooks/:id/test - Test webhook delivery
  router.post('/:id/test', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const success = await webhookProcessor.testWebhook(id);

      if (!success) {
        return res.status(404).json({
          success: false,
          error: 'Webhook not found or test failed',
        });
      }

      logger.info('Webhook test sent', { webhook_id: id });

      res.json({
        success: true,
        message: 'Test webhook sent successfully',
      });
    } catch (error) {
      logger.error('Error testing webhook:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // GET /webhooks/:id/stats - Get webhook delivery statistics
  router.get('/:id/stats', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const stats = await webhookProcessor.getWebhookStats(id);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Error fetching webhook stats:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // GET /webhooks/:id/deliveries - Get webhook delivery history
  router.get('/:id/deliveries', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const deliveries = await webhookProcessor.getWebhookDeliveryHistory(id, limit);

      res.json({
        success: true,
        data: deliveries,
        limit,
      });
    } catch (error) {
      logger.error('Error fetching webhook deliveries:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // GET /stats - Get overall webhook statistics
  router.get('/stats/summary', async (req: Request, res: Response) => {
    try {
      const stats = await webhookProcessor.getWebhookStats();
      const summary = await webhookProcessor.getWebhookSummary();
      const eventStats = webhookProcessor.getEventStats();

      res.json({
        success: true,
        data: {
          delivery_stats: stats,
          webhook_summary: summary,
          event_processing: eventStats,
        },
      });
    } catch (error) {
      logger.error('Error fetching webhook summary:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // GET /deliveries/recent - Get recent deliveries across all webhooks
  router.get('/deliveries/recent', async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const deliveries = await webhookProcessor.getRecentDeliveries(limit);

      res.json({
        success: true,
        data: deliveries,
        limit,
      });
    } catch (error) {
      logger.error('Error fetching recent deliveries:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Mount the webhook routes under /webhooks
  app.use('/webhooks', router);

  // Additional stats routes mounted directly
  app.use('/stats', router);
  app.use('/deliveries', router);

  logger.info('✅ Webhook routes configured', {
    endpoints: [
      'POST /webhooks',
      'GET /webhooks',
      'GET /webhooks/:id',
      'PUT /webhooks/:id',
      'DELETE /webhooks/:id',
      'POST /webhooks/:id/test',
      'GET /webhooks/:id/stats',
      'GET /webhooks/:id/deliveries',
      'GET /stats/summary',
      'GET /deliveries/recent',
    ],
  });
}