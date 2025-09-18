import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  Job,
  Worker,
  Machine,
  WorkerCapabilities,
  WorkerStatus,
  JobStatus,
  JobRequirements,
  ConnectionState,
  UIState,
  LogEntry,
} from '@/types';
import { SyncJobStateMessage, CancelJobMessage } from '@/types/message';
import { websocketService } from '@/services/websocket';
import type { MonitorEvent } from '@emp/core/types';
import { throttle } from '@/utils/throttle';
// import { batchUpdates } from '@/utils/throttle'; // Unused but kept for future use

// Unified machine status format interface
interface UnifiedMachineStatus {
  machine_id: string;
  timestamp: number;
  update_type: string;
  structure: {
    gpu_count?: number;
    capabilities?: string[];
    workers?: Record<string, unknown>;
  };
  status: {
    machine?: {
      phase?: string;
      uptime_ms?: number;
    };
    workers?: Record<string, unknown>;
    services?: Record<string, unknown>;
  };
}

// Helper function to process unified machine status format
const processUnifiedMachineStatus = (
  unifiedStatus: UnifiedMachineStatus
): Omit<Machine, 'logs' | 'started_at' | 'last_activity'> => {
  // Extract data from unified machine status structure
  const machineData = unifiedStatus.status?.machine;
  const machinePhase = machineData?.phase || 'offline';
  const servicesData = unifiedStatus.status?.services || {};

  // Get worker IDs from structure (immutable machine definition - what workers SHOULD exist)
  // Structure defines "does it exist", status defines "what's the current state"
  const workerIds = Object.keys(unifiedStatus.structure?.workers || {});

  return {
    machine_id: unifiedStatus.machine_id,
    status: machinePhase as 'ready' | 'starting' | 'offline',
    workers: workerIds,
    services: servicesData as {
      [serviceName: string]: { status: string; health: string; pm2_status: string };
    },
    host_info: {
      gpu_count: unifiedStatus.structure?.gpu_count,
    },
    // Include structure data for creating worker skeletons
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    structure: (unifiedStatus.structure || { gpu_count: 0, capabilities: [], workers: {} }) as any,
  };
};

interface MonitorStore {
  // Connection state
  connection: ConnectionState;

  // Data
  jobs: Job[];
  workers: Worker[];
  machines: Machine[];
  logs: LogEntry[];
  apiVersion: string | null;

