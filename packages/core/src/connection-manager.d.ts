import {
  ConnectionManagerInterface,
  WebSocketConnection,
  ConnectionManagerConfig,
} from './interfaces/connection-manager.js';
import { BaseMessage, ChunkedMessageChunk } from './types/messages.js';
import { WorkerCapabilities } from './types/worker.js';
import { RedisServiceInterface } from './interfaces/redis-service.js';
export declare class ConnectionManager implements ConnectionManagerInterface {
  private workerConnections;
  private clientConnections;
  private workerCapabilities;
  private chunkedMessages;
  private isRunningFlag;
  private config;
  private statsIntervalId?;
  private redisService?;
  private workerJobCounts;
  private workerMessageCallbacks;
  private clientMessageCallbacks;
  private workerConnectCallbacks;
  private workerDisconnectCallbacks;
  private clientConnectCallbacks;
  private clientDisconnectCallbacks;
  constructor(config?: Partial<ConnectionManagerConfig>, redisService?: RedisServiceInterface);
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  addWorkerConnection(workerId: string, connection: WebSocketConnection): Promise<void>;
  removeWorkerConnection(workerId: string): Promise<void>;
  getWorkerConnection(workerId: string): WebSocketConnection | undefined;
  getAllWorkerConnections(): Map<string, WebSocketConnection>;
  isWorkerConnected(workerId: string): boolean;
  getConnectedWorkerIds(): string[];
  registerWorkerCapabilities(workerId: string, capabilities: WorkerCapabilities): Promise<void>;
  getConnectedWorkers(): Promise<
    Array<{
      workerId: string;
      capabilities?: WorkerCapabilities;
      connectedAt: string;
      lastActivity: string;
    }>
  >;
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
  notifyIdleWorkersOfJob(jobId: string, jobType: string, requirements?: any): Promise<number>;
  sendJobAssignment(workerId: string, jobId: string, jobData: unknown): Promise<boolean>;
  sendJobCancellation(workerId: string, jobId: string, reason: string): Promise<boolean>;
  forwardJobCompletion(jobId: string, result: unknown): Promise<void>;
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
  handleChunkedMessage(
    _connectionId: string,
    chunk: ChunkedMessageChunk
  ): Promise<BaseMessage | null>;
  sendLargeMessage(connectionId: string, message: BaseMessage): Promise<boolean>;
  cleanupStaleChunks(): Promise<number>;
  private setupConnectionHandlers;
  forwardMessage(message: BaseMessage, type: 'worker' | 'client', id: string): void;
  private handleCompleteMessage;
  private sendMessage;
  onWorkerMessage(callback: (workerId: string, message: BaseMessage) => void): void;
  onClientMessage(callback: (clientId: string, message: BaseMessage) => void): void;
  onWorkerConnect(callback: (workerId: string, capabilities?: WorkerCapabilities) => void): void;
  onWorkerDisconnect(callback: (workerId: string) => void): void;
  onClientConnect(callback: (clientId: string) => void): void;
  onClientDisconnect(callback: (clientId: string) => void): void;
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
  startStatsBroadcast(intervalMs?: number): void;
  stopStatsBroadcast(): void;
  private broadcastStats;
}
//# sourceMappingURL=connection-manager.d.ts.map
