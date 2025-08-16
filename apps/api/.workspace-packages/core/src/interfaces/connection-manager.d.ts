import { BaseMessage, ChunkedMessageChunk } from '../types/messages.js';
import { WorkerCapabilities } from '../types/worker.js';
export interface ConnectionManagerInterface {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  addWorkerConnection(workerId: string, connection: WebSocketConnection): Promise<void>;
  removeWorkerConnection(workerId: string): Promise<void>;
  registerWorkerCapabilities(workerId: string, capabilities: WorkerCapabilities): Promise<void>;
  getWorkerConnection(workerId: string): WebSocketConnection | undefined;
  getAllWorkerConnections(): Map<string, WebSocketConnection>;
  getConnectedWorkers(): Promise<
    Array<{
      workerId: string;
      capabilities?: WorkerCapabilities;
      connectedAt: string;
      lastActivity: string;
    }>
  >;
  isWorkerConnected(workerId: string): boolean;
  getConnectedWorkerIds(): string[];
  addClientConnection(clientId: string, connection: WebSocketConnection): Promise<void>;
  removeClientConnection(clientId: string): Promise<void>;
  getClientConnection(clientId: string): WebSocketConnection | undefined;
  getAllClientConnections(): Map<string, WebSocketConnection>;
  isClientConnected(clientId: string): boolean;
  getConnectedClientIds(): string[];
  sendToWorker(workerId: string, message: BaseMessage): Promise<boolean>;
  sendToClient(clientId: string, message: BaseMessage): Promise<boolean>;
  sendToAllWorkers(message: BaseMessage, filter?: (workerId: string) => boolean): Promise<number>;
  sendToAllClients(message: BaseMessage, filter?: (clientId: string) => boolean): Promise<number>;
  broadcastToMonitors(message: BaseMessage): Promise<number>;
  sendToSpecificClient(clientId: string, message: BaseMessage): Promise<boolean>;
  startStatsBroadcast(intervalMs?: number): void;
  stopStatsBroadcast(): void;
  notifyIdleWorkersOfJob(jobId: string, jobType: string, requirements?: any): Promise<number>;
  sendJobAssignment(workerId: string, jobId: string, jobData: any): Promise<boolean>;
  sendJobCancellation(workerId: string, jobId: string, reason: string): Promise<boolean>;
  forwardJobCompletion(jobId: string, result: any): Promise<void>;
  pingWorker(workerId: string): Promise<boolean>;
  pingClient(clientId: string): Promise<boolean>;
  pingAllConnections(): Promise<{
    workers: number;
    clients: number;
  }>;
  cleanupStaleConnections(): Promise<{
    workers: string[];
    clients: string[];
  }>;
  onWorkerMessage(callback: (workerId: string, message: BaseMessage) => void): void;
  onClientMessage(callback: (clientId: string, message: BaseMessage) => void): void;
  forwardMessage(message: BaseMessage, type: 'worker' | 'client', id: string): void;
  onWorkerConnect(callback: (workerId: string, capabilities?: WorkerCapabilities) => void): void;
  onWorkerDisconnect(callback: (workerId: string) => void): void;
  onClientConnect(callback: (clientId: string) => void): void;
  onClientDisconnect(callback: (clientId: string) => void): void;
  handleChunkedMessage(
    connectionId: string,
    chunk: ChunkedMessageChunk
  ): Promise<BaseMessage | null>;
  sendLargeMessage(connectionId: string, message: BaseMessage): Promise<boolean>;
  cleanupStaleChunks(): Promise<number>;
  getConnectionStatistics(): Promise<{
    total_workers: number;
    active_workers: number;
    total_clients: number;
    active_clients: number;
    messages_sent: number;
    messages_received: number;
    bytes_sent: number;
    bytes_received: number;
    connection_errors: number;
  }>;
  setMaxMessageSize(sizeBytes: number): void;
  setHeartbeatInterval(intervalMs: number): void;
  setConnectionTimeout(timeoutMs: number): void;
  getConfiguration(): ConnectionManagerConfig;
}
export interface WebSocketConnection {
  id: string;
  type: 'worker' | 'client' | 'monitor';
  workerId?: string;
  clientId?: string;
  socket: any;
  connected: boolean;
  connectedAt: string;
  lastActivity: string;
  messagesSent: number;
  messagesReceived: number;
  bytesSent: number;
  bytesReceived: number;
  send(message: BaseMessage): Promise<boolean>;
  ping(): Promise<boolean>;
  close(code?: number, reason?: string): Promise<void>;
  isAlive(): boolean;
}
export interface ConnectionManagerConfig {
  maxMessageSizeBytes: number;
  heartbeatIntervalMs: number;
  connectionTimeoutMs: number;
  chunkSizeBytes: number;
  maxChunkedMessageAge: number;
  maxConnectionsPerWorker: number;
  maxConnectionsPerClient: number;
  enableCompression: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
//# sourceMappingURL=connection-manager.d.ts.map
