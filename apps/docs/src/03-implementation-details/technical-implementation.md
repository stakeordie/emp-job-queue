# Technical Implementation Guide

This guide provides detailed technical diagrams and implementation details for the unified machine architecture.

## Service Startup Sequence

<fullscreen>
```mermaid
sequenceDiagram
    participant Docker as Docker Container
    participant Base as Base Machine
    participant PM2 as PM2 Manager
    participant Redis as Redis Queue
    participant Services as Services
    participant Health as Health Server
    
    Note over Docker,Health: Machine Startup Sequence
    
    Docker->>Base: Container starts
    Base->>Base: Load configuration<br/>Detect machine type
    
    Base->>PM2: Check for existing processes
    PM2->>PM2: Cleanup existing PM2 processes
    
    Base->>Base: Generate PM2 ecosystem config<br/>Based on machine type
    
    Base->>Redis: Initialize status aggregator
    Redis->>Redis: Register machine in queue
    
    Base->>PM2: Start shared-setup service
    PM2->>Services: shared-setup: Initialize directories
    Services->>PM2: shared-setup: Complete
    
    alt GPU Machine
        Base->>PM2: Start ComfyUI services
        PM2->>Services: comfyui-gpu0, comfyui-gpu1...
    else API Machine
        Base->>PM2: Start API connector services  
        PM2->>Services: openai-connector, replicate-connector...
    end
    
    Base->>PM2: Start Redis worker services
    PM2->>Services: redis-worker-gpu0/api0...
    
    Services->>Redis: Workers connect to queue
    Redis->>Redis: Update machine capabilities
    
    Base->>Health: Start health server (port 9090)
    Health->>Health: Expose health endpoints
    
    Base->>Redis: Send startup_complete event
    Redis->>Redis: Broadcast machine online
    
    Note over Docker,Health: Machine ready for jobs
```
</fullscreen>

## Redis Job Matching Algorithm

<fullscreen>
```mermaid
flowchart TD
    START[Worker requests job] --> CHECK_QUEUE{Jobs in queue?}
    
    CHECK_QUEUE -->|No| WAIT[Wait and retry]
    CHECK_QUEUE -->|Yes| GET_CAPS[Get worker capabilities<br/>• machine_type: gpu/api<br/>• connectors: [comfyui, openai...]<br/>• gpu_count, memory, etc.]
    
    GET_CAPS --> SCAN_JOBS[Scan job queue for matches]
    
    SCAN_JOBS --> MATCH_CHECK{Job requirements match<br/>worker capabilities?}
    
    MATCH_CHECK -->|No| NEXT_JOB[Check next job]
    MATCH_CHECK -->|Yes| CLAIM_ATOMIC[Atomic job claim<br/>Redis SCRIPT execution]
    
    CLAIM_ATOMIC --> CLAIMED{Successfully claimed?}
    
    CLAIMED -->|No| NEXT_JOB
    CLAIMED -->|Yes| ASSIGN[Assign job to worker<br/>Update job status: processing]
    
    ASSIGN --> PROCESS[Worker processes job]
    
    PROCESS --> COMPLETE[Job completion<br/>Update status: completed]
    
    NEXT_JOB --> SCAN_JOBS
    WAIT --> CHECK_QUEUE
    COMPLETE --> START
    
    style START fill:#e8f5e8
    style CHECK_QUEUE fill:#fff3e0
    style MATCH_CHECK fill:#e1f5fe
    style CLAIM_ATOMIC fill:#ffebee
    style CLAIMED fill:#f3e5f5
    style COMPLETE fill:#c8e6c9
```
</fullscreen>

## Docker Layer Caching Strategy

