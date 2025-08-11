# Worker Service Mapping Architecture - Complete System Flow

## Core Concept: Two-Layer Architecture

**Layer 1: Worker Types** - Define what jobs they can accept
**Layer 2: Services** - Define how to actually process those jobs

<FullscreenDiagram>

```mermaid
graph TD
    subgraph "service-mapping.json Structure"
        A["workers: {<br/>  'simulation-websocket': { ... },<br/>  'openai': { ... }<br/>}"]
        B["services: {<br/>  'simulation-websocket': { connector, ports, ... },<br/>  'openai-text': { connector, ... }<br/>}"]
    end
    
    A --> |"Worker defines"| C[job_service_required_map]
    B --> |"Service defines"| D[connector, build_stage, ports]
    
    C --> E[Redis job matching]
    D --> F[PM2 process creation]
    D --> G[Service execution]
```

</FullscreenDiagram>

## ID Generation Flow

<FullscreenDiagram>

```mermaid
graph TD
    subgraph "Machine Level"
        A[MACHINE_ID env<br/>'salad-machine-123']
        B[WORKERS env<br/>'simulation-websocket:1,openai:1']
    end
    
    subgraph "PM2 Ecosystem Generator"
        C[Parse WORKERS]
        D[For each worker type + index]
        E["Generate WORKER_ID<br/>'${MACHINE_ID}-worker-${workerType}-${index}'"]
        F["Generate PM2 app name<br/>'redis-worker-${workerType}-${index}'"]
    end
    
    subgraph "Generated IDs"
        G[WORKER_ID: 'salad-machine-123-worker-simulation-websocket-0']
        H[PM2 name: 'redis-worker-simulation-websocket-0']
        I[CONNECTORS: 'simulation-websocket']
    end
    
    A --> E
    B --> C
    C --> D
    D --> E
    D --> F
    E --> G
    F --> H
    D --> I
```

</FullscreenDiagram>

## Worker Definition vs Service Definition

<FullscreenDiagram>

```mermaid
graph TD
    subgraph "Worker Definition (workers.simulation-websocket)"
        A[Worker Key: 'simulation-websocket']
        B["services: ['simulation-websocket']"]
        C["job_service_required_map: [<br/>  { job_service_required: 'simulation',<br/>    worker_service: 'simulation-websocket' }<br/>]"]
    end
    
    subgraph "Service Definition (services.simulation-websocket)"
        D[Service Key: 'simulation-websocket']
        E["connector: 'SimulationWebsocketConnector'"]
        F["type: 'internal'"]
        G["ports: ['8399']"]
        H["build_stage: 'simulation'"]
    end
    
    subgraph "Redis Layer (Job Matching)"
        I["Worker reports: services = ['simulation']"]
        J[Job has: service_required = 'simulation']
        K[Match! Job claimed]
    end
    
    subgraph "PM2 Layer (Process Management)"
        L[PM2 app: 'redis-worker-simulation-websocket-0']
        M[Ports: 8399]
        N[Build stage: simulation]
    end
    
    A --> B
    B --> C
    C --> I
    D --> E
    E --> F
    F --> G
    G --> H
    H --> N
    E --> L
    G --> M
    I --> J
    J --> K
```

</FullscreenDiagram>

## Complete Job Processing Flow

<FullscreenDiagram>

```mermaid
sequenceDiagram
    participant Job as Job Submission
    participant Redis as Redis Store
    participant Worker as Worker Process
    participant Service as Service Layer
    participant Connector as Connector
    
    Note over Job: Job created with service_required: 'simulation'
    Job->>Redis: Store job
    
    Note over Worker: Worker startup
    Worker->>Worker: Read CONNECTORS='simulation-websocket'
    Worker->>Worker: Lookup workers.simulation-websocket
    Worker->>Worker: Extract job_service_required: ['simulation']
    Worker->>Redis: Register services: ['simulation']
    
    Note over Redis: Job matching
    Redis->>Redis: findMatchingJob()
    Redis->>Redis: worker.services.includes('simulation') ✓
    Redis->>Worker: Job claimed
    
    Note over Worker: Service routing
    Worker->>Worker: job.service_required = 'simulation'
    Worker->>Worker: Map 'simulation' → 'simulation-websocket'
    Worker->>Service: Route to service 'simulation-websocket'
    Service->>Connector: Use SimulationWebsocketConnector
    Connector->>Connector: Process job
```

