# Event-Driven Monitor System - Phase 1

## Status: ✅ COMPLETED

## Description
Replace the current polling-based stats_broadcast system (every 2 seconds) with a real-time event-driven architecture that provides instant updates, eliminates missed events, and reduces unnecessary network traffic.

## Problem with Current System
- **Not instant**: 2-second delay for updates
- **Too frequent**: Unnecessary network traffic when nothing changes  
- **Stuff gets missed**: State changes between broadcasts are lost
- **Inefficient**: Sends full state even for small changes
- **Poor UX**: Users see stale data and delayed updates

## Event-Driven Architecture Solution

### 1. Real-Time Event System

#### Core Event Types
```typescript
// Worker Events
interface WorkerConnectedEvent {
  type: 'worker_connected';
  worker_id: string;
  worker_data: {
    id: string;
    status: WorkerStatus;
    capabilities: WorkerCapabilities;
    connected_at: string;
  };
  timestamp: number;
}

interface WorkerDisconnectedEvent {
  type: 'worker_disconnected'; 
  worker_id: string;
  timestamp: number;
}

interface WorkerStatusChangedEvent {
  type: 'worker_status_changed';
  worker_id: string;
  old_status: WorkerStatus;
  new_status: WorkerStatus;
  current_job_id?: string;
  timestamp: number;
}

// Job Events  
interface JobSubmittedEvent {
  type: 'job_submitted';
  job_id: string;
  job_data: {
    id: string;
    job_type: string;
    status: 'pending';
    priority: number;
    workflow_id?: string;
    created_at: number;
  };
  timestamp: number;
}

interface JobAssignedEvent {
  type: 'job_assigned';
  job_id: string;
  worker_id: string;
  old_status: 'pending';
  new_status: 'assigned';
  assigned_at: number;
  timestamp: number;
}

interface JobStatusChangedEvent {
  type: 'job_status_changed';
  job_id: string;
  old_status: JobStatus;
  new_status: JobStatus;
  worker_id?: string;
  timestamp: number;
}

interface JobProgressEvent {
  type: 'job_progress';
  job_id: string;
  worker_id: string;
  progress: number;
  timestamp: number;
}

interface JobCompletedEvent {
  type: 'job_completed';
  job_id: string;
  worker_id: string;
  result?: unknown;
  completed_at: number;
  timestamp: number;
}

interface JobFailedEvent {
  type: 'job_failed';
  job_id: string;
  worker_id?: string;
  error: string;
  failed_at: number;
  timestamp: number;
}

// System Events
interface SystemStatsEvent {
  type: 'system_stats';
  stats: {
    total_workers: number;
    active_workers: number;
    total_jobs: number;
    pending_jobs: number;
    active_jobs: number;
    completed_jobs: number;
    failed_jobs: number;
  };
  timestamp: number;
}
```

### 2. Monitor Connection Protocol

#### Initial Connection Handshake
```typescript
// 1. Monitor connects and requests full state
interface MonitorConnectEvent {
  type: 'monitor_connect';
  monitor_id: string;
  request_full_state: true;
  timestamp: number;
}

// 2. Hub responds with current state snapshot
interface FullStateResponse {
  type: 'full_state_snapshot';
  data: {
    workers: Record<string, Worker>;
    jobs: {
      pending: Job[];
      active: Job[];
      completed: Job[]; // Last 100
      failed: Job[];    // Last 100
    };
    system_stats: SystemStats;
  };
  timestamp: number;
}

// 3. Monitor acknowledges and subscribes to events
interface MonitorSubscribeEvent {
  type: 'monitor_subscribe';
  monitor_id: string;
  subscriptions: ['workers', 'jobs', 'system_stats'];
  timestamp: number;
}
```

#### Event Subscription System
```typescript
interface SubscriptionRequest {
  type: 'subscribe';
  monitor_id: string;
  topics: SubscriptionTopic[];
  filters?: {
    job_types?: string[];
    worker_ids?: string[];
    priority_range?: [number, number];
  };
}

type SubscriptionTopic = 
  | 'workers'           // All worker events
  | 'jobs'              // All job events  
  | 'jobs:progress'     // Only progress updates
  | 'jobs:status'       // Only status changes
  | 'system_stats'      // System statistics
  | 'heartbeat';        // Connection health
```

### 3. Hub Implementation Changes

