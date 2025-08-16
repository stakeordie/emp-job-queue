# Distributed Tracing Architecture

This document defines the comprehensive distributed tracing strategy for the EMP Job Queue system, mapping all telemetry touchpoints and the specific data we capture at each stage.

## Overview

Our distributed tracing provides end-to-end visibility across the entire request lifecycle:

```
Client Request → API Server → Redis Queue → Worker → External Service → Response
```

Each stage generates traces with specific context and metadata to enable complete request correlation and performance analysis.

## Trace Context Propagation

### Core Trace Context Schema

```typescript
interface TraceContext {
  trace_id: string;         // Root trace identifier (32 hex chars)
  parent_span_id?: string;  // Parent span for context linking (16 hex chars)  
  span_id: string;          // Current span identifier (16 hex chars)
  trace_flags?: number;     // Sampling and debug flags (1 byte)
  baggage?: Record<string, string>; // Cross-cutting concerns
}

interface JobWithTracing extends Job {
  trace_context?: TraceContext;
  request_id?: string;      // Client request correlation
  client_session_id?: string; // WebSocket session tracking
  correlation_id?: string;  // Business transaction ID
}
```

## Telemetry Touchpoints

### 1. API Server Entry Point (`apps/api/src/lightweight-api-server.ts`)

**Touchpoint**: HTTP Request Received
**Span Name**: `http.request.received`
**Service Name**: `emp-job-queue-api`

**Attributes Captured**:
```typescript
{
  // HTTP Context
  "http.method": "POST",
  "http.url": "/api/jobs",
  "http.user_agent": request.headers['user-agent'],
  "http.request_content_length": request.headers['content-length'],
  
  // Request Identity
  "request.id": uuidv4(),
  "client.ip": request.ip,
  "client.session_id": extractSessionId(request),
  
  // Business Context
  "job.service_required": job.service_required,
  "job.priority": job.priority,
  "customer.id": job.customer_id,
  "workflow.id": job.workflow_id,
  
  // System Context
  "api.version": packageJson.version,
  "environment": process.env.NODE_ENV,
  "deployment.region": process.env.RAILWAY_REGION || 'unknown'
}
```

**Events**:
- `request.validation.started`
- `request.validation.completed` / `request.validation.failed`
- `job.submission.started`
- `job.submission.completed`

---

### 2. Redis Job Operations (`packages/core/src/redis-service.ts`)

**Touchpoint**: Job Submission to Redis
**Span Name**: `redis.job.submit`
**Service Name**: `emp-job-queue-api`

**Attributes Captured**:
```typescript
{
  // Redis Operation Context
  "redis.operation": "HMSET + ZADD",
  "redis.key_pattern": "job:{job_id}",
  "redis.queue": "jobs:pending",
  
  // Job Context
  "job.id": job.id,
  "job.service_required": job.service_required,
  "job.priority": job.priority,
  "job.payload_size_bytes": JSON.stringify(job.payload).length,
  
  // Queue Context
  "queue.priority_score": calculateScore(job),
  "queue.estimated_position": estimateQueuePosition(job),
  
  // Trace Context Storage
  "trace.context_stored": true,
  "trace.parent_id": traceContext.trace_id
}
```

**Events**:
- `redis.connection.acquired`
- `redis.job.serialized`
- `redis.job.stored`
- `redis.queue.updated`

---

**Touchpoint**: Job Claim by Worker
**Span Name**: `redis.job.claim`
**Service Name**: `emp-job-queue-worker`

**Attributes Captured**:
```typescript
{
  // Worker Context
  "worker.id": workerId,
  "worker.machine_id": machineId,
  "worker.capabilities": JSON.stringify(capabilities),
  
  // Job Matching
  "matching.function": "findMatchingJob",
  "matching.scan_limit": scanLimit,
  "matching.jobs_evaluated": jobsEvaluated,
  "matching.match_duration_ms": matchDuration,
  
  // Queue Analytics
  "queue.jobs_pending": pendingJobCount,
  "queue.wait_time_ms": Date.now() - job.created_at,
  
  // Trace Context Retrieval
  "trace.context_retrieved": true,
  "trace.parent_id": job.trace_context?.trace_id
}
```

---

### 3. Worker Job Processing (`apps/worker/src/telemetry/worker-tracer.ts`)

**Touchpoint**: Job Processing Lifecycle
**Span Name**: `job.processing`
**Service Name**: `emp-{service_type}-worker`

