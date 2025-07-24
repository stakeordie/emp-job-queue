# Unified Machine Foundation Plan

## Overview
This plan refactors the existing worker architecture to create a unified machine foundation with Docker layer optimization. We'll build base machines that specialized machines extend, following the established patterns in the current `ai_infra/emp-worker` codebase.

## Current State Analysis

### Existing Infrastructure (`ai_infra/emp-worker/`)
- **Heavy Dockerfile**: 400+ lines with ComfyUI, A1111, Ollama all in one image
- **PM2 Ecosystem**: Dynamic worker creation based on `NUM_GPUS`
- **BullMQ Workers**: `/usr/local/lib/emp-bullmq/dist/worker.js` 
- **Sophisticated Scripts**: `start.sh`, service management, custom node installation
- **Shared Configuration**: ComfyUI-Manager, custom nodes, model management

### Problems with Current Approach
1. **Monolithic Image**: Everything in one Dockerfile (ComfyUI + A1111 + Ollama)
2. **Poor Layer Caching**: Frequently changing code mixed with stable dependencies
3. **No API Machine Support**: Only GPU-based workers
4. **Rebuild Overhead**: Minor changes require rebuilding entire heavy image

## Proposed Architecture

### Three-Tier Docker Strategy

#### Tier 1: Base Machine (Foundation)
```
base-machine/
├── Dockerfile.base
├── worker-release/          # Downloaded at build time
├── pm2-config/             # Base PM2 configuration
├── redis-client/           # Redis communication library
└── scripts/
    ├── download-release.sh
    ├── setup-pm2.sh
    └── health-check.sh
```

#### Tier 2: Specialized Machines
```
comfyui-machine/
├── Dockerfile              # FROM base-machine
├── comfyui-setup/          # ComfyUI + Python + CUDA
├── custom-nodes/           # All custom nodes (stable)
└── comfyui-worker/         # ComfyUI-specific logic

api-machine/
├── Dockerfile              # FROM base-machine
├── express-setup/          # Node.js + HTTP clients
└── api-worker/             # API-specific logic
```

#### Tier 3: Deployment Instances
- Environment-specific configurations
- Machine-specific .env files
- Runtime customizations

## Implementation Plan

### Phase 1: Base Machine Foundation

#### 1.1 Create Base Machine Structure
```
ai_infra/
├── base-machine/
│   ├── Dockerfile.base
│   ├── worker-core/
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── base-worker.js
│   │   │   ├── redis-client.js
│   │   │   ├── health-monitor.js
│   │   │   └── config-loader.js
│   │   └── scripts/
│   │       ├── download-release.sh
│   │       ├── setup-directories.sh
│   │       └── init-pm2.sh
│   └── config/
│       ├── base-ecosystem.config.js
│       └── default.env
```

#### 1.2 Base Machine Dockerfile
```dockerfile
# ai_infra/base-machine/Dockerfile.base
FROM node:18-bullseye

# Base system dependencies (stable - rarely changes)
RUN apt-get update && apt-get install -y \
    git curl wget jq tar \
    rsync nginx net-tools \
    cron sudo pm2 \
    build-essential \
    && apt-get clean

# Create base directories
WORKDIR /workspace
RUN mkdir -p /workspace/{logs,shared,config,scripts}

# Install worker core (stable)
COPY worker-core/package.json ./worker-core/
RUN cd worker-core && npm install --production

# Copy base worker code (changes infrequently)
COPY worker-core/src/ ./worker-core/src/
COPY worker-core/scripts/ ./scripts/

# Download and setup worker release (stable)
COPY scripts/download-release.sh ./scripts/
RUN chmod +x ./scripts/download-release.sh && \
    ./scripts/download-release.sh

# Setup PM2 base configuration
COPY config/base-ecosystem.config.js ./config/
RUN chmod +x ./scripts/init-pm2.sh && \
    ./scripts/init-pm2.sh

# Health check endpoint
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Base machine doesn't start services - that's for specialized machines
CMD ["node", "worker-core/src/base-worker.js"]
```

