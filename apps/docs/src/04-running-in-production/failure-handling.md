# Failure Handling & Recovery

This document provides a comprehensive overview of failure scenarios in the EmProps Job Queue system and how they are currently handled (or not handled).

## System Architecture Overview

<FullscreenDiagram>

```mermaid
graph TB
    Client[Client/EmProps API] -->|WebSocket + REST| API[API Server]
    API -->|Redis Pub/Sub| Redis[(Redis)]
    API -->|WebSocket Health| Monitor[Monitor UI]
    
    Redis -->|Job Queue| Worker1[Worker 1]
    Redis -->|Job Queue| Worker2[Worker 2]
    Worker1 -->|ComfyUI API| ComfyUI1[ComfyUI Instance]
    Worker2 -->|External API| ExtAPI[External Service]
    
    subgraph "Failure Points"
        FP1[WebSocket Disconnect]
        FP2[Redis Connection Loss]
        FP3[Worker Crash]
        FP4[ComfyUI Failure]
        FP5[Job Timeout]
        FP6[API Server Crash]
    end
```

</FullscreenDiagram>

## Job Lifecycle & Status Tracking

### Current Job States
- **PENDING** → Submitted to queue, waiting for worker
- **ASSIGNED** → Worker claimed the job
- **IN_PROGRESS** → Worker actively processing
- **COMPLETED** → Job finished successfully
- **FAILED** → Job failed (with retry logic)
- **TIMEOUT** → Job exceeded time limits
- **CANCELLED** → Manually cancelled
- **UNWORKABLE** → No available workers can handle

### Job Data Persistence
All job information is stored in Redis with comprehensive tracking:

```typescript
interface Job {
  // Core tracking
  id: string;
  status: JobStatus;
  worker_id?: string;
  
  // Failure handling
  retry_count: number;
  max_retries: number;
  last_failed_worker?: string;
  failed_at?: string;
  
  // Service integration
  service_job_id?: string;
  service_status?: string;
  last_service_check?: string;
  
  // Timing
  timeout_minutes?: number;
  estimated_completion?: string;
}
```

## Failure Scenarios Analysis

### 1. WebSocket Connection Failures

<FullscreenDiagram>

```mermaid
sequenceDiagram
    participant C as Client
    participant A as API Server
    participant R as Redis
    participant W as Worker

    C->>A: Submit Job via WebSocket
    A->>R: Store Job
    A--xC: WebSocket Disconnect ❌
    
    Note over W,R: Job continues processing
    W->>R: Update job progress
    
    C->>A: Query job status via REST ✅
    A->>R: Get job data
    A->>C: Return current status
```

</FullscreenDiagram>

**Current Handling:** ✅ **HANDLED**
- Jobs remain queryable via REST API (`GET /api/jobs/:jobId`)
- Job processing continues independently
- Client can reconnect and resume monitoring

**Gaps:**
- No automatic WebSocket reconnection
- No job subscription restoration on reconnect

### 2. API Server Crash

<FullscreenDiagram>

```mermaid
graph LR
    subgraph "Before Crash"
        C1[Client] -->|WebSocket| A1[API Server]
        A1 --> R1[(Redis)]
        W1[Worker] --> R1
    end
    
    subgraph "During Crash"
        A2[API Server ❌] 
        C2[Client] -.->|Connection Lost| A2
        W2[Worker] --> R2[(Redis)]
        R2 --> |Jobs Continue| W2
    end
    
    subgraph "After Restart"
        C3[Client] -->|Reconnect| A3[API Server ✅]
        A3 --> R3[(Redis)]
        A3 -.->|Cleanup Stale Data| R3
        W3[Worker] --> R3
    end
```

</FullscreenDiagram>

**Current Handling:** ✅ **HANDLED**
- Startup cleanup removes stale machine/worker data
- Jobs in Redis remain intact
- Workers continue processing independently
- Automatic stale machine detection (30s timeout)

### 3. Worker/Machine Failures

<FullscreenDiagram>