**Attributes Captured**:
```typescript
{
  // Job Context
  "job.id": jobId,
  "job.type": jobType,
  "job.service_required": job.service_required,
  "job.payload_size_bytes": payloadSize,
  "job.retry_count": job.retry_count,
  
  // Worker Context
  "worker.id": workerId,
  "worker.machine_id": machineId,
  "worker.connector_type": connectorType,
  "worker.max_concurrent_jobs": maxConcurrentJobs,
  
  // Processing Context
  "processing.start_time": startTime,
  "processing.estimated_duration_ms": estimatedDuration,
  "processing.actual_duration_ms": actualDuration,
  "processing.status": status, // started|completed|failed
  
  // Resource Context
  "machine.gpu_count": gpuCount,
  "machine.gpu_memory_gb": gpuMemory,
  "machine.cpu_cores": cpuCores,
  "machine.ram_gb": ramGb,
  
  // External Service Context (when applicable)
  "external_service.name": serviceName, // e.g., "comfyui", "openai"
  "external_service.endpoint": serviceEndpoint,
  "external_service.version": serviceVersion
}
```

**Child Spans**:
- `job.preprocessing` - Input validation and preparation
- `external_service.call` - Calls to ComfyUI, OpenAI, etc.
- `job.postprocessing` - Result processing and asset saving
- `job.result_upload` - Upload to cloud storage

---

### 4. External Service Integration

**Touchpoint**: ComfyUI Workflow Execution
**Span Name**: `comfyui.workflow.execute`
**Service Name**: `emp-comfyui-worker`

**Attributes Captured**:
```typescript
{
  // ComfyUI Context
  "comfyui.endpoint": comfyuiUrl,
  "comfyui.workflow_id": workflowId,
  "comfyui.prompt_id": promptId,
  "comfyui.node_count": nodeCount,
  "comfyui.estimated_steps": estimatedSteps,
  
  // Workflow Context
  "workflow.type": workflowType, // txt2img, img2img, etc.
  "workflow.model": modelName,
  "workflow.resolution": `${width}x${height}`,
  "workflow.seed": seed,
  "workflow.steps": steps,
  "workflow.cfg_scale": cfgScale,
  
  // Performance Context
  "comfyui.queue_position": queuePosition,
  "comfyui.execution_time_ms": executionTime,
  "comfyui.memory_usage_mb": memoryUsage,
  "comfyui.vram_usage_mb": vramUsage,
  
  // Model Context
  "model.name": modelName,
  "model.size_gb": modelSize,
  "model.download_required": modelDownloadRequired,
  "model.download_time_ms": modelDownloadTime
}
```

**Events**:
- `comfyui.prompt.submitted`
- `comfyui.execution.started`
- `comfyui.progress.updated` (with progress percentage)
- `comfyui.execution.completed`
- `comfyui.results.retrieved`

---

**Touchpoint**: OpenAI API Calls
**Span Name**: `openai.api.call`
**Service Name**: `emp-openai-worker`

**Attributes Captured**:
```typescript
{
  // OpenAI Context
  "openai.model": model, // gpt-4, dall-e-3, etc.
  "openai.endpoint": endpoint, // /chat/completions, /images/generations
  "openai.request_id": openaiRequestId,
  
  // Request Context
  "openai.prompt_tokens": promptTokens,
  "openai.completion_tokens": completionTokens,
  "openai.total_tokens": totalTokens,
  "openai.max_tokens": maxTokens,
  "openai.temperature": temperature,
  
  // Image Generation Context (if applicable)
  "image.size": imageSize, // 1024x1024
  "image.quality": quality, // standard, hd
  "image.style": style, // vivid, natural
  "image.format": format, // url, b64_json
  
  // Performance Context
  "openai.response_time_ms": responseTime,
  "openai.rate_limit_remaining": rateLimitRemaining,
  "openai.rate_limit_reset": rateLimitReset
}
```

---

### 5. WebSocket Response Delivery (`apps/api/src/lightweight-api-server.ts`)

**Touchpoint**: Real-time Event Broadcasting
**Span Name**: `websocket.event.broadcast`
**Service Name**: `emp-job-queue-api`

**Attributes Captured**:
```typescript
{
  // WebSocket Context
  "websocket.event_type": eventType, // job.progress, job.completed, etc.
  "websocket.client_count": connectedClients,
  "websocket.session_id": sessionId,
  
  // Event Context
  "event.job_id": jobId,
  "event.correlation_id": correlationId,
  "event.payload_size_bytes": payloadSize,
  "event.sequence_number": sequenceNumber,
  
  // Timing Context
  "event.processing_latency_ms": processingLatency,
  "event.queue_to_response_ms": totalLatency,
  "event.broadcast_duration_ms": broadcastDuration,
  
  // Business Context
  "job.final_status": finalStatus,
  "job.total_processing_time_ms": totalProcessingTime,
  "job.retry_count": retryCount,
  "customer.response_delivered": true
}
```

