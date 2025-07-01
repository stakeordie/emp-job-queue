import { BaseMessage } from '@/types/message';

export class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval = 3000;
  private isConnecting = false;
  private messageQueue: BaseMessage[] = [];
  
  // Event listeners
  private onMessageCallbacks: Array<(message: BaseMessage) => void> = [];
  private onConnectCallbacks: Array<() => void> = [];
  private onDisconnectCallbacks: Array<() => void> = [];
  private onErrorCallbacks: Array<(error: Event) => void> = [];

  constructor(private url: string = 'ws://localhost:3002') {}

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    
    try {
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = () => {
        console.log('[WebSocket] Connected to hub');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        
        // Send queued messages
        this.messageQueue.forEach(message => this.send(message));
        this.messageQueue = [];
        
        this.onConnectCallbacks.forEach(callback => callback());
      };

      this.ws.onmessage = (event) => {
        try {
          const message: BaseMessage = JSON.parse(event.data);
          this.onMessageCallbacks.forEach(callback => callback(message));
        } catch (error) {
          console.error('[WebSocket] Error parsing message:', error);
        }
      };

      this.ws.onclose = (event) => {
        console.log('[WebSocket] Connection closed:', event.code, event.reason);
        this.isConnecting = false;
        this.ws = null;
        this.onDisconnectCallbacks.forEach(callback => callback());
        
        // Auto-reconnect
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          console.log(`[WebSocket] Reconnecting... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          setTimeout(() => this.connect(), this.reconnectInterval);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        this.isConnecting = false;
        this.onErrorCallbacks.forEach(callback => callback(error));
      };
      
    } catch (error) {
      console.error('[WebSocket] Failed to create connection:', error);
      this.isConnecting = false;
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(message: BaseMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      // Queue message for when connection is established
      this.messageQueue.push(message);
      if (!this.isConnected()) {
        this.connect();
      }
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
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