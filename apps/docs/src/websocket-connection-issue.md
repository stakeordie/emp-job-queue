# WebSocket Connection Proliferation Issue

## Overview

A critical issue was identified where the Emprops Open API creates excessive WebSocket connections to the Redis job queue server, causing connection drops and failed job notifications after the first workflow completion.

## The Problem

### Root Cause
Each `GeneratorV2` instance creates a separate `RedisServerClient` connection for **every ComfyUI workflow** in the database, leading to connection proliferation that overwhelms the Redis server.

### Current Scale
- **Production Database**: 21 total workflows, 15 ComfyUI workflows
- **Per Generation Request**: 15 WebSocket connections created
- **6 Generation Request**: 90 WebSocket connections
- **Multiple Users**: Could reach 500+ workflows × 10 components = 5000+ connections

### Impact
1. Redis server connection limits exceeded
2. WebSocket connections forcibly closed after first job
3. Subsequent workflow completions lost (no UI feedback)
4. Poor user experience with "stuck" generations

## Current Architecture (Broken)
<FullscreenDiagram>

```mermaid
sequenceDiagram
    participant U as User
    participant API as Emprops API
    participant G1 as Generator Instance 1
    participant G2 as Generator Instance 2
    participant G6 as Generator Instance 6
    participant R as Redis Server
    
    U->>API: Request 6 workflows
    
    par Create 6 Generator Instances
        API->>G1: New GeneratorV2()
        G1->>G1: registerComfyWorkflows()
        Note over G1: Creates 15 ComfyWorkflowNodes
        loop For each of 15 workflows
            G1->>R: WebSocket Connection (1-15)
        end
        
        API->>G2: New GeneratorV2() 
        G2->>G2: registerComfyWorkflows()
        Note over G2: Creates 15 ComfyWorkflowNodes
        loop For each of 15 workflows
            G2->>R: WebSocket Connection (16-30)
        end
        
        API->>G6: New GeneratorV2()
        G6->>G6: registerComfyWorkflows()
        Note over G6: Creates 15 ComfyWorkflowNodes
        loop For each of 15 workflows
            G6->>R: WebSocket Connection (76-90)
        end
    end
    
    Note over R: 90 WebSocket Connections!
    R-->>R: Connection limit exceeded
    R->>G1: Connection closed
    R->>G2: Connection closed
    R->>G6: Connection closed
    
    G1-->>API: Job complete (no websocket)
    G2-->>API: Job complete (no websocket) 
    G6-->>API: Job complete (no websocket)
    
    API-->>U: Only first job notified ❌
```

</FullscreenDiagram>

## Connection Creation Flow
<FullscreenDiagram>

```mermaid
graph TD
    A[User requests 6 workflows] --> B[API creates 6 GeneratorV2 instances]
    B --> C[Each Generator calls registerComfyWorkflows]
    C --> D[Query database: 15 ComfyUI workflows]
    D --> E[Create 15 ComfyWorkflowNode per Generator]
    E --> F[Each Node creates ComfyWorkflowRunner]
    F --> G[Each Runner creates RedisServerClient]
    G --> H[Each Client creates WebSocket connection]
    
    H --> I[6 generators × 15 workflows = 90 WebSocket connections]
    I --> J[Redis server overwhelmed]
    J --> K[Connections dropped]
    K --> L[Lost job notifications]
    
    style I fill:#ff6b6b
    style J fill:#ff6b6b
    style K fill:#ff6b6b
    style L fill:#ff6b6b
```
</FullscreenDiagram>

## Connection Lifecycle Analysis

### Per-Request Connection Pattern
<FullscreenDiagram>

```
Single User Request (6 workflows):
├── GeneratorV2 Instance #1
│   ├── ComfyWorkflowNode "flux-dev" → RedisClient → WebSocket #1
│   ├── ComfyWorkflowNode "sdxl-base" → RedisClient → WebSocket #2
│   ├── ... (13 more) → WebSockets #3-15
├── GeneratorV2 Instance #2
│   ├── ComfyWorkflowNode "flux-dev" → RedisClient → WebSocket #16
│   ├── ComfyWorkflowNode "sdxl-base" → RedisClient → WebSocket #17
│   ├── ... (13 more) → WebSockets #18-30
├── ... (4 more instances) → WebSockets #31-90
```

</FullscreenDiagram>

### System-Wide Connection Pattern
<FullscreenDiagram>

```
Multi-User Scenario:
├── User A: 6 requests = 90 connections
├── User B: 4 requests = 60 connections  
├── User C: 2 requests = 30 connections
├── User D: 8 requests = 120 connections
└── Total: 300 WebSocket connections for 20 workflows
```

</FullscreenDiagram>

## Proposed Solution: Singleton RedisServerClient

### Architecture Change
<FullscreenDiagram>