**Events**:
- `websocket.message.serialized`
- `websocket.message.sent`
- `websocket.client.notified`

---

### 6. Machine Startup and Bootstrap Process

**Touchpoint**: Machine Container Initialization
**Span Name**: `machine.startup`
**Service Name**: `emp-machine-bootstrap`

**Attributes Captured**:
```typescript
{
  // Machine Context
  "machine.id": machineId,
  "machine.type": machineType, // comfyui, simulation, openai
  "machine.profile": profile, // base, comfyui-local, sim-test-local-dev
  "machine.hardware.gpu_count": gpuCount,
  "machine.hardware.cpu_cores": cpuCores,
  "machine.hardware.ram_gb": ramGb,
  "machine.hardware.disk_gb": diskGb,
  
  // Container Context
  "container.image": containerImage,
  "container.platform": platform, // linux/amd64
  "container.memory_limit": memoryLimit,
  "container.restart_policy": restartPolicy,
  
  // Environment Context
  "deployment.environment": environment, // production, local-dev
  "deployment.region": region,
  "deployment.version": version,
  "workers.specification": workersSpec, // "simulation:1", "comfyui:auto"
  
  // Startup Timing
  "startup.total_duration_ms": totalStartupTime,
  "startup.phases_completed": phasesCompleted,
  "startup.ready_for_jobs": readyForJobs
}
```

**Child Spans**:

#### 6.1 Environment Setup
**Span Name**: `machine.startup.environment`
```typescript
{
  "environment.node_version": nodeVersion,
  "environment.variables_loaded": envVarsLoaded,
  "environment.secrets_available": secretsAvailable,
  "directories.created_count": directoriesCreated,
  "permissions.setup_success": permissionsSuccess
}
```

#### 6.2 Dependency Installation  
**Span Name**: `machine.startup.dependencies`
```typescript
{
  "dependencies.package_manager": "pnpm",
  "dependencies.install_duration_ms": installDuration,
  "dependencies.packages_installed": packagesInstalled,
  "dependencies.cache_hit_ratio": cacheHitRatio,
  "dependencies.total_size_mb": totalSizeMb
}
```

#### 6.3 Worker Bundle Download/Setup
**Span Name**: `machine.startup.worker_bundle`
```typescript
{
  // Bundle Context
  "bundle.mode": bundleMode, // "local" or "remote"
  "bundle.source": bundleSource, // "build-time" or "runtime-download"
  "bundle.size_mb": bundleSizeMb,
  "bundle.version": bundleVersion,
  
  // Download Context (for remote mode)
  "download.url": downloadUrl,
  "download.duration_ms": downloadDuration,
  "download.transfer_rate_mbps": transferRate,
  "download.retry_count": retryCount,
  
  // Extraction Context
  "extraction.duration_ms": extractionDuration,
  "extraction.files_extracted": filesExtracted,
  "validation.bundle_integrity": bundleIntegrity,
  "validation.executable_permissions": executablePermissions
}
```

#### 6.4 Service Component Installation
**Span Name**: `machine.startup.component_installation`
```typescript
{
  // Component Context
  "components.total_count": totalComponents,
  "components.installation_strategy": installationStrategy, // "parallel", "sequential"
  "components.max_concurrent": maxConcurrent,
  
  // Installation Performance
  "installation.total_duration_ms": totalInstallDuration,
  "installation.parallel_efficiency": parallelEfficiency,
  "installation.cache_usage": cacheUsage,
  "installation.network_usage_mb": networkUsageMb
}
```

**Child Spans per Component**:
**Span Name**: `component.install.{component_name}`
```typescript
{
  // Component Identity
  "component.name": componentName, // "txt2img-flux", "comfyui-nodes"
  "component.type": componentType, // "git_repo", "model_download", "npm_package"
  "component.version": componentVersion,
  "component.required": componentRequired,
  
  // Download Context
  "download.url": downloadUrl,
  "download.method": downloadMethod, // "git clone", "wget", "curl"
  "download.size_mb": downloadSizeMb,
  "download.duration_ms": downloadDuration,
  "download.resume_used": resumeUsed, // for wget resume support
  
  // Installation Context  
  "install.duration_ms": installDuration,
  "install.dependencies_count": dependenciesCount,
  "install.requirements_file": requirementsFile,
  "install.post_install_steps": postInstallSteps,
  
  // Validation Context
  "validation.success": validationSuccess,
  "validation.files_present": filesPresent,
  "validation.env_files_created": envFilesCreated,
  "validation.executable_found": executableFound
}
```

