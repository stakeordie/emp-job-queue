# [2025-01-08 21:15] - Delegated Job Visibility Architecture Issue

## Context

During debugging session investigating why delegated workflow jobs appear in Redis logs repeatedly but don't show up in the monitor UI, despite having correct state in Redis.

## Problem Discovery

### The Issue
- **Delegated workflow jobs exist in Redis state** with proper `status: pending` and `service_required: p5`
- **Jobs complete successfully** and persist in Redis (no auto-cleanup of completed jobs)
- **Monitor UI never shows these jobs** despite them being in Redis
- **Redis HGETALL scans detect them** but they're architecturally invisible

### Root Cause Analysis

The system uses an **event-driven monitor architecture** where jobs only become visible through specific events:

1. **Normal job flow**: `submit_job` → API publishes `job_submitted` event → Monitor displays job
2. **Delegated job flow**: Workflow service creates job directly in Redis → **NO EVENT PUBLISHED** → Monitor never sees it

### Technical Details

**Event Publication Flow:**
```typescript
// Normal jobs (apps/api/src/lightweight-api-server.ts)
await this.submitJob(jobData) → publishes job_submitted event

// Delegated jobs 
// Created directly by workflow service → NO job_submitted event
```

**Monitor Visibility Requirements:**
```typescript
// Monitor only shows jobs that went through event pipeline
// State existence != Event visibility
```

## Architectural Insight

This reveals a **fundamental fragility in event-driven architecture**:
- Jobs can exist in persistent state (Redis) 
- But be invisible to consumers (Monitor) due to missing events
- Creates inconsistent system behavior where state != visible state

## Impact Assessment

### Current Impact
- **Workflow progress tracking incomplete** - users cannot see all active jobs
- **Debugging complexity** - jobs exist but appear missing
- **User experience degradation** - incomplete job visibility
- **System reliability perception** - appears jobs are "lost"

### Future Risk
- **Scaling issues** - more workflow jobs = more invisible work
- **Monitoring blindness** - cannot track actual system load
- **Operational complexity** - state vs. visibility mismatches

## Required Solution

### Short-term Fix
1. **Add event publication to delegated job creation** in workflow service
2. **Publish `job_submitted` events** for all delegated jobs when created

### Long-term Architectural Fix
**Move to state-driven monitor architecture:**
- Monitor displays whatever jobs exist in Redis state
- Events become optimization for real-time updates, not visibility requirement
- Eliminates event-state visibility gaps

## Files Affected

- **Monitor visibility logic**: Event-driven job display
- **API event publication flow**: Missing delegated job events  
- **Workflow service**: Direct Redis job creation bypasses events

## Priority

**High** - Affects workflow transparency and system reliability perception

## Next Steps

1. Document this as architectural debt in north star planning
2. Consider state-driven monitor refactor priority
3. Add delegated job event publication as temporary fix
4. Include in architectural review for Phase 2 planning

---

**Key Learning**: Event-driven architectures require complete event coverage - partial event publication creates invisible state that degrades system observability and user trust.