<fullscreen>
```mermaid
graph TB
    subgraph "Cache Optimization Flow"
        
        subgraph "Layer 1: System (Cache: Months)"
            L1A[Ubuntu 18.04 Base<br/>~200MB]
            L1B[Node.js 18 Runtime<br/>~150MB]  
            L1C[System Packages<br/>apt-get install<br/>~300MB]
        end
        
        subgraph "Layer 2: Dependencies (Cache: Weeks)"
            L2A[PM2 Global Install<br/>~50MB]
            L2B[Node.js Base Packages<br/>package.json dependencies<br/>~200MB]
            L2C[Python Base Libraries<br/>pip install basics<br/>~150MB]
        end
        
        subgraph "Layer 3: Application (Cache: Days)"
            L3A[Base Machine Code<br/>src/ directory<br/>~10MB]
            L3B[Service Manager<br/>PM2 ecosystem logic<br/>~5MB]
            L3C[Health Monitoring<br/>HTTP endpoints<br/>~5MB]
        end
        
        subgraph "Layer 4A: GPU Extensions (Cache: Hours)"
            L4A1[CUDA Toolkit<br/>~2GB]
            L4A2[PyTorch + GPU<br/>~1.5GB]
            L4A3[ComfyUI Clone<br/>~100MB]
            L4A4[Custom Nodes Install<br/>~500MB]
        end
        
        subgraph "Layer 4B: API Extensions (Cache: Hours)"
            L4B1[API Client Libraries<br/>openai, replicate<br/>~50MB]
            L4B2[HTTP Utilities<br/>axios, fetch<br/>~20MB]
            L4B3[API Connectors<br/>Custom code<br/>~10MB]
        end
        
        subgraph "Layer 5: Config (Cache: None)"
            L5A[Environment Variables<br/>Runtime configuration]
            L5B[Service Configuration<br/>PM2 ecosystem.config.js]
            L5C[API Keys & Secrets<br/>Runtime injection]
        end
    end
    
    L1A --> L1B --> L1C
    L1C --> L2A --> L2B --> L2C
    L2C --> L3A --> L3B --> L3C
    
    L3C --> L4A1 --> L4A2 --> L4A3 --> L4A4
    L3C --> L4B1 --> L4B2 --> L4B3
    
    L4A4 --> L5A
    L4B3 --> L5B
    L5A --> L5C
    L5B --> L5C
    
    style L1A fill:#ffebee
    style L1B fill:#ffebee  
    style L1C fill:#ffebee
    style L2A fill:#f3e5f5
    style L2B fill:#f3e5f5
    style L2C fill:#f3e5f5
    style L3A fill:#e8f5e8
    style L3B fill:#e8f5e8
    style L3C fill:#e8f5e8
    style L4A1 fill:#e1f5fe
    style L4A2 fill:#e1f5fe
    style L4A3 fill:#e1f5fe
    style L4A4 fill:#e1f5fe
    style L4B1 fill:#fff3e0
    style L4B2 fill:#fff3e0
    style L4B3 fill:#fff3e0
    style L5A fill:#f5f5f5
    style L5B fill:#f5f5f5
    style L5C fill:#f5f5f5
```
</fullscreen>

## Service Communication Patterns

<fullscreen>
```mermaid
graph TB
    subgraph "GPU Machine Communication"
        GPU_WORKER[Redis Worker GPU0<br/>Port: Internal] 
        GPU_COMFY[ComfyUI Service<br/>Port: 8188]
        GPU_HEALTH[Health Server<br/>Port: 9090]
        
        GPU_WORKER -.->|HTTP| GPU_COMFY
        GPU_WORKER -->|Redis| REDIS_QUEUE
        GPU_HEALTH -->|PM2 API| GPU_WORKER
        GPU_HEALTH -->|PM2 API| GPU_COMFY
    end
    
    subgraph "API Machine Communication"
        API_WORKER[Redis Worker API0<br/>Port: Internal]
        API_OPENAI[OpenAI Connector<br/>Port: Internal]
        API_HEALTH[Health Server<br/>Port: 9090]
        
        API_WORKER -.->|Direct Call| API_OPENAI
        API_WORKER -->|Redis| REDIS_QUEUE
        API_HEALTH -->|PM2 API| API_WORKER
        API_HEALTH -->|PM2 API| API_OPENAI
    end
    
    subgraph "External Systems"
        REDIS_QUEUE[(Redis Queue<br/>Job Management)]
        OPENAI_API[OpenAI API<br/>External Service]
        MONITOR_UI[Monitor UI<br/>WebSocket Client]
    end
    
    API_OPENAI -.->|HTTPS| OPENAI_API
    REDIS_QUEUE -.->|Pub/Sub| MONITOR_UI
    
    style GPU_WORKER fill:#e1f5fe
    style GPU_COMFY fill:#e1f5fe
    style GPU_HEALTH fill:#e1f5fe
    style API_WORKER fill:#f3e5f5
    style API_OPENAI fill:#f3e5f5
    style API_HEALTH fill:#f3e5f5
    style REDIS_QUEUE fill:#fff3e0
    style OPENAI_API fill:#ffebee
    style MONITOR_UI fill:#e8f5e8
```
</fullscreen>

