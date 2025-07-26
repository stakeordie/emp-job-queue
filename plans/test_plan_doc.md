# Test Plan Documentation

## Purpose
This document tracks all system failures, their root causes, and comprehensive test suites to prevent regression. Every time something fails, we analyze the problem and create tests to catch similar issues in the future.

## Test Strategy
1. **Failure Tracking**: Document every failure with timestamp, impact, and root cause
2. **Root Cause Analysis**: Identify underlying causes, not just symptoms
3. **Comprehensive Testing**: Create test suites that cover failure scenarios and edge cases
4. **Regression Prevention**: Ensure fixed issues don't reoccur
5. **Production Readiness**: Focus on tests that validate production-scale behavior

---

## Failure #1: Workers Showing machine_id: "unknown" in Production

### Incident Details
- **Date**: 2025-07-16
- **Impact**: Workers not associating with machines in monitor UI, grey empty machine cards
- **Environment**: Production Redis with basic-machine-prod-test container
- **Symptoms**: Workers connecting and processing jobs but reporting `machine_id: "unknown"`

### Root Cause Analysis
1. **Immediate Cause**: Stale cached worker packages in `/tmp/worker_gpu*` directories
2. **Underlying Cause**: No cache invalidation between container rebuilds
3. **Configuration Issue**: Worker download logic didn't clear old packages
4. **Environment Flow**: MACHINE_ID correctly set → .env file created → worker reads correctly → but old package used

### Test Suite: Worker Machine Association

#### Unit Tests
```typescript
describe('Worker Machine Association', () => {
  test('should read MACHINE_ID from environment', () => {
    // Test worker initialization with MACHINE_ID env var
  });
  
  test('should create .env file with correct MACHINE_ID', () => {
    // Test RedisWorkerService.createEnvFile()
  });
  
  test('should report machine_id in worker capabilities', () => {
    // Test worker capabilities include correct machine_id
  });
});
```

#### Integration Tests
```typescript
describe('Worker-Machine Integration', () => {
  test('should associate workers with machine after restart', () => {
    // Test full worker restart cycle maintains machine association
  });
  
  test('should handle machine_id changes on container restart', () => {
    // Test changing CONTAINER_NAME updates worker machine_id
  });
});
```

#### System Tests
```typescript
describe('Production Worker Association', () => {
  test('should register all workers with correct machine_id', () => {
    // Test full container startup with NUM_GPUS workers
  });
  
  test('should survive cache cleanup and maintain association', () => {
    // Test worker cache cleanup doesn't break machine association
  });
});
```

### Prevention Measures
- ✅ **Implemented**: Automatic cache cleanup in `index-pm2.js`
- ✅ **Implemented**: Worker download URL fix in `standalone-wrapper.js`
- **TODO**: Add machine_id validation in worker startup
- **TODO**: Add cache versioning to detect stale packages

---

## Failure #2: Monitor EventStream Disconnection Under High Load

### Incident Details
- **Date**: 2025-07-16
- **Impact**: Monitor UI disconnects when processing many simulation jobs
- **Environment**: Production EventStream with burst job processing
- **Symptoms**: `net::ERR_CONNECTION_RESET`, monitor shows disconnected state

### Root Cause Analysis
1. **Immediate Cause**: EventStream connection timeout during high event volume
2. **Underlying Cause**: Single EventSource connection handling 400+ worker events
3. **Architecture Issue**: Not designed for 100+ machine scale (400+ workers)
4. **Platform Limitation**: Railway/infrastructure connection limits

### Test Suite: Monitor Scalability

#### Load Tests
```typescript
describe('Monitor Load Testing', () => {
  test('should handle 10 concurrent machines without disconnection', () => {
    // Test EventStream stability with 10 machines × 4 workers
  });
  
  test('should handle burst job processing (100+ jobs)', () => {
    // Test monitor during high job volume
  });
  
  test('should reconnect automatically after connection drop', () => {
    // Test auto-reconnect functionality
  });
});
```

#### Stress Tests
```typescript
describe('Monitor Stress Testing', () => {
  test('should handle 100 machines with graceful degradation', () => {
    // Test target production scale
  });
  
  test('should handle rapid worker status changes', () => {
    // Test high-frequency worker updates
  });
});
```

#### Architecture Tests
```typescript
describe('Scalable Monitor Architecture', () => {
  test('should support pagination for machine lists', () => {
    // Test paginated machine loading
  });
  
  test('should support selective machine monitoring', () => {
    // Test monitoring specific machine subsets
  });
});
```

### Prevention Measures
- ✅ **Documented**: Added scalable monitor architecture to North Star
- **TODO**: Implement pagination for machine lists
- **TODO**: Add connection pooling for EventStream
- **TODO**: Add graceful degradation for high load

---

## Failure #3: Redis Workers Hardcoded to 2 GPUs

### Incident Details
- **Date**: 2025-07-16
- **Impact**: Only 2 Redis workers created regardless of NUM_GPUS setting
- **Environment**: Container with NUM_GPUS=4 but only 2 workers
- **Symptoms**: ComfyUI scaled to 4 instances, Redis workers stayed at 2

### Root Cause Analysis
1. **Immediate Cause**: Hardcoded worker service names in PM2 startup
2. **Underlying Cause**: Redis workers used different scaling logic than ComfyUI
3. **Code Issue**: `pm2Exec('--only redis-worker-gpu0,redis-worker-gpu1')`
4. **Architecture Gap**: Inconsistent scaling patterns across services

