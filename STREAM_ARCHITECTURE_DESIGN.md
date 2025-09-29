# Business Stream Architecture Design

## Current Streams
- `telemetry:events` - Observability/debugging (fire-and-forget)
- `progress:${jobId}` - **REMOVED** (was redundant with pub/sub)

## Proposed Business Streams (Durable & Critical)

### 1. Job Lifecycle Stream: `job:lifecycle`
**Purpose**: Critical job state changes that cannot be missed
**Consumers**: Webhook service, workflow orchestrator, billing service
**Events**:
```typescript
// PLACEHOLDER - Current pub/sub events to migrate here
- job.submitted     // From API when job created
- job.claimed       // From worker when job claimed
- job.started       // From worker when processing begins
- job.completed     // From worker when finished
- job.failed        // From worker when failed (permanent or retry)
- job.timeout       // From system when job times out
- job.cancelled     // From API when user cancels
```

### 2. Workflow Lifecycle Stream: `workflow:lifecycle`
**Purpose**: Multi-job workflow coordination
**Consumers**: Workflow orchestrator, webhook service
**Events**:
```typescript
// PLACEHOLDER - New workflow-specific events
- workflow.created           // API creates new workflow
- workflow.job_completed     // Individual job in workflow completes
- workflow.step_completed    // All jobs in a step complete
- workflow.completed         // Entire workflow completes
- workflow.failed            // Workflow fails (job failure or timeout)
- workflow.paused            // User/system pauses workflow
- workflow.resumed           // User/system resumes workflow
```

### 3. Worker Lifecycle Stream: `worker:lifecycle`
**Purpose**: Worker registration, availability, health
**Consumers**: Load balancer, capacity planner, machine orchestrator
**Events**:
```typescript
// PLACEHOLDER - Worker state management
- worker.registered     // Worker comes online
- worker.disconnected   // Worker goes offline (planned/unplanned)
- worker.status_changed // idle -> busy -> idle transitions
- worker.health_check   // Periodic health status
- worker.capacity_changed // Worker capabilities updated
```

### 4. Machine Lifecycle Stream: `machine:lifecycle`
**Purpose**: Machine/infrastructure events
**Consumers**: Scaling service, cost tracking, health monitoring
**Events**:
```typescript
// PLACEHOLDER - Infrastructure management
- machine.provisioned    // New machine created
- machine.ready          // Machine fully initialized
- machine.maintenance    // Machine entering maintenance
- machine.decommissioned // Machine being destroyed
- machine.resource_alert // CPU/memory/disk warnings
```

## Stream Consumption Patterns

### Webhook Service
**Subscribes to**:
- `job:lifecycle` (job.completed, job.failed)
- `workflow:lifecycle` (workflow.completed, workflow.failed)
**Ignores**: Worker/machine events, progress updates

### Workflow Orchestrator
**Subscribes to**:
- `job:lifecycle` (job.completed, job.failed)
- `workflow:lifecycle` (all events)
**Ignores**: Worker/machine infrastructure events

### Load Balancer/Capacity Planner
**Subscribes to**:
- `worker:lifecycle` (registration, status, health)
- `machine:lifecycle` (provisioning, decommissioning)
**Ignores**: Individual job events

### Billing Service
**Subscribes to**:
- `job:lifecycle` (job.completed for billing)
- `machine:lifecycle` (machine.provisioned, decommissioned for cost tracking)
**Ignores**: Progress updates, worker status changes

### Monitoring/Alerting
**Subscribes to**:
- `telemetry:events` (for debugging)
- `machine:lifecycle` (for infrastructure alerts)
- `worker:lifecycle` (for capacity alerts)
**Ignores**: Individual job progress

## Stream Design Decisions Needed

### 1. Granularity
- **Fine-grained**: Separate stream per event type (`job:completed`, `job:failed`)
- **Coarse-grained**: Combined stream with event type filtering (`job:lifecycle`)
- **Hybrid**: Group related events but separate major categories

### 2. Retention Policies
- **job:lifecycle**: 30 days (audit trail)
- **workflow:lifecycle**: 90 days (long-running workflows)
- **worker:lifecycle**: 7 days (operational monitoring)
- **machine:lifecycle**: 90 days (cost/capacity analysis)

### 3. Ordering Guarantees
- **job:lifecycle**: Must be ordered per job
- **workflow:lifecycle**: Must be ordered per workflow
- **worker:lifecycle**: Order per worker
- **machine:lifecycle**: Order per machine

### 4. Consumer Group Strategy
- Each service gets its own consumer group
- Services can restart and resume from last processed event
- Multiple instances of same service share consumer group

## Migration Strategy

### Phase 1: Create Streams (Current)
- [ ] Add placeholder stream writes alongside existing pub/sub
- [ ] Implement basic stream consumers
- [ ] Verify stream ordering and reliability

### Phase 2: Migrate Consumers
- [ ] Update webhook service to read from `job:lifecycle` stream
- [ ] Update workflow orchestrator to read from streams
- [ ] Maintain pub/sub for backward compatibility

### Phase 3: Remove Pub/Sub
- [ ] Remove pub/sub writes once all consumers migrated
- [ ] Keep only real-time progress pub/sub for UI updates

## Questions to Resolve

1. **Stream Naming**: `job:lifecycle` vs `jobs:lifecycle` vs `events:job`?
2. **Event Schema**: Standardized event envelope vs free-form data?
3. **Cross-Stream Events**: How to correlate job events with workflow events?
4. **Error Handling**: Dead letter streams for processing failures?
5. **Monitoring**: How to monitor stream lag and processing health?