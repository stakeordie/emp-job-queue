# Architecture Audit & Refactoring Plan

**Date**: 2025-01-08  
**Author**: System Architecture Review  
**Status**: In Progress  
**Impact**: High - System-wide refactoring required

## Executive Summary

A comprehensive audit of the machine/worker architecture revealed critical issues preventing production readiness. The system has evolved through rapid iteration, accumulating technical debt and architectural inconsistencies. This document captures the findings and provides a structured refactoring plan.

## Context

**Audit Request**: "We've been fixing symptoms rather than root causes. Need to identify ALL architectural issues and create a comprehensive refactoring plan."

**Current Architecture Path**:
```
BaseWorker → HttpConnector → SimulationHttpConnector → SimulationHTTPService
```

## Critical Issues Identified

### 1. Naming Inconsistencies (CRITICAL)

**Problem**: Connector naming is inconsistent across the codebase
- Config references `SimulationHttpConnector` but class is named `SimulationConnector`
- File named `simulation-connector-refactored.ts` instead of following naming convention
- Future `SimulationWebsocketConnector` planned but naming pattern not established

**Impact**: 
- Connector loading failures
- Confusion in code maintenance
- Dynamic loading breaks

**Root Cause**: Protocol layer refactoring incomplete

### 2. Service Discovery Failure (CRITICAL)

**Problem**: Workers cannot find their assigned services
```typescript
// Current: Hardcoded port
base_url: 'http://localhost:8299'

// Reality: Services run on different ports
// simulation-gpu0 → port 8299
// simulation-gpu1 → port 8300
// simulation-gpu2 → port 8301
```

**Impact**:
- Workers connect to wrong services
- Multi-GPU setups fail
- Job processing errors

**Root Cause**: No service discovery mechanism implemented

### 3. Race Condition in Job Claiming (HIGH)

**Problem**: Multiple workers can claim the same job
```typescript
// Current implementation has timing gap
if (this.isProcessingJob) return; // Check 1
const job = await this.requestJob(); // Async operation
this.isProcessingJob = true; // Check 2
// RACE CONDITION: Multiple polls between Check 1 and Check 2
```

**Impact**:
- Same job processed multiple times
- Worker concurrency violations
- Resource contention

**Root Cause**: Non-atomic job claiming process

### 4. Job Completion Flow Broken (HIGH)

**Problem**: Jobs stay in active state, `complete_job` events not sent reliably
- Simulation health check (4% failure rate) breaks completion flow
- No verification of event delivery
- Processing flag can get stuck

**Impact**:
- Jobs never marked complete
- Queue gets backed up
- System appears frozen

**Root Cause**: Error handling gaps in completion flow

### 5. Configuration Management Chaos (MEDIUM)

**Problem**: Environment variables and configuration disconnected
- PM2 generates worker IDs without port information
- Service mapping doesn't connect to actual implementations
- Multiple config file search paths (deployment smell)

**Impact**:
- Deployment failures
- Configuration drift
- Hard to debug issues

**Root Cause**: Evolution without unified configuration strategy

## Refactoring Plan

### Phase 1: Critical Fixes (Days 1-2)

#### 1.1 Fix Naming Consistency
```bash
# Rename files
mv simulation-connector-refactored.ts simulation-http-connector.ts
rm simulation-connector.ts  # Remove old version
```

```typescript
// simulation-http-connector.ts
export class SimulationHttpConnector extends HTTPConnector {
  service_type = 'simulation' as const;
  // ...
}

// index.ts
export * from './simulation-http-connector.js';
```

