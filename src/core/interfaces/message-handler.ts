// Message Handler Interface - direct port from Python core/interfaces/message_handler_interface.py
// Defines contract for message processing and routing

import { BaseMessage, MessageType } from '../types/messages.js';

export interface MessageHandlerInterface {
  // Message processing
  handleMessage(message: BaseMessage): Promise<void>;
  handleWorkerMessage(workerId: string, message: BaseMessage): Promise<void>;
  handleClientMessage(clientId: string, message: BaseMessage): Promise<void>;
  
  // Specific message handlers
  handleJobSubmission(message: any): Promise<void>;
  handleJobProgress(message: any): Promise<void>;
  handleJobComplete(message: any): Promise<void>;
  handleJobFailed(message: any): Promise<void>;
  handleJobCancelled(message: any): Promise<void>;
  
  handleWorkerRegistration(message: any): Promise<void>;
  handleWorkerStatus(message: any): Promise<void>;
  handleWorkerHeartbeat(message: any): Promise<void>;
  handleWorkerDisconnect(workerId: string): Promise<void>;
  
  handleServiceRequest(message: any): Promise<void>;
  handleSystemStatus(message: any): Promise<void>;
  handleError(message: any): Promise<void>;

  // Message validation
  validateMessage(message: any): Promise<boolean>;
  parseMessage(rawMessage: string | Buffer): Promise<BaseMessage | null>;
  serializeMessage(message: BaseMessage): Promise<string>;

  // Message routing
  routeMessage(message: BaseMessage): Promise<void>;
  broadcastToWorkers(message: BaseMessage, workerFilter?: (workerId: string) => boolean): Promise<void>;
  broadcastToClients(message: BaseMessage, clientFilter?: (clientId: string) => boolean): Promise<void>;
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