#### 6.5 Service Startup (PM2)
**Span Name**: `machine.startup.services`
```typescript
{
  // PM2 Context
  "pm2.ecosystem_file": ecosystemFile,
  "pm2.processes_defined": processesdefined,
  "pm2.startup_strategy": startupStrategy, // "sequential", "parallel"
  
  // Service Context
  "services.total_count": totalServices,
  "services.comfyui_instances": comfyuiInstances,
  "services.worker_instances": workerInstances,
  "services.background_services": backgroundServices,
  
  // Timing Context
  "startup.services_duration_ms": servicesDuration,
  "startup.health_check_duration_ms": healthCheckDuration,
  "startup.ready_state_reached": readyStateReached
}
```

**Child Spans per Service**:
**Span Name**: `service.startup.{service_name}`
```typescript
{
  // Service Identity
  "service.name": serviceName, // "comfyui-gpu0", "redis-worker-simulation-0"
  "service.type": serviceType, // "comfyui", "worker", "simulation"
  "service.instance_id": instanceId,
  "service.binding": binding, // "gpu", "cpu", "mock_gpu"
  
  // Resource Context
  "resource.gpu_assigned": gpuAssigned,
  "resource.memory_limit_mb": memoryLimitMb,
  "resource.cpu_limit": cpuLimit,
  "resource.port_assigned": portAssigned,
  
  // Startup Performance
  "startup.command": startupCommand,
  "startup.duration_ms": startupDuration,
  "startup.first_log_received_ms": firstLogReceived,
  "startup.ready_signal_ms": readySignal,
  
  // Health Check
  "health.initial_check_duration_ms": healthCheckDuration,
  "health.endpoint": healthEndpoint,
  "health.status_code": healthStatusCode,
  "health.response_time_ms": healthResponseTime
}
```

#### 6.6 Redis Worker Registration
**Span Name**: `machine.startup.worker_registration`
```typescript
{
  // Registration Context
  "registration.redis_endpoint": redisEndpoint,
  "registration.worker_count": workerCount,
  "registration.capabilities": JSON.stringify(capabilities),
  "registration.machine_metadata": JSON.stringify(machineMetadata),
  
  // Performance Context
  "registration.duration_ms": registrationDuration,
  "registration.retry_count": retryCount,
  "registration.heartbeat_established": heartbeatEstablished,
  "registration.job_polling_started": jobPollingStarted,
  
  // Readiness Context
  "readiness.machine_visible": machineVisible,
  "readiness.accepting_jobs": acceptingJobs,
  "readiness.monitor_connected": monitorConnected,
  "readiness.total_bootstrap_time_ms": totalBootstrapTime
}
```

#### 6.7 Telemetry Services Startup
**Span Name**: `machine.startup.telemetry`
```typescript
{
  // OTel Collector
  "otel.collector_started": collectorStarted,
  "otel.config_generated": configGenerated,
  "otel.dash0_connected": dash0Connected,
  "otel.health_check_passed": healthCheckPassed,
  
  // Fluent Bit
  "fluentbit.started": fluentbitStarted,
  "fluentbit.config_generated": fluentbitConfigGenerated,
  "fluentbit.fluentd_connected": fluentdConnected,
  
  // Nginx Proxy
  "nginx.proxy_started": proxyStarted,
  "nginx.config_valid": configValid,
  "nginx.port_bound": portBound
}
```

---

### 7. Error and Failure Tracking

**Touchpoint**: Any Failure Point
**Span Name**: `{component}.error.{error_type}`
**Service Name**: `emp-{component}`

**Attributes Captured**:
```typescript
{
  // Error Context
  "error.type": errorType, // validation, timeout, service_unavailable
  "error.message": errorMessage,
  "error.stack_trace": stackTrace,
  "error.code": errorCode,
  
  // Recovery Context
  "recovery.attempted": recoveryAttempted,
  "recovery.strategy": recoveryStrategy, // retry, fallback, fail
  "recovery.success": recoverySuccess,
  
  // Impact Context
  "impact.job_failed": jobFailed,
  "impact.customer_notified": customerNotified,
  "impact.service_degraded": serviceDegraded,
  
  // Debugging Context
  "debug.component_version": componentVersion,
  "debug.environment": environment,
  "debug.deployment_id": deploymentId,
  "debug.machine_id": machineId
}
```

