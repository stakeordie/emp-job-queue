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
  MonitorEvent,
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

interface WorkflowJobEvent extends RedisJobEvent {
  workflow_id?: string;
  workflow_priority?: number;
  workflow_datetime?: number;
  step_number?: number;
  current_step?: number;
  total_steps?: number;
  customer_id?: string;
  service_required?: string;
  priority?: number;
  payload?: unknown;
  requirements?: unknown;
  created_at?: string;
  status?: string;
  progress?: number;
  message?: string;
  result?: unknown;
  completed_at?: string;
  error?: string;
  failed_at?: string;
  can_retry?: boolean;
  retry_count?: number;
  reason?: string;
  cancelled_at?: string;
  cancelled_by?: string;
  previous_status?: string;
  capabilities?: unknown;
  current_job_id?: string;
  health?: unknown;
  worker_count?: number;
  services?: unknown;
  startup_time?: number;
}

export class WebhookProcessor extends EventEmitter {
  private redis: Redis;
  private subscriber: Redis;
  private webhookService: WebhookNotificationService;
  private webhookStorage: WebhookRedisStorage;
  private telemetryClient: any | null;
  private isProcessing = false;
  private eventStats = {
    totalEvents: 0,
    processedEvents: 0,
    skippedEvents: 0,
    failedEvents: 0,
  };

  // ❌ REMOVED: Internal workflow tracking completely removed
  // All workflow completion detection is now handled by API server with EMPROPS verification

  // Redis channels to subscribe to (ONLY channels actually published by the system)
  private readonly EVENT_CHANNELS = [
    'job_submitted', // Job submission events (published by API)
    'update_job_progress', // Job progress updates (published by workers)
    'complete_job', // Job completion events (published by workers)
    'job_failed', // Job failure events (published by workers)
    'cancel_job', // Job cancellation events (published by API)
    'worker_status', // Worker status events (published by API/workers)
    'workflow_submitted', // Workflow start events (published by API)
    'workflow_completed', // Verified workflow completion events (published by API)
    'workflow_failed', // Workflow failure events (published by API)
    'machine:status:*', // Machine status events (pattern subscription)
  ];

  constructor(redis: Redis, telemetryClient?: any, subscriber?: Redis) {
    super();
    this.redis = redis;

    // Use provided subscriber or create one if not provided (for backward compatibility)
    const subscriberProvided = !!subscriber;
    this.subscriber = subscriber || new Redis({
      ...redis.options,
      enableReadyCheck: false,
      lazyConnect: true,
      keepAlive: 30000,
      connectTimeout: 60000,
      commandTimeout: 5000,
      maxRetriesPerRequest: 3,
      autoResubscribe: true,
      autoResendUnfulfilledCommands: true,
    });

    this.webhookStorage = new WebhookRedisStorage(redis);
    this.webhookService = new WebhookNotificationService(redis, telemetryClient);
    this.telemetryClient = telemetryClient || null;

    console.log('🔍 WEBHOOK-PROCESSOR: Constructor called - internal workflow tracking is DISABLED');
    console.log('🔍 WEBHOOK-PROCESSOR: Relying exclusively on Redis workflow_completed events from API server');

    this.setupEventHandlers(subscriberProvided);
  }

