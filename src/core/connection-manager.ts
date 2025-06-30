// Connection Manager Implementation - direct port from Python core/connection_manager.py
// Manages WebSocket connections for workers and clients with chunked message support

import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { TimestampUtil } from './utils/timestamp.js';
import {
  ConnectionManagerInterface,
  WebSocketConnection,
  ConnectionManagerConfig,
} from './interfaces/connection-manager.js';
import {
  BaseMessage,
  MessageType,
  ChunkedMessage,
  ChunkedMessageChunk,
  StatsBroadcastMessage,
} from './types/messages.js';
import { WorkerCapabilities } from './types/worker.js';
import { logger } from './utils/logger.js';
import { RedisServiceInterface } from './interfaces/redis-service.js';

export class ConnectionManager implements ConnectionManagerInterface {
  private workerConnections = new Map<string, WebSocketConnection>();
  private clientConnections = new Map<string, WebSocketConnection>();
  private workerCapabilities = new Map<string, WorkerCapabilities>();
  private chunkedMessages = new Map<string, ChunkedMessage>();
  private isRunningFlag = false;
  private config: ConnectionManagerConfig;
  private statsIntervalId?: NodeJS.Timeout;
  private redisService?: RedisServiceInterface;
  private workerJobCounts = new Map<string, number>();

  // Event callbacks
  private workerMessageCallbacks: ((workerId: string, message: BaseMessage) => void)[] = [];
  private clientMessageCallbacks: ((clientId: string, message: BaseMessage) => void)[] = [];
  private workerConnectCallbacks: ((
    workerId: string,
    capabilities?: WorkerCapabilities
  ) => void)[] = [];
  private workerDisconnectCallbacks: ((workerId: string) => void)[] = [];
  private clientConnectCallbacks: ((clientId: string) => void)[] = [];
  private clientDisconnectCallbacks: ((clientId: string) => void)[] = [];

  constructor(config: Partial<ConnectionManagerConfig> = {}, redisService?: RedisServiceInterface) {
    this.redisService = redisService;
    this.config = {
      maxMessageSizeBytes: config.maxMessageSizeBytes || 100 * 1024 * 1024, // 100MB
      heartbeatIntervalMs: config.heartbeatIntervalMs || 30000,
      connectionTimeoutMs: config.connectionTimeoutMs || 60000,
      chunkSizeBytes: config.chunkSizeBytes || 1024 * 1024, // 1MB chunks
      maxChunkedMessageAge: config.maxChunkedMessageAge || 300000, // 5 minutes
      maxConnectionsPerWorker: config.maxConnectionsPerWorker || 1,
      maxConnectionsPerClient: config.maxConnectionsPerClient || 5,
      enableCompression: config.enableCompression !== false,
      logLevel: config.logLevel || 'info',
    };
  }

  async start(): Promise<void> {
    this.isRunningFlag = true;

    // Start cleanup interval for stale chunks
    setInterval(() => {
      this.cleanupStaleChunks().catch(error => {
        logger.error('Error cleaning up stale chunks:', error);
      });
    }, 60000); // Cleanup every minute

    // Start connection health monitoring
    setInterval(() => {
      this.cleanupStaleConnections().catch(error => {
        logger.error('Error cleaning up stale connections:', error);
      });
    }, this.config.heartbeatIntervalMs);

    logger.info('Connection manager started');
  }

  async stop(): Promise<void> {
    this.isRunningFlag = false;

    // Stop stats broadcasting
    this.stopStatsBroadcast();

    // Close all connections
    for (const connection of this.workerConnections.values()) {
      await connection.close(1000, 'Server shutting down');
    }

    for (const connection of this.clientConnections.values()) {
      await connection.close(1000, 'Server shutting down');
    }

    this.workerConnections.clear();
    this.clientConnections.clear();
    this.chunkedMessages.clear();

    logger.info('Connection manager stopped');
  }

  isRunning(): boolean {
    return this.isRunningFlag;
  }

  // Worker connection management
  async addWorkerConnection(workerId: string, connection: WebSocketConnection): Promise<void> {
    // Remove existing connection if any
    if (this.workerConnections.has(workerId)) {
      const existing = this.workerConnections.get(workerId);
      if (existing) {
        await existing.close(1000, 'New connection established');
      }
    }

    this.workerConnections.set(workerId, connection);
    this.setupConnectionHandlers(connection, 'worker', workerId);

    // Trigger connect callback
    this.workerConnectCallbacks.forEach(cb => cb(workerId));

    logger.info(`Worker ${workerId} connected`);
  }

