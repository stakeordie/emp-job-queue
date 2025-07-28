# Worker-Driven Machine Implementation Plan

This document outlines the complete plan to implement a unified worker-driven machine system with full environment orchestration, starting from the stable legacy foundation and incrementally adding capabilities.

## Executive Summary

**Goal**: Create a single unified machine architecture where worker specifications drive service installation, resource allocation, and Docker orchestration, eliminating the need for separate machine types while enabling precise control over worker counts and resource binding.

**Strategy**: Enhance existing environment builder → Implement worker-driven architecture → Add Docker Compose orchestration → Achieve complete environment automation.

## Phase 1: Enhanced Environment Builder with Docker Compose (Weeks 1-2)

### 1.1 Extend Environment Builder Core

**Location**: `packages/env-management/src/`

**New Types**:
```typescript
// types.ts additions
export interface DockerComposeConfig {
  services: Record<string, DockerServiceConfig>;
  networks?: Record<string, any>;
  volumes?: Record<string, any>;
  profiles?: string[];
}

export interface DockerServiceConfig {
  image?: string;
  build?: string | { context: string; dockerfile: string };
  environment?: string[]; // References to .env files
  ports?: string[];
  volumes?: string[];
  depends_on?: string[];
  deploy?: { resources?: { reservations?: { devices?: any[] } } };
  condition?: string; // For conditional inclusion
}

export interface Profile {
  description: string;
  components: Components;
  services?: Record<string, ServiceConfig>;
  docker?: DockerComposeConfig; // New!
}
```

**Enhanced Builder**:
```typescript
// builder.ts enhancements
export class EnvironmentBuilder {
  async buildFromProfile(profileName: string): Promise<BuildResult> {
    // 1. Generate .env files (existing)
    // 2. Generate docker-compose.yaml (new)
    // 3. Generate any additional orchestration files
  }
  
  private async generateDockerCompose(profile: Profile, resolvedVars: Record<string, string>): Promise<void>
  private shouldIncludeService(serviceConfig: DockerServiceConfig, profile: Profile): boolean
  private processServiceConfig(serviceConfig: DockerServiceConfig, resolvedVars: Record<string, string>): any
}
```

### 1.2 Profile Templates with Docker

**full-local.json**:
```json
{
  "description": "Complete local development with Docker orchestration",
  "components": {
    "api": "local",
    "worker": "local", 
    "monitor": "local",
    "redis": "local"
  },
  "docker": {
    "services": {
      "redis": {
        "image": "redis:7-alpine",
        "ports": ["6379:6379"],
        "volumes": ["redis_data:/data"],
        "condition": "components.redis === 'local'"
      },
      "machine": {
        "build": "./apps/machine",
        "environment": [".env"],
        "volumes": [
          "./apps/worker/bundled:/workspace/worker-bundled",
          "machine_workspace:/workspace"
        ],
        "deploy": {
          "resources": {
            "reservations": {
              "devices": [{"driver": "nvidia", "capabilities": ["gpu"]}]
            }
          }
        }
      }
    },
    "volumes": {
      "redis_data": {},
      "machine_workspace": {}
    }
  }
}
```

**api-only.json**:
```json
{
  "description": "API-only machine for external services",
  "components": {
    "api": "local",
    "worker": "api-only",
    "redis": "remote"
  },
  "docker": {
    "services": {
      "machine": {
        "build": "./apps/machine",
        "environment": [".env"],
        "volumes": ["./apps/worker/bundled:/workspace/worker-bundled"]
      }
    }
  }
}
```

### 1.3 Validation & Testing

```bash
# Test complete environment generation
pnpm env:build --profile=full-local
# → .env files generated
# → docker-compose.yaml generated
# → Ready to run: docker compose up

pnpm env:build --profile=api-only  
# → Different .env configuration
# → Different docker-compose.yaml (no GPU)
```

## Phase 2: Worker-Driven Architecture Foundation (Weeks 3-4)

### 2.1 Worker Configuration Specification

**Environment Variables**:
```bash
# Worker count and resource binding specification
WORKER_CONNECTORS=comfyui:2:gpu,openai:4:shared,playwright:1:cpu

# Format: connector:count:binding
# - connector: service connector type
# - count: number of worker processes
# - binding: gpu, cpu, shared (resource allocation)

# Hardware configuration
MACHINE_GPU_COUNT=2
MACHINE_RAM_GB=32
MACHINE_HAS_GPU=true
```

