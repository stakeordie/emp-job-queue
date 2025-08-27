# Observability & Monitoring

> **Building the most reliable part of our system** - Complete visibility into distributed AI workloads

## Overview

Our observability strategy provides complete visibility into the distributed job processing system through a **5-track telemetry architecture** that captures logs, traces, metrics, events, and errors from every component.

## Quick Start

🚀 **Get started immediately:** [Telemetry Setup Guide ⭐](./telemetry-setup-guide.md) - Complete implementation guide with examples

📊 **Understand the architecture:** [System Architecture](./system-architecture.md) - 5-track observability system design

## Documentation Structure

### Essential Reading
- **[Telemetry Setup Guide ⭐](./telemetry-setup-guide.md)** - Complete implementation guide with step-by-step setup
- **[System Architecture](./system-architecture.md)** - 5-track observability system architecture and design
- **[Information Flow](./information-flow.md)** - How telemetry data moves through the system
- **[Implementation Status](./implementation-status.md)** - Current progress and roadmap

### Advanced Usage  
- **[OTEL Trace Library](./otel-trace-library.md)** - OpenTelemetry integration and usage patterns
- **[Query & Debug Guide](./query-debug-guide.md)** - Practical debugging and monitoring queries

## Key Concepts

### The Five Tracks

1. **🚌 Operational Event Bus** - Application state management and workflow automation
2. **📋 Log Collection** - Raw log aggregation from all services
3. **🔗 Distributed Tracing** - Request flow tracking across services  
4. **📊 Metrics Collection** - Quantitative performance and operational data
5. **🐛 Code Monitoring** - Error tracking and analysis

### Correlation Strategy

Every piece of telemetry is automatically correlated using:
- `trace_id` - Links all operations in a request
- `job_id` - Links all operations for a job
- `machine_id` - Identifies the originating machine
- `worker_id` - Identifies specific workers

## Current Status

### ✅ Production Ready (Phase 1 Complete)
- **Centralized logging pipeline** - Fluent Bit → Fluentd → Dash0
- **ConnectorLogger library** - Structured logging interface for all services
- **Worker ID scheme** - Hierarchical machine/worker/service identification
- **Job lifecycle tracking** - Complete visibility into job processing stages

### 🚧 In Development
- **OpenTelemetry integration** - Distributed tracing implementation
- **Metrics collection** - Performance and resource monitoring
- **Sentry integration** - Error tracking and analysis

### 📋 Planned
- **Advanced analytics** - ML-based anomaly detection
- **Predictive alerting** - Automated incident detection
- **Custom dashboards** - Pre-built monitoring templates

## Quick Usage

### Basic Job Logging
```typescript
import { ConnectorLogger } from '@emp/core';

const logger = new ConnectorLogger({
  machineId: process.env.MACHINE_ID,
  workerId: process.env.WORKER_ID,
  serviceType: 'comfyui',
  connectorId: 'comfyui-local'
});

// Job lifecycle tracking
const jobLogger = logger.withJobContext('job-12345');
jobLogger.jobReceived({ jobId: 'job-12345', inputSize: 1024 });
jobLogger.jobCompleted({ jobId: 'job-12345', duration: 15000, outputCount: 4 });
```

### Environment Setup
```bash
# Core configuration
DASH0_API_KEY=your-dash0-api-key
DASH0_DATASET=development
MACHINE_ID=railway-comfyui-01
WORKER_ID=worker-001
SERVICE_TYPE=comfyui

# Logging pipeline
FLUENTD_HOST=your-fluentd-service.railway.app
FLUENTD_PORT=8888
```

## Success Metrics

Our observability system aims to achieve:
- **✅ 99.9%** telemetry delivery reliability (current)
- **✅ <10ms** logging overhead per operation (current)
- **🎯 100%** service coverage (in progress)
- **🎯 <2 min** mean time to debug any issue (target)
- **🎯 Real-time** job status visibility (target)

## Getting Help

- **Implementation issues**: See [Telemetry Setup Guide](./telemetry-setup-guide.md)
- **System design questions**: See [System Architecture](./system-architecture.md)
- **Debugging problems**: See [Query & Debug Guide](./query-debug-guide.md)
- **Current progress**: See [Implementation Status](./implementation-status.md)