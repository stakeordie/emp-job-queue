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

  // Workflow tracking for completion detection
  private workflowTracker = new Map<
    string,
    {
      steps: Map<number, string>; // step_number -> job_id mapping
      completedSteps: Set<number>; // completed step numbers (1-indexed)
      failedSteps: Set<number>; // failed step numbers (1-indexed)
      stepErrors: Map<number, string>; // step_number -> error message for failed steps
      totalSteps?: number; // total steps in workflow (from job submission)
      startTime: number;
      lastUpdate: number;
      currentStep?: number; // highest current_step seen
    }
  >();

  private workflowCleanupInterval?: NodeJS.Timeout;

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

  constructor(redis: Redis, telemetryClient?: any) {
    super();
    this.redis = redis;
    this.subscriber = new Redis(redis.options);
    this.webhookStorage = new WebhookRedisStorage(redis);
    this.webhookService = new WebhookNotificationService(redis, telemetryClient);
    this.telemetryClient = telemetryClient || null;

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

      // Start workflow cleanup interval (every 10 minutes)
      this.startWorkflowCleanup();

      this.isProcessing = true;
      logger.info('🎯 Webhook processor started', {
        channels: regularChannels,
        patterns: patternChannels,
        subscriptions: this.EVENT_CHANNELS.length,
        workflowTracking: true,
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
      // Stop workflow cleanup
      if (this.workflowCleanupInterval) {
        clearInterval(this.workflowCleanupInterval);
        this.workflowCleanupInterval = undefined;
      }

      // Unsubscribe from Redis channels
      await this.subscriber.unsubscribe(...this.EVENT_CHANNELS);

      // Stop webhook service
      this.webhookService.destroy();

      this.isProcessing = false;
      logger.info('✅ Webhook processor stopped', {
        stats: this.eventStats,
        trackedWorkflows: this.workflowTracker.size,
      });
    } catch (error) {
      logger.error('Error stopping webhook processor:', error);
      throw error;
    }
  }

  private startWorkflowCleanup(): void {
    // Clean up stale workflows every 10 minutes
    this.workflowCleanupInterval = setInterval(
      () => {
        this.cleanupStaleWorkflows();
      },
      10 * 60 * 1000
    ); // 10 minutes
  }

  private cleanupStaleWorkflows(): void {
    const now = Date.now();
    const staleThreshold = 2 * 60 * 60 * 1000; // 2 hours
    let cleaned = 0;

    for (const [workflowId, workflow] of this.workflowTracker.entries()) {
      const age = now - workflow.lastUpdate;

      if (age > staleThreshold) {
        logger.debug('Cleaning up stale workflow', {
          workflowId,
          ageHours: Math.round(age / (60 * 60 * 1000)),
          totalSteps: workflow.totalSteps,
          stepsSeenCount: workflow.steps.size,
          completed: workflow.completedSteps.size,
          failed: workflow.failedSteps.size,
        });

        this.workflowTracker.delete(workflowId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info('Cleaned up stale workflows', {
        cleaned,
        remaining: this.workflowTracker.size,
      });
    }
  }

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
        // Track workflow progress for completion detection
        await this.trackWorkflowProgress(event);

        // Process through webhook service
        await this.webhookService.processEvent(monitorEvent as MonitorEvent);
        this.eventStats.processedEvents++;

        // Reduced logging
      } else {
        this.eventStats.skippedEvents++;
      }
    } catch (error) {
      logger.error('Failed to process Redis event:', { channel, message, error });
      this.eventStats.failedEvents++;
    }
  }

  private async trackWorkflowProgress(event: WorkflowJobEvent): Promise<void> {
    const workflowId = event.workflow_id;
    const currentStep = event.current_step;
    const totalSteps = event.total_steps;

    // Simplified workflow tracking log
    if (workflowId) {
      logger.info(
        `🔄 WORKFLOW-TRACK: ${event.type} workflow ${workflowId} step ${currentStep}/${totalSteps}`
      );
    }

    if (!workflowId || !event.job_id) {
      return; // No workflow tracking needed
    }

    const now = Date.now();
    let workflow = this.workflowTracker.get(workflowId);

    // Initialize workflow tracking if not exists
    if (!workflow) {
      workflow = {
        steps: new Map(),
        completedSteps: new Set(),
        failedSteps: new Set(),
        stepErrors: new Map(),
        startTime: now,
        lastUpdate: now,
      };
      this.workflowTracker.set(workflowId, workflow);
      logger.debug('Started tracking workflow', { workflowId });
    }

    // Update workflow metadata
    workflow.lastUpdate = now;
    if (totalSteps && !workflow.totalSteps) {
      workflow.totalSteps = totalSteps;
      logger.debug('Set workflow total steps', { workflowId, totalSteps });
    }
    if (currentStep && (!workflow.currentStep || currentStep > workflow.currentStep)) {
      workflow.currentStep = currentStep;
    }

    // Track step in workflow (use current_step as key, fallback to step_number)
    const stepNumber = currentStep || event.step_number || 1;
    workflow.steps.set(stepNumber, event.job_id);

    // Check if this is the first step being submitted (workflow_submitted event)
    if (event.type === 'job_submitted' && stepNumber === 1 && workflow.steps.size === 1) {
      await this.sendWorkflowSubmittedEvent(workflowId, event);
    }

    // Handle completion/failure
    const wasCompleted = workflow.completedSteps.has(stepNumber);
    const wasFailed = workflow.failedSteps.has(stepNumber);

    // Simplified step tracking

    if (event.type === 'complete_job' && !wasCompleted) {
      workflow.completedSteps.add(stepNumber);
      workflow.failedSteps.delete(stepNumber); // Remove from failed if it was there
      logger.info(
        `✅ WORKFLOW-TRACK: Step ${stepNumber} completed for workflow ${workflowId} (${workflow.completedSteps.size}/${workflow.totalSteps || workflow.steps.size})`
      );
    } else if (event.type === 'job_failed' && !wasFailed) {
      workflow.failedSteps.add(stepNumber);
      workflow.completedSteps.delete(stepNumber); // Remove from completed if it was there
      
      // Store the error message for this step
      const errorMessage = (event as any).error || 'Unknown error';
      workflow.stepErrors.set(stepNumber, errorMessage);
      
      logger.info(
        `❌ WORKFLOW-TRACK: Step ${stepNumber} failed for workflow ${workflowId} (${workflow.failedSteps.size} failed)`
      );
      logger.info(`📡 [WEBHOOK-DEBUG] STEP ERROR STORED:`, {
        jobId: event.job_id,
        workflowId: event.workflow_id,
        stepNumber: stepNumber,
        calculatedFromCurrentStep: currentStep,
        calculatedFromEventStepNumber: event.step_number,
        errorMessage: errorMessage,
        stepErrorsMapSize: workflow.stepErrors.size,
        stepErrorsEntries: Array.from(workflow.stepErrors.entries()),
        failedStepsSet: Array.from(workflow.failedSteps),
        completedStepsSet: Array.from(workflow.completedSteps)
      });
    }

    // Check for workflow completion
    await this.checkWorkflowCompletion(workflowId, workflow, event);
  }

  private async sendWorkflowSubmittedEvent(
    workflowId: string,
    triggeringEvent: WorkflowJobEvent
  ): Promise<void> {
    // Create a custom event that matches MonitorEvent structure but isn't in the union
    const workflowSubmittedEvent: MonitorEvent = {
      type: 'system_stats',
      timestamp: Date.now(),
      stats: {
        total_workers: 0,
        active_workers: 0,
        total_jobs: 0,
        pending_jobs: 0,
        active_jobs: 0,
        completed_jobs: 0,
        failed_jobs: 0,
      },
      // Add workflow data as additional properties
      ...{
        workflow_submitted: true,
        workflow_id: workflowId,
        first_job_id: triggeringEvent.job_id,
        total_steps: triggeringEvent.total_steps,
        workflow_priority: triggeringEvent.workflow_priority,
        workflow_datetime: triggeringEvent.workflow_datetime,
        customer_id: triggeringEvent.customer_id,
        service_required: triggeringEvent.service_required,
      },
    } as MonitorEvent;

    try {
      await this.webhookService.processEvent(workflowSubmittedEvent);
      logger.info(`📤 WEBHOOK-SENT: workflow_submitted for ${workflowId}`);
    } catch (error) {
      logger.error(`❌ WEBHOOK-FAILED: workflow_submitted for ${workflowId}:`, error);
    }
  }

  private async checkWorkflowCompletion(
    workflowId: string,
    workflow: NonNullable<ReturnType<typeof this.workflowTracker.get>>,
    triggeringEvent: WorkflowJobEvent
  ): Promise<void> {
    // Only check completion if we know the total steps
    if (!workflow.totalSteps) {
      return;
    }

    const totalSteps = workflow.totalSteps;
    const completedSteps = workflow.completedSteps.size;
    const failedSteps = workflow.failedSteps.size;
    const finishedSteps = completedSteps + failedSteps;

    // Check if workflow is complete (all expected steps finished)
    if (finishedSteps === totalSteps && totalSteps > 0) {
      const isSuccess = failedSteps === 0;
      const duration = Date.now() - workflow.startTime;

      logger.info(
        `🎉 WORKFLOW-COMPLETE: Workflow ${workflowId} ${isSuccess ? 'COMPLETED' : 'FAILED'} (${completedSteps} completed, ${failedSteps} failed, ${duration}ms)`
      );

      // Create workflow completion event (success or failure)
      const eventType = isSuccess ? 'workflow_completed' : 'workflow_failed';
      const workflowCompletionEvent: MonitorEvent = {
        type: 'system_stats',
        timestamp: Date.now(),
        stats: {
          total_workers: 0,
          active_workers: 0,
          total_jobs: 0,
          pending_jobs: 0,
          active_jobs: 0,
          completed_jobs: 0,
          failed_jobs: 0,
        },
        // Add workflow completion data as additional properties
        ...{
          workflow_completed: isSuccess,
          workflow_failed: !isSuccess,
          workflow_id: workflowId,
          success: isSuccess,
          total_steps: totalSteps,
          completed_steps: completedSteps,
          failed_steps: failedSteps,
          duration_ms: duration,
          start_time: workflow.startTime,
          end_time: Date.now(),
          trigger_job_id: triggeringEvent.job_id,
          trigger_event_type: triggeringEvent.type,
          current_step: triggeringEvent.current_step,
          step_details: Array.from(workflow.steps.entries()).map(([stepNum, jobId]) => {
            const hasError = workflow.stepErrors.has(stepNum);
            const errorMessage = workflow.stepErrors.get(stepNum);
            
            const stepDetail: {
              step_number: number;
              job_id: string;
              completed: boolean;
              failed: boolean;
              error?: string;
            } = {
              step_number: stepNum,
              job_id: jobId,
              completed: workflow.completedSteps.has(stepNum),
              failed: workflow.failedSteps.has(stepNum),
            };
            
            // Add error field if present
            if (hasError && errorMessage) {
              stepDetail.error = errorMessage;
            }
            
            // Log each step detail for debugging
            logger.info(`📡 [WEBHOOK-DEBUG] STEP DETAIL GENERATED:`, {
              stepNum,
              stepNumType: typeof stepNum,
              jobId,
              stepDetail,
              hasErrorInMap: hasError,
              errorFromMap: errorMessage,
              stepErrorsMapContents: Array.from(workflow.stepErrors.entries()),
              stepErrorsMapKeys: Array.from(workflow.stepErrors.keys()),
              stepErrorsMapKeysTypes: Array.from(workflow.stepErrors.keys()).map(k => typeof k)
            });
            
            return stepDetail;
          }),
        },
      } as MonitorEvent;

      // Send workflow completion/failure webhook
      try {
        await this.webhookService.processEvent(workflowCompletionEvent);
        logger.info(`📤 WEBHOOK-SENT: ${eventType} for workflow ${workflowId}`);
      } catch (error) {
        logger.error(`❌ WEBHOOK-FAILED: ${eventType} for workflow ${workflowId}:`, error);
      }

      // Clean up workflow tracking (keep memory usage bounded)
      this.workflowTracker.delete(workflowId);
    }
  }

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
    const workflows = Array.from(this.workflowTracker.entries()).map(([workflowId, workflow]) => ({
      workflow_id: workflowId,
      total_steps: workflow.totalSteps,
      steps_seen: workflow.steps.size,
      completed_steps: workflow.completedSteps.size,
      failed_steps: workflow.failedSteps.size,
      current_step: workflow.currentStep,
      start_time: workflow.startTime,
      last_update: workflow.lastUpdate,
      age_minutes: Math.round((Date.now() - workflow.startTime) / (60 * 1000)),
      progress: workflow.totalSteps
        ? `${workflow.completedSteps.size + workflow.failedSteps.size}/${workflow.totalSteps}`
        : `${workflow.completedSteps.size + workflow.failedSteps.size}/?`,
    }));

    return {
      total_tracked_workflows: this.workflowTracker.size,
      workflows,
    };
  }
}