#### 1.2 Implement Service Discovery
```typescript
class ServiceDiscovery {
  /**
   * Resolve service endpoint based on worker ID
   * Example: simulation-gpu0 → http://localhost:8299
   */
  static resolveEndpoint(workerId: string): string {
    const match = workerId.match(/(.+)-gpu(\d+)$/);
    if (!match) {
      return this.getDefaultEndpoint();
    }
    
    const [, serviceType, gpuIndex] = match;
    const basePort = this.getBasePort(serviceType);
    const port = basePort + parseInt(gpuIndex);
    
    return `http://localhost:${port}`;
  }
  
  private static getBasePort(serviceType: string): number {
    const portMap = {
      simulation: 8299,
      comfyui: 8188,
      a1111: 7860
    };
    return portMap[serviceType] || 8080;
  }
}
```

#### 1.3 Fix Job Claiming Race Condition
```typescript
class AtomicJobClaimer {
  async claimJob(workerId: string): Promise<Job | null> {
    // Use Redis atomic operations
    const lockKey = `worker:${workerId}:claiming`;
    const lockId = uuidv4();
    
    // Try to acquire lock (SET NX EX)
    const acquired = await redis.set(lockKey, lockId, 'NX', 'EX', 5);
    if (!acquired) return null;
    
    try {
      // Check if already processing
      const status = await redis.hget(`worker:${workerId}`, 'status');
      if (status === 'busy') return null;
      
      // Claim job atomically
      const job = await this.findAndClaimJob(workerId);
      if (job) {
        await redis.hset(`worker:${workerId}`, 'status', 'busy');
      }
      return job;
      
    } finally {
      // Release lock only if we own it
      const currentLock = await redis.get(lockKey);
      if (currentLock === lockId) {
        await redis.del(lockKey);
      }
    }
  }
}
```

### Phase 2: Architectural Cleanup (Days 3-5)

#### 2.1 Complete Protocol Layer
```
src/connectors/
├── protocols/
│   ├── base-protocol.ts         # Abstract protocol interface
│   ├── http-protocol.ts         # HTTP implementation
│   ├── websocket-protocol.ts    # WebSocket implementation
│   └── grpc-protocol.ts         # gRPC implementation
├── services/
│   ├── simulation/
│   │   ├── simulation-http-connector.ts
│   │   └── simulation-websocket-connector.ts
│   ├── comfyui/
│   │   ├── comfyui-http-connector.ts
│   │   └── comfyui-websocket-connector.ts
│   └── openai/
│       └── openai-http-connector.ts
└── index.ts
```

#### 2.2 Implement Proper Service Registry
```typescript
interface ServiceEndpoint {
  id: string;
  url: string;
  protocol: 'http' | 'websocket' | 'grpc';
  healthCheck: string;
  lastSeen: Date;
}

class ServiceRegistry {
  private redis: Redis;
  
  async register(endpoint: ServiceEndpoint): Promise<void> {
    await this.redis.hset(
      `services:${endpoint.id}`,
      {
        url: endpoint.url,
        protocol: endpoint.protocol,
        healthCheck: endpoint.healthCheck,
        lastSeen: new Date().toISOString()
      }
    );
    await this.redis.expire(`services:${endpoint.id}`, 60);
  }
  
  async discover(workerId: string): Promise<ServiceEndpoint | null> {
    // Extract service type from worker ID
    const serviceType = this.extractServiceType(workerId);
    const serviceId = this.buildServiceId(workerId);
    
    const data = await this.redis.hgetall(`services:${serviceId}`);
    if (!data.url) return null;
    
    return {
      id: serviceId,
      url: data.url,
      protocol: data.protocol as any,
      healthCheck: data.healthCheck,
      lastSeen: new Date(data.lastSeen)
    };
  }
}
```

#### 2.3 Refactor BaseConnector
```typescript
// Split responsibilities
class ConnectorCore {
  protected lifecycle: ConnectorLifecycle;
  protected status: StatusReporter;
  protected health: HealthMonitor;
  protected processor: JobProcessor;
  
  constructor(config: ConnectorConfig) {
    this.lifecycle = new ConnectorLifecycle(config);
    this.status = new StatusReporter(config);
    this.health = new HealthMonitor(config);
    this.processor = new JobProcessor(config);
  }
}

class ConnectorLifecycle {
  async initialize(): Promise<void>;
  async cleanup(): Promise<void>;
}

class StatusReporter {
  async reportStatus(status: ConnectorStatus): Promise<void>;
  async reportJobProgress(progress: JobProgress): Promise<void>;
}

