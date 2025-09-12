/**
 * Redis-backed Webhook Storage
 *
 * Provides persistent storage for webhook configurations and delivery statistics
 * in Redis, enabling multi-instance support and recovery across restarts.
 */

import { Redis } from 'ioredis';
import { logger } from '../utils/logger.js';
import { smartTruncateObject } from '../utils/payload-truncation.js';
import { WebhookEndpoint, WebhookDeliveryAttempt } from './webhook-notification-service.js';

export interface WebhookDeliveryStats {
  webhook_id: string;
  total_deliveries: number;
  successful_deliveries: number;
  failed_deliveries: number;
  last_delivery_at?: number;
  last_success_at?: number;
  last_failure_at?: number;
  average_response_time_ms?: number;
}

export interface WebhookDeliveryHistory {
  webhook_id: string;
  attempts: WebhookDeliveryAttempt[];
  total_count: number;
}

export interface WebhookTestReceiver {
  id: string;
  created_at: number;
  expires_at: number;
  url: string;
  requests: WebhookTestReceiverRequest[];
}

export interface WebhookTestReceiverRequest {
  id: string;
  timestamp: number;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  query: Record<string, string>;
  user_agent?: string;
  ip?: string;
}

export class WebhookRedisStorage {
  private redis: Redis;

  // Redis key patterns
  private static readonly WEBHOOK_KEY = 'webhooks:registry';
  private static readonly WEBHOOK_STATS_KEY = (id: string) => `webhooks:stats:${id}`;
  private static readonly WEBHOOK_ATTEMPTS_KEY = (id: string) => `webhooks:attempts:${id}`;
  private static readonly WEBHOOK_ACTIVE_SET = 'webhooks:active';
  private static readonly WEBHOOK_DELIVERY_LOG = 'webhooks:delivery_log';

  // Test receiver key patterns
  private static readonly TEST_RECEIVER_KEY = (id: string) => `webhook_test_receiver:${id}`;
  private static readonly TEST_RECEIVER_SET = 'webhook_test_receivers:active';

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Store webhook configuration in Redis
   */
  async storeWebhook(webhook: WebhookEndpoint): Promise<void> {
    const key = WebhookRedisStorage.WEBHOOK_KEY;

    try {
      // Store webhook configuration
      await this.redis.hset(key, webhook.id, JSON.stringify(webhook));

      // Add to active set if active
      if (webhook.active) {
        await this.redis.sadd(WebhookRedisStorage.WEBHOOK_ACTIVE_SET, webhook.id);
      } else {
        await this.redis.srem(WebhookRedisStorage.WEBHOOK_ACTIVE_SET, webhook.id);
      }

      // Initialize stats if new webhook
      const statsKey = WebhookRedisStorage.WEBHOOK_STATS_KEY(webhook.id);
      const exists = await this.redis.exists(statsKey);
      if (!exists) {
        await this.initializeWebhookStats(webhook.id);
      }

      logger.debug(`Webhook stored in Redis: ${webhook.id}`, {
        url: webhook.url,
        events: webhook.events,
      });
    } catch (error) {
      logger.error(`Failed to store webhook ${webhook.id} in Redis:`, error);
      throw error;
    }
  }

  /**
   * Retrieve webhook configuration from Redis
   */
  async getWebhook(webhookId: string): Promise<WebhookEndpoint | null> {
    try {
      const webhookData = await this.redis.hget(WebhookRedisStorage.WEBHOOK_KEY, webhookId);
      if (!webhookData) {
        return null;
      }

      return JSON.parse(webhookData) as WebhookEndpoint;
    } catch (error) {
      logger.error(`Failed to get webhook ${webhookId} from Redis:`, error);
      return null;
    }
  }

  /**
   * Get all webhook configurations
   */
  async getAllWebhooks(): Promise<WebhookEndpoint[]> {
    try {
      const webhookData = await this.redis.hgetall(WebhookRedisStorage.WEBHOOK_KEY);
      const webhooks: WebhookEndpoint[] = [];

      for (const [_id, data] of Object.entries(webhookData)) {
        try {
          const webhook = JSON.parse(data) as WebhookEndpoint;
          webhooks.push(webhook);
        } catch (parseError) {
          logger.warn(`Failed to parse webhook data:`, parseError);
        }
      }

      return webhooks.sort((a, b) => b.created_at - a.created_at);
    } catch (error) {
      logger.error('Failed to get all webhooks from Redis:', error);
      return [];
    }
  }

