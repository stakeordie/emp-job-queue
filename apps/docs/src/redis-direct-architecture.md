# Redis-Direct Architecture

This document outlines the proposed Redis-direct architecture that replaces WebSocket orchestration with direct Redis communication.

## Overview

The new architecture eliminates the hub as a message orchestrator and instead uses Redis as the central coordination point. Workers poll Redis directly for jobs, and clients receive progress updates via Server-Sent Events (SSE).

## Current vs Proposed Architecture

### Current Hub-Centric Architecture

<FullscreenDiagram>

```mermaid
graph TB
    Client[Client Apps] 
    Monitor[Monitor Dashboard]
    Hub[Hub Service]
    W1[Worker 1]
    W2[Worker 2]
    W3[Worker 3]
    Redis[(Redis)]
    ComfyUI[ComfyUI Service]
    
    Client -.->|WebSocket| Hub
    Monitor -.->|WebSocket| Hub
    Hub -.->|WebSocket| W1
    Hub -.->|WebSocket| W2
    Hub -.->|WebSocket| W3
    Hub <-->|TCP| Redis
    W1 -.->|WebSocket| ComfyUI
    W2 -.->|WebSocket| ComfyUI
    W3 -.->|WebSocket| ComfyUI
    
    classDef websocket stroke:#ff6b6b,stroke-width:3px
    classDef tcp stroke:#4ecdc4,stroke-width:2px
    
    class Client,Monitor,W1,W2,W3 websocket
    class Hub,Redis tcp
```

</FullscreenDiagram>

### Proposed Redis-Direct Architecture

<FullscreenDiagram>

```mermaid
graph TB
    Client[Client Apps]
    Monitor[Monitor Dashboard] 
    API[Lightweight API]
    W1[Worker 1]
    W2[Worker 2]
    W3[Worker 3]
    Redis[(Redis)]
    ComfyUI[ComfyUI Service]
    
    Client -->|HTTP POST / WebSocket| API
    Client -.->|SSE / WebSocket Progress| API
    Monitor -->|HTTP Commands / WebSocket| API
    Monitor -.->|SSE / WebSocket Progress| API
    
    API <-->|ZADD add jobs<br/>XREAD read progress| Redis
    W1 <-->|ZPOPMIN get job<br/>XADD send progress| Redis
    W2 <-->|ZPOPMIN get job<br/>XADD send progress| Redis  
    W3 <-->|ZPOPMIN get job<br/>XADD send progress| Redis
    
    W1 -.->|WebSocket| ComfyUI
    W2 -.->|WebSocket| ComfyUI
    W3 -.->|WebSocket| ComfyUI
    
    classDef http stroke:#51cf66,stroke-width:2px
    classDef sse stroke:#ffd43b,stroke-width:2px
    classDef websocket stroke:#ff6b6b,stroke-width:3px
    classDef redis stroke:#4ecdc4,stroke-width:2px
    
    class Client,Monitor http
    class API sse
    class W1,W2,W3 websocket
    class API,W1,W2,W3,Redis redis
```

</FullscreenDiagram>

## Connection Types Overview

### HTTP Connections (Commands)
- **Client → API**: Job submission, cancellation, status queries
- **Monitor → API**: Job management commands (cancel, retry, pause)
- **Characteristics**: Request/response, reliable, infrequent

### WebSocket Connections (Backwards Compatibility)
- **Client ↔ API**: Job submission + real-time progress (legacy clients)
- **Monitor ↔ API**: Commands + live updates (existing monitoring tools)
- **Characteristics**: Bidirectional, real-time, maintains existing client code

### Server-Sent Events (Progress Streaming)
- **API → Client**: Real-time job progress updates (new clients)
- **API → Monitor**: Live job status and progress (modern approach)
- **Characteristics**: One-way server→client, auto-reconnect, frequent updates

### TCP Redis Connections
- **Workers ↔ Redis**: Job polling, status updates, progress publishing
- **API ↔ Redis**: Job creation, stats queries, progress forwarding
- **Characteristics**: Direct database operations, high performance

### WebSocket Connections (Service Integration)
- **Workers ↔ ComfyUI**: Only for service-specific communication
- **Characteristics**: Real-time progress from AI services

## Detailed Sequence Diagrams

### Job Submission & Processing Flow

