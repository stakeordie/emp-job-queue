/**
 * Webhook Processor
 *
 * Core webhook processing logic that:
 * 1. Listens to Redis events from the job broker
 * 2. Matches events to registered webhooks
 * 3. Delivers HTTP notifications with retry logic
 * 4. Manages webhook registration and storage via Redis
 */

import { EventEmitter } from 'events';
import Redis from 'ioredis';
import {
  logger,
  WebhookNotificationService,
  WebhookRedisStorage,
  WebhookEndpoint,
} from '@emp/core';

interface RedisJobEvent {
  type: string;
  job_id?: string;
  worker_id?: string;
  machine_id?: string;
  timestamp: number;
  data?: unknown;
  [key: string]: unknown;
}

export class WebhookProcessor extends EventEmitter {
  private redis: Redis;
  private subscriber: Redis;
  private webhookService: WebhookNotificationService;
  private webhookStorage: WebhookRedisStorage;
  private isProcessing = false;
  private eventStats = {
    totalEvents: 0,
    processedEvents: 0,
    skippedEvents: 0,
    failedEvents: 0,
  };

  // Redis channels to subscribe to
  private readonly EVENT_CHANNELS = [
    'job.events', // Job lifecycle events
    'worker.events', // Worker status events
    'machine.events', // Machine status events
  ];

  constructor(redis: Redis) {
    super();
    this.redis = redis;
    this.subscriber = new Redis(redis.options);
    this.webhookStorage = new WebhookRedisStorage(redis);
    this.webhookService = new WebhookNotificationService(redis);

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Handle Redis connection events
    this.subscriber.on('connect', () => {
      logger.info('✅ Webhook processor connected to Redis');
    });

    this.subscriber.on('error', error => {
      logger.error('❌ Webhook processor Redis error:', error);
      this.emit('error', error);
    });

    // Handle Redis messages
    this.subscriber.on('message', (channel: string, message: string) => {
      this.handleRedisEvent(channel, message).catch(error => {
        logger.error('Error handling Redis event:', { channel, error });
        this.eventStats.failedEvents++;
      });
    });

    // Handle webhook service events
    this.webhookService.on('webhook.delivered', data => {
      logger.debug('Webhook delivered successfully', {
        webhook_id: data.webhook.id,
        event_id: data.payload.event_id,
      });
      this.emit('webhook.delivered', data);
    });

    this.webhookService.on('webhook.failed', data => {
      logger.warn('Webhook delivery failed permanently', {
        webhook_id: data.webhook.id,
        event_id: data.payload.event_id,
        error: data.attempt.error_message,
      });
      this.emit('webhook.failed', data);
    });
  }

