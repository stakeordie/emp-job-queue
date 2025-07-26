# Complete Failure Recovery Coverage Plan

This plan outlines the remaining work needed to achieve **full failure recovery coverage** in the EmProps Job Queue system, building on the completed retry limit enforcement and health check framework.

## Current Status

### ✅ **COMPLETED**
- **Retry limit enforcement** - Fixed `cleanupWorker` to properly increment `retry_count` and enforce `max_retries`
- **Health check framework** - Structured system requiring connectors to implement failure recovery capabilities
- **Service support validation** - Connectors validate their service's API capabilities at startup

### ❌ **REMAINING CRITICAL GAPS**
- **Service status verification** - Check external service before re-queuing jobs from failed workers
- **Duplicate job prevention** - Avoid re-queuing jobs that already completed on external service
- **Job timeout enforcement** - Proactively cancel jobs that exceed their timeout limits

## Implementation Plan

### Phase 1: Service Status Integration (High Priority)

**Objective:** Integrate service status checking into worker cleanup process to prevent duplicate job processing.

**Files to Modify:**
- `/apps/api/src/lightweight-api-server.ts` - `cleanupWorker()` function
- `/apps/worker/src/connectors/*.ts` - Ensure all connectors implement `queryJobStatus()`

**Implementation Steps:**

1. **Update cleanupWorker Logic**
   ```typescript
   // Current logic (lines 2960-2045):
   if (workerData.current_job_id) {
     // Apply retry logic with limits
   }
   
   // NEW logic:  
   if (workerData.current_job_id) {
     const jobId = workerData.current_job_id;
     const jobData = await this.redis.hgetall(`job:${jobId}`);
     
     // NEW: Check external service status if service_job_id exists
     if (jobData.service_job_id && jobData.service_required) {
       try {
         const serviceStatus = await this.queryExternalServiceStatus(
           jobData.service_required, 
           jobData.service_job_id
         );
         
         if (serviceStatus.status === 'completed') {
           // Job completed on external service - mark as completed
           return this.markJobCompleted(jobId, serviceStatus);
         }
         // For any other status (running, failed, unknown) - proceed with retry logic
       } catch (error) {
         logger.warn(`Failed to check external service status for job ${jobId}: ${error.message}`);
         // Proceed with retry logic if service check fails
       }
     }
     
     // Apply existing retry logic (already implemented)
     // ...
   }
   ```

2. **Add Service Status Query Method**
   ```typescript
   private async queryExternalServiceStatus(
     serviceType: string, 
     serviceJobId: string
   ): Promise<ServiceJobStatus> {
     // Find a worker with matching service connector
     const availableWorkers = await this.getActiveWorkersByServiceType(serviceType);
     
     if (availableWorkers.length === 0) {
       throw new Error(`No available workers for service type: ${serviceType}`);
     }
     
     // Query the first available worker's connector
     const worker = availableWorkers[0];
     return await worker.queryJobStatus(serviceJobId);
   }
   ```

3. **Implement Worker Service Registry**
   ```typescript
   private async getActiveWorkersByServiceType(serviceType: string): Promise<WorkerWithConnector[]> {
     // Query Redis for active workers with specific service type
     // Return worker instances with their connector implementations
   }
   ```

**Expected Outcome:**
- Jobs completed on external services are properly marked as completed instead of being re-queued
- Reduces duplicate processing and resource waste
- Maintains existing retry logic for jobs that haven't completed

### Phase 2: Job Timeout Enforcement (Medium Priority)

**Objective:** Implement proactive job timeout monitoring and cancellation.

**Files to Create/Modify:**
- `/apps/api/src/job-timeout-monitor.ts` - New timeout monitoring service
- `/apps/api/src/lightweight-api-server.ts` - Integration with main API server

**Implementation Steps:**

1. **Create Job Timeout Monitor**
   ```typescript
   export class JobTimeoutMonitor {
     private checkInterval = 30000; // 30 seconds
     private intervalId?: NodeJS.Timeout;
     
     async start(): Promise<void> {
       this.intervalId = setInterval(() => {
         this.checkTimedOutJobs();
       }, this.checkInterval);
     }
     
     private async checkTimedOutJobs(): Promise<void> {
       // Query all in_progress jobs
       // Check if job.started_at + job.timeout_minutes < now
       // Cancel timed out jobs with proper cleanup
     }
     
     private async cancelTimedOutJob(jobId: string): Promise<void> {
       // Mark job as timeout status
       // Cancel on external service if possible
       // Clean up worker assignments
     }
   }
   ```