<FullscreenDiagram>

```mermaid
sequenceDiagram
    participant C as Client
    participant A as API
    participant R as Redis
    participant W as Worker
    participant CF as ComfyUI
    
    Note over C,CF: Job Submission & Processing
    
    C->>A: POST /api/jobs (HTTP)
    A->>R: ZADD jobs:pending (add job to queue)
    A->>C: 201 Created {jobId}
    
    Note over C,A: Client connects for progress
    C->>A: GET /api/jobs/{jobId}/progress (SSE)
    A-->>C: SSE connection established
    
    Note over W,R: Worker polls for jobs
    loop Worker Polling
        W->>R: ZPOPMIN jobs:pending (get highest priority job)
        R->>W: job data (if available)
    end
    
    Note over W,CF: Job processing starts
    W->>CF: Start job (WebSocket)
    W->>R: HSET job:{jobId} status=assigned (mark job as taken)
    W->>R: XADD progress:{jobId} status=started (publish job started)
    
    Note over A,R: API reads progress stream
    A->>R: XREAD BLOCK 0 STREAMS progress:{jobId} $ (listen for progress)
    R-->>A: Stream data: status=started
    A-->>C: SSE: job started
    
    loop Progress Updates
        CF-->>W: Progress update (WebSocket)
        Note over W: Worker receives: {"progress": 25, "step": "preprocessing"}
        W->>R: XADD progress:{jobId} * progress=25 (publish 25% progress)
        R-->>A: Stream data: progress=25
        A-->>C: SSE: progress 25%
        
        CF-->>W: Progress update (WebSocket)  
        Note over W: Worker receives: {"progress": 75, "step": "rendering"}
        W->>R: XADD progress:{jobId} * progress=75 (publish 75% progress)
        R-->>A: Stream data: progress=75
        A-->>C: SSE: progress 75%
    end
    
    CF-->>W: Job completed (WebSocket)
    W->>R: HSET job:{jobId} status=completed (mark job done)
    W->>R: XADD progress:{jobId} * status=completed (publish completion)
    R-->>A: Stream data: completed
    A-->>C: SSE: job completed with result
    C->>A: Close SSE connection
```

</FullscreenDiagram>

### Job Cancellation Flow

<FullscreenDiagram>

```mermaid
sequenceDiagram
    participant M as Monitor
    participant A as API
    participant R as Redis
    participant W as Worker
    participant CF as ComfyUI
    
    Note over M,CF: Job Cancellation Sequence
    
    M->>A: POST /api/jobs/{jobId}/cancel (HTTP)
    A->>R: HSET job:{jobId} status=cancelled (mark job cancelled)
    A->>R: XADD commands:{workerId} action=cancel (send cancel command)
    A->>M: 200 OK
    
    Note over W,R: Worker checks for commands
    W->>R: XREAD commands:{workerId} (check for cancel commands)
    R->>W: cancel command
    
    Note over W,CF: Worker cancels job
    W->>CF: Cancel job (WebSocket)
    CF-->>W: Cancellation confirmed
    
    W->>R: HSET job:{jobId} status=cancelled (confirm cancellation)
    W->>R: XADD progress:{jobId} status=cancelled (publish cancelled status)
    
    Note over A,M: Monitor receives cancellation
    R-->>A: Stream read (progress)
    A-->>M: SSE: job cancelled
```

</FullscreenDiagram>

### Worker Job Polling Pattern

<FullscreenDiagram>

```mermaid
sequenceDiagram
    participant W as Worker
    participant R as Redis
    
    Note over W,R: Continuous Job Polling
    
    loop While Worker Running
        W->>R: ZPOPMIN jobs:pending
        alt Job Available
            R->>W: {jobId, jobData}
            W->>R: HSET job:{jobId} status=assigned worker_id={workerId}
            Note over W: Process job...
            W->>R: XADD progress:{jobId} status=completed
        else No Jobs
            R->>W: null
            Note over W: Sleep 1 second
        end
    end
```

</FullscreenDiagram>