## Error Handling & Recovery

<fullscreen>
```mermaid
stateDiagram-v2
    [*] --> Healthy: Service starts
    
    Healthy --> ServiceFailure: Service crashes
    Healthy --> ConnectionLoss: Redis disconnection
    Healthy --> ResourceExhausted: Memory/CPU limits
    
    ServiceFailure --> Restarting: PM2 auto-restart
    ConnectionLoss --> Reconnecting: Retry connection
    ResourceExhausted --> ResourceRecovery: Free resources
    
    Restarting --> Healthy: Restart successful
    Restarting --> Failed: Max restarts exceeded
    
    Reconnecting --> Healthy: Connection restored
    Reconnecting --> Failed: Connection timeout
    
    ResourceRecovery --> Healthy: Resources freed
    ResourceRecovery --> Failed: Resource leak
    
    Failed --> [*]: Machine shutdown
    
    note right of Healthy
        Normal operation:
        • Processing jobs
        • Health checks pass
        • Redis connected
    end note
    
    note right of Failed
        Terminal states:
        • Send shutdown event
        • Return jobs to queue
        • Container exit
    end note
```
</fullscreen>

## Performance Monitoring

<fullscreen>
```mermaid
graph TD
    subgraph "Metrics Collection"
        PM2_METRICS[PM2 Process Metrics<br/>• CPU usage<br/>• Memory usage<br/>• Restart count<br/>• Uptime]
        
        SYSTEM_METRICS[System Metrics<br/>• GPU utilization<br/>• Disk I/O<br/>• Network traffic<br/>• Temperature]
        
        APP_METRICS[Application Metrics<br/>• Job completion time<br/>• Queue wait time<br/>• Error rates<br/>• Throughput]
    end
    
    subgraph "Health Endpoints"
        HEALTH_CHECK[/health<br/>Overall status<br/>Boolean healthy]
        
        STATUS_DETAIL[/status<br/>Detailed metrics<br/>JSON response]
        
        METRICS_EXPORT[/metrics<br/>Prometheus format<br/>Time series data]
    end
    
    subgraph "Monitoring Integration"
        REDIS_PUB[Redis Pub/Sub<br/>Real-time updates<br/>15-second intervals]
        
        WEBSOCKET_UI[WebSocket Monitor<br/>Live dashboard<br/>Machine cards]
        
        PROMETHEUS[Prometheus<br/>Metrics scraping<br/>Alerting rules]
    end
    
    PM2_METRICS --> STATUS_DETAIL
    SYSTEM_METRICS --> STATUS_DETAIL
    APP_METRICS --> STATUS_DETAIL
    
    STATUS_DETAIL --> REDIS_PUB
    HEALTH_CHECK --> REDIS_PUB
    METRICS_EXPORT --> PROMETHEUS
    
    REDIS_PUB --> WEBSOCKET_UI
    PROMETHEUS --> WEBSOCKET_UI
    
    style PM2_METRICS fill:#e1f5fe
    style SYSTEM_METRICS fill:#f3e5f5
    style APP_METRICS fill:#e8f5e8
    style HEALTH_CHECK fill:#c8e6c9
    style STATUS_DETAIL fill:#fff3e0
    style REDIS_PUB fill:#ffebee
    style WEBSOCKET_UI fill:#f9fbe7
```
</fullscreen>

