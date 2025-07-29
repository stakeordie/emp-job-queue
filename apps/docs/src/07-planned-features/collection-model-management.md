# Collection & Workflow Model Management System

**Status**: Planning Phase  
**Priority**: High  
**Estimated Time**: 3-5 days  
**Dependencies**: EmProps Open API, Machine Configuration, Redis

## Overview

Create a comprehensive model management system that allows machines to automatically download and maintain models based on assigned workflow_ids and collection_ids. This eliminates runtime model downloads and enables intelligent job routing based on model availability.

## Problem Statement

**Current Issues:**
- First-user experiences 5+ minute wait times for model downloads
- No visibility into which models are available on which machines
- Job routing cannot consider model availability
- Manual model management across distributed machines
- Unpredictable machine capabilities

**Target State:**
- All required models pre-installed at machine startup
- Real-time inventory of model availability per machine
- Intelligent job routing based on model availability
- Zero runtime model downloads for assigned workflows/collections

## Architecture Overview

### System Flow
```mermaid
graph TD
    A[Machine Startup] --> B[Read Configuration]
    B --> C[Discover Required Models]
    C --> D[Download Missing Models]
    D --> E[Report Model Inventory]
    E --> F[Start ComfyUI Services]
    
    C --> G[GET /workflows/name/{workflow}]
    C --> H[GET /collections/{id}/public]
    H --> I[GET /workflows/name/{component}]
    
    E --> J[Redis: machine:models]
    J --> K[Job Router]
    K --> L[Intelligent Job Placement]
```

## Implementation Components

### 1. Machine Configuration Extension

**File**: `apps/machine/src/config/environment.js`

**New Environment Variables:**
```bash
# Direct workflow assignments
WORKFLOW_IDS="openai_text,openai_image,comfyui_flux"

# Collection assignments  
COLLECTION_IDS="373617e1-d355-4b9b-bbd8-c13c93bf433a,marketing-collection"

# API configuration
EMPROPS_API_BASE_URL="https://cycle-16-dev-api-openstudio.emprops.ai"  # Dev environment
# EMPROPS_API_BASE_URL="https://api.emprops.ai"  # Production environment
MODEL_DOWNLOAD_TIMEOUT_MINUTES=30
MODEL_DOWNLOAD_CONCURRENCY=3
MODEL_DOWNLOAD_RETRY_ATTEMPTS=3
```

**Configuration Validation:**
- Validate collection and workflow IDs exist
- Check API connectivity
- Verify required authentication tokens

### 2. Model Discovery Service

**File**: `apps/machine/src/services/model-discovery-service.js`

**Purpose**: Aggregate all required models from assigned workflows and collections

**Key Methods:**
```javascript
class ModelDiscoveryService {
  async discoverRequiredModels() {
    const workflowModels = await this.getWorkflowModels();
    const collectionModels = await this.getCollectionModels();
    return this.deduplicateModels([...workflowModels, ...collectionModels]);
  }
  
  async getWorkflowModels() {
    // GET /workflows/name/{workflow} for each WORKFLOW_ID
  }
  
  async getCollectionModels() {
    // GET /collections/{id}/public → extract components
    // GET /workflows/name/{component} for each component
  }
}
```

**API Integration:**
- **Workflow Models**: `GET /workflows/name/{workflow_name}` ✅ **IMPLEMENTED**
  - Response includes `models: string[]` array of required model names
  - Full workflow data with WorkflowModel relationships
- **Collection Components**: `GET /collections/{collection_id}/public` ✅ **IMPLEMENTED**
  - Returns collection data with `collection_node` (components) array
  - Each component references workflows that define required models
- **Component Models**: `GET /workflows/name/{component_name}` ✅ **IMPLEMENTED**
  - Same as workflow models endpoint (components are workflows)

### 3. Model Download Service

**File**: `apps/machine/src/services/model-download-service.js`

**Purpose**: Download all required models with authentication, progress tracking, and error handling

**Features:**
- **Concurrent Downloads**: Configurable concurrency limits
- **Authentication Support**: HF_TOKEN, CIVITAI_TOKEN integration
- **Progress Tracking**: Real-time download progress logging
- **Hash Verification**: Ensure download integrity
- **Retry Logic**: Exponential backoff for failed downloads
- **ComfyUI Integration**: Proper directory structure and file placement

