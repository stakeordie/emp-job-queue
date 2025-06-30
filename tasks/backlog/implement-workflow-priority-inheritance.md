# Implement Workflow Priority Inheritance

## Problem
Currently, each job gets its own timestamp when submitted, causing workflow steps to be interleaved with other workflows in the queue. When Step 1 of Workflow A completes and Step 2 is submitted, it goes to the end of the queue behind newer workflows.

## Solution
Jobs should inherit their workflow's original priority and datetime, ensuring all steps from the same workflow stay grouped together in the queue.

## Implementation

### Interface Changes
```typescript
interface JobRequest {
  jobId: string;
  workflowId: string;
  workflowDateTime: number;  // ← Inherit from workflow, not current time
  workflowPriority: number;  // ← Inherit from workflow
  stepNumber: number;
  
  // Job-specific fields unchanged
  serviceType: string;
  component?: string;
  requirements: JobRequirements;
  payload: any;
}
```

### Job Broker Changes
```typescript
class JobBroker {
  async submitJob(job: JobRequest): Promise<string> {
    // Score = priority * 1000000 + workflowDateTime (not current time!)
    const score = job.workflowPriority * 1000000 + job.workflowDateTime;
    
    await this.redis.zadd('jobs:pending', score, job.jobId);
    await this.redis.hset(`job:${job.jobId}`, job);
    
    return job.jobId;
  }
}
```

### Workflow Metadata Storage
```typescript
// Store workflow metadata for job inheritance
interface WorkflowMetadata {
  workflowId: string;
  priority: number;
  submittedAt: number;
  customerId: string;
}

// When workflow starts
await redis.hset(`workflow:${workflowId}:metadata`, {
  priority,
  submittedAt: Date.now(),
  customerId
});

// When submitting jobs
const metadata = await redis.hget(`workflow:${workflowId}:metadata`);
const job = {
  workflowPriority: metadata.priority,
  workflowDateTime: metadata.submittedAt,
  // ... other job fields
};
```

## Expected Behavior

```
Timeline:
t-40: Workflow A submitted (priority=100, datetime=1640995200)
t-30: Workflow B submitted (priority=100, datetime=1640995230)
t+5:  A-step1 completes, A-step2 submitted with datetime=1640995200
      → A-step2 jumps ahead of B-step2 in queue

Queue ordering:
├── A-step2: score=100001640995200 (workflow A, older)
├── A-step7: score=100001640995200 (same workflow)
├── B-step3: score=100001640995230 (workflow B, newer)
└── C-step1: score=100001640995240 (workflow C, newest)
```

## Files to Modify
- `src/core/types/index.ts` - Update JobRequest interface
- `src/core/JobBroker.ts` - Update submitJob scoring logic
- `src/hub/HubServer.ts` - Update job submission endpoint
- Tests for workflow priority inheritance

## Acceptance Criteria
- [ ] Jobs inherit workflowDateTime and workflowPriority
- [ ] Workflow steps maintain proper ordering in queue
- [ ] Higher priority workflows still take precedence
- [ ] FIFO ordering maintained within same priority workflows
- [ ] No breaking changes to existing job submission API
- [ ] Complete test coverage for workflow priority scenarios

## Priority
High - This solves the core workflow fragmentation problem with minimal complexity.