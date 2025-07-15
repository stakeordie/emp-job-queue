# Monitor Reliability Fix - Complete Data Flow Repair

## Problem Statement: Two Different Monitor Flows, Two Different Results

### Flow 1: Monitor Open → Machine Starts
1. Monitor connected, receiving events via EventSource
2. Machine starts up → appears blue → green  
3. Workers appear → service badges show briefly
4. **BROKEN**: Badges disappear, no ComfyUI status visibility
5. Submit ComfyUI job → job processes but monitor shows nothing

### Flow 2: Monitor Opens → Machine Already Running
1. Workers visible with service badges (mostly grey/stale)
2. Submit ComfyUI job → goes to pending  
3. Worker blinks blue, ComfyUI badge gets green dot
4. **BROKEN**: Badge status stuck forever, never updates
5. Job completes but monitor never reflects completion

## Root Cause Analysis: Data Flow Breakdown

After comprehensive analysis of basic_machine → worker → API → monitor flow:

### Issue #1: One-Time Status Reporting (CRITICAL)
**Location**: `apps/worker/src/redis-direct-base-worker.ts:721`
```typescript
// Send initial status and then rely on event-driven updates
await this.startConnectorStatusUpdates();
// ❌ PROBLEM: No actual event-driven updates implemented!
```

**Impact**: 
- Workers send initial connector status during startup
- No periodic updates or status change events after that
- Connector statuses become stale in Redis immediately after startup

### Issue #2: Missing Real-Time Status Propagation
**Location**: Connector status changes not propagated to Redis
- Connectors change state (starting → idle → active → idle)
- These changes happen locally but never reach Redis
- Redis contains stale initial status while actual status changes

### Issue #3: Snapshot vs Real-Time Data Mismatch  
**Location**: `apps/api/src/lightweight-api-server.ts`
- Full state snapshot reads stale data from `worker:${workerId}` Redis hash
- Real-time events come from `connector_status:*` pub/sub (but rarely published)
- Two different data paths serving different information

### Issue #4: Job Status Integration Missing
- Jobs start/complete but don't trigger connector status updates
- Connector shows "idle" even when actively processing jobs
- No connection between job assignment and connector status

## Comprehensive Fix Plan

### Phase 1: Implement Real-Time Connector Status Updates

#### 1.1 Fix Worker Status Reporting Loop
**File**: `apps/worker/src/redis-direct-base-worker.ts`

Replace one-time status reporting with continuous monitoring:

```typescript
// Remove line 721 comment about "event-driven updates"
// Add actual periodic status monitoring

private statusUpdateInterval: NodeJS.Timeout | null = null;

async startConnectorStatusUpdates(): Promise<void> {
  // Send initial status
  await this.sendConnectorStatusUpdate();
  
  // Start periodic status monitoring (every 15 seconds)
  this.statusUpdateInterval = setInterval(async () => {
    await this.sendConnectorStatusUpdate();
  }, 15000);
}

async stopConnectorStatusUpdates(): Promise<void> {
  if (this.statusUpdateInterval) {
    clearInterval(this.statusUpdateInterval);
    this.statusUpdateInterval = null;
  }
}

private async sendConnectorStatusUpdate(): Promise<void> {
  const currentStatuses = await this.connectorManager.getConnectorStatuses();
  
  // Check if any status changed
  if (this.hasStatusChanged(currentStatuses)) {
    await this.redisClient.updateConnectorStatuses(currentStatuses);
    
    // Publish real-time events for changed statuses
    await this.publishStatusChanges(currentStatuses);
  }
  
  this.lastConnectorStatuses = currentStatuses;
}
```

#### 1.2 Add Job-Based Status Updates
**File**: `apps/worker/src/redis-direct-worker-client.ts`

Update connector status when jobs start/complete:

```typescript
private async processJob(job: JobRequest): Promise<void> {
  const connector = this.connectorManager.getConnector(job.connector_id);
  
  // Update connector to 'active' when job starts
  await this.updateConnectorStatus(job.connector_id, 'active');
  
  try {
    const result = await connector.processJob(job.data, progressCallback);
    
    // Update connector to 'idle' when job completes
    await this.updateConnectorStatus(job.connector_id, 'idle');
    
    await this.completeJob(job.id, result);
  } catch (error) {
    // Update connector to 'error' if job fails
    await this.updateConnectorStatus(job.connector_id, 'error', error.message);
    throw error;
  }
}

private async updateConnectorStatus(connectorId: string, status: string, errorMessage?: string): Promise<void> {
  // Update local connector manager
  this.connectorManager.updateConnectorStatus(connectorId, status, errorMessage);
  
  // Immediately publish to Redis
  await this.sendConnectorStatusUpdate();
}
```

