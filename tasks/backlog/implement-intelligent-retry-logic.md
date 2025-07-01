# Implement Intelligent Retry Logic

## Status: High Priority - Backlog

## Description
Build sophisticated retry logic that can distinguish between different failure types and apply appropriate retry strategies.

## Problem Analysis

### Failure Classification System

#### 1. **Resource Failures** (Retry with Different Worker)
- **Worker OOM**: Memory exhaustion during processing
- **GPU Memory Full**: Insufficient VRAM for model/job
- **Worker Crash**: Process termination or container restart
- **Hardware Failure**: GPU driver issues, hardware problems
- **Strategy**: Immediate retry on different worker with sufficient resources

#### 2. **Malformed Job Failures** (Fail Fast)
- **Invalid Payload**: Malformed JSON, missing required fields
- **Invalid Parameters**: Impossible combinations (negative steps, invalid models)
- **Service Mismatch**: Job requires service not available anywhere
- **Parsing Errors**: Cannot interpret job requirements
- **Strategy**: Mark as permanently failed after 1-2 attempts

#### 3. **Transient Failures** (Retry with Backoff)
- **Network Timeouts**: Service temporarily unreachable
- **Service Busy**: All model slots occupied
- **Rate Limiting**: API quota temporarily exceeded  
- **Temporary Service Error**: 503, connection refused
- **Strategy**: Exponential backoff retry on same or different worker

#### 4. **Single Worker Availability** (Delayed Retry)
- **Only One Capable Worker**: Job requires specific GPU/model combination
- **Worker Temporarily Down**: Only capable worker is offline/busy
- **Strategy**: Wait for worker availability with extended timeout

## Technical Implementation

### Enhanced Job Status System
```typescript
enum JobStatus {
  PENDING = 'pending',
  ASSIGNED = 'assigned', 
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  // New retry statuses
  RETRY_PENDING = 'retry_pending',
  RETRY_DELAYED = 'retry_delayed',
  RETRY_EXHAUSTED = 'retry_exhausted',
  PERMANENTLY_FAILED = 'permanently_failed'
}

enum FailureType {
  RESOURCE_EXHAUSTION = 'resource_exhaustion',
  MALFORMED_JOB = 'malformed_job', 
  TRANSIENT_ERROR = 'transient_error',
  WORKER_UNAVAILABLE = 'worker_unavailable',
  UNKNOWN = 'unknown'
}
```

### Failure Classification Engine
```typescript
class FailureClassifier {
  classifyFailure(error: JobError, jobData: JobData, workerCapabilities: WorkerCapabilities[]): FailureType
  getRetryStrategy(failureType: FailureType, attemptCount: number): RetryStrategy
  shouldRetry(failureType: FailureType, attemptCount: number, maxRetries: number): boolean
}
```

### Retry Strategy Engine
```typescript
interface RetryStrategy {
  delayMs: number;
  requireDifferentWorker: boolean;
  requireSpecificCapabilities?: WorkerCapabilities;
  maxAttempts: number;
  backoffMultiplier: number;
}

class RetryManager {
  scheduleRetry(jobId: string, strategy: RetryStrategy): Promise<void>
  trackFailurePatterns(jobType: string, failureType: FailureType): void
  getFailureStats(): FailureStatistics
}
```

## Retry Strategies Detail

### 1. Resource Failure Strategy
```typescript
{
  delayMs: 0,                    // Immediate retry
  requireDifferentWorker: true,  // Must use different worker
  requireSpecificCapabilities: { // Ensure sufficient resources
    minGpuMemoryGb: job.estimatedGpuMemory * 1.2,
    minRamGb: job.estimatedRam * 1.2
  },
  maxAttempts: 3,
  backoffMultiplier: 1
}
```

### 2. Malformed Job Strategy  
```typescript
{
  delayMs: 0,
  requireDifferentWorker: false,
  maxAttempts: 1,               // Fail fast
  backoffMultiplier: 1
}
```

