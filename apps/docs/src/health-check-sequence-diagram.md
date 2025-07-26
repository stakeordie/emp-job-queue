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
    participant SC as Service Connector
    participant SV as External Service
    participant R as Redis

    Note over W,R: Normal Job Processing Flow
    W->>R: Request job from Redis
    R->>W: Return job (job_id: abc123)
    W->>CM: Get connector for service_type
    CM->>W: Return Service Connector (ComfyUI/A1111/Simulation)
    W->>SC: Process job (submit to service)
    SC->>SV: Submit job (service-specific: ComfyUI prompt, A1111 generate, etc.)
    SC->>R: Store service_job_id mapping (abc123 → service_id)
    SC->>SV: Connect for progress updates (WebSocket/polling)
    SV->>SC: Connection established
    
    Note over SC,SV: Normal Progress Updates (Service-Specific)
    loop Real-time updates
        SV->>SC: progress update (service-specific format)
        SC->>W: Send standardized progress update (25%)
        SV->>SC: processing update
        SC->>W: Send standardized progress update (50%)
        SV->>SC: completion signal
        SC->>W: Send standardized progress update (100%)
        SV->>SC: complete_job: {results in service format}
        SC->>W: Job completed with standardized results
        W->>R: Mark job as completed
    end
    
    alt Normal completion
        Note over SC,W: ✅ Job completes normally<br/>via progress updates and complete_job message
    else Progress updates stop (race condition)
        Note over SC,SV: ❌ No progress updates for >30s<br/>complete_job message never received<br/>Job may have completed instantly (cached)<br/>or connection lost
    end
    
    Note over W,R: Health Check Monitoring (Inactivity-Triggered Backup)
    Note over HM: Triggered when WebSocket goes inactive<br/>(no messages received for >30 seconds)
    
    Note over W,R: Progress Inactivity Detected (>30s)
    Note over HM: Health check triggered for inactive job
    HM->>CM: Get connector for job service_type
    CM->>HM: Return Service Connector (ComfyUI/A1111/Simulation)
    HM->>SC: healthCheckJob(job_id) - service-specific implementation
    SC->>R: Get service_job_id for job
    R->>SC: Return service_id (prompt_id, task_id, etc.)
    SC->>SV: Check job status (service-specific API)
    
    alt Job completed in Service
        SV->>SC: Return completed status/results
        SC->>HM: {action: "complete_job", result: service_outputs}
        HM->>W: Complete job with recovered result
        W->>R: Mark job as completed
    else Job failed in Service
        SV->>SC: Return error status
        SC->>HM: {action: "fail_job", reason: "service_error"}
        HM->>W: Fail job with service error
        W->>R: Mark job as failed
    else Job still running in Service
        SV->>SC: Return running/active status
        SC->>HM: {action: "continue_monitoring"}
        HM->>W: Continue normal monitoring
    else Job not found in Service
        SV->>SC: 404 or not found
        SC->>HM: {action: "return_to_queue", reason: "service_job_not_found"}
        HM->>W: Return job to queue for retry
        W->>R: Return job to pending queue
    end

    Note over W,R: Race Condition Prevention
    Note right of SC: Service job ID mapping enables recovery<br/>across all service types (ComfyUI, A1111, etc.)<br/>even when progress connections fail<br/>or jobs complete instantly
    
    Note over W,R: Key Benefits
    Note right of HM: - Service-specific health checks (ComfyUI history, A1111 progress, Simulation recovery)<br/>- Prevents workers stuck on completed jobs<br/>- Recovers lost job results across all services<br/>- Handles network failures gracefully<br/>- Maintains job queue integrity
```

</FullscreenDiagram>

## Implementation Details

### Health Check Trigger Conditions
1. **WebSocket Inactivity**: Triggered when no WebSocket messages received for >30 seconds
2. **Worker Status**: Only check when worker status is "busy"  
3. **Active Jobs**: Only check jobs in `currentJobs` map
4. **Message Reset**: Any WebSocket message (progress, executing, executed) resets the inactivity timer
5. **Timer-Based**: Health check runs periodically (every 30s) but only acts on inactive jobs

### Health Check Actions (Service-Specific)
- **complete_job**: Job found completed in service, recover results and complete
- **fail_job**: Job failed in service, mark as failed  
- **return_to_queue**: Job not found or submission failed, retry
- **continue_monitoring**: Job still processing normally

### Service-Specific Health Check Implementations
- **ComfyUI**: Queries `/history/{prompt_id}` API to check completion status and recover outputs
- **A1111**: Checks `/sdapi/v1/progress` API and attempts history recovery for completed jobs
- **Simulation**: Always assumes completion for testing (simulates 1 in 25 jobs missing complete_job message)

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
- `WORKER_SIMULATION_HEALTH_CHECK_FAILURE_RATE`: Simulation failure rate for testing (default: 0.04 = 1 in 25)
- Health check timeout: 5 seconds per request

## Architecture Alignment

This health check mechanism advances the **North Star** goals:

1. **Reliability**: Prevents job loss and stuck workers in distributed environments
2. **Elasticity**: Enables confident scaling knowing jobs won't get lost
3. **Observability**: Provides detailed logging of recovery actions
4. **Foundation**: Critical infrastructure for specialized machine pools

The health check system ensures robust job processing across ephemeral machines and prepares for advanced pool-aware routing.