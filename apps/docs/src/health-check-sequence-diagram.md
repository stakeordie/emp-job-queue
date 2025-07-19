# Health Check Sequence Diagram

This diagram shows how the automatic health check mechanism prevents stuck jobs by periodically verifying job progress with external services (ComfyUI, etc.).

## Problem Statement

Workers can get stuck when the normal WebSocket flow fails:

**Normal Flow:** Worker submits job → ComfyUI WebSocket sends progress updates → WebSocket sends `complete_job` message with results → Job marked complete

**Failure Scenarios:**
- **Cached Results**: ComfyUI completes instantly (cached result) but WebSocket never sends `complete_job` message
- **WebSocket Connection Loss**: Network issues cause WebSocket to disconnect before `complete_job` message
- **Missed Completion Signals**: Worker waits for `complete_job` message that never arrives
- **No Activity Timeout**: No WebSocket updates for >30 seconds, worker stuck waiting

## Solution: Automatic Health Check Loop

<FullscreenDiagram>

```mermaid
sequenceDiagram
    participant W as Worker
    participant HM as Health Monitor
    participant CM as Connector Manager
    participant CC as ComfyUI Connector
    participant CU as ComfyUI Service
    participant R as Redis

    Note over W,R: Normal Job Processing Flow
    W->>R: Request job from Redis
    R->>W: Return job (job_id: abc123)
    W->>CM: Get connector for service_type
    CM->>W: Return ComfyUI connector
    W->>CC: Process job (submit to ComfyUI)
    CC->>CU: POST /prompt (get prompt_id: xyz789)
    CC->>R: Store service_job_id mapping (abc123 → xyz789)
    CC->>CU: Connect to WebSocket /ws
    CU->>CC: WebSocket connected
    
    Note over CC,CU: Normal WebSocket Progress Updates
    loop Real-time updates
        CU->>CC: progress: {value: 5, max: 20}
        CC->>W: Send progress update (25%)
        CU->>CC: executing: {node_id: "sampler"}
        CC->>W: Send progress update (50%)
        CU->>CC: executed: {node_id: "sampler"}
        CC->>W: Send progress update (100%)
        CU->>CC: complete_job: {outputs, images, results}
        CC->>W: Job completed with results
        W->>R: Mark job as completed
    end
    
    alt Normal completion via WebSocket
        Note over CC,W: ✅ Job completes normally<br/>via WebSocket complete_job message
    else WebSocket stops updating (race condition)
        Note over CC,CU: ❌ No WebSocket updates for >30s<br/>complete_job message never received<br/>Job may have completed instantly (cached)<br/>or WebSocket connection lost
    end
    
    Note over W,R: Health Check Monitoring (Inactivity-Triggered Backup)
    Note over HM: Triggered when WebSocket goes inactive<br/>(no messages received for >30 seconds)
    
    Note over W,R: WebSocket Inactivity Detected (>30s)
    Note over HM: Health check triggered for inactive job
    HM->>CM: Get connector for job service_type
    CM->>HM: Return ComfyUI connector
    HM->>CC: healthCheckJob(job_id)
    CC->>R: Get service_job_id for job
    R->>CC: Return prompt_id: xyz789
    CC->>CU: GET /history/xyz789 (check completion)
    
    alt Job completed in ComfyUI
        CU->>CC: Return completed history
        CC->>HM: {action: "complete_job", result: outputs}
        HM->>W: Complete job with recovered result
        W->>R: Mark job as completed
    else Job failed in ComfyUI
        CU->>CC: Return error status
        CC->>HM: {action: "fail_job", reason: "service_error"}
        HM->>W: Fail job with service error
        W->>R: Mark job as failed
    else Job still running
        CU->>CC: Return running status
        CC->>HM: {action: "continue_monitoring"}
        HM->>W: Continue normal monitoring
    else Job not found in ComfyUI
        CU->>CC: 404 or empty history
        CC->>HM: {action: "return_to_queue", reason: "service_job_not_found"}
        HM->>W: Return job to queue for retry
        W->>R: Return job to pending queue
    end

    Note over W,R: Race Condition Prevention
    Note right of CC: Service job ID mapping enables recovery<br/>even when WebSocket connections fail<br/>or jobs complete instantly
    
    Note over W,R: Key Benefits
    Note right of HM: - Prevents workers stuck on completed jobs<br/>- Recovers lost job results<br/>- Handles network failures gracefully<br/>- Maintains job queue integrity
```

</FullscreenDiagram>

## Implementation Details

### Health Check Trigger Conditions
1. **WebSocket Inactivity**: Triggered when no WebSocket messages received for >30 seconds
2. **Worker Status**: Only check when worker status is "busy"  
3. **Active Jobs**: Only check jobs in `currentJobs` map
4. **Message Reset**: Any WebSocket message (progress, executing, executed) resets the inactivity timer
5. **Timer-Based**: Health check runs periodically (every 30s) but only acts on inactive jobs

### Health Check Actions
- **complete_job**: Job found completed in service, recover results and complete
- **fail_job**: Job failed in service, mark as failed
- **return_to_queue**: Job not found or submission failed, retry
- **continue_monitoring**: Job still processing normally

### Service Job ID Mapping
```typescript
// Stored immediately when job is submitted to external service
await redis.hmset(`job:${jobId}`, {
  service_job_id: promptId,           // ComfyUI prompt_id
  service_submitted_at: timestamp,    // When submitted to service
  last_service_check: timestamp,      // Last health check time
  service_status: 'submitted'         // Last known service status
});
```

### Configuration
- `WORKER_HEALTH_CHECK_INTERVAL_MS`: Health check frequency (default: 30000ms)
- `WORKER_WEBSOCKET_INACTIVITY_TIMEOUT_MS`: WebSocket inactivity threshold (default: 30000ms)
- Health check timeout: 5 seconds per request

## Architecture Alignment

This health check mechanism advances the **North Star** goals:

1. **Reliability**: Prevents job loss and stuck workers in distributed environments
2. **Elasticity**: Enables confident scaling knowing jobs won't get lost
3. **Observability**: Provides detailed logging of recovery actions
4. **Foundation**: Critical infrastructure for specialized machine pools

The health check system ensures robust job processing across ephemeral machines and prepares for advanced pool-aware routing.