### 2.2 Service Mapping System

**Location**: `apps/machine/src/config/service-mapping.js`

```javascript
export const SERVICE_MAPPING = {
  // Internal Services (require installation)
  'comfyui': {
    type: 'internal',
    service: 'comfyui',
    installer: 'installComfyUI',
    resource_binding: 'gpu',
    service_instances_per_gpu: 1,
    ports: [8188], // Base port, +1 per GPU
  },
  
  'comfyui-websocket': {
    type: 'internal', 
    service: 'comfyui', // Same service, different connector
    installer: 'installComfyUI',
    resource_binding: 'gpu',
    service_instances_per_gpu: 1,
    ports: [8188],
  },
  
  'playwright': {
    type: 'internal',
    service: 'playwright',
    installer: 'installPlaywright',
    resource_binding: 'cpu',
    service_instances_per_machine: 1,
    ports: [9090],
  },
  
  // External Services (API only)
  'openai': {
    type: 'external',
    service: null,
    installer: null,
    resource_binding: 'shared',
    required_env: ['OPENAI_API_KEY'],
  },
  
  'replicate': {
    type: 'external',
    service: null,
    installer: null,
    resource_binding: 'shared', 
    required_env: ['REPLICATE_API_TOKEN'],
  },
};
```

### 2.3 Worker Configuration Parser

**Location**: `apps/machine/src/config/worker-config-parser.js`

```javascript
export class WorkerConfigParser {
  parseWorkerConnectors(connectorString) {
    // Parse "comfyui:2:gpu,openai:4:shared" format
    // Return worker specifications with counts and bindings
  }
  
  generateWorkerAllocation(workerSpecs, machineConfig) {
    // Allocate workers to GPUs/resources
    // Validate hardware requirements
    // Return allocation plan
  }
  
  validateRequirements(workerSpecs, machineConfig) {
    // Check GPU availability
    // Validate API keys for external services
    // Ensure resource constraints are met
  }
}
```

### 2.4 Worker-Driven Service Installer

**Location**: `apps/machine/src/services/worker-driven-installer.js`

```javascript
export class WorkerDrivenInstaller {
  async installFromWorkerConnectors(connectorList, machineConfig) {
    const workerSpecs = this.parseWorkerConnectors(connectorList);
    const allocation = this.generateWorkerAllocation(workerSpecs, machineConfig);
    
    // Install unique services only once
    const servicesToInstall = new Set();
    for (const spec of workerSpecs) {
      if (spec.mapping.type === 'internal') {
        servicesToInstall.add(spec.mapping.service);
      }
    }
    
    // Install each service
    for (const service of servicesToInstall) {
      await this.installService(service);
    }
    
    return allocation;
  }
  
  async installService(serviceName) {
    switch(serviceName) {
      case 'comfyui':
        await this.installComfyUI();
        break;
      case 'playwright':
        await this.installPlaywright();
        break;
      default:
        throw new Error(`Unknown service: ${serviceName}`);
    }
  }
}
```

## Phase 3: Dynamic PM2 Ecosystem Generation (Weeks 5-6)

### 3.1 Enhanced Ecosystem Generator

**Location**: `apps/machine/src/config/ecosystem-generator.js` (enhanced)