```mermaid
sequenceDiagram
    participant U as User
    participant API as Emprops API
    participant G1 as Generator Instance 1
    participant G2 as Generator Instance 2
    participant G6 as Generator Instance 6
    participant S as Singleton RedisClient
    participant R as Redis Server
    
    U->>API: Request 6 workflows
    
    Note over S: Single WebSocket Connection Pool
    S->>R: 1 WebSocket Connection
    
    par Create 6 Generator Instances
        API->>G1: New GeneratorV2()
        G1->>S: Get RedisClient instance
        S-->>G1: Shared connection
        
        API->>G2: New GeneratorV2() 
        G2->>S: Get RedisClient instance
        S-->>G2: Shared connection
        
        API->>G6: New GeneratorV2()
        G6->>S: Get RedisClient instance
        S-->>G6: Shared connection
    end
    
    par Execute Jobs
        G1->>S: Submit job
        S->>R: Job request
        G2->>S: Submit job  
        S->>R: Job request
        G6->>S: Submit job
        S->>R: Job request
    end
    
    R->>S: Job 1 complete
    S->>G1: Notify completion
    R->>S: Job 2 complete
    S->>G2: Notify completion
    R->>S: Job 6 complete
    S->>G6: Notify completion
    
    G1-->>API: Job complete ✓
    G2-->>API: Job complete ✓
    G6-->>API: Job complete ✓
    
    API-->>U: All jobs notified ✓
```

</FullscreenDiagram>
### Implementation

```typescript
// Before (Broken)
export class ComfyWorkflowRunner {
  private redisServerClient: RedisServerClient;
  constructor(prisma: PrismaClient, eventEmitter?: EventEmitter) {
    // Creates new connection every time!
    this.redisServerClient = new RedisServerClient(
      process.env.REDIS_SERVER_URL,
      process.env.REDIS_SERVER_TOKEN,
      eventEmitter,
    );
  }
}

// After (Fixed)
export class ComfyWorkflowRunner {
  private redisServerClient: RedisServerClient;
  constructor(prisma: PrismaClient, eventEmitter?: EventEmitter) {
    // Reuses singleton connection
    this.redisServerClient = RedisServerClient.getInstance(
      process.env.REDIS_SERVER_URL,
      process.env.REDIS_SERVER_TOKEN,
      eventEmitter,
    );
  }
}

class RedisServerClient {
  private static instance: RedisServerClient | null = null;
  private activeJobs: Map<string, JobContext> = new Map();
  private ws: WebSocket | null = null;
  
  static getInstance(url?: string, token?: string, eventEmitter?: EventEmitter): RedisServerClient {
    if (!RedisServerClient.instance) {
      RedisServerClient.instance = new RedisServerClient(url, token, eventEmitter);
    }
    return RedisServerClient.instance;
  }
  
  // Existing methods remain the same...
}
```

## Benefits of Singleton Pattern

### Connection Efficiency
- **Before**: 90 connections per 6 workflows
- **After**: 1 connection for unlimited workflows
- **Scalability**: Handles 1000s of workflows with single connection

### Resource Management
- Eliminates connection pool exhaustion
- Reduces memory usage
- Prevents connection timeout issues

### Reliability
- Consistent job notifications
- No dropped connections under load
- Better error handling and recovery

## Implementation Plan

1. **Modify RedisServerClient** to use singleton pattern
2. **Update ComfyWorkflowRunner** constructor
3. **Add connection pooling** for high throughput
4. **Implement connection recovery** logic
5. **Add monitoring** for connection health

## Testing Strategy

### Load Testing
- Test with 100 concurrent workflow requests
- Monitor connection count and stability
- Verify all job notifications received

### Edge Cases
- Connection drops during job execution
- Redis server restarts
- Network interruptions

### Performance Metrics
- Connection count: Should remain at 1
- Job completion rate: Should be 100%
- Notification delivery: Should be reliable

## Files to Modify

### Primary Changes
- `src/clients/redis-server-client.ts` - Add singleton pattern
- `src/lib/workflows.ts` - Use singleton instance

### Secondary Changes  
- `src/modules/art-gen/nodes-v2/nodes/comfy.ts` - Connection management
- Tests for new singleton behavior
- Documentation updates

## Risk Assessment

### Low Risk
- Singleton pattern is well-established
- Existing job queueing logic unchanged
- Backwards compatible

### Mitigation
- Implement connection health checks
- Add fallback connection creation
- Gradual rollout with monitoring

---

## Related Issues
- [WebSocket disconnection after first generation]
- [Redis connection limits]
- [Job notification reliability]

## Status: READY FOR IMPLEMENTATION

This fix is critical for system stability and user experience. The singleton pattern will eliminate connection proliferation while maintaining all existing functionality.