# System Architecture

> **5-Track Observability System** - Complete observability architecture for distributed AI workloads

## Architecture Overview

The emp-job-queue implements a comprehensive **5-track observability approach** with each track serving distinct but complementary purposes:

<FullscreenDiagram>

```mermaid
graph TB
    subgraph "Application Layer"
        APP[Job Processing]
        WORKER[Workers]
        API[API Server]
        MACHINE[Machines]
    end
    
    subgraph "Track 1: Operational Event Bus 🚌"
        CONNECTOR[ConnectorLogger]
        EVENTS[Operational Events]
        WORKFLOWS[Workflow Triggers]
    end
    
    subgraph "Track 2: Log Collection 📋"
        FLUENT[Fluent Bit]
        LOGS[Raw Logs]
        TAIL[Log Tailing]
    end
    
    subgraph "Track 3: Tracing 🔗"
        OTEL_T[OTel Tracing]
        SPANS[Spans & Traces]
        DISTRIB[Distributed Traces]
    end
    
    subgraph "Track 4: Metrics 📊"
        OTEL_M[OTel Metrics]
        COUNTERS[Counters]
        GAUGES[Gauges]
        HISTOGRAMS[Histograms]
    end
    
    subgraph "Track 5: Code Monitoring 🐛"
        SENTRY[Sentry]
        ERRORS[Error Tracking]
        PERF[Performance Issues]
    end
    
    subgraph "External Systems"
        DASH0[Dash0 Platform]
        SENTRY_UI[Sentry Dashboard]
        INTERNAL[Internal Business Logic]
    end
    
    %% Application to Tracks
    APP --> FLUENT
    APP --> OTEL_T
    APP --> OTEL_M
    APP --> SENTRY
    APP --> CONNECTOR
    
    WORKER --> FLUENT
    WORKER --> OTEL_T
    WORKER --> OTEL_M
    WORKER --> SENTRY
    WORKER --> CONNECTOR
    
    API --> FLUENT
    API --> OTEL_T
    API --> OTEL_M
    API --> SENTRY
    
    MACHINE --> FLUENT
    MACHINE --> OTEL_T
    MACHINE --> OTEL_M
    
    %% Track Components
    FLUENT --> LOGS
    LOGS --> TAIL
    
    OTEL_T --> SPANS
    SPANS --> DISTRIB
    
    OTEL_M --> COUNTERS
    OTEL_M --> GAUGES
    OTEL_M --> HISTOGRAMS
    
    SENTRY --> ERRORS
    SENTRY --> PERF
    
    CONNECTOR --> EVENTS
    EVENTS --> WORKFLOWS
    
    %% External Destinations
    WORKFLOWS --> INTERNAL
    TAIL --> DASH0
    DISTRIB --> DASH0
    COUNTERS --> DASH0
    GAUGES --> DASH0
    HISTOGRAMS --> DASH0
    
    ERRORS --> SENTRY_UI
    PERF --> SENTRY_UI
    
    %% Styling
    classDef track1 fill:#fce4ec,stroke:#c2185b,stroke-width:2px
    classDef track2 fill:#e1f5fe,stroke:#0277bd,stroke-width:2px
    classDef track3 fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef track4 fill:#e8f5e8,stroke:#388e3c,stroke-width:2px
    classDef track5 fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    classDef external fill:#f5f5f5,stroke:#757575,stroke-width:2px
    
    class CONNECTOR,EVENTS,WORKFLOWS track1
    class FLUENT,LOGS,TAIL track2
    class OTEL_T,SPANS,DISTRIB track3
    class OTEL_M,COUNTERS,GAUGES,HISTOGRAMS track4
    class SENTRY,ERRORS,PERF track5
    class DASH0,SENTRY_UI,INTERNAL external
```

</FullscreenDiagram>

## The Five Tracks

### Track 1: Operational Event Bus 🚌 - Application State Management