**Download Process:**
```javascript
class ModelDownloadService {
  async downloadModels(modelManifest) {
    for (const model of modelManifest) {
      await this.downloadWithRetry(model);
      await this.verifyDownload(model);
      this.reportProgress(model);
    }
  }
  
  async downloadWithRetry(model, maxRetries = 3) {
    // Implement exponential backoff retry logic
  }
  
  async verifyDownload(model) {
    // Hash verification and file integrity checks
  }
}
```

### 4. Model Inventory Service

**File**: `apps/machine/src/services/model-inventory-service.js`

**Purpose**: Scan ComfyUI directories and maintain real-time model inventory in Redis

**Redis Data Structure:**
```json
{
  "machine_id": "gpu-worker-001",
  "models": {
    "checkpoints": [
      {
        "name": "flux-dev.safetensors",
        "path": "/workspace/ComfyUI/models/checkpoints/flux-dev.safetensors",
        "size_gb": 23.8,
        "hash": "7fac5935ad7b22c0e9147b26ae3f890b",
        "last_verified": "2025-01-29T15:30:00Z"
      }
    ],
    "loras": [],
    "vaes": [],
    "embeddings": []
  },
  "last_updated": "2025-01-29T15:30:00Z",
  "total_models": 12,
  "total_size_gb": 156.7
}
```

**Redis Keys:**
- `machine:{machine_id}:models` - Complete model inventory
- `models:index:{model_name}` - Reverse index: which machines have this model
- `machine:{machine_id}:model_scan_status` - Scan progress and status

### 5. EmProps API Client

**File**: `apps/machine/src/utils/emprops-api-client.js`

**Purpose**: Centralized API client for all emprops_open_api interactions

**Methods:**
```javascript
class EmPropsApiClient {
  constructor(baseUrl = process.env.EMPROPS_API_BASE_URL) {
    this.baseUrl = baseUrl;
  }
  
  async getCollection(collectionId) {
    // GET /collections/{id}/public
    // Returns: { data: { collection_node: [...], ... }, error: null }
  }
  
  async getWorkflowModels(workflowName) {
    // GET /workflows/name/{workflow}
    // Returns: { data: { models: ["model1", "model2"], ... }, error: null }
  }
  
  async getModelByName(modelName) {
    // GET /models/name/{name}
    // Returns: { data: { downloadUrl, saveTo, isAuthReq, authEnvVar, ... }, error: null }
  }
  
  async getBatchModels(modelNames) {
    // POST /models/batch (TO BE IMPLEMENTED)
    // Body: { model_ids: ["model1", "model2"] }
    // Returns: { data: { models: [...], not_found: [...] }, error: null }
  }
  
  async validateCollectionExists(collectionId) {
    // Validate collection accessibility
    const response = await this.getCollection(collectionId);
    return !response.error;
  }
  
  async validateWorkflowExists(workflowName) {
    // Validate workflow accessibility  
    const response = await this.getWorkflowModels(workflowName);
    return !response.error;
  }
  
  async validateModelAuth() {
    // POST /models/validate-auth
    // Returns validation status for all auth-required models
  }
}
```

**Error Handling:**
- Retry logic with exponential backoff
- Graceful degradation for API failures
- Clear error messages for authentication issues
- Fallback to cached data when possible

### 6. Startup Integration

**File**: `apps/machine/src/index-pm2.js`

**Enhanced Startup Sequence:**
```javascript
async function startMachine() {
  // 1. Load and validate configuration
  const config = await loadMachineConfig();
  
  // 2. Discover required models
  const modelDiscovery = new ModelDiscoveryService(config);
  const requiredModels = await modelDiscovery.discoverRequiredModels();
  
  // 3. Download missing models
  const modelDownloader = new ModelDownloadService(config);
  await modelDownloader.downloadModels(requiredModels);
  
  // 4. Scan and report model inventory
  const modelInventory = new ModelInventoryService(config);
  await modelInventory.scanAndReport();
  
  // 5. Start ComfyUI services (only after models are ready)
  await startComfyUIServices();
  
  // 6. Start periodic inventory updates
  modelInventory.startPeriodicUpdates();
}
```

## Job Routing Enhancement

