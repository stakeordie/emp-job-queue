import { MessageHandlerInterface, MessageHandlerFunction, MessageContext } from './interfaces/message-handler.js';
import { RedisServiceInterface } from './interfaces/redis-service.js';
import { ConnectionManagerInterface } from './interfaces/connection-manager.js';
import { BaseMessage, JobSubmissionMessage, JobProgressMessage, JobCompletedMessage, JobFailedMessage, WorkerRegistrationMessage, WorkerStatusMessage, WorkerHeartbeatMessage, CompleteJobMessage, CancelJobMessage, FailJobMessage, ServiceRequestMessage, SyncJobStateMessage } from './types/messages.js';
export declare class EnhancedMessageHandler implements MessageHandlerInterface {
    private redisService;
    private connectionManager;
    private handlers;
    private messageStats;
    private messageTypeStats;
    private onMessageReceivedCallbacks;
    private onMessageSentCallbacks;
    private onMessageErrorCallbacks;
    constructor(redisService: RedisServiceInterface, connectionManager: ConnectionManagerInterface);
    registerHandler(messageType: string, handler: MessageHandlerFunction): void;
    unregisterHandler(messageType: string): void;
    hasHandler(messageType: string): boolean;
    getRegisteredHandlers(): string[];
    /**
     * Set up default handlers for core message types
     */
    private setupDefaultHandlers;
    private setupMessageRouting;
    /**
     * Main message handling entry point - routes to appropriate handler
     */
    handleMessage(message: BaseMessage, context?: MessageContext): Promise<void>;
    handleWorkerMessage(workerId: string, message: BaseMessage): Promise<void>;
    handleClientMessage(clientId: string, message: BaseMessage): Promise<void>;
    /**
     * Handle unknown message types gracefully
     */
    private handleUnknownMessage;
    private handleJobSubmissionImpl;
    handleJobProgress(message: JobProgressMessage): Promise<void>;
    handleJobComplete(message: JobCompletedMessage): Promise<void>;
    handleCompleteJob(message: CompleteJobMessage): Promise<void>;
    handleFailJob(message: FailJobMessage): Promise<void>;
    handleCancelJob(message: CancelJobMessage): Promise<void>;
    handleSyncJobState(message: SyncJobStateMessage): Promise<void>;
    handleWorkerRegistration(message: WorkerRegistrationMessage): Promise<void>;
    handleWorkerStatus(message: WorkerStatusMessage): Promise<void>;
    handleWorkerHeartbeat(message: WorkerHeartbeatMessage): Promise<void>;
    handleServiceRequest(message: ServiceRequestMessage): Promise<void>;
    handleError(message: BaseMessage & {
        error: string;
    }): Promise<void>;
    handleAck(message: BaseMessage): Promise<void>;
    private notifyWorkersOfNewJob;
    onMessageReceived(callback: (message: BaseMessage) => void): void;
    onMessageSent(callback: (message: BaseMessage) => void): void;
    onMessageError(callback: (error: Error, message?: BaseMessage) => void): void;
    private notifyMessageReceived;
    private notifyMessageSent;
    private notifyMessageError;
    getMessageStatistics(): Promise<{
        messages_processed: number;
        messages_failed: number;
        messages_per_second: number;
        message_types: Record<string, number>;
    }>;
    resetStatistics(): Promise<void>;
    handleJobFailed(message: JobFailedMessage): Promise<void>;
    handleJobSubmission(message: JobSubmissionMessage): Promise<void>;
    handleJobCancelled(message: CancelJobMessage): Promise<void>;
    handleWorkerDisconnect(workerId: string): Promise<void>;
    validateMessage(message: unknown): Promise<boolean>;
    parseMessage(rawMessage: string | Buffer): Promise<BaseMessage | null>;
    serializeMessage(message: BaseMessage): Promise<string>;
    routeMessage(message: BaseMessage): Promise<void>;
    broadcastToWorkers(message: BaseMessage, workerFilter?: (workerId: string) => boolean): Promise<void>;
    broadcastToClients(message: BaseMessage, clientFilter?: (clientId: string) => boolean): Promise<void>;
    broadcastToMonitors(message: BaseMessage): Promise<void>;
    sendToWorker(workerId: string, message: BaseMessage): Promise<boolean>;
    sendToClient(clientId: string, message: BaseMessage): Promise<boolean>;
    handleSystemStatus(_message: unknown): Promise<void>;
}
//# sourceMappingURL=enhanced-message-handler.d.ts.map