# Observability Architecture

## Overview

The emp-job-queue system implements a comprehensive observability strategy with unified correlation across logs, traces, and metrics. This document outlines the architecture, ID scheme, and log flow.

## Architecture Flow

```
Worker Services → Fluent Bit Sidecar → Fluentd Service → Dash0 Dashboard
                       ↓
              Log Normalization & Enrichment
```

## Worker ID Scheme

### Structure
```json
{
  "machine_id": "railway-abc123",     // Railway deployment instance
  "worker_id": "worker-001",          // Unique worker per machine (incremental)
  "service_type": "comfyui"           // Service type (comfyui, simulation, a1111)
}
```

### Combined Identifier
- **Full ID**: `machine-railway-abc123.worker-001`
- **Used for**: OpenTelemetry `service.instance.id`, log correlation

### Examples
```
machine-railway-abc123.worker-001  (service_type: comfyui)
machine-railway-abc123.worker-002  (service_type: comfyui)  
machine-railway-abc123.worker-003  (service_type: simulation)
machine-railway-xyz789.worker-001  (service_type: a1111)
```

## Log Structure

### Standardized Log Format
All logs are normalized to this structure by Fluent Bit:

```json
{
  "timestamp": "2025-08-07T00:15:23.456Z",
  "level": "info",
  "message": "Processing job job-abc123",
  "machine_id": "railway-abc123",
  "worker_id": "worker-001", 
  "service_type": "comfyui",
  "job_id": "job-abc123",
  "duration_ms": 1250,
  "source": "stdout"
}
```

### Log Sources
- **stdout/stderr**: Console logs from worker processes
- **File logs**: Structured logs written to files
- **Application logs**: Direct HTTP calls to logging endpoints

## OpenTelemetry Integration

### Trace Attributes
```json
{
  "resource": {
    "service.name": "emp-worker",
    "service.instance.id": "machine-railway-abc123.worker-001",
    "machine.id": "railway-abc123",
    "worker.id": "worker-001",
    "service.type": "comfyui"
  },
  "tags": {
    "job.id": "job-abc123",
    "job.type": "image_generation"
  }
}
```

## Services Architecture

### 1. Worker Services
- **Location**: Railway containers
- **Types**: comfyui, simulation, a1111
- **Logging**: Mixed formats (console.log, structured logging, etc.)

### 2. Fluent Bit Sidecar
- **Purpose**: Log collection, normalization, and forwarding
- **Deployment**: One per Railway machine (not per worker)
- **Functions**:
  - Collect logs from all workers on the machine
  - Parse and normalize different log formats
  - Add worker metadata (machine_id, worker_id, service_type)
  - Forward to Fluentd service

### 3. Fluentd Service
- **Purpose**: Central log aggregation and routing
- **Location**: Dedicated service
- **Functions**:
  - Receive logs from all Fluent Bit sidecars
  - Apply additional processing/filtering
  - Forward to Dash0 with authentication

### 4. Dash0 Dashboard
- **Purpose**: Observability platform
- **Functions**:
  - Log storage and search
  - Trace correlation
  - Alerting and monitoring

## Log Flow Details

### Step 1: Worker Logging
Workers log in various formats:
```javascript
// ComfyUI Worker
console.log("Job completed", jobId, duration);

// Simulation Worker  
logger.info(`Processing simulation ${simId}`);

// A1111 Worker
console.error("Model load failed:", error.message);
```

### Step 2: Fluent Bit Collection
Fluent Bit collects and transforms:
```
Raw: "Job completed job-123 1500ms"
↓
Structured: {
  "message": "Job completed job-123 1500ms",
  "machine_id": "railway-abc123",
  "worker_id": "worker-001",
  "service_type": "comfyui",
  "timestamp": "2025-08-07T00:15:23.456Z",
  "level": "info"
}
```

### Step 3: Fluentd Processing
Fluentd receives structured logs and forwards to Dash0 with proper authentication and dataset routing.

### Step 4: Dash0 Analysis
Logs are searchable and correlatable:
- `machine_id:"railway-abc123"` - All workers on this machine
- `service_type:"comfyui"` - All ComfyUI workers across all machines  
- `worker_id:"worker-001"` - This specific worker instance
- `job_id:"job-abc123"` - All logs related to this specific job

## Correlation Capabilities

### Cross-Service Debugging
When a job fails:
1. **Find the trace** by `job_id`
2. **See all logs** from that `worker_id` during the time window
3. **Check machine health** using `machine_id`
4. **Compare with other** `service_type:"comfyui"` workers

### Machine-Level Analysis
- All workers on a failing machine: `machine_id:"railway-abc123"`
- Performance comparison across machines
- Resource utilization correlation

### Service-Level Analysis
- All ComfyUI workers: `service_type:"comfyui"`
- Service-specific error patterns
- Performance benchmarking across service types

## Environment Variables

### Worker Containers
```bash
MACHINE_ID=railway-abc123      # Railway instance identifier
WORKER_ID=worker-001           # Unique worker ID per machine
SERVICE_TYPE=comfyui           # Service type for this worker
FLUENTD_HOST=your-fluentd-host # Fluent Bit destination
```

### Fluent Bit Sidecar
```bash
MACHINE_ID=railway-abc123      # Same as workers
FLUENTD_HOST=your-fluentd-host # Fluentd service endpoint
```

## Implementation Status

- [x] Fluentd service with Dash0 integration
- [x] ID scheme design
- [ ] Fluent Bit sidecar implementation
- [ ] Worker logging standardization
- [ ] OpenTelemetry integration
- [ ] End-to-end testing

## Next Steps

1. Implement Fluent Bit sidecar service
2. Configure log collection and normalization
3. Test end-to-end log flow
4. Implement OpenTelemetry trace correlation
5. Create Dash0 dashboards and alerts