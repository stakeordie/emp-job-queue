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