### Redis Function Update

**File**: `packages/core/src/redis-functions/find-matching-job.lua`

**Enhanced Job Matching:**
```lua
-- Check if worker has required models
local function hasRequiredModels(workerId, requiredModels)
  if not requiredModels or #requiredModels == 0 then
    return true
  end
  
  local workerModels = redis.call('HGET', 'machine:' .. workerId .. ':models', 'models')
  if not workerModels then
    return false
  end
  
  local models = cjson.decode(workerModels)
  for _, requiredModel in ipairs(requiredModels) do
    if not hasModel(models, requiredModel) then
      return false
    end
  end
  
  return true
end
```

### Job Requirements Extension

**Enhanced Job Schema:**
```json
{
  "job_id": "job-123",
  "service_required": "comfyui",
  "requirements": {
    "service_type": "comfyui",
    "models": [
      "flux-dev.safetensors",
      "sdxl-vae.safetensors"
    ],
    "gpu_memory_gb": 16,
    "storage_gb": 50
  }
}
```

**Note:** Model names match the `name` field in the EmProps Open API Model table. The job routing system will check if machines have these specific models in their inventory.

## Monitoring & Observability

### Startup Metrics
- **Model Discovery Time**: Time to fetch all model requirements
- **Download Progress**: Per-model download status and progress
- **Total Startup Time**: Complete machine ready time
- **Download Success Rate**: Percentage of successful model downloads

### Runtime Metrics
- **Model Inventory Freshness**: Time since last inventory scan
- **Job Routing Efficiency**: Jobs routed to machines with required models
- **Model Cache Hit Rate**: Jobs using pre-installed vs downloaded models
- **Storage Utilization**: Model storage usage per machine

### Logging Strategy
```javascript
// Structured logging for model operations
logger.info('Model discovery started', {
  workflow_ids: config.workflowIds,
  collection_ids: config.collectionIds,
  machine_id: config.machineId
});

logger.info('Model download progress', {
  model_name: 'flux-dev.safetensors',
  progress_percent: 45,
  download_speed_mbps: 125,
  eta_seconds: 180
});

logger.info('Model inventory updated', {
  total_models: 12,
  new_models: 2,
  removed_models: 0,
  total_size_gb: 156.7
});
```

## Error Handling & Recovery

### Download Failures
- **Individual Model Failures**: Continue with other models, retry failed ones
- **Network Issues**: Exponential backoff, resume downloads
- **Authentication Failures**: Clear error messages about missing/invalid tokens
- **Storage Issues**: Pre-flight disk space checks, cleanup old models

### API Failures
- **Collection API Down**: Fallback to cached collection data
- **Workflow API Down**: Graceful degradation, warn about potentially missing models
- **Authentication Issues**: Clear guidance on token configuration

### Recovery Strategies
- **Partial Downloads**: Resume interrupted downloads
- **Corrupted Models**: Re-download on hash mismatch
- **Missing Models**: Periodic reconciliation scans
- **Redis Failures**: Local inventory caching with sync on reconnect

## Implementation Phases

### Phase 1: Core Infrastructure (Days 1-2)
**Deliverables:**
- Machine configuration extension (workflow_ids, collection_ids)
- EmProps API client with error handling (**APIs already available**)
- Basic model discovery service
- Startup integration framework
- `POST /models/batch` endpoint implementation in emprops-open-api

**Success Criteria:**
- Machines can read workflow and collection assignments
- API client successfully fetches workflow and collection data ✅ **APIs ready**
- Basic model discovery aggregates requirements from all sources
- Batch model lookup endpoint operational

### Phase 2: Model Download System (Days 2-3)
**Deliverables:**
- Model download service with concurrent downloads
- Authentication integration (HF_TOKEN, CIVITAI_TOKEN)
- Progress tracking and retry logic
- Hash verification and integrity checks

**Success Criteria:**
- Models download successfully with authentication
- Failed downloads retry with exponential backoff
- All downloads verified for integrity
- Clear progress reporting throughout process

### Phase 3: Inventory & Routing (Days 3-4)
**Deliverables:**
- Model inventory service with Redis reporting
- Enhanced job routing with model awareness
- Real-time inventory updates
- Job matching with model requirements