  async removeWorkerConnection(workerId: string): Promise<void> {
    const connection = this.workerConnections.get(workerId);
    if (connection) {
      await connection.close(1000, 'Connection removed');
      this.workerConnections.delete(workerId);

      // Also remove stored capabilities
      this.workerCapabilities.delete(workerId);

      // Trigger disconnect callback
      this.workerDisconnectCallbacks.forEach(cb => cb(workerId));

      logger.info(`Worker ${workerId} disconnected`);
    }
  }

  getWorkerConnection(workerId: string): WebSocketConnection | undefined {
    return this.workerConnections.get(workerId);
  }

  getAllWorkerConnections(): Map<string, WebSocketConnection> {
    return new Map(this.workerConnections);
  }

  isWorkerConnected(workerId: string): boolean {
    const connection = this.workerConnections.get(workerId);
    return connection?.connected === true;
  }

  getConnectedWorkerIds(): string[] {
    return Array.from(this.workerConnections.keys()).filter(id => this.isWorkerConnected(id));
  }

  async registerWorkerCapabilities(
    workerId: string,
    capabilities: WorkerCapabilities
  ): Promise<void> {
    this.workerCapabilities.set(workerId, capabilities);
    logger.info(`Stored capabilities for worker ${workerId}: ${capabilities.services.join(', ')}`);
  }

  async getConnectedWorkers(): Promise<
    Array<{
      workerId: string;
      capabilities?: WorkerCapabilities;
      connectedAt: string;
      lastActivity: string;
    }>
  > {
    const workers: Array<{
      workerId: string;
      capabilities?: WorkerCapabilities;
      connectedAt: string;
      lastActivity: string;
    }> = [];

    for (const [workerId, connection] of this.workerConnections) {
      if (connection.connected) {
        workers.push({
          workerId,
          capabilities: this.workerCapabilities.get(workerId),
          connectedAt: connection.connectedAt,
          lastActivity: connection.lastActivity,
        });
      }
    }

    return workers;
  }

  // Client connection management
  async addClientConnection(clientId: string, connection: WebSocketConnection): Promise<void> {
    this.clientConnections.set(clientId, connection);
    this.setupConnectionHandlers(connection, 'client', clientId);

    // Trigger connect callback
    this.clientConnectCallbacks.forEach(cb => cb(clientId));

    logger.info(`Client ${clientId} connected`);
  }

  async removeClientConnection(clientId: string): Promise<void> {
    const connection = this.clientConnections.get(clientId);
    if (connection) {
      await connection.close(1000, 'Connection removed');
      this.clientConnections.delete(clientId);

      // Trigger disconnect callback
      this.clientDisconnectCallbacks.forEach(cb => cb(clientId));

      logger.info(`Client ${clientId} disconnected`);
    }
  }

  getClientConnection(clientId: string): WebSocketConnection | undefined {
    return this.clientConnections.get(clientId);
  }

  getAllClientConnections(): Map<string, WebSocketConnection> {
    return new Map(this.clientConnections);
  }

  isClientConnected(clientId: string): boolean {
    const connection = this.clientConnections.get(clientId);
    return connection?.connected === true;
  }

  getConnectedClientIds(): string[] {
    return Array.from(this.clientConnections.keys()).filter(id => this.isClientConnected(id));
  }

  // Message sending
  async sendToWorker(workerId: string, message: BaseMessage): Promise<boolean> {
    const connection = this.workerConnections.get(workerId);
    if (!connection || !connection.connected) {
      logger.warn(`Cannot send message to disconnected worker ${workerId}`);
      return false;
    }

    try {
      return await this.sendMessage(connection, message);
    } catch (error) {
      logger.error(`Failed to send message to worker ${workerId}:`, error);
      return false;
    }
  }

  async sendToClient(clientId: string, message: BaseMessage): Promise<boolean> {
    const connection = this.clientConnections.get(clientId);
    if (!connection || !connection.connected) {
      logger.warn(`Cannot send message to disconnected client ${clientId}`);
      return false;
    }

    try {
      return await this.sendMessage(connection, message);
    } catch (error) {
      logger.error(`Failed to send message to client ${clientId}:`, error);
      return false;
    }
  }

