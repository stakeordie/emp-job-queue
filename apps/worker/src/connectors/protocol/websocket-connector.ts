/**
 * WebSocketConnector - Abstract base class for all WebSocket-based connectors
 * 
 * Provides unified WebSocket connection management, authentication, reconnection logic,
 * message routing, job correlation, and real-time progress tracking.
 * 
 * Services like ComfyUI, A1111 WebSocket, and custom real-time APIs extend this class
 * and implement service-specific message handling and job processing.
 */

import { WebSocket } from 'ws';
import { BaseConnector, ConnectorConfig } from '../base-connector.js';
import { JobData, JobResult, ProgressCallback, ServiceInfo, logger, ProcessingInstrumentation, sendTrace, SpanContext } from '@emp/core';

// WebSocket-specific configuration - contains base config fields
export interface WebSocketConnectorConfig {
  // Base connector fields
  connector_id: string;
  service_type: string;
  base_url: string;
  timeout_seconds?: number;
  retry_attempts?: number;
  retry_delay_seconds?: number;
  health_check_interval_seconds?: number;
  max_concurrent_jobs?: number;
  
  // WebSocket connection configuration
  websocket_url?: string; // If different from base_url
  protocols?: string[];
  
  // WebSocket authentication configuration
  auth?: {
    type: 'none' | 'basic' | 'bearer' | 'query_param' | 'header';
    username?: string;
    password?: string;
    bearer_token?: string;
    token?: string;
    api_key?: string;
    query_param_name?: string;
    query_param_value?: string;
    header_name?: string;
    header_value?: string;
  };

  // Connection lifecycle
  connect_timeout_ms?: number;
  heartbeat_interval_ms?: number;
  heartbeat_message?: string | object;
  reconnect_delay_ms?: number;
  max_reconnect_attempts?: number;
  
  // Message handling
  message_timeout_ms?: number;
  max_message_size_bytes?: number;
  message_queue_size?: number;
  
  // Job correlation
  job_correlation_field?: string; // Field name for correlating messages to jobs
  progress_message_type?: string; // Message type that indicates progress updates
}

// WebSocket connection states
export enum WebSocketState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  FAILED = 'failed'
}

// Standard message categories for consistent message handling
export enum MessageType {
  JOB_SUBMIT = 'job_submit',
  JOB_PROGRESS = 'job_progress',
  JOB_COMPLETE = 'job_complete',
  JOB_ERROR = 'job_error',
  HEARTBEAT = 'heartbeat',
  CONNECTION = 'connection',
  UNKNOWN = 'unknown'
}

export interface WebSocketMessage {
  type: MessageType;
  jobId?: string;
  data: any;
  timestamp: number;
}

// Active job tracking for message correlation
interface ActiveJob {
  jobData: JobData;
  progressCallback?: ProgressCallback;
  resolve: (result: JobResult) => void;
  reject: (error: Error) => void;
  timeout?: NodeJS.Timeout;
  startTime: number;
}

/**
 * Abstract WebSocketConnector class - handles all WebSocket communication patterns
 * Services implement the abstract methods for their specific message formats and job logic
 */
export abstract class WebSocketConnector extends BaseConnector {
  protected websocket: WebSocket | null = null;
  protected connectionState: WebSocketState = WebSocketState.DISCONNECTED;
  protected reconnectAttempts: number = 0;
  protected readonly wsConfig: WebSocketConnectorConfig;
  
  // Job and message management
  protected activeJobs = new Map<string, ActiveJob>();
  protected messageQueue: WebSocketMessage[] = [];
  private heartbeatInterval: NodeJS.Timeout | null = null;
  
