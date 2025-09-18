export * from './job';
export * from './worker';
export * from './machine';
export * from './message';

// UI State Types
export interface ConnectionState {
  isConnected: boolean;
  isReconnecting: boolean;
  lastHeartbeat: Date | null;
  reconnectAttempts: number;
  error?: string; // Connection error message
}

export interface UIState {
  selectedJobId: string | null;
  selectedWorkerId: string | null;
  sidebarOpen: boolean;
  debugMode: boolean;
  theme: 'light' | 'dark' | 'system';
}

// Log Entry Type
export interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  category: string;
  message: string;
  data?: unknown;
  source: 'websocket' | 'store' | 'component' | 'api';
}
