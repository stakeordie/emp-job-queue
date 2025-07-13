# Connector Status Reliability Plan

## Problem Statement

The worker service notification system is producing unreliable and inconsistent status results. Workers have service capabilities listed in `WORKER_CONNECTORS` ENV var, but the status reporting from service connectors to API to monitor is broken.

## Current State Analysis

### 1. Working Components
- Worker tracks connector statuses in `ConnectorManager`
- Worker has methods to get connector health (`getConnectorStatuses()`)
- API receives and parses connector statuses from Redis
- Monitor UI displays connector status with health indicators
- WebSocket events propagate status changes

### 2. Broken Components

#### A. Limited Status Reporting
- **Only simulation connector** implements status reporting
- ComfyUI, A1111, and other connectors lack Redis connection
- No `setRedisConnection()` method exists to propagate Redis to connectors
- Connectors can't publish status updates without Redis access

#### B. No Active Health Monitoring
- Worker only sends initial connector status on startup
- No periodic health checks after initialization
- `startConnectorStatusUpdates()` only sends initial status, then stops
- Health changes aren't detected or reported

#### C. Event Flow Gaps
- Connectors have no way to report status changes
- Worker doesn't poll connector health periodically
- Status updates rely on non-existent event-driven mechanisms

## Root Cause Summary

1. **Architectural Gap**: Connectors need Redis access but don't receive it
2. **Implementation Gap**: Only 1 of 6 connectors implements status reporting
3. **Monitoring Gap**: No periodic health checks or change detection
4. **Event Gap**: Event-driven updates not fully implemented

## Proposed Solution

### Phase 1: Create BaseConnector Architecture (Recommended Approach)

