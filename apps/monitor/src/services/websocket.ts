import { BaseMessage } from '@/types/message';
import type { 
  MonitorEvent,
  SubscriptionTopic
} from '@emp/core/dist/types/monitor-events.js';

export class EventStreamService {
  private eventSource: EventSource | null = null;
  private clientWs: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval = 3000;
  private isConnecting = false;
  private manuallyDisconnected = false;
  private messageQueue: BaseMessage[] = [];
  private baseUrl: string = 'http://localhost:3001';
  private monitorId: string = '';
  private subscriptions: SubscriptionTopic[] = [];
  private lastEventTimestamp: number = 0;
  
  // Event listeners
  private onMessageCallbacks: Array<(message: BaseMessage) => void> = [];
  private onEventCallbacks: Array<(event: MonitorEvent) => void> = [];
  private onConnectCallbacks: Array<() => void> = [];
  private onDisconnectCallbacks: Array<() => void> = [];
  private onErrorCallbacks: Array<(error: Event) => void> = [];
  private onFullStateCallbacks: Array<(state: unknown) => void> = [];

  constructor(url: string = 'http://localhost:3001') {
    this.baseUrl = url;
  }

  setUrl(url: string) {
    this.baseUrl = url;
  }

  connect() {
    if ((this.eventSource?.readyState === EventSource.OPEN && this.clientWs?.readyState === WebSocket.OPEN) || this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    this.manuallyDisconnected = false; // Reset manual disconnect flag
    
    // Generate timestamp-based IDs like the original monitor
    const timestamp = Date.now();
    this.monitorId = `monitor-id-${timestamp}`;
    const clientId = `client-id-${timestamp}`;
    
    // Extract host and remove protocol if present
    const host = this.baseUrl.replace(/^(https?:\/\/|wss?:\/\/)/, '');
    
    // Determine protocols based on URL
    const isSecure = this.baseUrl.startsWith('https://');
    const httpProtocol = isSecure ? 'https' : 'http';
    const wsProtocol = isSecure ? 'wss' : 'ws';
    
    // Parse auth token from URL if present
    const [baseHost, authParams] = host.split('?');
    const authQuery = authParams ? `?${authParams}` : '';
    
    // Create monitor EventSource and client WebSocket URLs
    const monitorUrl = `${httpProtocol}://${baseHost}/api/events/monitor${authQuery}`;
    const clientUrl = `${wsProtocol}://${baseHost}/ws/client/${clientId}${authQuery}`;
    
    console.log('[EventStream] Connecting monitor to:', monitorUrl);
    console.log('[WebSocket] Connecting client to:', clientUrl);
    
    try {
      // Create monitor EventSource connection
      this.eventSource = new EventSource(monitorUrl);
      this.setupEventSourceHandlers(this.eventSource);
      
      // Create client WebSocket connection  
      this.clientWs = new WebSocket(clientUrl);
      this.setupWebSocketHandlers(this.clientWs, 'client');
      
    } catch (error) {
      console.error('[Connection] Failed to create connections:', error);
      this.isConnecting = false;
    }
  }

  private setupEventSourceHandlers(eventSource: EventSource) {
    eventSource.onopen = () => {
      console.log('[EventStream] Monitor connected');
      
      // Check if both connections are open
      if (this.eventSource?.readyState === EventSource.OPEN && this.clientWs?.readyState === WebSocket.OPEN) {
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        
        // Send queued messages
        this.messageQueue.forEach(message => this.send(message));
        this.messageQueue = [];
        
        this.onConnectCallbacks.forEach(callback => callback());
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
          console.log('[EventStream] Processing monitor event:', data.type);
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
      this.onErrorCallbacks.forEach(callback => callback(error));
      
      // Auto-reconnect only if not manually disconnected
      if (!this.manuallyDisconnected && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        console.log(`[EventStream] Reconnecting... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        setTimeout(() => this.connect(), this.reconnectInterval);
      }
    };
  }

  private setupWebSocketHandlers(ws: WebSocket, type: 'client') {
    ws.onopen = () => {
      console.log(`[WebSocket] ${type} connected`);
      
      // Check if both connections are open
      if (this.eventSource?.readyState === EventSource.OPEN && this.clientWs?.readyState === WebSocket.OPEN) {
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        
        // Send queued messages
        this.messageQueue.forEach(message => this.send(message));
        this.messageQueue = [];
        
        this.onConnectCallbacks.forEach(callback => callback());
      }
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
      
      // If either connection closes, trigger disconnect
      if (this.eventSource?.readyState !== EventSource.OPEN || this.clientWs?.readyState !== WebSocket.OPEN) {
        this.isConnecting = false;
        this.onDisconnectCallbacks.forEach(callback => callback());
        
        // Auto-reconnect only if not manually disconnected
        if (!this.manuallyDisconnected && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          console.log(`[WebSocket] Reconnecting... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          setTimeout(() => this.connect(), this.reconnectInterval);
        }
      }
    };

    ws.onerror = (error) => {
      console.error(`[WebSocket] ${type} error:`, error);
      this.isConnecting = false;
      this.onErrorCallbacks.forEach(callback => callback(error));
    };
  }

  disconnect() {
    this.manuallyDisconnected = true; // Set manual disconnect flag
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

  send(message: BaseMessage) {
    // Send messages via the client connection (for job submission)
    if (this.clientWs?.readyState === WebSocket.OPEN) {
      this.clientWs.send(JSON.stringify(message));
    } else {
      // Queue message for when connection is established
      this.messageQueue.push(message);
      if (!this.isConnected()) {
        this.connect();
      }
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

  // Monitor events are now handled via EventSource
  // No need for monitor-specific WebSocket methods

  private isMonitorEvent(data: unknown): boolean {
    const eventTypes = [
      'worker_connected', 'worker_disconnected', 'worker_status_changed',
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
  submitJob(message: Omit<BaseMessage, 'id' | 'timestamp'>) {
    this.send({
      ...message,
      id: crypto.randomUUID(),
      timestamp: Date.now()
    });
  }
}

// Singleton instance
export const websocketService = new EventStreamService();