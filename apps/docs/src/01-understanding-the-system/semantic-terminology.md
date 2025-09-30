# Semantic Terminology Guide

## Understanding Job vs Step

The EmProps Job Queue system is evolving its terminology to provide clearer semantics and reduce confusion. This guide explains the terminology you'll encounter in the codebase.

## Current State (Transition Phase)

### What Workers Process: "Job" → "Step"

**Old Terminology (still in code):**
- "Job" = individual unit of work processed by one worker
- Example: Generate one image, process one prompt

**New Terminology (semantic model):**
- "Step" = individual unit of work processed by one worker
- Same meaning, clearer name

### What Users Submit: Future "Job"

**Future Concept:**
- "Job" = User request that may contain multiple Steps
- Example: User requests "generate 4 variations of an image" → Creates 4 Steps

## Why the Change?

### Problem with Old Terminology
```
User submits → "Job" (but really a Step)
Worker processes → "Job" (individual unit)
Multiple "Jobs" → But user thinks of it as one request
```

**Confusion:** "Job" meant different things in different contexts.

### Solution: Clear Semantic Model
```
User submits → Job (contains 1+ Steps)
Worker processes → Step (individual unit)
Multiple Steps → Part of one Job
```

**Clarity:** Each term has one clear meaning.

## Code Examples

### Current Code (Backwards Compatible)

```typescript
import { Job } from '@emp/core'; // Actually a Step

// These function names preserved for compatibility
await redis.submitJob(data);     // Submits a Step
await redis.getJob(jobId);       // Gets a Step
await redis.completeJob(jobId);  // Completes a Step
```

### New Code (Recommended)

```typescript
import { Step } from '@emp/core'; // Clear semantic meaning

// Use new type alias for clarity
const step: Step = {
  service_required: 'comfyui',
  payload: { /* ... */ }
};

// Function names stay the same for compatibility
await redis.submitJob(step);
```

### Future Code (When Available)

```typescript
import { Job, Step } from '@emp/core';

// Submit a Job containing multiple Steps
const job: Job = {
  customer_id: 'user-123',
  steps: [
    { service_required: 'comfyui', payload: { /* ... */ } },
    { service_required: 'comfyui', payload: { /* ... */ } },
  ]
};

await workflowAPI.submitJob(job); // New API for multi-step Jobs
```

## Migration Status

### ✅ Phase 1-2: Type System (Complete)
- Created `Step` type as alias for `Job`
- Created new `Job` type for future use
- Added compatibility layer

### ✅ Phase 3.1-3.3: Documentation (Complete)
- Added semantic clarification to core files
- Redis service documented
- API and worker documented

### 🚧 Phase 3.4: Tests & Docs (In Progress)
- Updating test comments
- Adding doc clarifications
- Creating this guide

### 📋 Future Phases
- Phase 4: Gradual code migration
- Phase 5: New Workflow API
- Phase 6: Complete semantic transition

## For Developers

### Reading Existing Code
When you see `Job` in the codebase, ask:
- **In Redis/Worker context?** → It's a Step (worker processing unit)
- **In future Workflow context?** → It's a Job (user request with multiple Steps)

### Writing New Code
- Use `Step` type for clarity when possible
- Use existing function names (`submitJob`, etc.) for compatibility
- Add comments explaining Step vs Job when it might be confusing

### Contributing
- Preserve backwards compatibility
- Add semantic clarification comments
- Use `Step` type in new code
- Reference this guide in documentation

## Key Takeaway

**Old Model (Confusing):**
- "Job" = both individual units AND user requests

**New Model (Clear):**
- **Step** = individual unit processed by one worker
- **Job** = user request containing one or more Steps

The codebase is gradually transitioning. Function names stay the same for compatibility, but the semantic meaning is becoming clearer through types and documentation.