1. **Create Layered Connector Architecture**
   
   **Base Layer - Shared Functionality:**
   ```typescript
   abstract class BaseConnector implements ConnectorInterface {
     // Required by interface
     abstract connector_id: string;
     abstract service_type: string;
     abstract version: string;

     // Shared Redis functionality
     protected redis: Redis | null = null;
     protected workerId: string | null = null;
     protected machineId: string | null = null;
     private lastReportedStatus: string | null = null;
     protected currentStatus: 'starting' | 'idle' | 'active' | 'error' | 'offline' = 'starting';

     // Redis injection method
     setRedisConnection(redis: Redis, workerId: string, machineId: string): void {
       this.redis = redis;
       this.workerId = workerId;
       this.machineId = machineId;
     }

     // Shared status reporting logic
     protected async reportStatus(): Promise<void> {
       if (!this.redis || !this.workerId) return;
       
       const statusReport = {
         connector_id: this.connector_id,
         service_type: this.service_type,
         worker_id: this.workerId,
         machine_id: this.machineId,
         status: this.currentStatus,
         timestamp: Date.now(),
         service_info: await this.getServiceInfo()
       };

       // Update worker-level status
       await this.redis.hset(`worker:${this.workerId}`, 
         'connector_statuses', JSON.stringify({[this.service_type]: statusReport}));
       
       // Update service-level index
       await this.updateServiceIndex();
       
       // Publish real-time update
       await this.redis.publish(`connector_status:${this.service_type}`, JSON.stringify(statusReport));
       this.lastReportedStatus = this.currentStatus;
     }

     // Service-specific health check - implemented by connection pattern layer
     abstract checkServiceHealth(): Promise<{ isHealthy: boolean; isProcessing: boolean; errorMessage?: string }>;
     
     // Standard methods that call service-specific implementations
     async checkHealth(): Promise<boolean> {
       try {
         const health = await this.checkServiceHealth();
         return health.isHealthy;
       } catch {
         return false;
       }
     }
     
     // Abstract methods each connector must implement
     abstract initialize(): Promise<void>;
     abstract processJob(jobData: JobData, progressCallback: ProgressCallback): Promise<JobResult>;
   }
   ```

   **Connection Pattern Layer:**
   ```typescript
   abstract class RestConnector extends BaseConnector {
     protected httpClient: AxiosInstance;
     protected config: RestConnectorConfig;

     constructor(connectorId: string, config: RestConnectorConfig) {
       super();
       this.connector_id = connectorId;
       this.config = config;
       this.httpClient = axios.create({
         baseURL: config.base_url,
         timeout: config.timeout_seconds * 1000,
         auth: config.auth?.type === 'basic' ? {
           username: config.auth.username!,
           password: config.auth.password!
         } : undefined
       });
     }

     // Shared REST functionality
     protected async makeRequest(endpoint: string, options?: RequestOptions): Promise<any> {
       // Common retry logic, error handling, timeouts
       for (let attempt = 1; attempt <= this.config.retry_attempts; attempt++) {
         try {
           const response = await this.httpClient.request({
             url: endpoint,
             ...options
           });
           return response;
         } catch (error) {
           if (attempt === this.config.retry_attempts) throw error;
           await new Promise(resolve => setTimeout(resolve, this.config.retry_delay_seconds * 1000));
         }
       }
     }

     protected async pollForCompletion(jobId: string, progressCallback: ProgressCallback): Promise<JobResult> {
       // Standard REST polling pattern with progress updates
       let progress = 0;
       while (progress < 100) {
         const status = await this.getJobStatus(jobId);
         progress = status.progress;
         await progressCallback({ progress, message: status.message });
         
         if (status.completed) break;
         await new Promise(resolve => setTimeout(resolve, 1000)); // Poll every second
       }
       return this.getJobResult(jobId);
     }

     // Abstract methods for REST-specific implementations
     abstract getJobStatus(jobId: string): Promise<{ progress: number; message: string; completed: boolean }>;
     abstract getJobResult(jobId: string): Promise<JobResult>;
   }

   abstract class WebSocketConnector extends BaseConnector {
     protected websocket: WebSocket | null = null;
     protected config: WebSocketConnectorConfig;
     private reconnectAttempts = 0;
     private maxReconnectAttempts = 5;

     // Shared WebSocket functionality
     protected async connectWebSocket(): Promise<void> {
       const wsUrl = this.config.websocket_url;
       
       return new Promise((resolve, reject) => {
         this.websocket = new WebSocket(wsUrl);
         
         this.websocket.on('open', () => {
           this.reconnectAttempts = 0;
           resolve();
         });
         
         this.websocket.on('error', (error) => {
           reject(error);
         });
         
         this.websocket.on('close', () => {
           this.handleWebSocketClose();
         });
         
         this.websocket.on('message', (data) => {
           this.handleWebSocketMessage(data);
         });
       });
     }

     private async handleWebSocketClose(): void {
       if (this.reconnectAttempts < this.maxReconnectAttempts) {
         this.reconnectAttempts++;
         const delay = Math.pow(2, this.reconnectAttempts) * 1000; // Exponential backoff
         setTimeout(() => this.connectWebSocket(), delay);
       } else {
         this.currentStatus = 'offline';
         await this.reportStatus();
       }
     }

     protected setupProgressListening(jobId: string, progressCallback: ProgressCallback): void {
       // Standard WebSocket progress handling - override in service implementations
     }

     // Abstract methods for WebSocket-specific implementations
     abstract handleWebSocketMessage(data: Buffer): void;
   }

   abstract class HybridConnector extends BaseConnector {
     protected httpClient: AxiosInstance;
     protected websocket: WebSocket | null = null;
     protected config: HybridConnectorConfig;

     // Combine both REST and WebSocket capabilities
     // REST for control (job submission, health checks)
     // WebSocket for real-time updates (progress, status)
     
     protected async makeRequest(endpoint: string, options?: RequestOptions): Promise<any> {
       // Same as RestConnector
     }
     
     protected async connectWebSocket(): Promise<void> {
       // Same as WebSocketConnector
     }
   }
   ```

   **Service-Specific Implementations:**
   ```typescript
   class ComfyUIConnector extends HybridConnector {
     service_type = 'comfyui';
     
     async checkServiceHealth() {
       const systemStats = await this.makeRequest('/system_stats');
       const models = await this.getAvailableModels();
       
       return {
         isHealthy: systemStats.status === 200 && models.length > 0,
         isProcessing: this.activeJobs.size > 0,
         errorMessage: models.length === 0 ? 'No models loaded' : undefined
       };
     }
   }

   class A1111Connector extends RestConnector {
     service_type = 'a1111';
     
     async checkServiceHealth() {
       const options = await this.makeRequest('/sdapi/v1/options');
       const progress = await this.makeRequest('/sdapi/v1/progress');
       
       return {
         isHealthy: options.status === 200,
         isProcessing: progress.data?.state?.job_count > 0
       };
     }
   }

   class GenericRestConnector extends RestConnector {
     async checkServiceHealth() {
       const health = await this.makeRequest('/health');
       return {
         isHealthy: health.status === 200,
         isProcessing: false // Generic REST doesn't track processing state
       };
     }
   }
   ```