2. **Integrate with API Server**
   ```typescript
   // In lightweight-api-server.ts constructor
   this.timeoutMonitor = new JobTimeoutMonitor(this.redis);
   
   async start(): Promise<void> {
     // ... existing startup logic
     await this.timeoutMonitor.start();
   }
   ```

**Expected Outcome:**
- Jobs that exceed their timeout are automatically cancelled
- Workers are freed from stuck jobs
- Clear timeout status for client applications

### Phase 3: Enhanced Monitoring & Observability (Low Priority)

**Objective:** Add comprehensive monitoring for failure recovery metrics.

**Implementation Steps:**

1. **Failure Recovery Metrics**
   - Track service status check success/failure rates
   - Monitor job retry patterns and failure reasons
   - Alert on high duplicate job rates

2. **Enhanced Logging**
   - Structured logging for all failure recovery decisions
   - Trace correlation between worker failures and job outcomes

3. **Monitor Dashboard Updates**
   - Show retry attempts and timeout status in job cards
   - Display failure recovery statistics
   - Add alerts for degraded failure recovery performance

## Testing Strategy

### Unit Tests
```typescript
describe('Worker Cleanup with Service Status', () => {
  it('should mark job as completed when external service reports completion')
  it('should retry job when external service reports failure/unknown')
  it('should respect retry limits after service status check')
  it('should handle service status query failures gracefully')
})

describe('Job Timeout Enforcement', () => {
  it('should cancel jobs that exceed timeout_minutes')
  it('should not cancel jobs within timeout window')
  it('should clean up worker assignments for timed out jobs')
})
```

### Integration Tests
```typescript
describe('End-to-End Failure Recovery', () => {
  it('should prevent duplicate processing when worker fails after job completion')
  it('should retry failed jobs up to max_retries limit')
  it('should timeout long-running jobs and free workers')
})
```

### Load Tests
- Simulate worker failures under high job volume
- Test timeout enforcement with many concurrent jobs
- Verify service status queries don't become bottleneck

## Success Metrics

### Quantitative Goals
- **Zero duplicate job processing** when external service has completed jobs
- **<1% job loss rate** during worker failures 
- **100% timeout enforcement** for jobs exceeding limits
- **<5 second service status query time** for failure recovery decisions

### Qualitative Goals
- Clear, actionable error messages for all failure scenarios
- Predictable job outcomes regardless of infrastructure failures
- Maintainable failure recovery code with good test coverage

## Implementation Timeline

### Week 1-2: Service Status Integration
- Implement `queryExternalServiceStatus()` method
- Update `cleanupWorker()` to check service status
- Add service registry for active workers
- Unit and integration tests

### Week 3: Job Timeout Enforcement  
- Create `JobTimeoutMonitor` service
- Integrate with API server startup
- Add timeout status handling
- Testing and validation

### Week 4: Monitoring & Polish
- Enhanced logging and metrics
- Monitor dashboard updates
- Load testing and performance tuning
- Documentation updates

## Risk Mitigation

### Technical Risks
- **Service status queries fail** → Gracefully fall back to existing retry logic
- **Performance impact** → Implement query caching and rate limiting
- **External service inconsistency** → Use conservative completion detection

### Operational Risks
- **Deployment complexity** → Implement feature flags for gradual rollout
- **Breaking changes** → Maintain backward compatibility with existing jobs
- **Monitoring gaps** → Add comprehensive alerting before enabling new features

## Acceptance Criteria

### Definition of Done
- [ ] Service status checking prevents duplicate job processing
- [ ] Job timeout enforcement automatically cancels stuck jobs
- [ ] All existing functionality remains intact
- [ ] Test coverage >90% for new failure recovery code
- [ ] Documentation updated with new failure scenarios
- [ ] Performance impact <5% under normal load
- [ ] Feature flags allow safe production rollout

This plan provides a clear roadmap to complete failure recovery coverage while maintaining system stability and performance.