### Multi-Client Progress Monitoring
```mermaid
sequenceDiagram
    participant C1 as Client 1
    participant C2 as Client 2
    participant M as Monitor
    participant A as API
    participant R as Redis
    participant W as Worker
    
    Note over C1,W: Multiple clients monitoring same job
    
    C1->>A: GET /api/jobs/{jobId}/progress (SSE)
    C2->>A: GET /api/jobs/{jobId}/progress (SSE)
    M->>A: GET /api/jobs/{jobId}/progress (SSE)
    
    Note over A: API maintains multiple SSE connections
    
    W->>R: XADD progress:{jobId} progress=50%
    
    R-->>A: Stream read
    
    par Broadcast to all clients
        A-->>C1: SSE: progress=50%
    and
        A-->>C2: SSE: progress=50%
    and
        A-->>M: SSE: progress=50%
    end
```

## Key Architectural Benefits

### Eliminated Complexity
- ❌ No WebSocket connection management in hub
- ❌ No message routing and orchestration logic
- ❌ No worker capability tracking in memory
- ❌ No complex bidirectional message handling

### Added Simplicity  
- ✅ Direct Redis operations (atomic, reliable)
- ✅ HTTP API for commands (standard REST patterns)
- ✅ SSE for streaming (browser-native, auto-reconnect)
- ✅ Redis handles all concurrency and race conditions

### Improved Reliability
- ✅ No single hub failure point
- ✅ Workers can restart independently
- ✅ Redis Streams provide guaranteed delivery
- ✅ Natural load balancing via Redis polling

## Data Structures in Redis

### Job Storage
```redis
# Pending jobs queue (sorted set by priority)
ZADD jobs:pending {priority_score} {job_id}

# Individual job data (hash)
HSET job:{job_id} 
  id {job_id}
  service_required "comfyui"
  status "pending|assigned|completed|failed|cancelled"
  worker_id {worker_id}
  created_at {timestamp}
  # ... other job fields

# Job progress streams
XADD progress:{job_id} * 
  progress 50
  message "Processing step 3 of 5"
  worker_id {worker_id}
  timestamp {timestamp}

# Worker command streams  
XADD commands:{worker_id} *
  action "cancel|pause|retry"
  job_id {job_id}
  timestamp {timestamp}
```

### Worker Coordination
```redis
# Active jobs per worker (for cleanup)
HSET jobs:active:{worker_id} {job_id} {job_data}

# Worker heartbeats (for health monitoring)
HSET worker:{worker_id}
  last_heartbeat {timestamp}
  status "idle|busy"
  current_job_id {job_id}
```

## Backwards Compatibility Implementation

The lightweight API supports both new (Redis-direct) and legacy (WebSocket) client patterns:

### Legacy WebSocket Client Support
```javascript
// Existing client code continues to work
const ws = new WebSocket('ws://api/hub');

// Submit job via WebSocket (legacy)
ws.send(JSON.stringify({
  type: 'submit_job',
  job_type: 'comfyui',
  payload: {...}
}));

// Receive progress via WebSocket (legacy)
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.type === 'job_progress') {
    updateProgress(message.progress);
  }
};
```

### API Implementation (Hybrid Support)
```typescript
class LightweightAPI {
  // WebSocket handler for backwards compatibility
  handleWebSocketMessage(ws, message) {
    switch (message.type) {
      case 'submit_job':
        // Submit to Redis (same as HTTP endpoint)
        const jobId = await redis.zadd('jobs:pending', priority, jobData);
        ws.send({type: 'job_submitted', job_id: jobId});
        break;
        
      case 'subscribe_progress':
        // Subscribe WebSocket client to Redis Stream
        this.subscribeWebSocketToProgress(ws, message.job_id);
        break;
    }
  }
  
  // Forward Redis Stream progress to WebSocket clients
  async subscribeWebSocketToProgress(ws, jobId) {
    const stream = redis.xread('BLOCK', 0, 'STREAMS', `progress:${jobId}`, '$');
    stream.on('data', (progressData) => {
      ws.send({
        type: 'job_progress', 
        job_id: jobId,
        progress: progressData.progress
      });
    });
  }
}
```

### Migration Path
1. **Phase 1**: API supports both WebSocket + SSE/HTTP
2. **Phase 2**: Migrate clients gradually to SSE/HTTP  
3. **Phase 3**: Deprecate WebSocket support (optional)

This architecture provides the same real-time capabilities as the WebSocket approach but with significantly reduced complexity and improved reliability for high-concurrency scenarios, while maintaining full backwards compatibility for existing clients.