  constructor(connectorId: string, config: WebSocketConnectorConfig) {
    // Convert WebSocketConnectorConfig to base ConnectorConfig for super constructor
    const baseConfig: ConnectorConfig = {
      connector_id: config.connector_id,
      service_type: config.service_type,
      base_url: config.base_url,
      timeout_seconds: config.timeout_seconds || 60,
      retry_attempts: config.retry_attempts || 3,
      retry_delay_seconds: config.retry_delay_seconds || 1,
      health_check_interval_seconds: config.health_check_interval_seconds || 30,
      max_concurrent_jobs: config.max_concurrent_jobs || 1,
      auth: config.auth ? {
        type: ['query_param', 'header'].includes(config.auth.type) ? 'api_key' : (config.auth.type as 'none' | 'basic' | 'bearer' | 'api_key'),
        username: config.auth.username,
        password: config.auth.password,
        token: config.auth.bearer_token || config.auth.token,
        api_key: config.auth.query_param_value || config.auth.header_value || config.auth.api_key
      } : undefined
    };
    super(connectorId, baseConfig);
    this.wsConfig = {
      // Default WebSocket configuration
      connect_timeout_ms: 10000,
      heartbeat_interval_ms: 30000,
      heartbeat_message: { type: 'ping' },
      reconnect_delay_ms: 5000,
      max_reconnect_attempts: 5,
      message_timeout_ms: 60000,
      max_message_size_bytes: 10 * 1024 * 1024, // 10MB
      message_queue_size: 1000,
      job_correlation_field: 'jobId',
      progress_message_type: 'progress',
      ...config
    };
  }

  // ========================================
  // CONNECTION MANAGEMENT
  // ========================================

  /**
   * Establish WebSocket connection with authentication and error handling
   */
  protected async connect(): Promise<void> {
    if (this.connectionState === WebSocketState.CONNECTING || 
        this.connectionState === WebSocketState.CONNECTED) {
      return;
    }

    this.connectionState = WebSocketState.CONNECTING;
    
    try {
      const wsUrl = this.buildWebSocketURL();
      const wsOptions = this.buildConnectionOptions();
      
      logger.debug(`Connecting to WebSocket`, {
        connector: this.connector_id,
        url: wsUrl,
        attempt: this.reconnectAttempts + 1
      });

      this.websocket = new WebSocket(wsUrl, wsOptions);
      
      // Setup connection timeout
      const connectTimeout = setTimeout(() => {
        if (this.connectionState === WebSocketState.CONNECTING) {
          this.websocket?.terminate();
          this.handleConnectionError(new Error('Connection timeout'));
        }
      }, this.wsConfig.connect_timeout_ms);

      // Setup event handlers
      this.websocket.on('open', () => {
        clearTimeout(connectTimeout);
        this.handleConnectionOpen();
      });

      this.websocket.on('message', (data) => {
        this.handleIncomingMessage(data);
      });

      this.websocket.on('error', (error) => {
        clearTimeout(connectTimeout);
        this.handleConnectionError(error);
      });

      this.websocket.on('close', (code, reason) => {
        clearTimeout(connectTimeout);
        this.handleConnectionClose(code, reason);
      });

    } catch (error) {
      this.handleConnectionError(error as Error);
    }
  }

  /**
   * Build WebSocket URL with authentication if configured
   */
  private buildWebSocketURL(): string {
    let wsUrl = this.wsConfig.websocket_url || this.config.base_url;
    
    // Convert HTTP(S) URLs to WS(S)
    wsUrl = wsUrl.replace(/^http/, 'ws');
    
    // Add query parameter authentication
    if (this.wsConfig.auth?.type === 'query_param') {
      const separator = wsUrl.includes('?') ? '&' : '?';
      const paramName = this.wsConfig.auth.query_param_name || 'token';
      const paramValue = encodeURIComponent(this.wsConfig.auth.query_param_value || '');
      wsUrl += `${separator}${paramName}=${paramValue}`;
    }

    // Add basic auth to URL if configured
    if (this.wsConfig.auth?.type === 'basic' && 
        this.wsConfig.auth.username && 
        this.wsConfig.auth.password) {
      const url = new URL(wsUrl);
      url.username = this.wsConfig.auth.username;
      url.password = this.wsConfig.auth.password;
      wsUrl = url.toString();
    }

    return wsUrl;
  }

  /**
   * Build WebSocket connection options including headers
   */
  private buildConnectionOptions(): any {
    const options: any = {
      protocols: this.wsConfig.protocols,
      timeout: this.wsConfig.connect_timeout_ms
    };

    // Add header-based authentication
    if (this.wsConfig.auth?.type === 'bearer') {
      options.headers = {
        'Authorization': `Bearer ${this.wsConfig.auth.bearer_token}`,
        ...options.headers
      };
    } else if (this.wsConfig.auth?.type === 'header') {
      const headerName = this.wsConfig.auth.header_name || 'X-API-Key';
      options.headers = {
        [headerName]: this.wsConfig.auth.header_value,
        ...options.headers
      };
    }

    return options;
  }

