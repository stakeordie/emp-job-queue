// Message Handler Implementation - direct port from Python core/message_handler.py
// Handles all message types and routing logic

import { MessageHandlerInterface } from './interfaces/message-handler.js';
import { RedisServiceInterface } from './interfaces/redis-service.js';
import { ConnectionManagerInterface } from './interfaces/connection-manager.js';
import { 
  BaseMessage, 
  MessageType,
  JobSubmissionMessage,
  JobProgressMessage,
  JobCompletedMessage,
  JobFailedMessage,
  JobAvailableMessage,
  WorkerRegistrationMessage,
  WorkerStatusMessage,
  WorkerHeartbeatMessage,
  ServiceRequestMessage,
  CompleteJobMessage,
  FailJobMessage
} from './types/messages.js';
import { JobStatus } from './types/job.js';
import { WorkerStatus } from './types/worker.js';
import { logger } from './utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export class MessageHandler implements MessageHandlerInterface {
  private redisService: RedisServiceInterface;
  private connectionManager: ConnectionManagerInterface;
  private messageStats = {
    processed: 0,
    failed: 0,
    startTime: Date.now()
  };
  private messageTypeStats = new Map<MessageType, number>();

  constructor(
    redisService: RedisServiceInterface,
    connectionManager: ConnectionManagerInterface
  ) {
    this.redisService = redisService;
    this.connectionManager = connectionManager;
    this.setupMessageRouting();
  }

  private setupMessageRouting(): void {
    // Set up connection manager event handlers
    this.connectionManager.onWorkerMessage((workerId, message) => {
      this.handleWorkerMessage(workerId, message).catch(error => {
        logger.error(`Error handling worker message from ${workerId}:`, error);
      });
    });

    this.connectionManager.onClientMessage((clientId, message) => {
      this.handleClientMessage(clientId, message).catch(error => {
        logger.error(`Error handling client message from ${clientId}:`, error);
      });
    });

    this.connectionManager.onWorkerDisconnect((workerId) => {
      this.handleWorkerDisconnect(workerId).catch(error => {
        logger.error(`Error handling worker disconnect for ${workerId}:`, error);
      });
    });
  }

  async handleMessage(message: BaseMessage): Promise<void> {
    try {
      this.updateStats(message.type);
      
      switch (message.type) {
        case MessageType.JOB_SUBMISSION:
          await this.handleJobSubmission(message as JobSubmissionMessage);
          break;
        case MessageType.JOB_PROGRESS:
          await this.handleJobProgress(message as JobProgressMessage);
          break;
        case MessageType.JOB_COMPLETED:
          await this.handleJobComplete(message as JobCompletedMessage);
          break;
        case MessageType.JOB_FAILED:
          await this.handleJobFailed(message as JobFailedMessage);
          break;
        case MessageType.COMPLETE_JOB:
          await this.handleCompleteJob(message as CompleteJobMessage);
          break;
        case MessageType.FAIL_JOB:
          await this.handleFailJob(message as FailJobMessage);
          break;
        case MessageType.WORKER_REGISTRATION:
          await this.handleWorkerRegistration(message as WorkerRegistrationMessage);
          break;
        case MessageType.WORKER_STATUS:
          await this.handleWorkerStatus(message as WorkerStatusMessage);
          break;
        case MessageType.WORKER_HEARTBEAT:
          await this.handleWorkerHeartbeat(message as WorkerHeartbeatMessage);
          break;
        case MessageType.SERVICE_REQUEST:
          await this.handleServiceRequest(message as ServiceRequestMessage);
          break;
        default:
          logger.warn(`Unhandled message type: ${message.type}`);
      }
      
      this.messageStats.processed++;
    } catch (error) {
      this.messageStats.failed++;
      logger.error(`Error handling message ${message.id}:`, error);
      throw error;
    }
  }

  async handleWorkerMessage(workerId: string, message: BaseMessage): Promise<void> {
    // Add worker context to message
    message.source = workerId;
    await this.handleMessage(message);
  }

  async handleClientMessage(clientId: string, message: BaseMessage): Promise<void> {
    // Add client context to message
    message.source = clientId;
    await this.handleMessage(message);
  }

  // Job message handlers
  async handleJobSubmission(message: JobSubmissionMessage): Promise<void> {
    try {
      const jobId = await this.redisService.submitJob({
        type: message.job_type,
        priority: message.priority,
        payload: message.payload,
        customer_id: message.customer_id,
        requirements: message.requirements,
        max_retries: 3
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
        estimated_completion: message.estimated_completion,
        updated_at: message.timestamp
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
      await this.redisService.completeJob(message.job_id, message.result);
      
      // Update worker status to idle
      await this.redisService.updateWorkerStatus(
        message.worker_id, 
        WorkerStatus.IDLE, 
        []
      );

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

  async handleJobFailed(message: JobFailedMessage): Promise<void> {
    try {
      await this.redisService.failJob(
        message.job_id, 
        message.error, 
        message.can_retry !== false
      );
      
      // Update worker status to idle
      await this.redisService.updateWorkerStatus(
        message.worker_id, 
        WorkerStatus.IDLE, 
        []
      );

      // Broadcast failure to monitors
      await this.connectionManager.broadcastToMonitors(message);
      
      logger.info(`Job ${message.job_id} failed on worker ${message.worker_id}: ${message.error}`);
    } catch (error) {
      logger.error(`Failed to handle job failure for ${message.job_id}:`, error);
      throw error;
    }
  }

  async handleCompleteJob(message: CompleteJobMessage): Promise<void> {
    // This is sent by workers to complete a job
    await this.handleJobComplete({
      id: uuidv4(),
      type: MessageType.JOB_COMPLETED,
      timestamp: new Date().toISOString(),
      job_id: message.job_id,
      worker_id: message.source || '',
      result: message.result,
      processing_time: message.result.processing_time
    });
  }

  async handleFailJob(message: FailJobMessage): Promise<void> {
    // This is sent by workers to fail a job
    await this.handleJobFailed({
      id: uuidv4(),
      type: MessageType.JOB_FAILED,
      timestamp: new Date().toISOString(),
      job_id: message.job_id,
      worker_id: message.source || '',
      error: message.error,
      can_retry: message.retry
    });
  }

  // Worker message handlers
  async handleWorkerRegistration(message: WorkerRegistrationMessage): Promise<void> {
    try {
      await this.redisService.registerWorker(message.capabilities);
      
      // Send confirmation back to worker
      await this.connectionManager.sendToWorker(message.worker_id, {
        id: uuidv4(),
        type: MessageType.WORKER_STATUS,
        timestamp: new Date().toISOString(),
        worker_id: message.worker_id,
        status: WorkerStatus.IDLE
      });

      logger.info(`Worker ${message.worker_id} registered with services: ${message.capabilities.services.join(', ')}`);
    } catch (error) {
      logger.error(`Failed to register worker ${message.worker_id}:`, error);
      throw error;
    }
  }

  async handleWorkerStatus(message: WorkerStatusMessage): Promise<void> {
    try {
      await this.redisService.updateWorkerStatus(
        message.worker_id,
        message.status,
        message.current_job_id ? [message.current_job_id] : []
      );

      // Broadcast status to monitors
      await this.connectionManager.broadcastToMonitors(message);
      
      logger.debug(`Worker ${message.worker_id} status: ${message.status}`);
    } catch (error) {
      logger.error(`Failed to handle worker status for ${message.worker_id}:`, error);
      throw error;
    }
  }

  async handleWorkerHeartbeat(message: WorkerHeartbeatMessage): Promise<void> {
    try {
      await this.redisService.updateWorkerHeartbeat(
        message.worker_id, 
        message.system_info
      );
      
      logger.debug(`Heartbeat received from worker ${message.worker_id}`);
    } catch (error) {
      logger.error(`Failed to handle heartbeat from worker ${message.worker_id}:`, error);
      throw error;
    }
  }

  async handleWorkerDisconnect(workerId: string): Promise<void> {
    try {
      // Release any active jobs back to the queue
      const activeJobs = await this.redisService.getActiveJobs(workerId);
      for (const job of activeJobs) {
        await this.redisService.releaseJob(job.id);
        logger.info(`Released job ${job.id} from disconnected worker ${workerId}`);
      }

      // Remove worker from active list
      await this.redisService.removeWorker(workerId);
      
      logger.info(`Worker ${workerId} disconnected and cleaned up`);
    } catch (error) {
      logger.error(`Failed to handle disconnect for worker ${workerId}:`, error);
      throw error;
    }
  }

  async handleServiceRequest(message: ServiceRequestMessage): Promise<void> {
    try {
      // Broadcast service request to monitors for debugging/visibility
      await this.connectionManager.broadcastToMonitors(message);
      
      logger.debug(`Service request from worker ${message.worker_id}: ${message.method} ${message.endpoint}`);
    } catch (error) {
      logger.error(`Failed to handle service request:`, error);
      throw error;
    }
  }

  async handleSystemStatus(message: any): Promise<void> {
    // Placeholder for system status handling
    logger.debug('System status message received');
  }

  async handleError(message: any): Promise<void> {
    logger.error('Error message received:', message);
  }

  async handleJobCancelled(message: any): Promise<void> {
    // Placeholder for job cancellation handling
    logger.info(`Job ${message.job_id} cancelled`);
  }

  // Message validation and parsing
  async validateMessage(message: any): Promise<boolean> {
    return !!(message && message.id && message.type && message.timestamp);
  }

  async parseMessage(rawMessage: string | Buffer): Promise<BaseMessage | null> {
    try {
      const messageStr = rawMessage instanceof Buffer ? rawMessage.toString() : rawMessage;
      const parsed = JSON.parse(messageStr);
      
      if (await this.validateMessage(parsed)) {
        return parsed as BaseMessage;
      }
      
      return null;
    } catch (error) {
      logger.error('Failed to parse message:', error);
      return null;
    }
  }

  async serializeMessage(message: BaseMessage): Promise<string> {
    return JSON.stringify(message);
  }

  // Message routing
  async routeMessage(message: BaseMessage): Promise<void> {
    await this.handleMessage(message);
  }

  async broadcastToWorkers(message: BaseMessage, workerFilter?: (workerId: string) => boolean): Promise<void> {
    await this.connectionManager.sendToAllWorkers(message, workerFilter);
  }

  async broadcastToClients(message: BaseMessage, clientFilter?: (clientId: string) => boolean): Promise<void> {
    await this.connectionManager.sendToAllClients(message, clientFilter);
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

  // Helper methods
  private async notifyWorkersOfNewJob(jobId: string, jobType: string, requirements?: any): Promise<void> {
    const job = await this.redisService.getJob(jobId);
    if (!job) return;

    const jobAvailableMessage: JobAvailableMessage = {
      id: uuidv4(),
      type: MessageType.JOB_AVAILABLE,
      timestamp: new Date().toISOString(),
      job_id: jobId,
      job_type: jobType,
      priority: job.priority,
      requirements,
      last_failed_worker: job.last_failed_worker
    };

    await this.connectionManager.notifyIdleWorkersOfJob(jobId, jobType, requirements);
  }

  private updateStats(messageType: MessageType): void {
    const count = this.messageTypeStats.get(messageType) || 0;
    this.messageTypeStats.set(messageType, count + 1);
  }

  // Event handlers (placeholder implementations)
  onMessageReceived(callback: (message: BaseMessage) => void): void {
    // Store callback for message received events
  }

  onMessageSent(callback: (message: BaseMessage) => void): void {
    // Store callback for message sent events
  }

  onMessageError(callback: (error: Error, message?: BaseMessage) => void): void {
    // Store callback for message error events
  }

  // Statistics
  async getMessageStatistics(): Promise<{
    messages_processed: number;
    messages_failed: number;
    messages_per_second: number;
    message_types: Record<MessageType, number>;
  }> {
    const runtime = (Date.now() - this.messageStats.startTime) / 1000;
    const messagesPerSecond = this.messageStats.processed / runtime;

    const messageTypes: Record<MessageType, number> = {} as Record<MessageType, number>;
    for (const [type, count] of this.messageTypeStats) {
      messageTypes[type] = count;
    }

    return {
      messages_processed: this.messageStats.processed,
      messages_failed: this.messageStats.failed,
      messages_per_second: messagesPerSecond,
      message_types: messageTypes
    };
  }

  async resetStatistics(): Promise<void> {
    this.messageStats = {
      processed: 0,
      failed: 0,
      startTime: Date.now()
    };
    this.messageTypeStats.clear();
  }
}