# Service Mapping Architecture & Job Routing Flow

This document explains how worker names, services, job types, and connectors work together in the EMP job queue system. Understanding this flow is critical for debugging job routing issues.

## Overview

The job routing system has multiple layers of mapping that convert a job request into a working connector. Here's the high-level flow:

```
Job with service_required → Redis Function Matching → Worker → Connector → Job Processing
```

## Core Components

### 1. Workers
**Definition**: A worker is a process instance that can handle jobs. Each worker is defined by:
- A worker type (e.g., "simulation", "comfyui")  
- A unique worker ID (e.g., "sim-local-dev-worker-0")
- A set of services it can handle

### 2. Services  
**Definition**: Services are the actual capabilities/endpoints that can process jobs. Services define:
- What connector to use
- What job types they accept
- Installation requirements
- Resource bindings

### 3. Job Types
**Definition**: Job types are the categories of work that can be submitted (e.g., "simulation", "comfyui", "openai_text")

### 4. Connectors
**Definition**: Connectors are the code classes that actually process jobs by communicating with services

## The Complete Flow

### Step 1: Job Submission
```javascript
// Example job submission
{
  "id": "job-123",
  "service_required": "simulation",  // ← This is the key field
  "payload": { ... },
  "requirements": { ... }
}
```

### Step 2: Worker Capability Building

When a worker starts, it builds its capabilities by reading the service mapping:

```javascript
// From redis-direct-base-worker.ts:getServicesFromMapping()

// 1. Read WORKERS env var (e.g., "simulation:5")  
const workersEnv = process.env.WORKERS; // "simulation:5"
const workerSpecs = ["simulation"]; // Extract worker type

// 2. Look up worker type in service mapping
const workerConfig = serviceMapping.workers["simulation"];
// Returns: { "services": ["simulationx"], "job_types_accepted": [...] }

// 3. Extract service names (NOT job types)
const services = workerConfig.services; // ["simulationx"]

// 4. Build worker capabilities
return {
  worker_id: "sim-local-dev-worker-0",
  services: ["simulationx"], // ← This gets sent to Redis function
  hardware: { ... },
  // ... other fields
}
```

### Step 3: Redis Function Job Matching

The Redis function `findMatchingJob.lua` receives worker capabilities and matches against pending jobs:

```lua
-- From findMatchingJob.lua:matches_requirements()

-- Check if worker services match job's service_required
if job.service_required then
  local has_service = false
  for _, service in ipairs(worker.services) do  -- worker.services = ["simulationx"]
    if service == job.service_required then     -- job.service_required = "simulation"
      has_service = true
      break
    end
  end
  
  if not has_service then
    return false  -- ← MATCH FAILS HERE!
  end
end
```

**CRITICAL ISSUE**: The Redis function is doing a direct string match between:
- Worker services: `["simulationx"]` (from service mapping)
- Job service_required: `"simulation"` (from job submission)

These don't match! This explains why the system only works when they happen to be the same string.

### Step 4: Connector Resolution (When Match Succeeds)

When a worker receives a job, it needs to find the right connector:

```javascript
// From redis-direct-base-worker.ts
const connector = await this.connectorManager.getConnectorByService(job.service_required);

// From connector-manager.ts:getConnectorByService()
// This method reads service-mapping.json and looks for services that can handle the job type
for (const [serviceName, serviceConfig] of Object.entries(serviceMapping.services)) {
  if (serviceConfig.job_types_accepted.includes(serviceRequired)) {
    const connectorName = serviceConfig.connector;
    return this.getConnector(connectorName);
  }
}
```

## Current Service Mapping Analysis

Looking at the current `service-mapping.json`:

```json
{
  "workers": {
    "simulation": {
      "services": ["simulationx"],                    // ← Worker advertises "simulationx" service
      "job_types_accepted": [                         // ← This is NOT used in matching
        { "job_type": "simulation123", "service": "simulationx" },
        { "job_type": "simulationxyz", "service": "simulationx" }
      ]
    }
  },
  "services": {
    "simulationx": {
      "connector": "SimulationHttpConnector",
      "job_types_accepted": ["simulation"]            // ← Service accepts "simulation" job type
    }
  }
}
```

