# Observability Information Flow

## System Overview

The EMP Job Queue system consists of distributed services that need comprehensive observability. This document defines the information flow between services and how telemetry data moves through the system.

## Observability Architecture

<FullscreenDiagram>

```mermaid
graph TB
    subgraph "Machine A (ComfyUI)"
        MA_APP[Application Logs]
        MA_FB[Fluent Bit]
        MA_OTEL[OTel Collector]
        
        MA_APP --> MA_FB
        MA_APP --> MA_OTEL
    end
    
    subgraph "Machine B (Simulation)"
        MB_APP[Application Logs]
        MB_FB[Fluent Bit]
        MB_OTEL[OTel Collector]
        
        MB_APP --> MB_FB
        MB_APP --> MB_OTEL
    end
    
    subgraph "Machine N (OpenAI)"
        MN_APP[Application Logs]
        MN_FB[Fluent Bit]
        MN_OTEL[OTel Collector]
        
        MN_APP --> MN_FB
        MN_APP --> MN_OTEL
    end
    
    subgraph "Local Dev Machine"
        DEV_APP[Application]
        DEV_HTTP[Direct HTTP]
        
        DEV_APP --> DEV_HTTP
    end
    
    subgraph "Railway - Central Processing"
        FLUENTD[Fluentd<br/>Log Aggregation]
        REDIS_QUEUE[(Redis Queue<br/>Buffering)]
        
        FLUENTD --> REDIS_QUEUE
    end
    
    subgraph "Dash0 Analytics"
        DASH0_LOGS[Log Storage]
        DASH0_TRACES[Trace Storage]
        DASH0_METRICS[Metrics Storage]
        DASH0_QUERY[Query Interface]
        
        DASH0_LOGS --> DASH0_QUERY
        DASH0_TRACES --> DASH0_QUERY
        DASH0_METRICS --> DASH0_QUERY
    end
    
    %% Log Flow (Fluent Bit → Fluentd → Dash0)
    MA_FB -->|Forward Protocol| FLUENTD
    MB_FB -->|Forward Protocol| FLUENTD
    MN_FB -->|Forward Protocol| FLUENTD
    DEV_HTTP -->|HTTP| FLUENTD
    
    REDIS_QUEUE -->|Batch Send| DASH0_LOGS
    
    %% Trace/Metrics Flow (OTel → Dash0 Direct)
    MA_OTEL -->|OTLP/HTTP| DASH0_TRACES
    MA_OTEL -->|OTLP/HTTP| DASH0_METRICS
    MB_OTEL -->|OTLP/HTTP| DASH0_TRACES
    MB_OTEL -->|OTLP/HTTP| DASH0_METRICS
    MN_OTEL -->|OTLP/HTTP| DASH0_TRACES
    MN_OTEL -->|OTLP/HTTP| DASH0_METRICS
```

</FullscreenDiagram>

## Job Lifecycle Flow

<FullscreenDiagram>

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant Redis
    participant Machine
    participant Worker
    participant Service
    participant FluentBit as "Fluent Bit"
    participant OTelCol as "OTel Collector" 
    participant Fluentd
    participant Dash0
    
    Client->>API: Submit Job
    API->>Redis: Queue Job
    API-->>Client: Job ID
    
    %% Telemetry from API
    API->>OTelCol: Trace: job.submitted
    API->>FluentBit: Log: Job created
    
    Machine->>Redis: Poll for Jobs
    Redis-->>Machine: Job Assignment
    
    Machine->>Worker: Assign Job
    Worker->>Service: Execute Task
    
    %% Telemetry from Worker
    Worker->>OTelCol: Trace: job.executing
    Worker->>FluentBit: Log: Processing started
    
    Service-->>Worker: Task Result
    Worker->>Redis: Update Progress
    Worker->>Redis: Complete Job
    
    %% Telemetry flow
    FluentBit->>Fluentd: Forward logs
    OTelCol->>Dash0: Send traces/metrics
    Fluentd->>Dash0: Send processed logs
    
    Redis-->>API: Job Complete Event
    API-->>Client: WebSocket Notification
```

</FullscreenDiagram>

## Data Pipeline Architecture

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

## Trace Context Flow

<FullscreenDiagram>

```mermaid
graph TD
    CLIENT["Client Request<br/>trace_id: abc123"] 
    API["API Server<br/>trace_id: abc123<br/>span_id: def456"]
    REDIS["Redis Operation<br/>trace_id: abc123<br/>span_id: ghi789"]
    MACHINE["Machine<br/>trace_id: abc123<br/>span_id: jkl012"]
    WORKER["Worker<br/>trace_id: abc123<br/>span_id: mno345"]
    SERVICE["Service<br/>trace_id: abc123<br/>span_id: pqr678"]
    
    subgraph "Machine Telemetry Components"
        FLUENT_BIT["Fluent Bit<br/>Collects logs with trace_id"]
        OTEL_COLLECTOR["OTel Collector<br/>Collects traces/metrics"]
    end
    
    subgraph "Central Processing"
        FLUENTD["Fluentd<br/>Processes logs"]
        DASH0["Dash0<br/>Correlates all telemetry"]
    end
    
    CLIENT --> API
    API --> REDIS
    REDIS --> MACHINE
    MACHINE --> WORKER
    WORKER --> SERVICE
    
    %% Telemetry flows with context propagation
    MACHINE --> FLUENT_BIT
    WORKER --> FLUENT_BIT
    SERVICE --> FLUENT_BIT
    
    MACHINE --> OTEL_COLLECTOR
    WORKER --> OTEL_COLLECTOR
    SERVICE --> OTEL_COLLECTOR
    
    FLUENT_BIT -->|Forward Protocol| FLUENTD
    OTEL_COLLECTOR -->|OTLP/gRPC| DASH0
    FLUENTD -->|HTTP| DASH0
```

</FullscreenDiagram>

## Key Concepts

### Primary Correlation IDs

- **trace_id**: Links all operations for a single request (32-character hex)
- **job_id**: Links all operations for a job (`job-{uuid}`)  
- **machine_id**: Identifies originating machine (`{type}-{identifier}`)
- **worker_id**: Identifies specific worker (`{machine_id}-worker-{index}`)

### Context Propagation

Every telemetry event includes automatic correlation through:
- HTTP headers (`traceparent`, `tracestate`) 
- Redis context (stored with jobs)
- Environment context (machine_id, environment, region)

## Implementation Priority

1. **Foundation** - Define correlation ID standards, context propagation
2. **Critical Path** - Instrument job submission flow, error paths, health monitoring  
3. **Full Coverage** - Instrument all services, add performance metrics, buffering
4. **Intelligence** - Add correlation queries, dashboards, alerts

## Complete Documentation

For detailed service information flows, telemetry specifications, and implementation details, see:
**[/docs/OBSERVABILITY_INFORMATION_FLOW.md](../../../../docs/OBSERVABILITY_INFORMATION_FLOW.md)**