#### 1.3 Base Worker Implementation
```javascript
// ai_infra/base-machine/worker-core/src/base-worker.js
const RedisClient = require('./redis-client');
const ConfigLoader = require('./config-loader');
const HealthMonitor = require('./health-monitor');

class BaseWorker {
  constructor() {
    this.config = ConfigLoader.load();
    this.redis = new RedisClient(this.config.redis);
    this.health = new HealthMonitor();
    this.capabilities = this.loadCapabilities();
  }

  async start() {
    // Connect to Redis job queue
    await this.redis.connect();
    
    // Register machine capabilities
    await this.registerMachine();
    
    // Start health monitoring
    this.health.start();
    
    // Listen for jobs (base implementation)
    this.redis.on('job', this.handleJob.bind(this));
    
    console.log(`Base worker started: ${this.config.machineId}`);
  }

  async registerMachine() {
    await this.redis.publish('machine:register', {
      id: this.config.machineId,
      type: this.config.machineType,
      capabilities: this.capabilities,
      timestamp: Date.now()
    });
  }

  async handleJob(job) {
    // Base job handling - to be overridden by specialized workers
    console.log(`Base worker received job: ${job.id}`);
    
    try {
      const result = await this.executeJob(job);
      await this.redis.publish('job:complete', {
        jobId: job.id,
        result,
        machineId: this.config.machineId
      });
    } catch (error) {
      await this.redis.publish('job:error', {
        jobId: job.id,
        error: error.message,
        machineId: this.config.machineId
      });
    }
  }

  async executeJob(job) {
    // Override in specialized workers
    throw new Error('executeJob must be implemented by specialized worker');
  }

  loadCapabilities() {
    // Load from environment or config
    return {
      machineType: this.config.machineType,
      version: this.config.version,
      connectors: this.config.connectors || []
    };
  }
}

module.exports = BaseWorker;
```

### Phase 2: ComfyUI Machine Implementation

#### 2.1 ComfyUI Machine Structure
```
ai_infra/
├── comfyui-machine/
│   ├── Dockerfile
│   ├── comfyui-setup/
│   │   ├── install-comfyui.sh
│   │   ├── install-custom-nodes.sh
│   │   └── requirements.txt
│   ├── worker/
│   │   ├── comfyui-worker.js
│   │   ├── workflow-processor.js
│   │   └── model-manager.js
│   └── config/
│       ├── custom_nodes.json
│       ├── ecosystem.config.js
│       └── comfyui.env
```

#### 2.2 ComfyUI Machine Dockerfile
```dockerfile
# ai_infra/comfyui-machine/Dockerfile
FROM base-machine:latest

# GPU and Python dependencies (stable)
RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-venv \
    cuda-toolkit-11-8 \
    && apt-get clean

# Create Python environment
RUN python3 -m venv /opt/comfyui-env
ENV PATH="/opt/comfyui-env/bin:$PATH"

# Install ComfyUI (stable)
COPY comfyui-setup/install-comfyui.sh ./scripts/
RUN chmod +x ./scripts/install-comfyui.sh && \
    ./scripts/install-comfyui.sh

# Install ALL custom nodes (stable - changes rarely)
COPY config/custom_nodes.json ./config/
COPY comfyui-setup/install-custom-nodes.sh ./scripts/
RUN chmod +x ./scripts/install-custom-nodes.sh && \
    ./scripts/install-custom-nodes.sh

# Copy ComfyUI worker logic (changes more frequently)
COPY worker/ ./comfyui-worker/
RUN cd comfyui-worker && npm install

# Copy PM2 configuration for ComfyUI
COPY config/ecosystem.config.js ./config/

# Environment hydration scripts (changes frequently)
COPY scripts/env-hydration.sh ./scripts/
COPY config/comfyui.env ./config/

# Override base worker with ComfyUI worker
CMD ["node", "comfyui-worker/comfyui-worker.js"]
```

#### 2.3 ComfyUI Worker Implementation
```javascript
// ai_infra/comfyui-machine/worker/comfyui-worker.js
const BaseWorker = require('/workspace/worker-core/src/base-worker');
const WorkflowProcessor = require('./workflow-processor');
const ModelManager = require('./model-manager');

class ComfyUIWorker extends BaseWorker {
  constructor() {
    super();
    this.workflowProcessor = new WorkflowProcessor();
    this.modelManager = new ModelManager();
    this.comfyUI = null; // Will be initialized
  }

  async start() {
    // Initialize ComfyUI
    await this.initializeComfyUI();
    
    // Load available models
    await this.modelManager.scan();
    
    // Start base worker
    await super.start();
  }

  async initializeComfyUI() {
    // Start ComfyUI server via PM2
    const pm2 = require('pm2');
    
    return new Promise((resolve, reject) => {
      pm2.start('/workspace/config/ecosystem.config.js', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async executeJob(job) {
    if (job.type !== 'comfyui') {
      throw new Error(`Unsupported job type: ${job.type}`);
    }

    // Process ComfyUI workflow
    const workflow = job.payload;
    const result = await this.workflowProcessor.execute(workflow);
    
    return {
      type: 'comfyui',
      outputs: result.outputs,
      metadata: {
        executionTime: result.executionTime,
        modelsUsed: result.modelsUsed,
        vramUsed: result.vramUsed
      }
    };
  }

  loadCapabilities() {
    return {
      ...super.loadCapabilities(),
      machineType: 'comfyui',
      connectors: ['comfyui'],
      vram: this.getVRAM(),
      models: this.modelManager.getAvailableModels(),
      customNodes: this.getInstalledNodes()
    };
  }

  getVRAM() {
    // Query GPU memory
    // Implementation depends on nvidia-ml-py or similar
    return 24; // GB - placeholder
  }

  getInstalledNodes() {
    // Parse installed custom nodes
    const fs = require('fs');
    const customNodes = JSON.parse(
      fs.readFileSync('/workspace/config/custom_nodes.json', 'utf8')
    );
    return customNodes.installed || [];
  }
}

// Start the worker
const worker = new ComfyUIWorker();
worker.start().catch(console.error);
```