```javascript
export class EcosystemGenerator {
  generateEcosystem(workerAllocation, machineConfig) {
    const apps = [];
    
    // 1. Generate service processes (ComfyUI per GPU, Playwright service, etc.)
    for (const serviceName of workerAllocation.services) {
      const serviceApps = this.generateServiceApps(serviceName, workerAllocation, machineConfig);
      apps.push(...serviceApps);
    }
    
    // 2. Generate worker processes with proper resource binding
    for (const worker of workerAllocation.workers) {
      const workerApp = this.generateWorkerApp(worker);
      apps.push(workerApp);
    }
    
    return { apps };
  }
  
  generateServiceApps(serviceName, allocation, machineConfig) {
    switch (serviceName) {
      case 'comfyui':
        // One ComfyUI instance per GPU with workers
        return this.generateComfyUIApps(allocation, machineConfig);
      case 'playwright':
        // Single Playwright service
        return this.generatePlaywrightApps();
      default:
        return [];
    }
  }
  
  generateWorkerApp(worker) {
    const app = {
      name: worker.id,
      script: '/workspace/worker-bundled/redis-direct-worker.cjs',
      env: {
        WORKER_ID: worker.id,
        WORKER_CONNECTORS: worker.connector,
        WORKER_TYPE: worker.connector,
      },
    };
    
    // Add GPU-specific configuration
    if (worker.gpu_id !== undefined) {
      app.env.CUDA_VISIBLE_DEVICES = worker.gpu_id.toString();
      app.env.WORKER_GPU_ID = worker.gpu_id.toString();
      app.env.COMFYUI_BASE_URL = `http://localhost:${8188 + worker.gpu_id}`;
    }
    
    return app;
  }
}
```

### 3.2 Resource Allocation Examples

**Dual-GPU ComfyUI Machine**:
```bash
WORKER_CONNECTORS=comfyui:4:gpu
MACHINE_GPU_COUNT=2

# Generated PM2 Processes:
# Services: comfyui-gpu0, comfyui-gpu1
# Workers:  comfyui-worker-0 (gpu:0), comfyui-worker-1 (gpu:1), 
#           comfyui-worker-2 (gpu:0), comfyui-worker-3 (gpu:1)
```

**Mixed Workload Machine**:
```bash
WORKER_CONNECTORS=comfyui:2:gpu,openai:6:shared,playwright:1:cpu
MACHINE_GPU_COUNT=2

# Generated PM2 Processes:
# Services: comfyui-gpu0, comfyui-gpu1, playwright-service
# Workers:  comfyui-worker-0 (gpu:0), comfyui-worker-1 (gpu:1),
#           openai-worker-0..5 (shared), playwright-worker-0 (cpu)
```

## Phase 4: Docker Compose Integration (Weeks 7-8)

### 4.1 Worker-Driven Docker Generation

**Location**: `packages/env-management/src/docker-compose-generator.js`

```javascript
export class DockerComposeGenerator {
  generateForWorkerConfig(workerConnectors, machineConfig, resolvedVars) {
    const workerSpecs = this.parseWorkerConnectors(workerConnectors);
    const allocation = this.generateWorkerAllocation(workerSpecs, machineConfig);
    
    return {
      version: '3.8',
      services: {
        machine: {
          build: './apps/machine',
          env_file: ['.env'],
          volumes: [
            './apps/worker/bundled:/workspace/worker-bundled',
            'machine_workspace:/workspace'
          ],
          deploy: allocation.requiresGpu ? {
            resources: {
              reservations: {
                devices: [{ driver: 'nvidia', capabilities: ['gpu'] }]
              }
            }
          } : undefined,
          ports: this.generatePorts(allocation),
        },
        ...this.generateAdditionalServices(allocation, resolvedVars)
      },
      volumes: {
        machine_workspace: {}
      }
    };
  }
  
  generatePorts(allocation) {
    const ports = [];
    
    // ComfyUI ports (8188 + gpu_id)
    if (allocation.services.has('comfyui')) {
      for (let gpu = 0; gpu < allocation.gpuCount; gpu++) {
        ports.push(`${8188 + gpu}:${8188 + gpu}`);
      }
    }
    
    // Playwright port
    if (allocation.services.has('playwright')) {
      ports.push('9090:9090');
    }
    
    return ports;
  }
  
  generateAdditionalServices(allocation, resolvedVars) {
    const services = {};
    
    // Add Redis if configured as local
    if (resolvedVars.REDIS_HOST === 'localhost') {
      services.redis = {
        image: 'redis:7-alpine',
        ports: ['6379:6379'],
        volumes: ['redis_data:/data']
      };
    }
    
    return services;
  }
}
```

### 4.2 Profile Integration

**Enhanced Profiles with Worker Configuration**:

```json
{
  "description": "GPU machine with mixed workload",
  "components": {
    "api": "local",
    "worker": "gpu-mixed",
    "redis": "local"
  },
  "worker_config": {
    "connectors": "comfyui:2:gpu,openai:4:shared",
    "gpu_count": 2,
    "ram_gb": 32
  },
  "docker": {
    "auto_generate": true,
    "additional_services": {
      "redis": {
        "image": "redis:7-alpine",
        "condition": "components.redis === 'local'"
      }
    }
  }
}
```

## Phase 5: Complete Integration & Testing (Weeks 9-10)

### 5.1 End-to-End Workflow

```bash
# Complete environment setup in one command
pnpm env:build --profile=gpu-mixed