**The Problem**: 
1. Worker advertises service: `"simulationx"`
2. Job requires service: `"simulation"`  
3. Redis function tries to match: `"simulationx" === "simulation"` → **FALSE**

## Why It Sometimes Works

The system works when:
1. The worker service name matches the job service_required exactly
2. OR there's a fallback mechanism that bypasses the service matching

## The Correct Architecture

There are two valid approaches to fix this:

### Option A: Service-Based Matching (Current Attempt)
```json
{
  "workers": {
    "simulation": {
      "services": ["simulation"]  // ← Change to match job service_required
    }
  },
  "services": {
    "simulation": {
      "connector": "SimulationHttpConnector",
      "job_types_accepted": ["simulation", "sim", "test"]
    }
  }
}
```

### Option B: Job-Type Based Matching (Better Long-term)
Modify the Redis function to match against job types instead of service names:

```lua
-- Instead of matching worker.services vs job.service_required
-- Match worker.job_types_accepted vs job.service_required

for _, job_type in ipairs(worker.job_types_accepted) do
  if job_type == job.service_required then
    has_match = true
    break
  end
end
```

## Architectural Layers Summary

```mermaid
graph TD
    A[Job with service_required: 'simulation'] --> B[Redis Function Matching]
    B --> C{Worker services contains 'simulation'?}
    C -->|Yes| D[Job assigned to Worker]
    C -->|No| E[No match - job stays pending]
    
    D --> F[Worker calls getConnectorByService('simulation')]
    F --> G[Search services.*.job_types_accepted for 'simulation']
    G --> H[Find service with matching job_types_accepted]
    H --> I[Get connector name from service config]
    I --> J[Load connector class]
    J --> K[Process job]
    
    style C fill:#ffcccc
    style E fill:#ffcccc
```

## Environment Variable Flow

```
WORKERS=simulation:5
    ↓
Worker Type: "simulation" 
    ↓
serviceMapping.workers["simulation"].services 
    ↓  
Worker Capabilities: { services: ["simulationx"] }
    ↓
Redis Function: Match "simulationx" vs job.service_required="simulation"
    ↓
FAILS because "simulationx" !== "simulation"
```

## Key Files and Their Roles

| File | Role | Key Functions |
|------|------|---------------|
| `service-mapping.json` | Configuration | Defines worker→service→connector mappings |
| `redis-direct-base-worker.ts` | Worker initialization | `getServicesFromMapping()`, `buildCapabilities()` |
| `findMatchingJob.lua` | Job matching | `matches_requirements()` - service name matching |
| `connector-manager.ts` | Connector resolution | `getConnectorByService()` - job type matching |

## Debugging Checklist

When jobs aren't being picked up:

1. **Check Worker Services**: What services does the worker advertise?
   ```bash
   # Look for log: "Derived services from service mapping: ..."
   ```

2. **Check Job Service Required**: What service does the job need?
   ```bash
   # Check job.service_required field
   ```

3. **Check Service Mapping**: Do the worker services match job service_required?
   ```bash
   # Workers.{type}.services should contain job.service_required
   ```

4. **Check Connector Resolution**: Can the system find a connector?
   ```bash  
   # Services.{name}.job_types_accepted should contain job.service_required
   ```

## Recommended Fix

For immediate resolution, align the service names:

```json
{
  "workers": {
    "simulation": {
      "services": ["simulation"]  // ← Change from "simulationx" to "simulation"
    }
  },
  "services": {  
    "simulation": {              // ← Change from "simulationx" to "simulation"
      "connector": "SimulationHttpConnector",
      "job_types_accepted": ["simulation"]
    }
  }
}
```

This ensures:
- Worker advertises: `["simulation"]`
- Job requires: `"simulation"`  
- Redis function matches: `"simulation" === "simulation"` ✅
- Connector resolution works: service accepts job type `"simulation"` ✅