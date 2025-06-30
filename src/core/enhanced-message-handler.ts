// Enhanced Message Handler - Flexible message routing with dynamic handler registration
// Supports both pre-defined handlers and custom message type handlers

import {
  MessageHandlerInterface,
  MessageHandlerFunction,
  MessageContext,
} from './interfaces/message-handler.js';
import { RedisServiceInterface } from './interfaces/redis-service.js';
import { ConnectionManagerInterface } from './interfaces/connection-manager.js';
import { TimestampUtil } from './utils/timestamp.js';
import {
  BaseMessage,
  MessageType,
  JobSubmissionMessage,
  JobProgressMessage,
  JobCompletedMessage,
  JobFailedMessage,
  WorkerRegistrationMessage,
  WorkerStatusMessage,
  WorkerHeartbeatMessage,
  CompleteJobMessage,
  CancelJobMessage,
  FailJobMessage,
  ServiceRequestMessage,
} from './types/messages.js';
import { JobStatus } from './types/job.js';
import { WorkerStatus, WorkerCapabilities } from './types/worker.js';
import { logger } from './utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export class EnhancedMessageHandler implements MessageHandlerInterface {
  private redisService: RedisServiceInterface;
  private connectionManager: ConnectionManagerInterface;

  // Dynamic handler registry
  private handlers = new Map<string, MessageHandlerFunction>();

  // Message statistics
  private messageStats = {
    processed: 0,
    failed: 0,
    startTime: Date.now(),
  };
  private messageTypeStats = new Map<string, number>();

  // Event callbacks
  private onMessageReceivedCallbacks: Array<(message: BaseMessage) => void> = [];
  private onMessageSentCallbacks: Array<(message: BaseMessage) => void> = [];
  private onMessageErrorCallbacks: Array<(error: Error, message?: BaseMessage) => void> = [];

  constructor(redisService: RedisServiceInterface, connectionManager: ConnectionManagerInterface) {
    this.redisService = redisService;
    this.connectionManager = connectionManager;
    this.setupDefaultHandlers();
    this.setupMessageRouting();
  }

  // Dynamic handler registration methods
  registerHandler(messageType: string, handler: MessageHandlerFunction): void {
    this.handlers.set(messageType, handler);
    logger.info(`Registered handler for message type: ${messageType}`);
  }

  unregisterHandler(messageType: string): void {
    if (this.handlers.delete(messageType)) {
      logger.info(`Unregistered handler for message type: ${messageType}`);
    }
  }

  hasHandler(messageType: string): boolean {
    return this.handlers.has(messageType);
  }

  getRegisteredHandlers(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Set up default handlers for core message types
   */
  private setupDefaultHandlers(): void {
    // Job lifecycle handlers
    this.registerHandler(MessageType.SUBMIT_JOB, this.handleJobSubmissionImpl.bind(this));
    this.registerHandler(MessageType.UPDATE_JOB_PROGRESS, this.handleJobProgress.bind(this));
    this.registerHandler(MessageType.COMPLETE_JOB, this.handleCompleteJob.bind(this));
    this.registerHandler(MessageType.FAIL_JOB, this.handleFailJob.bind(this));
    this.registerHandler(MessageType.CANCEL_JOB, this.handleCancelJob.bind(this));
    this.registerHandler(MessageType.JOB_COMPLETED, this.handleJobComplete.bind(this));

    // Worker lifecycle handlers
    this.registerHandler(MessageType.REGISTER_WORKER, this.handleWorkerRegistration.bind(this));
    this.registerHandler(MessageType.WORKER_STATUS, this.handleWorkerStatus.bind(this));
    this.registerHandler(MessageType.WORKER_HEARTBEAT, this.handleWorkerHeartbeat.bind(this));

    // System handlers
    this.registerHandler(MessageType.SERVICE_REQUEST, this.handleServiceRequest.bind(this));
    this.registerHandler(MessageType.ERROR, this.handleError.bind(this));
    this.registerHandler(MessageType.ACK, this.handleAck.bind(this));

    logger.info(`Registered ${this.handlers.size} default message handlers`);
  }

  private setupMessageRouting(): void {
    // Set up connection manager event handlers
    this.connectionManager.onWorkerMessage((workerId, message) => {
      this.handleWorkerMessage(workerId, message).catch(error => {
        logger.error(`Error handling worker message from ${workerId}:`, error);
        this.notifyMessageError(error, message);
      });
    });

    this.connectionManager.onClientMessage((clientId, message) => {
      this.handleClientMessage(clientId, message).catch(error => {
        logger.error(`Error handling client message from ${clientId}:`, error);
        this.notifyMessageError(error, message);
      });
    });
  }

  /**
   * Main message handling entry point - routes to appropriate handler
   */
  async handleMessage(message: BaseMessage, context?: MessageContext): Promise<void> {
    try {
      // Update statistics
      this.messageStats.processed++;
      const currentCount = this.messageTypeStats.get(message.type) || 0;
      this.messageTypeStats.set(message.type, currentCount + 1);

      // Notify listeners
      this.notifyMessageReceived(message);

      // Add context to message if provided
      if (context) {
        message.source = context.source || message.source;
        message.worker_id = context.workerId || message.worker_id;
      }

      // Find and execute handler
      const handler = this.handlers.get(message.type);
      if (handler) {
        await handler(message);
        logger.debug(`Successfully handled message type: ${message.type}`);
      } else {
        // Handle unknown message type gracefully
        await this.handleUnknownMessage(message);
      }
    } catch (error) {
      this.messageStats.failed++;
      logger.error(`Failed to handle message type ${message.type}:`, error);
      this.notifyMessageError(error, message);
      throw error;
    }
  }

  async handleWorkerMessage(workerId: string, message: BaseMessage): Promise<void> {
    const context: MessageContext = {
      workerId,
      source: 'worker',
      timestamp: Date.now(),
    };

    // Add worker context to message
    message.worker_id = workerId;
    message.source = workerId;

    await this.handleMessage(message, context);
  }

  async handleClientMessage(clientId: string, message: BaseMessage): Promise<void> {
    const context: MessageContext = {
      clientId,
      source: 'client',
      timestamp: Date.now(),
    };

    // Add client context to message
    message.source = clientId;

    await this.handleMessage(message, context);
  }

  /**
   * Handle unknown message types gracefully
   */
  private async handleUnknownMessage(message: BaseMessage): Promise<void> {
    logger.warn(`Received unknown message type: ${message.type}`, {
      messageId: message.id,
      source: message.source,
      timestamp: message.timestamp,
    });

    // Optionally send error response
    if (message.source) {
      const errorMessage: BaseMessage = {
        type: MessageType.ERROR,
        timestamp: TimestampUtil.now(),
        error: `Unknown message type: ${message.type}`,
        details: {
          original_type: message.type,
          original_id: message.id,
        },
      };

      // Try to send error back to source
      if (message.worker_id) {
        await this.connectionManager.sendToWorker(message.worker_id, errorMessage);
      } else if (message.source) {
        await this.connectionManager.sendToClient(message.source, errorMessage);
      }
    }
  }

  // Core message handlers (existing implementations)
  private async handleJobSubmissionImpl(message: JobSubmissionMessage): Promise<void> {
    try {
      const jobId = await this.redisService.submitJob({
        service_required: message.job_type,
        priority: message.priority,
        payload: message.payload,
        customer_id: message.customer_id,
        requirements: message.requirements,
        max_retries: 3,
      });

      // Notify available workers about the new job
      await this.notifyWorkersOfNewJob(jobId, message.job_type, message.requirements);

      logger.info(`Job ${jobId} submitted and workers notified`);
    } catch (error) {
      logger.error(`Failed to handle job submission:`, error);
      throw error;
    }
  }

  async handleJobProgress(message: JobProgressMessage): Promise<void> {
    try {
      await this.redisService.updateJobProgress(message.job_id, {
        job_id: message.job_id,
        worker_id: message.worker_id,
        progress: message.progress,
        status: message.status as JobStatus,
        message: message.message,
        current_step: undefined,
        total_steps: undefined,
        estimated_completion:
          typeof message.estimated_completion === 'string'
            ? message.estimated_completion
            : undefined,
        updated_at: TimestampUtil.toISO(message.timestamp),
      });

      // Broadcast progress to monitors
      await this.connectionManager.broadcastToMonitors(message);

      logger.debug(`Job ${message.job_id} progress: ${message.progress}%`);
    } catch (error) {
      logger.error(`Failed to handle job progress for ${message.job_id}:`, error);
      throw error;
    }
  }

  async handleJobComplete(message: JobCompletedMessage): Promise<void> {
    try {
      await this.redisService.completeJob(message.job_id, {
        success: true,
        data: message.result,
        processing_time:
          typeof message.result?.processing_time === 'number'
            ? message.result.processing_time
            : undefined,
      });

      // Update worker status to idle
      if (message.worker_id) {
        await this.redisService.updateWorkerStatus(message.worker_id, WorkerStatus.IDLE, []);
      }

      // Broadcast completion to monitors
      await this.connectionManager.broadcastToMonitors(message);

      // Forward to clients subscribed to this job
      await this.connectionManager.forwardJobCompletion(message.job_id, message.result);

      logger.info(`Job ${message.job_id} completed by worker ${message.worker_id}`);
    } catch (error) {
      logger.error(`Failed to handle job completion for ${message.job_id}:`, error);
      throw error;
    }
  }

  async handleCompleteJob(message: CompleteJobMessage): Promise<void> {
    // This is sent by workers to complete a job
    await this.handleJobComplete({
      id: uuidv4(),
      type: MessageType.JOB_COMPLETED,
      timestamp: TimestampUtil.now(),
      job_id: message.job_id,
      worker_id: message.source || '',
      status: 'completed',
      result: message.result,
      processing_time: message.result?.processing_time,
    });
  }

  async handleFailJob(message: FailJobMessage): Promise<void> {
    try {
      await this.redisService.failJob(message.job_id, message.error, message.retry !== false);

      // Update worker status to idle
      if (message.worker_id) {
        await this.redisService.updateWorkerStatus(message.worker_id, WorkerStatus.IDLE, []);
      }

      // Broadcast failure to monitors
      await this.connectionManager.broadcastToMonitors(message);

      logger.info(`Job ${message.job_id} failed on worker ${message.worker_id}: ${message.error}`);
    } catch (error) {
      logger.error(`Failed to handle job failure for ${message.job_id}:`, error);
      throw error;
    }
  }

  async handleCancelJob(message: CancelJobMessage): Promise<void> {
    try {
      const jobId = message.job_id;
      const reason = message.reason || 'Cancelled by user';

      await this.redisService.cancelJob(jobId, reason);

      // Notify worker if job is currently being processed
      const job = await this.redisService.getJob(jobId);
      if (job?.worker_id) {
        const cancelMessage: BaseMessage = {
          type: 'job_cancelled',
          timestamp: TimestampUtil.now(),
          job_id: jobId,
          reason,
        };
        await this.connectionManager.sendToWorker(job.worker_id, cancelMessage);
      }

      logger.info(`Job ${jobId} cancelled: ${reason}`);
    } catch (error) {
      logger.error(`Failed to handle job cancellation for ${message.job_id}:`, error);
      throw error;
    }
  }

  async handleWorkerRegistration(message: WorkerRegistrationMessage): Promise<void> {
    try {
      await this.redisService.registerWorker(message.capabilities as WorkerCapabilities);

      const response: BaseMessage = {
        type: MessageType.WORKER_REGISTERED,
        timestamp: TimestampUtil.now(),
        worker_id: message.worker_id,
        status: 'registered',
      };

      await this.connectionManager.sendToWorker(message.worker_id, response);
      logger.info(`Worker ${message.worker_id} registered successfully`);
    } catch (error) {
      logger.error(`Failed to register worker ${message.worker_id}:`, error);
      throw error;
    }
  }

  async handleWorkerStatus(message: WorkerStatusMessage): Promise<void> {
    try {
      await this.redisService.updateWorkerStatus(
        message.worker_id,
        message.status as string,
        [message.current_job_id].filter(Boolean)
      );
      logger.debug(`Worker ${message.worker_id} status updated to ${message.status}`);
    } catch (error) {
      logger.error(`Failed to update worker status for ${message.worker_id}:`, error);
      throw error;
    }
  }

  async handleWorkerHeartbeat(message: WorkerHeartbeatMessage): Promise<void> {
    try {
      await this.redisService.updateWorkerHeartbeat(message.worker_id, message.system_info);

      const response: BaseMessage = {
        type: MessageType.WORKER_HEARTBEAT_ACK,
        timestamp: TimestampUtil.now(),
        worker_id: message.worker_id,
      };

      await this.connectionManager.sendToWorker(message.worker_id, response);
    } catch (error) {
      logger.error(`Failed to handle heartbeat from worker ${message.worker_id}:`, error);
      throw error;
    }
  }

  async handleServiceRequest(message: ServiceRequestMessage): Promise<void> {
    // Placeholder for service request handling
    logger.debug(`Service request from worker ${message.worker_id} for job ${message.job_id}`);
  }

  async handleError(message: BaseMessage & { error: string }): Promise<void> {
    logger.error(`Received error message:`, message.error);
  }

  async handleAck(message: BaseMessage): Promise<void> {
    logger.debug(`Received acknowledgment for message type: ${message.original_type}`);
  }

  // Helper methods
  private async notifyWorkersOfNewJob(
    jobId: string,
    jobType: string,
    requirements?: unknown
  ): Promise<void> {
    const message: BaseMessage = {
      type: MessageType.JOB_AVAILABLE,
      timestamp: TimestampUtil.now(),
      job_id: jobId,
      job_type: jobType,
      params_summary: requirements,
    };

    await this.broadcastToWorkers(message);
  }

  // Event callback methods
  onMessageReceived(callback: (message: BaseMessage) => void): void {
    this.onMessageReceivedCallbacks.push(callback);
  }

  onMessageSent(callback: (message: BaseMessage) => void): void {
    this.onMessageSentCallbacks.push(callback);
  }

  onMessageError(callback: (error: Error, message?: BaseMessage) => void): void {
    this.onMessageErrorCallbacks.push(callback);
  }

  private notifyMessageReceived(message: BaseMessage): void {
    this.onMessageReceivedCallbacks.forEach(callback => {
      try {
        callback(message);
      } catch (error) {
        logger.error('Error in message received callback:', error);
      }
    });
  }

  private notifyMessageSent(message: BaseMessage): void {
    this.onMessageSentCallbacks.forEach(callback => {
      try {
        callback(message);
      } catch (error) {
        logger.error('Error in message sent callback:', error);
      }
    });
  }

  private notifyMessageError(error: Error, message?: BaseMessage): void {
    this.onMessageErrorCallbacks.forEach(callback => {
      try {
        callback(error, message);
      } catch (callbackError) {
        logger.error('Error in message error callback:', callbackError);
      }
    });
  }

  // Statistics and monitoring
  async getMessageStatistics(): Promise<{
    messages_processed: number;
    messages_failed: number;
    messages_per_second: number;
    message_types: Record<string, number>;
  }> {
    const uptime = (Date.now() - this.messageStats.startTime) / 1000;
    const messagesPerSecond = uptime > 0 ? this.messageStats.processed / uptime : 0;

    return {
      messages_processed: this.messageStats.processed,
      messages_failed: this.messageStats.failed,
      messages_per_second: Number(messagesPerSecond.toFixed(2)),
      message_types: Object.fromEntries(this.messageTypeStats),
    };
  }

  async resetStatistics(): Promise<void> {
    this.messageStats = {
      processed: 0,
      failed: 0,
      startTime: Date.now(),
    };
    this.messageTypeStats.clear();
    logger.info('Message statistics reset');
  }

  // Legacy interface support (for backward compatibility)
  async handleJobFailed(message: JobFailedMessage): Promise<void> {
    await this.handleFailJob(message);
  }

  async handleJobSubmission(message: JobSubmissionMessage): Promise<void> {
    return this.handleJobSubmissionImpl(message);
  }

  async handleJobCancelled(message: CancelJobMessage): Promise<void> {
    await this.handleCancelJob(message);
  }

  async handleWorkerDisconnect(workerId: string): Promise<void> {
    try {
      await this.redisService.updateWorkerStatus(workerId, WorkerStatus.OFFLINE, []);
      logger.info(`Worker ${workerId} disconnected`);
    } catch (error) {
      logger.error(`Failed to handle worker disconnect for ${workerId}:`, error);
    }
  }

  // Placeholder implementations for interface compatibility
  async validateMessage(message: unknown): Promise<boolean> {
    const msg = message as { type?: unknown; timestamp?: unknown };
    return msg && typeof msg.type === 'string' && typeof msg.timestamp === 'number';
  }

  async parseMessage(rawMessage: string | Buffer): Promise<BaseMessage | null> {
    try {
      const messageStr = typeof rawMessage === 'string' ? rawMessage : rawMessage.toString();
      return JSON.parse(messageStr);
    } catch (error) {
      logger.error('Failed to parse message:', error);
      return null;
    }
  }

  async serializeMessage(message: BaseMessage): Promise<string> {
    return JSON.stringify(message);
  }

  async routeMessage(message: BaseMessage): Promise<void> {
    await this.handleMessage(message);
  }

  async broadcastToWorkers(
    message: BaseMessage,
    workerFilter?: (workerId: string) => boolean
  ): Promise<void> {
    // Implementation depends on connection manager capabilities
    if ('broadcastToWorkers' in this.connectionManager) {
      await (
        this.connectionManager as unknown as {
          broadcastToWorkers: (msg: BaseMessage, filter?: (id: string) => boolean) => Promise<void>;
        }
      ).broadcastToWorkers(message, workerFilter);
    }
  }

  async broadcastToClients(
    message: BaseMessage,
    clientFilter?: (clientId: string) => boolean
  ): Promise<void> {
    // Implementation depends on connection manager capabilities
    if ('broadcastToClients' in this.connectionManager) {
      await (
        this.connectionManager as unknown as {
          broadcastToClients: (msg: BaseMessage, filter?: (id: string) => boolean) => Promise<void>;
        }
      ).broadcastToClients(message, clientFilter);
    }
  }

  async broadcastToMonitors(message: BaseMessage): Promise<void> {
    await this.connectionManager.broadcastToMonitors(message);
  }

  async sendToWorker(workerId: string, message: BaseMessage): Promise<boolean> {
    return await this.connectionManager.sendToWorker(workerId, message);
  }

  async sendToClient(clientId: string, message: BaseMessage): Promise<boolean> {
    return await this.connectionManager.sendToClient(clientId, message);
  }

  async handleSystemStatus(_message: unknown): Promise<void> {
    logger.debug('System status message received');
  }
}