  /**
   * Get only active webhooks for efficient event processing
   */
  async getActiveWebhooks(): Promise<WebhookEndpoint[]> {
    try {
      const activeIds = await this.redis.smembers(WebhookRedisStorage.WEBHOOK_ACTIVE_SET);
      if (activeIds.length === 0) {
        return [];
      }

      const webhooks: WebhookEndpoint[] = [];
      for (const id of activeIds) {
        const webhook = await this.getWebhook(id);
        if (webhook && webhook.active) {
          webhooks.push(webhook);
        }
      }

      return webhooks;
    } catch (error) {
      logger.error('Failed to get active webhooks from Redis:', error);
      return [];
    }
  }

  /**
   * Update webhook configuration
   */
  async updateWebhook(
    webhookId: string,
    updates: Partial<WebhookEndpoint>
  ): Promise<WebhookEndpoint | null> {
    try {
      const existing = await this.getWebhook(webhookId);
      if (!existing) {
        return null;
      }

      const updated: WebhookEndpoint = {
        ...existing,
        ...updates,
        id: webhookId, // Prevent ID changes
        updated_at: Date.now(),
      };

      await this.storeWebhook(updated);
      return updated;
    } catch (error) {
      logger.error(`Failed to update webhook ${webhookId} in Redis:`, error);
      return null;
    }
  }