  async start(): Promise<void> {
    if (this.isProcessing) {
      logger.warn('Webhook processor already running');
      return;
    }

    try {
      // Subscribe to Redis event channels
      await this.subscriber.subscribe(...this.EVENT_CHANNELS);

      this.isProcessing = true;
      logger.info('🎯 Webhook processor started', {
        channels: this.EVENT_CHANNELS,
        subscriptions: this.EVENT_CHANNELS.length,
      });
    } catch (error) {
      logger.error('Failed to start webhook processor:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isProcessing) {
      return;
    }

    try {
      // Unsubscribe from Redis channels
      await this.subscriber.unsubscribe(...this.EVENT_CHANNELS);

      // Stop webhook service
      this.webhookService.destroy();

      this.isProcessing = false;
      logger.info('✅ Webhook processor stopped', {
        stats: this.eventStats,
      });
    } catch (error) {
      logger.error('Error stopping webhook processor:', error);
      throw error;
    }
  }

  private async handleRedisEvent(channel: string, message: string): Promise<void> {
    this.eventStats.totalEvents++;

    try {
      const event: RedisJobEvent = JSON.parse(message);

      logger.debug('Processing Redis event', {
        channel,
        eventType: event.type,
        jobId: event.job_id,
        timestamp: event.timestamp,
      });

      // Convert Redis event to monitor event format
      const monitorEvent = this.convertRedisEventToMonitorEvent(event);

      if (monitorEvent) {
        // Process through webhook service
        await this.webhookService.processEvent(monitorEvent as any);
        this.eventStats.processedEvents++;
      } else {
        logger.debug('Event not applicable for webhooks', { eventType: event.type });
        this.eventStats.skippedEvents++;
      }
    } catch (error) {
      logger.error('Failed to process Redis event:', { channel, message, error });
      this.eventStats.failedEvents++;
    }
  }

  private convertRedisEventToMonitorEvent(redisEvent: RedisJobEvent): unknown | null {
    // Convert Redis event format to the MonitorEvent format expected by webhook service
    const baseEvent = {
      timestamp: redisEvent.timestamp || Date.now(),
      job_id: redisEvent.job_id,
      worker_id: redisEvent.worker_id,
      machine_id: redisEvent.machine_id,
    };

    switch (redisEvent.type) {
      case 'job_submitted':
        return {
          type: 'job_submitted',
          ...baseEvent,
          job_data: redisEvent.data || {},
        };

      case 'job_assigned':
        return {
          type: 'job_assigned',
          ...baseEvent,
          old_status: 'pending',
          new_status: 'assigned',
          assigned_at: redisEvent.timestamp,
        };

      case 'job_progress':
      case 'update_job_progress':
        return {
          type: 'update_job_progress',
          ...baseEvent,
          progress: (redisEvent.data as any)?.progress || 0,
          progress_message: (redisEvent.data as any)?.message,
        };

      case 'job_completed':
      case 'complete_job':
        return {
          type: 'complete_job',
          ...baseEvent,
          result: (redisEvent.data as any)?.result,
          completed_at: redisEvent.timestamp,
        };

      case 'job_failed':
        return {
          type: 'job_failed',
          ...baseEvent,
          error: (redisEvent.data as any)?.error || 'Unknown error',
          failed_at: redisEvent.timestamp,
        };

      case 'job_status_changed':
        return {
          type: 'job_status_changed',
          ...baseEvent,
          old_status: (redisEvent.data as any)?.old_status,
          new_status: (redisEvent.data as any)?.new_status,
        };

      case 'worker_connected':
        return {
          type: 'worker_connected',
          ...baseEvent,
          worker_data: redisEvent.data || {},
        };

      case 'worker_disconnected':
        return {
          type: 'worker_disconnected',
          ...baseEvent,
        };

      case 'machine_startup_complete':
        return {
          type: 'machine_startup_complete',
          ...baseEvent,
          total_startup_time_ms: (redisEvent.data as any)?.startup_time,
          worker_count: (redisEvent.data as any)?.worker_count,
          services_started: (redisEvent.data as any)?.services || [],
        };

      case 'machine_shutdown':
        return {
          type: 'machine_shutdown',
          ...baseEvent,
          reason: (redisEvent.data as any)?.reason,
        };

      default:
        // Event type not supported for webhooks
        return null;
    }
  }

  // Webhook management methods (delegated to storage and service)

  async registerWebhook(
    config: Omit<WebhookEndpoint, 'id' | 'created_at' | 'updated_at'>
  ): Promise<WebhookEndpoint> {
    return await this.webhookService.registerWebhook(config);
  }

  async updateWebhook(
    id: string,
    updates: Partial<WebhookEndpoint>
  ): Promise<WebhookEndpoint | null> {
    return await this.webhookService.updateWebhook(id, updates);
  }

  async deleteWebhook(id: string): Promise<boolean> {
    return await this.webhookService.deleteWebhook(id);
  }

  async getWebhooks(): Promise<WebhookEndpoint[]> {
    return await this.webhookService.getWebhooks();
  }

  async getWebhook(id: string): Promise<WebhookEndpoint | null> {
    return await this.webhookService.getWebhook(id);
  }

  async testWebhook(id: string): Promise<boolean> {
    return await this.webhookService.testWebhook(id);
  }

  async getWebhookStats(webhookId?: string) {
    return await this.webhookService.getDeliveryStats(webhookId);
  }

  async getWebhookDeliveryHistory(webhookId: string, limit = 50) {
    return await this.webhookService.getWebhookDeliveryHistory(webhookId, limit);
  }

  async getRecentDeliveries(limit = 100) {
    return await this.webhookService.getRecentDeliveries(limit);
  }

  async getWebhookSummary() {
    return await this.webhookService.getWebhookSummary();
  }

  // Stats and monitoring

  getEventStats() {
    return { ...this.eventStats };
  }

  getActiveWebhookCount(): number {
    // This would need to be implemented in the webhook service
    return 0; // Placeholder
  }

  getTotalDeliveries(): number {
    return this.eventStats.processedEvents;
  }

  getFailedDeliveries(): number {
    return this.eventStats.failedEvents;
  }

  isRunning(): boolean {
    return this.isProcessing;
  }
}
