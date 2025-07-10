import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { Job, Worker, Machine, WorkerCapabilities, WorkerStatus, JobStatus, JobRequirements, ConnectionState, UIState, LogEntry } from '@/types';
import { SyncJobStateMessage, CancelJobMessage } from '@/types/message';
import { websocketService } from '@/services/websocket';
import type { MonitorEvent } from '@emp/core';
import { throttle } from '@/utils/throttle';
// import { batchUpdates } from '@/utils/throttle'; // Unused but kept for future use

interface MonitorStore {
  // Connection state
  connection: ConnectionState;
  
  // Data
  jobs: Job[];
  workers: Worker[];
  machines: Machine[];
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
  addMachine: (machine: Machine) => void;
  updateMachine: (machineId: string, updates: Partial<Machine>) => void;
  removeMachine: (machineId: string) => void;
  addMachineLog: (machineId: string, log: Omit<Machine['logs'][0], 'id'>) => void;
  addLog: (log: Omit<LogEntry, 'id' | 'timestamp'>) => void;
  clearLogs: () => void;
  setUIState: (updates: Partial<UIState>) => void;
  
  // WebSocket actions
  connect: (url?: string) => void;
  disconnect: () => void;
  submitJob: (jobData: Record<string, unknown>) => void;
  syncJobState: (jobId?: string) => void;
  cancelJob: (jobId: string) => void;
  deleteMachine: (machineId: string) => void;
  
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
    machines: [],
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
      set((state) => {
        // Find the job to update
        const jobIndex = state.jobs.findIndex(job => job.id === jobId);
        if (jobIndex === -1) {
          // Job not found, might have been removed or not yet added
          // This is now handled more gracefully in event handlers
          return state;
        }
        
        const currentJob = state.jobs[jobIndex];
        
        // Prevent status downgrades (completed/failed jobs cannot go back to active states)
        if ((currentJob.status === 'completed' || currentJob.status === 'failed') && 
            updates.status && !['completed', 'failed'].includes(updates.status)) {
          console.log(`[Store] Preventing status downgrade for job ${jobId}: ${currentJob.status} -> ${updates.status}`);
          return state;
        }
        
        // Create new jobs array with atomic update
        const newJobs = [...state.jobs];
        newJobs[jobIndex] = { ...currentJob, ...updates };
        
        return { jobs: newJobs };
      }),
    
    removeJob: (jobId) =>
      set((state) => ({
        jobs: state.jobs.filter((job) => job.id !== jobId),
      })),
    
    // Worker actions
    addWorker: (worker) =>
      set((state) => ({
        workers: [
          ...state.workers.filter((w) => w.worker_id !== worker.worker_id),
          worker,
        ],
      })),
    
    updateWorker: (workerId, updates) =>
      set((state) => {
        // console.log(`updateWorker called for ${workerId} with updates:`, updates);
        // const targetWorker = state.workers.find(w => w.id === workerId);
        // console.log(`Target worker ${workerId}:`, targetWorker ? { id: targetWorker.id, status: targetWorker.status } : 'NOT FOUND');
        const newWorkers = state.workers.map((worker) =>
          worker.worker_id === workerId ? { ...worker, ...updates } : worker
        );
        // const updatedWorker = newWorkers.find(w => w.id === workerId);
        // console.log(`Updated worker ${workerId}:`, updatedWorker ? { id: updatedWorker.id, status: updatedWorker.status } : 'NOT FOUND');
        return { workers: newWorkers };
      }),
    
    removeWorker: (workerId) =>
      set((state) => ({
        workers: state.workers.filter((worker) => worker.worker_id !== workerId),
      })),
    
    // Machine actions
    addMachine: (machine) =>
      set((state) => ({
        machines: [
          ...state.machines.filter((m) => m.machine_id !== machine.machine_id),
          machine,
        ],
      })),
    
    updateMachine: (machineId, updates) =>
      set((state) => ({
        machines: state.machines.map((machine) =>
          machine.machine_id === machineId ? { ...machine, ...updates } : machine
        ),
      })),
    
    removeMachine: (machineId) =>
      set((state) => ({
        machines: state.machines.filter((machine) => machine.machine_id !== machineId),
      })),
    
