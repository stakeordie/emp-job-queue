# EmProps Job Queue Testing Strategy

## Overview

This document outlines the comprehensive testing strategy for the EmProps Job Queue system, covering unit tests, integration tests, and end-to-end tests to ensure the reliability and performance of the core job broker logic.

## Testing Levels

### 1. Unit Tests (`tests/unit/`)

**Purpose**: Test individual components in isolation with mocked dependencies.

**Coverage Goals**:
- **Job Broker Core**: 95% coverage (critical business logic)
- **Message Handler**: 90% coverage (high complexity)
- **Worker Selection**: 90% coverage (algorithmic complexity)
- **Overall Project**: 80% coverage minimum

**Key Test Categories**:

#### Job Broker Core Logic (`tests/unit/core/job-broker.test.ts`)
- **Priority + FIFO Queuing**
  - Priority ordering (high → low)
  - FIFO within same priority levels
  - Complex mixed priority scenarios
- **Job State Management**
  - State transitions (PENDING → QUEUED → ASSIGNED → etc.)
  - Timeout handling and cleanup
  - Retry logic and max retry enforcement
- **Worker Job Matching**
  - Multi-dimensional scoring algorithm
  - Service compatibility validation
  - Hardware requirement matching
  - Load balancing and capacity management
  - Customer isolation enforcement
- **Redis Operations**
  - Priority queue implementation with sorted sets
  - Atomic job claim operations
  - Data consistency during failures
- **Performance**
  - High job throughput (1000+ jobs)
  - Large worker pools (100+ workers)
  - Concurrent operations

#### Message Processing System (`tests/unit/core/message-handler.test.ts`)
- **Message Type Handling** (30+ message types)
  - Job management: `claim_job`, `update_job_progress`, `complete_job`, `fail_job`
  - Worker management: `register_worker`, `worker_heartbeat`, `update_worker_capabilities`
  - Client management: `subscribe_job`, `subscribe_stats`, `subscribe_worker_updates`
  - System messages: `system_stats_request`, `cancel_job`
- **Message Validation**
  - Schema validation for all message types
  - Timestamp validation (reject old messages)
  - Unknown message type handling
- **Message Broadcasting**
  - Job status updates to subscribers
  - Worker status updates to monitors
  - Periodic system stats broadcasting
- **Large Message Handling**
  - Large job payloads (100MB+)
  - High volume message processing
  - Memory management under load
- **Error Handling**
  - Redis connection failures
  - Malformed JSON messages
  - Worker disconnection scenarios

### 2. Integration Tests (`tests/integration/`)

**Purpose**: Test component interactions with real Redis but isolated environment.

