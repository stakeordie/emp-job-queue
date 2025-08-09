# Bug Investigation Prompts

## Template for Bug Investigation Prompts

### Context
*What was happening when the bug was discovered*

### Symptoms Observed
*What the user is seeing*

### Original User Request
*Exact words from user*

### Refined Prompt
*Optimized version for clarity*

### Investigation Approach
*How the investigation should proceed*

### Root Cause
*What was actually wrong*

### Fix Applied
*What was done to resolve it*

### Lessons Learned
*What to remember for similar issues*

---

## 2025-08-08 - Worker Concurrency & Job Completion Issues

### Context
After setting up simulation workers, discovered that:
1. One worker was processing 3 jobs simultaneously (should only be 1)
2. Jobs were never leaving the active state
3. `complete_job` event was never being sent

### Symptoms Observed
- Worker showing as processing multiple jobs in UI
- Active jobs list growing indefinitely
- Jobs staying in "active" state forever

### Original User Request
> "the blinking is gone now and the active job never leaves are we sending a complete_job notice to the api?"
> "It also seems like one worker is processing 3 simultaneous jobs"
> "complete_job is not being sent at all for any of the jobs"

### Investigation Approach
1. Traced job completion flow from connector → worker → Redis client
2. Identified race condition in polling logic
3. Found that worker status check wasn't atomic with job claiming

### Root Cause
**Race Condition**: Multiple polling cycles could occur between job claim and status update, allowing a single worker to claim multiple jobs before its status changed to "busy"

### Fix Applied
Added in-memory `isProcessingJob` flag to `RedisDirectWorkerClient` for atomic concurrency control:
- Set immediately when job claimed
- Cleared when job completes or fails
- Checked before allowing new job requests

### Lessons Learned
1. **Redis status isn't enough**: Network latency means Redis status updates aren't atomic with local operations
2. **In-memory flags for critical sections**: Use local state for immediate concurrency control
3. **Always trace end-to-end**: The symptom (no complete_job) wasn't where the problem was (race in job claiming)