  /**
   * Handle successful WebSocket connection
   */
  private handleConnectionOpen(): void {
    this.connectionState = WebSocketState.CONNECTED;
    this.reconnectAttempts = 0;
    
    logger.info(`WebSocket connected successfully`, {
      connector: this.connector_id,
      url: this.wsConfig.websocket_url || this.config.base_url
    });

    // Start heartbeat if configured
    this.startHeartbeat();
    
    // Call service-specific connection handler
    this.onConnectionEstablished();
  }

  /**
   * Handle WebSocket connection errors
   */
  private handleConnectionError(error: Error): void {
    this.connectionState = WebSocketState.FAILED;
    
    logger.error(`WebSocket connection error`, {
      connector: this.connector_id,
      error: error.message,
      attempt: this.reconnectAttempts + 1
    });

    // Attempt reconnection if configured
    this.attemptReconnection();
  }

  /**
   * Handle WebSocket connection close
   */
  private handleConnectionClose(code: number, reason: Buffer): void {
    this.connectionState = WebSocketState.DISCONNECTED;
    this.stopHeartbeat();
    
    logger.warn(`WebSocket connection closed`, {
      connector: this.connector_id,
      code,
      reason: reason.toString(),
      wasConnected: this.reconnectAttempts === 0
    });

    // Attempt reconnection unless it was a clean close
    if (code !== 1000) { // 1000 = normal closure
      this.attemptReconnection();
    }
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  private async attemptReconnection(): Promise<void> {
    if (this.reconnectAttempts >= this.wsConfig.max_reconnect_attempts!) {
      logger.error(`Max reconnection attempts reached`, {
        connector: this.connector_id,
        attempts: this.reconnectAttempts
      });
      
      this.connectionState = WebSocketState.FAILED;
      this.failAllActiveJobs('WebSocket connection failed');
      return;
    }

    this.connectionState = WebSocketState.RECONNECTING;
    this.reconnectAttempts++;
    
    const delay = this.calculateReconnectDelay();
    
    logger.info(`Attempting WebSocket reconnection`, {
      connector: this.connector_id,
      attempt: this.reconnectAttempts,
      delayMs: delay
    });

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Calculate reconnection delay with exponential backoff
   */
  private calculateReconnectDelay(): number {
    const baseDelay = this.wsConfig.reconnect_delay_ms!;
    const exponentialDelay = baseDelay * Math.pow(2, this.reconnectAttempts - 1);
    const jitter = Math.random() * 1000; // Add up to 1s jitter
    
    return Math.min(exponentialDelay + jitter, 30000); // Cap at 30s
  }

  /**
   * Disconnect WebSocket cleanly
   */
  protected async disconnect(): Promise<void> {
    this.stopHeartbeat();
    
    if (this.websocket && this.connectionState === WebSocketState.CONNECTED) {
      this.websocket.close(1000, 'Normal closure');
    }
    
    this.websocket = null;
    this.connectionState = WebSocketState.DISCONNECTED;
  }

  // ========================================
  // HEARTBEAT MANAGEMENT
  // ========================================

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    if (this.wsConfig.heartbeat_interval_ms! <= 0) {
      return; // Heartbeat disabled
    }

    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, this.wsConfig.heartbeat_interval_ms);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Send heartbeat message
   */
  private sendHeartbeat(): void {
    if (this.connectionState === WebSocketState.CONNECTED && this.websocket) {
      const heartbeatMessage = this.buildHeartbeatMessage();
      this.sendMessage(heartbeatMessage);
    }
  }

  /**
   * Build heartbeat message (can be overridden by services)
   */
  protected buildHeartbeatMessage(): any {
    return this.wsConfig.heartbeat_message;
  }

  // ========================================
  // MESSAGE HANDLING
  // ========================================

  /**
   * Handle incoming WebSocket messages
   */
  private handleIncomingMessage(data: any): void {
    try {
      // Parse message data
      const rawMessage = data instanceof Buffer ? data.toString() : data;
      const messageData = typeof rawMessage === 'string' ? JSON.parse(rawMessage) : rawMessage;
      
      // 🔇 FILTER OUT NOISE MESSAGES COMPLETELY - don't process them at all
      if (this.isNoiseMessage(messageData)) {
        // Just drop the message entirely - don't log, don't process, don't route
        return;
      }
      
      // 🚨 BIG PAYLOAD LOGGING: WEBSOCKET MESSAGE FROM SERVICE
      const messageType = messageData?.type || 'unknown';
      const isHeartbeat = messageType === 'ping' || messageType === 'pong' || messageType === 'heartbeat';
      
      if (!isHeartbeat) {
        console.log(`\n🚨🚨🚨 WEBSOCKET CONNECTOR: RECEIVED MESSAGE FROM ${this.config.service_type.toUpperCase()}`);
        console.log(`🚨 CONNECTOR: ${this.connector_id}`);
        console.log(`🚨 SERVICE: ${this.config.service_type}`);
        console.log(`🚨 MESSAGE TYPE: ${messageType}`);
        console.log(`🚨 MESSAGE SIZE: ${rawMessage.length} bytes`);
        console.log(`🚨 MESSAGE PAYLOAD:`);
        console.log(rawMessage.length > 1000 ? 
          rawMessage.substring(0, 1000) + '\n... [TRUNCATED - ' + (rawMessage.length - 1000) + ' more bytes]' : 
          rawMessage);
        console.log(`🚨🚨🚨\n`);
      }
      
      // 🔍 LOG IMPORTANT MESSAGES ONLY
      logger.info(`🔍 [${this.connector_id}] RAW WebSocket Message:`, {
        type: messageData.type,
        data: messageData.data,
        full_message: messageData
      });
      
      // Send OTEL trace for received WebSocket message (skip heartbeats/pings)
      
      if (!isHeartbeat) {
        try {
          sendTrace('connector.websocket_receive', {
            'connector.id': this.connector_id,
            'connector.type': 'websocket',
            'service.type': this.config.service_type,
            'websocket.message.direction': 'received',
            'websocket.message.size': rawMessage.length.toString(),
            'websocket.message.type': messageType,
            'websocket.message.data_type': typeof messageData,
            'websocket.message.internal_type': messageType,
            'websocket.message.payload': rawMessage.substring(0, 2000), // Truncate large payloads
            'component.type': 'connector',
            'operation.type': 'websocket_receive'
          }, {
            events: [
              {
                name: 'websocket.message_received',
                attributes: {
                  'message.type': messageType,
                  'message.size': rawMessage.length.toString(),
                  'timestamp': new Date().toISOString()
                }
              }
            ]
          });
        } catch (traceError) {
          logger.debug('Failed to send WebSocket receive trace', { error: traceError.message });
        }
      }
      
      // Classify and route message
      const message: WebSocketMessage = {
        type: this.classifyMessage(messageData),
        jobId: this.extractJobId(messageData),
        data: messageData,
        timestamp: Date.now()
      };

      // 🔍 LOG MESSAGE CLASSIFICATION
      logger.info(`🔍 [${this.connector_id}] Message Classification:`, {
        original_type: messageData.type,
        classified_as: message.type,
        extracted_job_id: message.jobId,
        will_route_to: this.getRouteDescription(message.type)
      });

      // Route message to appropriate handler
      this.routeMessage(message);

    } catch (error) {
      logger.error(`Failed to parse WebSocket message`, {
        connector: this.connector_id,
        error: error.message,
        data: data.toString().substring(0, 200) // First 200 chars for debugging
      });
    }
  }

  /**
   * Helper to describe where a message type will be routed
   */
  private getRouteDescription(messageType: MessageType): string {
    switch (messageType) {
      case MessageType.JOB_PROGRESS: return 'handleJobProgressMessage()';
      case MessageType.JOB_COMPLETE: return 'handleJobCompleteMessage()';
      case MessageType.JOB_ERROR: return 'handleJobErrorMessage()';
      case MessageType.HEARTBEAT: return 'handleHeartbeatMessage()';
      case MessageType.CONNECTION: return 'handleConnectionMessage()';
      case MessageType.JOB_SUBMIT: return 'onMessage() [service-specific]';
      default: return 'onMessage() [service-specific]';
    }
  }

  /**
   * Filter out noise messages that don't need detailed logging
   */
  private isNoiseMessage(messageData: any): boolean {
    const type = messageData.type?.toLowerCase();
    const data = messageData.data;
    
    // Filter out crystools.monitor messages (note: plural "crystools")
    if (type === 'crystools.monitor' || 
        type === 'crystool.monitor' ||
        data?.node_id?.includes?.('crystool') ||
        data?.class_type?.includes?.('crystool')) {
      return true;
    }
    
    // Filter out other common noise messages
    const noiseTypes = [
      'b_preview', // Preview updates
      'preview_image', // Image previews  
      'execution_cached', // Cached execution notifications
      'executed', // Individual node execution completions (too verbose)
    ];
    
    return noiseTypes.includes(type);
  }

  /**
   * Route message to appropriate handler based on type
   */
  private routeMessage(message: WebSocketMessage): void {
    switch (message.type) {
      case MessageType.JOB_PROGRESS:
        this.handleJobProgressMessage(message);
        break;
        
      case MessageType.JOB_COMPLETE:
        this.handleJobCompleteMessage(message);
        break;
        
      case MessageType.JOB_ERROR:
        this.handleJobErrorMessage(message);
        break;
        
      case MessageType.HEARTBEAT:
        this.handleHeartbeatMessage(message);
        break;
        
      case MessageType.CONNECTION:
        this.handleConnectionMessage(message);
        break;
        
      default:
        // Let service-specific handler process unknown messages
        this.onMessage(message);
    }
  }

  /**
   * Handle job progress messages
   */
  private handleJobProgressMessage(message: WebSocketMessage): void {
    if (!message.jobId) return;
    
    const activeJob = this.activeJobs.get(message.jobId);
    if (activeJob && activeJob.progressCallback) {
      const progressValue = this.extractProgress(message.data);
      // Create proper JobProgress object (no status to avoid triggering duplicate status changes)
      const jobProgress = {
        job_id: message.jobId,
        worker_id: this.config.connector_id,
        progress: progressValue,
        message: `Processing job ${message.jobId}`,
        updated_at: new Date().toISOString()
      };
      activeJob.progressCallback(jobProgress);
    }
  }

  /**
   * Handle job completion messages
   */
  private handleJobCompleteMessage(message: WebSocketMessage): void {
    logger.info(`🔍 [${this.connector_id}] JOB COMPLETION MESSAGE RECEIVED:`, {
      jobId: message.jobId,
      hasActiveJob: !!message.jobId && this.activeJobs.has(message.jobId),
      activeJobsCount: this.activeJobs.size,
      messageData: message.data
    });

    if (!message.jobId) {
      logger.warn(`🔍 [${this.connector_id}] Job completion message has no jobId - cannot complete job`);
      return;
    }
    
    const activeJob = this.activeJobs.get(message.jobId);
    if (activeJob) {
      logger.info(`🔍 [${this.connector_id}] Found active job for completion:`, {
        jobId: message.jobId,
        jobStartTime: activeJob.startTime,
        durationMs: Date.now() - activeJob.startTime
      });
      
      try {
        const result = this.parseJobResult(message.data, activeJob.jobData);
        logger.info(`🔍 [${this.connector_id}] Parsed job result successfully, completing job:`, {
          jobId: message.jobId,
          resultSuccess: result.success
        });
        this.completeJob(message.jobId, result);
      } catch (error) {
        logger.error(`🔍 [${this.connector_id}] Failed to parse job result:`, {
          jobId: message.jobId,
          error: error.message
        });
        this.failJob(message.jobId, error as Error);
      }
    } else {
      logger.warn(`🔍 [${this.connector_id}] No active job found for completion:`, {
        jobId: message.jobId,
        activeJobIds: Array.from(this.activeJobs.keys())
      });
    }
  }

  /**
   * Handle job error messages
   */
  private handleJobErrorMessage(message: WebSocketMessage): void {
    if (!message.jobId) return;
    
    const activeJob = this.activeJobs.get(message.jobId);
    if (activeJob) {
      const error = new Error(this.extractErrorMessage(message.data));
      this.failJob(message.jobId, error);
    }
  }

  /**
   * Handle heartbeat response messages
   */
  private handleHeartbeatMessage(message: WebSocketMessage): void {
    // Service can override if needed
    logger.debug(`Heartbeat received`, {
      connector: this.connector_id
    });
  }

  /**
   * Handle connection-related messages
   */
  private handleConnectionMessage(message: WebSocketMessage): void {
    // Service can override for connection-specific messages
    this.onConnectionMessage(message);
  }

  /**
   * Send message through WebSocket
   */
  protected sendMessage(message: any, parentSpan?: SpanContext): void {
    if (this.connectionState !== WebSocketState.CONNECTED || !this.websocket) {
      throw new Error('WebSocket not connected');
    }

    const messageString = typeof message === 'string' ? message : JSON.stringify(message);
    
    // Skip telemetry for heartbeat/ping messages to reduce noise
    const messageType = message?.type || 'unknown';
    const isHeartbeat = messageType === 'ping' || messageType === 'pong' || messageType === 'heartbeat';
    
    // 🚨 BIG PAYLOAD LOGGING: WEBSOCKET MESSAGE TO SERVICE
    if (!isHeartbeat) {
      console.log(`\n🚨🚨🚨 WEBSOCKET CONNECTOR: SENDING MESSAGE TO ${this.config.service_type.toUpperCase()}`);
      console.log(`🚨 CONNECTOR: ${this.connector_id}`);
      console.log(`🚨 SERVICE: ${this.config.service_type}`);
      console.log(`🚨 MESSAGE TYPE: ${messageType}`);
      console.log(`🚨 MESSAGE SIZE: ${messageString.length} bytes`);
      console.log(`🚨 MESSAGE PAYLOAD:`);
      console.log(messageString.length > 1000 ? 
        messageString.substring(0, 1000) + '\n... [TRUNCATED - ' + (messageString.length - 1000) + ' more bytes]' : 
        messageString);
      console.log(`🚨🚨🚨\n`);
    }
    
    // Send OTEL trace for WebSocket message (skip heartbeats/pings)
    if (!isHeartbeat) {
      try {
        sendTrace('connector.websocket_send', {
          'connector.id': this.connector_id,
          'connector.type': 'websocket',
          'service.type': this.config.service_type,
          'websocket.message.direction': 'sent',
          'websocket.message.size': messageString.length.toString(),
          'websocket.message.type': messageType,
          'websocket.message.data_type': typeof message,
          'websocket.message.payload': messageString.substring(0, 2000), // Truncate large payloads
          'component.type': 'connector',
          'operation.type': 'websocket_send'
        }, {
          parent_trace_id: parentSpan?.traceId,
          parent_span_id: parentSpan?.spanId,
          events: [
            {
              name: 'websocket.message_sent',
              attributes: {
                'message.type': messageType,
                'message.size': messageString.length.toString(),
                'timestamp': new Date().toISOString()
              }
            }
          ]
        });
      } catch (traceError) {
        logger.debug('Failed to send WebSocket send trace', { error: traceError.message });
      }
    }
    
    this.websocket.send(messageString);
  }

  // ========================================
  // JOB MANAGEMENT
  // ========================================

  /**
   * Complete a job successfully
   */
  private completeJob(jobId: string, result: JobResult): void {
    const activeJob = this.activeJobs.get(jobId);
    if (activeJob) {
      if (activeJob.timeout) {
        clearTimeout(activeJob.timeout);
      }
      
      this.activeJobs.delete(jobId);
      
      logger.info(`🎉 [${this.connector_id}] JOB COMPLETED SUCCESSFULLY:`, {
        jobId,
        duration: Date.now() - activeJob.startTime,
        resultSuccess: result.success,
        resultData: result.data
      });
      
      activeJob.resolve(result);
      
      logger.debug(`WebSocket job completed`, {
        connector: this.connector_id,
        jobId,
        duration: Date.now() - activeJob.startTime
      });
    } else {
      logger.error(`🔍 [${this.connector_id}] Cannot complete job - no active job found:`, {
        jobId,
        activeJobIds: Array.from(this.activeJobs.keys())
      });
    }
  }

  /**
   * Fail a job with an error
   */
  private failJob(jobId: string, error: Error): void {
    const activeJob = this.activeJobs.get(jobId);
    if (activeJob) {
      if (activeJob.timeout) {
        clearTimeout(activeJob.timeout);
      }
      
      this.activeJobs.delete(jobId);
      activeJob.reject(error);
      
      logger.error(`WebSocket job failed`, {
        connector: this.connector_id,
        jobId,
        error: error.message,
        duration: Date.now() - activeJob.startTime
      });
    }
  }

  /**
   * Fail all active jobs (used during connection failures)
   */
  private failAllActiveJobs(reason: string): void {
    const error = new Error(reason);
    
    for (const [jobId, activeJob] of this.activeJobs.entries()) {
      if (activeJob.timeout) {
        clearTimeout(activeJob.timeout);
      }
      activeJob.reject(error);
    }
    
    this.activeJobs.clear();
  }

  // ========================================
  // ABSTRACT METHODS - Service Implementation Required
  // ========================================

  /**
   * Classify incoming message type for routing
   */
  protected abstract classifyMessage(messageData: any): MessageType;

  /**
   * Extract job ID from message for correlation
   */
  protected abstract extractJobId(messageData: any): string | undefined;

  /**
   * Extract progress information from progress messages
   */
  protected abstract extractProgress(messageData: any): number;

  /**
   * Parse job completion message into JobResult
   */
  protected abstract parseJobResult(messageData: any, originalJobData: JobData): JobResult;

  /**
   * Extract error message from error messages
   */
  protected abstract extractErrorMessage(messageData: any): string;

  /**
   * Build job submission message for the specific service
   */
  protected abstract buildJobMessage(jobData: JobData): any;

  /**
   * Handle service-specific messages not covered by standard types
   */
  protected abstract onMessage(message: WebSocketMessage): void;

  /**
   * Called when WebSocket connection is established
   * Override for service-specific initialization
   */
  protected onConnectionEstablished(): void {
    // Default implementation does nothing
  }

  /**
   * Called when connection-specific messages are received
   * Override for service-specific connection handling
   */
  protected onConnectionMessage(message: WebSocketMessage): void {
    // Default implementation does nothing
  }

  // ========================================
  // BaseConnector Implementation
  // ========================================

  async processJob(jobData: JobData, progressCallback?: ProgressCallback): Promise<JobResult> {
    // Ensure connection is established
    if (this.connectionState !== WebSocketState.CONNECTED) {
      await this.connect();
    }

    return new Promise<JobResult>((resolve, reject) => {
      // Setup job timeout
      const timeout = setTimeout(() => {
        this.failJob(jobData.id, new Error('Job timeout'));
      }, this.wsConfig.message_timeout_ms);

      // Track active job
      const activeJob: ActiveJob = {
        jobData,
        progressCallback,
        resolve,
        reject,
        timeout,
        startTime: Date.now()
      };

      this.activeJobs.set(jobData.id, activeJob);

      try {
        // Build and send job message
        const jobMessage = this.buildJobMessage(jobData);
        this.sendMessage(jobMessage);

        logger.debug(`WebSocket job submitted`, {
          connector: this.connector_id,
          jobId: jobData.id,
          type: jobData.type
        });

      } catch (error) {
        this.failJob(jobData.id, error as Error);
      }
    });
  }

  async checkHealth(): Promise<boolean> {
    return this.connectionState === WebSocketState.CONNECTED;
  }

  protected async initializeService(): Promise<void> {
    await this.connect();
  }

  protected async cleanupService(): Promise<void> {
    await this.disconnect();
  }

  // ========================================
  // BaseConnector Required Method Implementations  
  // ========================================

  protected async processJobImpl(jobData: JobData, progressCallback: ProgressCallback): Promise<JobResult> {
    // WebSocketConnector uses the new processJob method instead
    return this.processJob(jobData, progressCallback);
  }

  async cancelJob(jobId: string): Promise<void> {
    // Cancel active job and clean up
    const activeJob = this.activeJobs.get(jobId);
    if (activeJob) {
      if (activeJob.timeout) {
        clearTimeout(activeJob.timeout);
      }
      this.activeJobs.delete(jobId);
      activeJob.reject(new Error('Job cancelled'));
      
      logger.info(`WebSocket job cancelled`, {
        connector: this.connector_id,
        jobId
      });
    }
  }

  async updateConfiguration(config: ConnectorConfig): Promise<void> {
    // Update base configuration
    this.config = { ...this.config, ...config };
    logger.info(`Updated configuration for WebSocket connector`, {
      connector: this.connector_id
    });
  }

  getConfiguration(): ConnectorConfig {
    return { ...this.config };
  }
}