```mermaid
sequenceDiagram
    participant A as API Server
    participant R as Redis
    participant W as Worker
    participant S as External Service

    A->>R: Job assigned to Worker
    R->>W: Worker claims job
    W->>S: Start processing (service_job_id stored)
    
    Note over W: Worker crashes ❌
    
    loop Stale Detection (30s)
        A->>R: Check worker heartbeat
        A->>A: No response detected
    end
    
    A->>R: Mark worker as stale
    
    rect rgb(255, 200, 200)
        Note over A,S: ❌ CURRENT BEHAVIOR (PROBLEMATIC)
        A->>R: Immediately reset job to PENDING
        A->>R: Re-add to queue (no service check)
    end
    
    rect rgb(200, 255, 200)
        Note over A,S: ✅ RECOMMENDED BEHAVIOR
        A->>S: Check job status using service_job_id
        alt Job completed on service
            A->>R: Mark job as COMPLETED
        else Job NOT completed (in progress, failed, not found)
            A->>A: Increment retry_count
            alt retry_count > max_retries
                A->>R: Mark job as FAILED (max retries exceeded)
            else retry_count <= max_retries
                A->>R: Reset to PENDING for retry
            end
        end
    end
```

</FullscreenDiagram>

**Current Handling:** ⚠️ **PARTIALLY HANDLED**
- ✅ Stale worker detection (30s timeout)
- ✅ Retry count tracking (`retry_count` field in job)
- ✅ Configurable max retries (`max_retries` field, default: 3)
- ✅ **Retry limit enforcement during worker cleanup** (FIXED)
- ❌ **No service status verification before re-queuing**
- ❌ **Jobs may be duplicated if service completed**

**Critical Gaps:**
- Jobs that completed on external service get re-queued unnecessarily
- Potential duplicate processing and resource waste

**Completed Improvements:**
- ✅ **Retry limit enforcement fixed** - `cleanupWorker` now properly increments `retry_count` and fails jobs exceeding `max_retries`
- ✅ **Structured health check framework** - Connectors must implement required failure recovery capabilities

**Remaining Work:**
- Check external service status before re-queuing
- Only mark as COMPLETED if external service confirms completion
- Re-queue everything else (avoids hanging on potentially broken services)

### 4. External Service Failures (ComfyUI, APIs)

<FullscreenDiagram>

```mermaid
graph TB
    subgraph "Service Failure Scenarios"
        W[Worker] --> CF{ComfyUI Available?}
        CF -->|Yes| C[ComfyUI Processing]
        CF -->|No ❌| RF[Service Unreachable]
        
        C --> CS{ComfyUI Success?}
        CS -->|Yes| Success[Job Complete ✅]
        CS -->|No| Error[Service Error ❌]
        
        RF --> Retry[Worker Retry Logic]
        Error --> Retry
        Retry --> |Max attempts| Failed[Job Failed ❌]
    end
```

</FullscreenDiagram>

**Current Handling:** ⚠️ **LIMITED**
- Worker-level retry logic varies by connector
- Service errors reported back to job queue
- `service_status` field available but underutilized

**Major Gaps:**
- No centralized external service health monitoring
- No intelligent routing around failed services
- No automatic service recovery detection

### 5. Job Timeout Scenarios

<FullscreenDiagram>

```mermaid
gantt
    title Job Timeout Handling
    dateFormat X
    axisFormat %H:%M

    section Current System
    Job Submitted    :milestone, 0, 0
    Worker Processing: active, 0, 1800
    No Timeout Check : crit, 1200, 1800
    Job Continues    : 1800, 3600
    
    section Needed System
    Job Submitted    :milestone, 0, 0  
    Worker Processing: active, 0, 1200
    Timeout Check    : crit, 1200, 1210
    Job Cancelled    : done, 1210, 1220
```

</FullscreenDiagram>

**Current Handling:** ❌ **NOT HANDLED**
- `timeout_minutes` field exists but not enforced
- Jobs can run indefinitely
- No proactive timeout monitoring

**Impact:**
- Resource waste on stuck jobs
- Poor user experience with "hung" jobs
- Potential service degradation

### 6. Redis Connection Loss

<FullscreenDiagram>

```mermaid
sequenceDiagram
    participant A as API Server
    participant R as Redis
    participant W as Worker

    Note over R: Redis becomes unavailable ❌
    
    A--xR: Connection lost
    W--xR: Connection lost
    
    Note over A,W: System becomes non-functional
    
    Note over R: Redis restored ✅
    
    A->>R: Reconnect
    W->>R: Reconnect
    
    Note over A,W: Normal operation resumes
    Note over A: Stale cleanup runs
```

