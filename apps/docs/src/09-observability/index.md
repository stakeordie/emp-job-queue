# Observability & Monitoring

> **Building the most reliable part of our system** - Complete visibility into distributed AI workloads

## Overview

Our observability strategy provides complete visibility into the distributed job processing system through a unified telemetry platform that captures logs, traces, metrics, and events from every component.

## Core Documentation

### [Information Flow & Architecture](./information-flow.md)
Complete mapping of how data flows through the system, including:
- Service communication patterns
- Telemetry data flows
- Context propagation strategy
- Correlation ID design

### [Implementation Architecture](./architecture.md)
Technical design for the observability platform:
- Zero-configuration telemetry client
- Reliability guarantees
- Collection infrastructure
- Query interfaces

## Quick Links

### For Developers
- [Adding Telemetry](./adding-telemetry.md) - How to instrument new code
- [Debugging Guide](./debugging-guide.md) - Using observability to solve problems
- [Query Cookbook](./query-cookbook.md) - Common queries and patterns

### For Operations
- [Monitoring Setup](./monitoring-setup.md) - Deploying the observability stack
- [Alert Configuration](./alert-configuration.md) - Setting up proactive monitoring
- [Performance Tuning](./performance-tuning.md) - Optimizing telemetry overhead

## Key Concepts

### The Four Pillars

1. **Logs** - What happened
   - Structured JSON format
   - Automatic correlation IDs
   - Centralized aggregation

2. **Traces** - How requests flow
   - Distributed tracing across services
   - Automatic span creation
   - Parent-child relationships

3. **Metrics** - System measurements
   - Performance indicators
   - Resource utilization
   - Business KPIs

4. **Events** - Business moments
   - User actions
   - System state changes
   - Critical business events

### Correlation Strategy

Every piece of telemetry is automatically correlated using:
- `trace_id` - Links all operations in a request
- `job_id` - Links all operations for a job
- `machine_id` - Identifies the originating machine
- `worker_id` - Identifies specific workers

## Architecture Principles

### 1. Zero Configuration
```typescript
// Just import - everything else is automatic
import '@emp/telemetry/auto';
```

### 2. Never Block Operations
- All telemetry is asynchronous
- Circuit breakers prevent cascading failures
- Local buffering ensures no data loss

### 3. Uniform Interface
- Same API across all services
- Consistent correlation IDs
- Standard query patterns

### 4. Progressive Enhancement
- Start with basic logging
- Add traces as needed
- Layer in custom metrics
- Track business events

## Current Status

### ✅ Implemented
- Direct Dash0 integration for metrics
- Machine status telemetry
- Environment-based dataset routing
- Basic correlation IDs

### 🚧 In Progress
- Unified telemetry client package
- Log aggregation pipeline
- Distributed tracing setup
- Query CLI tool

### 📋 Planned
- Full service instrumentation
- Custom dashboards
- Alert rules
- Performance optimization

## Getting Started

### For New Services
```typescript
// 1. Install the telemetry package
npm install @emp/telemetry

// 2. Import auto-instrumentation
import '@emp/telemetry/auto';

// 3. Use the unified API
import { log, trace, metrics, event } from '@emp/telemetry';

log.info('Service started');
const span = trace.startSpan('operation');
metrics.counter('requests').inc();
event('user.action', { type: 'click' });
```

### For Debugging
```bash
# Query logs by job
pnpm telemetry logs --job job-123

# View distributed trace
pnpm telemetry trace abc123def

# Check metrics
pnpm telemetry metrics --machine machine-1

# Correlate everything
pnpm telemetry correlate --job job-456
```

## Success Metrics

Our observability system aims to achieve:
- **99.99%** telemetry delivery reliability
- **<1ms** P99 overhead per operation
- **100%** service coverage
- **<5 min** mean time to debug any issue
- **<$0.001** cost per million events

## Next Steps

1. Review the [Information Flow](./information-flow.md) to understand the system
2. Read the [Architecture](./architecture.md) for technical details
3. Follow the [Implementation Guide](./implementation-guide.md) to add telemetry
4. Use the [Query Cookbook](./query-cookbook.md) for debugging