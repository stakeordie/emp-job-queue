import { BaseMessage } from '@/types/message';
import type { 
  MonitorEvent,
  SubscriptionTopic
} from '@emp/core';

/**
 * WebSocketService handles monitor connections using WebSocket only:
 * 
 * 1. WebSocket - TWO-WAY for all monitor and client operations
 *    - Receives ALL monitor events (machine_shutdown, job updates, etc.)
 *    - Can send job submissions and client commands
 *    - Connects to /ws/monitor endpoint with auth token
 *    - Single connection for both monitoring and operations
 * 
 * The monitor subscribes to events by sending subscription messages after connection.
 * The EventBroadcaster on the server side determines which events to send
 * based on client subscriptions.
 */
export class EventStreamService {
  private monitorWs: WebSocket | null = null;
  private clientWs: WebSocket | null = null;
  private reconnectAttempts = 0;
  private isConnecting = false;
  private autoConnect = false;  // Must be explicitly enabled for reconnection
  private baseUrl: string = 'http://localhost:3331';
  private monitorId: string = '';
  private subscriptions: SubscriptionTopic[] = [];
  private lastEventTimestamp: number = 0;
  
  // Event listeners
  private onMessageCallbacks: Array<(message: BaseMessage) => void> = [];
  private onEventCallbacks: Array<(event: MonitorEvent) => void> = [];
  private onConnectCallbacks: Array<() => void> = [];
  private onDisconnectCallbacks: Array<() => void> = [];
  private onErrorCallbacks: Array<(error: Event) => void> = [];
  private onConnectionFailedCallbacks: Array<(reason: string) => void> = [];
  private onFullStateCallbacks: Array<(state: unknown) => void> = [];

  constructor(url: string = 'http://localhost:3331') {
    this.baseUrl = url;
  }

  setUrl(url: string) {
    this.baseUrl = url;
  }

  getUrl(): string {
    return this.baseUrl;
  }

  connect() {
    // Don't connect if already connected or connecting
    if (this.isConnected() || this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    this.autoConnect = false; // Never auto-reconnect
    this.reconnectAttempts = 0;
    
    // Generate timestamp-based IDs
    const timestamp = Date.now();
    this.monitorId = `monitor-id-${timestamp}`;
    const clientId = `client-id-${timestamp}`;
    
    // Extract host and remove protocol if present
    const host = this.baseUrl.replace(/^(https?:\/\/|wss?:\/\/)/, '');
    
    // Determine WebSocket protocol based on URL
    const isSecure = this.baseUrl.startsWith('https://') || this.baseUrl.startsWith('wss://');
    const wsProtocol = isSecure ? 'wss' : 'ws';
    
    // Parse auth token from URL if present
    const [baseHost, authParams] = host.split('?');
    const authQuery = authParams ? `?${authParams}` : '';
    
    // Create WebSocket URLs
    const monitorUrl = `${wsProtocol}://${baseHost}/ws/monitor/${this.monitorId}${authQuery}`;
    const clientUrl = `${wsProtocol}://${baseHost}/ws/client/${clientId}${authQuery}`;
    
    console.log('[WebSocket] Connecting monitor to:', monitorUrl);
    console.log('[WebSocket] Connecting client to:', clientUrl);
    
    try {
      // Connect monitor WebSocket first
      this.monitorWs = new WebSocket(monitorUrl);
      this.setupMonitorWebSocketHandlers(this.monitorWs);
      
      // Connect client WebSocket
      this.clientWs = new WebSocket(clientUrl);
      this.setupClientWebSocketHandlers(this.clientWs);
      
    } catch (error) {
      console.error('[Connection] Failed to create WebSocket:', error);
      this.isConnecting = false;
    }
  }

  private setupMonitorWebSocketHandlers(ws: WebSocket) {
    ws.onopen = () => {
      console.log('[WebSocket] Monitor connected successfully');
      
      // Send subscription message to receive all monitor events
      this.subscriptions = ['workers', 'machines', 'jobs', 'system_stats', 'heartbeat'];
      this.sendSubscription();
      
      // Request initial full state sync
      this.requestFullStateSync();
      
      // Check if both connections are ready
      this.checkBothConnectionsReady();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Debug logging for machine events
        if (data.type && data.type.startsWith('machine_')) {
          console.log('[WebSocket] Machine event received:', data.type, data);
        }
        
        // Handle monitor events from the event broadcaster
        if (this.isMonitorEvent(data)) {
          // Log full_state_snapshot data for debugging
          if (data.type === 'full_state_snapshot') {
            console.log('[WebSocket] Processing monitor event:', data.type);
            console.log('[WebSocket] Full state snapshot data:', JSON.stringify(data, null, 2));
          } else {
            console.log('[WebSocket] Processing monitor event:', data.type);
          }
          this.handleMonitorEvent(data as MonitorEvent);
        }
      } catch (error) {
        console.error('[WebSocket] Error parsing monitor message:', error);
      }
    };

    ws.onclose = () => {
      console.log('[WebSocket] Monitor connection closed');
      this.monitorWs = null;
      
      // Notify UI of disconnection
      this.onDisconnectCallbacks.forEach(callback => callback());
    };

    ws.onerror = (error) => {
      console.error('[WebSocket] Monitor error:', error);
      this.handleConnectionError(error, 'Monitor WebSocket connection failed');
    };
  }

