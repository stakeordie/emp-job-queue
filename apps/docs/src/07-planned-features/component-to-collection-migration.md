# Migration Plan: Component-Based to Collection & Model Management

**Status**: Implementation Plan  
**Priority**: High  
**Estimated Time**: 5-7 days total  
**Dependencies**: Current component-based system, EmProps Open API

## Overview

This document outlines the evolution path from today's component-based configuration system to the full Collection & Model Management architecture. We'll build incrementally, maintaining backward compatibility while adding powerful new capabilities.

## Current State Analysis

### ✅ What We Have Today (Component-Based System)

**Architecture:**
```
Machine Startup
├── ComfyUI Installer
├── Component Manager (installation-time)
│   ├── Fetches components via ECLI
│   ├── Installs custom nodes
│   ├── Saves component-config.json
│   └── Updates worker capabilities
└── Worker (component-restricted)
```

**Environment Variables:**
```bash
COMPONENTS=txt2img-flux,upscale-esrgan
COLLECTIONS=collection-uuid-here
```

**Capabilities:**
- ✅ Component-based machine configuration
- ✅ Automatic custom node installation
- ✅ Worker capability restrictions
- ✅ Basic collection support (via ECLI)

**Limitations:**
- ❌ Installation-time only (no runtime changes)
- ❌ Models downloaded during job execution
- ❌ No model inventory tracking
- ❌ No predictive model management
- ❌ No Redis model routing

## Target State (Collection & Model Management)

### 🎯 Full Vision Architecture

**Environment Variables:**
```bash
# New workflow/collection-based approach
WORKFLOW_IDS="openai_text,openai_image,comfyui_flux"
COLLECTION_IDS="373617e1-d355-4b9b-bbd8-c13c93bf433a"
EMPROPS_API_BASE_URL="https://api.emprops.ai"
```

**Architecture:**
```
Machine Startup
├── Model Discovery Service (API-driven)
├── Model Download Service (concurrent, authenticated)
├── Model Inventory Service (Redis reporting)
├── ComfyUI Installer
└── Worker (model-aware routing)
```

**Capabilities:**
- ✅ Pre-download all required models
- ✅ Real-time model inventory in Redis
- ✅ Job routing based on model availability
- ✅ Zero runtime model downloads
- ✅ Intelligent job placement

## Migration Phases

### **Phase 1: Foundation Bridge (Days 1-2)**
**Goal**: Create compatibility layer between current and target systems

#### **1.1: Environment Variable Bridge**
```bash
# Support both approaches simultaneously
COMPONENTS=txt2img-flux              # Current approach
WORKFLOW_IDS=txt2img-flux           # Target approach
COLLECTION_IDS=uuid                 # Target approach
```

#### **1.2: Create EmPropsApiClient**
```javascript
// apps/machine/src/utils/emprops-api-client.js
class EmPropsApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl || process.env.EMPROPS_API_BASE_URL;
  }
  
  // Bridge methods for current system
  async getComponentModels(componentName) {
    return this.getWorkflowModels(componentName);
  }
  
  // Target methods
  async getWorkflowModels(workflowName) {
    // GET /workflows/name/{workflow}
  }
  
  async getCollection(collectionId) {
    // GET /collections/{id}/public
  }
}
```

#### **1.3: Enhanced Component Manager**
Extend existing component manager to support API-driven model discovery:

```javascript
// apps/machine/src/services/component-manager.js
class ComponentManagerService {
  async handleComponentConfiguration() {
    // Current: ECLI-based component fetching
    if (process.env.COMPONENTS) {
      await this.handleECLIComponents();
    }
    
    // New: API-driven workflow/collection fetching
    if (process.env.WORKFLOW_IDS || process.env.COLLECTION_IDS) {
      await this.handleAPIBasedConfiguration();
    }
  }
  
  async handleAPIBasedConfiguration() {
    const apiClient = new EmPropsApiClient();
    const modelDiscovery = new ModelDiscoveryService(apiClient);
    const requiredModels = await modelDiscovery.discoverRequiredModels();
    
    // Save for future phases
    await this.saveModelManifest(requiredModels);
  }
}
```