</FullscreenDiagram>

**Current Handling:** ⚠️ **PARTIAL**
- Redis connection errors handled gracefully
- System becomes non-functional during outage
- Automatic reconnection attempts
- Startup cleanup after restoration

**Gaps:**
- No job state validation after Redis recovery
- Potential data inconsistency during outage

## Current Monitoring & Recovery

### Automatic Cleanup Systems

1. **Stale Machine Detection** (30s interval)
   ```typescript
   // Automatic cleanup of unreachable machines
   private async checkStaleMachines(): Promise<void> {
     const staleThreshold = 30000; // 30 seconds
     // Mark machines as stale and cleanup workers
   }
   ```

2. **Startup Cleanup**
   ```typescript
   // Removes orphaned data from previous crashes
   private async cleanupStaleDataOnStartup(): Promise<void> {
     // Clean machines without TTL
     // Remove stale worker data
   }
   ```

3. **WebSocket Health Monitoring**
   ```typescript
   // Ping/pong with 3 missed pong tolerance
   const maxMissedPongs = 3;
   // Automatic client disconnection on timeout
   ```

### Manual Cleanup Endpoints

- `POST /api/cleanup` - Manual worker/job cleanup
- `GET /api/jobs/:id` - Always available for status checking
- Monitor UI provides real-time visibility

## Failure Recovery Recommendations

### High Priority Improvements

1. **Job Timeout Enforcement**
   ```typescript
   interface JobTimeoutMonitor {
     checkInterval: number; // 30s
     enforceTimeouts(): Promise<void>;
     cancelTimedOutJob(jobId: string): Promise<void>;
   }
   ```

2. **Enhanced WebSocket Recovery**
   ```typescript
   interface WebSocketRecovery {
     autoReconnect: boolean;
     restoreJobSubscriptions(): Promise<void>;
     backoffStrategy: 'exponential' | 'linear';
   }
   ```

3. **Service Health Monitoring**
   ```typescript
   interface ServiceHealth {
     checkExternalServices(): Promise<ServiceStatus[]>;
     routeAroundFailedServices(): Promise<void>;
     markServiceUnavailable(service: string): Promise<void>;
   }
   ```

### Medium Priority Improvements

4. **Progressive Backoff for Retries**
   ```typescript
   interface RetryStrategy {
     baseDelay: number;
     maxDelay: number;
     backoffMultiplier: number;
     jitter: boolean;
   }
   ```

5. **Partial Progress Checkpointing**
   ```typescript
   interface JobCheckpoint {
     saveProgress(jobId: string, data: unknown): Promise<void>;
     resumeFromCheckpoint(jobId: string): Promise<unknown>;
   }
   ```

## Testing Failure Scenarios

### Current Test Coverage

1. **Integration Tests** ✅
   - Machine health reporting
   - WebSocket connection handling
   - Job lifecycle management

2. **Missing Test Scenarios** ❌
   - Job timeout enforcement
   - Service failure simulation
   - Redis connection loss recovery
   - Partial progress restoration

### Recommended Test Additions

```typescript
describe('Failure Scenarios', () => {
  it('should timeout jobs after specified duration')
  it('should handle Redis disconnection gracefully')
  it('should recover from external service failures')
  it('should restore job subscriptions after reconnection')
  it('should cleanup orphaned jobs automatically')
})
```

## Monitoring Dashboard Insights

The Monitor UI currently provides:

- ✅ Real-time job status tracking
- ✅ Worker health monitoring  
- ✅ Machine status visibility
- ✅ WebSocket connection status

**Missing Monitoring:**
- ❌ Job timeout warnings
- ❌ Service health indicators
- ❌ Retry attempt visualization
- ❌ Failure rate metrics

## Summary

The EmProps Job Queue system has **solid foundations** for failure handling:

**Strengths:**
- Persistent job storage in Redis
- Automatic stale detection and cleanup
- Retry logic with configurable limits
- Always-available REST API for job queries
- Comprehensive job status tracking

**Critical Gaps:**
- Job timeout enforcement
- Service health monitoring
- WebSocket reconnection recovery
- Partial progress preservation

**Recommendation:** Prioritize job timeout enforcement and service health monitoring for immediate reliability improvements.