  async sendToAllWorkers(
    message: BaseMessage,
    filter?: (workerId: string) => boolean
  ): Promise<number> {
    let sentCount = 0;

    for (const [workerId, connection] of this.workerConnections) {
      if (filter && !filter(workerId)) continue;
      if (!connection.connected) continue;

      try {
        const sent = await this.sendMessage(connection, message);
        if (sent) sentCount++;
      } catch (error) {
        logger.error(`Failed to send message to worker ${workerId}:`, error);
      }
    }

    return sentCount;
  }

  async sendToAllClients(
    message: BaseMessage,
    filter?: (clientId: string) => boolean
  ): Promise<number> {
    let sentCount = 0;

    for (const [clientId, connection] of this.clientConnections) {
      if (filter && !filter(clientId)) continue;
      if (!connection.connected) continue;

      try {
        const sent = await this.sendMessage(connection, message);
        if (sent) sentCount++;
      } catch (error) {
        logger.error(`Failed to send message to client ${clientId}:`, error);
      }
    }

    return sentCount;
  }

  async broadcastToMonitors(message: BaseMessage): Promise<number> {
    // Broadcast only to monitor-type clients, not regular job-submitting clients
    return await this.sendToAllClients(message, clientId => {
      const connection = this.clientConnections.get(clientId);
      return connection?.type === 'monitor';
    });
  }

  async sendToSpecificClient(clientId: string, message: BaseMessage): Promise<boolean> {
    // Send message to a specific client (for job-specific responses)
    return await this.sendToClient(clientId, message);
  }

  // Job-specific messaging
  async notifyIdleWorkersOfJob(jobId: string, jobType: string, requirements?): Promise<number> {
    const jobAvailableMessage: BaseMessage = {
      id: uuidv4(),
      type: MessageType.JOB_AVAILABLE,
      timestamp: TimestampUtil.now(),
      job_id: jobId,
      job_type: jobType,
      requirements,
    };

    // Send to workers that can handle this job type
    return await this.sendToAllWorkers(jobAvailableMessage, workerId => {
      // Simple filter - could be enhanced with capability matching
      return this.isWorkerConnected(workerId);
    });
  }

  async sendJobAssignment(workerId: string, jobId: string, jobData: unknown): Promise<boolean> {
    const assignmentMessage: BaseMessage = {
      id: uuidv4(),
      type: MessageType.JOB_ASSIGNED,
      timestamp: TimestampUtil.now(),
      job_id: jobId,
      worker_id: workerId,
      job_data: jobData,
    };

    return await this.sendToWorker(workerId, assignmentMessage);
  }

  async sendJobCancellation(workerId: string, jobId: string, reason: string): Promise<boolean> {
    const cancellationMessage: BaseMessage = {
      id: uuidv4(),
      type: MessageType.CANCEL_JOB,
      timestamp: TimestampUtil.now(),
      job_id: jobId,
      reason,
    };

    return await this.sendToWorker(workerId, cancellationMessage);
  }

  async forwardJobCompletion(jobId: string, result: unknown): Promise<void> {
    const completionMessage: BaseMessage = {
      id: uuidv4(),
      type: MessageType.JOB_COMPLETED,
      timestamp: TimestampUtil.now(),
      job_id: jobId,
      result,
    };

    // Broadcast to all monitors
    await this.broadcastToMonitors(completionMessage);
  }

  // Connection health and monitoring
  async pingWorker(workerId: string): Promise<boolean> {
    const connection = this.workerConnections.get(workerId);
    return connection ? await connection.ping() : false;
  }

  async pingClient(clientId: string): Promise<boolean> {
    const connection = this.clientConnections.get(clientId);
    return connection ? await connection.ping() : false;
  }

  async pingAllConnections(): Promise<{ workers: number; clients: number }> {
    let workers = 0;
    let clients = 0;

    for (const connection of this.workerConnections.values()) {
      if (await connection.ping()) workers++;
    }

    for (const connection of this.clientConnections.values()) {
      if (await connection.ping()) clients++;
    }

    return { workers, clients };
  }