### 3. Transient Error Strategy
```typescript
{
  delayMs: 2000,                // Start with 2s delay
  requireDifferentWorker: false,
  maxAttempts: 5,
  backoffMultiplier: 2          // Exponential backoff: 2s, 4s, 8s, 16s, 32s
}
```

### 4. Single Worker Strategy
```typescript
{
  delayMs: 30000,               // Wait 30s for worker availability
  requireDifferentWorker: false,
  maxAttempts: 10,              // Extended retry attempts
  backoffMultiplier: 1.5        // Gradual increase: 30s, 45s, 67s...
}
```

## Implementation Components

### Enhanced Job Broker
- **Failure Analysis**: Classify failure type from error messages and context
- **Retry Scheduling**: Queue jobs for retry with appropriate delays
- **Worker Filtering**: Apply capability requirements for retry attempts
- **Pattern Learning**: Track failure patterns to improve classification

### Worker Error Reporting
- **Structured Errors**: Workers report errors with classification hints
- **Resource Metrics**: Include memory usage, GPU utilization in error reports
- **Context Information**: Job size, model requirements, processing stage

### Monitoring & Analytics
- **Failure Dashboard**: Real-time failure classification and retry metrics
- **Pattern Detection**: Identify systemic issues (all workers failing specific job types)
- **Resource Planning**: Recommend worker scaling based on failure patterns

## Database Schema Updates

### Job Retry Tracking
```sql
ALTER TABLE jobs ADD COLUMN retry_count INTEGER DEFAULT 0;
ALTER TABLE jobs ADD COLUMN max_retries INTEGER DEFAULT 3;
ALTER TABLE jobs ADD COLUMN last_failure_type VARCHAR(50);
ALTER TABLE jobs ADD COLUMN retry_strategy JSONB;
ALTER TABLE jobs ADD COLUMN failure_history JSONB[];
```

### Failure Analytics
```sql
CREATE TABLE failure_patterns (
  id SERIAL PRIMARY KEY,
  job_type VARCHAR(100),
  failure_type VARCHAR(50),
  error_signature TEXT,
  worker_id VARCHAR(100),
  occurred_at TIMESTAMP,
  job_metadata JSONB
);
```

## Tasks
- [ ] Implement FailureClassifier with error pattern matching
- [ ] Build RetryManager with scheduling and backoff logic
- [ ] Update JobBroker to handle retry strategies
- [ ] Enhance worker error reporting with classification hints
- [ ] Add retry tracking to Redis job data
- [ ] Build failure analytics and monitoring
- [ ] Create retry configuration management
- [ ] Implement retry exhaustion handling
- [ ] Add failure pattern learning system
- [ ] Build admin interface for retry management

## Files to Create/Modify
- `src/core/retry/failure-classifier.ts` - Error classification engine
- `src/core/retry/retry-manager.ts` - Retry scheduling and management
- `src/core/retry/retry-strategies.ts` - Strategy definitions
- `src/core/job-broker.ts` - Add retry integration
- `src/worker/base-worker.ts` - Enhanced error reporting
- `src/services/failure-analytics.ts` - Pattern tracking
- `src/types/retry.ts` - Retry-related type definitions

## Success Criteria
- [ ] Resource failures automatically retry on different workers
- [ ] Malformed jobs fail fast without wasting resources
- [ ] Transient errors retry with exponential backoff
- [ ] Single-worker jobs wait appropriately for availability
- [ ] Failure patterns are tracked and analyzed
- [ ] Retry exhaustion is handled gracefully
- [ ] System learns and improves failure classification over time
- [ ] Admin can configure retry policies per job type

## Metrics to Track
- **Retry Success Rate**: % of retried jobs that eventually succeed
- **Failure Classification Accuracy**: How often classification is correct
- **Resource Utilization**: Prevent retry storms from overwhelming system
- **Time to Resolution**: How long retries take to succeed or exhaust
- **Failure Pattern Evolution**: Track changes in failure types over time