### Phase 3: API Machine Implementation

#### 3.1 API Machine Structure
```
ai_infra/
├── api-machine/
│   ├── Dockerfile
│   ├── api-setup/
│   │   └── install-deps.sh
│   ├── worker/
│   │   ├── api-worker.js
│   │   ├── connectors/
│   │   │   ├── replicate-connector.js
│   │   │   ├── openai-connector.js
│   │   │   └── runpod-connector.js
│   │   └── rate-limiter.js
│   └── config/
│       ├── ecosystem.config.js
│       └── api.env
```

#### 3.2 API Machine Dockerfile
```dockerfile
# ai_infra/api-machine/Dockerfile
FROM base-machine:latest

# API dependencies (stable)
RUN apt-get update && apt-get install -y \
    curl jq \
    && apt-get clean

# Install API worker dependencies
COPY api-setup/install-deps.sh ./scripts/
RUN chmod +x ./scripts/install-deps.sh && \
    ./scripts/install-deps.sh

# Copy API worker logic (changes more frequently)
COPY worker/ ./api-worker/
RUN cd api-worker && npm install

# Copy PM2 configuration for API worker
COPY config/ecosystem.config.js ./config/

# Environment configuration (changes frequently)
COPY config/api.env ./config/

# Override base worker with API worker
CMD ["node", "api-worker/api-worker.js"]
```

#### 3.3 API Worker Implementation
```javascript
// ai_infra/api-machine/worker/api-worker.js
const BaseWorker = require('/workspace/worker-core/src/base-worker');
const ReplicateConnector = require('./connectors/replicate-connector');
const OpenAIConnector = require('./connectors/openai-connector');
const RunPodConnector = require('./connectors/runpod-connector');
const RateLimiter = require('./rate-limiter');

class APIWorker extends BaseWorker {
  constructor() {
    super();
    this.connectors = new Map();
    this.rateLimiter = new RateLimiter();
    this.initializeConnectors();
  }

  initializeConnectors() {
    // Initialize API connectors based on environment
    if (process.env.REPLICATE_TOKEN) {
      this.connectors.set('replicate', new ReplicateConnector({
        token: process.env.REPLICATE_TOKEN,
        rateLimiter: this.rateLimiter
      }));
    }

    if (process.env.OPENAI_TOKEN) {
      this.connectors.set('openai', new OpenAIConnector({
        token: process.env.OPENAI_TOKEN,
        rateLimiter: this.rateLimiter
      }));
    }

    if (process.env.RUNPOD_TOKEN) {
      this.connectors.set('runpod', new RunPodConnector({
        token: process.env.RUNPOD_TOKEN,
        rateLimiter: this.rateLimiter
      }));
    }
  }

  async executeJob(job) {
    const { apiProvider, payload } = job;
    
    if (!this.connectors.has(apiProvider)) {
      throw new Error(`Unsupported API provider: ${apiProvider}`);
    }

    const connector = this.connectors.get(apiProvider);
    
    // Apply rate limiting
    await this.rateLimiter.waitForSlot(apiProvider);
    
    try {
      const result = await connector.execute(payload);
      
      return {
        type: 'api',
        provider: apiProvider,
        outputs: result.outputs,
        metadata: {
          cost: result.cost,
          duration: result.duration,
          rateLimitRemaining: result.rateLimitRemaining
        }
      };
    } finally {
      this.rateLimiter.releaseSlot(apiProvider);
    }
  }

  loadCapabilities() {
    return {
      ...super.loadCapabilities(),
      machineType: 'api',
      connectors: Array.from(this.connectors.keys()),
      rateLimits: this.rateLimiter.getLimits(),
      supportedProviders: Array.from(this.connectors.keys())
    };
  }
}

// Start the worker
const worker = new APIWorker();
worker.start().catch(console.error);
```

