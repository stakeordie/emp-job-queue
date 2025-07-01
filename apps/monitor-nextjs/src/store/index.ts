import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { Job, Worker, WorkerCapabilities, WorkerStatus, JobStatus, JobRequirements, ConnectionState, UIState, LogEntry } from '@/types';
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
  connect: (url?: string) => void;
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
    connect: (url?: string) => {
      const { addLog, setConnection, updateJob, addJob, updateWorker, addWorker } = get();
      
      if (url) {
        websocketService.setUrl(url);
      }
      
      addLog({
        level: 'info',
        category: 'websocket',
        message: `Connecting to WebSocket: ${url || 'default'}`,
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
            const statsMessage = message as { type: 'stats_broadcast'; data?: { workers?: unknown[]; jobs?: unknown[] } };
            if (statsMessage.data) {
              // Update workers
              if (statsMessage.data.workers) {
                statsMessage.data.workers.forEach((worker: Record<string, unknown>) => {
                  addWorker({
                    id: (worker.id as string) || (worker.worker_id as string),
                    status: (worker.status as string) || 'idle',
                    capabilities: (worker.capabilities as WorkerCapabilities) || {
                      gpu_count: 1,
                      gpu_memory_gb: 8,
                      gpu_model: 'Unknown',
                      cpu_cores: 4,
                      ram_gb: 16,
                      services: [],
                      models: [],
                      customer_access: 'none',
                      max_concurrent_jobs: 1
                    },
                    current_job_id: worker.current_job_id as string,
                    connected_at: (worker.connected_at as string) || new Date().toISOString(),
                    last_activity: (worker.last_activity as string) || new Date().toISOString(),
                    jobs_completed: (worker.jobs_completed as number) || 0,
                    jobs_failed: (worker.jobs_failed as number) || 0,
                    total_processing_time: (worker.total_processing_time as number) || 0
                  });
                });
              }
              
              // Update jobs
              if (statsMessage.data.jobs) {
                statsMessage.data.jobs.forEach((job: Record<string, unknown>) => {
                  addJob({
                    id: (job.id as string) || (job.job_id as string),
                    job_type: (job.job_type as string) || (job.type as string) || 'unknown',
                    status: (job.status as JobStatus) || 'pending',
                    priority: (job.priority as number) || 50,
                    payload: (job.payload as Record<string, unknown>) || {},
                    customer_id: job.customer_id as string,
                    requirements: job.requirements as JobRequirements,
                    workflow_id: job.workflow_id as string,
                    workflow_priority: job.workflow_priority as number,
                    workflow_datetime: job.workflow_datetime as number,
                    step_number: job.step_number as number,
                    created_at: (job.created_at as number) || Date.now(),
                    assigned_at: job.assigned_at as number,
                    started_at: job.started_at as number,
                    completed_at: job.completed_at as number,
                    worker_id: job.worker_id as string,
                    progress: job.progress as number,
                    result: job.result as unknown,
                    error: job.error as string,
                    failure_count: (job.failure_count as number) || 0
                  });
                });
              }
            }
            break;
          case 'job_assigned':
          case 'job_progress':
          case 'job_completed':
          case 'job_failed':
            const jobMessage = message as Record<string, unknown>;
            if (jobMessage.job_id) {
              updateJob(jobMessage.job_id as string, {
                status: message.type === 'job_assigned' ? 'assigned' :
                        message.type === 'job_progress' ? 'processing' :
                        message.type === 'job_completed' ? 'completed' : 'failed',
                progress: jobMessage.progress as number,
                worker_id: jobMessage.worker_id as string,
                result: jobMessage.result as unknown,
                error: jobMessage.error as string
              });
            }
            break;
          case 'worker_status':
            const workerMessage = message as Record<string, unknown>;
            if (workerMessage.worker_id) {
              updateWorker(workerMessage.worker_id as string, {
                status: workerMessage.status as WorkerStatus,
                current_job_id: workerMessage.current_job_id as string
              });
            }
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