## Configuration Management

<fullscreen>
```mermaid
flowchart LR
    subgraph "Configuration Sources (Priority Order)"
        ENV_VARS[Environment Variables<br/>Highest Priority<br/>Runtime overrides]
        
        CONFIG_FILES[Configuration Files<br/>Machine-specific<br/>JSON/YAML configs]
        
        DEFAULTS[Default Values<br/>Lowest Priority<br/>Hardcoded fallbacks]
    end
    
    subgraph "Configuration Processing"
        LOADER[Configuration Loader<br/>Hierarchical merge<br/>Validation & typing]
        
        SCHEMA[Configuration Schema<br/>Type definitions<br/>Required fields]
        
        COMPUTED[Computed Configuration<br/>Final merged config<br/>Environment variables]
    end
    
    subgraph "Configuration Usage"
        PM2_GEN[PM2 Ecosystem Generator<br/>Service definitions<br/>Environment per service]
        
        SERVICE_CONFIG[Service Configuration<br/>Runtime parameters<br/>Connection strings]
        
        HEALTH_CONFIG[Health Configuration<br/>Check intervals<br/>Timeout values]
    end
    
    ENV_VARS --> LOADER
    CONFIG_FILES --> LOADER
    DEFAULTS --> LOADER
    
    LOADER --> SCHEMA
    SCHEMA --> COMPUTED
    
    COMPUTED --> PM2_GEN
    COMPUTED --> SERVICE_CONFIG
    COMPUTED --> HEALTH_CONFIG
    
    style ENV_VARS fill:#ffebee
    style CONFIG_FILES fill:#f3e5f5
    style DEFAULTS fill:#e8f5e8
    style LOADER fill:#e1f5fe
    style SCHEMA fill:#fff3e0
    style COMPUTED fill:#c8e6c9
    style PM2_GEN fill:#f9fbe7
```
</fullscreen>

## Deployment Pipeline

<fullscreen>
```mermaid
graph TB
    subgraph "Development Phase"
        CODE[Code Changes<br/>Feature development<br/>Bug fixes]
        
        BUILD_LOCAL[Local Build<br/>./build-machines.sh<br/>Test locally]
        
        UNIT_TESTS[Unit Tests<br/>Service logic<br/>Configuration validation]
    end
    
    subgraph "CI/CD Pipeline"
        TRIGGER[Git Push<br/>Trigger CI/CD<br/>GitHub Actions]
        
        BUILD_CI[CI Build<br/>Multi-arch images<br/>Layer optimization]
        
        INTEGRATION_TESTS[Integration Tests<br/>Redis connectivity<br/>Health checks]
        
        SECURITY_SCAN[Security Scanning<br/>Vulnerability assessment<br/>Dependency audit]
    end
    
    subgraph "Staging Deployment"
        PUSH_REGISTRY[Push to Registry<br/>Docker Hub/ECR<br/>Tagged images]
        
        DEPLOY_STAGE[Deploy Staging<br/>Test environment<br/>Full functionality]
        
        E2E_TESTS[End-to-End Tests<br/>Job processing<br/>Monitor integration]
    end
    
    subgraph "Production Deployment"
        DEPLOY_PROD[Production Deploy<br/>Rolling update<br/>Zero downtime]
        
        HEALTH_CHECKS[Health Validation<br/>All services online<br/>Queue connectivity]
        
        MONITORING[Production Monitoring<br/>Metrics collection<br/>Alert validation]
    end
    
    CODE --> BUILD_LOCAL --> UNIT_TESTS
    UNIT_TESTS --> TRIGGER --> BUILD_CI
    BUILD_CI --> INTEGRATION_TESTS --> SECURITY_SCAN
    SECURITY_SCAN --> PUSH_REGISTRY --> DEPLOY_STAGE
    DEPLOY_STAGE --> E2E_TESTS --> DEPLOY_PROD
    DEPLOY_PROD --> HEALTH_CHECKS --> MONITORING
    
    style CODE fill:#e8f5e8
    style BUILD_LOCAL fill:#f9fbe7
    style TRIGGER fill:#fff3e0
    style BUILD_CI fill:#e1f5fe
    style PUSH_REGISTRY fill:#f3e5f5
    style DEPLOY_STAGE fill:#ffebee
    style DEPLOY_PROD fill:#c8e6c9
    style MONITORING fill:#e0f2f1
```
</fullscreen>