**Setup**: 
- Real Redis instance (test database #15)
- Mocked external services
- Isolated test environment

**Key Test Scenarios**:

#### Job Lifecycle Integration (`tests/integration/job-lifecycle.test.ts`)
- **Complete Job Processing Flow**
  - Job submission → worker claim → progress updates → completion
  - Job failure → retry → eventual success
  - Worker disconnection → job requeuing → recovery
- **Priority Queue Integration**
  - Redis sorted set operations
  - Concurrent job submissions
  - Queue ordering verification
- **Worker Registry Integration**
  - Worker registration and state management
  - Heartbeat timeout handling
  - Dynamic capability updates
- **Message Broadcasting**
  - Redis pub/sub for real-time updates
  - Subscription management
  - Cross-component communication
- **Performance Under Load**
  - High job throughput testing
  - Large worker pool performance
  - Memory and resource usage monitoring

### 3. End-to-End Tests (`tests/e2e/`)

**Purpose**: Test complete system functionality with all services running.

**Setup**:
- Full hub service (REST API + WebSocket)
- Real worker instances
- Complete message flow
- External service simulation

**Test Scenarios** (`tests/e2e/full-system.test.ts`):

#### System Health & Connectivity
- Hub service availability
- WebSocket service connectivity
- Health check endpoints

#### Job Submission & Processing
- REST API job submission
- Job status tracking
- Complete job processing with simulation connector
- Result retrieval

#### Real-time Communication
- WebSocket job status updates
- System stats broadcasting
- Client subscription management

#### Worker Integration
- Worker visibility in system stats
- Concurrent job processing
- Load distribution across workers

#### Error Handling
- Invalid job submission handling
- Non-existent resource queries
- Connection failure recovery

#### Performance
- Rapid job submission handling
- Low-latency status queries
- System throughput measurement

## Test Infrastructure

### Test Utilities

#### Redis Mock (`tests/utils/redis-mock.ts`)
- Complete Redis operation simulation
- Sorted sets, hashes, lists, pub/sub
- Pipeline and transaction support
- Lua script execution mockups
- State inspection for debugging

#### Test Fixtures
- **Jobs** (`tests/fixtures/jobs.ts`): Various job types and scenarios
- **Workers** (`tests/fixtures/workers.ts`): Different worker configurations
- **Messages**: Common message patterns

#### Setup Files
- **Global setup** (`tests/setup.ts`): Common mocks and utilities
- **Integration setup**: Real Redis connection management
- **E2E setup**: Full service orchestration

### Jest Configuration

```javascript
// Specialized configuration for different test types
projects: [
  { displayName: 'unit', testMatch: ['tests/unit/**/*.test.ts'] },
  { displayName: 'integration', testMatch: ['tests/integration/**/*.test.ts'] },
  { displayName: 'e2e', testMatch: ['tests/e2e/**/*.test.ts'] }
]
```

### Coverage Requirements

```javascript
coverageThreshold: {
  global: { branches: 80, functions: 80, lines: 80, statements: 80 },
  'src/core/job-broker.ts': { branches: 95, functions: 95, lines: 95, statements: 95 },
  'src/core/message-handler.ts': { branches: 90, functions: 90, lines: 90, statements: 90 }
}
```

## Test Execution Strategy

### Development Workflow
```bash
# Fast unit tests during development
pnpm test:unit

# Watch mode for TDD
pnpm test:watch

# Full test suite before commit
pnpm test

# Coverage analysis
pnpm test:coverage
```

### CI/CD Pipeline
1. **Unit Tests**: Fast feedback (< 30 seconds)
2. **Integration Tests**: Redis-dependent (< 2 minutes)
3. **E2E Tests**: Full system (< 5 minutes)
4. **Coverage Report**: Quality gate (80% minimum)

### Test Data Management
- **Fixtures**: Reusable test data objects
- **Factories**: Dynamic test data generation
- **State Management**: Clean slate between tests
- **Isolation**: No test dependencies

## Critical Test Scenarios

### Priority + FIFO Algorithm
1. **Mixed Priority Jobs**: Verify correct ordering across priority levels
2. **Same Priority FIFO**: Ensure oldest jobs processed first within priority
3. **Dynamic Priority Changes**: Handle priority updates during queuing
4. **Large Queue Stress Test**: 10,000+ jobs with mixed priorities

### Worker Selection Algorithm
1. **Service Compatibility**: Exact service type matching
2. **Hardware Requirements**: GPU memory, CPU, RAM validation
3. **Component Filtering**: EmProps component-specific routing
4. **Load Balancing**: Prefer idle workers over busy ones
5. **Customer Isolation**: Strict/loose isolation enforcement
6. **Scoring Edge Cases**: Tie-breaking and edge case handling

### Concurrency & Race Conditions
1. **Concurrent Job Claims**: Multiple workers claiming same job
2. **Worker Registration Race**: Simultaneous worker registrations
3. **Message Order**: Out-of-order message handling
4. **Atomic Operations**: Redis transaction consistency

### Failure Recovery
1. **Redis Connection Loss**: Graceful degradation and recovery
2. **Worker Disconnection**: Job requeuing and timeout handling
3. **Message Loss**: Retry mechanisms and duplicate handling
4. **Partial Failures**: Rollback and consistency maintenance

### Performance Benchmarks
1. **Job Throughput**: 1000+ jobs/second submission rate
2. **Worker Matching**: < 100ms job-worker matching time
3. **Memory Usage**: Stable memory under sustained load
4. **Latency**: < 50ms API response times

## Test Implementation Priority

### Phase 1: Core Logic Foundation
1. ✅ Test infrastructure setup (Jest, mocks, fixtures)
2. ⏳ Job Broker unit tests (priority queue, worker selection)
3. ⏳ Message Handler unit tests (message processing, validation)

### Phase 2: Integration Validation
1. ⏳ Redis integration tests
2. ⏳ Job lifecycle integration
3. ⏳ Worker registry integration

### Phase 3: System Validation
1. ⏳ E2E job processing tests
2. ⏳ Performance and load tests
3. ⏳ Error recovery tests

### Phase 4: Advanced Scenarios
1. ⏳ Customer isolation tests
2. ⏳ Complex workflow tests
3. ⏳ Multi-tenant scenarios

## Success Criteria

### Code Quality
- [ ] 95% coverage on job broker core logic
- [ ] 90% coverage on message handler
- [ ] 80% overall project coverage
- [ ] Zero TypeScript errors
- [ ] Zero ESLint warnings

### Functionality
- [ ] All job states transition correctly
- [ ] Priority + FIFO ordering works under all conditions
- [ ] Worker selection algorithm handles all scenarios
- [ ] Message processing handles all 30+ message types
- [ ] Real-time notifications work reliably

### Performance
- [ ] 1000+ jobs/second throughput
- [ ] < 100ms job-worker matching
- [ ] < 50ms API response times
- [ ] Stable under 24h continuous load

### Reliability
- [ ] Graceful Redis connection recovery
- [ ] Worker disconnection handling
- [ ] No data loss during failures
- [ ] Consistent state across restarts

This comprehensive testing strategy ensures the EmProps Job Queue system is thoroughly validated before production deployment, with particular focus on the critical job broker logic that forms the heart of the system.