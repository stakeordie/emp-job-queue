import { BaseMessage } from '@/types/message';

export class WebSocketService {
  private monitorWs: WebSocket | null = null;
  private clientWs: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval = 3000;
  private isConnecting = false;
  private messageQueue: BaseMessage[] = [];
  private baseUrl: string = 'ws://localhost:3002';
  
  // Event listeners
  private onMessageCallbacks: Array<(message: BaseMessage) => void> = [];
  private onConnectCallbacks: Array<() => void> = [];
  private onDisconnectCallbacks: Array<() => void> = [];
  private onErrorCallbacks: Array<(error: Event) => void> = [];

  constructor(url: string = 'ws://localhost:3002') {
    this.baseUrl = url;
  }

  setUrl(url: string) {
    this.baseUrl = url;
  }

  connect() {
    if ((this.monitorWs?.readyState === WebSocket.OPEN && this.clientWs?.readyState === WebSocket.OPEN) || this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    
    // Generate timestamp-based IDs like the original monitor
    const timestamp = Date.now();
    const monitorId = `monitor-id-${timestamp}`;
    const clientId = `client-id-${timestamp}`;
    
    // Extract host and remove protocol if present
    const host = this.baseUrl.replace(/^(https?:\/\/|wss?:\/\/)/, '');
    
    // Determine protocol based on URL
    const isSecure = this.baseUrl.startsWith('wss://') || this.baseUrl.startsWith('https://');
    const protocol = isSecure ? 'wss' : 'ws';
    
    // Parse auth token from URL if present
    const [baseHost, authParams] = host.split('?');
    const authQuery = authParams ? `?${authParams}` : '';
    
    // Create monitor and client URLs
    const monitorUrl = `${protocol}://${baseHost}/ws/monitor/${monitorId}${authQuery}`;
    const clientUrl = `${protocol}://${baseHost}/ws/client/${clientId}${authQuery}`;
    
    console.log('[WebSocket] Connecting monitor to:', monitorUrl);
    console.log('[WebSocket] Connecting client to:', clientUrl);
    
    try {
      // Create monitor WebSocket connection
      this.monitorWs = new WebSocket(monitorUrl);
      this.setupWebSocketHandlers(this.monitorWs, 'monitor');
      
      // Create client WebSocket connection  
      this.clientWs = new WebSocket(clientUrl);
      this.setupWebSocketHandlers(this.clientWs, 'client');
      
    } catch (error) {
      console.error('[WebSocket] Failed to create connections:', error);
      this.isConnecting = false;
    }
  }

  private setupWebSocketHandlers(ws: WebSocket, type: 'monitor' | 'client') {
    ws.onopen = () => {
      console.log(`[WebSocket] ${type} connected`);
      
      // Check if both connections are open
      if (this.monitorWs?.readyState === WebSocket.OPEN && this.clientWs?.readyState === WebSocket.OPEN) {
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
        const message: BaseMessage = JSON.parse(event.data);
        this.onMessageCallbacks.forEach(callback => callback(message));
      } catch (error) {
        console.error(`[WebSocket] Error parsing ${type} message:`, error);
      }
    };

    ws.onclose = (event) => {
      console.log(`[WebSocket] ${type} connection closed:`, event.code, event.reason);
      
      // If either connection closes, trigger disconnect
      if (this.monitorWs?.readyState !== WebSocket.OPEN || this.clientWs?.readyState !== WebSocket.OPEN) {
        this.isConnecting = false;
        this.onDisconnectCallbacks.forEach(callback => callback());
        
        // Auto-reconnect
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
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
    if (this.monitorWs) {
      this.monitorWs.close();
      this.monitorWs = null;
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
    return this.monitorWs?.readyState === WebSocket.OPEN && this.clientWs?.readyState === WebSocket.OPEN;
  }

  // Event listener management
  onMessage(callback: (message: BaseMessage) => void) {
    this.onMessageCallbacks.push(callback);
    return () => {
      const index = this.onMessageCallbacks.indexOf(callback);
      if (index > -1) this.onMessageCallbacks.splice(index, 1);
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
export const websocketService = new WebSocketService();