2. **Update ConnectorInterface to include setRedisConnection**
   ```typescript
   interface ConnectorInterface {
     setRedisConnection(redis: Redis, workerId: string): void;
     // ... existing methods
   }
   ```

3. **Refactor all connectors to extend BaseConnector**
   ```typescript
   export class ComfyUIConnector extends BaseConnector {
     connector_id: string;
     service_type = 'comfyui';
     version = '1.0.0';

     async initialize(): Promise<void> {
       // ComfyUI-specific initialization
       await this.reportStatus(); // Inherited method
     }

     async checkHealth(): Promise<boolean> {
       // ComfyUI-specific health check
     }
   }
   ```

4. **Update ConnectorManager to pass Redis to all connectors**
   ```typescript
   // In connector-manager.ts loadConnector()
   connector.setRedisConnection(this.redis, this.workerId);
   ```

**Benefits of Layered Connector Architecture:**
- **Connection Pattern Reuse** - REST, WebSocket, and Hybrid patterns shared across services
- **Service-Specific Focus** - Each service connector focuses on API specifics, not connection complexity
- **Consistent Redis access** - All connectors get Redis functionality automatically
- **Shared status reporting logic** - No code duplication across connectors
- **Centralized error handling** - Retry logic, timeouts, reconnection handled by pattern layer
- **Type safety** - Enforced through abstract class hierarchy
- **Easy service onboarding** - New services just pick appropriate connection pattern
- **Maintainability** - Changes to REST/WebSocket handling happen in one place
- **Flexibility** - Services can switch connection patterns if APIs evolve
- **Graceful failure handling** - Offline services still get registered and reported

### Phase 2: Active Health Monitoring

1. **Periodic health checks in base worker**
   ```typescript
   private async checkConnectorHealth(): Promise<void> {
     const statuses = await this.connectorManager.getConnectorStatuses();
     await this.redisClient.updateConnectorStatuses(statuses);
     
     // Publish changes via Redis pub/sub
     for (const [connectorId, status] of Object.entries(statuses)) {
       if (this.lastConnectorStatuses[connectorId]?.status !== status.status) {
         await this.publishConnectorStatusChange(connectorId, status);
       }
     }
   }
   ```

2. **Add health check interval**
   - Check every 30 seconds (configurable)
   - Detect and report status changes
   - Maintain last known state for comparison

### Phase 3: Enhanced Status Information

1. **Refined Status Values**
   ```typescript
   export interface ConnectorStatus {
     connector_id: string;
     status: 'starting' | 'idle' | 'active' | 'error' | 'offline';
     version?: string;
     health_check_at?: string;
     error_message?: string;
     service_info?: {
       url?: string;
       models_loaded?: string[];
       memory_usage?: number;
       queue_length?: number;
       processing_jobs?: number;
     };
   }
   ```

2. **Status Definitions**
   - **`starting`** - Connector initializing, service starting up
   - **`idle`** - Service healthy, models loaded, ready for jobs
   - **`active`** - Service healthy and currently processing jobs
   - **`error`** - Service reachable but returning errors
   - **`offline`** - Service not reachable at all

3. **Service-Specific Health Logic**
   - **ComfyUI**: Check `/system_stats`, model availability, memory usage
   - **A1111**: Check `/sdapi/v1/options`, `/sdapi/v1/sd-models`, processing state
   - **Simulation**: Always healthy, track simulated job state
   - **REST/WebSocket**: Check endpoint reachability, response times

4. **Status Transition Logic**
   ```
   [starting] -> [idle] -> [active] -> [idle]
        ↓          ↓         ↓         ↓
    [error] <- [error] <- [error] <- [error]
        ↓
   [offline]
   ```
   
   - **On initialization**: `starting` → `idle` (if healthy) or `error`
   - **On job assignment**: `idle` → `active`
   - **On job completion**: `active` → `idle`
   - **On health check failure**: any status → `error`
   - **On connection failure**: `error` → `offline`
   - **On recovery**: `error`/`offline` → `idle`

