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
        // Clear workers and jobs when disconnected
        set({ workers: [], jobs: [] });
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
            console.log('[Store] Received stats_broadcast:', message);
            const statsMessage = message as unknown as Record<string, unknown>;
            
            // Clear existing workers and jobs first (like the original monitor)
            set({ workers: [], jobs: [] });
            
            // Workers is an object with worker IDs as keys, not an array
            const workers = statsMessage.workers as Record<string, Record<string, unknown>>;
            console.log('[Store] Found workers object:', workers);
            
            if (workers && typeof workers === 'object') {
              const workerEntries = Object.entries(workers);
              console.log('[Store] Processing', workerEntries.length, 'workers');
              
              workerEntries.forEach(([workerId, workerData]) => {
                console.log('[Store] Adding worker:', workerId, workerData);
                
                const capabilities = (workerData.capabilities as WorkerCapabilities) || {
                  gpu_count: 1,
                  gpu_memory_gb: 8,
                  gpu_model: 'Unknown',
                  cpu_cores: 4,
                  ram_gb: 16,
                  services: [],
                  models: [],
                  customer_access: 'none',
                  max_concurrent_jobs: 1
                };
                
                addWorker({
                  id: workerId,
                  status: (workerData.status as WorkerStatus) || 'idle',
                  capabilities,
                  current_job_id: workerData.current_job_id as string,
                  connected_at: (workerData.connected_at as string) || new Date().toISOString(),
                  last_activity: (workerData.last_activity as string) || new Date().toISOString(),
                  jobs_completed: (workerData.jobs_processed as number) || (workerData.jobs_completed as number) || 0,
                  jobs_failed: (workerData.jobs_failed as number) || 0,
                  total_processing_time: (workerData.total_processing_time as number) || 0
                });
              });
            }
            
            // Handle jobs from system.jobs structure (like original monitor)
            const system = statsMessage.system as Record<string, unknown>;
            console.log('[Store] Found system:', system);
            
            if (system?.jobs) {
              const systemJobs = system.jobs as Record<string, unknown>;
              console.log('[Store] Found system.jobs:', systemJobs);
              
              // Handle different job arrays from system.jobs
              const jobArrays = [
                { jobs: (systemJobs.pending_jobs as Record<string, unknown>[]) || [], type: 'pending' },
                { jobs: (systemJobs.active_jobs as Record<string, unknown>[]) || [], type: 'active' },
                { jobs: (systemJobs.completed_jobs as Record<string, unknown>[]) || [], type: 'completed' },
                { jobs: (systemJobs.failed_jobs as Record<string, unknown>[]) || [], type: 'failed' }
              ];
              
              // Process all job arrays
              jobArrays.forEach(jobArray => {
                if (Array.isArray(jobArray.jobs)) {
                  console.log('[Store] Processing', jobArray.jobs.length, jobArray.type, 'jobs');
                  jobArray.jobs.forEach((job: Record<string, unknown>) => {
                    addJob({
                      id: (job.id as string) || (job.job_id as string),
                      job_type: (job.job_type as string) || (job.type as string) || 'unknown',
                      status: (job.status as JobStatus) || jobArray.type as JobStatus,
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
              });
            }
            
            // Also handle direct jobs array (fallback for older format)
            const directJobs = statsMessage.jobs as Record<string, unknown>[] | Record<string, Record<string, unknown>>;
            console.log('[Store] Found direct jobs:', directJobs);
            
            if (directJobs) {
              if (Array.isArray(directJobs)) {
                console.log('[Store] Processing', directJobs.length, 'direct jobs as array');
                directJobs.forEach((job: Record<string, unknown>) => {
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
              } else if (typeof directJobs === 'object') {
                console.log('[Store] Processing jobs as object');
                Object.entries(directJobs as Record<string, Record<string, unknown>>).forEach(([jobId, job]) => {
                  addJob({
                    id: jobId,
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
            const jobMessage = message as unknown as Record<string, unknown>;
            if (jobMessage.job_id) {
              updateJob(jobMessage.job_id as string, {
                status: message.type === 'job_assigned' ? 'assigned' as JobStatus :
                        message.type === 'job_progress' ? 'processing' as JobStatus :
                        message.type === 'job_completed' ? 'completed' as JobStatus : 'failed' as JobStatus,
                progress: jobMessage.progress as number,
                worker_id: jobMessage.worker_id as string,
                result: jobMessage.result as unknown,
                error: jobMessage.error as string
              });
            }
            break;
          case 'worker_status':
            const workerMessage = message as unknown as Record<string, unknown>;
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
      const { setConnection, addLog } = get();
      setConnection({ isConnected: false });
      // Clear workers and jobs when manually disconnecting
      set({ workers: [], jobs: [] });
      addLog({
        level: 'info',
        category: 'websocket',
        message: 'Manually disconnected from hub',
        source: 'store',
      });
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

// Note: Auto-connect removed - user must manually connect