**Deliverables:**
- ✅ Both COMPONENTS and WORKFLOW_IDS work
- ✅ EmPropsApiClient with error handling
- ✅ Model discovery aggregates requirements
- ✅ Backward compatibility maintained

---

### **Phase 2: Model Discovery Service (Days 2-3)**
**Goal**: Implement intelligent model requirement aggregation

#### **2.1: ModelDiscoveryService**
```javascript
// apps/machine/src/services/model-discovery-service.js
class ModelDiscoveryService {
  constructor(apiClient) {
    this.apiClient = apiClient;
  }
  
  async discoverRequiredModels() {
    const allModels = [];
    
    // Discover from direct workflow assignments
    if (process.env.WORKFLOW_IDS) {
      const workflowModels = await this.getWorkflowModels();
      allModels.push(...workflowModels);
    }
    
    // Discover from collection assignments
    if (process.env.COLLECTION_IDS) {
      const collectionModels = await this.getCollectionModels();
      allModels.push(...collectionModels);
    }
    
    // Discover from legacy component assignments
    if (process.env.COMPONENTS) {
      const componentModels = await this.getComponentModels();
      allModels.push(...componentModels);
    }
    
    return this.deduplicateModels(allModels);
  }
  
  async getCollectionModels() {
    const collectionIds = process.env.COLLECTION_IDS.split(',');
    const allModels = [];
    
    for (const collectionId of collectionIds) {
      const collection = await this.apiClient.getCollection(collectionId.trim());
      
      // Extract component workflows from collection
      for (const component of collection.data.collection_node || []) {
        const workflow = await this.apiClient.getWorkflowModels(component.name);
        allModels.push(...(workflow.data.models || []));
      }
    }
    
    return allModels;
  }
}
```

#### **2.2: Model Manifest Generation**
```json
// /workspace/model-manifest.json
{
  "timestamp": "2025-01-12T10:30:00.000Z",
  "source": {
    "workflow_ids": ["txt2img-flux", "upscale-esrgan"],
    "collection_ids": ["373617e1-d355-4b9b-bbd8-c13c93bf433a"],
    "components": ["txt2img-flux"]  // Legacy support
  },
  "models": [
    {
      "name": "flux1-dev-fp8.safetensors",
      "downloadUrl": "https://huggingface.co/...",
      "saveTo": "models/unet/flux1-dev-fp8.safetensors",
      "fileSize": "17.2GB",
      "isAuthReq": true,
      "authEnvVar": "HF_TOKEN",
      "hash": "7fac5935ad7b22c0e9147b26ae3f890b",
      "source": "workflow:txt2img-flux"
    }
  ],
  "total_models": 15,
  "total_size_gb": 89.7
}
```

**Deliverables:**
- ✅ ModelDiscoveryService aggregates from all sources
- ✅ API integration with collections and workflows
- ✅ Model manifest with download metadata
- ✅ Comprehensive model requirement analysis

---

### **Phase 3: Model Download System (Days 3-4)**
**Goal**: Implement concurrent, authenticated model downloading

#### **3.1: ModelDownloadService**
```javascript
// apps/machine/src/services/model-download-service.js
class ModelDownloadService {
  constructor(config) {
    this.concurrency = parseInt(process.env.MODEL_DOWNLOAD_CONCURRENCY || '3');
    this.timeout = parseInt(process.env.MODEL_DOWNLOAD_TIMEOUT_MINUTES || '30');
    this.retryAttempts = parseInt(process.env.MODEL_DOWNLOAD_RETRY_ATTEMPTS || '3');
  }
  
  async downloadModels(modelManifest) {
    logger.info(`Starting download of ${modelManifest.models.length} models`);
    
    // Download in batches with concurrency control
    const batches = this.createBatches(modelManifest.models, this.concurrency);
    
    for (const batch of batches) {
      await Promise.all(batch.map(model => this.downloadWithRetry(model)));
    }
    
    await this.updateModelInventory();
  }
  
  async downloadWithRetry(model, attempt = 1) {
    try {
      await this.downloadModel(model);
      await this.verifyDownload(model);
      logger.info(`✅ Downloaded: ${model.name}`);
    } catch (error) {
      if (attempt < this.retryAttempts) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        logger.warn(`Retry ${attempt}/${this.retryAttempts} for ${model.name} in ${delay}ms`);
        await this.sleep(delay);
        return this.downloadWithRetry(model, attempt + 1);
      }
      
      logger.error(`❌ Failed to download ${model.name} after ${this.retryAttempts} attempts`);
      throw error;
    }
  }
}
```