## Docker Layer Optimization Strategy

### Layer Caching Hierarchy (Stable → Volatile)

#### Base Machine Layers (Almost Never Change)
1. **System packages**: `apt-get install` base dependencies
2. **Node.js setup**: Base Node.js and npm packages  
3. **Directory structure**: Basic workspace setup
4. **Worker release**: Downloaded worker binary/source

#### ComfyUI Machine Layers (Rarely Change)
5. **Python/CUDA setup**: GPU dependencies and Python environment
6. **ComfyUI installation**: Core ComfyUI download and requirements
7. **Custom nodes installation**: All custom nodes (stable list)

#### API Machine Layers (Rarely Change)  
5. **API dependencies**: HTTP clients and utilities
6. **Connector setup**: Base connector implementations

#### Machine-Specific Layers (Change Frequently)
8. **Worker logic**: Machine-specific worker implementations
9. **Configuration**: PM2 configs, environment templates
10. **Scripts**: Environment hydration, startup scripts

### Build Optimization
- **Multi-stage builds**: Separate build and runtime stages
- **Build args**: `--build-arg CACHE_BUST=$(date +%s)` for selective rebuilds
- **Layer size**: Keep each layer < 500MB when possible
- **Parallel builds**: Build base machines independently

## Environment Configuration Strategy

### Hierarchical Environment Loading
```
1. Base machine defaults (/workspace/config/default.env)
2. Machine type defaults (/workspace/config/comfyui.env)
3. Deployment environment (mounted .env file)
4. Runtime environment variables
```

### Environment Hydration Script
```bash
#!/bin/bash
# scripts/env-hydration.sh

# Load environment hierarchy
source /workspace/config/default.env
source /workspace/config/${MACHINE_TYPE}.env 2>/dev/null || true
source /workspace/.env 2>/dev/null || true

# Validate required variables
validate_env() {
    local required_vars="$1"
    for var in $required_vars; do
        if [[ -z "${!var}" ]]; then
            echo "ERROR: Required environment variable $var is not set"
            exit 1
        fi
    done
}

# Machine-specific validation
case "$MACHINE_TYPE" in
    "comfyui")
        validate_env "REDIS_URL COMFYUI_PORT GPU_ID"
        ;;
    "api")
        validate_env "REDIS_URL API_PROVIDERS"
        ;;
esac

# Export computed variables
export MACHINE_ID="${MACHINE_TYPE}-${HOSTNAME}-${GPU_ID:-0}"
export LOG_PREFIX="/workspace/logs/${MACHINE_ID}"

echo "Environment hydrated for $MACHINE_ID"
```

## PM2 Configuration Strategy

### Base PM2 Config
```javascript
// ai_infra/base-machine/config/base-ecosystem.config.js
module.exports = {
  apps: [{
    name: 'health-monitor',
    script: '/workspace/worker-core/src/health-monitor.js',
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '256M'
  }]
};
```

### ComfyUI PM2 Config
```javascript
// ai_infra/comfyui-machine/config/ecosystem.config.js
const baseConfig = require('/workspace/config/base-ecosystem.config.js');

const numGpus = parseInt(process.env.NUM_GPUS || '1');
const comfyApps = [];

// Create ComfyUI instances per GPU
for (let i = 0; i < numGpus; i++) {
  comfyApps.push({
    name: `comfyui-${i}`,
    script: 'python',
    args: ['main.py', '--port', (8188 + i).toString()],
    cwd: '/workspace/ComfyUI',
    env: {
      CUDA_VISIBLE_DEVICES: i.toString(),
      COMFY_PORT: (8188 + i).toString()
    },
    max_memory_restart: '8G'
  });

  // Worker for each ComfyUI instance
  comfyApps.push({
    name: `comfyui-worker-${i}`,
    script: '/workspace/comfyui-worker/comfyui-worker.js',
    env: {
      GPU_ID: i.toString(),
      COMFYUI_URL: `http://localhost:${8188 + i}`,
      WORKER_ID: `comfyui-${i}`
    },
    max_memory_restart: '2G'
  });
}

module.exports = {
  apps: [...baseConfig.apps, ...comfyApps]
};
```

## Build and Deployment Strategy

### Build Pipeline
```bash
#!/bin/bash
# scripts/build-all.sh

# Build base machine (rarely changes)
docker build -t base-machine:latest ai_infra/base-machine/

