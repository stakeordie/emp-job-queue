import { MessageHandlerInterface } from './interfaces/message-handler.js';
import { RedisServiceInterface } from './interfaces/redis-service.js';
import { ConnectionManagerInterface } from './interfaces/connection-manager.js';
import { EventBroadcaster } from './services/event-broadcaster.js';
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
  ServiceRequestMessage,
  CompleteJobMessage,
  CancelJobMessage,
  FailJobMessage,
} from './types/messages.js';
export declare class MessageHandler implements MessageHandlerInterface {
  private redisService;
  private connectionManager;
  private eventBroadcaster?;
  private messageStats;
  private messageTypeStats;
  registerHandler(_messageType: string, _handler: unknown): void;
  unregisterHandler(_messageType: string): void;
  hasHandler(messageType: string): boolean;
  getRegisteredHandlers(): string[];
  constructor(
    redisService: RedisServiceInterface,
    connectionManager: ConnectionManagerInterface,
    eventBroadcaster?: EventBroadcaster
  );
  private setupMessageRouting;
  handleMessage(message: BaseMessage): Promise<void>;
  handleWorkerMessage(workerId: string, message: BaseMessage): Promise<void>;
  handleClientMessage(clientId: string, message: BaseMessage): Promise<void>;
  handleJobSubmission(message: JobSubmissionMessage): Promise<void>;
  handleJobProgress(message: JobProgressMessage): Promise<void>;
  handleJobComplete(message: JobCompletedMessage): Promise<void>;
  handleJobFailed(message: JobFailedMessage): Promise<void>;
  handleCompleteJob(message: CompleteJobMessage): Promise<void>;
  handleFailJob(message: FailJobMessage): Promise<void>;
  handleCancelJob(message: CancelJobMessage): Promise<void>;
  handleWorkerRegistration(message: WorkerRegistrationMessage): Promise<void>;
  handleWorkerStatus(message: WorkerStatusMessage): Promise<void>;
  handleWorkerHeartbeat(message: WorkerHeartbeatMessage): Promise<void>;
  handleWorkerDisconnect(workerId: string): Promise<void>;
  handleServiceRequest(message: ServiceRequestMessage): Promise<void>;
  handleSystemStatus(_message: unknown): Promise<void>;
  handleError(message: unknown): Promise<void>;
  handleJobCancelled(message: { job_id: string }): Promise<void>;
  validateMessage(message: unknown): Promise<boolean>;
  parseMessage(rawMessage: string | Buffer): Promise<BaseMessage | null>;
  serializeMessage(message: BaseMessage): Promise<string>;
  routeMessage(message: BaseMessage): Promise<void>;
  broadcastToWorkers(
    message: BaseMessage,
    workerFilter?: (workerId: string) => boolean
  ): Promise<void>;
  broadcastToClients(
    message: BaseMessage,
    clientFilter?: (clientId: string) => boolean
  ): Promise<void>;
  broadcastToMonitors(message: BaseMessage): Promise<void>;
  sendToWorker(workerId: string, message: BaseMessage): Promise<boolean>;
  sendToClient(clientId: string, message: BaseMessage): Promise<boolean>;
  private notifyWorkersOfNewJob;
  private updateStats;
  onMessageReceived(_callback: (message: BaseMessage) => void): void;
  onMessageSent(_callback: (message: BaseMessage) => void): void;
  onMessageError(_callback: (error: Error, message?: BaseMessage) => void): void;
  getMessageStatistics(): Promise<{
    messages_processed: number;
    messages_failed: number;
    messages_per_second: number;
    message_types: Record<MessageType, number>;
  }>;
  resetStatistics(): Promise<void>;
  handleSyncJobState(message: Record<string, unknown>): Promise<void>;
}
//# sourceMappingURL=message-handler.d.ts.map