### Phase 2: Enhanced Connector Status Management

#### 2.1 Add Status Change Detection
**File**: `apps/worker/src/connector-manager.ts`

```typescript
export class ConnectorManager {
  private lastReportedStatuses: Record<string, ConnectorStatus> = {};

  async updateConnectorStatus(connectorId: string, status: string, errorMessage?: string): Promise<void> {
    const connector = this.connectors.get(connectorId);
    if (connector && 'setStatus' in connector) {
      await (connector as any).setStatus(status, errorMessage);
    }
  }

  hasStatusChanged(currentStatuses: Record<string, ConnectorStatus>): boolean {
    return Object.keys(currentStatuses).some(connectorId => {
      const current = currentStatuses[connectorId];
      const last = this.lastReportedStatuses[connectorId];
      
      return !last || 
             current.status !== last.status || 
             current.error_message !== last.error_message;
    });
  }

  getStatusChanges(currentStatuses: Record<string, ConnectorStatus>): Array<{connectorId: string, oldStatus: ConnectorStatus, newStatus: ConnectorStatus}> {
    const changes = [];
    
    for (const [connectorId, current] of Object.entries(currentStatuses)) {
      const last = this.lastReportedStatuses[connectorId];
      if (!last || current.status !== last.status) {
        changes.push({
          connectorId,
          oldStatus: last,
          newStatus: current
        });
      }
    }
    
    return changes;
  }
}
```

#### 2.2 Fix BaseConnector Status Transitions
**File**: `apps/worker/src/connectors/base-connector.ts`

Ensure BaseConnector properly reports status changes:

```typescript
// Add to BaseConnector class
protected async setStatus(status: ConnectorStatus, errorMessage?: string): Promise<void> {
  if (this.currentStatus !== status) {
    this.currentStatus = status;
    this.errorMessage = errorMessage;
    
    // Immediate Redis update
    await this.reportStatus();
  }
}

// Override in ComfyUIConnector for job processing
async processJob(jobData: JobData, progressCallback: ProgressCallback): Promise<JobResult> {
  await this.setStatus('active');
  
  try {
    const result = await super.processJob(jobData, progressCallback);
    await this.setStatus('idle');
    return result;
  } catch (error) {
    await this.setStatus('error', error.message);
    throw error;
  }
}
```

### Phase 3: API Server Data Synchronization

#### 3.1 Fix Full State Snapshot Accuracy
**File**: `apps/api/src/lightweight-api-server.ts`

Ensure full state snapshot includes latest connector statuses:

```typescript
// Around line 943-968, enhance connector status parsing
const workerData = await redis.hgetall(`worker:${workerId}`);

let connectorStatuses: Record<string, ConnectorStatus> = {};
try {
  if (workerData.connector_statuses) {
    connectorStatuses = JSON.parse(workerData.connector_statuses);
    
    // Validate timestamps - refresh stale statuses
    for (const [serviceType, status] of Object.entries(connectorStatuses)) {
      const ageSeconds = (Date.now() - status.timestamp) / 1000;
      if (ageSeconds > 60) { // Stale if older than 1 minute
        logger.warn(`Stale connector status for ${workerId}:${serviceType}, age: ${ageSeconds}s`);
        // Mark as unknown/stale
        status.status = 'unknown';
        status.error_message = `Status stale (${Math.round(ageSeconds)}s old)`;
      }
    }
  }
} catch (error) {
  logger.error(`Failed to parse connector statuses for ${workerId}:`, error);
}
```

#### 3.2 Enhance Real-Time Event Broadcasting
**File**: `apps/api/src/lightweight-api-server.ts`

Improve connector status change broadcasting:

```typescript
// Around line 1657-1690, enhance connector status event handling
redis.on('pmessage', async (pattern, channel, message) => {
  if (pattern === 'connector_status:*') {
    try {
      const statusData = JSON.parse(message);
      
      // Validate status data structure
      if (!statusData.worker_id || !statusData.service_type || !statusData.status) {
        logger.warn('Invalid connector status data:', statusData);
        return;
      }
      
      // Update full state cache immediately
      await updateWorkerConnectorStatusCache(statusData);
      
      // Broadcast to monitors with enhanced data
      const broadcastData = {
        type: 'connector_status_changed',
        worker_id: statusData.worker_id,
        machine_id: statusData.machine_id,
        service_type: statusData.service_type,
        status: statusData.status,
        timestamp: statusData.timestamp || Date.now(),
        error_message: statusData.error_message
      };
      
      eventBroadcaster.broadcast(broadcastData);
      
    } catch (error) {
      logger.error('Error processing connector status change:', error);
    }
  }
});

async function updateWorkerConnectorStatusCache(statusData: any): Promise<void> {
  // Update cached worker data to keep full state accurate
  const workerId = statusData.worker_id;
  const existingStatuses = await redis.hget(`worker:${workerId}`, 'connector_statuses') || '{}';
  const statuses = JSON.parse(existingStatuses);
  
  statuses[statusData.service_type] = {
    connector_id: statusData.connector_id || statusData.service_type,
    status: statusData.status,
    timestamp: statusData.timestamp || Date.now(),
    error_message: statusData.error_message
  };
  
  await redis.hset(`worker:${workerId}`, 'connector_statuses', JSON.stringify(statuses));
}
```

### Phase 4: Monitor UI Enhancements

#### 4.1 Separate Job Testing from Monitor
**File**: Create new `apps/monitor/src/pages/client-test.tsx`

Move job submission to dedicated testing page:
- Create standalone client test page
- Remove job submission from main monitor  
- Keep monitor focused on monitoring only
- Add navigation link to client test page

#### 4.2 Improve Monitor State Reconciliation
**File**: `apps/monitor/src/store/index.ts`

Add proper state reconciliation between full snapshot and real-time events:

```typescript
// Enhanced connector status handling
handleConnectorStatusChanged: (event: ConnectorStatusChangedEvent) => {
  set((state) => {
    const worker = state.workers[event.worker_id];
    if (!worker) {
      logger.warn(`Connector status update for unknown worker: ${event.worker_id}`);
      return state;
    }

    const updatedConnectorStatuses = {
      ...worker.connector_statuses,
      [event.service_type]: {
        connector_id: event.service_type,
        status: event.status,
        timestamp: event.timestamp,
        error_message: event.error_message
      }
    };

    return {
      ...state,
      workers: {
        ...state.workers,
        [event.worker_id]: {
          ...worker,
          connector_statuses: updatedConnectorStatuses
        }
      }
    };
  });
},

// Add state reconciliation for full state updates
reconcileConnectorStatuses: (fullState: FullStateSnapshot) => {
  set((state) => {
    const reconciledWorkers = { ...state.workers };
    
    // Update all worker connector statuses from full state
    for (const [workerId, workerData] of Object.entries(fullState.workers)) {
      if (reconciledWorkers[workerId]) {
        reconciledWorkers[workerId] = {
          ...reconciledWorkers[workerId],
          connector_statuses: workerData.connector_statuses || {}
        };
      }
    }
    
    return {
      ...state,
      workers: reconciledWorkers
    };
  });
}
```

## Implementation Timeline

### Week 1: Core Status Reporting Fix
- **Day 1-2**: Implement periodic status updates in worker
- **Day 3**: Add job-based status transitions  
- **Day 4-5**: Test and validate status accuracy

### Week 2: API and Monitor Integration
- **Day 1-2**: Fix API full state snapshot accuracy
- **Day 3**: Enhance real-time event broadcasting
- **Day 4-5**: Update monitor state reconciliation

### Week 3: UI Improvements and Testing
- **Day 1-2**: Create separate client test page
- **Day 3**: Remove job submission from monitor
- **Day 4-5**: End-to-end testing both monitor flows

## Success Criteria

After implementation, BOTH monitor flows must show:

✅ **Consistent Connector Status**: Same badges regardless of connection timing
✅ **Real-Time Updates**: Status changes immediately when jobs start/complete  
✅ **Accurate Job Processing**: Active status during jobs, idle after completion
✅ **Error Handling**: Clear error states and recovery
✅ **Unified Behavior**: No difference between "monitor first" vs "machine first" flows

