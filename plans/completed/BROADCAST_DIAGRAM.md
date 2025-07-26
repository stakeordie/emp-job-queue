# WebSocket Message Broadcasting Architecture

## Overview

The Job Queue API supports two distinct WebSocket connection types with different message formats and broadcasting behaviors:

1. **Monitor Connections** (`/ws/monitor/`) - System-wide monitoring with original message format
2. **Client Connections** (`/ws/client/`) - Job-specific updates with EmProps message format

## Connection Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Job Queue API Server                        │
│                                                                 │
│  ┌─────────────────┐                    ┌─────────────────┐    │
│  │   EventBroadcaster   │              │  WebSocket Handler │    │
│  │                     │              │                   │    │
│  │  monitors: Map      │              │  /ws/monitor/{id} │    │
│  │  clients: Map       │              │  /ws/client/{id}  │    │
│  └─────────────────┘                    └─────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Connection Types

### Monitor Connections (`/ws/monitor/{monitorId}`)

**Purpose**: System-wide monitoring and administration
**Scope**: Receives ALL system events
**Message Format**: Original Job Queue API format

**Connection URL Pattern**:
```
ws://localhost:3331/ws/monitor/monitor-id-{timestamp}?token={auth_token}
```

**Subscription Behavior**:
- Automatically subscribed to ALL event topics:
  - `workers` - Worker connection/disconnection/status changes
  - `machines` - Machine startup/shutdown/status updates  
  - `jobs` - All job lifecycle events
  - `jobs:status` - Job status changes
  - `jobs:progress` - Job progress updates
  - `system_stats` - System-wide statistics
  - `heartbeat` - Connection health monitoring

### Client Connections (`/ws/client/{clientId}`)

**Purpose**: Job-specific updates for API clients (EmProps integration)
**Scope**: Receives ONLY events for subscribed jobs
**Message Format**: EmProps-compatible format

**Connection URL Pattern**:
```
ws://localhost:3331/ws/client/client-id-{timestamp}?token={auth_token}
```

**Subscription Behavior**:
- Job-specific subscriptions only
- Clients are subscribed to jobs when they submit them
- Only receives events related to their subscribed jobs

## Message Flow Diagram

```
                    ┌─────────────────┐
                    │   Job Event     │
                    │   Generated     │
                    └─────────┬───────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ EventBroadcaster │
                    │   .broadcast()   │
                    └─────────┬───────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Event Routing  │
                    └─────┬─────┬─────┘
                          │     │
                ┌─────────▼─┐ ┌─▼──────────┐
                │ Monitors  │ │  Clients   │
                │ (ALL)     │ │ (FILTERED) │
                └─────┬─────┘ └─┬──────────┘
                      │         │
                      ▼         ▼
            ┌─────────────┐ ┌─────────────┐
            │   Original  │ │   EmProps   │
            │   Format    │ │   Format    │
            └─────────────┘ └─────────────┘
```

## Message Format Comparison

### Monitor Messages (Original Format)

#### Connection Event
```json
{
  "type": "connected",
  "timestamp": 1642700000000
}
```

#### Job Submitted
```json
{
  "type": "job_submitted",
  "job_id": "job-123",
  "job_data": {
    "id": "job-123",
    "job_type": "comfyui",
    "status": "pending",
    "priority": 5,
    "requirements": {...},
    "created_at": 1642700000000
  },
  "timestamp": 1642700000000
}
```

#### Job Progress
```json
{
  "type": "update_job_progress",
  "job_id": "job-123",
  "worker_id": "worker-1",
  "progress": 0.5,
  "timestamp": 1642700000000
}
```

#### Job Completion
```json
{
  "type": "complete_job",
  "job_id": "job-123",
  "worker_id": "worker-1",
  "result": {...},
  "completed_at": 1642700000000,
  "timestamp": 1642700000000
}
```

### Client Messages (EmProps Format)

#### Connection Event
```json
{
  "type": "connection_established",
  "message": "Connected to server",
  "timestamp": 1642700000000
}
```

#### Job Accepted
```json
{
  "type": "job_accepted",
  "job_id": "job-123",
  "status": "queued",
  "timestamp": 1642700000000
}
```

#### Job Progress
```json
{
  "type": "update_job_progress",
  "job_id": "job-123",
  "progress": 0.5,
  "timestamp": 1642700000000
}
```

#### Job Completion
```json
{
  "type": "complete_job",
  "job_id": "job-123",
  "worker_id": "worker-1",
  "result": {
    "status": "success",
    "data": {...}
  },
  "timestamp": 1642700000000
}
```