# Generated files:
# → .env (all environment variables)
# → docker-compose.yaml (complete orchestration)
# → Machine configured for: 2 ComfyUI + 4 OpenAI workers

# Start everything
docker compose up --build

# PM2 processes automatically created:
# → comfyui-gpu0, comfyui-gpu1 (services)
# → comfyui-worker-0, comfyui-worker-1 (GPU workers)
# → openai-worker-0, openai-worker-1, openai-worker-2, openai-worker-3 (API workers)
```

### 5.2 Profile Examples

**Development Profile**:
```bash
pnpm env:build --profile=dev-full
# → Local Redis, single GPU, mixed workers
# → Ports exposed for debugging
# → Development-friendly configuration
```

**Production GPU Profile**:
```bash
pnpm env:build --profile=prod-gpu
# → Remote Redis, multiple GPUs, optimized workers
# → No port exposure, production hardening
# → Resource limits and monitoring
```

**API Gateway Profile**:
```bash
pnpm env:build --profile=api-gateway
# → Multiple API service workers
# → No GPU allocation, CPU optimized
# → High concurrency configuration
```

### 5.3 Validation & Testing Framework

```bash
# Test worker allocation
pnpm test:worker-allocation

# Test service installation
pnpm test:service-install

# Test Docker generation
pnpm test:docker-compose

# Test complete profile builds
pnpm test:profiles

# Integration test with actual containers
pnpm test:integration
```

## Implementation Timeline

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| 1 | 2 weeks | Enhanced environment builder with Docker Compose generation |
| 2 | 2 weeks | Worker-driven architecture with service mapping |
| 3 | 2 weeks | Dynamic PM2 ecosystem generation |
| 4 | 2 weeks | Complete Docker Compose integration |
| 5 | 2 weeks | Testing, validation, and production readiness |

**Total Duration**: 10 weeks to full production deployment

## Success Metrics

### Technical Metrics
- ✅ Single command environment setup (`pnpm env:build --profile=X`)
- ✅ Automatic Docker orchestration generation
- ✅ Precise worker count and resource allocation
- ✅ Dynamic service installation based on worker needs
- ✅ GPU allocation and port management
- ✅ 100% compatibility with existing Redis job broker

### Operational Metrics
- ✅ Simplified deployment (1 profile → complete environment)
- ✅ Flexible worker scaling (change numbers, redeploy)
- ✅ Resource optimization (only install needed services)
- ✅ Environment consistency across dev/staging/production

### User Experience Metrics
- ✅ No manual Docker configuration needed
- ✅ Clear worker count and resource specification
- ✅ Rapid environment switching between profiles
- ✅ Comprehensive validation and error messages

## Risk Mitigation

### High-Risk Areas
1. **Complex Resource Allocation**: Worker-to-GPU mapping complexity
   - **Mitigation**: Extensive validation, clear error messages, comprehensive testing

2. **Docker Generation Complexity**: Many conditional scenarios
   - **Mitigation**: Template-based generation, profile validation, incremental testing

3. **Performance Regression**: Additional abstraction layers
   - **Mitigation**: Performance benchmarking, A/B testing, optimization

### Rollback Strategy
- Maintain legacy machine setup during transition
- Feature flags for worker-driven vs legacy mode
- Profile-based rollback capabilities
- Automated testing and validation

## Benefits Summary

This implementation provides:

1. **Complete Environment Automation**: Single command creates everything needed
2. **Precise Resource Control**: Exact worker counts and GPU allocation
3. **Service Optimization**: Only install and run what's needed
4. **Flexible Scaling**: Change worker counts without rebuilding
5. **Consistent Orchestration**: Docker Compose generation matches worker needs
6. **Profile-Based Environments**: Complete environment templates
7. **Production Ready**: Full validation, testing, and deployment automation

The result is a truly worker-driven system where specifying worker requirements automatically configures the entire machine, services, and orchestration - advancing directly toward the North Star architecture of specialized machine pools with intelligent resource management.