#### **3.2: Authentication Integration**
```javascript
class ModelDownloadService {
  buildHeaders(model) {
    const headers = {};
    
    if (model.isAuthReq && model.authEnvVar) {
      const token = process.env[model.authEnvVar];
      if (!token) {
        throw new Error(`Missing auth token: ${model.authEnvVar} for ${model.name}`);
      }
      
      if (model.authEnvVar === 'HF_TOKEN') {
        headers['Authorization'] = `Bearer ${token}`;
      } else if (model.authEnvVar === 'CIVITAI_TOKEN') {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
    
    return headers;
  }
}
```

**Deliverables:**
- ✅ Concurrent model downloads with progress tracking
- ✅ Authentication support (HF_TOKEN, CIVITAI_TOKEN)
- ✅ Retry logic with exponential backoff
- ✅ Hash verification and integrity checks

---

### **Phase 4: Model Inventory & Routing (Days 4-5)**
**Goal**: Real-time model tracking and job routing integration

#### **4.1: ModelInventoryService**
```javascript
// apps/machine/src/services/model-inventory-service.js
class ModelInventoryService {
  constructor(redisClient, config) {
    this.redis = redisClient;
    this.machineId = config.machine.id;
  }
  
  async scanAndReport() {
    const inventory = await this.scanModelDirectories();
    await this.updateRedisInventory(inventory);
    return inventory;
  }
  
  async updateRedisInventory(inventory) {
    const key = `machine:${this.machineId}:models`;
    
    await this.redis.hset(key, {
      machine_id: this.machineId,
      models: JSON.stringify(inventory.models),
      last_updated: new Date().toISOString(),
      total_models: inventory.total_models,
      total_size_gb: inventory.total_size_gb
    });
    
    // Update reverse index for job routing
    for (const model of inventory.models) {
      await this.redis.sadd(`models:index:${model.name}`, this.machineId);
    }
  }
}
```

#### **4.2: Enhanced Job Routing**
```lua
-- packages/core/src/redis-functions/find-matching-job.lua
local function hasRequiredModels(workerId, jobRequiredModels)
  if not jobRequiredModels or #jobRequiredModels == 0 then
    return true
  end
  
  local workerModels = redis.call('HGET', 'machine:' .. workerId .. ':models', 'models')
  if not workerModels then
    return false
  end
  
  local models = cjson.decode(workerModels)
  for _, requiredModel in ipairs(jobRequiredModels) do
    if not hasModel(models, requiredModel) then
      return false
    end
  end
  
  return true
end
```

**Deliverables:**
- ✅ Real-time model inventory in Redis
- ✅ Enhanced job routing with model awareness
- ✅ Reverse model index for efficient lookups
- ✅ Zero jobs fail due to missing models

---

### **Phase 5: PM2 Integration & Production Ready (Days 5-7)**
**Goal**: Standalone model-manager process and production optimization

#### **5.1: Standalone Model Manager Process**
```javascript
// apps/machine/src/services/model-manager.js
class ModelManagerService extends BaseService {
  constructor(options, config) {
    super('model-manager', options);
    this.config = config;
    this.apiClient = new EmPropsApiClient();
    this.modelDiscovery = new ModelDiscoveryService(this.apiClient);
    this.modelDownloader = new ModelDownloadService(config);
    this.modelInventory = new ModelInventoryService(redisClient, config);
  }
  
  async onStart() {
    logger.info('🎯 Model Manager starting...');
    
    // Phase 1: Discover required models
    const modelManifest = await this.modelDiscovery.discoverRequiredModels();
    
    // Phase 2: Download missing models
    await this.modelDownloader.downloadModels(modelManifest);
    
    // Phase 3: Update inventory
    await this.modelInventory.scanAndReport();
    
    // Phase 4: Start periodic inventory updates
    this.startPeriodicUpdates();
    
    logger.info('✅ Model Manager ready');
  }
}
```