**Purpose**: Generate structured operational events that trigger application state changes and workflow automation

**Technology Stack**:
- **ConnectorLogger**: Structured operational event generation
- **Event Bus Architecture**: Message routing and delivery system
- **Event Processors**: Application state change handlers and workflow triggers

**What It Captures**:
- Job lifecycle events (received, started, progress, completed, failed)
- System coordination events (resource allocation, service health changes)
- Workflow automation triggers (notifications, data pipelines, integrations)

**Current Status**: ✅ **Active** - ConnectorLogger implemented and in use

### Track 2: Log Collection 📋 - Raw Log Aggregation

**Purpose**: Collect and aggregate ALL raw logs from containers and processes

**Technology Stack**:
- **Fluent Bit**: Primary log collection agent
- **Fluentd**: Log aggregation and processing  
- **Log Tailing**: Direct log file monitoring

**What It Captures**:
- Container stdout/stderr streams
- Application log files
- System logs (auth, kernel, etc.)
- Service-specific logs (PM2, ComfyUI, etc.)

**Current Status**: ✅ **Active** - Fluent Bit configured and running

### Track 3: Tracing 🔗 - Request Flow Tracking

**Purpose**: Track request lifecycles and performance across distributed services

**Technology Stack**:
- **OpenTelemetry (OTel)**: Tracing SDK and auto-instrumentation
- **OTel Collector**: Local trace aggregation and forwarding
- **Trace Context Propagation**: Cross-service correlation

**What It Captures**:
- Request spans (HTTP requests, WebSocket connections, job processing)
- Service interactions (API → Redis → Worker → ComfyUI flows)
- Performance timing (latency, duration, bottlenecks)
- Error correlation (failed spans with context)

**Current Status**: ✅ **Active** - OTel collector configured

### Track 4: Metrics 📊 - System Performance Data

**Purpose**: Collect quantitative performance metrics and operational data

**Technology Stack**:
- **OpenTelemetry Metrics**: Counters, gauges, histograms
- **OTel Collector**: Metrics aggregation and export
- **Custom Metrics**: Business-specific measurements

**What It Captures**:
- Counters (jobs processed, errors occurred, requests received)
- Gauges (active jobs, queue sizes, resource usage)
- Histograms (response times, job durations, queue wait times)
- Resource metrics (CPU, memory, GPU usage)

**Current Status**: ⚠️ **Planned** - Implementation needed

### Track 5: Code Monitoring 🐛 - Error Tracking & Analysis

**Purpose**: Capture, aggregate, and analyze application errors and performance issues

**Technology Stack**:
- **Sentry**: Error tracking and performance monitoring
- **Source Maps**: Accurate error location mapping
- **Context Enrichment**: User and environment data

**What It Captures**:
- Exceptions (unhandled errors with full stack traces)
- Performance issues (slow queries, memory leaks, bottlenecks)
- User context (request details, user sessions, environment)
- Release tracking (error rates per deployment)

**Current Status**: 🚧 **Ready for Implementation**

## Worker ID Scheme & Log Structure

### Structure
```json
{
  "machine_id": "railway-abc123",     // Railway deployment instance
  "worker_id": "worker-001",          // Unique worker per machine
  "service_type": "comfyui"           // Service type (comfyui, simulation, a1111)
}
```

### Combined Identifier
- **Full ID**: `machine-railway-abc123.worker-001`
- **Used for**: OpenTelemetry `service.instance.id`, log correlation

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

## Context Propagation & Correlation

### Primary Correlation IDs

- **trace_id**: Links all operations for a single request (32-character hex)
- **job_id**: Links all operations for a job (`job-{uuid}`)  
- **machine_id**: Identifies originating machine (`{type}-{identifier}`)
- **worker_id**: Identifies specific worker (`{machine_id}-worker-{index}`)

### Correlation Strategy

Every piece of telemetry is automatically correlated using these IDs across all tracks, enabling powerful cross-track analysis:

- Find all logs for a trace_id
- See all traces for a job_id  
- Check all metrics for a machine_id
- Correlate all events in a time window

## Deployment Architecture

<FullscreenDiagram>

```mermaid
graph TB
    subgraph "Production Machines"
        subgraph "Each Machine Has:"
            APP_LOGS[Application<br/>Structured Logging]
            APP_TRACES[Application<br/>OpenTelemetry SDK]
            
            FB_LOCAL[Fluent Bit<br/>- Log collection<br/>- Local buffering<br/>- Retry logic]
            OTEL_LOCAL[OTel Collector<br/>- Trace/metrics collection<br/>- Batching<br/>- Direct export]
            
            APP_LOGS --> FB_LOCAL
            APP_TRACES --> OTEL_LOCAL
        end
    end
    
    subgraph "Railway - Central Infrastructure"
        FLUENTD_CENTRAL[Fluentd<br/>- Log processing<br/>- Enrichment<br/>- Routing]
        REDIS_BUFFER[(Redis<br/>- Reliability queue<br/>- Failure recovery<br/>- Backpressure)]
        
        FLUENTD_CENTRAL --> REDIS_BUFFER
    end
    
    subgraph "Dash0 - Analytics Platform"
        DASH0_INGEST[OTLP Ingestion<br/>ingress.us-west-2.aws.dash0.com]
        DASH0_LOGS_API[Logs API<br/>Structured search]
        DASH0_TRACES_API[Traces API<br/>Distributed tracing]
        DASH0_METRICS_API[Metrics API<br/>Time-series data]
        
        DASH0_INGEST --> DASH0_LOGS_API
        DASH0_INGEST --> DASH0_TRACES_API  
        DASH0_INGEST --> DASH0_METRICS_API
    end
    
    %% Data Flow Paths
    FB_LOCAL -->|Fluent Forward<br/>Port 24225<br/>TLS + Auth| FLUENTD_CENTRAL
    REDIS_BUFFER -->|HTTP Batch<br/>Retry Logic| DASH0_INGEST
    
    OTEL_LOCAL -->|OTLP/gRPC<br/>Port 4317<br/>Direct| DASH0_INGEST
    
    %% Development Override
    subgraph "Local Development"
        DEV_APP[Dev Application]
        DEV_DIRECT[Direct HTTP]
        DEV_APP --> DEV_DIRECT
        DEV_DIRECT -->|HTTP<br/>Port 24224| FLUENTD_CENTRAL
    end
```

</FullscreenDiagram>

## Key Benefits

### Immediate Benefits (Current Implementation)
- ✅ **Unified Log View** - All worker logs in single Dash0 interface
- ✅ **Structured Search** - Query by job_id, worker_id, service_type, event_type
- ✅ **Job Lifecycle Tracking** - Complete visibility into job processing stages
- ✅ **Error Correlation** - Connect failures across distributed workers

### Future Benefits (Planned Implementation)
- 🔮 **Distributed Tracing** - End-to-end request flows across services
- 🔮 **Predictive Alerting** - ML-based anomaly detection
- 🔮 **Capacity Planning** - Resource utilization trends and forecasting
- 🔮 **SLA Monitoring** - Automated performance threshold tracking

## Best Practices

### Data Retention
- **Track 1**: 30 days for general logs, 90 days for error logs
- **Track 2**: 7 days for all traces, longer for errors  
- **Track 3**: 1 year for aggregated metrics, 30 days for raw data
- **Track 4**: 90 days for resolved issues, 1 year for unresolved
- **Track 5**: 6 months for business events, longer for analytics

### Sampling Strategies
- **Track 2**: 10% for normal requests, 100% for errors
- **Track 3**: All metrics, 30-second intervals
- **Track 4**: 10% for performance, 100% for errors
- **Track 5**: All business events (critical for business logic)

For detailed implementation instructions, see the [Telemetry Setup Guide](./telemetry-setup-guide.md).