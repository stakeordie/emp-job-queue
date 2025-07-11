// Message Handler Interface - direct port from Python core/interfaces/message_handler_interface.py
// Defines contract for message processing and routing

import { BaseMessage, MessageType } from '../types/messages.js';

// Type for message handler functions
export type MessageHandlerFunction = (message: BaseMessage) => Promise<void>;

// Handler context for advanced routing
export interface MessageContext {
  source?: string;
  workerId?: string;
  clientId?: string;
  connectionId?: string;
  timestamp: number;
}

export interface MessageHandlerInterface {
  // Dynamic handler registration
  registerHandler(messageType: string, handler: MessageHandlerFunction): void;
  unregisterHandler(messageType: string): void;
  hasHandler(messageType: string): boolean;
  getRegisteredHandlers(): string[];

  // Message processing
  handleMessage(message: BaseMessage, context?: MessageContext): Promise<void>;
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
