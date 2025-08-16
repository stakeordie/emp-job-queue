// Enhanced Message Handler - Flexible message routing with dynamic handler registration
// Supports both pre-defined handlers and custom message type handlers
import { TimestampUtil } from './utils/timestamp.js';
import { MessageType, } from './types/messages.js';
import { WorkerStatus } from './types/worker.js';
import { logger } from './utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
export class EnhancedMessageHandler {
    redisService;
    connectionManager;
    // Dynamic handler registry
    handlers = new Map();
    // Message statistics
    messageStats = {
        processed: 0,
        failed: 0,
        startTime: Date.now(),
    };
    messageTypeStats = new Map();
    // Event callbacks
    onMessageReceivedCallbacks = [];
    onMessageSentCallbacks = [];
    onMessageErrorCallbacks = [];
    constructor(redisService, connectionManager) {
        this.redisService = redisService;
        this.connectionManager = connectionManager;
        this.setupDefaultHandlers();
        this.setupMessageRouting();
    }
    // Dynamic handler registration methods
    registerHandler(messageType, handler) {
        this.handlers.set(messageType, handler);
        logger.info(`Registered handler for message type: ${messageType}`);
    }
    unregisterHandler(messageType) {
        if (this.handlers.delete(messageType)) {
            logger.info(`Unregistered handler for message type: ${messageType}`);
        }
    }
    hasHandler(messageType) {
        return this.handlers.has(messageType);
    }
    getRegisteredHandlers() {
        return Array.from(this.handlers.keys());
    }
    /**
     * Set up default handlers for core message types
     */
    setupDefaultHandlers() {
        // Job lifecycle handlers
        this.registerHandler(MessageType.SUBMIT_JOB, this.handleJobSubmissionImpl.bind(this));
        this.registerHandler(MessageType.UPDATE_JOB_PROGRESS, this.handleJobProgress.bind(this));
        this.registerHandler(MessageType.COMPLETE_JOB, this.handleCompleteJob.bind(this));
        this.registerHandler(MessageType.FAIL_JOB, this.handleFailJob.bind(this));
        this.registerHandler(MessageType.CANCEL_JOB, this.handleCancelJob.bind(this));
        this.registerHandler(MessageType.SYNC_JOB_STATE, this.handleSyncJobState.bind(this));
        this.registerHandler(MessageType.COMPLETE_JOB, this.handleJobComplete.bind(this));
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
    setupMessageRouting() {
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
    async handleMessage(message, context) {
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
            }
            else {
                // Handle unknown message type gracefully
                await this.handleUnknownMessage(message);
            }
        }
        catch (error) {
            this.messageStats.failed++;
            logger.error(`Failed to handle message type ${message.type}:`, error);
            this.notifyMessageError(error, message);
            throw error;
        }
    }
    async handleWorkerMessage(workerId, message) {
        const context = {
            workerId,
            source: 'worker',
            timestamp: Date.now(),
        };
        // Add worker context to message
        message.worker_id = workerId;
        message.source = workerId;
        await this.handleMessage(message, context);
    }
    async handleClientMessage(clientId, message) {
        const context = {
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
    async handleUnknownMessage(message) {
        logger.warn(`Received unknown message type: ${message.type}`, {
            messageId: message.id,
            source: message.source,
            timestamp: message.timestamp,
        });
        // Optionally send error response
        if (message.source) {
            const errorMessage = {
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
            }
            else if (message.source) {
                await this.connectionManager.sendToClient(message.source, errorMessage);
            }
        }
    }
    // Core message handlers (existing implementations)
    async handleJobSubmissionImpl(message) {
        try {
            const jobId = await this.redisService.submitJob({
                service_required: message.job_type,
                priority: message.priority,
                payload: message.payload,
                customer_id: message.customer_id,
                requirements: message.requirements,
                max_retries: 3,
                workflow_id: message.workflow_id,
                workflow_priority: message.workflow_priority,
                workflow_datetime: message.workflow_datetime,
                step_number: message.step_number,
            });
            // Notify available workers about the new job
            await this.notifyWorkersOfNewJob(jobId, message.job_type, message.requirements);
            logger.info(`Job ${jobId} submitted and workers notified`);
        }
        catch (error) {
            logger.error(`Failed to handle job submission:`, error);
            throw error;
        }
    }
    async handleJobProgress(message) {
        try {
            await this.redisService.updateJobProgress(message.job_id, {
                job_id: message.job_id,
                worker_id: message.worker_id,
                progress: message.progress,
                status: message.status,
                message: message.message,
                current_step: undefined,
                total_steps: undefined,
                estimated_completion: typeof message.estimated_completion === 'string'
                    ? message.estimated_completion
                    : undefined,
                updated_at: TimestampUtil.toISO(message.timestamp),
            });
            // Broadcast progress to monitors
            await this.connectionManager.broadcastToMonitors(message);
            logger.debug(`Job ${message.job_id} progress: ${message.progress}%`);
        }
        catch (error) {
            logger.error(`Failed to handle job progress for ${message.job_id}:`, error);
            throw error;
        }
    }
    async handleJobComplete(message) {
        try {
            await this.redisService.completeJob(message.job_id, {
                success: true,
                data: message.result,
                processing_time: typeof message.result?.processing_time === 'number'
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
        }
        catch (error) {
            logger.error(`Failed to handle job completion for ${message.job_id}:`, error);
            throw error;
        }
    }
    async handleCompleteJob(message) {
        // This is sent by workers to complete a job
        await this.handleJobComplete({
            id: uuidv4(),
            type: MessageType.COMPLETE_JOB,
            timestamp: TimestampUtil.now(),
            job_id: message.job_id,
            worker_id: message.worker_id, // Use the required worker_id field
            status: 'completed',
            result: message.result,
            processing_time: message.result?.processing_time,
        });
    }
    async handleFailJob(message) {
        try {
            const errorMessage = message.error || 'Unknown error';
            await this.redisService.failJob(message.job_id, errorMessage, message.retry !== false);
            // Update worker status to idle
            if (message.worker_id) {
                await this.redisService.updateWorkerStatus(message.worker_id, WorkerStatus.IDLE, []);
            }
            // Broadcast failure to monitors
            await this.connectionManager.broadcastToMonitors(message);
            logger.info(`Job ${message.job_id} failed on worker ${message.worker_id}: ${errorMessage}`);
        }
        catch (error) {
            logger.error(`Failed to handle job failure for ${message.job_id}:`, error);
            throw error;
        }
    }
    async handleCancelJob(message) {
        try {
            const jobId = message.job_id;
            const reason = message.reason || 'Cancelled by user';
            await this.redisService.cancelJob(jobId, reason);
            // Notify worker if job is currently being processed
            const job = await this.redisService.getJob(jobId);
            if (job?.worker_id) {
                const cancelMessage = {
                    type: 'job_cancelled',
                    timestamp: TimestampUtil.now(),
                    job_id: jobId,
                    reason,
                };
                await this.connectionManager.sendToWorker(job.worker_id, cancelMessage);
            }
            logger.info(`Job ${jobId} cancelled: ${reason}`);
        }
        catch (error) {
            logger.error(`Failed to handle job cancellation for ${message.job_id}:`, error);
            throw error;
        }
    }
    async handleSyncJobState(message) {
        try {
            const jobId = message.job_id;
            if (jobId) {
                // Sync specific job
                const job = await this.redisService.getJob(jobId);
                if (job) {
                    // Send updated job state back to client
                    const response = {
                        type: 'job_state_synced',
                        timestamp: TimestampUtil.now(),
                        job_id: jobId,
                        job_data: job,
                    };
                    await this.connectionManager.sendToClient(message.source || '', response);
                    logger.info(`Synced job state for ${jobId}`);
                }
                else {
                    // Job not found - send error response
                    const response = {
                        type: 'sync_error',
                        timestamp: TimestampUtil.now(),
                        job_id: jobId,
                        error: `Job ${jobId} not found`,
                    };
                    await this.connectionManager.sendToClient(message.source || '', response);
                    logger.warn(`Job ${jobId} not found for sync request`);
                }
            }
            else {
                // Sync all jobs - this will detect and fix orphaned jobs
                logger.info('Starting full job state sync - checking for orphaned jobs...');
                const allJobs = await this.redisService.getAllJobs();
                const orphanedCount = await this.redisService.detectAndFixOrphanedJobs();
                const response = {
                    type: 'full_state_synced',
                    timestamp: TimestampUtil.now(),
                    jobs: allJobs,
                    orphaned_jobs_fixed: orphanedCount,
                    sync_timestamp: Date.now(),
                };
                await this.connectionManager.sendToClient(message.source || '', response);
                logger.info(`Synced full job state - ${allJobs.length} jobs total, fixed ${orphanedCount} orphaned jobs`);
            }
        }
        catch (error) {
            logger.error(`Failed to handle sync job state request:`, error);
            // Send error response to client
            const errorResponse = {
                type: 'sync_error',
                timestamp: TimestampUtil.now(),
                error: error instanceof Error ? error.message : 'Unknown sync error',
            };
            await this.connectionManager.sendToClient(message.source || '', errorResponse);
            throw error;
        }
    }
    async handleWorkerRegistration(message) {
        try {
            await this.redisService.registerWorker(message.capabilities);
            const response = {
                type: MessageType.WORKER_REGISTERED,
                timestamp: TimestampUtil.now(),
                worker_id: message.worker_id,
                status: 'registered',
            };
            await this.connectionManager.sendToWorker(message.worker_id, response);
            logger.info(`Worker ${message.worker_id} registered successfully`);
        }
        catch (error) {
            logger.error(`Failed to register worker ${message.worker_id}:`, error);
            throw error;
        }
    }
    async handleWorkerStatus(message) {
        try {
            await this.redisService.updateWorkerStatus(message.worker_id, message.status, [message.current_job_id].filter(Boolean));
            logger.debug(`Worker ${message.worker_id} status updated to ${message.status}`);
        }
        catch (error) {
            logger.error(`Failed to update worker status for ${message.worker_id}:`, error);
            throw error;
        }
    }
    async handleWorkerHeartbeat(message) {
        try {
            await this.redisService.updateWorkerHeartbeat(message.worker_id, message.system_info);
            const response = {
                type: MessageType.WORKER_HEARTBEAT_ACK,
                timestamp: TimestampUtil.now(),
                worker_id: message.worker_id,
            };
            await this.connectionManager.sendToWorker(message.worker_id, response);
        }
        catch (error) {
            logger.error(`Failed to handle heartbeat from worker ${message.worker_id}:`, error);
            throw error;
        }
    }
    async handleServiceRequest(message) {
        // Placeholder for service request handling
        logger.debug(`Service request from worker ${message.worker_id} for job ${message.job_id}`);
    }
    async handleError(message) {
        logger.error(`Received error message:`, message.error);
    }
    async handleAck(message) {
        logger.debug(`Received acknowledgment for message type: ${message.original_type}`);
    }
    // Helper methods
    async notifyWorkersOfNewJob(jobId, jobType, requirements) {
        const message = {
            type: MessageType.JOB_AVAILABLE,
            timestamp: TimestampUtil.now(),
            job_id: jobId,
            job_type: jobType,
            params_summary: requirements,
        };
        await this.broadcastToWorkers(message);
    }
    // Event callback methods
    onMessageReceived(callback) {
        this.onMessageReceivedCallbacks.push(callback);
    }
    onMessageSent(callback) {
        this.onMessageSentCallbacks.push(callback);
    }
    onMessageError(callback) {
        this.onMessageErrorCallbacks.push(callback);
    }
    notifyMessageReceived(message) {
        this.onMessageReceivedCallbacks.forEach(callback => {
            try {
                callback(message);
            }
            catch (error) {
                logger.error('Error in message received callback:', error);
            }
        });
    }
    notifyMessageSent(message) {
        this.onMessageSentCallbacks.forEach(callback => {
            try {
                callback(message);
            }
            catch (error) {
                logger.error('Error in message sent callback:', error);
            }
        });
    }
    notifyMessageError(error, message) {
        this.onMessageErrorCallbacks.forEach(callback => {
            try {
                callback(error, message);
            }
            catch (callbackError) {
                logger.error('Error in message error callback:', callbackError);
            }
        });
    }
    // Statistics and monitoring
    async getMessageStatistics() {
        const uptime = (Date.now() - this.messageStats.startTime) / 1000;
        const messagesPerSecond = uptime > 0 ? this.messageStats.processed / uptime : 0;
        return {
            messages_processed: this.messageStats.processed,
            messages_failed: this.messageStats.failed,
            messages_per_second: Number(messagesPerSecond.toFixed(2)),
            message_types: Object.fromEntries(this.messageTypeStats),
        };
    }
    async resetStatistics() {
        this.messageStats = {
            processed: 0,
            failed: 0,
            startTime: Date.now(),
        };
        this.messageTypeStats.clear();
        logger.info('Message statistics reset');
    }
    // Legacy interface support (for backward compatibility)
    async handleJobFailed(message) {
        await this.handleFailJob(message);
    }
    async handleJobSubmission(message) {
        return this.handleJobSubmissionImpl(message);
    }
    async handleJobCancelled(message) {
        await this.handleCancelJob(message);
    }
    async handleWorkerDisconnect(workerId) {
        try {
            await this.redisService.updateWorkerStatus(workerId, WorkerStatus.OFFLINE, []);
            logger.info(`Worker ${workerId} disconnected`);
        }
        catch (error) {
            logger.error(`Failed to handle worker disconnect for ${workerId}:`, error);
        }
    }
    // Placeholder implementations for interface compatibility
    async validateMessage(message) {
        const msg = message;
        return msg && typeof msg.type === 'string' && typeof msg.timestamp === 'number';
    }
    async parseMessage(rawMessage) {
        try {
            const messageStr = typeof rawMessage === 'string' ? rawMessage : rawMessage.toString();
            return JSON.parse(messageStr);
        }
        catch (error) {
            logger.error('Failed to parse message:', error);
            return null;
        }
    }
    async serializeMessage(message) {
        return JSON.stringify(message);
    }
    async routeMessage(message) {
        await this.handleMessage(message);
    }
    async broadcastToWorkers(message, workerFilter) {
        // Implementation depends on connection manager capabilities
        if ('broadcastToWorkers' in this.connectionManager) {
            await this.connectionManager.broadcastToWorkers(message, workerFilter);
        }
    }
    async broadcastToClients(message, clientFilter) {
        // Implementation depends on connection manager capabilities
        if ('broadcastToClients' in this.connectionManager) {
            await this.connectionManager.broadcastToClients(message, clientFilter);
        }
    }
    async broadcastToMonitors(message) {
        await this.connectionManager.broadcastToMonitors(message);
    }
    async sendToWorker(workerId, message) {
        return await this.connectionManager.sendToWorker(workerId, message);
    }
    async sendToClient(clientId, message) {
        return await this.connectionManager.sendToClient(clientId, message);
    }
    async handleSystemStatus(_message) {
        logger.debug('System status message received');
    }
}
//# sourceMappingURL=enhanced-message-handler.js.map