**Success Criteria:**
- Redis contains accurate model inventory for all machines
- Jobs route only to machines with required models
- Model inventory updates in real-time as models change
- Zero jobs fail due to missing models

### Phase 4: Monitoring & Optimization (Days 4-5)
**Deliverables:**
- Comprehensive logging and metrics
- Error handling and recovery mechanisms
- Performance optimization and caching
- Documentation and operational guides

**Success Criteria:**
- All model operations comprehensively logged
- System recovers gracefully from all error scenarios
- Model downloads optimized for speed and reliability
- Clear operational documentation for troubleshooting

## Success Metrics

### Performance Targets
- **Zero Runtime Model Downloads**: 100% of assigned workflow/collection models pre-installed
- **Startup Time**: <10 minutes for complete model setup (vs hours currently)
- **Download Success Rate**: >99% successful model downloads
- **Job Routing Accuracy**: >95% jobs routed to machines with required models

### User Experience Improvements
- **First-User Wait Time**: Eliminated (0 seconds vs 5+ minutes currently)
- **Job Failure Rate**: <1% due to missing models (vs ~20% currently)
- **Predictable Performance**: Consistent job execution times
- **Resource Utilization**: Optimal model distribution across machines

### Operational Benefits
- **Machine Predictability**: Known model inventory at all times
- **Capacity Planning**: Accurate storage and capability planning
- **Cost Optimization**: Efficient model distribution, reduced redundant downloads
- **Debugging**: Clear visibility into model-related job failures

## API Integration Details

### Existing EmProps Open API Endpoints

**Model Management:**
```
GET  /models                    - List all models with filtering
GET  /models/name/{name}       - Get model by name (✅ ready for machine use)
GET  /models/{id}              - Get model by ID  
POST /models/batch             - Batch model lookup (🚧 needs implementation)
POST /models/validate-auth     - Validate auth tokens for models requiring authentication
```

**Workflow & Collection Integration:**
```
GET  /workflows/name/{name}    - Get workflow with models array (✅ ready)
GET  /collections/{id}/public  - Get collection with components (✅ ready)
```

**Response Formats:**
- All responses follow `{ data: ..., error: null }` pattern
- Model authentication status included (`isAuthReq`, `authEnvVar`)
- File metadata includes `downloadUrl`, `saveTo`, `fileSize`, `hash` for integrity checks

### Integration with Existing Machine Status System

The model inventory system will integrate with the existing `MachineStatusAggregator` class:

```javascript
// Enhancement to existing machine-status-aggregator.js
class MachineStatusAggregator {
  // ... existing methods ...
  
  async reportModelInventory(models) {
    // Add model inventory to machine status reports
    this.currentStatus.models = {
      total_count: models.length,
      total_size_gb: models.reduce((sum, m) => sum + (m.size_gb || 0), 0),
      by_type: {
        checkpoints: models.filter(m => m.type === 'checkpoint').length,
        loras: models.filter(m => m.type === 'lora').length,
        vaes: models.filter(m => m.type === 'vae').length,
        embeddings: models.filter(m => m.type === 'embedding').length
      },
      last_updated: Date.now()
    };
    
    await this.publishStatus('model_inventory_updated');
  }
}
```

## Future Enhancements

### Advanced Model Management
- **Model Versioning**: Track and manage multiple versions of same model
- **Smart Caching**: LRU eviction for storage-constrained machines
- **Delta Updates**: Only download changed model components
- **Model Validation**: Runtime integrity checks and automatic repair

### Pool-Specific Optimization
- **Pool Model Profiles**: Different model sets for Fast Lane vs Heavy pools
- **Baked Container Images**: Pre-installed models in container layers
- **Model Affinity Routing**: Prefer machines with optimal model combinations
- **Cross-Pool Model Sharing**: Intelligent model distribution strategies

### Predictive Capabilities
- **Usage Pattern Analysis**: Predict future model needs based on job patterns
- **Proactive Model Placement**: Pre-download models before they're needed
- **Demand Forecasting**: Scale model availability based on predicted demand
- **Intelligent Pre-caching**: Machine learning-driven model placement optimization

---

*This system provides the foundation for predictive model management and eliminates the primary user experience bottleneck in the current architecture. It advances directly toward the North Star goal of intelligent, specialized machine pools with optimal resource utilization.*