  private setupEventHandlers(subscriberProvided: boolean): void {
    // Only add connection event handlers if we created the subscriber ourselves
    // If subscriber was provided, the parent class already handles connection events
    if (!subscriberProvided) {
      // Handle Redis connection events for self-created subscriber
      this.subscriber.on('connect', () => {
        logger.info('✅ Webhook processor connected to Redis');
      });

      this.subscriber.on('ready', () => {
        logger.info('✅ Webhook processor Redis connection ready');
      });

      this.subscriber.on('reconnecting', (delay: number) => {
        logger.warn('🔄 Webhook processor Redis reconnecting...', { delay });
      });

      this.subscriber.on('error', error => {
        // Handle ECONNRESET and other connection errors gracefully
        const errorCode = (error as any).code;
        if (errorCode === 'ECONNRESET' || errorCode === 'ENOTFOUND' || errorCode === 'ETIMEDOUT') {
          logger.warn('⚠️ Webhook processor Redis connection error (will retry):', {
            code: errorCode,
            message: error.message,
          });
          // Don't emit these as errors - let ioredis handle reconnection
          return;
        }

        logger.error('❌ Webhook processor Redis error:', error);
        this.emit('error', error);
      });

      this.subscriber.on('close', () => {
        logger.warn('⚠️ Webhook processor Redis connection closed');
      });
    }

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

      // 📊 TELEMETRY: Emit webhook.delivered event to OTLP collector
      if (this.telemetryClient) {
        this.telemetryClient.addEvent('webhook.delivered', {
          'event_type': data.payload.event_type,
          'job_id': data.payload.data.workflow_id || 'unknown',
          'step_id': data.payload.data.job_id || 'unknown',
          'service': 'Job_Q_Webhook',
          'deployment.platform': 'railway',
          'webhook_id': data.webhook.id,
          'customer_id': data.payload.data.customer_id || 'unknown',
          'http_status': data.attempt.response_status?.toString() || 'unknown',
        });
      }

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
        internalWorkflowTracking: false, // ❌ DISABLED - using Redis events only
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

  // ❌ REMOVED: Workflow cleanup methods - no longer needed without internal tracking

  private async handleRedisEvent(channel: string, message: string): Promise<void> {
    this.eventStats.totalEvents++;

    try {
      const eventData: Record<string, unknown> = JSON.parse(message);

      // Set the event type based on the channel name since pub/sub events don't have 'type' field
      const event: WorkflowJobEvent = {
        ...eventData,
        type: channel, // Use channel name as event type
      } as WorkflowJobEvent;

      // Log all job_failed events for debugging workflow metadata
      if (event.type === 'job_failed') {
        logger.info(`📡 [WEBHOOK-DEBUG] Webhook processor received job_failed event:`, {
          channel,
          jobId: event.job_id,
          hasWorkflowId: !!event.workflow_id,
          workflowId: event.workflow_id,
          stepNumber: event.step_number || event.current_step,
          totalSteps: event.total_steps,
          eventKeys: Object.keys(event),
          rawEventData: eventData
        });
      }

      // Only log workflow-related events
      if (event.workflow_id) {
        logger.info(
          `🔔 WEBHOOK-PROCESSOR: ${event.type} for workflow ${event.workflow_id} job ${event.job_id} (step ${event.current_step || event.step_number}/${event.total_steps})`
        );
      }

      // Convert Redis event to monitor event format
      const monitorEvent = this.convertRedisEventToMonitorEvent(event);

      if (monitorEvent) {
        // ❌ REMOVED: Internal workflow tracking - using Redis events exclusively
        console.log('🔍 WEBHOOK-PROCESSOR: Processing event without internal tracking:', event.type, event.workflow_id);

        // Process through webhook service
        await this.webhookService.processEvent(monitorEvent as MonitorEvent);
        this.eventStats.processedEvents++;

        // Note: Telemetry events are emitted by the webhook.delivered event handler (see setupEventHandlers)

        // Reduced logging
      } else {
        this.eventStats.skippedEvents++;
      }
    } catch (error) {
      logger.error('Failed to process Redis event:', { channel, message, error });
      this.eventStats.failedEvents++;
    }
  }

  // ❌ REMOVED: trackWorkflowProgress method completely removed
  // All workflow progress tracking is now handled by API server with EMPROPS verification


  // ❌ REMOVED: Internal workflow tracking logic has been completely removed
  // Workflow completion is now handled exclusively by the API server with EMPROPS verification
  // This prevents duplicate workflow_completed webhooks with minimal data

  private convertRedisEventToMonitorEvent(redisEvent: WorkflowJobEvent): unknown | null {
    // The Redis events are published directly with their data, not wrapped in a type field
    // We need to infer the event type from the channel name and event structure
    const baseEvent = {
      timestamp: redisEvent.timestamp || Date.now(),
      job_id: redisEvent.job_id,
      worker_id: redisEvent.worker_id,
      machine_id: redisEvent.machine_id,
      workflow_id: redisEvent.workflow_id,
      step_number: redisEvent.step_number,
      current_step: redisEvent.current_step,
      total_steps: redisEvent.total_steps,
      workflow_priority: redisEvent.workflow_priority,
      workflow_datetime: redisEvent.workflow_datetime,
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

      case 'workflow_submitted':
        return {
          type: 'system_stats',
          timestamp: redisEvent.timestamp || Date.now(),
          stats: {
            total_workers: 0,
            active_workers: 0,
            total_jobs: 0,
            pending_jobs: 0,
            active_jobs: 0,
            completed_jobs: 0,
            failed_jobs: 0,
          },
          // Add workflow submission data
          workflow_submitted: true,
          workflow_id: redisEvent.workflow_id,
          first_job_id: redisEvent.first_job_id,
          total_steps: redisEvent.total_steps,
          workflow_priority: redisEvent.workflow_priority,
          workflow_datetime: redisEvent.workflow_datetime,
          customer_id: redisEvent.customer_id,
          service_required: redisEvent.service_required,
          workflow_type: redisEvent.workflow_type,
          message: redisEvent.message,
        };

      case 'workflow_completed':
        logger.info(`🚨🚨🚨 WEBHOOK-PROCESSOR: Received workflow_completed Redis event with rich data:`, {
          workflow_id: redisEvent.workflow_id,
          status: redisEvent.status,
          verified: redisEvent.verified,
          has_workflow_details: !!redisEvent.workflow_details,
          has_outputs: !!redisEvent.outputs,
          outputs_count: redisEvent.outputs ? (redisEvent.outputs as any[]).length : 0,
          workflow_details: redisEvent.workflow_details,
          outputs: redisEvent.outputs
        });
        return {
          type: 'system_stats',
          timestamp: redisEvent.timestamp || Date.now(),
          stats: {
            total_workers: 0,
            active_workers: 0,
            total_jobs: 0,
            pending_jobs: 0,
            active_jobs: 0,
            completed_jobs: 0,
            failed_jobs: 0,
          },
          // Add verified workflow completion data
          workflow_completed: true,
          workflow_id: redisEvent.workflow_id,
          status: redisEvent.status,
          completed_at: redisEvent.completed_at,
          verified: redisEvent.verified,
          message: redisEvent.message,
          // Include full workflow details from EMPROPS API
          workflow_details: redisEvent.workflow_details,
          // Include outputs (image URLs, step results, etc.)
          outputs: redisEvent.outputs || [],
        };

      case 'workflow_failed':
        logger.info(`💥 WEBHOOK-PROCESSOR: Received workflow_failed Redis event:`, {
          workflow_id: redisEvent.workflow_id,
          failed_job_id: redisEvent.failed_job_id,
          failed_at_step: redisEvent.failed_at_step,
          total_steps: redisEvent.total_steps,
          error: redisEvent.error,
          worker_id: redisEvent.worker_id,
          workflow_type: redisEvent.workflow_type,
        });
        return {
          type: 'system_stats',
          timestamp: redisEvent.timestamp || Date.now(),
          stats: {
            total_workers: 0,
            active_workers: 0,
            total_jobs: 0,
            pending_jobs: 0,
            active_jobs: 0,
            completed_jobs: 0,
            failed_jobs: 0,
          },
          // Add workflow failure data
          workflow_failed: true,
          workflow_id: redisEvent.workflow_id,
          failed_job_id: redisEvent.failed_job_id,
          failed_at_step: redisEvent.failed_at_step,
          total_steps: redisEvent.total_steps,
          error: redisEvent.error,
          failed_at: redisEvent.failed_at,
          worker_id: redisEvent.worker_id,
          workflow_type: redisEvent.workflow_type,
          message: redisEvent.message,
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

  async reconnectWebhook(id: string): Promise<boolean> {
    return await this.webhookService.reconnectWebhook(id);
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

  getWorkflowStats() {
    // ❌ REMOVED: Internal workflow tracking - no longer available
    return {
      total_tracked_workflows: 0,
      workflows: [],
      message: 'Internal workflow tracking disabled - using Redis events exclusively'
    };
  }
}
