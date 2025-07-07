# Worker2 Implementation Plan

## Overview

Replace the Python emp-redis workers in emp-worker-old with our new TypeScript Redis-direct workers while preserving all proven infrastructure (ComfyUI, A1111, model management, Docker setup).

## Current Architecture Analysis

### What Works (Keep Unchanged)
- **mgpu-server infrastructure**: ComfyUI + A1111 installations, port management
- **start.sh**: Proven service orchestration, model sync, SSH setup
- **Docker setup**: Container configuration and multi-service management
- **Model management**: S3/Azure sync, symlinks, directory structure
- **Service scripts**: `comfyui`, `a1111`, `mgpu` management scripts

### What to Replace
- **Python workers**: Replace with TypeScript Redis-direct workers
- **setup_redis_workers()**: Download our workers instead of emp-redis Python workers
- **wgpu script**: Update to work with our TypeScript workers
- **worker script**: Update to run Node.js instead of Python

## Implementation Phases

### Phase 1: Enhanced TypeScript Worker Connectors

**Goal**: Make our workers "ComfyUI/A1111 native" with proper WebSocket and HTTP protocols

#### 1.1 ComfyUI Connector Enhancement
```typescript
// src/worker/connectors/comfyui-connector.ts enhancements needed:

interface ComfyUIConnectorConfig {
  host: string;           // localhost 
  port: number;          // 8188 + gpu_id
  useWebSocket: boolean; // true for real-time progress
  authToken?: string;    // if ComfyUI has auth
}

class ComfyUIConnector {
  private wsConnection: WebSocket;
  
  // WebSocket connection for real-time progress
  async connect(): Promise<void> {
    this.wsConnection = new WebSocket(`ws://${this.host}:${this.port}/ws`);
    // Handle progress messages, queue updates, etc.
  }
  
  // Submit job via HTTP + monitor via WebSocket
  async processJob(job: Job): Promise<JobResult> {
    // 1. Submit workflow via POST /prompt
    // 2. Monitor progress via WebSocket messages
    // 3. Download results when complete
  }
}
```

#### 1.2 A1111 Connector Enhancement  
```typescript
// src/worker/connectors/a1111-connector.ts enhancements needed:

class A1111Connector {
  // HTTP polling for progress monitoring
  async processJob(job: Job): Promise<JobResult> {
    // 1. Submit job via POST /sdapi/v1/txt2img
    // 2. Poll for completion via GET /sdapi/v1/progress
    // 3. Retrieve result images
  }
  
  private async pollProgress(jobId: string): Promise<ProgressUpdate> {
    // Poll /sdapi/v1/progress every 1-2 seconds
  }
}
```

### Phase 2: TypeScript Worker Release Build

**Goal**: Create distributable releases that can replace the Python workers

#### 2.1 Release Build Configuration
```bash
# Add to emp-job-queue package.json scripts:
"build:worker-release": "pnpm build && pnpm package:worker-release",
"package:worker-release": "node scripts/package-worker-release.js"
```

#### 2.2 Release Package Script
```javascript
// scripts/package-worker-release.js
// Creates emp-job-queue-worker.tar.gz with:
// - Compiled worker JavaScript
// - Node.js runtime (if needed)
// - Configuration templates
// - Entry point scripts
```

#### 2.3 Release Package Structure
```
emp-job-queue-worker.tar.gz
├── worker_main.js          # Entry point (replaces worker_main.py)
├── dist/                   # Compiled TypeScript
├── node_modules/           # Dependencies (if not using pkg)
├── config/
│   └── worker.env.template # Environment template
└── package.json           # Worker package info
```

### Phase 3: GitHub Actions CI/CD

**Goal**: Automated builds and releases for the worker packages

#### 3.1 Release Workflow
```yaml
# .github/workflows/release-worker.yml
name: Release Worker Package

on:
  push:
    tags:
      - 'worker-v*'
  release:
    types: [published]

jobs:
  build-and-release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: pnpm install
        
      - name: Build worker release
        run: pnpm build:worker-release
        
      - name: Upload release asset
        uses: actions/upload-release-asset@v1
        with:
          asset_path: ./dist/emp-job-queue-worker.tar.gz
          asset_name: emp-job-queue-worker.tar.gz
          asset_content_type: application/gzip