### Test Suite: GPU Scaling

#### Unit Tests
```typescript
describe('GPU Scaling Logic', () => {
  test('should generate correct number of service names', () => {
    // Test service name generation for different GPU counts
  });
  
  test('should use same gpuCount variable across services', () => {
    // Test ComfyUI and Redis workers use same GPU count
  });
});
```

#### Integration Tests
```typescript
describe('Service Scaling Integration', () => {
  test('should start N ComfyUI and N Redis workers for N GPUs', () => {
    // Test PM2 starts correct number of each service type
  });
  
  test('should handle GPU count changes on restart', () => {
    // Test changing NUM_GPUS updates service count
  });
});
```

#### System Tests
```typescript
describe('Production GPU Scaling', () => {
  test('should scale from 1 to 8 GPUs correctly', () => {
    // Test full range of GPU scaling
  });
  
  test('should maintain worker performance across GPU counts', () => {
    // Test job processing performance with different GPU counts
  });
});
```

### Prevention Measures
- ✅ **Implemented**: Dynamic Redis worker scaling in `index-pm2.js`
- **TODO**: Add GPU count validation in startup
- **TODO**: Add service count verification tests
- **TODO**: Add performance benchmarks for different GPU counts

---

## Failure #4: GitHub Download Rate Limiting

### Incident Details
- **Date**: 2025-07-16
- **Impact**: Workers couldn't download packages, failing to start
- **Environment**: Production container downloading from GitHub API
- **Symptoms**: `403 rate limit exceeded`, `429 too many requests`

### Root Cause Analysis
1. **Immediate Cause**: Using GitHub API URL instead of direct download URL
2. **Underlying Cause**: API URL requires authentication, direct URL doesn't
3. **Configuration Issue**: Wrong default URL in `standalone-wrapper.js`
4. **Scale Issue**: Multiple workers hitting same API endpoint simultaneously

### Test Suite: Worker Downloads

#### Unit Tests
```typescript
describe('Worker Download URLs', () => {
  test('should use direct GitHub releases URL', () => {
    // Test download URL format is correct
  });
  
  test('should not require authentication', () => {
    // Test downloads work without GitHub token
  });
});
```

#### Integration Tests
```typescript
describe('Worker Download Integration', () => {
  test('should download and extract worker package', () => {
    // Test full download and extraction process
  });
  
  test('should handle multiple concurrent downloads', () => {
    // Test 4 workers downloading simultaneously
  });
});
```

#### System Tests
```typescript
describe('Production Worker Downloads', () => {
  test('should download from GitHub releases without rate limiting', () => {
    // Test production download scenarios
  });
  
  test('should handle network failures gracefully', () => {
    // Test download retry logic
  });
});
```

### Prevention Measures
- ✅ **Implemented**: Fixed download URL in `standalone-wrapper.js`
- **TODO**: Add download URL validation
- **TODO**: Add retry logic for failed downloads
- **TODO**: Add download caching to reduce GitHub requests

---

## Test Execution Strategy

### Continuous Integration
- **Unit Tests**: Run on every commit
- **Integration Tests**: Run on pull requests
- **System Tests**: Run nightly on staging environment
- **Load Tests**: Run weekly on production-like environment

### Test Environments
- **Local**: Developer machine with Docker
- **Staging**: Production-like environment with real Redis
- **Production**: Live environment with monitoring

### Success Criteria
- **Unit Tests**: 100% pass rate, >90% code coverage
- **Integration Tests**: 100% pass rate, all service interactions tested
- **System Tests**: 100% pass rate, full end-to-end scenarios
- **Load Tests**: Meet performance targets for 100+ machines

### Failure Response Process
1. **Immediate**: Document failure in this document
2. **Analysis**: Identify root cause and contributing factors
3. **Testing**: Create comprehensive test suite for failure scenario
4. **Implementation**: Fix issue and implement prevention measures
5. **Verification**: Confirm tests catch the issue and prevent regression

---

## Future Test Areas

### Scalability Testing
- **Machine Scaling**: Test 1 to 100+ machines
- **Worker Scaling**: Test 1 to 8 workers per machine
- **Job Volume**: Test 1 to 1000+ concurrent jobs
- **Model Management**: Test model downloads and caching at scale

### Reliability Testing
- **Network Failures**: Test Redis connection drops
- **Container Restarts**: Test ephemeral machine behavior
- **Service Failures**: Test individual service recovery
- **Data Consistency**: Test job state during failures

### Performance Testing
- **Job Processing**: Test throughput and latency
- **Monitor Responsiveness**: Test UI performance at scale
- **Resource Usage**: Test memory and CPU efficiency
- **Model Downloads**: Test download times and caching

### Security Testing
- **Authentication**: Test Redis and API authentication
- **Input Validation**: Test job payload validation
- **Container Security**: Test container isolation
- **Network Security**: Test encrypted connections

---

## Test Automation

### Test Infrastructure
- **Docker Compose**: Local multi-service testing
- **CI/CD Pipeline**: Automated test execution
- **Monitoring**: Test result tracking and alerting
- **Performance Tracking**: Historical performance data

### Test Data Management
- **Fixtures**: Standardized test data sets
- **Mocking**: Mock external services for testing
- **Cleanup**: Automated test environment cleanup
- **Isolation**: Prevent test interference

This document will be updated with every failure, creating a comprehensive knowledge base for system reliability and a growing test suite that prevents regressions.