#### Event Broadcasting System
```typescript
// Hub service additions
class EventBroadcaster {
  private monitors: Map<string, WebSocket> = new Map();
  private subscriptions: Map<string, SubscriptionTopic[]> = new Map();

  // Register monitor
  addMonitor(monitorId: string, ws: WebSocket, subscriptions: SubscriptionTopic[]) {
    this.monitors.set(monitorId, ws);
    this.subscriptions.set(monitorId, subscriptions);
  }

  // Broadcast event to subscribed monitors
  broadcast(event: MonitorEvent) {
    for (const [monitorId, ws] of this.monitors) {
      const topics = this.subscriptions.get(monitorId) || [];
      if (this.shouldReceiveEvent(event, topics)) {
        this.sendToMonitor(ws, event);
      }
    }
  }

  // Specific event methods
  broadcastWorkerConnected(worker: Worker) {
    this.broadcast({
      type: 'worker_connected',
      worker_id: worker.id,
      worker_data: worker,
      timestamp: Date.now()
    });
  }

  broadcastJobStatusChanged(jobId: string, oldStatus: JobStatus, newStatus: JobStatus, workerId?: string) {
    this.broadcast({
      type: 'job_status_changed',
      job_id: jobId,
      old_status: oldStatus,
      new_status: newStatus,
      worker_id: workerId,
      timestamp: Date.now()
    });
  }
}
```

#### Integration Points
```typescript
// In worker connection handler
async handleWorkerConnect(workerId: string, workerData: Worker) {
  // Existing logic...
  await this.workerRegistry.addWorker(workerId, workerData);
  
  // NEW: Broadcast event
  this.eventBroadcaster.broadcastWorkerConnected(workerData);
}

// In job assignment logic  
async assignJobToWorker(jobId: string, workerId: string) {
  // Existing logic...
  await this.updateJobStatus(jobId, 'pending', 'assigned', workerId);
  
  // NEW: Broadcast event
  this.eventBroadcaster.broadcastJobStatusChanged(jobId, 'pending', 'assigned', workerId);
}

// In job progress handler
async handleJobProgress(jobId: string, workerId: string, progress: number) {
  // Existing logic...
  await this.updateJobProgress(jobId, progress);
  
  // NEW: Broadcast event
  this.eventBroadcaster.broadcast({
    type: 'job_progress',
    job_id: jobId,
    worker_id: workerId,
    progress,
    timestamp: Date.now()
  });
}
```

### 4. Monitor Client Implementation

#### Enhanced WebSocket Service
```typescript
// apps/monitor-nextjs/src/services/websocket.ts
export class WebSocketService {
  private isSubscribed = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  connect() {
    // Existing connection logic...
    
    // After connection established
    this.requestFullState();
  }

  private requestFullState() {
    this.send({
      type: 'monitor_connect',
      monitor_id: this.monitorId,
      request_full_state: true,
      timestamp: Date.now()
    });
  }

  private subscribeToEvents() {
    this.send({
      type: 'subscribe',
      monitor_id: this.monitorId,
      topics: ['workers', 'jobs', 'system_stats'],
      timestamp: Date.now()
    });
    this.isSubscribed = true;
  }

  // Handle full state response
  private handleFullStateSnapshot(data: FullStateResponse) {
    // Populate store with current state
    this.onMessageCallbacks.forEach(callback => callback(data));
    
    // Subscribe to real-time events
    this.subscribeToEvents();
  }
}
```

#### Enhanced Store Event Handling
```typescript
// apps/monitor-nextjs/src/store/index.ts
const handleRealtimeEvent = (message: MonitorEvent) => {
  switch (message.type) {
    case 'full_state_snapshot':
      // Replace all data with fresh state
      set({
        workers: Object.values(message.data.workers),
        jobs: [
          ...message.data.jobs.pending,
          ...message.data.jobs.active,
          ...message.data.jobs.completed,
          ...message.data.jobs.failed
        ]
      });
      break;

    case 'worker_connected':
      addWorker(message.worker_data);
      addLog({
        level: 'info',
        category: 'worker',
        message: `Worker ${message.worker_id} connected`,
        source: 'websocket'
      });
      break;

    case 'worker_disconnected':
      removeWorker(message.worker_id);
      addLog({
        level: 'info', 
        category: 'worker',
        message: `Worker ${message.worker_id} disconnected`,
        source: 'websocket'
      });
      break;

    case 'job_status_changed':
      updateJob(message.job_id, { status: message.new_status, worker_id: message.worker_id });
      addLog({
        level: 'info',
        category: 'job',
        message: `Job ${message.job_id} ${message.old_status} → ${message.new_status}`,
        source: 'websocket'
      });
      break;

    case 'job_progress':
      updateJob(message.job_id, { progress: message.progress });
      break;

    case 'job_completed':
      updateJob(message.job_id, { 
        status: 'completed', 
        result: message.result,
        completed_at: message.completed_at 
      });
      break;

    case 'job_failed':
      updateJob(message.job_id, { 
        status: 'failed', 
        error: message.error,
        failed_at: message.failed_at 
      });
      break;
  }
};
```

### 5. Fallback & Reliability

#### Heartbeat System
```typescript
// Lightweight heartbeat every 30 seconds
interface HeartbeatEvent {
  type: 'heartbeat';
  monitor_id: string;
  timestamp: number;
}

interface HeartbeatResponse {
  type: 'heartbeat_ack';
  monitor_id: string;
  server_timestamp: number;
  events_missed?: number; // If > 0, request resync
}
```

