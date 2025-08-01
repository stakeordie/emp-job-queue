/**
 * Webhook Routes
 *
 * Express routes for webhook management API endpoints.
 * Handles CRUD operations for webhook configurations and delivery monitoring.
 */

import { Router, Request, Response, Express } from 'express';
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

export function setupWebhookRoutes(app: Express, webhookProcessor: WebhookProcessor): void {
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

  // Mount the webhook routes under /webhooks
  app.use('/webhooks', router);

  // Mount stats and deliveries routes directly on app (not through router)
  app.get('/stats/summary', async (req: Request, res: Response) => {
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

  app.get('/deliveries/recent', async (req: Request, res: Response) => {
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

  // =================
  // Test Receiver Routes
  // =================

  // POST /test-receivers - Create a new test receiver
  app.post('/test-receivers', async (req: Request, res: Response) => {
    try {
      const webhookStorage = webhookProcessor.getWebhookStorage();
      await webhookStorage.cleanupExpiredTestReceivers();

      // Check if we're at the limit
      const allReceivers = await webhookStorage.getAllTestReceivers();
      const MAX_RECEIVERS = 100;
      if (allReceivers.length >= MAX_RECEIVERS) {
        return res.status(429).json({
          success: false,
          error: 'Maximum number of test receivers reached. Try again later.',
        });
      }

      const receiver = await webhookStorage.createTestReceiver();

      logger.info(`Test receiver created: ${receiver.id}`);

      res.status(201).json({
        success: true,
        data: {
          id: receiver.id,
          url: receiver.url,
          view_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/webhook-test?receiver=${receiver.id}`,
          created_at: receiver.created_at,
          expires_at: receiver.expires_at,
          expires_in_hours: 24,
        },
      });
    } catch (error) {
      logger.error('Error creating test receiver:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create test receiver',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // GET /test-receivers - Get all active test receivers (for debugging)
  app.get('/test-receivers', async (req: Request, res: Response) => {
    try {
      const webhookStorage = webhookProcessor.getWebhookStorage();
      await webhookStorage.cleanupExpiredTestReceivers();
      
      const allReceivers = await webhookStorage.getAllTestReceivers();
      const receivers = allReceivers.map(receiver => ({
        id: receiver.id,
        url: receiver.url,
        created_at: receiver.created_at,
        expires_at: receiver.expires_at,
        request_count: receiver.requests.length,
      }));

      res.json({
        success: true,
        data: receivers,
        total: receivers.length,
        max_receivers: 100,
      });
    } catch (error) {
      logger.error('Error fetching test receivers:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch test receivers',
      });
    }
  });

  // GET /test-receivers/:id/requests - Get all requests for a test receiver
  app.get('/test-receivers/:id/requests', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const webhookStorage = webhookProcessor.getWebhookStorage();
      
      const receiver = await webhookStorage.getTestReceiver(id);
      if (!receiver) {
        return res.status(404).json({
          success: false,
          error: 'Test receiver not found',
        });
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const requests = receiver.requests.slice(0, limit);

      res.json({
        success: true,
        data: {
          receiver_id: receiver.id,
          receiver_url: receiver.url,
          created_at: receiver.created_at,
          expires_at: receiver.expires_at,
          requests: requests,
          total_requests: receiver.requests.length,
          returned_count: requests.length,
        },
      });
    } catch (error) {
      logger.error(`Error fetching requests for test receiver ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch test receiver requests',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // DELETE /test-receivers/:id/requests - Clear all requests for a test receiver
  app.delete('/test-receivers/:id/requests', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const webhookStorage = webhookProcessor.getWebhookStorage();
      
      const clearedCount = await webhookStorage.clearTestReceiverRequests(id);
      
      if (clearedCount === 0) {
        const receiver = await webhookStorage.getTestReceiver(id);
        if (!receiver) {
          return res.status(404).json({
            success: false,
            error: 'Test receiver not found',
          });
        }
      }

      logger.info(`Cleared ${clearedCount} requests for test receiver ${id}`);

      res.json({
        success: true,
        message: `Cleared ${clearedCount} test receiver requests`,
        cleared_count: clearedCount,
      });
    } catch (error) {
      logger.error(`Error clearing requests for test receiver ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to clear test receiver requests',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Handle webhook test receiver requests (catch-all for any HTTP method)
  const handleTestReceiverRequest = async (req: Request, res: Response) => {
    const { id } = req.params;
    
    try {
      const webhookStorage = webhookProcessor.getWebhookStorage();
      const receiver = await webhookStorage.getTestReceiver(id);
      
      if (!receiver) {
        return res.status(404).json({
          success: false,
          error: 'Test receiver not found',
          message: 'This test receiver URL may have expired or been deleted',
        });
      }

      // Parse request body
      let body: unknown = null;
      const contentType = req.headers['content-type'] || '';
      
      if (contentType.includes('application/json')) {
        body = req.body;
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        body = req.body;
      } else {
        // For other content types, body should already be parsed by Express
        body = req.body;
      }

      // Extract query parameters
      const query: Record<string, string> = {};
      Object.entries(req.query).forEach(([key, value]) => {
        query[key] = String(value);
      });

      // Create test receiver request record
      const testRequest = {
        id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        method: req.method,
        headers: req.headers as any,
        body: body,
        query: query,
        user_agent: req.headers['user-agent'],
        ip: req.ip || req.connection.remoteAddress || 'unknown',
      };

      await webhookStorage.addTestReceiverRequest(id, testRequest);

      logger.debug(`Test receiver ${id} received ${req.method} request`, {
        request_id: testRequest.id,
        method: req.method,
      });

      // Return success response
      res.json({
        success: true,
        message: 'Test webhook received successfully',
        receiver_id: id,
        request_id: testRequest.id,
        timestamp: testRequest.timestamp,
      });
    } catch (error) {
      logger.error(`Error processing test receiver request for ${id}:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to process test receiver request',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  // Mount test receiver webhook handler for all HTTP methods
  ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].forEach(method => {
    (app as any)[method]('/test-receivers/:id/webhook', handleTestReceiverRequest);
  });

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
      'POST /test-receivers',
      'GET /test-receivers',
      'GET /test-receivers/:id/requests',
      'DELETE /test-receivers/:id/requests',
      'ALL /test-receivers/:id/webhook',
    ],
  });
}
