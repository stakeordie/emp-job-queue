import { BaseMessage } from '@/types/message';
import type { 
  MonitorEvent,
  SubscriptionTopic
} from '@emp/core';

/**
 * EventStreamService handles monitor connections using TWO separate protocols:
 * 
 * 1. EventSource (SSE) - ONE-WAY from server to monitor
 *    - Receives ALL monitor events (machine_shutdown, job updates, etc.)
 *    - No subscription messages needed - events are automatically streamed
 *    - Uses HTTP GET to /api/events/monitor endpoint
 *    - Cannot send data back to server
 * 
 * 2. WebSocket - TWO-WAY for client operations
 *    - Used only for job submissions and client commands
 *    - Connects to /ws/client/ endpoint
 *    - Can send and receive messages
 * 
 * IMPORTANT: The monitor does NOT need to send subscription messages for events.
 * EventSource automatically receives all events that the server broadcasts.
 * The EventBroadcaster on the server side determines which events to send
 * based on the event type, not based on client subscriptions.
 */
export class EventStreamService {
  private eventSource: EventSource | null = null;
  private clientWs: WebSocket | null = null;
  private reconnectAttempts = 0;
  private isConnecting = false;
  private autoConnect = false;  // Must be explicitly enabled for reconnection
  private baseUrl: string = 'http://localhost:3000';
  private monitorId: string = '';
  private subscriptions: SubscriptionTopic[] = [];
  private lastEventTimestamp: number = 0;
  private pendingClientUrl: string = '';
  
  // Event listeners
  private onMessageCallbacks: Array<(message: BaseMessage) => void> = [];
  private onEventCallbacks: Array<(event: MonitorEvent) => void> = [];
  private onConnectCallbacks: Array<() => void> = [];
  private onDisconnectCallbacks: Array<() => void> = [];
  private onErrorCallbacks: Array<(error: Event) => void> = [];
  private onConnectionFailedCallbacks: Array<(reason: string) => void> = [];
  private onFullStateCallbacks: Array<(state: unknown) => void> = [];

  constructor(url: string = 'http://localhost:3000') {
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
    
    // Generate timestamp-based IDs like the original monitor
    const timestamp = Date.now();
    this.monitorId = `monitor-id-${timestamp}`;
    const clientId = `client-id-${timestamp}`;
    
    // Extract host and remove protocol if present
    const host = this.baseUrl.replace(/^(https?:\/\/|wss?:\/\/)/, '');
    
    // Determine protocols based on URL
    const isSecure = this.baseUrl.startsWith('https://') || this.baseUrl.startsWith('wss://');
    const httpProtocol = isSecure ? 'https' : 'http';
    const wsProtocol = isSecure ? 'wss' : 'ws';
    
    // Parse auth token from URL if present
    const [baseHost, authParams] = host.split('?');
    const authQuery = authParams ? `?${authParams}` : '';
    
    // Create monitor EventSource URL
    const monitorUrl = `${httpProtocol}://${baseHost}/api/events/monitor${authQuery}`;
    
    console.log('[EventStream] Connecting monitor to:', monitorUrl);
    
    try {
      // ONLY create monitor EventSource connection first
      this.eventSource = new EventSource(monitorUrl);
      this.setupEventSourceHandlers(this.eventSource);
      
      // Store client URL for later use when EventSource connects
      this.pendingClientUrl = `${wsProtocol}://${baseHost}/ws/client/${clientId}${authQuery}`;
      
    } catch (error) {
      console.error('[Connection] Failed to create EventSource:', error);
      this.isConnecting = false;
    }
  }