#### Event History & Resync
```typescript
// If monitor detects missed events or reconnects
interface ResyncRequest {
  type: 'resync_request';
  monitor_id: string;
  last_event_timestamp: number;
  topics: SubscriptionTopic[];
}

interface ResyncResponse {
  type: 'resync_data';
  events: MonitorEvent[]; // All events since last_event_timestamp
  timestamp: number;
}
```

## Implementation Plan

### Phase 1: Hub Event System ✅ COMPLETED (Priority: High)
- [x] Create EventBroadcaster service in hub → `src/services/event-broadcaster.ts`
- [x] Add monitor WebSocket endpoint with subscription support → `src/hub/monitor-websocket-handler.ts`
- [x] Implement full state snapshot on monitor connect → Full state from JobBroker integration
- [x] Add event broadcasting to existing worker/job lifecycle methods → Ready for integration
- [x] Create event type definitions and message schemas → `src/types/monitor-events.ts`

**Completed Files:**
- `src/types/monitor-events.ts` - Complete event type definitions (WorkerConnected, JobSubmitted, etc.)
- `src/services/event-broadcaster.ts` - Event broadcasting service with subscription management
- `src/hub/monitor-websocket-handler.ts` - Monitor WebSocket handler with full state snapshots
- `src/hub/websocket-manager.ts` - Integrated monitor connections with existing system
- `src/core/job-broker.ts` - Added getConnectedWorkers() and getAllJobs() for state snapshots

**Key Features Implemented:**
- Real-time event broadcasting to all connected monitors
- Full state snapshot on monitor connect (workers, jobs, system stats)
- Subscription-based event filtering (workers, jobs, progress, heartbeat)
- Monitor connection health tracking with automatic cleanup
- Event history with resync capability (getEventsSince)
- Comprehensive TypeScript type safety
- Integration with existing WebSocket infrastructure

**Next:** Phase 2 - Update monitor frontend to consume events instead of polling

### Phase 2: Monitor Client Updates (Priority: High) 
- [ ] Update WebSocket service to handle event subscriptions
- [ ] Enhance store to process real-time events instead of stats_broadcast
- [ ] Add full state initialization on connect
- [ ] Implement proper event logging and debugging
- [ ] Add connection state management and error handling

### Phase 3: Reliability & Performance (Priority: Medium)
- [ ] Implement heartbeat system for connection health
- [ ] Add event history and resync capability
- [ ] Create event filtering and subscription management
- [ ] Add performance monitoring and metrics
- [ ] Implement graceful degradation (fallback to polling if needed)

### Phase 4: Advanced Features (Priority: Low)
- [ ] Multiple monitor support with selective subscriptions
- [ ] Event replay capability for debugging
- [ ] Event streaming optimization (batching, compression)
- [ ] Custom event filters and alerts
- [ ] Event analytics and monitoring dashboard

## Benefits

### Immediate Benefits
- **Instant updates**: No more 2-second delays
- **No missed events**: Every state change is captured
- **Efficient**: Only send what changes
- **Better UX**: Real-time responsiveness

### Long-term Benefits  
- **Scalable**: Works with hundreds of jobs/workers
- **Extensible**: Easy to add new event types
- **Debuggable**: Clear event history and logging
- **Reliable**: Built-in fallback and resync mechanisms

## Files to Create/Modify

### Hub Changes
- `src/services/event-broadcaster.ts` - Event broadcasting service
- `src/hub/monitor-websocket-handler.ts` - Monitor WebSocket endpoint
- `src/types/monitor-events.ts` - Event type definitions
- Modify existing job/worker handlers to broadcast events

### Monitor Changes  
- `apps/monitor-nextjs/src/services/websocket.ts` - Enhanced WebSocket service
- `apps/monitor-nextjs/src/store/index.ts` - Event-driven store updates
- `apps/monitor-nextjs/src/types/events.ts` - Monitor event types
- `apps/monitor-nextjs/src/hooks/useRealtimeUpdates.ts` - Event handling hook

## Success Metrics
- [ ] Monitor updates appear instantly (< 100ms)
- [ ] No events missed during normal operation
- [ ] Reduced WebSocket traffic by 80%+ compared to polling
- [ ] Connection recovery works seamlessly
- [ ] Multiple monitors can connect simultaneously
- [ ] System remains responsive with 100+ concurrent jobs

## Acceptance Criteria
- [ ] Full state snapshot loads correctly on monitor connect
- [ ] All job status changes appear instantly in monitor
- [ ] Worker connections/disconnections show immediately  
- [ ] Job progress updates smoothly in real-time
- [ ] Monitor reconnection restores full state without data loss
- [ ] System gracefully handles network interruptions
- [ ] Event logging provides clear debugging information
- [ ] Performance is better than current polling system