#### Job Failure
```json
{
  "type": "complete_job",
  "job_id": "job-123",
  "worker_id": "worker-1",
  "result": {
    "status": "failed",
    "error": "Error message"
  },
  "timestamp": 1642700000000
}
```

## Event Filtering Logic

### Monitor Event Filtering

```typescript
// Monitors receive ALL events based on subscription topics
function shouldMonitorReceiveEvent(monitorId: string, event: MonitorEvent): boolean {
  const subscription = subscriptions.get(monitorId);
  const eventTopics = getEventTopics(event);
  return eventTopics.some(topic => subscription.topics.includes(topic));
}
```

### Client Event Filtering

```typescript
// Clients only receive job events for subscribed jobs
function shouldClientReceiveEvent(client: ClientConnection, event: MonitorEvent): boolean {
  if (isJobEvent(event)) {
    const jobId = getJobIdFromEvent(event);
    return jobId ? client.subscribedJobs.has(jobId) : false;
  }
  return false; // Non-job events are not sent to clients
}
```

## Job Subscription Management

### Automatic Subscription
When a client submits a job, they are automatically subscribed to updates for that job:

```typescript
// Job submission creates automatic subscription
async function submitJob(clientId: string, jobData: any): Promise<string> {
  const jobId = await createJob(jobData);
  
  // Auto-subscribe client to job updates
  eventBroadcaster.subscribeClientToJob(clientId, jobId);
  
  return jobId;
}
```

### Manual Subscription/Unsubscription
Clients can manually manage job subscriptions:

```typescript
// Subscribe to additional job
eventBroadcaster.subscribeClientToJob(clientId, jobId);

// Unsubscribe from job
eventBroadcaster.unsubscribeClientFromJob(clientId, jobId);
```

## Implementation Details

### EventBroadcaster Service

Located: `packages/core/src/services/event-broadcaster.ts`

**Key Methods**:
- `addMonitor(monitorId, connection)` - Register monitor connection
- `addClient(clientId, ws, clientType)` - Register client connection  
- `broadcast(event)` - Send event to appropriate recipients
- `subscribeClientToJob(clientId, jobId)` - Manage job subscriptions

### WebSocket Handler

Located: `apps/api/src/lightweight-api-server.ts`

**Connection Detection**:
```typescript
wsServer.on('connection', (ws, request) => {
  const url = request.url || '';
  
  if (url.includes('/ws/monitor/')) {
    // Monitor connection - original format
    const monitorId = extractMonitorId(url);
    eventBroadcaster.addMonitor(monitorId, ws);
  } else if (url.includes('/ws/client/')) {
    // Client connection - EmProps format
    const clientId = extractClientId(url);
    eventBroadcaster.addClient(clientId, ws, 'emprops');
  }
});
```

## Usage Examples

### Monitor Client (Job Queue Monitor UI)
```javascript
// Connect to monitor endpoint
const ws = new WebSocket('ws://localhost:3331/ws/monitor/monitor-123');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  // Handle all system events in original format
  switch (data.type) {
    case 'job_submitted':
      updateJobsList(data.job_data);
      break;
    case 'worker_connected':
      updateWorkerStatus(data.worker_data);
      break;
    case 'machine_update':
      updateMachineStatus(data.machine_id, data.status_data);
      break;
  }
};
```

### EmProps Client (API Integration)
```javascript
// Connect to client endpoint
const ws = new WebSocket('ws://localhost:3331/ws/client/client-456');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  // Handle job-specific events in EmProps format
  switch (data.type) {
    case 'connection_established':
      console.log('Connected:', data.message);
      break;
    case 'job_accepted':
      trackJob(data.job_id, 'queued');
      break;
    case 'update_job_progress':
      updateProgress(data.job_id, data.progress);
      break;
    case 'complete_job':
      if (data.result.status === 'success') {
        resolveJob(data.job_id, data.result.data);
      } else {
        rejectJob(data.job_id, data.result.error);
      }
      break;
  }
};
```

## Migration Path

### Current State
- All connections receive original Job Queue API format
- EmPropsMessageAdapter handles format conversion (deprecated)

### Target State (Current Implementation)
- Monitor connections: Original format (unchanged)
- Client connections: EmProps format created directly at source
- No adapter layer - events created in correct format initially

### Benefits
- **Simplified Architecture**: No format conversion middleware
- **Better Performance**: Direct event creation vs runtime adaptation
- **Clear Separation**: Distinct message formats for distinct use cases
- **EmProps Compatibility**: Full support for EmProps API expectations
- **Monitor Preservation**: Existing monitor functionality unchanged