# State Management with Zustand

## Status: Completed ✅

## Description
Implement centralized state management using Zustand stores for jobs, workers, connections, and UI state in the Next.js monitor app.

## Store Architecture

### Job Store
```typescript
interface JobStore {
  jobs: Record<string, Job>;
  filteredJobs: Job[];
  
  // Job management
  addJob: (job: Job) => void;
  updateJob: (jobId: string, updates: Partial<Job>) => void;
  removeJob: (jobId: string) => void;
  
  // Filtering and querying
  setFilter: (filter: JobFilter) => void;
  getJobsByStatus: (status: JobStatus) => Job[];
  getJobsByWorkflow: (workflowId: string) => Job[];
  
  // Actions
  submitJob: (jobData: JobSubmissionRequest) => Promise<string>;
  submitWorkflow: (workflowData: WorkflowSubmissionRequest) => Promise<string>;
  cancelJob: (jobId: string) => Promise<void>;
  retryJob: (jobId: string) => Promise<void>;
}
```

### Worker Store
```typescript
interface WorkerStore {
  workers: Record<string, Worker>;
  
  // Worker management
  addWorker: (worker: Worker) => void;
  updateWorker: (workerId: string, updates: Partial<Worker>) => void;
  removeWorker: (workerId: string) => void;
  
  // Querying
  getActiveWorkers: () => Worker[];
  getWorkersByType: (type: string) => Worker[];
  getWorkerStats: () => WorkerStats;
}
```

### UI State Store
```typescript
interface UIStore {
  selectedJobId: string | null;
  selectedWorkerId: string | null;
  sidebarOpen: boolean;
  debugMode: boolean;
  theme: 'light' | 'dark';
  filters: {
    jobStatus: JobStatus[];
    workerType: string[];
    dateRange: DateRange;
  };
  
  // Actions
  setSelectedJob: (jobId: string | null) => void;
  setSelectedWorker: (workerId: string | null) => void;
  toggleSidebar: () => void;
  toggleDebugMode: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
  updateFilters: (filters: Partial<UIFilters>) => void;
}
```

### Log Store
```typescript
interface LogStore {
  entries: LogEntry[];
  maxEntries: number;
  filter: LogFilter;
  
  // Actions
  addEntry: (entry: LogEntry) => void;
  clearLogs: () => void;
  setFilter: (filter: LogFilter) => void;
  exportLogs: () => string;
}
```

## Tasks
- [x] Set up Zustand with TypeScript
- [x] Create unified MonitorStore with job, worker, connection, UI, and log management
- [x] Implement job CRUD operations with real-time updates
- [x] Create worker management with status tracking
- [x] Implement connection state management for WebSocket
- [x] Add UI state management for selections and modes
- [x] Create log store for debugging and monitoring
- [ ] Implement store persistence with localStorage (deferred)
- [ ] Add computed selectors for derived state (deferred) 
- [ ] Create custom hooks for each store (deferred)
- [ ] Write comprehensive tests for all stores (deferred to testing phase)

## Priority: High

## Dependencies
- monitor-app-setup.md (project structure)
- Type definitions for Job, Worker, Message interfaces

## Files to Create
- `src/lib/stores/jobStore.ts`
- `src/lib/stores/workerStore.ts`
- `src/lib/stores/connectionStore.ts`
- `src/lib/stores/uiStore.ts`
- `src/lib/stores/logStore.ts`
- `src/hooks/useJobStore.ts`
- `src/hooks/useWorkerStore.ts`
- `__tests__/stores/` - Test files for each store

## Acceptance Criteria
- [x] All stores properly typed with TypeScript
- [x] State updates are reactive across components
- [x] Store integrates with WebSocket for real-time updates
- [x] Job submission and management working
- [x] Worker and connection state tracking functional
- [x] UI state management for selections and modes
- [x] Log management with categorized entries
- [ ] Store persistence works with localStorage (deferred)
- [ ] Computed selectors perform efficiently (deferred)
- [ ] Custom hooks provide easy store access (deferred)
- [ ] All store actions are thoroughly tested (deferred)
- [ ] No unnecessary re-renders in components (deferred)

## Completion Notes
Completed on 2025-01-01 as part of monitor foundation. Unified MonitorStore implemented in `src/store/index.ts` with:
- Complete TypeScript typing for all state and actions
- Real-time job and worker management
- WebSocket integration with auto-connection
- Connection state tracking with retry logic
- UI state management for selections and debug mode
- Structured logging with categorization and timestamps
- Event-driven updates using subscribeWithSelector middleware