## Testing Strategy

1. **Flow 1 Test**: Start monitor → start machine → verify status progression
2. **Flow 2 Test**: Start machine → start monitor → verify status accuracy  
3. **Job Processing Test**: Submit jobs and verify status transitions
4. **Recovery Test**: Restart services and verify status consistency
5. **Stale Data Test**: Verify old status data gets refreshed

This comprehensive fix addresses the root causes in the data flow while maintaining the north star architecture goals of reliable, real-time system monitoring.

## CRITICAL BUG: Job Timeout Race Condition Corrupts Worker State

### Discovery Date: 2025-07-15T01:17:00Z

### Problem Summary
Worker disappears from monitor after ComfyUI job completion. Job gets submitted, processes normally, but never transitions out of "pending" state in monitor. After page refresh, worker-1 completely vanishes from monitor display.

### Root Cause: REST Submission + WebSocket Progress Race Condition  

**The Real Issue**: ComfyUI hybrid connector architecture flaw:
1. Submit job via **REST** → ComfyUI processes
2. Connect **WebSocket** for progress → Race condition window!
3. If job completes **instantly** (cached) → WebSocket connects to finished job
4. Worker waits **forever** for progress updates that will never come

**The Smoking Gun**: Worker-1 lost its machine_id during job processing race condition:

```bash
# Redis investigation reveals the corruption:
$ redis-cli HGETALL "worker:basic-machine-local-worker-0"
machine_id: basic-machine-local                    ✅ CORRECT

$ redis-cli HGETALL "worker:basic-machine-local-worker-1"  
machine_id: unknown                                ❌ CORRUPTED

$ redis-cli HGET "worker:basic-machine-local-worker-1" "capabilities" | jq '.machine_id'
null                                               ❌ MISSING FROM CAPABILITIES
```

### The Race Condition Timeline

**Job**: `10e834f7-2544-4055-9fe9-8ba67c564908` (ComfyUI job)
**Duration**: ~10 minutes total, but **ComfyUI wasn't even running!**
**ACTUAL Timeline** (REST + WebSocket race condition):
- `00:45:11` - Job submitted to worker-1 
- `00:45:12` - Worker submits via **REST** to ComfyUI
- `00:45:12` - ComfyUI executes in **0.06 seconds** (cached result!)
- `00:45:12` - Worker attempts **WebSocket** connection for progress
- `00:45:12` - **RACE CONDITION**: WebSocket connects to already-finished job
- `00:45:12` - Worker waits for progress updates that will never come
- `00:55:12` - Worker timeout (10 minutes of waiting for nothing!)
- `00:55:13` - Timeout logic finally realizes job was done

```bash
# 1. Job starts normally
{"gpu":1,"timestamp":"2025-07-15T00:45:11.560Z","message":"Worker basic-machine-local-worker-1 starting job 10e834f7-2544-4055-9fe9-8ba67c564908 (comfyui)"}

# 2. Job processing continues for ~10 minutes...

# 3. TIMEOUT TRIGGERED (exactly at 600 seconds)
{"gpu":1,"timestamp":"2025-07-15T00:55:12.180Z","message":"ComfyUI job 10e834f7-2544-4055-9fe9-8ba67c564908 failed: ComfyUI job 10e834f7-2544-4055-9fe9-8ba67c564908 timed out after 600 seconds"}

# 4. BUT JOB ACTUALLY COMPLETED 1 second later
{"gpu":1,"timestamp":"2025-07-15T00:55:13.428Z","message":"🎉 Worker basic-machine-local-worker-1 completing job 10e834f7-2544-4055-9fe9-8ba67c564908"}
{"gpu":1,"timestamp":"2025-07-15T00:55:13.430Z","message":"✅ Worker basic-machine-local-worker-1 updated job:10e834f7-2544-4055-9fe9-8ba67c564908 status to COMPLETED"}
```

### Redis State Corruption Evidence

The job shows conflicting state in Redis:
```bash
$ redis-cli HGETALL "job:10e834f7-2544-4055-9fe9-8ba67c564908"
status: completed                    # ✅ Job marked as completed
started_at: 2025-07-15T00:45:11.593Z
completed_at: 2025-07-15T00:55:13.428Z  # ✅ Completion timestamp exists
worker_id: basic-machine-local-worker-1  # ✅ Worker assignment correct
```