  async cleanupStaleConnections(): Promise<{ workers: string[]; clients: string[] }> {
    const staleWorkers: string[] = [];
    const staleClients: string[] = [];
    const now = Date.now();
    const timeout = this.config.connectionTimeoutMs;

    // Check worker connections
    for (const [workerId, connection] of this.workerConnections) {
      const lastActivity = new Date(connection.lastActivity).getTime();
      if (now - lastActivity > timeout || !connection.isAlive()) {
        staleWorkers.push(workerId);
        await this.removeWorkerConnection(workerId);
      }
    }

    // Check client connections
    for (const [clientId, connection] of this.clientConnections) {
      const lastActivity = new Date(connection.lastActivity).getTime();
      if (now - lastActivity > timeout || !connection.isAlive()) {
        staleClients.push(clientId);
        await this.removeClientConnection(clientId);
      }
    }

    if (staleWorkers.length > 0 || staleClients.length > 0) {
      logger.info(
        `Cleaned up stale connections - workers: ${staleWorkers.length}, clients: ${staleClients.length}`
      );
    }

    return { workers: staleWorkers, clients: staleClients };
  }

  // Chunked message handling
  async handleChunkedMessage(
    _connectionId: string,
    chunk: ChunkedMessageChunk
  ): Promise<BaseMessage | null> {
    const { chunkId, chunkIndex, totalChunks, data, dataHash } = chunk;

    if (!this.chunkedMessages.has(chunkId)) {
      this.chunkedMessages.set(chunkId, {
        chunk_id: chunkId,
        total_chunks: totalChunks,
        chunks: new Map(),
        data_hash: dataHash,
        created_at: Date.now(),
      });
    }

    const chunkedMessage = this.chunkedMessages.get(chunkId);
    if (!chunkedMessage) {
      logger.error(`Chunked message ${chunkId} not found`);
      return null;
    }
    chunkedMessage.chunks.set(chunkIndex, data);

    // Check if we have all chunks
    if (chunkedMessage.chunks.size === totalChunks) {
      // Reconstruct the message
      const reconstructedData = Array.from({ length: totalChunks }, (_, i) =>
        chunkedMessage.chunks.get(i)
      ).join('');

      // Verify hash
      const reconstructedHash = crypto.createHash('sha256').update(reconstructedData).digest('hex');
      if (reconstructedHash !== dataHash) {
        logger.error(`Hash mismatch for chunked message ${chunkId}`);
        this.chunkedMessages.delete(chunkId);
        return null;
      }

      // Parse the reconstructed message
      try {
        const message = JSON.parse(reconstructedData) as BaseMessage;
        this.chunkedMessages.delete(chunkId);
        return message;
      } catch (error) {
        logger.error(`Failed to parse reconstructed message ${chunkId}:`, error);
        this.chunkedMessages.delete(chunkId);
        return null;
      }
    }

    return null; // Not all chunks received yet
  }

  async sendLargeMessage(connectionId: string, message: BaseMessage): Promise<boolean> {
    const serialized = JSON.stringify(message);
    const sizeBytes = Buffer.byteLength(serialized, 'utf8');

    if (sizeBytes <= this.config.chunkSizeBytes) {
      // Message is small enough, send directly
      const connection =
        this.workerConnections.get(connectionId) || this.clientConnections.get(connectionId);
      if (connection) {
        return await this.sendMessage(connection, message);
      }
      return false;
    }

    // Split into chunks
    const chunkId = uuidv4();
    const dataHash = crypto.createHash('sha256').update(serialized).digest('hex');
    const chunkSize = this.config.chunkSizeBytes;
    const totalChunks = Math.ceil(serialized.length / chunkSize);

    const connection =
      this.workerConnections.get(connectionId) || this.clientConnections.get(connectionId);
    if (!connection) return false;

    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, serialized.length);
      const chunkData = serialized.slice(start, end);

      const chunkMessage = {
        id: uuidv4(),
        type: MessageType.SYSTEM_STATUS,
        timestamp: TimestampUtil.now(),
        chunk_info: {
          chunk_id: chunkId,
          chunk_index: i,
          total_chunks: totalChunks,
          data_hash: dataHash,
        },
        data: chunkData,
      };