    addMachineLog: (machineId, log) =>
      set((state) => ({
        machines: state.machines.map((machine) =>
          machine.machine_id === machineId
            ? {
                ...machine,
                logs: [
                  {
                    ...log,
                    id: crypto.randomUUID(),
                  },
                  ...machine.logs,
                ].slice(0, 100), // Keep last 100 logs per machine
              }
            : machine
        ),
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
      const { addLog, addWorker, addJob, addMachine } = get();
      
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
        machines?: unknown[];
        system_stats: Record<string, number>;
      };
      
      // Clear existing data
      set({ workers: [], jobs: [], machines: [] });
      
      // Process workers
      if (stateData.workers) {
        if (Array.isArray(stateData.workers)) {
          // console.log('Full state workers received (array):', stateData.workers.map(w => (w as any).id));
          stateData.workers.forEach((workerData) => {
            const worker = workerData as Record<string, unknown>;
            // console.log(`Processing full state worker: ${worker.id}`);
            const capabilities = (worker.capabilities as WorkerCapabilities) || {
              worker_id: worker.worker_id as string || worker.id as string,
              services: [],
              hardware: {
                gpu_memory_gb: 8,
                gpu_model: 'Unknown',
                ram_gb: 16
              },
              performance: {
                concurrent_jobs: 1,
                quality_levels: ['balanced']
              },
              customer_access: {
                isolation: 'none'
              }
            };
            
            const workerId = worker.worker_id as string || worker.id as string;
            
            addWorker({
              worker_id: workerId,
              status: (worker.status as WorkerStatus) || 'idle',
              capabilities,
              current_jobs: Array.isArray(worker.current_jobs) ? worker.current_jobs as string[] : (worker.current_job_id ? [worker.current_job_id as string] : []),
              connected_at: (worker.connected_at as string) || new Date().toISOString(),
              last_heartbeat: (worker.last_activity as string) || new Date().toISOString(),
              total_jobs_completed: (worker.total_jobs_completed as number) || (worker.jobs_completed as number) || 0,
              total_jobs_failed: (worker.total_jobs_failed as number) || (worker.jobs_failed as number) || 0,
              average_processing_time: (worker.average_processing_time as number) || (worker.total_processing_time as number) || 0,
              uptime: 0
            });
            
          });
        } else if (typeof stateData.workers === 'object') {
          // console.log('Full state workers received (object):', Object.keys(stateData.workers));
          Object.entries(stateData.workers).forEach(([workerId, workerData]) => {
            // console.log(`Processing full state worker: ${workerId}`);
            const worker = workerData as Record<string, unknown>;
            const capabilities = (worker.capabilities as WorkerCapabilities) || {
              worker_id: workerId,
              services: [],
              hardware: {
                gpu_memory_gb: 8,
                gpu_model: 'Unknown',
                ram_gb: 16
              },
              performance: {
                concurrent_jobs: 1,
                quality_levels: ['balanced']
              },
              customer_access: {
                isolation: 'none'
              }
            };
            
            addWorker({
              worker_id: workerId,
              status: (worker.status as WorkerStatus) || 'idle',
              capabilities,
              current_jobs: Array.isArray(worker.current_jobs) ? worker.current_jobs as string[] : (worker.current_job_id ? [worker.current_job_id as string] : []),
              connected_at: (worker.connected_at as string) || new Date().toISOString(),
              last_heartbeat: (worker.last_activity as string) || new Date().toISOString(),
              total_jobs_completed: (worker.total_jobs_completed as number) || (worker.jobs_completed as number) || 0,
              total_jobs_failed: (worker.total_jobs_failed as number) || (worker.jobs_failed as number) || 0,
              average_processing_time: (worker.average_processing_time as number) || (worker.total_processing_time as number) || 0,
              uptime: 0
            });
            
          });
        }
      }
      
      // Process machines
      if (stateData.machines && Array.isArray(stateData.machines)) {
        stateData.machines.forEach((machineData: unknown) => {
          const machine = machineData as {
            machine_id: string;
            workers: string[];
            status: string;
            host_info?: {
              gpu_count?: number;
              total_ram_gb?: number;
            };
          };
          
          addMachine({
            machine_id: machine.machine_id,
            status: machine.status as 'ready' | 'starting' | 'offline',
            workers: machine.workers || [],
            logs: [],
            started_at: new Date().toISOString(),
            last_activity: new Date().toISOString(),
            host_info: machine.host_info
          });
        });
      }
      
      // Process jobs
      if (stateData.jobs) {
        const jobArrays = [
          { jobs: stateData.jobs.pending || [], status: 'pending' as JobStatus },
          { jobs: stateData.jobs.active || [], status: 'active' as JobStatus },
          { jobs: stateData.jobs.completed || [], status: 'completed' as JobStatus },
          { jobs: stateData.jobs.failed || [], status: 'failed' as JobStatus }
        ];
        
        jobArrays.forEach(({ jobs, status }) => {
          if (Array.isArray(jobs)) {
            jobs.forEach((jobData: unknown) => {
              const job = jobData as Record<string, unknown>;
              addJob({
                id: (job.id as string) || (job.job_id as string),
                job_type: (job.job_type as string) || (job.service_required as string) || (job.type as string) || 'unknown',
                status: (job.status as JobStatus) || status,
                priority: (job.priority as number) || 50,
                payload: typeof job.payload === 'string' 
                  ? (() => { try { return JSON.parse(job.payload as string); } catch { return {}; } })()
                  : (job.payload as Record<string, unknown>) || {},
                customer_id: job.customer_id as string,
                requirements: typeof job.requirements === 'string' 
                  ? (() => { try { return JSON.parse(job.requirements as string); } catch { return undefined; } })()
                  : job.requirements as JobRequirements,
                workflow_id: job.workflow_id as string,
                workflow_priority: job.workflow_priority as number,
                workflow_datetime: job.workflow_datetime as number,
                step_number: job.step_number as number,
                created_at: (job.created_at as number) || new Date(job.created_at as string).getTime() || Date.now(),
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
      const { addLog, addWorker, updateWorker, removeWorker, addJob, updateJob, addMachine, updateMachine, addMachineLog } = get();
      
      // Debug logging for machine events
      if (event.type && event.type.startsWith('machine_')) {
        console.log('[Store] Processing machine event:', event.type, event);
      }
      
      // Only log important events, skip progress spam
      if (event.type !== 'update_job_progress' && event.type !== 'heartbeat_ack' && event.type !== 'heartbeat') {
        addLog({
          level: 'debug',
          category: 'event',
          message: `Received event: ${event.type}`,
          data: event,
          source: 'websocket',
        });
      }
      
      switch (event.type) {
        // Machine Events
        case 'machine_startup': {
          const machineEvent = event as {
            type: 'machine_startup';
            machine_id: string;
            phase: 'starting' | 'configuring' | 'ready';
            host_info?: {
              hostname: string;
              ip_address?: string;
              os: string;
              cpu_cores: number;
              total_ram_gb: number;
              gpu_count: number;
              gpu_models?: string[];
            };
            timestamp: number;
          };
          
          const existingMachine = get().machines.find(m => m.machine_id === machineEvent.machine_id);
          
          if (!existingMachine) {
            // Create new machine
            addMachine({
              machine_id: machineEvent.machine_id,
              status: machineEvent.phase === 'ready' ? 'ready' : 'starting',
              workers: [],
              logs: [],
              started_at: new Date().toISOString(),
              last_activity: new Date().toISOString(),
              host_info: machineEvent.host_info
            });
            
            addMachineLog(machineEvent.machine_id, {
              timestamp: new Date().toISOString(),
              level: 'info',
              message: `Machine ${machineEvent.phase}`,
              source: 'system'
            });
          } else {
            // Update existing machine
            updateMachine(machineEvent.machine_id, {
              status: machineEvent.phase === 'ready' ? 'ready' : 'starting',
              last_activity: new Date().toISOString(),
              host_info: machineEvent.host_info || existingMachine.host_info
            });
          }
          break;
        }
        
        case 'machine_startup_step': {
          const stepEvent = event as {
            type: 'machine_startup_step';
            machine_id: string;
            step_name: string;
            step_phase: 'shared_setup' | 'core_infrastructure' | 'ai_services' | 'supporting_services';
            step_data?: Record<string, unknown>;
            elapsed_ms: number;
            timestamp: number;
          };
          
          // Make sure machine exists
          const machine = get().machines.find(m => m.machine_id === stepEvent.machine_id);
          if (!machine) {
            // Create machine if it doesn't exist
            addMachine({
              machine_id: stepEvent.machine_id,
              status: 'starting',
              workers: [],
              logs: [],
              started_at: new Date().toISOString(),
              last_activity: new Date().toISOString()
            });
          }
          
          // Add log for this step
          addMachineLog(stepEvent.machine_id, {
            timestamp: new Date().toISOString(),
            level: 'info',
            message: `${stepEvent.step_name} (${stepEvent.step_phase}) - ${stepEvent.elapsed_ms}ms`,
            source: 'startup'
          });
          break;
        }
        
        case 'machine_startup_complete': {
          const completeEvent = event as {
            type: 'machine_startup_complete';
            machine_id: string;
            total_startup_time_ms: number;
            worker_count: number;
            services_started: string[];
            timestamp: number;
          };
          
          updateMachine(completeEvent.machine_id, {
            status: 'ready',
            last_activity: new Date().toISOString()
          });
          
          addMachineLog(completeEvent.machine_id, {
            timestamp: new Date().toISOString(),
            level: 'info',
            message: `Machine startup complete - ${completeEvent.total_startup_time_ms}ms, ${completeEvent.worker_count} workers, services: ${completeEvent.services_started.join(', ')}`,
            source: 'system'
          });
          break;
        }
        
        case 'machine_shutdown': {
          const shutdownEvent = event as {
            type: 'machine_shutdown';
            machine_id: string;
            reason?: string;
            timestamp: number;
          };
          
          // Find the machine to get its workers
          const machine = get().machines.find(m => m.machine_id === shutdownEvent.machine_id);
          if (machine) {
            // Remove all workers associated with this machine
            const workerIds = machine.workers;
            for (const workerId of workerIds) {
              removeWorker(workerId);
            }
          }
          
          updateMachine(shutdownEvent.machine_id, {
            status: 'offline',
            last_activity: new Date().toISOString(),
            workers: [] // Clear the workers array
          });
          
          addMachineLog(shutdownEvent.machine_id, {
            timestamp: new Date().toISOString(),
            level: 'info',
            message: `Machine shutdown${shutdownEvent.reason ? `: ${shutdownEvent.reason}` : ''}`,
            source: 'system'
          });
          break;
        }
        
        case 'worker_connected': {
          const workerEvent = event as {
            type: 'worker_connected';
            worker_id: string;
            machine_id: string;
            worker_data: {
              id: string;
              status: string;
              capabilities: {
                gpu_count: number;
                gpu_memory_gb: number;
                gpu_model: string;
                cpu_cores: number;
                ram_gb: number;
                services: string[];
                models: string[];
                customer_access: string;
                max_concurrent_jobs: number;
              };
              connected_at: string;
              jobs_completed: number;
              jobs_failed: number;
            };
            timestamp: number;
          };
          // console.log(`worker_connected event for ${workerEvent.worker_id}`);
          const workerData = workerEvent.worker_data;
          
          // Convert old capabilities format to new WorkerCapabilities format
          const capabilities: WorkerCapabilities = {
            worker_id: workerEvent.worker_id,
            services: workerData.capabilities.services || [],
            hardware: {
              gpu_memory_gb: workerData.capabilities.gpu_memory_gb,
              gpu_model: workerData.capabilities.gpu_model,
              ram_gb: workerData.capabilities.ram_gb,
            },
            performance: {
              concurrent_jobs: workerData.capabilities.max_concurrent_jobs || 1,
              quality_levels: ['balanced']
            },
            customer_access: {
              isolation: workerData.capabilities.customer_access === 'strict' ? 'strict' : 
                        workerData.capabilities.customer_access === 'loose' ? 'loose' : 'none'
            }
          };
          
          const worker = {
            worker_id: workerEvent.worker_id,
            status: workerData.status as WorkerStatus,
            capabilities,
            current_jobs: [],
            connected_at: workerData.connected_at,
            last_heartbeat: new Date().toISOString(),
            total_jobs_completed: workerData.jobs_completed || 0,
            total_jobs_failed: workerData.jobs_failed || 0,
            average_processing_time: 0,
            uptime: 0
          };
          
          addWorker(worker);
          
          // Handle machine creation/update
          const machineId = workerEvent.machine_id;
          const currentMachines = get().machines;
          const existingMachine = currentMachines.find(m => m.machine_id === machineId);
          
          if (!existingMachine) {
            // Create new machine
            addMachine({
              machine_id: machineId,
              status: 'ready',
              workers: [worker.worker_id],
              logs: [],
              started_at: new Date().toISOString(),
              last_activity: new Date().toISOString(),
              host_info: {
                gpu_count: workerData.capabilities.gpu_count || 1,
                total_ram_gb: workerData.capabilities.ram_gb,
              }
            });
            
            addMachineLog(machineId, {
              timestamp: new Date().toISOString(),
              level: 'info',
              message: `Machine started with worker ${worker.worker_id}`,
              source: 'system'
            });
          } else {
            // Update existing machine
            const updatedWorkers = [...new Set([...existingMachine.workers, worker.worker_id])];
            updateMachine(machineId, {
              workers: updatedWorkers,
              status: 'ready',
              last_activity: new Date().toISOString(),
            });
            
            addMachineLog(machineId, {
              timestamp: new Date().toISOString(),
              level: 'info',
              message: `Worker ${worker.worker_id} connected`,
              source: 'worker',
              worker_id: worker.worker_id
            });
          }
          break;
        }
        
        case 'connector_status_changed': {
          const connectorEvent = event as {
            type: 'connector_status_changed';
            connector_id: string;
            service_type: string;
            worker_id: string;
            status: 'active' | 'inactive' | 'error';
            service_info?: Record<string, unknown>;
            timestamp: number;
          };
          
          // Update the worker's connector statuses
          const { workers } = get();
          const workerIndex = workers.findIndex(w => w.worker_id === connectorEvent.worker_id);
          
          if (workerIndex !== -1) {
            const updatedWorkers = [...workers];
            const worker = { ...updatedWorkers[workerIndex] };
            
            // Update connector statuses
            if (!worker.connector_statuses) {
              worker.connector_statuses = {};
            }
            worker.connector_statuses[connectorEvent.service_type] = {
              connector_id: connectorEvent.connector_id,
              status: connectorEvent.status,
              service_info: connectorEvent.service_info
            };
            
            updatedWorkers[workerIndex] = worker;
            
            set({ workers: updatedWorkers });
            
            addLog({
              level: 'debug',
              category: 'connector',
              message: `Connector ${connectorEvent.service_type} for worker ${connectorEvent.worker_id}: ${connectorEvent.status}`,
              source: 'websocket',
            });
          }
          break;
        }
        
        case 'worker_disconnected': {
          const workerEvent = event as {
            type: 'worker_disconnected';
            worker_id: string;
            machine_id: string;
            timestamp: number;
          };
          
          // Use machine_id from the event
          const machineId = workerEvent.machine_id;
          
          removeWorker(workerEvent.worker_id);
          
          // Update machine
          const currentMachines = get().machines;
          const machine = currentMachines.find(m => m.machine_id === machineId);
          if (machine) {
            const updatedWorkers = machine.workers.filter(w => w !== workerEvent.worker_id);
            
            if (updatedWorkers.length === 0) {
              // No workers left, mark machine as offline
              updateMachine(machineId, {
                workers: updatedWorkers,
                status: 'offline',
                last_activity: new Date().toISOString(),
              });
            } else {
              // Still has workers
              updateMachine(machineId, {
                workers: updatedWorkers,
                last_activity: new Date().toISOString(),
              });
            }
            
            addMachineLog(machineId, {
              timestamp: new Date().toISOString(),
              level: 'info',
              message: `Worker ${workerEvent.worker_id} disconnected`,
              source: 'worker',
              worker_id: workerEvent.worker_id
            });
          }
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
          const existingWorker = workers.find(w => w.worker_id === workerEvent.worker_id);
          
          if (!existingWorker) {
            // console.log(`Creating new worker ${workerEvent.worker_id} from status change event`);
            addWorker({
              worker_id: workerEvent.worker_id,
              status: workerEvent.new_status as WorkerStatus,
              capabilities: {
                worker_id: workerEvent.worker_id,
                services: [],
                hardware: {
                  gpu_memory_gb: 8,
                  gpu_model: 'Unknown',
                  ram_gb: 16
                },
                performance: {
                  concurrent_jobs: 1,
                  quality_levels: ['balanced']
                },
                customer_access: {
                  isolation: 'none'
                }
              },
              current_jobs: workerEvent.current_job_id ? [workerEvent.current_job_id] : [],
              connected_at: new Date().toISOString(),
              last_heartbeat: new Date().toISOString(),
              total_jobs_completed: 0,
              total_jobs_failed: 0,
              average_processing_time: 0,
              uptime: 0
            });
          } else {
            updateWorker(workerEvent.worker_id, {
              status: workerEvent.new_status as WorkerStatus,
              current_jobs: workerEvent.current_job_id ? [workerEvent.current_job_id] : [],
              last_heartbeat: new Date().toISOString()
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
        
        case 'update_job_progress': {
          const jobEvent = event as {
            type: 'update_job_progress';
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
          
          // Defensive check: ignore progress updates for already completed jobs or non-existent jobs
          const currentJob = get().jobs.find(job => job.id === jobEvent.job_id);
          if (!currentJob) {
            // Job doesn't exist - might be out of order messages or already removed
            // Create a minimal job entry for progress tracking
            addJob({
              id: jobEvent.job_id,
              job_type: 'unknown',
              status: (jobEvent.status as JobStatus) || 'processing',
              priority: 50,
              payload: {},
              customer_id: undefined,
              requirements: undefined,
              workflow_id: undefined,
              workflow_priority: undefined,
              workflow_datetime: undefined,
              step_number: undefined,
              created_at: Date.now(),
              assigned_at: Date.now(),
              started_at: Date.now(),
              completed_at: undefined,
              worker_id: jobEvent.worker_id,
              progress: jobEvent.progress,
              result: undefined,
              error: undefined,
              failure_count: 0,
              progress_message: jobEvent.message,
              current_step: jobEvent.current_step,
              total_steps: jobEvent.total_steps,
              estimated_completion: jobEvent.estimated_completion
            });
            break;
          }
          
          if (currentJob.status === 'completed' || currentJob.status === 'failed') {
            console.log(`[Monitor] Ignoring progress update for already completed job: ${jobEvent.job_id}`);
            break;
          }
          
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
        
        case 'complete_job': {
          const jobEvent = event as {
            type: 'complete_job';
            job_id: string;
            worker_id: string;
            result?: unknown;
            completed_at: number;
            timestamp: number;
          };
          
          // Defensive check: don't override jobs that are already failed or completed
          const currentJob = get().jobs.find(job => job.id === jobEvent.job_id);
          if (currentJob?.status === 'failed') {
            console.log(`[Monitor] Ignoring completion event for already failed job: ${jobEvent.job_id}`);
            break;
          }
          
          // Use direct update for completion events (no throttling needed for final states)
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
        // Clear workers, jobs, and machines when disconnected to get fresh data on reconnect
        set({ workers: [], jobs: [], machines: [] });
        addLog({
          level: 'warn',
          category: 'websocket',
          message: 'Disconnected from hub - cleared stale data',
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
      
      // Clear any stale data before connecting to get fresh state
      set({ workers: [], jobs: [], machines: [] });
      addLog({
        level: 'info',
        category: 'websocket',
        message: 'Cleared stale data before connecting',
        source: 'store',
      });
      
      websocketService.connect();
    },
    
    disconnect: () => {
      websocketService.disconnect();
      const { setConnection, addLog } = get();
      setConnection({ isConnected: false });
      // Clear workers, jobs, and machines when manually disconnecting
      set({ workers: [], jobs: [], machines: [] });
      addLog({
        level: 'info',
        category: 'websocket',
        message: 'Manually disconnected from hub - cleared stale data',
        source: 'store',
      });
    },
    
    deleteMachine: async (machineId: string) => {
      const { addLog } = get();
      try {
        // Get the current WebSocket URL from the websocket service
        const websocketUrl = websocketService.getUrl();
        
        const response = await fetch(`/api/machines/${machineId}`, {
          method: 'DELETE',
          headers: {
            'x-websocket-url': websocketUrl || 'http://localhost:3001',
          },
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }
        
        // Remove from local state
        set(state => ({
          machines: state.machines.filter(m => m.machine_id !== machineId),
        }));
        
        addLog({
          level: 'info',
          category: 'machine',
          message: `Machine ${machineId} deleted successfully`,
          source: 'store',
        });
      } catch (error) {
        addLog({
          level: 'error',
          category: 'machine',
          message: `Failed to delete machine ${machineId}: ${error}`,
          source: 'store',
        });
      }
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
  100, // Update at most every 100ms
  { 
    leading: true,  // Execute immediately on first call
    trailing: true  // Execute after the wait period
  }
);

// Batch worker status updates (unused but kept for future use)
// const batchedWorkerUpdates = batchUpdates<{ workerId: string; updates: Partial<Worker> }>(
//   (updates) => {
//     const store = useMonitorStore.getState();
//     updates.forEach(({ workerId, updates }) => {
//       store.updateWorker(workerId, updates);
//     });
//   },
//   50 // Process batches every 50ms
// );

// Note: Auto-connect removed - user must manually connect