But the worker that completed it has corrupted state:
```bash
$ redis-cli HGET "worker:basic-machine-local-worker-1" "last_status_change"
2025-07-15T00:55:13.442Z             # ✅ Matches job completion time

$ redis-cli HGET "worker:basic-machine-local-worker-1" "connected_at"  
2025-07-15T00:55:13.470Z             # 🚨 RECONNECTED during completion!
```

### The Corruption Mechanism

**Location**: `apps/worker/src/redis-direct-worker-client.ts:127-140`
```typescript
private async registerWorker(capabilities: WorkerCapabilities): Promise<void> {
  await this.redis.hmset(`worker:${this.workerId}`, {
    worker_id: this.workerId,
    machine_id: capabilities.machine_id || 'unknown',  // 🚨 FALLBACK TRIGGERED
    capabilities: JSON.stringify(capabilities),
    // ... other fields
  });
}
```

**What Happened**:
1. Job timeout handler tried to fail the job and potentially reconnect
2. At the same moment, job actually completed successfully  
3. Race condition caused worker to re-register with corrupted/empty capabilities
4. `capabilities.machine_id` was `undefined/null` → fell back to `'unknown'`
5. Worker capabilities object stored without `machine_id` field
6. API filters out workers with `machine_id: unknown` from monitor display

### Monitor Impact

The monitor logic likely filters workers by valid machine_id:
```typescript
// Somewhere in API server machine grouping logic
if (worker.machine_id === 'unknown' || !worker.machine_id) {
  // Worker gets filtered out of machine display
  continue;
}
```

Result: Worker-1 processes jobs successfully but becomes invisible to monitoring.

### Fix Complexity Assessment

This is a **HIGH COMPLEXITY** fix involving:

1. **Race Condition Prevention**: 
   - Job timeout and completion handlers stepping on each other
   - Worker re-registration during active job processing
   - Concurrent Redis operations corrupting state

2. **State Recovery Mechanisms**:
   - Detect corrupted worker state and auto-repair
   - Preserve worker capabilities during re-connection
   - Validate machine_id before storing

3. **Monitoring Integration**:
   - API should show workers with corrupted state (maybe with warning)
   - Monitor should indicate worker state issues
   - Provide admin tools to fix corrupted workers

### Immediate Workaround

```bash
# Manual fix for current corrupted worker:
redis-cli HSET "worker:basic-machine-local-worker-1" "machine_id" "basic-machine-local"

# Update capabilities object:
redis-cli HGET "worker:basic-machine-local-worker-1" "capabilities" | \
jq '.machine_id = "basic-machine-local"' | \
redis-cli HSET "worker:basic-machine-local-worker-1" "capabilities" -
```

### Long-term Fix Strategy

1. **Phase A**: Add worker state validation and auto-repair
2. **Phase B**: Fix job timeout/completion race condition  
3. **Phase C**: Add monitoring alerts for corrupted worker state
4. **Phase D**: Implement graceful worker re-registration that preserves state

**Priority**: HIGH - This corruption can happen to any worker during long-running jobs, making the monitoring system unreliable for production use.

## ADDITIONAL RACE CONDITION: ComfyUI Cached Results

### Problem: Ultra-Fast Job Completion vs Monitor Event Processing

**ComfyUI behavior**: When receiving an identical workflow, ComfyUI returns cached results **instantly** (milliseconds)

**Potential race condition timeline**:
```
T+0ms:    Job submitted to worker
T+1ms:    Worker sends "job started" event  
T+2ms:    Worker submits to ComfyUI
T+3ms:    ComfyUI returns cached result (instant!)
T+4ms:    Worker sends "job completed" event
T+10ms:   Monitor processes "job started" event
T+15ms:   Monitor processes "job completed" event
```

**Result**: Monitor shows job stuck in "pending" because completion happened before start event was processed.

**CONFIRMED EVIDENCE**: ComfyUI cached job completing in 0.06 seconds:
```bash
# Real timeline from logs (21:41:33):
21:41:33 [GPU0] got prompt                    # ✅ ComfyUI receives job
21:41:33 [GPU0] Prompt executed in 0.06 seconds  # ✅ Job completed instantly!

# But worker never detected completion - race condition confirmed
```

