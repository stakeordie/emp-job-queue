// Message Handler Interface - direct port from Python core/interfaces/message_handler_interface.py
// Defines contract for message processing and routing

import { BaseMessage, MessageType } from '../types/messages.js';

export interface MessageHandlerInterface {
  // Message processing
  handleMessage(message: BaseMessage): Promise<void>;
  handleWorkerMessage(workerId: string, message: BaseMessage): Promise<void>;
  handleClientMessage(clientId: string, message: BaseMessage): Promise<void>;

  // Specific message handlers
  handleJobSubmission(message): Promise<void>;
  handleJobProgress(message): Promise<void>;
  handleJobComplete(message): Promise<void>;
  handleJobFailed(message): Promise<void>;
  handleJobCancelled(message): Promise<void>;

  handleWorkerRegistration(message): Promise<void>;
  handleWorkerStatus(message): Promise<void>;
  handleWorkerHeartbeat(message): Promise<void>;
  handleWorkerDisconnect(workerId: string): Promise<void>;

  handleServiceRequest(message): Promise<void>;
  handleSystemStatus(message): Promise<void>;
  handleError(message): Promise<void>;

  // Message validation
  validateMessage(message): Promise<boolean>;
  parseMessage(rawMessage: string | Buffer): Promise<BaseMessage | null>;
  serializeMessage(message: BaseMessage): Promise<string>;

  // Message routing
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

  // Message lifecycle
  onMessageReceived(callback: (message: BaseMessage) => void): void;
  onMessageSent(callback: (message: BaseMessage) => void): void;
  onMessageError(callback: (error: Error, message?: BaseMessage) => void): void;

  // Statistics and monitoring
  getMessageStatistics(): Promise<{
    messages_processed: number;
    messages_failed: number;
    messages_per_second: number;
    message_types: Record<MessageType, number>;
  }>;

  resetStatistics(): Promise<void>;
}