class HealthMonitor {
  async checkHealth(): Promise<boolean>;
  async handleUnhealthy(): Promise<void>;
}

class JobProcessor {
  async processJob(job: Job): Promise<JobResult>;
  async cancelJob(jobId: string): Promise<void>;
}
```

### Phase 3: Production Readiness (Days 6-10)

#### 3.1 Configuration Management
```typescript
class ConnectorConfigManager {
  private static configs = new Map<string, ConnectorConfig>();
  
  static async loadConfig(workerId: string): Promise<ConnectorConfig> {
    // Try multiple sources in order
    const sources = [
      () => this.fromEnvironment(workerId),
      () => this.fromServiceMapping(workerId),
      () => this.fromRedis(workerId),
      () => this.fromDefaults(workerId)
    ];
    
    for (const source of sources) {
      try {
        const config = await source();
        if (config && this.validate(config)) {
          this.configs.set(workerId, config);
          return config;
        }
      } catch (e) {
        // Continue to next source
      }
    }
    
    throw new Error(`No valid configuration found for ${workerId}`);
  }
}
```

#### 3.2 Error Recovery Strategy
```typescript
class ErrorRecovery {
  private strategies = new Map<string, RecoveryStrategy>();
  
  constructor() {
    this.strategies.set('job_timeout', new JobTimeoutRecovery());
    this.strategies.set('service_unavailable', new ServiceUnavailableRecovery());
    this.strategies.set('worker_stuck', new WorkerStuckRecovery());
  }
  
  async recover(error: Error, context: ErrorContext): Promise<void> {
    const strategy = this.selectStrategy(error);
    await strategy.execute(context);
  }
}
```

#### 3.3 Monitoring & Observability
```typescript
class ConnectorMetrics {
  private prometheus = new PrometheusClient();
  
  recordJobProcessed(job: Job, duration: number, success: boolean): void {
    this.prometheus.histogram('job_duration_seconds', duration, {
      service: job.service_required,
      success: success.toString()
    });
    
    this.prometheus.counter('jobs_total', 1, {
      service: job.service_required,
      status: success ? 'success' : 'failure'
    });
  }
  
  recordServiceHealth(service: string, healthy: boolean): void {
    this.prometheus.gauge('service_health', healthy ? 1 : 0, {
      service
    });
  }
}
```

## Implementation Timeline

| Phase | Duration | Priority | Status |
|-------|----------|----------|---------|
| Phase 1: Critical Fixes | 2 days | CRITICAL | Not Started |
| Phase 2: Architecture | 3 days | HIGH | Not Started |
| Phase 3: Production | 5 days | MEDIUM | Not Started |

## Success Metrics

1. **Job Processing Reliability**: 99.9% success rate
2. **Service Discovery**: 100% correct routing
3. **Concurrency**: Zero duplicate job processing
4. **Completion Rate**: 100% jobs marked complete
5. **Error Recovery**: <30s recovery time

## Migration Strategy

1. **Parallel Implementation**: Build new system alongside old
2. **Feature Flag Control**: Toggle between implementations
3. **Gradual Rollout**: Test with simulation first, then production
4. **Rollback Plan**: Keep old system for 30 days after migration

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing deployments | HIGH | Feature flags, gradual rollout |
| Service discovery failures | HIGH | Fallback to static config |
| Performance regression | MEDIUM | Load testing, monitoring |
| Configuration complexity | MEDIUM | Validation, defaults, documentation |

## Next Steps

1. ✅ Review and approve refactoring plan
2. ⏳ Start Phase 1 implementation
3. ⏳ Set up testing environment
4. ⏳ Create migration documentation
5. ⏳ Schedule team training

## References

- [Original Architecture Audit](./2025-01-08-architecture-audit-raw.md)
- [Protocol Layer Design](../03-implementation-details/connector-architecture.md)
- [North Star Architecture](../NORTH_STAR_ARCHITECTURE.md)

---

**Last Updated**: 2025-01-08  
**Review Status**: Pending Approval  
**Document Version**: 1.0.0