  // Pagination state
  finishedJobsPagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };

  // UI state
  ui: UIState;

  // Worker animation state
  blinkingWorkers: Set<string>;

  // Simulation workflow tracking (local orchestration)
  simulationWorkflows: Map<
    string,
    {
      workflow_id: string;
      total_steps: number;
      current_step: number;
      job_type: string;
      priority: number;
      customer_id?: string;
      workflow_priority?: number;
      workflow_datetime?: number;
      requirements?: JobRequirements;
      basePayload: Record<string, unknown>;
      useCpuMode: boolean;
    }
  >;

  // Actions
  setConnection: (state: Partial<ConnectionState>) => void;
  addJob: (job: Job) => void;
  updateJob: (jobId: string, updates: Partial<Job>) => void;
  removeJob: (jobId: string) => void;
  addWorker: (worker: Worker) => void;
  updateWorker: (workerId: string, updates: Partial<Worker>) => void;
  removeWorker: (workerId: string) => void;
  triggerWorkerBlink: (workerId: string) => void;
  clearWorkerBlink: (workerId: string) => void;
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
  refreshMonitor: () => void;
  refreshJobsOnly: () => void;
  submitJob: (jobData: Record<string, unknown>) => void;
  syncJobState: (jobId?: string) => void;
  cancelJob: (jobId: string) => void;
  deleteMachine: (machineId: string) => void;

  // Simulation workflow orchestration
  trackSimulationWorkflow: (
    workflowId: string,
    config: {
      total_steps: number;
      job_type: string;
      priority: number;
      customer_id?: string;
      workflow_priority?: number;
      workflow_datetime?: number;
      requirements?: JobRequirements;
      basePayload: Record<string, unknown>;
      useCpuMode: boolean;
    }
  ) => void;
  submitNextSimulationStep: (workflowId: string) => void;
  removeSimulationWorkflow: (workflowId: string) => void;
  fetchApiVersion: () => Promise<void>;

  // Pagination actions
  setFinishedJobsPagination: (pagination: Partial<MonitorStore['finishedJobsPagination']>) => void;

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
    apiVersion: null,

    finishedJobsPagination: {
      page: 1,
      pageSize: 20,
      totalCount: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    },

    ui: {
      selectedJobId: null,
      selectedWorkerId: null,
      sidebarOpen: false,
      debugMode: false,
      theme: 'system',
    },

    blinkingWorkers: new Set(),

    simulationWorkflows: new Map(),

    // Connection actions
    setConnection: state =>
      set(prev => ({
        connection: { ...prev.connection, ...state },
      })),

    // Job actions
    addJob: job =>
      set(state => {
        // Check if job already exists
        const existingJobIndex = state.jobs.findIndex(existingJob => existingJob.id === job.id);

        if (existingJobIndex >= 0) {
          // Update existing job instead of adding duplicate
          const updatedJobs = [...state.jobs];
          updatedJobs[existingJobIndex] = { ...updatedJobs[existingJobIndex], ...job };
          return { jobs: updatedJobs };
        } else {
          // Debug: Log what's creating jobs
          console.log(`[Store ${new Date().toISOString()}] Adding job:`, {
            job_id: job.id,
            job_type: job.job_type,
            status: job.status,
            worker_id: job.worker_id,
            stack_trace: new Error().stack?.split('\n')[2]?.trim(),
          });

          // Add new job
          return { jobs: [job, ...state.jobs].slice(0, 1000) }; // Keep last 1000 jobs
        }
      }),

    updateJob: (jobId, updates) =>
      set(state => {
        // Find the job to update
        const jobIndex = state.jobs.findIndex(job => job.id === jobId);
        if (jobIndex === -1) {
          // Job not found, might have been removed or not yet added
          // This is now handled more gracefully in event handlers
          console.error(
            `[Store] Prevented update on non-existent job (would have caused error): ${jobId}`,
            {
              attempted_updates: updates,
              available_jobs: state.jobs.map(j => j.id),
            }
          );
          return state;
        }

        const currentJob = state.jobs[jobIndex];

        // Prevent status downgrades (completed/failed jobs cannot go back to active states)
        if (
          (currentJob.status === 'completed' || currentJob.status === 'failed') &&
          updates.status &&
          !['completed', 'failed'].includes(updates.status)
        ) {
          console.error(
            `[Store] Prevented status downgrade for job (would have caused data inconsistency): ${jobId}`,
            {
              current_status: currentJob.status,
              attempted_status: updates.status,
              attempted_updates: updates,
            }
          );
          return state;
        }

        // Create new jobs array with atomic update
        const newJobs = [...state.jobs];

        // Filter out undefined values from updates to preserve existing data
        const filteredUpdates = Object.entries(updates).reduce(
          (acc, [key, value]) => {
            if (value !== undefined) {
              acc[key] = value;
            }
            return acc;
          },
          {} as Record<string, unknown>
        );

        // Debug log for tracking total_steps - only log recent jobs
        const jobTimestamp = currentJob.created_at || 0;
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        if (jobTimestamp > fiveMinutesAgo && currentJob.step_number !== undefined) {
          console.log('[Store] updateJob:', {
            jobId,
            current_total_steps: currentJob.total_steps,
            updates_total_steps: updates.total_steps,
            will_have_total_steps:
              filteredUpdates.total_steps !== undefined
                ? filteredUpdates.total_steps
                : currentJob.total_steps,
          });
        }

        newJobs[jobIndex] = { ...currentJob, ...filteredUpdates };

        return { jobs: newJobs };
      }),

    removeJob: jobId =>
      set(state => ({
        jobs: state.jobs.filter(job => job.id !== jobId),
      })),

    // Worker actions
    addWorker: worker =>
      set(state => ({
        workers: [...state.workers.filter(w => w.worker_id !== worker.worker_id), worker],
      })),

    updateWorker: (workerId, updates) =>
      set(state => {
        // console.log(`updateWorker called for ${workerId} with updates:`, updates);
        // const targetWorker = state.workers.find(w => w.id === workerId);
        // console.log(`Target worker ${workerId}:`, targetWorker ? { id: targetWorker.id, status: targetWorker.status } : 'NOT FOUND');
        const newWorkers = state.workers.map(worker =>
          worker.worker_id === workerId ? { ...worker, ...updates } : worker
        );
        // const updatedWorker = newWorkers.find(w => w.id === workerId);
        // console.log(`Updated worker ${workerId}:`, updatedWorker ? { id: updatedWorker.id, status: updatedWorker.status } : 'NOT FOUND');
        return { workers: newWorkers };
      }),

    removeWorker: workerId =>
      set(state => ({
        workers: state.workers.filter(worker => worker.worker_id !== workerId),
        blinkingWorkers: new Set([...state.blinkingWorkers].filter(id => id !== workerId)),
      })),

    // Worker animation actions
    triggerWorkerBlink: workerId =>
      set(state => {
        console.log(`✨ triggerWorkerBlink called for: ${workerId}`);
        console.log(`📋 Current blinking workers:`, Array.from(state.blinkingWorkers));
        const newBlinking = new Set(state.blinkingWorkers);
        newBlinking.add(workerId);
        console.log(`📋 Updated blinking workers:`, Array.from(newBlinking));

        // Blink will continue until worker status changes to idle
        // No auto-clear timeout - let status changes control the blink

        return { blinkingWorkers: newBlinking };
      }),

    clearWorkerBlink: workerId =>
      set(state => {
        console.log(`🧹 clearWorkerBlink called for: ${workerId}`);
        console.log(`📋 Blinking workers before clear:`, Array.from(state.blinkingWorkers));
        const newBlinking = new Set(state.blinkingWorkers);
        newBlinking.delete(workerId);
        console.log(`📋 Blinking workers after clear:`, Array.from(newBlinking));
        return { blinkingWorkers: newBlinking };
      }),

    // Machine actions
    addMachine: machine =>
      set(state => ({
        machines: [...state.machines.filter(m => m.machine_id !== machine.machine_id), machine],
      })),

    updateMachine: (machineId, updates) =>
      set(state => ({
        machines: state.machines.map(machine =>
          machine.machine_id === machineId ? { ...machine, ...updates } : machine
        ),
      })),

    removeMachine: machineId =>
      set(state => ({
        machines: state.machines.filter(machine => machine.machine_id !== machineId),
      })),

    addMachineLog: (machineId, log) =>
      set(state => ({
        machines: state.machines.map(machine =>
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
    addLog: log =>
      set(state => ({
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
    setUIState: updates =>
      set(state => ({
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
        pagination?: {
          finishedJobs?: {
            page: number;
            pageSize: number;
            totalCount: number;
            hasNextPage: boolean;
            hasPreviousPage: boolean;
          };
        };
      };

      // Clear existing data
      set({ workers: [], jobs: [], machines: [] });

      // Process workers
      if (stateData.workers) {
        if (Array.isArray(stateData.workers)) {
          // console.log('Full state workers received (array):', stateData.workers.map(w => (w as any).id));
          stateData.workers.forEach(workerData => {
            const worker = workerData as Record<string, unknown>;
            // console.log(`Processing full state worker: ${worker.id}`);
            const capabilities = (worker.capabilities as WorkerCapabilities) || {
              worker_id: (worker.worker_id as string) || (worker.id as string),
              services: [],
              hardware: {
                gpu_memory_gb: 8,
                gpu_model: 'Unknown',
                ram_gb: 16,
              },
              performance: {
                concurrent_jobs: 1,
                quality_levels: ['balanced'],
              },
              customer_access: {
                isolation: 'none',
              },
            };

            const workerId = (worker.worker_id as string) || (worker.id as string);

            addWorker({
              worker_id: workerId,
              status: (worker.status as WorkerStatus) || 'idle',
              capabilities,
              current_jobs: Array.isArray(worker.current_jobs)
                ? (worker.current_jobs as string[])
                : worker.current_job_id
                  ? [worker.current_job_id as string]
                  : [],
              connected_at: (worker.connected_at as string) || new Date().toISOString(),
              last_heartbeat: (worker.last_activity as string) || new Date().toISOString(),
              total_jobs_completed:
                (worker.total_jobs_completed as number) || (worker.jobs_completed as number) || 0,
              total_jobs_failed:
                (worker.total_jobs_failed as number) || (worker.jobs_failed as number) || 0,
              average_processing_time:
                (worker.average_processing_time as number) ||
                (worker.total_processing_time as number) ||
                0,
              uptime: 0,
            });
          });
        } else if (typeof stateData.workers === 'object') {
          Object.entries(stateData.workers).forEach(([workerId, workerData]) => {
            const worker = workerData as Record<string, unknown>;
            const capabilities = (worker.capabilities as WorkerCapabilities) || {
              worker_id: workerId,
              services: [],
              hardware: {
                gpu_memory_gb: 8,
                gpu_model: 'Unknown',
                ram_gb: 16,
              },
              performance: {
                concurrent_jobs: 1,
                quality_levels: ['balanced'],
              },
              customer_access: {
                isolation: 'none',
              },
            };

            addWorker({
              worker_id: workerId,
              status: (worker.status as WorkerStatus) || 'idle',
              capabilities,
              current_jobs: Array.isArray(worker.current_jobs)
                ? (worker.current_jobs as string[])
                : worker.current_job_id
                  ? [worker.current_job_id as string]
                  : [],
              connected_at: (worker.connected_at as string) || new Date().toISOString(),
              last_heartbeat: (worker.last_activity as string) || new Date().toISOString(),
              total_jobs_completed:
                (worker.total_jobs_completed as number) || (worker.jobs_completed as number) || 0,
              total_jobs_failed:
                (worker.total_jobs_failed as number) || (worker.jobs_failed as number) || 0,
              average_processing_time:
                (worker.average_processing_time as number) ||
                (worker.total_processing_time as number) ||
                0,
              uptime: 0,
            });
          });
        }
      }

      // Process machines using unified machine status format
      const timestamp = new Date().toISOString();
      console.log(`[Store ${timestamp}] Full state machines data:`, {
        has_machines: !!stateData.machines,
        is_array: Array.isArray(stateData.machines),
        machines_length: Array.isArray(stateData.machines)
          ? stateData.machines.length
          : 'not array',
        machines_data: stateData.machines,
      });

      if (stateData.machines && Array.isArray(stateData.machines)) {
        stateData.machines.forEach((machineData: unknown, index: number) => {
          const machineTimestamp = new Date().toISOString();
          console.log(`[Store ${machineTimestamp}] Processing machine ${index}:`, machineData);
          const unifiedStatus = machineData as UnifiedMachineStatus;
          console.log(
            `[Store ${machineTimestamp}] UnifiedStatus structure workers:`,
            Object.keys(unifiedStatus.structure?.workers || {})
          );
          const processedMachine = processUnifiedMachineStatus(unifiedStatus);
          console.log(
            `[Store ${machineTimestamp}] ProcessedMachine workers:`,
            processedMachine.workers
          );

          addMachine({
            ...processedMachine,
            logs: [],
            started_at: new Date().toISOString(),
            last_activity: new Date().toISOString(),
          });
        });
      }

      // Process jobs
      if (stateData.jobs) {
        const jobArrays = [
          { jobs: stateData.jobs.pending || [], status: 'pending' as JobStatus },
          { jobs: stateData.jobs.active || [], status: 'active' as JobStatus },
          { jobs: stateData.jobs.completed || [], status: 'completed' as JobStatus },
          { jobs: stateData.jobs.failed || [], status: 'failed' as JobStatus },
        ];

        jobArrays.forEach(({ jobs, status }) => {
          if (Array.isArray(jobs)) {
            jobs.forEach((jobData: unknown) => {
              const job = jobData as Record<string, unknown>;

              addJob({
                id: (job.id as string) || (job.job_id as string),
                job_type:
                  (job.job_type as string) ||
                  (job.service_required as string) ||
                  (job.type as string) ||
                  'unknown',
                status: (job.status as JobStatus) || status,
                priority: (job.priority as number) || 50,
                payload:
                  typeof job.payload === 'string'
                    ? (() => {
                        try {
                          return JSON.parse(job.payload as string);
                        } catch {
                          return {};
                        }
                      })()
                    : (job.payload as Record<string, unknown>) || {},
                customer_id: job.customer_id as string,
                requirements:
                  typeof job.requirements === 'string'
                    ? (() => {
                        try {
                          return JSON.parse(job.requirements as string);
                        } catch {
                          return undefined;
                        }
                      })()
                    : (job.requirements as JobRequirements),
                workflow_id: job.workflow_id as string,
                workflow_priority: job.workflow_priority as number,
                workflow_datetime: job.workflow_datetime as number,
                step_number: job.step_number as number,
                total_steps: job.total_steps as number,
                created_at:
                  (job.created_at as number) ||
                  new Date(job.created_at as string).getTime() ||
                  Date.now(),
                assigned_at: job.assigned_at as number,
                started_at: job.started_at as number,
                completed_at: job.completed_at as number,
                worker_id: job.worker_id as string,
                progress: job.progress as number,
                result: job.result as unknown,
                error: job.error as string,
                failure_count: (job.failure_count as number) || 0,
              });
            });
          }
        });
      }

      // Update pagination information
      if (stateData.pagination?.finishedJobs) {
        const { setFinishedJobsPagination } = get();
        console.log(
          `[Store ${new Date().toISOString()}] Updating pagination:`,
          stateData.pagination.finishedJobs
        );
        setFinishedJobsPagination(stateData.pagination.finishedJobs);
      } else {
        console.log(
          `[Store ${new Date().toISOString()}] No pagination data found in state:`,
          stateData.pagination
        );
      }

      // Note: Connector status reconciliation disabled for now - relies on real-time events
    },

    handleEvent: (event: MonitorEvent) => {
      const {
        addLog,
        addWorker,
        updateWorker,
        removeWorker,
        addJob,
        updateJob,
        addMachine,
        updateMachine,
        addMachineLog,
      } = get();

      // Debug logging for machine events
      if (event.type && event.type.startsWith('machine_')) {
        console.log(
          `[Store ${new Date().toISOString()}] Processing machine event:`,
          event.type,
          event
        );
      }

      // Only log important events, skip progress spam
      if (event.type !== 'update_job_progress') {
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
        // IMPORTANT: Only specific startup events should bring a machine from offline to online.
        // Worker connections or other events during shutdown grace period should NOT make machine appear online.
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

          const existingMachine = get().machines.find(
            m => m.machine_id === machineEvent.machine_id
          );

          if (!existingMachine) {
            // Create new machine
            addMachine({
              machine_id: machineEvent.machine_id,
              status: machineEvent.phase === 'ready' ? 'ready' : 'starting',
              workers: [],
              logs: [],
              started_at: new Date().toISOString(),
              last_activity: new Date().toISOString(),
              host_info: machineEvent.host_info,
            });

            addMachineLog(machineEvent.machine_id, {
              timestamp: new Date().toISOString(),
              level: 'info',
              message: `Machine ${machineEvent.phase}`,
              source: 'system',
            });
          } else {
            // Update existing machine
            updateMachine(machineEvent.machine_id, {
              status: machineEvent.phase === 'ready' ? 'ready' : 'starting',
              last_activity: new Date().toISOString(),
              host_info: machineEvent.host_info || existingMachine.host_info,
            });
          }
          break;
        }

        case 'machine_startup_step': {
          const stepEvent = event as {
            type: 'machine_startup_step';
            machine_id: string;
            step_name: string;
            step_phase:
              | 'shared_setup'
              | 'core_infrastructure'
              | 'ai_services'
              | 'supporting_services';
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
              last_activity: new Date().toISOString(),
            });
          }

          // Add log for this step
          addMachineLog(stepEvent.machine_id, {
            timestamp: new Date().toISOString(),
            level: 'info',
            message: `${stepEvent.step_name} (${stepEvent.step_phase}) - ${stepEvent.elapsed_ms}ms`,
            source: 'startup',
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
            last_activity: new Date().toISOString(),
          });

          addMachineLog(completeEvent.machine_id, {
            timestamp: new Date().toISOString(),
            level: 'info',
            message: `Machine startup complete - ${completeEvent.total_startup_time_ms}ms, ${completeEvent.worker_count} workers, services: ${completeEvent.services_started.join(', ')}`,
            source: 'system',
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
            workers: [], // Clear the workers array
          });

          addMachineLog(shutdownEvent.machine_id, {
            timestamp: new Date().toISOString(),
            level: 'info',
            message: `Machine shutdown${shutdownEvent.reason ? `: ${shutdownEvent.reason}` : ''}`,
            source: 'system',
          });
          break;
        }

        case 'machine_disconnected': {
          const disconnectedEvent = event as {
            type: 'machine_disconnected';
            machine_id: string;
            reason?: string;
            timestamp: number;
          };

          // Find the machine to get its workers
          const machine = get().machines.find(m => m.machine_id === disconnectedEvent.machine_id);
          if (machine) {
            // Remove all workers associated with this machine
            const workerIds = machine.workers;
            for (const workerId of workerIds) {
              removeWorker(workerId);
            }
          }

          updateMachine(disconnectedEvent.machine_id, {
            status: 'offline',
            last_activity: new Date().toISOString(),
            workers: [], // Clear the workers array
          });

          addMachineLog(disconnectedEvent.machine_id, {
            timestamp: new Date().toISOString(),
            level: 'warn',
            message: `Machine disconnected${disconnectedEvent.reason ? `: ${disconnectedEvent.reason}` : ''}`,
            source: 'system',
          });
          break;
        }

        case 'machine_update': {
          const updateEvent = event as {
            type: 'machine_update';
            machine_id: string;
            structure: {
              gpu_count?: number;
              capabilities?: string[];
              workers?: Record<string, unknown>;
            };
            status_data: {
              machine?: {
                phase?: string;
                uptime_ms?: number;
              };
              workers?: Record<string, unknown>;
              services?: Record<string, unknown>;
            };
            timestamp: number;
          };

          console.log(
            `[Store ${new Date().toISOString()}] Processing machine_update event:`,
            updateEvent
          );

          // Defensive checks to prevent errors
          if (!updateEvent.machine_id || !updateEvent.structure || !updateEvent.status_data) {
            console.error(
              '[Store] Invalid machine_update event - missing required fields (would have caused error):',
              {
                machine_id: updateEvent.machine_id,
                structure: updateEvent.structure,
                status_data: updateEvent.status_data,
                full_event: updateEvent,
              }
            );
            break;
          }

          // Extract machine data from separated structure and status_data
          const machineData = updateEvent.status_data.machine;
          const machineStatus = machineData?.phase || 'offline'; // phase is the actual field
          const workerIds = Object.keys(updateEvent.structure?.workers || {}); // workers definition is in structure
          const hostInfo = updateEvent.structure; // structure contains host info like gpu_count
          const servicesData = updateEvent.status_data?.services || {}; // services data

          const existingMachine = get().machines.find(m => m.machine_id === updateEvent.machine_id);

          if (!existingMachine) {
            // Create new machine with defensive defaults
            addMachine({
              machine_id: updateEvent.machine_id,
              status: machineStatus as 'ready' | 'starting' | 'offline',
              workers: workerIds,
              logs: [],
              started_at: new Date().toISOString(),
              last_activity: new Date().toISOString(),
              host_info: hostInfo
                ? {
                    gpu_count: (hostInfo as { gpu_count?: number }).gpu_count,
                    // Add other host info fields as needed
                  }
                : undefined,
              services: servicesData as {
                [serviceName: string]: { status: string; health: string; pm2_status: string };
              },
            });
          } else {
            // Update existing machine with defensive defaults
            updateMachine(updateEvent.machine_id, {
              status: machineStatus as 'ready' | 'starting' | 'offline',
              workers: workerIds,
              last_activity: new Date().toISOString(),
              host_info: hostInfo
                ? {
                    gpu_count: (hostInfo as { gpu_count?: number }).gpu_count,
                    // Add other host info fields as needed
                  }
                : existingMachine.host_info,
              services: servicesData as {
                [serviceName: string]: { status: string; health: string; pm2_status: string };
              },
            });
          }

          // Update workers' connector_statuses based on services data
          if (servicesData && updateEvent.status_data?.workers) {
            const { updateWorker } = get();

            // Iterate through each worker in the status
            Object.entries(updateEvent.status_data.workers).forEach(([workerId]) => {
              const connectorStatuses: Record<
                string,
                {
                  connector_id: string;
                  status: 'active' | 'inactive' | 'error' | 'waiting_for_service' | 'connecting';
                  error_message?: string;
                }
              > = {};

              // Find all services for this worker
              Object.entries(servicesData).forEach(([serviceName, serviceStatus]) => {
                const status = serviceStatus as {
                  status: string;
                  health: string;
                  pm2_status: string;
                };
                if (serviceName.startsWith(workerId + '.')) {
                  const service = serviceName.split('.')[1];

                  // Map service status to connector status
                  let connectorStatus:
                    | 'active'
                    | 'inactive'
                    | 'error'
                    | 'waiting_for_service'
                    | 'connecting' = 'inactive';
                  if (status.status === 'active' && status.health === 'healthy') {
                    connectorStatus = 'inactive'; // Shows blue in SimpleWorkerCard
                  } else if (status.status === 'active' && status.health === 'unhealthy') {
                    connectorStatus = 'error';
                  } else if (status.status === 'unknown') {
                    connectorStatus = 'waiting_for_service'; // Shows yellow
                  }

                  connectorStatuses[service] = {
                    connector_id: serviceName,
                    status: connectorStatus,
                  };
                }
              });

              // Update the worker with connector statuses
              updateWorker(workerId, {
                connector_statuses: connectorStatuses,
              });
            });
          }

          // Create/update workers using separated structure and status_data
          const structureData = updateEvent.structure; // Now directly from structure
          const statusData = updateEvent.status_data; // Now directly from status_data

          console.log(
            `[Store ${new Date().toISOString()}] Processing workers from machine_update:`,
            {
              hasStructureWorkers: !!structureData?.workers,
              hasStatusWorkers: !!statusData?.workers,
              structureWorkerIds: structureData?.workers ? Object.keys(structureData.workers) : [],
              statusWorkerIds: statusData?.workers ? Object.keys(statusData.workers) : [],
            }
          );

          if (structureData?.workers && statusData?.workers) {
            const { addWorker, updateWorker } = get();
            const structureWorkers = structureData.workers as Record<
              string,
              {
                worker_id: string;
                gpu_id: number;
                services: string[];
              }
            >;
            const statusWorkers = statusData.workers as Record<
              string,
              {
                is_connected: boolean;
                status: string;
                current_job_id: string | null;
                last_activity: number | null;
                version?: string;
                build_timestamp?: number;
                build_info?: string;
              }
            >;

            Object.entries(structureWorkers).forEach(([workerId, structureInfo]) => {
              const statusInfo = statusWorkers[workerId];
              const existingWorker = get().workers.find(w => w.worker_id === workerId);

              console.log(`[Store ${new Date().toISOString()}] Processing worker ${workerId}:`, {
                statusVersion: statusInfo?.version,
                existingWorker: !!existingWorker,
                structureInfo: structureInfo,
                statusInfo: statusInfo,
                current_job_id: statusInfo?.current_job_id,
                worker_status: statusInfo?.status,
              });

              // Create capabilities object with version from status (not structure)
              const capabilities: WorkerCapabilities = {
                worker_id: workerId,
                machine_id: updateEvent.machine_id,
                services: structureInfo.services || [],
                hardware: {
                  gpu_memory_gb: 8, // Default values
                  gpu_model: 'unknown',
                  ram_gb: 8,
                },
                performance: {
                  concurrent_jobs: 1,
                  quality_levels: ['balanced'],
                },
                customer_access: {
                  isolation: 'loose',
                },
                metadata: {
                  version: statusInfo?.version || null, // Version from status data
                  node_version: 'unknown',
                  platform: 'unknown',
                  arch: 'unknown',
                },
              };

              if (!existingWorker) {
                // Create new worker with version info from status
                const newWorker = {
                  worker_id: workerId,
                  status: (statusInfo?.status as WorkerStatus) || 'unknown',
                  capabilities,
                  current_jobs: statusInfo?.current_job_id ? [statusInfo.current_job_id] : [],
                  connected_at: new Date().toISOString(),
                  last_heartbeat:
                    statusInfo?.last_activity && typeof statusInfo.last_activity === 'number'
                      ? new Date(statusInfo.last_activity).toISOString()
                      : new Date().toISOString(),
                  total_jobs_completed: 0,
                  total_jobs_failed: 0,
                  average_processing_time: 0, // Required fields
                  uptime: 0,
                };
                console.log(
                  `[Store ${new Date().toISOString()}] Creating new worker ${workerId} with version:`,
                  {
                    version: newWorker.capabilities.metadata?.version,
                    fullCapabilities: newWorker.capabilities,
                  }
                );
                addWorker(newWorker);
              } else {
                // Update existing worker with version info from status
                const updates = {
                  status: (statusInfo?.status as WorkerStatus) || existingWorker.status,
                  capabilities: {
                    ...existingWorker.capabilities,
                    metadata: {
                      ...existingWorker.capabilities.metadata,
                      version: statusInfo?.version || existingWorker.capabilities.metadata?.version,
                    },
                  },
                  current_jobs: statusInfo?.current_job_id ? [statusInfo.current_job_id] : [],
                  last_heartbeat:
                    statusInfo?.last_activity && typeof statusInfo.last_activity === 'number'
                      ? new Date(statusInfo.last_activity).toISOString()
                      : existingWorker.last_heartbeat,
                };
                console.log(`[Store] Updating existing worker ${workerId} with version:`, {
                  version: updates.capabilities.metadata?.version,
                  fullCapabilities: updates.capabilities,
                });
                updateWorker(workerId, updates);
              }
            });

            // Log current worker state after processing
            const currentWorkers = get().workers;
            console.log(
              `[Store ${new Date().toISOString()}] Current workers after machine_update processing:`,
              currentWorkers.map(w => ({
                worker_id: w.worker_id,
                status: w.status,
                version: w.capabilities?.metadata?.version,
                hasMetadata: !!w.capabilities?.metadata,
              }))
            );
          }

          break;
        }

        case 'machine_status_change': {
          const statusEvent = event as {
            type: 'machine_status_change';
            machine_id: string;
            structure: {
              gpu_count?: number;
              capabilities?: string[];
              workers?: Record<string, unknown>;
            };
            status_data: {
              machine?: {
                phase?: string;
                uptime_ms?: number;
              };
              workers?: Record<string, unknown>;
              services?: Record<string, unknown>;
            };
            timestamp: number;
          };

          // Create unified status format for backward compatibility
          const unifiedStatus: UnifiedMachineStatus = {
            machine_id: statusEvent.machine_id,
            timestamp: statusEvent.timestamp,
            update_type: 'event_driven',
            structure: statusEvent.structure || {},
            status: statusEvent.status_data || {},
          };

          console.log('[Store] Processing machine_status_change event:', statusEvent);

          // Defensive checks to prevent corrupted data
          if (!statusEvent.machine_id || !statusEvent.structure || !statusEvent.status_data) {
            console.error(
              '[Store] Invalid machine_status_change event - missing required fields:',
              {
                machine_id: statusEvent.machine_id,
                structure: statusEvent.structure,
                status_data: statusEvent.status_data,
                full_event: statusEvent,
              }
            );
            break;
          }

          // Validate data structures
          if (
            typeof statusEvent.structure !== 'object' ||
            typeof statusEvent.status_data !== 'object'
          ) {
            console.error(
              '[Store] Invalid machine_status_change event - structure/status_data is not an object:',
              {
                structure_type: typeof statusEvent.structure,
                status_data_type: typeof statusEvent.status_data,
                full_event: statusEvent,
              }
            );
            break;
          }

          const existingMachine = get().machines.find(m => m.machine_id === statusEvent.machine_id);
          const processedMachine = processUnifiedMachineStatus(unifiedStatus);

          if (!existingMachine) {
            // Create new machine
            addMachine({
              ...processedMachine,
              logs: [],
              started_at: new Date().toISOString(),
              last_activity: new Date().toISOString(),
            });
          } else {
            // Update existing machine
            updateMachine(statusEvent.machine_id, {
              ...processedMachine,
              last_activity: new Date().toISOString(),
              host_info: processedMachine.host_info || existingMachine.host_info,
            });
          }
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
          const workerData = workerEvent.worker_data;

          // Convert old capabilities format to new WorkerCapabilities format
          console.log(
            `🔍 DEBUG: Received worker_connected for ${workerEvent.worker_id} with services:`,
            workerData.capabilities.services
          );
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
              quality_levels: ['balanced'],
            },
            customer_access: {
              isolation:
                workerData.capabilities.customer_access === 'strict'
                  ? 'strict'
                  : workerData.capabilities.customer_access === 'loose'
                    ? 'loose'
                    : 'none',
            },
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
            uptime: 0,
            connector_statuses: {},
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
              },
            });

            addMachineLog(machineId, {
              timestamp: new Date().toISOString(),
              level: 'info',
              message: `Machine started with worker ${worker.worker_id}`,
              source: 'system',
            });
          } else {
            // Update existing machine
            const updatedWorkers = [...new Set([...existingMachine.workers, worker.worker_id])];
            updateMachine(machineId, {
              workers: updatedWorkers,
              // Worker connection indicates machine is ready
              // If a worker can connect, the machine is operational
              status: 'ready',
              last_activity: new Date().toISOString(),
            });

            addMachineLog(machineId, {
              timestamp: new Date().toISOString(),
              level: 'info',
              message: `Worker ${worker.worker_id} connected`,
              source: 'worker',
              worker_id: worker.worker_id,
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
            machine_id?: string;
            status: 'active' | 'inactive' | 'error' | 'waiting_for_service' | 'connecting';
            error_message?: string;
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
              error_message: connectorEvent.error_message,
              service_info: connectorEvent.service_info,
            };

            updatedWorkers[workerIndex] = worker;

            set({ workers: updatedWorkers });

            addLog({
              level: 'debug',
              category: 'connector',
              message: `Connector ${connectorEvent.service_type} for worker ${connectorEvent.worker_id}: ${connectorEvent.status}${connectorEvent.error_message ? ` (${connectorEvent.error_message})` : ''}`,
              source: 'websocket',
            });
          } else {
            addLog({
              level: 'warn',
              category: 'connector',
              message: `Worker ${connectorEvent.worker_id} not found for connector ${connectorEvent.service_type} status update`,
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
              worker_id: workerEvent.worker_id,
            });
          }
          break;
        }

        case 'worker_status_changed': {
          const workerEvent = event as {
            type: 'worker_status_changed';
            worker_id: string;
            machine_id?: string;
            status: 'idle' | 'busy' | 'offline' | 'error';
            capabilities: WorkerCapabilities;
            timestamp: number;
            // Legacy fields for backward compatibility
            old_status?: string;
            new_status?: string;
            current_job_id?: string;
          };

          // Use new format if available, fall back to legacy format
          const status: WorkerStatus = (workerEvent.status ||
            workerEvent.new_status ||
            'idle') as WorkerStatus;

          // Check if worker exists, if not create it
          const { workers } = get();
          const existingWorker = workers.find(w => w.worker_id === workerEvent.worker_id);

          if (!existingWorker) {
            // Create new worker with full capabilities from event
            addWorker({
              worker_id: workerEvent.worker_id,
              status: status,
              capabilities: workerEvent.capabilities || {
                worker_id: workerEvent.worker_id,
                services: [],
                hardware: {
                  gpu_memory_gb: 8,
                  gpu_model: 'Unknown',
                  ram_gb: 16,
                },
                performance: {
                  concurrent_jobs: 1,
                  quality_levels: ['balanced'],
                },
                customer_access: {
                  isolation: 'none',
                },
              },
              current_jobs: workerEvent.current_job_id ? [workerEvent.current_job_id] : [],
              connected_at: new Date().toISOString(),
              last_heartbeat: new Date().toISOString(),
              total_jobs_completed: 0,
              total_jobs_failed: 0,
              average_processing_time: 0,
              uptime: 0,
            });
          } else {
            // Update existing worker
            updateWorker(workerEvent.worker_id, {
              status: status,
              capabilities: workerEvent.capabilities || existingWorker.capabilities,
              current_jobs: workerEvent.current_job_id ? [workerEvent.current_job_id] : [],
              last_heartbeat: new Date().toISOString(),
            });

            // Trigger blink animation when worker status changes to busy, stop when idle
            console.log(`🔍 Worker ${workerEvent.worker_id} status change: ${status}`);
            if (status === 'busy') {
              console.log(`⚡ Triggering blink for worker: ${workerEvent.worker_id}`);
              get().triggerWorkerBlink(workerEvent.worker_id);
            } else if (status === 'idle') {
              console.log(`🛑 Stopping blink for worker: ${workerEvent.worker_id}`);
              get().clearWorkerBlink(workerEvent.worker_id);
            }
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
              total_steps?: number;
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
            total_steps: jobData.total_steps,
            created_at: jobData.created_at,
            assigned_at: undefined,
            started_at: undefined,
            completed_at: undefined,
            worker_id: undefined,
            progress: 0,
            result: undefined,
            error: undefined,
            failure_count: 0,
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
            progress: 0,
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
            worker_id: jobEvent.worker_id,
          };

          // Set appropriate timestamp based on new status
          if (jobEvent.new_status === 'in_progress') {
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
              estimated_completion: jobEvent.estimated_completion,
            });
            break;
          }

          if (currentJob.status === 'completed' || currentJob.status === 'failed') {
            console.error(
              `[Monitor] Prevented progress update on already completed job (would have caused data inconsistency): ${jobEvent.job_id}`,
              {
                current_status: currentJob.status,
                attempted_progress: jobEvent.progress,
                attempted_event: jobEvent,
              }
            );
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
            estimated_completion: jobEvent.estimated_completion,
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
            console.error(
              `[Monitor] Prevented completion event overriding already failed job (would have caused data inconsistency): ${jobEvent.job_id}`,
              {
                current_status: currentJob.status,
                attempted_event: jobEvent,
              }
            );
            break;
          }

          // Prevent duplicate completion events
          if (currentJob?.status === 'completed') {
            console.log(
              `[WORKFLOW] Job ${jobEvent.job_id} already completed, skipping duplicate completion event`
            );
            break;
          }

          // Use direct update for completion events (no throttling needed for final states)
          // Preserve existing total_steps and other workflow info when marking as completed
          const currentJobData = get().jobs.find(job => job.id === jobEvent.job_id);

          // Debug logging for total_steps preservation
          if (jobEvent.job_id.includes('d860fb0a') || currentJobData?.total_steps !== undefined) {
            console.log('[Store] complete_job - preserving total_steps:', {
              jobId: jobEvent.job_id,
              currentJobData_exists: !!currentJobData,
              currentJobData_total_steps: currentJobData?.total_steps,
              will_update_with: {
                total_steps: currentJobData?.total_steps,
                step_number: currentJobData?.step_number,
              },
            });
          }

          updateJob(jobEvent.job_id, {
            status: 'completed' as JobStatus,
            worker_id: jobEvent.worker_id,
            result: jobEvent.result,
            completed_at: jobEvent.completed_at,
            progress: 100,
            progress_message: 'Job completed successfully',
            // Preserve existing workflow-related fields - only include if they exist
            ...(currentJobData?.total_steps !== undefined && {
              total_steps: currentJobData.total_steps,
            }),
            ...(currentJobData?.step_number !== undefined && {
              step_number: currentJobData.step_number,
            }),
            ...(currentJobData?.workflow_id !== undefined && {
              workflow_id: currentJobData.workflow_id,
            }),
            ...(currentJobData?.workflow_priority !== undefined && {
              workflow_priority: currentJobData.workflow_priority,
            }),
            ...(currentJobData?.workflow_datetime !== undefined && {
              workflow_datetime: currentJobData.workflow_datetime,
            }),
          });

          // Check if this is a simulation job that's part of a tracked workflow
          const completedJob = get().jobs.find(job => job.id === jobEvent.job_id);

          if (completedJob?.workflow_id) {
            const allWorkflowJobs = get().jobs.filter(
              job => job.workflow_id === completedJob.workflow_id
            );
            const completedJobWorkflowId = completedJob.workflow_id;

            console.log(`[WORKFLOW] Job completion detected: ${jobEvent.job_id}`);
            console.log(`[WORKFLOW] - Workflow ID: ${completedJob.workflow_id}`);
            console.log(
              `[WORKFLOW] - Step: ${completedJob.step_number}, Total Steps: ${completedJob.total_steps}`
            );
            console.log(`[WORKFLOW] - All workflow jobs count: ${allWorkflowJobs.length}`);
            console.log(
              `[WORKFLOW] - Job statuses: ${allWorkflowJobs.map(j => `${j.step_number}:${j.status}`).join(', ')}`
            );
            console.log(
              `[WORKFLOW] - Is tracked: ${get().simulationWorkflows.has(completedJobWorkflowId)}`
            );

            // Check if total_steps is missing and try to get it from tracked workflow
            let totalSteps = completedJob?.total_steps;
            if (!totalSteps && completedJob?.workflow_id) {
              const trackedWorkflow = get().simulationWorkflows.get(completedJob.workflow_id);
              if (trackedWorkflow) {
                totalSteps = trackedWorkflow.total_steps;
                console.log(
                  `[WORKFLOW] Retrieved total_steps from tracked workflow: ${totalSteps}`
                );
              }
            }

            if (
              completedJob &&
              completedJob.job_type === 'simulation' &&
              completedJob.workflow_id &&
              completedJob.step_number &&
              totalSteps &&
              get().simulationWorkflows.has(completedJob.workflow_id)
            ) {
              console.log(
                `[WORKFLOW] Triggering auto-progression for workflow ${completedJob.workflow_id}, step ${completedJob.step_number}/${totalSteps}`
              );

              // Auto-submit the next step in the workflow
              get().submitNextSimulationStep(completedJob.workflow_id);
            } else {
              console.log(`[WORKFLOW] Skipping auto-progression - missing requirements`);
            }
          }

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
            progress_message: jobEvent.error,
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
        setConnection({ isConnected: true, isReconnecting: false, error: undefined });
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

      websocketService.onConnectionFailed((reason: string) => {
        setConnection({ isConnected: false, error: reason });
        addLog({
          level: 'error',
          category: 'websocket',
          message: `Connection failed: ${reason}`,
          source: 'websocket',
        });
      });

      // Handle full state snapshots
      websocketService.onFullState(handleFullState);

      // Handle real-time events
      websocketService.onEvent(handleEvent);

      // Handle legacy message types (for backward compatibility)
      websocketService.onMessage(message => {
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

    refreshMonitor: () => {
      const { addLog, finishedJobsPagination } = get();
      addLog({
        level: 'info',
        category: 'websocket',
        message: 'Refreshing monitor state - requesting full state sync',
        source: 'store',
      });
      websocketService.refreshMonitorState({
        finishedJobsPagination: {
          page: finishedJobsPagination.page,
          pageSize: finishedJobsPagination.pageSize,
        },
      });
    },

    refreshJobsOnly: () => {
      const { addLog } = get();
      addLog({
        level: 'info',
        category: 'websocket',
        message: 'Refreshing jobs only - pagination change, preserving worker/machine state',
        source: 'store',
      });
      // For pagination changes, we don't need to request full state
      // The server will automatically send updated job data based on pagination state
      // This preserves worker status and version data that came from real-time events
    },

    deleteMachine: async (machineId: string) => {
      const { addLog } = get();
      try {
        // Get the current WebSocket URL from the websocket service
        const websocketUrl = websocketService.getUrl();

        const response = await fetch(`/api/machines/${machineId}`, {
          method: 'DELETE',
          headers: {
            'x-websocket-url': websocketUrl || 'http://localhost:3331',
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

    fetchApiVersion: async () => {
      try {
        // Get the current WebSocket URL from the websocket service to derive API URL
        const websocketUrl = websocketService.getUrl();

        // Convert WebSocket URL to HTTP URL for the API
        let apiBaseUrl = 'http://localhost:3331';
        if (websocketUrl) {
          const url = new URL(websocketUrl);
          apiBaseUrl = `${url.protocol === 'wss:' ? 'https:' : 'http:'}//${url.host}`;
        }

        const response = await fetch(`${apiBaseUrl}/version`);

        if (!response.ok) {
          console.warn(`Failed to fetch API version: ${response.status}`);
          return;
        }

        const versionData = await response.json();

        set(state => ({
          ...state,
          apiVersion: versionData.api_version || 'unknown',
        }));
      } catch (error) {
        console.warn('Failed to fetch API version:', error);
        set(state => ({
          ...state,
          apiVersion: 'unavailable',
        }));
      }
    },

    // Pagination actions
    setFinishedJobsPagination: pagination =>
      set(state => ({
        finishedJobsPagination: { ...state.finishedJobsPagination, ...pagination },
      })),

    submitJob: jobData => {
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
        job_id: jobId,
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
        job_id: jobId,
      };
      websocketService.send(cancelMessage);

      // Optimistically update the job status to failed
      updateJob(jobId, {
        status: 'failed' as JobStatus,
        error: 'Cancelled by user',
        failed_at: Date.now(),
      });
    },

    // Simulation workflow orchestration
    trackSimulationWorkflow: (workflowId, config) =>
      set(state => {
        const newWorkflows = new Map(state.simulationWorkflows);
        newWorkflows.set(workflowId, {
          workflow_id: workflowId,
          current_step: 1,
          ...config,
        });
        return { simulationWorkflows: newWorkflows };
      }),

    submitNextSimulationStep: workflowId => {
      const state = get();
      const workflow = state.simulationWorkflows.get(workflowId);

      if (!workflow) {
        console.warn(`No simulation workflow found with ID: ${workflowId}`);
        return;
      }

      // Get ALL workflow jobs (including pending, running, completed, failed)
      const allWorkflowJobs = state.jobs.filter(job => job.workflow_id === workflowId);

      // Find completed jobs and sort by step_number descending
      const completedJobs = allWorkflowJobs
        .filter(job => job.status === 'completed')
        .sort((a, b) => (b.step_number || 0) - (a.step_number || 0));

      const lastCompletedJob = completedJobs[0];
      if (!lastCompletedJob || !lastCompletedJob.step_number) {
        console.warn(`No completed job found for workflow ${workflowId}`);
        return;
      }

      // Use total_steps from tracked workflow (more reliable than job data)
      const totalSteps = workflow.total_steps;
      const nextStep = lastCompletedJob.step_number + 1;

      if (nextStep > totalSteps) {
        // Workflow complete - remove from tracking
        state.removeSimulationWorkflow(workflowId);
        console.log(`Simulation workflow ${workflowId} completed all ${totalSteps} steps`);
        return;
      }

      // CRITICAL: Check if the next step is already submitted/running to prevent duplicates
      const nextStepJobs = allWorkflowJobs.filter(job => job.step_number === nextStep);
      if (nextStepJobs.length > 0) {
        console.log(
          `Step ${nextStep} for workflow ${workflowId} already exists (${nextStepJobs.length} jobs). Statuses: ${nextStepJobs.map(j => j.status).join(', ')}`
        );
        return; // Don't submit duplicate step
      }

      // Double-check: ensure we haven't already submitted this step recently
      const recentStepJobs = allWorkflowJobs.filter(
        job =>
          job.step_number === nextStep &&
          job.created_at &&
          Date.now() - new Date(job.created_at).getTime() < 5000 // Within last 5 seconds
      );

      if (recentStepJobs.length > 0) {
        console.log(
          `Step ${nextStep} for workflow ${workflowId} was recently submitted. Skipping duplicate.`
        );
        return;
      }

      // Generate fresh payload for the next step
      // For simulation, just create a new random payload
      const freshPayload =
        workflow.job_type === 'simulation'
          ? {
              steps: 20,
              seed: Math.floor(Math.random() * 1000000000),
              simulation_time: 5,
            }
          : workflow.basePayload;

      const jobData = {
        job_type: workflow.job_type,
        service_required: workflow.job_type,
        priority: workflow.priority,
        payload: freshPayload,
        customer_id: workflow.customer_id,
        requirements: workflow.requirements,
        workflow_id: workflowId,
        workflow_priority: workflow.workflow_priority,
        workflow_datetime: workflow.workflow_datetime,
        step_number: nextStep,
        total_steps: totalSteps,
      };

      // Submit the next step with additional logging
      console.log(
        `[WORKFLOW] Auto-submitting step ${nextStep}/${totalSteps} for workflow ${workflowId} (completed: ${completedJobs.length}, total jobs: ${allWorkflowJobs.length})`
      );
      state.submitJob(jobData);
    },

    removeSimulationWorkflow: workflowId =>
      set(state => {
        const newWorkflows = new Map(state.simulationWorkflows);
        newWorkflows.delete(workflowId);
        return { simulationWorkflows: newWorkflows };
      }),
  }))
);

// Create throttled update functions for high-frequency events
const throttledJobProgressUpdate = throttle(
  (jobId: string, updates: Partial<Job>) => {
    useMonitorStore.getState().updateJob(jobId, updates);
  },
  100, // Update at most every 100ms
  {
    leading: true, // Execute immediately on first call
    trailing: true, // Execute after the wait period
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