```

### Phase 4: Updated emp-worker-old Scripts

**Goal**: Modify existing scripts to download and run our TypeScript workers

#### 4.1 Modified setup_redis_workers() Function
```bash
# In start.sh, replace the function:
setup_redis_workers() {
    log "Setting up TypeScript Redis Workers..."
    
    # Change to our repository releases
    local release_url="https://api.github.com/repos/emprops/emp-job-queue/releases/latest"
    local asset_name="emp-job-queue-worker.tar.gz"
    
    # Download our TypeScript worker package
    download_url=$(curl -sSL $release_url | jq -r --arg NAME "$asset_name" '.assets[] | select(.name == $NAME) | .browser_download_url')
    
    # Same extraction logic but for TypeScript workers
    # Extract to worker_gpu{N}/ directories
}
```

#### 4.2 Updated Worker Service Script
```bash
# In scripts/worker, modify to run Node.js:
start() {
    local GPU_NUM=$1
    local WORK_DIR="${ROOT}/worker_gpu${GPU_NUM}"
    
    # Look for worker_main.js instead of worker_main.py
    if [ -f "${WORK_DIR}/worker_main.js" ]; then
        WORKER_SCRIPT_PATH="worker_main.js"
        CMD="node ${WORKER_SCRIPT_PATH}"
    else
        log "$GPU_NUM" "ERROR: worker_main.js not found in ${WORK_DIR}"
        return 1
    fi
    
    # Set environment variables for TypeScript worker
    export WORKER_ID="worker-gpu${GPU_NUM}"
    export CUDA_VISIBLE_DEVICES="${GPU_NUM}"
    export WORKER_COMFYUI_PORT=$((8188 + GPU_NUM))
    export WORKER_A1111_PORT=$((3001 + GPU_NUM))
    
    # Run the TypeScript worker
    PYTHONUNBUFFERED=1 eval "$CMD" >> "${WORK_DIR}/logs/output.log" 2>&1 &
}
```

#### 4.3 Environment Variable Mapping
```bash
# Map emp-worker-old env vars to emp-job-queue format:
WORKER_REDIS_API_HOST → HUB_REDIS_URL (part of)
WORKER_WEBSOCKET_AUTH_TOKEN → HUB_AUTH_TOKEN
WORKER_CONNECTORS → WORKER_SERVICES
WORKER_BASE_COMFYUI_PORT → WORKER_COMFYUI_PORT (calculated)
WORKER_BASE_A1111_PORT → WORKER_A1111_PORT (calculated)
```

### Phase 5: Integration Testing

**Goal**: Validate the complete system works end-to-end

#### 5.1 Test Strategy
1. **Build worker release package** 
2. **Deploy to test emp-worker-old instance**
3. **Verify ComfyUI/A1111 connectivity**
4. **Test job processing pipeline**
5. **Validate multi-GPU scaling**

#### 5.2 Test Scenarios
- Single GPU worker processing ComfyUI job
- Multi-GPU workers processing parallel jobs  
- A1111 job processing with progress polling
- Worker restart and reconnection
- Job failure handling and recovery

## Implementation Timeline

### Week 1: Connector Enhancement
- [ ] Enhance ComfyUI connector with WebSocket support
- [ ] Enhance A1111 connector with HTTP polling
- [ ] Test connectors against local services
- [ ] Validate job lifecycle (submit → progress → complete)

### Week 2: Release Infrastructure  
- [ ] Create worker release build script
- [ ] Setup GitHub Actions workflow
- [ ] Create first test release
- [ ] Validate release package format

### Week 3: Script Integration
- [ ] Fork emp-worker-old to worker2 branch
- [ ] Modify setup_redis_workers() function
- [ ] Update worker service script
- [ ] Update environment variable mapping

### Week 4: Testing & Deployment
- [ ] End-to-end integration testing
- [ ] Multi-GPU deployment validation
- [ ] Performance testing under load
- [ ] Production deployment planning

## Success Criteria

1. **Drop-in replacement**: TypeScript workers work with existing emp-worker-old infrastructure
2. **Protocol compatibility**: Proper WebSocket (ComfyUI) and HTTP polling (A1111) communication
3. **Multi-GPU scaling**: Each GPU gets its own worker instance with correct service ports
4. **Job processing**: Complete job lifecycle from submission to completion
5. **Monitoring**: Logs and status monitoring work with existing wgpu script
6. **Reliability**: Workers auto-restart on failure, handle connection issues gracefully

## Risk Mitigation

1. **Incremental rollout**: Test on staging before production
2. **Rollback plan**: Keep Python workers as backup during transition
3. **Monitoring**: Enhanced logging during transition period
4. **Testing**: Comprehensive integration tests before deployment
5. **Documentation**: Clear migration guide for operations team

This plan provides a conservative migration path that preserves all proven infrastructure while upgrading only the job queue technology from Python emp-redis to TypeScript Redis-direct workers.