#### **5.2: PM2 Ecosystem Integration**
```javascript
// Enhanced PM2 ecosystem generator
{
  name: 'model-manager',
  script: '/service-manager/src/services/model-manager.js',
  instances: 1,
  env: {
    WORKFLOW_IDS: process.env.WORKFLOW_IDS,
    COLLECTION_IDS: process.env.COLLECTION_IDS,
    EMPROPS_API_BASE_URL: process.env.EMPROPS_API_BASE_URL,
    HF_TOKEN: process.env.HF_TOKEN,
    CIVITAI_TOKEN: process.env.CIVITAI_TOKEN
  }
}
```

#### **5.3: Startup Sequence Update**
```javascript
// apps/machine/src/index-pm2.js
async function startPM2Services() {
  // 1. Start model-manager FIRST (if configured)
  if (hasModelConfiguration()) {
    await pm2Manager.pm2Exec('start /workspace/pm2-ecosystem.config.cjs --only model-manager');
    await waitForModelManagerReady();
  }
  
  // 2. Start ComfyUI services (models are ready)
  await startComfyUIServices();
  
  // 3. Start workers (can rely on model availability)
  await startWorkerProcesses();
}
```

**Deliverables:**
- ✅ Standalone model-manager PM2 process
- ✅ Updated startup sequence (models before ComfyUI)
- ✅ Production monitoring and error handling
- ✅ Seamless migration from current system

## Backward Compatibility Strategy

### **Environment Variable Support**
```bash
# All three approaches supported simultaneously
COMPONENTS=txt2img-flux                    # Current system
WORKFLOW_IDS=txt2img-flux                 # Target system  
COLLECTION_IDS=uuid                       # Target system

# Automatic migration path
MIGRATE_TO_WORKFLOWS=true                 # Converts COMPONENTS → WORKFLOW_IDS
```

### **Graceful Migration**
1. **Phase 1-3**: Both systems run in parallel
2. **Phase 4**: Model routing enhances both systems
3. **Phase 5**: COMPONENTS deprecated but still works
4. **Future**: COMPONENTS removed after full migration

## Success Metrics

### **Performance Targets**
- **Zero Runtime Downloads**: 100% of required models pre-installed ✅
- **Startup Time**: <10 minutes complete setup (vs hours currently) ✅
- **Job Routing Accuracy**: >95% jobs route to machines with models ✅
- **Download Success Rate**: >99% successful downloads ✅

### **User Experience**
- **First-User Wait**: 0 seconds (vs 5+ minutes currently) ✅
- **Job Failure Rate**: <1% due to missing models ✅
- **Predictable Performance**: Consistent execution times ✅

## Risk Mitigation

### **Development Risks**
- **API Changes**: Graceful fallback to cached data
- **Download Failures**: Retry logic with clear error messages
- **Storage Constraints**: Pre-flight disk space checks
- **Performance Impact**: Concurrent downloads with rate limiting

### **Production Risks**
- **Backward Compatibility**: Maintain COMPONENTS support
- **Migration Path**: Gradual rollout with feature flags
- **Rollback Plan**: Disable model-manager, fallback to current system
- **Monitoring**: Comprehensive logging and metrics

## Implementation Schedule

| Phase | Days | Focus | Deliverables |
|-------|------|-------|--------------|
| 1 | 1-2 | Foundation Bridge | API client, environment bridge, enhanced component manager |
| 2 | 2-3 | Model Discovery | Workflow/collection aggregation, model manifest generation |
| 3 | 3-4 | Download System | Concurrent downloads, authentication, retry logic |
| 4 | 4-5 | Inventory & Routing | Redis integration, job routing enhancement |
| 5 | 5-7 | PM2 & Production | Standalone process, startup integration, monitoring |

## Next Steps

1. **Start with Phase 1**: Create the bridge between current and target systems
2. **Maintain current functionality**: Keep COMPONENTS working throughout
3. **Test incrementally**: Each phase builds on the previous
4. **Monitor closely**: Comprehensive logging and metrics
5. **Plan rollback**: Clear path back to current system if needed

This migration plan ensures we can evolve from today's component-based system to the full Collection & Model Management vision without breaking existing functionality.