</FullscreenDiagram>

## Service Mapping Examples

### simulation-websocket Worker

```json
// Worker definition
"simulation-websocket": {
  "services": ["simulation-websocket"],           // Internal service names  
  "job_service_required_map": [
    {
      "job_service_required": "simulation",       // What Redis matching uses
      "worker_service": "simulation-websocket"    // Maps back to service
    }
  ]
}

// Service definition  
"simulation-websocket": {
  "connector": "SimulationWebsocketConnector",
  "type": "internal",
  "ports": ["8399"],
  "build_stage": "simulation"
}
```

**Flow:**
1. **Redis matching**: Job `service_required: "simulation"` matches worker `services: ["simulation"]`
2. **Service routing**: Worker maps `"simulation"` → `"simulation-websocket"` service
3. **PM2 execution**: Service uses `SimulationWebsocketConnector` on port 8399

### openai Worker

```json
// Worker definition
"openai": {
  "services": ["openai-text", "openai-image", "openai-img2img"],
  "job_service_required_map": [
    { "job_service_required": "openai_text", "worker_service": "openai-text" },
    { "job_service_required": "openai_image", "worker_service": "openai-image" },
    { "job_service_required": "openai_img2img", "worker_service": "openai-img2img" }
  ]
}

// Service definitions
"openai-text": { "connector": "OpenAITextConnector", "type": "external" }
"openai-image": { "connector": "OpenAIImageConnector", "type": "external" }
"openai-img2img": { "connector": "OpenAIImg2ImgConnector", "type": "external" }
```

**Flow:**
1. **Redis matching**: Job `service_required: "openai_text"` matches worker `services: ["openai_text", "openai_image", "openai_img2img"]`
2. **Service routing**: Worker maps `"openai_text"` → `"openai-text"` service  
3. **PM2 execution**: Service uses `OpenAITextConnector` (external API)

## Status Monitoring & IDs

<FullscreenDiagram>

```mermaid
graph TD
    subgraph "Monitor Display"
        A[Machine: salad-machine-123]
        B[Worker: redis-worker-simulation-websocket-0]
        C[Status: busy]
        D[Job: job-456]
        E["Services: ['simulation']"]
    end
    
    subgraph "PM2 Process"
        F[PM2 name: redis-worker-simulation-websocket-0]
        G[PID: 1234]
        H[Port: 8399]
        I[Log: /workspace/logs/redis-worker-simulation-websocket-0.log]
    end
    
    subgraph "Redis Data"
        J[Worker ID: salad-machine-123-worker-simulation-websocket-0]
        K["Services: ['simulation']"]
        L[Status: busy]
        M[Current job: job-456]
    end
    
    A --> B
    B --> C
    C --> D
    D --> E
    
    F --> G
    G --> H
    H --> I
    
    J --> K
    K --> L
    L --> M
    
    B -.-> F
    E -.-> K
    C -.-> L
    D -.-> M
```

</FullscreenDiagram>

## Environment Variables by Layer

| Variable | Set By | Used By | Purpose | Example |
|----------|---------|---------|---------|---------|
| `MACHINE_ID` | Machine config | PM2 generator | Machine identification | `salad-machine-123` |
| `WORKERS` | Machine config | PM2 generator | Worker types for machine | `simulation-websocket:1,openai:1` |
| `WORKER_ID` | PM2 generator | Worker process | Unique worker instance | `salad-machine-123-worker-simulation-websocket-0` |
| `CONNECTORS` | PM2 generator | Worker process | Worker type | `simulation-websocket` |

## Key Architecture Insights

1. **Worker Types vs Services**: Worker types define job acceptance, services define job execution
2. **Two-Phase Mapping**: 
   - Phase 1: `job.service_required` → `worker.services` (Redis matching)
   - Phase 2: `job.service_required` → `worker_service` → connector (internal routing)
3. **ID Hierarchy**: `MACHINE_ID` → `WORKER_ID` → PM2 app name
4. **Service Independence**: Services can be reused by multiple worker types
5. **Monitor Complexity**: Shows Redis IDs for job tracking, PM2 names for process management