import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { Job, Worker, WorkerCapabilities, WorkerStatus, JobStatus, JobRequirements, ConnectionState, UIState, LogEntry } from '@/types';
import { SyncJobStateMessage, CancelJobMessage } from '@/types/message';
import { websocketService } from '@/services/websocket';
import type { MonitorEvent } from 'emp-redis-js/src/types/monitor-events';
import { throttle, batchUpdates } from '@/utils/throttle';

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
  syncJobState: (jobId?: string) => void;
  cancelJob: (jobId: string) => void;
  
  // Event-driven state management
  handleFullState: (state: unknown) => void;
  handleEvent: (event: MonitorEvent) => void;
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
      set((state) => {
        // Check if job already exists
        const existingJobIndex = state.jobs.findIndex(existingJob => existingJob.id === job.id);
        
        if (existingJobIndex >= 0) {
          // Update existing job instead of adding duplicate
          const updatedJobs = [...state.jobs];
          updatedJobs[existingJobIndex] = { ...updatedJobs[existingJobIndex], ...job };
          return { jobs: updatedJobs };
        } else {
          // Add new job
          return { jobs: [job, ...state.jobs].slice(0, 1000) }; // Keep last 1000 jobs
        }
      }),
    
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
      set((state) => {
        // console.log(`updateWorker called for ${workerId} with updates:`, updates);
        const targetWorker = state.workers.find(w => w.id === workerId);
        // console.log(`Target worker ${workerId}:`, targetWorker ? { id: targetWorker.id, status: targetWorker.status } : 'NOT FOUND');
        const newWorkers = state.workers.map((worker) =>
          worker.id === workerId ? { ...worker, ...updates } : worker
        );
        const updatedWorker = newWorkers.find(w => w.id === workerId);
        // console.log(`Updated worker ${workerId}:`, updatedWorker ? { id: updatedWorker.id, status: updatedWorker.status } : 'NOT FOUND');
        return { workers: newWorkers };
      }),
    
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
    
    // Event-driven state management
    handleFullState: (state: unknown) => {
      const { addLog, addWorker, addJob } = get();
      
      addLog({
        level: 'info',
        category: 'event',
        message: 'Received full state snapshot',
        source: 'store',
      });
      
      const stateData = state as {
        workers: Record<string, unknown>;
        jobs: {
          pending: unknown[];
          active: unknown[];
          completed: unknown[];
          failed: unknown[];
        };
        system_stats: Record<string, number>;
      };
      
      // Clear existing data
      set({ workers: [], jobs: [] });
      
      // Process workers
      if (stateData.workers) {
        if (Array.isArray(stateData.workers)) {
          // console.log('Full state workers received (array):', stateData.workers.map(w => (w as any).id));
          stateData.workers.forEach((workerData) => {
            const worker = workerData as Record<string, unknown>;
            // console.log(`Processing full state worker: ${worker.id}`);
            const capabilities = (worker.capabilities as WorkerCapabilities) || {
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
              id: worker.id as string,
              status: (worker.status as WorkerStatus) || 'idle',
              capabilities,
              current_job_id: worker.current_job_id as string,
              connected_at: (worker.connected_at as string) || new Date().toISOString(),
              last_activity: (worker.last_activity as string) || new Date().toISOString(),
              jobs_completed: (worker.jobs_completed as number) || 0,
              jobs_failed: (worker.jobs_failed as number) || 0,
              total_processing_time: (worker.total_processing_time as number) || 0
            });
          });
        } else if (typeof stateData.workers === 'object') {
          // console.log('Full state workers received (object):', Object.keys(stateData.workers));
          Object.entries(stateData.workers).forEach(([workerId, workerData]) => {
            // console.log(`Processing full state worker: ${workerId}`);
            const worker = workerData as Record<string, unknown>;
            const capabilities = (worker.capabilities as WorkerCapabilities) || {
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
              status: (worker.status as WorkerStatus) || 'idle',
              capabilities,
              current_job_id: worker.current_job_id as string,
              connected_at: (worker.connected_at as string) || new Date().toISOString(),
              last_activity: (worker.last_activity as string) || new Date().toISOString(),
              jobs_completed: (worker.jobs_completed as number) || 0,
              jobs_failed: (worker.jobs_failed as number) || 0,
              total_processing_time: (worker.total_processing_time as number) || 0
            });
          });
        }
      }
      
      // Process jobs
      if (stateData.jobs) {
        const jobArrays = [
          { jobs: stateData.jobs.pending || [], status: 'pending' as JobStatus },
          { jobs: stateData.jobs.active || [], status: 'processing' as JobStatus },
          { jobs: stateData.jobs.completed || [], status: 'completed' as JobStatus },
          { jobs: stateData.jobs.failed || [], status: 'failed' as JobStatus }
        ];
        
        jobArrays.forEach(({ jobs, status }) => {
          if (Array.isArray(jobs)) {
            jobs.forEach((jobData: unknown) => {
              const job = jobData as Record<string, unknown>;
              addJob({
                id: (job.id as string) || (job.job_id as string),
                job_type: (job.job_type as string) || (job.type as string) || 'unknown',
                status: (job.status as JobStatus) || status,
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
    },

    handleEvent: (event: MonitorEvent) => {
      const { addLog, addWorker, updateWorker, removeWorker, addJob, updateJob } = get();
      
      // Only log important events, skip progress spam
      if (event.type !== 'job_progress' && event.type !== 'heartbeat_ack' && event.type !== 'heartbeat') {
        addLog({
          level: 'debug',
          category: 'event',
          message: `Received event: ${event.type}`,
          data: event,
          source: 'websocket',
        });
      }
      
      switch (event.type) {
        case 'worker_connected': {
          const workerEvent = event as {
            type: 'worker_connected';
            worker_id: string;
            worker_data: {
              id: string;
              status: string;
              capabilities: WorkerCapabilities;
              connected_at: string;
              jobs_completed: number;
              jobs_failed: number;
            };
            timestamp: number;
          };
          // console.log(`worker_connected event for ${workerEvent.worker_id}`);
          const workerData = workerEvent.worker_data;
          addWorker({
            id: workerEvent.worker_id,
            status: workerData.status as WorkerStatus,
            capabilities: workerData.capabilities,
            current_job_id: undefined,
            connected_at: workerData.connected_at,
            last_activity: new Date().toISOString(),
            jobs_completed: workerData.jobs_completed || 0,
            jobs_failed: workerData.jobs_failed || 0,
            total_processing_time: 0
          });
          break;
        }
        
        case 'worker_disconnected': {
          const workerEvent = event as {
            type: 'worker_disconnected';
            worker_id: string;
            timestamp: number;
          };
          removeWorker(workerEvent.worker_id);
          break;
        }
        
        case 'worker_status_changed': {
          const workerEvent = event as {
            type: 'worker_status_changed';
            worker_id: string;
            old_status: string;
            new_status: string;
            current_job_id?: string;
            timestamp: number;
          };
          // console.log(`changing card state to ${workerEvent.new_status} for worker ${workerEvent.worker_id}`);
          
          // Check if worker exists, if not create it
          const { workers } = get();
          const existingWorker = workers.find(w => w.id === workerEvent.worker_id);
          
          if (!existingWorker) {
            // console.log(`Creating new worker ${workerEvent.worker_id} from status change event`);
            addWorker({
              id: workerEvent.worker_id,
              status: workerEvent.new_status as WorkerStatus,
              capabilities: {
                gpu_count: 1,
                gpu_memory_gb: 8,
                gpu_model: 'Unknown',
                ram_gb: 16,
                services: [],
                models: [],
                customer_access: 'none',
                max_concurrent_jobs: 1
              },
              current_job_id: workerEvent.current_job_id,
              connected_at: new Date().toISOString(),
              last_activity: new Date().toISOString(),
              jobs_completed: 0,
              jobs_failed: 0,
              total_processing_time: 0
            });
          } else {
            updateWorker(workerEvent.worker_id, {
              status: workerEvent.new_status as WorkerStatus,
              current_job_id: workerEvent.current_job_id,
              last_activity: new Date().toISOString()
            });
          }
          break;
        }
        
        case 'job_submitted': {
          const jobEvent = event as {
            type: 'job_submitted';
            job_id: string;
            job_data: {
              id: string;
              job_type: string;
              priority: number;
              payload?: Record<string, unknown>;
              customer_id?: string;
              requirements?: JobRequirements;
              workflow_id?: string;
              workflow_priority?: number;
              workflow_datetime?: number;
              step_number?: number;
              created_at: number;
            };
            timestamp: number;
          };
          const jobData = jobEvent.job_data;
          addJob({
            id: jobEvent.job_id,
            job_type: jobData.job_type,
            status: 'pending' as JobStatus,
            priority: jobData.priority,
            payload: jobData.payload || {},
            customer_id: jobData.customer_id,
            requirements: jobData.requirements,
            workflow_id: jobData.workflow_id,
            workflow_priority: jobData.workflow_priority,
            workflow_datetime: jobData.workflow_datetime,
            step_number: jobData.step_number,
            created_at: jobData.created_at,
            assigned_at: undefined,
            started_at: undefined,
            completed_at: undefined,
            worker_id: undefined,
            progress: 0,
            result: undefined,
            error: undefined,
            failure_count: 0
          });
          break;
        }
        
        case 'job_assigned': {
          const jobEvent = event as {
            type: 'job_assigned';
            job_id: string;
            worker_id: string;
            assigned_at: number;
            timestamp: number;
          };
          updateJob(jobEvent.job_id, {
            status: 'assigned' as JobStatus,
            worker_id: jobEvent.worker_id,
            assigned_at: jobEvent.assigned_at,
            progress: 0
          });
          break;
        }
        
        case 'job_status_changed': {
          const jobEvent = event as {
            type: 'job_status_changed';
            job_id: string;
            old_status: JobStatus;
            new_status: JobStatus;
            worker_id?: string;
            timestamp: number;
          };
          const updates: Partial<Job> = {
            status: jobEvent.new_status,
            worker_id: jobEvent.worker_id
          };
          
          // Set appropriate timestamp based on new status
          if (jobEvent.new_status === 'processing') {
            updates.started_at = jobEvent.timestamp;
          }
          
          updateJob(jobEvent.job_id, updates);
          break;
        }
        
        case 'job_progress': {
          const jobEvent = event as {
            type: 'job_progress';
            job_id: string;
            worker_id: string;
            progress: number;
            status?: string;
            message?: string;
            current_step?: string;
            total_steps?: number;
            estimated_completion?: string;
            timestamp: number;
          };
          // Use throttled update for progress events
          throttledJobProgressUpdate(jobEvent.job_id, {
            status: (jobEvent.status as JobStatus) || 'processing',
            progress: jobEvent.progress,
            worker_id: jobEvent.worker_id,
            progress_message: jobEvent.message,
            current_step: jobEvent.current_step,
            total_steps: jobEvent.total_steps,
            estimated_completion: jobEvent.estimated_completion
          });
          break;
        }
        
        case 'job_completed': {
          const jobEvent = event as {
            type: 'job_completed';
            job_id: string;
            worker_id: string;
            result?: unknown;
            completed_at: number;
            timestamp: number;
          };
          updateJob(jobEvent.job_id, {
            status: 'completed' as JobStatus,
            worker_id: jobEvent.worker_id,
            result: jobEvent.result,
            completed_at: jobEvent.completed_at,
            progress: 100,
            progress_message: 'Job completed successfully'
          });
          break;
        }
        
        case 'job_failed': {
          const jobEvent = event as {
            type: 'job_failed';
            job_id: string;
            worker_id?: string;
            error: string;
            failed_at: number;
            timestamp: number;
          };
          updateJob(jobEvent.job_id, {
            status: 'failed' as JobStatus,
            worker_id: jobEvent.worker_id,
            error: jobEvent.error,
            failed_at: jobEvent.failed_at,
            progress_message: jobEvent.error
          });
          break;
        }
        
        default:
          // Handle other event types as needed
          break;
      }
    },

    // WebSocket actions
    connect: (url?: string) => {
      const { addLog, setConnection, handleFullState, handleEvent } = get();
      
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
          message: 'Connected to hub and subscribed to events',
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
      
      // Handle full state snapshots
      websocketService.onFullState(handleFullState);
      
      // Handle real-time events
      websocketService.onEvent(handleEvent);
      
      // Handle legacy message types (for backward compatibility)
      websocketService.onMessage((message) => {
        addLog({
          level: 'debug',
          category: 'message',
          message: `Received legacy message: ${message.type}`,
          data: message,
          source: 'websocket',
        });
        
        // Keep some legacy message handling for non-event messages
        // Most message handling is now done through handleEvent
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

    syncJobState: (jobId?: string) => {
      const { addLog } = get();
      
      addLog({
        level: 'info',
        category: 'job',
        message: jobId ? `Syncing job state for: ${jobId}` : 'Syncing all job states',
        source: 'store',
      });
      
      // Send a sync request to the hub to get the latest job state
      const syncMessage: SyncJobStateMessage = {
        type: 'sync_job_state',
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        job_id: jobId
      };
      websocketService.send(syncMessage);
    },

    cancelJob: (jobId: string) => {
      const { addLog, updateJob } = get();
      
      addLog({
        level: 'info',
        category: 'job',
        message: `Cancelling job: ${jobId}`,
        source: 'store',
      });
      
      // Send cancel request to hub
      const cancelMessage: CancelJobMessage = {
        type: 'cancel_job',
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        job_id: jobId
      };
      websocketService.send(cancelMessage);
      
      // Optimistically update the job status to failed
      updateJob(jobId, {
        status: 'failed' as JobStatus,
        error: 'Cancelled by user',
        failed_at: Date.now()
      });
    },
  }))
);

// Create throttled update functions for high-frequency events
const throttledJobProgressUpdate = throttle(
  (jobId: string, updates: Partial<Job>) => {
    useMonitorStore.getState().updateJob(jobId, updates);
  },
  100 // Update at most every 100ms
);

// Batch worker status updates
const batchedWorkerUpdates = batchUpdates<{ workerId: string; updates: Partial<Worker> }>(
  (updates) => {
    const store = useMonitorStore.getState();
    updates.forEach(({ workerId, updates }) => {
      store.updateWorker(workerId, updates);
    });
  },
  50 // Process batches every 50ms
);

// Note: Auto-connect removed - user must manually connect