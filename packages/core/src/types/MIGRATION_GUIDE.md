# Developer Migration Guide

## Quick Reference

### When to use Step vs Job

**Use `Step` when:**
- Working with worker processing units
- Referring to individual items in the queue
- Dealing with what workers claim and execute
- Old code used: `Job`, `jobId`, `job_id`

**Use `Job` when:**
- Working with user requests
- Referring to what customers submit
- Dealing with workflows or collections of steps
- Old code used: `Workflow`, `workflowId`, `workflow_id`

## Import Examples

### Old Way (Still works, but deprecated)
```typescript
import { Job } from '@emp/core';  // ⚠️  Confusing - actually means "Step"

const job: Job = await getJob(jobId);  // Actually getting a Step
```

### New Way (Recommended)
```typescript
import { Step } from '@emp/core';  // ✅ Clear - worker processing unit

const step: Step = await getStep(stepId);  // Clear intent
```

### For User Requests
```typescript
import { Job } from '@emp/core/types/job-new.js';  // ✅ User's request

const job: Job = {
  id: 'user-request-123',
  customer_id: 'cust-456',
  priority: 5,
  steps: [
    { step_id: 'step-1', sequence: 1, status: 'pending' },
    { step_id: 'step-2', sequence: 2, status: 'pending' }
  ]
};
```

## Common Patterns

### Worker Code
```typescript
// OLD (still works)
const currentJob = await claimJob(workerId);

// NEW (clearer)
const currentStep = await claimStep(workerId);
```

### API Code
```typescript
// OLD (confusing)
async function submitWorkflow(workflowData) {
  const jobId = await createJob(workflowData);
  return jobId;
}

// NEW (clear)
async function submitJob(jobData) {
  const jobId = await createJob(jobData);
  // Job can have multiple steps
  for (const stepData of jobData.steps) {
    await createStep(jobId, stepData);
  }
  return jobId;
}
```

### Redis Keys
```typescript
// OLD
const key = `job:${jobId}:status`;  // Ambiguous

// NEW
const stepKey = `step:${stepId}:status`;  // Worker processing unit
const jobKey = `job:${jobId}:status`;     // User request
```

## Migration Timeline

- **Now**: Both old and new terminology work
- **Phase 3**: Implementations updated to use new types
- **Phase 4**: API endpoints updated, documentation revised
- **Future**: Old terminology deprecated and eventually removed

## Need Help?

1. Check `MIGRATION_STATUS.md` for current migration state
2. Review Phase 1 analysis reports in `scripts/semantic-cleanup/reports/`
3. Look at the compatibility layer in `compatibility.ts`

## Rollback

If you encounter issues, rollback is available:
```bash
# Latest Phase 3 backup
./scripts/semantic-cleanup/backups/phase3_*/rollback.sh

# Or use git
git checkout -- packages/core/src/types/
```
