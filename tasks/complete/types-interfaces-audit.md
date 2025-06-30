# Types vs Interfaces Directory Audit

## Summary
🔴 **Issues Found**: Several violations of the types/interfaces separation

## Current Structure Issues

### ❌ Service Contracts in `types/` (Should move to `interfaces/`)

**File**: `src/core/types/connector.ts`
- `ConnectorInterface` - Service contract with methods like `initialize()`, `processJob()`
- `ConnectorFactory` - Service contract with `createConnector()`, `validateConfig()`
- **Action**: Move service interfaces to `interfaces/connector.ts`
- **Keep in types**: `JobData`, `JobResult`, `ConnectorConfig`, etc. (data shapes)

### ❌ Data Shapes in `interfaces/` (Should move to `types/`)

**File**: `src/core/interfaces/connection-manager.ts`
- `WebSocketConnection` - Data shape (properties + some methods, but primarily data)
- `ConnectionManagerConfig` - Pure data shape
- **Action**: Move to `types/connection.ts` or `types/websocket.ts`

## Proposed Structure

### `types/` - Data Shapes Only
```
types/
├── job.ts                    ✅ Job, JobStatus, JobProgress, etc.
├── worker.ts                 ✅ WorkerCapabilities, WorkerInfo, etc.
├── messages.ts               ✅ All message interfaces
├── timestamp.ts              ✅ Timestamp type
├── connector.ts              🔄 SPLIT: Keep JobData, JobResult, ConnectorConfig
├── connection.ts             🆕 NEW: WebSocketConnection, ConnectionManagerConfig
└── index.ts                  ✅ Barrel export
```

### `interfaces/` - Service Contracts Only
```
interfaces/
├── redis-service.ts          ✅ RedisServiceInterface
├── message-handler.ts        ✅ MessageHandlerInterface  
├── message-router.ts         ✅ MessageRouterInterface
├── connection-manager.ts     🔄 CLEAN: Only ConnectionManagerInterface
├── connector.ts              🆕 NEW: ConnectorInterface, ConnectorFactory
└── index.ts                  ✅ Barrel export
```

## Required Changes

### 1. Split `types/connector.ts`
```typescript
// Keep in types/connector.ts (data shapes)
export interface JobData { ... }
export interface JobResult { ... }
export interface ConnectorConfig { ... }
export interface RestConnectorConfig { ... }
export interface A1111ConnectorConfig { ... }
export interface ComfyUIConnectorConfig { ... }
export interface WebSocketConnectorConfig { ... }
export type ProgressCallback = (progress: JobProgress) => Promise<void>;

// Move to interfaces/connector.ts (service contracts)
export interface ConnectorInterface { ... }
export interface ConnectorFactory { ... }
```

### 2. Move Connection Data Types
```typescript
// Move from interfaces/connection-manager.ts to types/connection.ts
export interface WebSocketConnection { ... }
export interface ConnectionManagerConfig { ... }
```

### 3. Clean Up Imports
Update all imports to reference the new locations.

## Benefits After Cleanup

1. **Clear Separation**: Data vs behavior completely separated
2. **No Confusion**: Developers know exactly where to look
3. **Better Testing**: Can mock interfaces without pulling in data types
4. **Dependency Direction**: Clean unidirectional dependencies (interfaces → types)

## Current vs Target

**Current**: Mixed concerns, confusion about where things belong
**Target**: Clean separation following single responsibility principle

```
interfaces/ → types/  ✅ (services depend on data)
types/ → interfaces/  ❌ (data should not depend on services)
```