### Phase 4: Graceful Failure Handling

**Current Problem**: When services are offline at startup, workers don't report anything about them, leading to invisible failures.

**Solution**: Always register configured connectors, even if their services are offline.

1. **BaseConnector handles initialization failures**
   ```typescript
   abstract class BaseConnector {
     async initialize(): Promise<void> {
       this.currentStatus = 'starting';
       await this.reportStatus();
       
       try {
         await this.initializeService(); // Service-specific logic
         await this.updateStatus(); // Will set to 'idle' or 'error' based on health
       } catch (error) {
         this.currentStatus = 'offline';
         this.errorMessage = error.message;
         await this.reportStatus(); // Report 'offline' status
         // DON'T throw - connector is still registered
       }
     }
   }
   ```

2. **ConnectorManager registers ALL configured connectors**
   ```typescript
   async loadConnector(connectorId: string): Promise<void> {
     try {
       const connector = new ConnectorClass(connectorId);
       
       // ALWAYS register first, before initialization
       this.registerConnector(connector);
       
       // Initialize (may fail, but connector is already registered)
       await connector.initialize();
       
     } catch (error) {
       // Even constructor failures should create stub connectors
       const stubConnector = new OfflineConnector(connectorId, serviceType);
       this.registerConnector(stubConnector);
     }
   }
   ```

3. **Worker reports ALL configured services with their actual status**
   ```typescript
   // Before: Only shows working services
   { services: ["a1111"] } // ComfyUI missing if offline
   
   // After: Shows all configured services with status
   { 
     services: ["comfyui", "a1111"],
     connector_statuses: {
       "comfyui": { status: "offline", error_message: "Connection refused" },
       "a1111": { status: "idle" }
     }
   }
   ```

**Benefits:**
- **Full visibility**: Monitor always shows all expected services
- **Better debugging**: Clear distinction between "not configured" vs "offline"
- **Consistent reporting**: Worker capabilities match environment configuration
- **Operational clarity**: Operators can see what should be running vs what is running

### Phase 5: Service-Centric Fleet Monitoring

**Current Problem**: Cannot answer fleet-wide questions like "How many ComfyUI services do we have?" without scanning every worker.

**Solution**: Add service-centric indexing alongside existing worker-centric data for fleet visibility and scaling decisions.

1. **Service-Level Data Structures**
   ```redis
   # Service instance registry
   service:comfyui:instances -> {
     "machine-1:worker-gpu0": { 
       status: "idle", 
       machine_id: "machine-1",
       worker_id: "worker-gpu0",
       last_update: "2024-01-15T10:30:00Z",
       error_message: null
     },
     "machine-2:worker-gpu0": { 
       status: "offline", 
       machine_id: "machine-2", 
       worker_id: "worker-gpu0",
       last_update: "2024-01-15T10:25:00Z",
       error_message: "Connection refused"
     }
   }

   # Service aggregated summary
   service:comfyui:summary -> {
     "total": 4,
     "idle": 2,
     "active": 1,
     "error": 1, 
     "offline": 0,
     "last_update": "2024-01-15T10:30:00Z"
   }
   ```

2. **Dual Status Updates**
   ```typescript
   // BaseConnector.reportStatus() - Enhanced
   async reportStatus(): Promise<void> {
     // 1. Update worker-level status (existing)
     await this.redis.hset(`worker:${this.workerId}`, 
       'connector_statuses', JSON.stringify(connectorStatuses));
     
     // 2. Update service-level index (NEW)
     await this.updateServiceIndex();
   }

   private async updateServiceIndex(): Promise<void> {
     const instanceKey = `${this.machineId}:${this.workerId}`;
     
     // Update service instance list
     await this.redis.hset(`service:${this.service_type}:instances`, instanceKey, JSON.stringify({
       status: this.currentStatus,
       machine_id: this.machineId,
       worker_id: this.workerId,
       last_update: new Date().toISOString(),
       error_message: this.errorMessage
     }));
     
     // Update service summary atomically
     await this.updateServiceSummary();
   }
   ```