## Resource Allocation Strategy

<fullscreen>
```mermaid
graph TB
    subgraph "Resource Pools"
        FAST_POOL[Fast Lane Pool<br/>API Machines<br/>• 2 CPU, 4GB RAM<br/>• No GPU required<br/>• High concurrency]
        
        STANDARD_POOL[Standard Pool<br/>GPU Machines<br/>• 8 CPU, 32GB RAM<br/>• RTX 4090 (24GB)<br/>• ComfyUI optimized]
        
        HEAVY_POOL[Heavy Pool<br/>High-End Machines<br/>• 16 CPU, 64GB RAM<br/>• Multi-GPU setup<br/>• Video processing]
    end
    
    subgraph "Job Classification"
        CLASSIFY[Job Classifier<br/>Analyze requirements<br/>Route to appropriate pool]
        
        QUICK_JOBS[Quick Jobs<br/>• Text generation<br/>• Simple image ops<br/>• API calls<br/>→ Fast Lane]
        
        STANDARD_JOBS[Standard Jobs<br/>• Image generation<br/>• ComfyUI workflows<br/>• Model inference<br/>→ Standard Pool]
        
        HEAVY_JOBS[Heavy Jobs<br/>• Video generation<br/>• Large model training<br/>• Batch processing<br/>→ Heavy Pool]
    end
    
    subgraph "Auto-Scaling"
        METRICS[Resource Metrics<br/>• Queue depth<br/>• Processing time<br/>• Success rates]
        
        SCALER[Auto Scaler<br/>• Scale up on demand<br/>• Scale down on idle<br/>• Cost optimization]
        
        ALERTS[Scaling Alerts<br/>• Resource exhaustion<br/>• Performance degradation<br/>• Cost thresholds]
    end
    
    CLASSIFY --> QUICK_JOBS --> FAST_POOL
    CLASSIFY --> STANDARD_JOBS --> STANDARD_POOL
    CLASSIFY --> HEAVY_JOBS --> HEAVY_POOL
    
    FAST_POOL --> METRICS
    STANDARD_POOL --> METRICS
    HEAVY_POOL --> METRICS
    
    METRICS --> SCALER --> ALERTS
    
    style FAST_POOL fill:#f3e5f5
    style STANDARD_POOL fill:#e1f5fe
    style HEAVY_POOL fill:#ffebee
    style CLASSIFY fill:#fff3e0
    style SCALER fill:#e8f5e8
```
</fullscreen>

## Implementation Checklist

### ✅ Completed Components

- **Base Machine Foundation**: Core PM2 service management, Redis integration
- **Docker Layer Strategy**: Optimized caching with 90% hit rate
- **GPU Machine Extension**: ComfyUI + CUDA support maintaining 100% compatibility
- **API Machine Extension**: OpenAI, Replicate, RunPod connectors
- **Health Monitoring**: Comprehensive HTTP endpoints and diagnostics
- **Configuration System**: Hierarchical environment-based configuration
- **Build Automation**: `./build-machines.sh` with cache optimization

### 🔄 Next Implementation Steps

1. **Integration Testing**: Test with existing Redis infrastructure
2. **Performance Validation**: Benchmark against current system
3. **Security Hardening**: Container security, secret management
4. **Monitoring Integration**: Prometheus metrics, alerting rules
5. **Documentation**: API documentation, troubleshooting guides

### 🎯 Success Metrics

- **Build Time**: < 5 minutes for full stack (vs 15 minutes current)
- **Cache Hit Rate**: > 90% for incremental builds
- **Resource Efficiency**: 60% reduction in storage requirements
- **Development Speed**: 50% faster iteration cycles
- **Operational Consistency**: 100% unified health checking