  /**
   * Delete webhook configuration and related data
   */
  async deleteWebhook(webhookId: string): Promise<boolean> {
    try {
      const pipeline = this.redis.pipeline();

      // Remove from main registry
      pipeline.hdel(WebhookRedisStorage.WEBHOOK_KEY, webhookId);

      // Remove from active set
      pipeline.srem(WebhookRedisStorage.WEBHOOK_ACTIVE_SET, webhookId);

      // Clean up stats and attempts (optional - you might want to keep for audit)
      pipeline.del(WebhookRedisStorage.WEBHOOK_STATS_KEY(webhookId));
      pipeline.del(WebhookRedisStorage.WEBHOOK_ATTEMPTS_KEY(webhookId));

      const results = await pipeline.exec();
      const deleted = results?.[0]?.[1] as number;

      if (deleted > 0) {
        logger.info(`Webhook deleted from Redis: ${webhookId}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error(`Failed to delete webhook ${webhookId} from Redis:`, error);
      return false;
    }
  }

  /**
   * Record webhook delivery attempt
   */
  async recordDeliveryAttempt(attempt: WebhookDeliveryAttempt): Promise<void> {
    try {
      // Get webhook details to include URL in delivery log
      const webhook = await this.getWebhook(attempt.webhook_id);

      const pipeline = this.redis.pipeline();

      // Store attempt details
      const attemptsKey = WebhookRedisStorage.WEBHOOK_ATTEMPTS_KEY(attempt.webhook_id);
      pipeline.lpush(attemptsKey, JSON.stringify(attempt));
      pipeline.ltrim(attemptsKey, 0, 99); // Keep last 100 attempts

      // Update statistics
      const statsKey = WebhookRedisStorage.WEBHOOK_STATS_KEY(attempt.webhook_id);
      pipeline.hincrby(statsKey, 'total_deliveries', 1);

      if (attempt.success) {
        pipeline.hincrby(statsKey, 'successful_deliveries', 1);
        pipeline.hset(statsKey, 'last_success_at', attempt.timestamp);
      } else {
        pipeline.hincrby(statsKey, 'failed_deliveries', 1);
        pipeline.hset(statsKey, 'last_failure_at', attempt.timestamp);
      }

      pipeline.hset(statsKey, 'last_delivery_at', attempt.timestamp);

      // Add to global delivery log (for monitoring dashboard)
      const logEntry = {
        webhook_id: attempt.webhook_id,
        event_id: attempt.event_id,
        event_type: attempt.event_type, // Include the event type for audit trail
        success: attempt.success,
        timestamp: attempt.timestamp,
        attempt_number: attempt.attempt_number,
        response_status: attempt.response_status,
        error_message: attempt.error_message,
        response_body: attempt.response_body,
        url: webhook?.url, // Include the webhook URL for debugging
      };
      pipeline.lpush(WebhookRedisStorage.WEBHOOK_DELIVERY_LOG, JSON.stringify(logEntry));
      pipeline.ltrim(WebhookRedisStorage.WEBHOOK_DELIVERY_LOG, 0, 999); // Keep last 1000 deliveries

      await pipeline.exec();

      logger.debug(`Delivery attempt recorded for webhook ${attempt.webhook_id}`, {
        success: attempt.success,
        attempt_number: attempt.attempt_number,
        url: webhook?.url,
      });
    } catch (error) {
      logger.error(`Failed to record delivery attempt for webhook ${attempt.webhook_id}:`, error);
    }
  }

  /**
   * Get webhook delivery statistics
   */
  async getWebhookStats(webhookId: string): Promise<WebhookDeliveryStats | null> {
    try {
      const statsKey = WebhookRedisStorage.WEBHOOK_STATS_KEY(webhookId);
      const stats = await this.redis.hgetall(statsKey);

      if (Object.keys(stats).length === 0) {
        return null;
      }

      return {
        webhook_id: webhookId,
        total_deliveries: parseInt(stats.total_deliveries || '0'),
        successful_deliveries: parseInt(stats.successful_deliveries || '0'),
        failed_deliveries: parseInt(stats.failed_deliveries || '0'),
        last_delivery_at: stats.last_delivery_at ? parseInt(stats.last_delivery_at) : undefined,
        last_success_at: stats.last_success_at ? parseInt(stats.last_success_at) : undefined,
        last_failure_at: stats.last_failure_at ? parseInt(stats.last_failure_at) : undefined,
        average_response_time_ms: stats.average_response_time_ms
          ? parseFloat(stats.average_response_time_ms)
          : undefined,
      };
    } catch (error) {
      logger.error(`Failed to get webhook stats for ${webhookId}:`, error);
      return null;
    }
  }

  /**
   * Get webhook delivery history
   */
  async getWebhookDeliveryHistory(webhookId: string, limit = 50): Promise<WebhookDeliveryHistory> {
    try {
      const attemptsKey = WebhookRedisStorage.WEBHOOK_ATTEMPTS_KEY(webhookId);
      const [attempts, totalCount] = await Promise.all([
        this.redis.lrange(attemptsKey, 0, limit - 1),
        this.redis.llen(attemptsKey),
      ]);

      const parsedAttempts: WebhookDeliveryAttempt[] = [];
      for (const attemptData of attempts) {
        try {
          const attempt = JSON.parse(attemptData) as WebhookDeliveryAttempt;
          parsedAttempts.push(attempt);
        } catch (parseError) {
          logger.warn('Failed to parse delivery attempt data:', parseError);
        }
      }

      return {
        webhook_id: webhookId,
        attempts: parsedAttempts,
        total_count: totalCount,
      };
    } catch (error) {
      logger.error(`Failed to get delivery history for webhook ${webhookId}:`, error);
      return {
        webhook_id: webhookId,
        attempts: [],
        total_count: 0,
      };
    }
  }

  /**
   * Get recent webhook deliveries across all webhooks (for dashboard)
   */
  async getRecentDeliveries(limit = 100): Promise<
    Array<{
      webhook_id: string;
      event_id: string;
      event_type: string;
      success: boolean;
      timestamp: number;
      attempt_number: number;
      response_status?: number;
      error_message?: string;
      response_body?: string;
      url?: string;
    }>
  > {
    try {
      const deliveries = await this.redis.lrange(
        WebhookRedisStorage.WEBHOOK_DELIVERY_LOG,
        0,
        limit - 1
      );
      const parsedDeliveries = [];

      for (const deliveryData of deliveries) {
        try {
          const delivery = JSON.parse(deliveryData);
          parsedDeliveries.push(delivery);
        } catch (parseError) {
          logger.warn('Failed to parse delivery log entry:', parseError);
        }
      }

      return parsedDeliveries;
    } catch (error) {
      logger.error('Failed to get recent deliveries:', error);
      return [];
    }
  }

  /**
   * Get webhook summary statistics for dashboard
   */
  async getWebhookSummary(): Promise<{
    total_webhooks: number;
    active_webhooks: number;
    total_deliveries_today: number;
    successful_deliveries_today: number;
    failed_deliveries_today: number;
  }> {
    try {
      const [totalWebhooks, activeWebhooks, recentDeliveries] = await Promise.all([
        this.redis.hlen(WebhookRedisStorage.WEBHOOK_KEY),
        this.redis.scard(WebhookRedisStorage.WEBHOOK_ACTIVE_SET),
        this.getRecentDeliveries(1000), // Get more for daily stats
      ]);

      // Calculate today's stats
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayStartMs = todayStart.getTime();

      const todayDeliveries = recentDeliveries.filter(d => d.timestamp >= todayStartMs);
      const successfulToday = todayDeliveries.filter(d => d.success).length;
      const failedToday = todayDeliveries.length - successfulToday;

      return {
        total_webhooks: totalWebhooks,
        active_webhooks: activeWebhooks,
        total_deliveries_today: todayDeliveries.length,
        successful_deliveries_today: successfulToday,
        failed_deliveries_today: failedToday,
      };
    } catch (error) {
      logger.error('Failed to get webhook summary:', error);
      return {
        total_webhooks: 0,
        active_webhooks: 0,
        total_deliveries_today: 0,
        successful_deliveries_today: 0,
        failed_deliveries_today: 0,
      };
    }
  }

  /**
   * Initialize webhook statistics
   */
  private async initializeWebhookStats(webhookId: string): Promise<void> {
    const statsKey = WebhookRedisStorage.WEBHOOK_STATS_KEY(webhookId);
    await this.redis.hmset(statsKey, {
      total_deliveries: 0,
      successful_deliveries: 0,
      failed_deliveries: 0,
    });
  }

  /**
   * Cleanup old webhook data (maintenance function)
   */
  async cleanupOldData(olderThanDays = 30): Promise<{
    deleted_attempts: number;
    deleted_logs: number;
  }> {
    const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    let deletedAttempts = 0;
    let deletedLogs = 0;

    try {
      // Clean up old delivery attempts for each webhook
      const webhooks = await this.getAllWebhooks();
      for (const webhook of webhooks) {
        const attemptsKey = WebhookRedisStorage.WEBHOOK_ATTEMPTS_KEY(webhook.id);
        const attempts = await this.redis.lrange(attemptsKey, 0, -1);

        const validAttempts = [];
        for (const attemptData of attempts) {
          try {
            const attempt = JSON.parse(attemptData) as WebhookDeliveryAttempt;
            if (attempt.timestamp > cutoffTime) {
              validAttempts.push(attemptData);
            } else {
              deletedAttempts++;
            }
          } catch (parseError) {
            deletedAttempts++; // Remove invalid data
          }
        }

        // Replace with cleaned data
        if (validAttempts.length !== attempts.length) {
          await this.redis.del(attemptsKey);
          if (validAttempts.length > 0) {
            await this.redis.lpush(attemptsKey, ...validAttempts);
          }
        }
      }

      // Clean up old delivery logs
      const logs = await this.redis.lrange(WebhookRedisStorage.WEBHOOK_DELIVERY_LOG, 0, -1);
      const validLogs = [];
      for (const logData of logs) {
        try {
          const log = JSON.parse(logData);
          if (log.timestamp > cutoffTime) {
            validLogs.push(logData);
          } else {
            deletedLogs++;
          }
        } catch (parseError) {
          deletedLogs++; // Remove invalid data
        }
      }

      // Replace with cleaned data
      if (validLogs.length !== logs.length) {
        await this.redis.del(WebhookRedisStorage.WEBHOOK_DELIVERY_LOG);
        if (validLogs.length > 0) {
          await this.redis.lpush(WebhookRedisStorage.WEBHOOK_DELIVERY_LOG, ...validLogs);
        }
      }

      logger.info(`Webhook cleanup completed`, {
        deleted_attempts: deletedAttempts,
        deleted_logs: deletedLogs,
        cutoff_days: olderThanDays,
      });

      return { deleted_attempts: deletedAttempts, deleted_logs: deletedLogs };
    } catch (error) {
      logger.error('Failed to cleanup old webhook data:', error);
      return { deleted_attempts: 0, deleted_logs: 0 };
    }
  }

  // ======================
  // Test Receiver Methods
  // ======================

  /**
   * Create a new webhook test receiver
   */
  async createTestReceiver(): Promise<WebhookTestReceiver> {
    const id = this.generateTestReceiverId();
    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours

    const receiver: WebhookTestReceiver = {
      id,
      created_at: now,
      expires_at: expiresAt,
      url: `${process.env.WEBHOOK_SERVICE_URL || 'http://localhost:3332'}/test-receivers/${id}/webhook`,
      requests: [],
    };

    // Store receiver in Redis with expiration
    const key = WebhookRedisStorage.TEST_RECEIVER_KEY(id);
    await this.redis.setex(key, 24 * 3600, JSON.stringify(receiver)); // 24 hours

    // Add to active set
    await this.redis.sadd(WebhookRedisStorage.TEST_RECEIVER_SET, id);

    logger.debug(`Test receiver created: ${id}`, {
      expires_at: new Date(expiresAt).toISOString(),
    });

    return receiver;
  }

  /**
   * Get a webhook test receiver by ID
   */
  async getTestReceiver(id: string): Promise<WebhookTestReceiver | null> {
    try {
      const key = WebhookRedisStorage.TEST_RECEIVER_KEY(id);
      const data = await this.redis.get(key);

      if (!data) {
        // Remove from active set if not found
        await this.redis.srem(WebhookRedisStorage.TEST_RECEIVER_SET, id);
        return null;
      }

      const receiver = JSON.parse(data) as WebhookTestReceiver;

      // Check if expired
      if (receiver.expires_at < Date.now()) {
        await this.deleteTestReceiver(id);
        return null;
      }

      return receiver;
    } catch (error) {
      logger.error(`Error getting test receiver ${id}:`, error);
      return null;
    }
  }

  /**
   * Add a request to a webhook test receiver
   */
  async addTestReceiverRequest(
    receiverId: string,
    request: WebhookTestReceiverRequest
  ): Promise<boolean> {
    try {
      const receiver = await this.getTestReceiver(receiverId);
      if (!receiver) {
        return false;
      }

      // Add request to the beginning of the array
      receiver.requests.unshift(request);

      // Keep only the last 100 requests
      if (receiver.requests.length > 100) {
        receiver.requests = receiver.requests.slice(0, 100);
      }

      // Save updated receiver back to Redis
      const key = WebhookRedisStorage.TEST_RECEIVER_KEY(receiverId);
      const ttl = await this.redis.ttl(key);

      if (ttl > 0) {
        await this.redis.setex(key, ttl, JSON.stringify(receiver));
        return true;
      } else {
        // TTL expired, remove from active set
        await this.redis.srem(WebhookRedisStorage.TEST_RECEIVER_SET, receiverId);
        return false;
      }
    } catch (error) {
      logger.error(`Error adding request to test receiver ${receiverId}:`, error);
      return false;
    }
  }

  /**
   * Get all requests for a test receiver
   */
  async getTestReceiverRequests(receiverId: string): Promise<WebhookTestReceiverRequest[]> {
    const receiver = await this.getTestReceiver(receiverId);
    return receiver?.requests || [];
  }

  /**
   * Clear all requests for a test receiver
   */
  async clearTestReceiverRequests(receiverId: string): Promise<number> {
    try {
      const receiver = await this.getTestReceiver(receiverId);
      if (!receiver) {
        return 0;
      }

      const requestCount = receiver.requests.length;
      receiver.requests = [];

      // Save updated receiver back to Redis
      const key = WebhookRedisStorage.TEST_RECEIVER_KEY(receiverId);
      const ttl = await this.redis.ttl(key);

      if (ttl > 0) {
        await this.redis.setex(key, ttl, JSON.stringify(receiver));
      }

      return requestCount;
    } catch (error) {
      logger.error(`Error clearing requests for test receiver ${receiverId}:`, error);
      return 0;
    }
  }

  /**
   * Delete a webhook test receiver
   */
  async deleteTestReceiver(id: string): Promise<boolean> {
    try {
      const key = WebhookRedisStorage.TEST_RECEIVER_KEY(id);
      const deleted = await this.redis.del(key);
      await this.redis.srem(WebhookRedisStorage.TEST_RECEIVER_SET, id);

      if (deleted > 0) {
        logger.debug(`Test receiver deleted: ${id}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error(`Error deleting test receiver ${id}:`, error);
      return false;
    }
  }

  /**
   * Get all active test receivers
   */
  async getAllTestReceivers(): Promise<WebhookTestReceiver[]> {
    try {
      const activeIds = await this.redis.smembers(WebhookRedisStorage.TEST_RECEIVER_SET);
      const receivers: WebhookTestReceiver[] = [];

      for (const id of activeIds) {
        const receiver = await this.getTestReceiver(id);
        if (receiver) {
          receivers.push(receiver);
        }
      }

      return receivers.sort((a, b) => b.created_at - a.created_at);
    } catch (error) {
      logger.error('Error getting all test receivers:', error);
      return [];
    }
  }

  /**
   * Cleanup expired test receivers
   */
  async cleanupExpiredTestReceivers(): Promise<number> {
    try {
      const activeIds = await this.redis.smembers(WebhookRedisStorage.TEST_RECEIVER_SET);
      let cleanedCount = 0;

      for (const id of activeIds) {
        const key = WebhookRedisStorage.TEST_RECEIVER_KEY(id);
        const exists = await this.redis.exists(key);

        if (!exists) {
          await this.redis.srem(WebhookRedisStorage.TEST_RECEIVER_SET, id);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.debug(`Cleaned up ${cleanedCount} expired test receivers`);
      }

      return cleanedCount;
    } catch (error) {
      logger.error('Error during test receiver cleanup:', error);
      return 0;
    }
  }

  /**
   * Generate a unique test receiver ID
   */
  private generateTestReceiverId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 16; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