## Trace Correlation Patterns

### 1. Request-to-Response Correlation

```typescript
// Root trace: Client request
trace_id: "a1b2c3d4e5f6789012345678901234567890abcd"

// Child spans linked by parent_span_id:
// → API request processing
// → Redis job submission  
// → Worker job claim
// → External service execution
// → Result processing
// → WebSocket response
```

### 2. Cross-Service Correlation

```typescript
// Trace context propagation through Redis:
{
  job: {
    id: "job_123",
    trace_context: {
      trace_id: "a1b2c3d4...",
      parent_span_id: "def456",
      span_id: "ghi789"
    }
  }
}
```

### 3. Business Transaction Tracking

```typescript
// Workflow correlation:
{
  workflow_id: "wf_456",
  correlation_id: "txn_789",
  customer_id: "cust_123",
  trace_sessions: [
    "a1b2c3d4...", // Step 1 trace
    "e5f6g7h8...", // Step 2 trace  
    "i9j0k1l2..."  // Step 3 trace
  ]
}
```

## Sampling and Performance

### Sampling Strategy

- **100% sampling** for errors and failures
- **100% sampling** for requests >5s duration
- **10% sampling** for successful requests <1s
- **50% sampling** for requests 1-5s duration
- **Customer VIP tier**: 100% sampling regardless

### Performance Targets

- **Trace overhead**: <2ms per span
- **Context propagation**: <0.5ms
- **Batch export**: 1000 spans per batch
- **Export frequency**: Every 5 seconds
- **Local collector buffer**: 10,000 spans

## Dashboards and Alerting

### Key Metrics to Track

1. **Request Latency Percentiles** (P50, P95, P99)
2. **Queue Wait Times** by service type
3. **Worker Utilization** and job processing rates
4. **External Service Performance** (ComfyUI, OpenAI response times)
5. **Error Rates** by component and error type
6. **Customer SLA Compliance** (response time commitments)
7. **Machine Startup Performance** (bootstrap duration, component installation times)
8. **Worker Bundle Performance** (download speeds, extraction times)
9. **Service Readiness Times** (PM2 startup, health check latency)

### Alert Conditions

- **P95 latency >30 seconds** for any service
- **Queue wait time >2 minutes** for high priority jobs
- **Error rate >5%** in any 5-minute window
- **Worker utilization <20%** (underutilization)
- **External service failure rate >10%**
- **Trace data gaps** (missing telemetry)
- **Machine startup time >5 minutes** (bootstrap performance)
- **Component installation failure rate >2%** (deployment reliability)
- **Worker bundle download speed <1MB/s** (network performance)
- **Service readiness time >30 seconds** (PM2 health)

## Implementation Checklist

### Phase 1: Core Infrastructure ✅
- [x] Local OTel Collector deployment
- [x] Worker telemetry basic spans
- [x] Dash0 integration verified

### Phase 2: Trace Context Propagation
- [ ] Extend Job interface with trace context
- [ ] API server trace generation
- [ ] Redis context storage/retrieval
- [ ] Worker trace continuation

### Phase 3: Comprehensive Instrumentation
- [ ] HTTP request/response tracing
- [ ] External service call tracing
- [ ] WebSocket event correlation
- [ ] Error and recovery tracing
- [ ] Machine startup and bootstrap tracing
- [ ] Component installation performance tracking
- [ ] Worker bundle download monitoring

### Phase 4: Analytics and Optimization
- [ ] Performance dashboard creation
- [ ] SLA monitoring setup
- [ ] Anomaly detection configuration
- [ ] Capacity planning metrics

## Benefits Delivered

### Operational Excellence
- **Mean Time to Resolution (MTTR)**: <5 minutes for P1 incidents
- **Root Cause Analysis**: Complete request journey visibility
- **Performance Optimization**: Identify bottlenecks across service boundaries
- **Capacity Planning**: Data-driven scaling decisions

### Business Intelligence  
- **Customer Experience**: Actual vs. promised response times
- **Service Quality**: Success rates, retry patterns, failure modes
- **Resource Efficiency**: Worker utilization, queue optimization
- **Revenue Impact**: Trace high-value customer requests end-to-end

### Developer Productivity
- **Debugging Speed**: Follow request traces instead of log correlation
- **Feature Impact**: Before/after performance analysis
- **Testing Validation**: Verify distributed behavior in staging
- **Code Quality**: Identify performance anti-patterns

This distributed tracing architecture provides complete visibility into our request lifecycle while maintaining high performance and actionable insights for both operational and business decisions.