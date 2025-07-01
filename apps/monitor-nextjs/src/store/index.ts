import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { Job, Worker, ConnectionState, UIState, LogEntry } from '@/types';
import { websocketService } from '@/services/websocket';

interface MonitorStore {
  // Connection state
  connection: ConnectionState;
  
  // Data
  jobs: Job[];
  workers: Worker[];
  logs: LogEntry[];
  
  // UI state
  ui: UIState;
  
  // Actions
  setConnection: (state: Partial<ConnectionState>) => void;
  addJob: (job: Job) => void;
  updateJob: (jobId: string, updates: Partial<Job>) => void;
  removeJob: (jobId: string) => void;
  addWorker: (worker: Worker) => void;
  updateWorker: (workerId: string, updates: Partial<Worker>) => void;
  removeWorker: (workerId: string) => void;
  addLog: (log: Omit<LogEntry, 'id' | 'timestamp'>) => void;
  clearLogs: () => void;
  setUIState: (updates: Partial<UIState>) => void;
  
  // WebSocket actions
  connect: () => void;
  disconnect: () => void;
  submitJob: (jobData: Record<string, unknown>) => void;
}

export const useMonitorStore = create<MonitorStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    connection: {
      isConnected: false,
      isReconnecting: false,
      lastHeartbeat: null,
      reconnectAttempts: 0,
    },
    
    jobs: [],
    workers: [],
    logs: [],
    
    ui: {
      selectedJobId: null,
      selectedWorkerId: null,
      sidebarOpen: false,
      debugMode: false,
      theme: 'system',
    },
    
    // Connection actions
    setConnection: (state) =>
      set((prev) => ({
        connection: { ...prev.connection, ...state },
      })),
    
    // Job actions
    addJob: (job) =>
      set((state) => ({
        jobs: [job, ...state.jobs].slice(0, 1000), // Keep last 1000 jobs
      })),
    
    updateJob: (jobId, updates) =>
      set((state) => ({
        jobs: state.jobs.map((job) =>
          job.id === jobId ? { ...job, ...updates } : job
        ),
      })),
    
    removeJob: (jobId) =>
      set((state) => ({
        jobs: state.jobs.filter((job) => job.id !== jobId),
      })),
    
    // Worker actions
    addWorker: (worker) =>
      set((state) => ({
        workers: [
          ...state.workers.filter((w) => w.id !== worker.id),
          worker,
        ],
      })),
    
    updateWorker: (workerId, updates) =>
      set((state) => ({
        workers: state.workers.map((worker) =>
          worker.id === workerId ? { ...worker, ...updates } : worker
        ),
      })),
    
    removeWorker: (workerId) =>
      set((state) => ({
        workers: state.workers.filter((worker) => worker.id !== workerId),
      })),
    
    // Log actions
    addLog: (log) =>
      set((state) => ({
        logs: [
          {
            ...log,
            id: crypto.randomUUID(),
            timestamp: new Date(),
          },
          ...state.logs,
        ].slice(0, 500), // Keep last 500 logs
      })),
    
    clearLogs: () => set({ logs: [] }),
    
    // UI actions
    setUIState: (updates) =>
      set((state) => ({
        ui: { ...state.ui, ...updates },
      })),
    
    // WebSocket actions
    connect: () => {
      const { addLog, setConnection } = get();
      
      addLog({
        level: 'info',
        category: 'websocket',
        message: 'Connecting to WebSocket...',
        source: 'store',
      });
      
      // Set up event listeners
      websocketService.onConnect(() => {
        setConnection({ isConnected: true, isReconnecting: false });
        addLog({
          level: 'info',
          category: 'websocket',
          message: 'Connected to hub',
          source: 'websocket',
        });
      });
      
      websocketService.onDisconnect(() => {
        setConnection({ isConnected: false });
        addLog({
          level: 'warn',
          category: 'websocket',
          message: 'Disconnected from hub',
          source: 'websocket',
        });
      });
      
      websocketService.onMessage((message) => {
        addLog({
          level: 'debug',
          category: 'message',
          message: `Received: ${message.type}`,
          data: message,
          source: 'websocket',
        });
        
        // Handle different message types
        switch (message.type) {
          case 'stats_broadcast':
            // Update jobs and workers from stats broadcast
            break;
          case 'job_assigned':
          case 'job_progress':
          case 'job_completed':
          case 'job_failed':
            // Update specific job
            break;
          case 'worker_status':
            // Update worker status
            break;
        }
      });
      
      websocketService.connect();
    },
    
    disconnect: () => {
      websocketService.disconnect();
      get().setConnection({ isConnected: false });
    },
    
    submitJob: (jobData) => {
      const { addLog } = get();
      
      addLog({
        level: 'info',
        category: 'job',
        message: 'Submitting job',
        data: jobData,
        source: 'store',
      });
      
      websocketService.submitJob({
        type: 'submit_job',
        ...jobData,
      });
    },
  }))
);

// Auto-connect when store is created
if (typeof window !== 'undefined') {
  useMonitorStore.getState().connect();
}