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

  // Redis channels to subscribe to (ONLY channels actually published by the system)
  private readonly EVENT_CHANNELS = [
    'job_submitted', // Job submission events (published by API)
    'update_job_progress', // Job progress updates (published by workers)
    'complete_job', // Job completion events (published by workers)  
    'job_failed', // Job failure events (published by workers)
    'cancel_job', // Job cancellation events (published by API)
    'worker_status', // Worker status events (published by API/workers)
    'machine:status:*', // Machine status events (pattern subscription)
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
      // Subscribe to regular channels
      const regularChannels = this.EVENT_CHANNELS.filter(channel => !channel.includes('*'));
      const patternChannels = this.EVENT_CHANNELS.filter(channel => channel.includes('*'));
      
      if (regularChannels.length > 0) {
        await this.subscriber.subscribe(...regularChannels);
      }
      
      if (patternChannels.length > 0) {
        await this.subscriber.psubscribe(...patternChannels);
      }

      this.isProcessing = true;
      logger.info('🎯 Webhook processor started', {
        channels: regularChannels,
        patterns: patternChannels,
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
      const eventData: any = JSON.parse(message);
      
      // Set the event type based on the channel name since pub/sub events don't have 'type' field
      const event: RedisJobEvent = {
        ...eventData,
        type: channel, // Use channel name as event type
      };

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
        
        logger.debug('Successfully processed webhook event', {
          channel,
          jobId: event.job_id,
          workerId: event.worker_id,
        });
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
    // The Redis events are published directly with their data, not wrapped in a type field
    // We need to infer the event type from the channel name and event structure
    const baseEvent = {
      timestamp: redisEvent.timestamp || Date.now(),
      job_id: redisEvent.job_id,
      worker_id: redisEvent.worker_id,
      machine_id: redisEvent.machine_id,
    };

    // For direct Redis pub/sub events, the event data is the complete event object
    // The 'type' comes from the channel name we're processing
    switch (redisEvent.type) {
      case 'job_submitted':
        return {
          type: 'job_submitted',
          ...baseEvent,
          job_type: redisEvent.service_required,
          priority: redisEvent.priority || 50,
          payload: redisEvent.payload,
          requirements: redisEvent.requirements,
          customer_id: redisEvent.customer_id,
          created_at: redisEvent.created_at,
          status: 'pending',
        };

      case 'update_job_progress':
        return {
          type: 'update_job_progress',
          ...baseEvent,
          progress: redisEvent.progress || 0,
          progress_message: redisEvent.message,
          status: redisEvent.status,
          current_step: redisEvent.current_step,
          total_steps: redisEvent.total_steps,
          estimated_completion: redisEvent.estimated_completion,
        };

      case 'complete_job':
        return {
          type: 'complete_job',
          ...baseEvent,
          progress: redisEvent.progress || 100,
          result: redisEvent.result,
          completed_at: redisEvent.timestamp,
          status: redisEvent.status || 'completed',
          message: redisEvent.message,
        };

      case 'job_failed':
        return {
          type: 'job_failed',
          ...baseEvent,
          error: redisEvent.error || 'Unknown error',
          failed_at: redisEvent.failed_at || redisEvent.timestamp,
          status: redisEvent.status || 'failed',
          can_retry: redisEvent.can_retry,
          retry_count: redisEvent.retry_count,
        };

      case 'cancel_job':
        return {
          type: 'job_cancelled',
          ...baseEvent,
          cancelled_at: redisEvent.timestamp,
          reason: redisEvent.reason || redisEvent.message,
          cancelled_by: redisEvent.cancelled_by,
        };

      case 'worker_status':
        return {
          type: 'worker_status_changed',
          ...baseEvent,
          status: redisEvent.status,
          previous_status: redisEvent.previous_status,
          capabilities: redisEvent.capabilities,
          current_job_id: redisEvent.current_job_id,
        };

      // Handle machine status pattern matches (machine:status:*)  
      default:
        if (redisEvent.type && redisEvent.type.startsWith('machine:status:')) {
          return {
            type: 'machine_status_changed',
            ...baseEvent,
            machine_id: redisEvent.machine_id || redisEvent.type.split(':')[2],
            status: redisEvent.status,
            health: redisEvent.health,
            worker_count: redisEvent.worker_count,
            services: redisEvent.services,
            startup_time: redisEvent.startup_time,
          };
        }
        
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

  // Storage access for test receivers
  getWebhookStorage() {
    return this.webhookStorage;
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
