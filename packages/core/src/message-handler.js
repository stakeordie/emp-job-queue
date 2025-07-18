// Message Handler Implementation - direct port from Python core/message_handler.py
// Handles all message types and routing logic
import { TimestampUtil } from './utils/timestamp.js';
import { MessageType, } from './types/messages.js';
import { WorkerStatus } from './types/worker.js';
import { logger } from './utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
export class MessageHandler {
    redisService;
    connectionManager;
    eventBroadcaster;
    messageStats = {
        processed: 0,
        failed: 0,
        startTime: Date.now(),
    };
    messageTypeStats = new Map();
    // Stub implementations for new interface requirements
    registerHandler(_messageType, _handler) {
        // Legacy handler - no dynamic registration support
    }
    unregisterHandler(_messageType) {
        // Legacy handler - no dynamic registration support
    }
    hasHandler(messageType) {
        // Legacy handler - static handler checking
        return Object.values(MessageType).includes(messageType);
    }
    getRegisteredHandlers() {
        // Legacy handler - return all message types
        return Object.values(MessageType);
    }
    constructor(redisService, connectionManager, eventBroadcaster) {
        this.redisService = redisService;
        this.connectionManager = connectionManager;
        this.eventBroadcaster = eventBroadcaster;
        this.setupMessageRouting();
    }
    setupMessageRouting() {
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
        this.connectionManager.onWorkerDisconnect(workerId => {
            this.handleWorkerDisconnect(workerId).catch(error => {
                logger.error(`Error handling worker disconnect for ${workerId}:`, error);
            });
        });
    }
    async handleMessage(message) {
        try {
            this.updateStats(message.type);
            switch (message.type) {
                case MessageType.SUBMIT_JOB:
                    await this.handleJobSubmission(message);
                    break;
                case MessageType.UPDATE_JOB_PROGRESS:
                    await this.handleJobProgress(message);
                    break;
                case MessageType.FAIL_JOB:
                    await this.handleJobFailed(message);
                    break;
                case MessageType.COMPLETE_JOB:
                    await this.handleCompleteJob(message);
                    break;
                case MessageType.CANCEL_JOB:
                    await this.handleCancelJob(message);
                    break;
                case MessageType.REGISTER_WORKER:
                    await this.handleWorkerRegistration(message);
                    break;
                case MessageType.WORKER_STATUS:
                    await this.handleWorkerStatus(message);
                    break;
                case MessageType.WORKER_HEARTBEAT:
                    await this.handleWorkerHeartbeat(message);
                    break;
                case MessageType.SERVICE_REQUEST:
                    await this.handleServiceRequest(message);
                    break;
                case MessageType.SYNC_JOB_STATE:
                    await this.handleSyncJobState(message);
                    break;
                default:
                    logger.warn(`Unhandled message type: ${message.type}`);
            }
            this.messageStats.processed++;
        }
        catch (error) {
            this.messageStats.failed++;
            logger.error(`Error handling message ${message.id}:`, error);
            throw error;
        }
    }
    async handleWorkerMessage(workerId, message) {
        // Add worker context to message
        message.source = workerId;
        await this.handleMessage(message);
    }
    async handleClientMessage(clientId, message) {
        // Add client context to message
        message.source = clientId;
        await this.handleMessage(message);
    }
    // Job message handlers
    async handleJobSubmission(message) {
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
            // Broadcast job submitted event
            if (this.eventBroadcaster) {
                this.eventBroadcaster.broadcastJobSubmitted(jobId, {
                    job_type: message.job_type,
                    priority: message.priority,
                    workflow_id: message.workflow_id,
                    workflow_priority: message.workflow_priority,
                    workflow_datetime: message.workflow_datetime,
                    step_number: message.step_number,
                    customer_id: message.customer_id,
                    requirements: message.requirements,
                    created_at: Date.now(),
                });
            }
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
            // Broadcast job progress event
            if (this.eventBroadcaster) {
                this.eventBroadcaster.broadcastJobProgress(message.job_id, message.worker_id, message.progress);
            }
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
            await this.redisService.updateWorkerStatus(message.worker_id, WorkerStatus.IDLE, []);
            // Broadcast completion to monitors
            await this.connectionManager.broadcastToMonitors(message);
            // Forward to clients subscribed to this job
            await this.connectionManager.forwardJobCompletion(message.job_id, message.result);
            // Broadcast job completed event
            if (this.eventBroadcaster) {
                this.eventBroadcaster.broadcastJobCompleted(message.job_id, message.worker_id, message.result, Date.now());
            }
            logger.info(`Job ${message.job_id} completed by worker ${message.worker_id}`);
        }
        catch (error) {
            logger.error(`Failed to handle job completion for ${message.job_id}:`, error);
            throw error;
        }
    }
    async handleJobFailed(message) {
        try {
            await this.redisService.failJob(message.job_id, message.error, message.can_retry !== false);
            // Update worker status to idle
            await this.redisService.updateWorkerStatus(message.worker_id, WorkerStatus.IDLE, []);
            // Broadcast failure to monitors
            await this.connectionManager.broadcastToMonitors(message);
            // Broadcast job failed event
            if (this.eventBroadcaster) {
                this.eventBroadcaster.broadcastJobFailed(message.job_id, message.error || 'Unknown error', message.worker_id, Date.now());
            }
            logger.info(`Job ${message.job_id} failed on worker ${message.worker_id}: ${message.error}`);
        }
        catch (error) {
            logger.error(`Failed to handle job failure for ${message.job_id}:`, error);
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
        // This is sent by workers to fail a job
        await this.handleJobFailed({
            id: uuidv4(),
            type: MessageType.FAIL_JOB,
            timestamp: TimestampUtil.now(),
            job_id: message.job_id,
            worker_id: message.source || '',
            error: message.error,
            can_retry: message.retry,
        });
    }
    async handleCancelJob(message) {
        try {
            const jobId = message.job_id;
            const reason = message.reason || 'Cancelled by user';
            logger.info(`Cancelling job ${jobId}: ${reason}`);
            // Cancel the job using Redis service
            await this.redisService.cancelJob(jobId, reason);
            logger.info(`Job ${jobId} cancelled successfully`);
        }
        catch (error) {
            logger.error(`Failed to cancel job ${message.job_id}:`, error);
            throw error;
        }
    }
    // Worker message handlers
    async handleWorkerRegistration(message) {
        try {
            // For now, cast capabilities - in production, add proper validation
            const capabilities = message.capabilities;
            // Store capabilities in connection manager (in-memory, like Python version)
            await this.connectionManager.registerWorkerCapabilities(message.worker_id, capabilities);
            // Also register in Redis for job matching (optional)
            await this.redisService.registerWorker(capabilities);
            // Send confirmation back to worker
            await this.connectionManager.sendToWorker(message.worker_id, {
                id: uuidv4(),
                type: MessageType.WORKER_STATUS,
                timestamp: TimestampUtil.now(),
                worker_id: message.worker_id,
                status: WorkerStatus.IDLE,
            });
            // Broadcast worker connected event
            if (this.eventBroadcaster) {
                this.eventBroadcaster.broadcastWorkerConnected(message.worker_id, {
                    id: message.worker_id,
                    status: WorkerStatus.IDLE,
                    capabilities: capabilities,
                    connected_at: new Date().toISOString(),
                    jobs_completed: 0,
                    jobs_failed: 0,
                });
            }
            logger.info(`Worker ${message.worker_id} registered with services: ${Array.isArray(message.capabilities.services) ? message.capabilities.services.join(', ') : 'unknown'}`);
        }
        catch (error) {
            logger.error(`Failed to register worker ${message.worker_id}:`, error);
            throw error;
        }
    }
    async handleWorkerStatus(message) {
        try {
            await this.redisService.updateWorkerStatus(message.worker_id, message.status, message.current_job_id ? [message.current_job_id] : []);
            // Broadcast status to monitors
            await this.connectionManager.broadcastToMonitors(message);
            logger.debug(`Worker ${message.worker_id} status: ${message.status}`);
        }
        catch (error) {
            logger.error(`Failed to handle worker status for ${message.worker_id}:`, error);
            throw error;
        }
    }
    async handleWorkerHeartbeat(message) {
        try {
            await this.redisService.updateWorkerHeartbeat(message.worker_id, message.system_info);
            logger.debug(`Heartbeat received from worker ${message.worker_id}`);
        }
        catch (error) {
            logger.error(`Failed to handle heartbeat from worker ${message.worker_id}:`, error);
            throw error;
        }
    }
    async handleWorkerDisconnect(workerId) {
        try {
            // Release any active jobs back to the queue
            const activeJobs = await this.redisService.getActiveJobs(workerId);
            for (const job of activeJobs) {
                await this.redisService.releaseJob(job.id);
                logger.info(`Released job ${job.id} from disconnected worker ${workerId}`);
            }
            // Remove worker from active list
            await this.redisService.removeWorker(workerId);
            // Broadcast worker disconnected event
            if (this.eventBroadcaster) {
                this.eventBroadcaster.broadcastWorkerDisconnected(workerId);
            }
            logger.info(`Worker ${workerId} disconnected and cleaned up`);
        }
        catch (error) {
            logger.error(`Failed to handle disconnect for worker ${workerId}:`, error);
            throw error;
        }
    }
    async handleServiceRequest(message) {
        try {
            // Broadcast service request to monitors for debugging/visibility
            await this.connectionManager.broadcastToMonitors(message);
            logger.debug(`Service request from worker ${message.worker_id}: ${message.method} ${message.endpoint}`);
        }
        catch (error) {
            logger.error(`Failed to handle service request:`, error);
            throw error;
        }
    }
    async handleSystemStatus(_message) {
        // Placeholder for system status handling
        logger.debug('System status message received');
    }
    async handleError(message) {
        logger.error('Error message received:', message);
    }
    async handleJobCancelled(message) {
        // Placeholder for job cancellation handling
        logger.info(`Job ${message.job_id} cancelled`);
    }
    // Message validation and parsing
    async validateMessage(message) {
        const msg = message;
        return !!(msg && msg.id && msg.type && msg.timestamp);
    }
    async parseMessage(rawMessage) {
        try {
            const messageStr = (rawMessage instanceof Buffer ? rawMessage.toString() : rawMessage);
            const parsed = JSON.parse(messageStr);
            if (await this.validateMessage(parsed)) {
                return parsed;
            }
            return null;
        }
        catch (error) {
            logger.error('Failed to parse message:', error);
            return null;
        }
    }
    async serializeMessage(message) {
        return JSON.stringify(message);
    }
    // Message routing
    async routeMessage(message) {
        await this.handleMessage(message);
    }
    async broadcastToWorkers(message, workerFilter) {
        await this.connectionManager.sendToAllWorkers(message, workerFilter);
    }
    async broadcastToClients(message, clientFilter) {
        await this.connectionManager.sendToAllClients(message, clientFilter);
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
    // Helper methods
    async notifyWorkersOfNewJob(jobId, jobType, requirements) {
        const job = await this.redisService.getJob(jobId);
        if (!job)
            return;
        const _jobAvailableMessage = {
            id: uuidv4(),
            type: MessageType.JOB_AVAILABLE,
            timestamp: TimestampUtil.now(),
            job_id: jobId,
            job_type: jobType,
            priority: job.priority,
            requirements,
            last_failed_worker: job.last_failed_worker,
        };
        await this.connectionManager.notifyIdleWorkersOfJob(jobId, jobType, requirements);
    }
    updateStats(messageType) {
        const count = this.messageTypeStats.get(messageType) || 0;
        this.messageTypeStats.set(messageType, count + 1);
    }
    // Event handlers (placeholder implementations)
    onMessageReceived(_callback) {
        // Store callback for message received events
    }
    onMessageSent(_callback) {
        // Store callback for message sent events
    }
    onMessageError(_callback) {
        // Store callback for message error events
    }
    // Statistics
    async getMessageStatistics() {
        const runtime = (Date.now() - this.messageStats.startTime) / 1000;
        const messagesPerSecond = this.messageStats.processed / runtime;
        const messageTypes = {};
        for (const [type, count] of this.messageTypeStats) {
            messageTypes[type] = count;
        }
        return {
            messages_processed: this.messageStats.processed,
            messages_failed: this.messageStats.failed,
            messages_per_second: messagesPerSecond,
            message_types: messageTypes,
        };
    }
    async resetStatistics() {
        this.messageStats = {
            processed: 0,
            failed: 0,
            startTime: Date.now(),
        };
        this.messageTypeStats.clear();
    }
    async handleSyncJobState(message) {
        try {
            const jobId = message.job_id;
            logger.info(`Sync job state request: ${jobId ? `job ${jobId}` : 'all jobs'}`);
            if (jobId) {
                // Sync specific job
                const job = await this.redisService.getJob(jobId);
                if (job) {
                    // Broadcast updated job state to monitors
                    if (this.eventBroadcaster) {
                        this.eventBroadcaster.broadcastJobStatusChanged(jobId, job.status, job.status, job.worker_id);
                    }
                    logger.info(`Synced job ${jobId} state: ${job.status}`);
                }
                else {
                    logger.warn(`Job ${jobId} not found for sync`);
                }
            }
            else {
                // Sync all jobs - detect and fix orphaned jobs
                logger.info('Starting full job state sync - checking for orphaned jobs...');
                const orphanedCount = await this.redisService.detectAndFixOrphanedJobs();
                // Get all jobs and broadcast updated states
                const allJobs = await this.redisService.getAllJobs();
                // Broadcast job state updates to monitors
                if (this.eventBroadcaster) {
                    allJobs.forEach(job => {
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        this.eventBroadcaster.broadcastJobStatusChanged(job.id, job.status, job.status, job.worker_id);
                    });
                }
                logger.info(`Synced full job state - ${allJobs.length} jobs total, fixed ${orphanedCount} orphaned jobs`);
            }
        }
        catch (error) {
            logger.error('Error handling sync job state request:', error);
            throw error;
        }
    }
}
//# sourceMappingURL=message-handler.js.map