      try {
        await connection.send(chunkMessage);
      } catch (error) {
        logger.error(`Failed to send chunk ${i}/${totalChunks} for message ${chunkId}:`, error);
        return false;
      }
    }

    return true;
  }

  async cleanupStaleChunks(): Promise<number> {
    const now = Date.now();
    const maxAge = this.config.maxChunkedMessageAge;
    let cleaned = 0;

    for (const [chunkId, chunk] of this.chunkedMessages) {
      if (now - chunk.created_at > maxAge) {
        this.chunkedMessages.delete(chunkId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`Cleaned up ${cleaned} stale chunks`);
    }

    return cleaned;
  }

  // Private helper methods
  private setupConnectionHandlers(
    connection: WebSocketConnection,
    type: 'worker' | 'client',
    id: string
  ): void {
    const ws = connection.socket as WebSocket;

    ws.on('message', async (data: Buffer) => {
      try {
        connection.lastActivity = new Date().toISOString();
        connection.messagesReceived++;
        connection.bytesReceived += data.length;

        const message = JSON.parse(data.toString());

        // Handle chunked messages
        if (message.chunk_info) {
          const reconstructed = await this.handleChunkedMessage(id, {
            chunkId: message.chunk_info.chunk_id,
            chunkIndex: message.chunk_info.chunk_index,
            totalChunks: message.chunk_info.total_chunks,
            data: message.data,
            dataHash: message.chunk_info.data_hash,
          });

          if (reconstructed) {
            this.handleCompleteMessage(reconstructed, type, id);
          }
        } else {
          this.handleCompleteMessage(message, type, id);
        }
      } catch (error) {
        logger.error(`Error processing message from ${type} ${id}:`, error);
      }
    });

    ws.on('close', () => {
      connection.connected = false;
      if (type === 'worker') {
        this.removeWorkerConnection(id);
      } else {
        this.removeClientConnection(id);
      }
    });

    ws.on('error', error => {
      logger.error(`WebSocket error for ${type} ${id}:`, error);
    });
  }

  private handleCompleteMessage(message: BaseMessage, type: 'worker' | 'client', id: string): void {
    if (type === 'worker') {
      this.workerMessageCallbacks.forEach(cb => cb(id, message));
    } else {
      this.clientMessageCallbacks.forEach(cb => cb(id, message));
    }
  }

  private async sendMessage(
    connection: WebSocketConnection,
    message: BaseMessage
  ): Promise<boolean> {
    const serialized = JSON.stringify(message);
    const sizeBytes = Buffer.byteLength(serialized, 'utf8');

    if (sizeBytes > this.config.maxMessageSizeBytes) {
      logger.error(
        `Message too large: ${sizeBytes} bytes (max: ${this.config.maxMessageSizeBytes})`
      );
      return false;
    }

    try {
      if (sizeBytes > this.config.chunkSizeBytes) {
        // Send as chunked message
        const connectionId = connection.workerId || connection.clientId || connection.id;
        return await this.sendLargeMessage(connectionId, message);
      } else {
        // Send directly
        const success = await connection.send(message);
        if (success) {
          connection.messagesSent++;
          connection.bytesSent += sizeBytes;
          connection.lastActivity = new Date().toISOString();
        }
        return success;
      }
    } catch (error) {
      logger.error('Failed to send message:', error);
      return false;
    }
  }

  // Event handlers
  onWorkerMessage(callback: (workerId: string, message: BaseMessage) => void): void {
    this.workerMessageCallbacks.push(callback);
  }

  onClientMessage(callback: (clientId: string, message: BaseMessage) => void): void {
    this.clientMessageCallbacks.push(callback);
  }

  onWorkerConnect(callback: (workerId: string, capabilities?: WorkerCapabilities) => void): void {
    this.workerConnectCallbacks.push(callback);
  }

  onWorkerDisconnect(callback: (workerId: string) => void): void {
    this.workerDisconnectCallbacks.push(callback);
  }

  onClientConnect(callback: (clientId: string) => void): void {
    this.clientConnectCallbacks.push(callback);
  }

  onClientDisconnect(callback: (clientId: string) => void): void {
    this.clientDisconnectCallbacks.push(callback);
  }

  // Statistics
  async getConnectionStatistics(): Promise<{
    total_workers: number;
    active_workers: number;
    total_clients: number;
    active_clients: number;
    messages_sent: number;
    messages_received: number;
    bytes_sent: number;
    bytes_received: number;
    connection_errors: number;
  }> {
    let messagesSent = 0;
    let messagesReceived = 0;
    let bytesSent = 0;
    let bytesReceived = 0;

    for (const connection of this.workerConnections.values()) {
      messagesSent += connection.messagesSent;
      messagesReceived += connection.messagesReceived;
      bytesSent += connection.bytesSent;
      bytesReceived += connection.bytesReceived;
    }

    for (const connection of this.clientConnections.values()) {
      messagesSent += connection.messagesSent;
      messagesReceived += connection.messagesReceived;
      bytesSent += connection.bytesSent;
      bytesReceived += connection.bytesReceived;
    }

    return {
      total_workers: this.workerConnections.size,
      active_workers: this.getConnectedWorkerIds().length,
      total_clients: this.clientConnections.size,
      active_clients: this.getConnectedClientIds().length,
      messages_sent: messagesSent,
      messages_received: messagesReceived,
      bytes_sent: bytesSent,
      bytes_received: bytesReceived,
      connection_errors: 0, // TODO: Track connection errors
    };
  }

  // Configuration
  setMaxMessageSize(sizeBytes: number): void {
    this.config.maxMessageSizeBytes = sizeBytes;
  }

  setHeartbeatInterval(intervalMs: number): void {
    this.config.heartbeatIntervalMs = intervalMs;
  }

  setConnectionTimeout(timeoutMs: number): void {
    this.config.connectionTimeoutMs = timeoutMs;
  }

  getConfiguration(): ConnectionManagerConfig {
    return { ...this.config };
  }

  // Stats broadcasting
  startStatsBroadcast(intervalMs: number = 5000): void {
    if (this.statsIntervalId) {
      clearInterval(this.statsIntervalId);
    }

    logger.info(`Starting stats broadcast with ${intervalMs}ms interval`);

    this.statsIntervalId = setInterval(async () => {
      try {
        await this.broadcastStats();
      } catch (error) {
        logger.error('Error broadcasting stats:', error);
      }
    }, intervalMs);
  }

  stopStatsBroadcast(): void {
    if (this.statsIntervalId) {
      clearInterval(this.statsIntervalId);
      this.statsIntervalId = undefined;
      logger.info('Stopped stats broadcast');
    }
  }

  private async broadcastStats(): Promise<void> {
    logger.debug('broadcastStats() called');

    // Get connected workers, clients, and monitors
    const connectedWorkers = await this.getConnectedWorkers();
    const workerIds = this.getConnectedWorkerIds();
    const clientIds = this.getConnectedClientIds();
    const monitorIds = clientIds.filter(id => {
      const conn = this.clientConnections.get(id);
      return conn?.type === 'monitor';
    });

    logger.debug(
      `Stats broadcast: ${connectedWorkers.length} workers, ${clientIds.length} clients, ${monitorIds.length} monitors`
    );

    // Build workers object matching Python format
    const workersData: Record<
      string,
      {
        status: string;
        connection_status: string;
        is_accepting_jobs: boolean;
        supported_job_types: string[];
        capabilities?: Record<string, unknown>;
        connected_at?: string;
        jobs_processed?: number;
        last_heartbeat?: string;
        current_job_id?: string;
      }
    > = {};

    for (const worker of connectedWorkers) {
      const jobsProcessed = this.workerJobCounts.get(worker.workerId) || 0;

      workersData[worker.workerId] = {
        status: 'idle', // TODO: track actual status
        connection_status: 'idle',
        is_accepting_jobs: true,
        supported_job_types: worker.capabilities?.services || [],
        capabilities: worker.capabilities,
        connected_at: worker.connectedAt,
        jobs_processed: jobsProcessed,
        last_heartbeat: worker.lastActivity,
        current_job_id: undefined, // TODO: track current jobs
      };
    }

    // Get job statistics from Redis if available
    let jobStats = {
      pending: 0,
      active: 0,
      completed: 0,
      failed: 0,
      total: 0,
    };

    let activeJobs: Array<{
      id: string;
      job_type: string;
      status: string;
      priority: number;
      worker_id?: string;
      created_at: string;
      updated_at?: string;
      progress?: number;
    }> = [];
    let pendingJobs: Array<{
      id: string;
      job_type: string;
      status: string;
      priority: number;
      created_at: string;
      updated_at: string;
    }> = [];
    let completedJobs: Array<{
      id: string;
      job_type: string;
      status: string;
      priority: number;
      worker_id?: string;
      created_at: string;
      updated_at: string;
      progress?: number;
    }> = [];
    let failedJobs: Array<{
      id: string;
      job_type: string;
      status: string;
      priority: number;
      worker_id?: string;
      created_at: string;
      updated_at: string;
      progress?: number;
    }> = [];

    if (this.redisService && this.redisService.isConnected()) {
      try {
        const stats = await this.redisService.getJobStatistics();
        jobStats = {
          pending: stats.pending || 0,
          active: stats.active || 0,
          completed: stats.completed || 0,
          failed: stats.failed || 0,
          total:
            (stats.pending || 0) +
            (stats.active || 0) +
            (stats.completed || 0) +
            (stats.failed || 0),
        };

        // Get active jobs
        const jobs = await this.redisService.getActiveJobs();
        activeJobs = jobs.map(job => ({
          id: job.id,
          job_type: job.service_required,
          status: job.status,
          priority: job.priority,
          worker_id: job.worker_id,
          created_at: job.created_at,
          updated_at: job.started_at || job.assigned_at || job.created_at,
          progress: 0, // TODO: Track job progress separately
        }));

        // Get pending jobs for queue display
        const pendingJobsList = await this.redisService.getPendingJobs(50);
        pendingJobs = pendingJobsList.map(job => ({
          id: job.id,
          job_type: job.service_required,
          status: 'pending',
          priority: job.priority,
          created_at: job.created_at,
          updated_at: job.created_at,
        }));

        // Get completed jobs for display (recent ones)
        const completedJobsList = await this.redisService.getCompletedJobs(20);
        completedJobs = completedJobsList.map(job => ({
          id: job.id,
          job_type: job.service_required,
          status: 'completed',
          priority: job.priority,
          worker_id: job.worker_id,
          created_at: job.created_at,
          updated_at: job.completed_at || job.created_at,
          progress: 100,
        }));

        // Get failed jobs for display (recent ones)
        const failedJobsList = await this.redisService.getFailedJobs(20);
        failedJobs = failedJobsList.map(job => ({
          id: job.id,
          job_type: job.service_required,
          status: 'failed',
          priority: job.priority,
          worker_id: job.worker_id,
          created_at: job.created_at,
          updated_at: job.failed_at || job.created_at,
          progress: 0,
        }));
      } catch (error) {
        logger.error('Error fetching job statistics from Redis:', error);
      }
    }

    // Count workers by status
    const workerStatusCounts = {
      idle: 0,
      working: 0,
    };

    const activeWorkers: Array<{
      id: string;
      status: string;
      connected_at: string;
      jobs_processed: number;
      last_heartbeat: string;
      current_job_id?: string;
    }> = [];

    for (const worker of connectedWorkers) {
      const status = workersData[worker.workerId].current_job_id ? 'working' : 'idle';
      if (status === 'idle') {
        workerStatusCounts.idle++;
      } else {
        workerStatusCounts.working++;
      }

      activeWorkers.push({
        id: worker.workerId,
        status,
        connected_at: worker.connectedAt,
        jobs_processed: this.workerJobCounts.get(worker.workerId) || 0,
        last_heartbeat: worker.lastActivity,
        current_job_id: workersData[worker.workerId].current_job_id,
      });
    }

    const statsMessage: StatsBroadcastMessage = {
      id: uuidv4(),
      type: MessageType.STATS_BROADCAST,
      message_id: `stats-${Date.now()}`,
      timestamp: Date.now(),
      connections: {
        clients: clientIds.filter(id => {
          const conn = this.clientConnections.get(id);
          return conn?.type === 'client';
        }),
        workers: workerIds,
        monitors: monitorIds,
      },
      workers: workersData,
      subscriptions: {
        stats: monitorIds,
        job_notifications: workerIds,
        jobs: {}, // TODO: track job subscriptions
      },
      system: {
        queues: {
          priority: 0, // TODO: implement priority queue counts
          standard: jobStats.pending,
          total: jobStats.pending,
        },
        jobs: {
          total: jobStats.total,
          status: {
            pending: jobStats.pending,
            active: jobStats.active,
            completed: jobStats.completed,
            failed: jobStats.failed,
          },
          active_jobs: activeJobs,
          pending_jobs: pendingJobs,
          completed_jobs: completedJobs,
          failed_jobs: failedJobs,
        },
        workers: {
          total: connectedWorkers.length,
          status: workerStatusCounts,
          active_workers: activeWorkers,
        },
      },
    };

    // Broadcast to all monitor clients
    const sent = await this.broadcastToMonitors(statsMessage);
    logger.info(
      `Broadcasted stats_broadcast message to ${sent} monitors (${monitorIds.length} total monitors)`
    );
  }
}