3. **Fleet-Wide Query Capabilities**
   ```typescript
   // Instant fleet queries
   const comfyuiSummary = await redis.hgetall('service:comfyui:summary');
   // Returns: { total: "4", idle: "2", active: "1", error: "1", offline: "0" }

   const comfyuiInstances = await redis.hgetall('service:comfyui:instances');
   // Returns detailed status for each instance

   // Find offline services by machine
   const offlineInstances = Object.entries(instances)
     .filter(([key, data]) => JSON.parse(data).status === 'offline')
     .map(([key, data]) => ({ 
       machine: key.split(':')[0],
       worker: key.split(':')[1],
       ...JSON.parse(data)
     }));
   ```

4. **API Endpoints for Fleet Management**
   ```typescript
   // GET /api/services - All services overview
   app.get('/api/services', async (req, res) => {
     const serviceKeys = await redis.keys('service:*:summary');
     const summaries = {};
     for (const key of serviceKeys) {
       const serviceType = key.split(':')[1];
       summaries[serviceType] = await redis.hgetall(key);
     }
     res.json(summaries);
   });

   // GET /api/services/comfyui/summary - Service summary
   app.get('/api/services/:serviceType/summary', async (req, res) => {
     const summary = await redis.hgetall(`service:${req.params.serviceType}:summary`);
     res.json(summary);
   });

   // GET /api/services/comfyui/instances - Detailed instances
   app.get('/api/services/:serviceType/instances', async (req, res) => {
     const instances = await redis.hgetall(`service:${req.params.serviceType}:instances`);
     const parsed = Object.entries(instances).map(([key, data]) => ({
       id: key,
       ...JSON.parse(data)
     }));
     res.json(parsed);
   });
   ```

**Benefits:**
- **Instant Fleet Queries**: "How many ComfyUI services?" answered in O(1) time
- **Scaling Intelligence**: Know exactly what capacity exists before adding machines
- **Operational Debugging**: "Which machines have offline ComfyUI?" 
- **Performance**: No need to scan all workers for fleet-wide questions
- **Monitoring Dashboards**: Real-time fleet health by service type
- **Capacity Planning**: Track service utilization patterns over time

**Note**: This maintains existing pull-based job routing (Redis Functions unchanged) while adding fleet visibility for operational needs.

## Implementation Steps

### Step 1: Create Layered Connector Architecture (4-5 hours)
- [ ] Create BaseConnector abstract class in packages/core
- [ ] Create RestConnector abstract class with shared HTTP functionality
- [ ] Create WebSocketConnector abstract class with shared WebSocket functionality  
- [ ] Create HybridConnector abstract class combining REST + WebSocket
- [ ] Add `setRedisConnection` to ConnectorInterface
- [ ] Extract shared status reporting logic from simulation connector
- [ ] Add error handling, retry logic, and reconnection logic to base classes
- [ ] Update ConnectorManager to pass Redis + machineId to all connectors

### Step 2: Refactor Existing Connectors (3-4 hours)
- [ ] Simulation: Refactor to extend BaseConnector (remove duplicate code)
- [ ] ComfyUI: Refactor to extend HybridConnector (REST + WebSocket pattern)
- [ ] A1111: Refactor to extend RestConnector (REST polling pattern)
- [ ] REST Sync: Refactor to extend RestConnector (direct REST pattern)
- [ ] REST Async: Refactor to extend RestConnector (async REST pattern)
- [ ] WebSocket: Refactor to extend WebSocketConnector (pure WebSocket pattern)

### Step 3: Enhanced ConnectorManager Integration (1-2 hours)
- [ ] Update ConnectorManager to initialize Redis connections
- [ ] Add workerId propagation to all loaded connectors
- [ ] Ensure proper cleanup of Redis connections

### Step 4: Graceful Failure Handling (2-3 hours)
- [ ] Update BaseConnector to handle initialization failures gracefully
- [ ] Modify ConnectorManager to always register connectors (even if offline)
- [ ] Create OfflineConnector stub class for constructor failures
- [ ] Ensure worker reports all configured services regardless of status
- [ ] Test startup behavior with offline services

