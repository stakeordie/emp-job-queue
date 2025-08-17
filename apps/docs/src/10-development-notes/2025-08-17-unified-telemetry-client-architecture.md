# 2025-08-17 - Unified Telemetry Client Architecture

## Problem Statement

Our telemetry infrastructure has become fragmented across multiple services, leading to:

- **Scattered Configuration**: OTEL endpoints, Fluentd hosts, and credentials spread across API, webhook, machine, and worker services
- **Duplicate Logic**: Each service reimplements telemetry setup, error handling, and retry logic
- **Inconsistent Formats**: Different services send different data structures to Dash0
- **Hard to Debug**: No unified way to test the entire telemetry pipeline from application → Fluent Bit → Fluentd → Dash0
- **Environment Dependencies**: Each service has different fallback logic and validation, making deployment unpredictable

## Proposed Solution: Unified Telemetry Client

### Core Philosophy
> **"Just Works" Principle**: Services should only need to call `telemetry.log.info()` or `telemetry.trace.event()` - all configuration, connection management, error handling, and format standardization happens automatically.

### Simple API Design

```typescript
// Initialization - service-specific defaults
const telemetry = new EmpTelemetryClient({
  serviceName: 'api-server',
  serviceType: 'api',
  environment: 'production'
});

// Unified Logging - automatically handles Fluentd + file logging
telemetry.log.info('Server started', { port: 3001 });
telemetry.log.error('Database connection failed', error);
telemetry.log.addFile('/api-server/logs/api.log'); // Fluent Bit auto-config

// Unified Tracing - automatically handles OTEL collector
telemetry.trace.event('startup.ping', { duration: 1500 });
telemetry.trace.span('job.processing', async () => {
  // work happens here, automatic timing and correlation
});

// Built-in Testing - validate entire pipeline
await telemetry.test.connectivity(); // Tests app → Fluent Bit → Fluentd → Dash0
await telemetry.test.fluentd(); // Direct Fluentd test
await telemetry.test.otel(); // Direct OTEL test
```

### Architecture Components

#### 1. Configuration Manager
- **Single Source of Truth**: All telemetry configuration centralized
- **Environment Validation**: Validates required variables, fails fast with descriptive errors
- **Service Defaults**: API servers get different defaults than machines
- **Credential Management**: Secure handling of Dash0 API keys and endpoints

```typescript
// Configuration priority: ENV vars → service defaults → error (no fallbacks)
const config = new TelemetryConfig({
  serviceType: 'api',
  required: ['DASH0_API_KEY', 'MACHINE_ID'],
  defaults: {
    fluentdHost: 'host.docker.internal',
    fluentdPort: 8888,
    otelEndpoint: 'http://localhost:4318/v1/traces'
  }
});
```

#### 2. Connection Manager
- **Automatic Reconnection**: Built-in retry logic with exponential backoff
- **Circuit Breakers**: Fail fast when services are down, auto-recover
- **Health Checking**: Periodic connectivity validation
- **Connection Pooling**: Efficient HTTP connection reuse

```typescript
class ConnectionManager {
  async ensureFluentdConnection(): Promise<FluentdClient>
  async ensureOtelConnection(): Promise<OtelClient>
  async testPipeline(): Promise<PipelineHealth>
}
```

#### 3. Format Standardizer
- **Consistent Structure**: All services send identical data formats
- **Metadata Injection**: Automatic addition of service, machine, environment data
- **Correlation IDs**: Automatic trace and span ID management
- **Schema Validation**: Validate payloads before sending

```typescript
interface StandardLogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  service: ServiceMetadata;
  trace?: TraceContext;
  data?: Record<string, any>;
}

interface StandardTraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  service: ServiceMetadata;
  startTime: number;
  endTime?: number;
  attributes: Record<string, string>;
}
```

#### 4. Testing & Debug Layer
- **Pipeline Validation**: End-to-end testing from service to Dash0
- **Performance Metrics**: Latency tracking for each hop
- **Debug Modes**: Detailed logging for troubleshooting
- **Health Dashboards**: Service-specific telemetry health reporting

```typescript
interface TelemetryTest {
  async connectivity(): Promise<ConnectivityReport>
  async fluentd(): Promise<FluentdHealthReport>  
  async otel(): Promise<OtelHealthReport>
  async dash0(): Promise<Dash0HealthReport>
  async endToEnd(): Promise<PipelineReport>
}
```

### Service-Specific Integration

#### API Server Integration
```typescript
const telemetry = EmpTelemetryClient.forAPI({
  logFiles: ['/api-server/logs/api.log', '/api-server/logs/error.log'],
  healthEndpoint: '/health',
  autoStartupTrace: true
});

// Automatic startup sequence
await telemetry.startup.begin();
telemetry.log.info('API server initializing');
await telemetry.startup.complete({ port: 3001, version: '1.0.0' });
```

#### Machine Integration  
```typescript
const telemetry = EmpTelemetryClient.forMachine({
  machineType: 'comfyui',
  logFiles: ['/workspace/logs/*.log'],
  startupPhases: ['hardware_detection', 'service_startup', 'worker_ready'],
  autoFluentBitConfig: true
});

// Automatic startup instrumentation (like existing StartupTelemetry)
telemetry.startup.phase('hardware_detection', async () => {
  // hardware detection logic
});
```

#### Worker Integration
```typescript
const telemetry = EmpTelemetryClient.forWorker({
  workerId: process.env.WORKER_ID,
  connectorType: 'comfyui',
  jobTracing: true,
  autoJobInstrumentation: true
});

// Automatic job tracing
telemetry.job.process(jobData, async (job) => {
  // job processing - automatic timing and progress tracking
});
```

### Implementation Phases

#### Phase 1: Core Client (Week 1)
- Create `packages/telemetry` package
- Implement `TelemetryConfig` with environment validation
- Implement `ConnectionManager` with retry logic
- Basic logging and tracing interfaces

#### Phase 2: Service Integration (Week 2)  
- Replace API server telemetry with unified client
- Replace webhook service telemetry with unified client
- Test end-to-end connectivity

#### Phase 3: Machine Integration (Week 3)
- Replace machine startup telemetry with unified client
- Integrate with existing StartupTelemetry patterns
- Worker telemetry integration

#### Phase 4: Advanced Features (Week 4)
- Pipeline testing and validation tools
- Performance monitoring and health dashboards
- Debug modes and troubleshooting tools

### Benefits

1. **Consistency**: All services use identical telemetry formats and protocols
2. **Reliability**: Built-in retry logic, circuit breakers, and error handling
3. **Debuggability**: Unified testing tools and debug modes
4. **Maintainability**: Single codebase for all telemetry logic
5. **Performance**: Connection pooling and efficient data structures
6. **Developer Experience**: Simple API that "just works"

### Migration Strategy

1. **Parallel Implementation**: Build unified client alongside existing telemetry
2. **Service-by-Service Migration**: Replace one service at a time
3. **A/B Testing**: Run both systems simultaneously during transition
4. **Gradual Rollout**: Start with non-critical services, then move to production

This architecture solves our current telemetry fragmentation while providing a foundation for reliable observability across the entire EMP system.