  private setupClientWebSocketHandlers(ws: WebSocket) {
    ws.onopen = () => {
      console.log('[WebSocket] Client connected successfully');
      
      // Check if both connections are ready
      this.checkBothConnectionsReady();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[WebSocket] Client message received:', data.type);
        
        // Handle client messages (job responses, etc.)
        this.onMessageCallbacks.forEach(callback => callback(data as BaseMessage));
      } catch (error) {
        console.error('[WebSocket] Error parsing client message:', error);
      }
    };

    ws.onclose = () => {
      console.log('[WebSocket] Client connection closed');
      this.clientWs = null;
      
      // Notify UI of disconnection
      this.onDisconnectCallbacks.forEach(callback => callback());
    };

    ws.onerror = (error) => {
      console.error('[WebSocket] Client error:', error);
      this.handleConnectionError(error, 'Client WebSocket connection failed');
    };
  }

  private checkBothConnectionsReady() {
    if (this.monitorWs?.readyState === WebSocket.OPEN && 
        this.clientWs?.readyState === WebSocket.OPEN) {
      
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      
      // Notify UI we're fully connected
      this.onConnectCallbacks.forEach(callback => callback());
    }
  }

  private handleConnectionError(error: Event, reason: string) {
    this.isConnecting = false;
    this.onErrorCallbacks.forEach(callback => callback(error));
    
    // Clean up connections
    if (this.monitorWs) {
      this.monitorWs.close();
      this.monitorWs = null;
    }
    if (this.clientWs) {
      this.clientWs.close();
      this.clientWs = null;
    }
    
    // Notify UI that connection failed
    this.onConnectionFailedCallbacks.forEach(callback => callback(reason));
    
    // Notify UI that we're disconnected
    this.onDisconnectCallbacks.forEach(callback => callback());
  }

  disconnect() {
    this.autoConnect = false; // Disable auto-reconnection
    this.reconnectAttempts = 0; // Reset reconnect attempts
    
    if (this.monitorWs) {
      this.monitorWs.close();
      this.monitorWs = null;
    }
    if (this.clientWs) {
      this.clientWs.close();
      this.clientWs = null;
    }
  }

  send(message: BaseMessage): boolean {
    // Send messages via the client connection (for job submission and commands)
    if (this.clientWs?.readyState === WebSocket.OPEN) {
      this.clientWs.send(JSON.stringify(message));
      return true;
    } else {
      // Cannot send when not connected - return false to indicate failure
      console.warn('[WebSocket] Cannot send message - not connected');
      return false;
    }
  }

  isConnected(): boolean {
    return this.monitorWs?.readyState === WebSocket.OPEN && 
           this.clientWs?.readyState === WebSocket.OPEN;
  }

  private sendSubscription() {
    if (this.monitorWs?.readyState === WebSocket.OPEN) {
      const subscriptionMessage = {
        type: 'subscribe',
        monitor_id: this.monitorId,
        topics: this.subscriptions,
        timestamp: Date.now()
      };
      this.monitorWs.send(JSON.stringify(subscriptionMessage));
      console.log('[WebSocket] Sent subscription:', this.subscriptions);
    }
  }

  private requestFullStateSync(options?: { finishedJobsPagination?: { page: number; pageSize: number } }) {
    if (this.monitorWs?.readyState === WebSocket.OPEN) {
      const syncRequest = {
        type: 'request_full_state',
        monitor_id: this.monitorId,
        timestamp: Date.now(),
        ...options
      };
      this.monitorWs.send(JSON.stringify(syncRequest));
      console.log('[WebSocket] Requested full state sync', options);
    }
  }

  // Public method to refresh monitor state
  refreshMonitorState(options?: { finishedJobsPagination?: { page: number; pageSize: number } }) {
    this.requestFullStateSync(options);
  }


  // Event listener management
  onMessage(callback: (message: BaseMessage) => void) {
    this.onMessageCallbacks.push(callback);
    return () => {
      const index = this.onMessageCallbacks.indexOf(callback);
      if (index > -1) this.onMessageCallbacks.splice(index, 1);
    };
  }

  onEvent(callback: (event: MonitorEvent) => void) {
    this.onEventCallbacks.push(callback);
    return () => {
      const index = this.onEventCallbacks.indexOf(callback);
      if (index > -1) this.onEventCallbacks.splice(index, 1);
    };
  }

  onFullState(callback: (state: unknown) => void) {
    this.onFullStateCallbacks.push(callback);
    return () => {
      const index = this.onFullStateCallbacks.indexOf(callback);
      if (index > -1) this.onFullStateCallbacks.splice(index, 1);
    };
  }

  onConnect(callback: () => void) {
    this.onConnectCallbacks.push(callback);
    return () => {
      const index = this.onConnectCallbacks.indexOf(callback);
      if (index > -1) this.onConnectCallbacks.splice(index, 1);
    };
  }

  onDisconnect(callback: () => void) {
    this.onDisconnectCallbacks.push(callback);
    return () => {
      const index = this.onDisconnectCallbacks.indexOf(callback);
      if (index > -1) this.onDisconnectCallbacks.splice(index, 1);
    };
  }

  onError(callback: (error: Event) => void) {
    this.onErrorCallbacks.push(callback);
    return () => {
      const index = this.onErrorCallbacks.indexOf(callback);
      if (index > -1) this.onErrorCallbacks.splice(index, 1);
    };
  }

  onConnectionFailed(callback: (reason: string) => void) {
    this.onConnectionFailedCallbacks.push(callback);
    return () => {
      const index = this.onConnectionFailedCallbacks.indexOf(callback);
      if (index > -1) this.onConnectionFailedCallbacks.splice(index, 1);
    };
  }

  // Monitor events are now handled via WebSocket with subscriptions
  // All communication uses a single WebSocket connection

  private isMonitorEvent(data: unknown): boolean {
    const eventTypes = [
      'worker_connected', 'worker_disconnected', 'worker_status_changed',
      'connector_status_changed',
      'job_submitted', 'job_assigned', 'job_status_changed', 'update_job_progress',
      'complete_job', 'job_failed', 'full_state_snapshot', 'heartbeat_ack',
      'resync_response', 'system_stats',
      'machine_startup', 'machine_startup_step', 'machine_startup_complete', 'machine_shutdown',
      'machine_update', 'machine_status_change', 'machine_disconnected'
    ];
    
    return typeof data === 'object' && data !== null && 
           'type' in data && typeof data.type === 'string' &&
           eventTypes.includes(data.type);
  }

  private handleMonitorEvent(event: MonitorEvent) {
    // Skip logging job_progress events to reduce console spam
    if (event.type !== 'update_job_progress') {
      // console.log('[WebSocket] Received event:', event.type, event);
    }
    
    // Update last event timestamp for resync capability
    this.updateLastEventTimestamp(event.timestamp);
    
    // Handle special events
    if (event.type === 'full_state_snapshot') {
      const fullStateEvent = event as { type: 'full_state_snapshot'; data: unknown; timestamp: number };
      this.onFullStateCallbacks.forEach(callback => callback(fullStateEvent.data));
    } else if (event.type === 'resync_response') {
      this.handleResyncResponse(event as {
        type: 'resync_response';
        monitor_id: string;
        events: MonitorEvent[];
        has_more: boolean;
        oldest_available_timestamp: number;
        timestamp: number;
      });
    } else if (event.type === 'heartbeat_ack') {
      // Update connection health, no action needed
    } else {
      // Broadcast to all event listeners
      this.onEventCallbacks.forEach(callback => callback(event));
    }
  }

  private handleResyncResponse(response: {
    type: 'resync_response';
    monitor_id: string;
    events: MonitorEvent[];
    has_more: boolean;
    oldest_available_timestamp: number;
    timestamp: number;
  }) {
    // console.log(`[WebSocket] Received resync response: ${response.events.length} events, has_more: ${response.has_more}`);
    
    // Process all events in chronological order
    response.events
      .sort((a, b) => a.timestamp - b.timestamp)
      .forEach(event => {
        this.updateLastEventTimestamp(event.timestamp);
        this.onEventCallbacks.forEach(callback => callback(event));
      });
    
    // If there are more events available, we could automatically request them
    // For now, we leave it to the application to decide
    if (response.has_more) {
      // console.log('[WebSocket] More events available for resync - use requestResync() to get them');
    }
  }

  // Subscription management is handled by WebSocket
  // Events are streamed after sending subscription message

  // Track last event timestamp for resync
  private updateLastEventTimestamp(timestamp: number) {
    this.lastEventTimestamp = Math.max(this.lastEventTimestamp, timestamp);
  }

  // Helper methods for common message types
  submitJob(message: Omit<BaseMessage, 'id' | 'timestamp'>): boolean {
    return this.send({
      ...message,
      id: crypto.randomUUID(),
      timestamp: Date.now()
    });
  }
}

// Singleton instance
export const websocketService = new EventStreamService();