### Step 5: Worker Health Monitoring (2-3 hours)
- [ ] Add periodic health check interval
- [ ] Track status changes
- [ ] Publish status change events
- [ ] Update initial status reporting

### Step 6: Service-Centric Fleet Monitoring (3-4 hours)
- [ ] Add service indexing to BaseConnector.reportStatus()
- [ ] Implement updateServiceIndex() method
- [ ] Create Redis Lua script for atomic service summary updates
- [ ] Add fleet-wide API endpoints (/api/services, /api/services/:type/summary, etc.)
- [ ] Update monitor UI to show fleet-wide service status
- [ ] Add cleanup logic for stale service entries

### Step 7: API Enhancements (2-3 hours)
- [ ] Enhance worker status parsing to validate new status enum values
- [ ] Add GET /api/services endpoint for fleet overview
- [ ] Add GET /api/services/:serviceType/summary endpoint
- [ ] Add GET /api/services/:serviceType/instances endpoint
- [ ] Add error handling and validation for new endpoints
- [ ] Update API documentation for new endpoints

### Step 8: Monitor UI Updates (3-4 hours)
- [ ] Update connector status display to handle 5 status values (starting/idle/active/error/offline)
- [ ] Create getConnectorStatusColor() and getConnectorStatusIcon() helper functions
- [ ] Update SimpleWorkerCard.tsx with enhanced status display
- [ ] Create new FleetServicesCard component for service overview
- [ ] Add fleet services state management to store/index.ts
- [ ] Update WebSocket service to handle fleet_services_update events
- [ ] Add periodic fleet services polling (every 30 seconds)
- [ ] Integrate FleetServicesCard into main monitor page

### Step 9: Testing & Validation (2-3 hours)
- [ ] Test each connector's health reporting with new status values
- [ ] Verify Redis pub/sub events for connector status changes
- [ ] Test fleet-wide API endpoints with various scenarios
- [ ] Confirm monitor UI updates show correct status colors and icons
- [ ] Test FleetServicesCard component with different service states
- [ ] Verify graceful failure handling (offline services still reported)
- [ ] Test startup behavior with mixed online/offline services
- [ ] Validate service-centric indexing updates correctly
- [ ] Test API error handling and edge cases
- [ ] Confirm WebSocket fleet services polling works correctly

## Success Metrics

1. **Reliability**: 100% of connectors report status
2. **Timeliness**: Status changes detected within 30 seconds
3. **Accuracy**: Health status matches actual service state
4. **Visibility**: Monitor shows real-time connector health

## Risk Mitigation

1. **Backward Compatibility**: Keep existing status format
2. **Performance**: Limit health check frequency
3. **Redis Load**: Use pub/sub for changes only
4. **Error Handling**: Graceful failures, don't crash worker

## North Star Alignment

This fix advances toward specialized pools by:
1. **Enabling pool-aware routing**: Can route jobs to workers with healthy connectors
2. **Supporting model affinity**: Can detect which models are actually loaded
3. **Improving reliability**: Foundation for 99.9% job completion rate
4. **Reducing wait times**: Avoid routing to unhealthy workers

## Questions to Consider

1. Should health checks be configurable per connector type?
2. What constitutes "healthy" vs "degraded" vs "unhealthy"?
3. How should we handle transient failures?
4. Should we implement exponential backoff for health checks?
5. Do we need historical health metrics?

## Next Steps

1. Review and approve this plan
2. Create feature branch: `fix/connector-status-reliability`
3. Implement Phase 1 (Redis communication)
4. Test with simulation connector
5. Roll out to other connectors
6. Add monitoring and alerting

---

## Appendix: Detailed Implementation Specifications

### API Implementation Details

#### Enhanced Worker Status Validation
```typescript
// In lightweight-api-server.ts - sendFullStateSnapshot methods
// Validate connector status values against new enum
const VALID_CONNECTOR_STATUSES = ['starting', 'idle', 'active', 'error', 'offline'];

let connectorStatuses: Record<string, unknown> = {};
try {
  if (data.connector_statuses) {
    connectorStatuses = JSON.parse(data.connector_statuses as string);
    
    // Validate status values
    for (const [service, status] of Object.entries(connectorStatuses)) {
      if (status && typeof status === 'object' && 'status' in status) {
        const statusValue = (status as any).status;
        if (!VALID_CONNECTOR_STATUSES.includes(statusValue)) {
          logger.warn(`Invalid connector status: ${statusValue} for service ${service}`);
        }
      }
    }
  }
} catch (error) {
  logger.debug(`Failed to parse connector statuses for worker ${workerId}:`, error);
}
```

