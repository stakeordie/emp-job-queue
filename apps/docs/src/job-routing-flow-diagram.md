# Job Routing Flow - Visual Diagrams

## Complete Job Routing Architecture

<FullscreenDiagram>

```mermaid
graph TD
    %% Job Submission Layer
    A[Job Submitted] --> A1["job.service_required = 'simulation'"]
    A1 --> B[Added to Redis jobs:pending queue]
    
    %% Worker Initialization Layer  
    C[Worker Starts] --> C1["WORKERS env = 'simulation:5'"]
    C1 --> C2[Read service-mapping.json]
    C2 --> C3["workers.simulation.services = ['simulationx']"]
    C3 --> C4["Worker Capabilities: services = ['simulationx']"]
    
    %% Redis Matching Layer
    B --> D[Redis Function: findMatchingJob]
    C4 --> D
    D --> D1{"Match worker.services vs job.service_required"}
    D1 --> D2["'simulationx' === 'simulation' ?"]
    D2 -->|FALSE| E1[❌ No Match - Job Stays Pending]
    D2 -->|TRUE| E2[✅ Job Assigned to Worker]
    
    %% Connector Resolution Layer
    E2 --> F[Worker receives job]
    F --> F1["getConnectorByService('simulation')"]
    F1 --> F2[Search services.*.job_types_accepted]
    F2 --> F3["services.simulationx.job_types_accepted = ['simulation']"]
    F3 --> F4{"'simulation' in job_types_accepted?"}
    F4 -->|TRUE| G1[✅ Found service: simulationx]
    F4 -->|FALSE| G2[❌ No connector found]
    G1 --> H[Load SimulationHttpConnector]
    H --> I[Process Job]
    
    %% Styling
    classDef problem fill:#ffcccc,stroke:#ff0000,stroke-width:2px
    classDef success fill:#ccffcc,stroke:#00aa00,stroke-width:2px
    classDef process fill:#cce5ff,stroke:#0066cc,stroke-width:2px
    
    class D2,E1,G2 problem
    class E2,G1,I success
    class A1,C1,C2,C3,C4,F1,F2,F3,H process
```

</FullscreenDiagram>

## Current Problem: Service Name Mismatch

<FullscreenDiagram>

```mermaid
graph LR
    subgraph "Service Mapping Configuration"
        A1["workers.simulation.services = ['simulationx']"] 
        A2["services.simulationx.job_types_accepted = ['simulation']"]
    end
    
    subgraph "Runtime Mismatch"
        B1["Worker advertises: 'simulationx'"]
        B2["Job requires: 'simulation'"] 
        B3["Redis Function: 'simulationx' !== 'simulation'"]
    end
    
    subgraph "Result"
        C1[❌ Jobs stay pending]
        C2[❌ Workers stay idle]
    end
    
    A1 --> B1
    B2 --> B3
    B1 --> B3
    B3 --> C1
    B3 --> C2
    
    classDef config fill:#e1f5fe
    classDef runtime fill:#fff3e0  
    classDef result fill:#ffebee
    
    class A1,A2 config
    class B1,B2,B3 runtime
    class C1,C2 result
```

</FullscreenDiagram>

## Two Architectural Approaches

### Approach A: Service-Name Matching (Current)

<FullscreenDiagram>

```mermaid
graph TD
    A[Job: service_required = 'simulation'] --> B["Worker: services = ['simulation']"]
    B --> C[Redis: Direct string match]
    C --> D[✅ Match: 'simulation' === 'simulation']
    D --> E[Worker gets job]
    E --> F["getConnectorByService('simulation')"]
    F --> G[Find service accepting 'simulation' job type]
    G --> H["✅ Success"]
    
    classDef fix fill:#c8e6c9,stroke:#4caf50,stroke-width:2px
    class D,H fix
```

</FullscreenDiagram>

### Approach B: Job-Type Matching (Better Long-term)

<FullscreenDiagram>

```mermaid
graph TD
    A[Job: service_required = 'simulation'] --> B["Worker: job_types_accepted = ['simulation', 'sim']"]
    B --> C[Redis: Check job type support]
    C --> D[✅ Match: 'simulation' in job_types_accepted]
    D --> E[Worker gets job]
    E --> F["getConnectorByService('simulation')"]
    F --> G[Worker already knows which service handles this job type]
    G --> H[✅ Success - More flexible]
    
    classDef better fill:#bbdefb,stroke:#2196f3,stroke-width:2px
    class D,H better
```

</FullscreenDiagram>

## Environment Variable Flow

<FullscreenDiagram>

```mermaid
graph TD
    A["WORKERS='simulation:5'"] --> B[Extract worker type: 'simulation']
    B --> C[service-mapping.json]
    C --> D["workers.simulation.services"]
    D --> E["['simulationx']"]
    E --> F["Worker Capabilities: { services: ['simulationx'] }"]
    F --> G[Send to Redis Function]
    
    H["Job: { service_required: 'simulation' }"] --> G
    G --> I["Redis Function compares:"]
    I --> J["'simulationx' vs 'simulation'"]
    J --> K["❌ MISMATCH"]
    
    classDef env fill:#f3e5f5
    classDef mapping fill:#e8f5e8  
    classDef comparison fill:#fff3e0
    classDef failure fill:#ffebee
    
    class A,B env
    class C,D,E,F mapping
    class G,H,I,J comparison
    class K failure
```

</FullscreenDiagram>

## Code Locations Map

<FullscreenDiagram>

```mermaid
graph TD
    subgraph "Configuration Files"
        A1[service-mapping.json<br/>workers.*.services<br/>services.*.job_types_accepted]
    end
    
    subgraph "Worker Initialization"  
        B1["redis-direct-base-worker.ts<br/>getServicesFromMapping()"]
        B2["buildCapabilities()"]
    end
    
    subgraph "Redis Matching"
        C1["findMatchingJob.lua<br/>matches_requirements()"]
    end
    
    subgraph "Connector Resolution"
        D1["connector-manager.ts<br/>getConnectorByService()"]
    end
    
    A1 --> B1
    B1 --> B2  
    B2 --> C1
    C1 --> D1
    
    classDef config fill:#e3f2fd
    classDef worker fill:#f1f8e9
    classDef redis fill:#fff8e1  
    classDef connector fill:#fce4ec
    
    class A1 config
    class B1,B2 worker
    class C1 redis
    class D1 connector
```

</FullscreenDiagram>

## Quick Fix Implementation

To make the current system work immediately:

### Before (Broken)
```json
{
  "workers": {
    "simulation": {
      "services": ["simulationx"]  // ❌ Different from job service_required
    }
  },
  "services": {
    "simulationx": {
      "job_types_accepted": ["simulation"]
    }
  }
}
```

### After (Working)
```json
{
  "workers": {
    "simulation": {
      "services": ["simulation"]  // ✅ Matches job service_required
    }
  },
  "services": {
    "simulation": {              // ✅ Rename service to match
      "job_types_accepted": ["simulation"]
    }
  }
}
```

## Debug Commands

```bash
# Check what services worker advertises
docker exec container pm2 logs worker | grep "Derived services"

# Check Redis function matching
REDIS_URL="redis://localhost:6379" node -e "
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);
console.log('Worker caps vs Job requirement matching...');
redis.quit();
"

# Check service-mapping configuration
docker exec container cat /workspace/src/config/service-mapping.json | jq '.workers.simulation'
```