**Mitigation strategies**:
1. **Event ordering guarantees**: Ensure events are processed in sequence
2. **Minimum job duration**: Add artificial delay for cached results  
3. **Event batching**: Batch rapid start/complete events for same job
4. **Cache detection**: ComfyUI should indicate when returning cached results

### IMPLEMENTED FIX: Defensive Job Completion Check

**Location**: `apps/worker/src/connectors/comfyui-hybrid-connector.ts:273-287`

**Strategy**: After submitting job via REST, immediately check if it already completed before waiting for WebSocket:

```typescript
// RACE CONDITION FIX: Check if job already completed before waiting for WebSocket
logger.info(`Checking if ComfyUI job ${jobId} (prompt ${promptId}) already completed...`);

// Small delay to allow ComfyUI to process and update history
await new Promise(resolve => setTimeout(resolve, 100));

const existingResult = await this.checkJobCompletion(promptId);
if (existingResult) {
  logger.info(`ComfyUI job ${jobId} already completed (cached result), returning immediately`);
  clearTimeout(timeout);
  resolve(existingResult);
  return;
}
```

**How it works**:
1. Submit job via REST → get prompt_id
2. Connect WebSocket for progress monitoring  
3. **Immediately check `/history/{prompt_id}` API**
4. If completed → extract results and return immediately
5. If not completed → proceed with normal WebSocket monitoring

**Expected result**: Ultra-fast cached jobs (0.06 seconds) will be detected and completed instantly instead of timing out after 10 minutes.

### Immediate Fix Required: Aggressive Timeout Settings

**Current timeout settings are COMPLETELY WRONG**:

```bash
# Current (BROKEN) settings:
WORKER_JOB_TIMEOUT_MINUTES=30              # 🚨 30 MINUTES?!
WORKER_COMFYUI_WORKFLOW_TIMEOUT_SECONDS=600 # 🚨 10 MINUTES?!
```

**Correct timeout strategy**:
```bash
# Aggressive service health monitoring
WORKER_COMFYUI_WORKFLOW_TIMEOUT_SECONDS=30    # ✅ 30 seconds max
WORKER_JOB_TIMEOUT_MINUTES=2                  # ✅ 2 minutes absolute max
WORKER_SERVICE_HEALTH_CHECK_INTERVAL=5        # ✅ Check every 5 seconds
WORKER_JOB_PROGRESS_TIMEOUT_SECONDS=30        # ✅ Return job if no progress in 30s
```

**Rationale**: 
- ComfyUI sends **constant WebSocket progress updates** during processing
- If no progress update received for 30 seconds → WebSocket broken or ComfyUI frozen
- **Progress timeout ≠ Job timeout**: Job can run for hours if continuously sending progress
- Worker should return job to queue immediately when progress stops
- Another worker might have working ComfyUI instance

**Current Broken Logic**:
```typescript
// apps/worker/src/connectors/comfyui-hybrid-connector.ts:488
return new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    reject(new Error(`ComfyUI job ${jobId} timed out after ${this.workflowTimeoutSeconds} seconds`));
  }, this.workflowTimeoutSeconds * 1000);  // 🚨 10 MINUTE TOTAL TIMEOUT
  
  // Waits for progress via WebSocket but no progress-based timeout!
```

**Correct Logic Needed**:
```typescript
// Need progress-based timeout that resets on each WebSocket message
private lastProgressUpdate: number = Date.now();

private setupProgressTimeout(jobId: string, callback: () => void): NodeJS.Timeout {
  return setInterval(() => {
    const sinceLastProgress = Date.now() - this.lastProgressUpdate;
    if (sinceLastProgress > 30000) { // 30 seconds without progress
      logger.warn(`ComfyUI job ${jobId} - no progress for ${sinceLastProgress}ms, returning to queue`);
      callback(); // Return job to queue
    }
  }, 5000); // Check every 5 seconds
}

private onProgressUpdate(progress: JobProgress): void {
  this.lastProgressUpdate = Date.now(); // Reset timeout on every progress update
  this.progressCallback(progress);
}
```

**Implementation locations**:
1. `apps/worker/src/connectors/comfyui-hybrid-connector.ts:488` - Replace total timeout with progress timeout
2. `apps/worker/src/connectors/comfyui-hybrid-connector.ts:360` - Track progress timestamps
3. Add WebSocket connection health monitoring with automatic job return