# Build specialized machines in parallel
docker build -t comfyui-machine:latest ai_infra/comfyui-machine/ &
docker build -t api-machine:latest ai_infra/api-machine/ &

wait

echo "All machines built successfully"
```

### Docker Compose for Development
```yaml
# docker-compose.yml
version: '3.8'

services:
  redis:
    image: redis:alpine
    ports:
      - "6379:6379"

  comfyui-worker:
    build: 
      context: ai_infra/comfyui-machine
    environment:
      - REDIS_URL=redis://redis:6379
      - NUM_GPUS=1
      - MACHINE_TYPE=comfyui
    depends_on:
      - redis
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]

  api-worker:
    build:
      context: ai_infra/api-machine
    environment:
      - REDIS_URL=redis://redis:6379
      - MACHINE_TYPE=api
      - REPLICATE_TOKEN=${REPLICATE_TOKEN}
      - OPENAI_TOKEN=${OPENAI_TOKEN}
    depends_on:
      - redis
```

## Migration Strategy

### Phase 1: Base Machine Foundation (Week 1)
- [ ] Create base machine Docker image
- [ ] Implement base worker with Redis communication
- [ ] Set up health monitoring and PM2 integration
- [ ] Create environment hydration system

### Phase 2: ComfyUI Machine Migration (Week 2)
- [ ] Extract ComfyUI logic from existing `emp-worker`
- [ ] Implement ComfyUI worker extending base worker
- [ ] Migrate custom nodes installation to build-time
- [ ] Test compatibility with existing workflows

### Phase 3: API Machine Implementation (Week 3)
- [ ] Implement API worker extending base worker
- [ ] Create connector implementations for Replicate, OpenAI, RunPod
- [ ] Implement rate limiting and error handling
- [ ] Test end-to-end API job execution

### Phase 4: Integration and Testing (Week 4)
- [ ] Update job queue to route to appropriate machine types
- [ ] Implement machine capability registration
- [ ] Test machine selection and job routing
- [ ] Performance testing and optimization

### Phase 5: Production Deployment (Week 5)
- [ ] Deploy to staging environment
- [ ] Gradual rollout with monitoring
- [ ] Performance comparison with existing system
- [ ] Full production deployment

## Success Criteria

### Performance Metrics
- [ ] **Build Time**: Base machine < 5 minutes, specialized machines < 10 minutes additional
- [ ] **Layer Caching**: >90% layer cache hit rate for incremental builds
- [ ] **Job Latency**: No increase in job execution time vs. current system
- [ ] **Resource Usage**: Memory usage within 20% of current system

### Functionality Requirements
- [ ] **Backward Compatibility**: All existing ComfyUI workflows continue working
- [ ] **API Integration**: Support for at least 3 API providers (Replicate, OpenAI, RunPod)
- [ ] **Machine Registration**: Dynamic machine capability registration
- [ ] **Health Monitoring**: Real-time machine health and status reporting

### Operational Benefits
- [ ] **Development Speed**: 50% faster iteration on machine-specific code
- [ ] **Deployment Flexibility**: Independent scaling of machine types
- [ ] **Maintenance**: Simplified troubleshooting and updates
- [ ] **Extensibility**: Easy addition of new machine types

## Risk Mitigation

### Technical Risks
1. **Docker Layer Compatibility**: Test layer caching across different build environments
2. **PM2 Process Management**: Ensure proper process lifecycle in containers
3. **Redis Connection Handling**: Implement connection pooling and retry logic
4. **GPU Resource Allocation**: Proper GPU isolation between workers

### Operational Risks
1. **Migration Complexity**: Implement blue-green deployment strategy  
2. **Performance Regression**: Comprehensive benchmarking before rollout
3. **Configuration Management**: Validate environment hydration in all scenarios
4. **Rollback Plan**: Keep existing system operational during migration

## Future Extensibility

### Connector System Foundation
This foundation enables future connector-based architecture:
- **Dynamic Loading**: Load connectors based on `WORKER_CONNECTORS` env var
- **Plugin Architecture**: Standard connector interface for easy extension
- **Mixed Machines**: Single machine with multiple connector types
- **Resource Optimization**: Shared dependencies between connector types

### Monitoring and Observability
- **Structured Logging**: JSON logs with machine context
- **Metrics Collection**: Prometheus metrics for all machine types
- **Distributed Tracing**: OpenTelemetry for job execution tracing
- **Health Dashboards**: Real-time machine status monitoring

---

**Status**: Ready for implementation
**Priority**: High (Foundation for unified machine system)
**Timeline**: 5 weeks
**Dependencies**: None (uses existing infrastructure patterns)