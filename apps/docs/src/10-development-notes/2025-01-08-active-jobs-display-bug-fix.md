# [2025-01-08] Active Jobs Display Bug Fix

**Date:** January 8, 2025  
**Issue:** Jobs being processed by workers not showing in the monitor's "Active Jobs" section  
**Status:** ✅ **RESOLVED**

## Problem Description

Users reported that jobs being actively worked on by workers were not appearing in the Active Jobs list in the monitor UI. The jobs would show 0% progress and the user asked: "what is the logic to make it active? does it need a progress over 0%?"

## Root Cause Analysis

The issue was a **type system mismatch** between the core job status definitions and the monitor UI:

### Core JobStatus Enum (Correct)
```typescript
// packages/core/src/types/job.ts
export enum JobStatus {
  PENDING = 'pending',
  QUEUED = 'queued', 
  ASSIGNED = 'assigned',
  ACCEPTED = 'accepted',
  IN_PROGRESS = 'in_progress',  // ← Jobs being processed
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  TIMEOUT = 'timeout',
  UNWORKABLE = 'unworkable',
}
```

### Monitor UI Status Filters (Incorrect)
```typescript
// apps/monitor/src/app/page.tsx - BEFORE FIX
const jobCounts = useMemo(() => {
  const counts = {
    active: jobs.filter(job => 
      job.status === 'active' || job.status === 'processing'  // ← NON-EXISTENT STATUSES!
    ).length,
    // ...
  };
}, [jobs]);
```

### Monitor Type Definition (Also Incorrect)
```typescript
// apps/monitor/src/types/job.ts - BEFORE FIX
export type JobStatus = 
  | 'pending' 
  | 'assigned' 
  | 'active'        // ← DOESN'T EXIST
  | 'processing'    // ← DOESN'T EXIST
  | 'completed' 
  | 'failed';
```

## Actual Job Lifecycle

When workers process jobs, this is the actual status flow:

1. **Job submitted** → `pending`
2. **Worker claims job** → `assigned` (via Redis Function)
3. **Worker starts processing** → `in_progress` (via `startJobProcessing()`)
4. **Worker completes** → `completed`

The worker explicitly sets jobs to `IN_PROGRESS` status:

```typescript
// apps/worker/src/redis-direct-worker-client.ts:693-697
await this.redis.hmset(`job:${jobId}`, {
  status: JobStatus.IN_PROGRESS,
  started_at: new Date().toISOString(),
});
```

But the monitor was looking for non-existent `'active'` and `'processing'` statuses!

## The Fix

### 1. Updated Monitor Active Job Logic
```typescript
// apps/monitor/src/app/page.tsx - AFTER FIX
const jobCounts = useMemo(() => {
  const counts = {
    active: jobs.filter(job => 
      job.status === 'in_progress' || job.status === 'assigned' || job.status === 'accepted'
    ).length,
    // ...
  };
}, [jobs]);

const activeJobsList = useMemo(() => 
  jobs.filter(job => 
    job.status === 'in_progress' || job.status === 'assigned' || job.status === 'accepted'
  ),
  [jobs]
);
```

### 2. Updated Badge Styling Logic
```typescript
// apps/monitor/src/app/page.tsx - Badge styling
<Badge variant={
  job.status === 'in_progress' || job.status === 'assigned' || job.status === 'accepted' 
    ? 'secondary' : 'outline'
}>
```

### 3. Fixed Monitor Type Definitions
```typescript
// apps/monitor/src/types/job.ts - AFTER FIX  
export type JobStatus = 
  | 'pending' 
  | 'queued'
  | 'assigned' 
  | 'accepted'
  | 'in_progress'    // ← NOW MATCHES CORE
  | 'completed' 
  | 'failed' 
  | 'cancelled' 
  | 'timeout'
  | 'unworkable';
```

## Answer to "Does it need progress > 0%?"

**No.** Progress percentage is completely separate from active status. Jobs are considered "active" based on their **status field**, not their progress value:

- `assigned` = Worker has claimed the job but hasn't started processing yet
- `accepted` = Worker has accepted the job (intermediate state) 
- `in_progress` = Worker is actively processing the job (regardless of 0% or 50% progress)

Progress can be 0% and the job is still "active" if the status is `in_progress`.

## Impact

- **Before Fix:** Active jobs showed as 0 count, jobs appeared "stuck" in pending
- **After Fix:** Jobs being processed correctly appear in Active Jobs section
- **User Experience:** Much clearer visibility into what workers are actually doing

## Key Lessons

1. **Type Safety Matters**: The monitor had its own job type definitions that diverged from the core package
2. **Status vs Progress**: Job "active" state is determined by status enum, not progress percentage
3. **Cross-Package Consistency**: Monitor should import types from `@emp/core` rather than defining its own
4. **Testing Real Workflows**: This bug only appeared when actually running jobs through workers

## Files Changed

- `apps/monitor/src/app/page.tsx` - Updated active job filtering logic
- `apps/monitor/src/types/job.ts` - Fixed JobStatus type to match core enum

## Future Prevention

Consider importing JobStatus directly from `@emp/core` in monitor to prevent type drift:

```typescript
// Potential improvement
import { JobStatus } from '@emp/core';
```

## Testing Verification

To test the fix:
1. Start local development environment
2. Submit a job through the monitor UI
3. Verify the job appears in "Active Jobs" section when worker claims it
4. Verify status shows as `assigned` → `in_progress` → `completed`

**Status:** This fix resolves the core issue where active jobs weren't displaying in the monitor UI.