#### New Fleet API Endpoints Structure
```typescript
// Response format for GET /api/services
{
  "success": true,
  "services": {
    "comfyui": {
      "total": 4,
      "starting": 0,
      "idle": 2,
      "active": 1,
      "error": 1,
      "offline": 0,
      "last_update": "2024-01-15T10:30:00Z"
    },
    "a1111": {
      "total": 2,
      "starting": 0,
      "idle": 1,
      "active": 1,
      "error": 0,
      "offline": 0,
      "last_update": "2024-01-15T10:29:45Z"
    }
  },
  "timestamp": "2024-01-15T10:30:05Z"
}

// Response format for GET /api/services/comfyui/instances
{
  "success": true,
  "service_type": "comfyui",
  "instances": [
    {
      "id": "machine-1:worker-gpu0",
      "machine_id": "machine-1",
      "worker_id": "worker-gpu0", 
      "status": "idle",
      "last_update": "2024-01-15T10:30:00Z",
      "error_message": null
    },
    {
      "id": "machine-2:worker-gpu0",
      "machine_id": "machine-2",
      "worker_id": "worker-gpu0",
      "status": "offline", 
      "last_update": "2024-01-15T10:25:00Z",
      "error_message": "Connection refused"
    }
  ],
  "total": 2,
  "timestamp": "2024-01-15T10:30:05Z"
}
```

### Monitor UI Implementation Details

#### Status Color and Icon Mapping
```typescript
// Enhanced status display functions
const getConnectorStatusColor = (status: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case 'starting': return 'secondary';    // Yellow/orange theme
    case 'idle': return 'default';          // Green theme
    case 'active': return 'default';        // Blue theme (or custom)
    case 'error': return 'destructive';     // Red theme
    case 'offline': return 'outline';       // Gray theme
    default: return 'outline';
  }
};

const getConnectorStatusIcon = (status: string): string => {
  switch (status) {
    case 'starting': return 'bg-yellow-500';
    case 'idle': return 'bg-green-500'; 
    case 'active': return 'bg-blue-500';
    case 'error': return 'bg-red-500';
    case 'offline': return 'bg-gray-400';
    default: return 'bg-gray-400';
  }
};
```

#### FleetServicesCard Component Structure
```typescript
// apps/monitor/src/components/FleetServicesCard.tsx
interface ServiceSummary {
  total: number;
  starting: number;
  idle: number;
  active: number;
  error: number;
  offline: number;
  last_update: string;
}

// Component shows:
// - Service type header with total count
// - 5-column grid showing count for each status
// - Color-coded status indicators
// - Responsive layout for different screen sizes
```

#### Store Integration Pattern
```typescript
// apps/monitor/src/store/index.ts additions
interface MonitorState {
  fleetServices: Record<string, ServiceSummary>;
  setFleetServices: (services: Record<string, ServiceSummary>) => void;
  
  // WebSocket message handler enhancement
  handleWebSocketMessage: (event: WebSocketEvent) => void;
}

// WebSocket polling strategy:
// - Poll /api/services every 30 seconds
// - Handle fetch errors gracefully
// - Update store state on successful fetch
// - Maintain existing real-time updates for individual worker changes
```

### Integration Points

#### Core Type Updates Required
```typescript
// Update packages/core/src/types/worker.ts
export interface ConnectorStatus {
  connector_id: string;
  status: 'starting' | 'idle' | 'active' | 'error' | 'offline'; // Updated enum
  version?: string;
  health_check_at?: string;
  error_message?: string;
  service_info?: {
    url?: string;
    models_loaded?: string[];
    memory_usage?: number;
    queue_length?: number;
    processing_jobs?: number;
  };
}
```

#### Backward Compatibility Strategy
- Maintain existing WebSocket events for real-time updates
- Add new fleet polling as supplementary data source
- Gracefully handle missing or invalid status values
- Preserve existing monitor functionality during rollout