  private setupEventSourceHandlers(eventSource: EventSource) {
    // EventSource handlers for receiving monitor events
    // NOTE: EventSource is ONE-WAY - we only receive events, never send subscription messages
    eventSource.onopen = () => {
      console.log('[EventStream] Monitor connected successfully');
      
      // Now that EventSource is connected, connect WebSocket
      if (this.pendingClientUrl && !this.clientWs) {
        console.log('[WebSocket] Connecting client to:', this.pendingClientUrl);
        try {
          this.clientWs = new WebSocket(this.pendingClientUrl);
          this.setupWebSocketHandlers(this.clientWs, 'client');
        } catch (error) {
          console.error('[WebSocket] Failed to create client connection:', error);
          // EventSource is connected but WebSocket failed - still partially functional
          this.isConnecting = false;
          this.onConnectCallbacks.forEach(callback => callback());
        }
      }
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Debug logging for machine events
        if (data.type && data.type.startsWith('machine_')) {
          console.log('[EventStream] Machine event received:', data.type, data);
        }
        
        // Handle monitor events from the event broadcaster
        if (this.isMonitorEvent(data)) {
          // Log full_state_snapshot data for debugging
          if (data.type === 'full_state_snapshot') {
            console.log('[EventStream] Processing monitor event:', data.type);
            console.log('[EventStream] Full state snapshot data:', JSON.stringify(data, null, 2));
          } else {
            console.log('[EventStream] Processing monitor event:', data.type);
          }
          this.handleMonitorEvent(data as MonitorEvent);
        } else {
          console.log('[EventStream] Handling as legacy message:', data.type);
          // Handle legacy messages
          this.onMessageCallbacks.forEach(callback => callback(data as BaseMessage));
        }
      } catch (error) {
        console.error('[EventStream] Error parsing monitor message:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('[EventStream] Monitor error:', error);
      this.isConnecting = false;
      
      // EventSource automatically closes on error
      if (this.eventSource?.readyState === EventSource.CLOSED) {
        this.eventSource = null;
        console.log('[EventStream] EventSource closed');
      }
      
      this.onErrorCallbacks.forEach(callback => callback(error));
      
      // No auto-reconnect - just fail immediately
      this.autoConnect = false;
      this.isConnecting = false;
      
      // Clean up any connections
      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
      }
      if (this.clientWs) {
        this.clientWs.close();
        this.clientWs = null;
      }
      
      // Notify UI that connection failed
      const reason = 'API not responding';
      this.onConnectionFailedCallbacks.forEach(callback => callback(reason));
      
      // Notify UI that we're disconnected
      this.onDisconnectCallbacks.forEach(callback => callback());
      
      // Clear pending data
      this.pendingClientUrl = '';
    };
  }

  private setupWebSocketHandlers(ws: WebSocket, type: 'client') {
    ws.onopen = () => {
      console.log(`[WebSocket] ${type} connected successfully`);
      
      // Both connections are now open
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      
      // Notify UI we're fully connected
      this.onConnectCallbacks.forEach(callback => callback());
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Handle client messages (job responses, etc.)
        this.onMessageCallbacks.forEach(callback => callback(data as BaseMessage));
      } catch (error) {
        console.error(`[WebSocket] Error parsing ${type} message:`, error);
      }
    };

    ws.onclose = () => {
      console.log(`[WebSocket] ${type} connection closed`);
      this.clientWs = null;
      
      // Notify UI of disconnection
      this.onDisconnectCallbacks.forEach(callback => callback());
      
      // WebSocket closing doesn't trigger reconnection - only EventSource does
      // This maintains the sequential connection model
    };

    ws.onerror = (error) => {
      console.error(`[WebSocket] ${type} error:`, error);
      this.isConnecting = false;
      this.onErrorCallbacks.forEach(callback => callback(error));
      
      // WebSocket errors don't trigger reconnection - only EventSource does
      // This maintains the sequential connection model where EventSource leads
    };
  }

  disconnect() {
    this.autoConnect = false; // Disable auto-reconnection
    this.reconnectAttempts = 0; // Reset reconnect attempts
    
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.clientWs) {
      this.clientWs.close();
      this.clientWs = null;
    }
  }

  send(message: BaseMessage): boolean {
    // Send messages via the client connection (for job submission)
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
    return this.eventSource?.readyState === EventSource.OPEN && this.clientWs?.readyState === WebSocket.OPEN;
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

  // Monitor events are now handled via EventSource
  // No need for monitor-specific WebSocket methods

  private isMonitorEvent(data: unknown): boolean {
    const eventTypes = [
      'worker_connected', 'worker_disconnected', 'worker_status_changed',
      'connector_status_changed',
      'job_submitted', 'job_assigned', 'job_status_changed', 'update_job_progress',
      'complete_job', 'job_failed', 'full_state_snapshot', 'heartbeat_ack',
      'resync_response', 'system_stats',
      'machine_startup', 'machine_startup_step', 'machine_startup_complete', 'machine_shutdown'
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

  // Subscription management and resync are now handled by EventSource
  // Events are automatically streamed from the API server

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