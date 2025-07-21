# ComfyUI Installation Plan - Basic Machine

## Overview

This plan outlines the complete implementation of ComfyUI installation and management for the basic-machine architecture. This follows the **Phase 2: ComfyUI Installation & Management** from the main IMPLEMENTATION_PLAN.md.

## Current Status

- ✅ Service badge debugging completed (worker shows both simulation + comfyui services)  
- ✅ Worker capabilities correctly configured with simulation,comfyui
- ✅ Local worker bundle mounting working for development
- ❌ ComfyUI service not installed/configured
- ❌ ComfyUI connector fails with ECONNREFUSED (expected - service not running)
- ❌ No ComfyUI installation logic implemented

## Goals

### Primary Objectives
1. **Install ComfyUI automatically** on container startup when `ENABLE_COMFYUI=true`
2. **Configure per-GPU instances** with proper port allocation (8188 + GPU index)
3. **Integrate with PM2** for process management and monitoring
4. **Handle custom nodes** and model management
5. **Provide health checks** that report installation and runtime status
6. **Enable workers** to connect successfully to ComfyUI instances

### Success Criteria
- [ ] ComfyUI installed automatically when enabled
- [ ] Multiple GPU instances running on different ports (8188, 8189, etc.)
- [ ] PM2 managing ComfyUI processes with proper naming
- [ ] Worker connectors successfully connect to ComfyUI
- [ ] Health endpoint reports ComfyUI status accurately
- [ ] End-to-end job processing through ComfyUI

## Implementation Strategy

### Phase 1: Research & Analysis (Current Phase)
**Objective**: Understand existing ComfyUI implementations and requirements

#### 1.1 Base Machine Audit
- [ ] **Locate base-machine ComfyUI setup** (if available in codebase)
- [ ] **Document installation commands** and dependencies
- [ ] **Identify custom node requirements** for EmProps
- [ ] **Map model download logic** and storage patterns
- [ ] **Extract PM2 configuration** patterns

#### 1.2 Requirements Analysis
- [ ] **GPU allocation strategy** (how many instances per machine)
- [ ] **Port management** (8188 + GPU index pattern)
- [ ] **Model sharing** between instances
- [ ] **Custom node list** required for EmProps workflows
- [ ] **Configuration management** (command line flags, config files)

#### 1.3 Architecture Design
- [ ] **Service lifecycle design** (installer → runtime → health checks)
- [ ] **PM2 integration approach** (ecosystem file generation)
- [ ] **Health check strategy** (installation vs runtime vs functional)
- [ ] **Error handling patterns** (installation failures, runtime crashes)

### Phase 2: ComfyUI Installer Service
**Objective**: Implement automated ComfyUI installation

#### 2.1 ComfyUI Installer Service
```javascript
// New file: src/services/comfyui-installer.js
class ComfyUIInstallerService extends BaseService {
  async onStart() {
    // Check if ComfyUI already installed
    // Clone ComfyUI repository (or specific fork)
    // Install Python dependencies
    // Install custom nodes
    // Configure model paths
    // Validate installation
  }
}
```

#### 2.2 Installation Logic
- [ ] **Repository cloning** (ComfyUI main or EmProps fork)
- [ ] **Python environment** setup and dependency installation
- [ ] **Custom nodes installation** from specified list
- [ ] **Model directory** configuration and symlink setup
- [ ] **Installation validation** (verify ComfyUI can start)

#### 2.3 Configuration Management
- [ ] **Environment variables** for ComfyUI configuration
- [ ] **Model path mapping** to shared directories
- [ ] **Custom node list** management
- [ ] **GPU-specific configuration** per instance

### Phase 3: ComfyUI Runtime Service Enhancement
**Objective**: Update existing ComfyUI service for production use

#### 3.1 Enhanced ComfyUI Service
```javascript
// Update: src/services/comfyui-service.js
class ComfyUIService extends BaseService {
  async validateInstallation() {
    // Check ComfyUI installation exists
    // Verify custom nodes are installed
    // Validate model directory access
  }
  
  async generatePM2Config() {
    // Create PM2 ecosystem entry for this GPU
    // Set proper GPU assignments (CUDA_VISIBLE_DEVICES)
    // Configure command line flags
    // Set port based on GPU index
  }
}
```

#### 3.2 PM2 Integration
- [ ] **Dynamic PM2 configuration** generation per GPU
- [ ] **Process naming** convention (comfyui-gpu0, comfyui-gpu1, etc.)
- [ ] **GPU assignment** via CUDA_VISIBLE_DEVICES
- [ ] **Port allocation** (8188 + GPU index)
- [ ] **Resource limits** and restart policies

#### 3.3 Health Checks
- [ ] **Installation health** (ComfyUI files exist, dependencies installed)
- [ ] **Runtime health** (process running, port responsive)
- [ ] **Functional health** (API endpoints responding correctly)
- [ ] **Model health** (required models accessible)

### Phase 4: Service Orchestration Integration
**Objective**: Integrate ComfyUI with machine startup flow

#### 4.1 Startup Sequence
1. **Shared setup** (model directories, permissions)
2. **ComfyUI installation** (if not already installed)
3. **ComfyUI instances** (start per enabled GPU)
4. **Health validation** (wait for all instances healthy)
5. **Worker startup** (after ComfyUI healthy)

#### 4.2 Environment Configuration
```bash
# .env.local
ENABLE_COMFYUI=true
NUM_GPUS=2
COMFYUI_CPU_ONLY=false  # for development
COMFYUI_PORT_START=8188
COMFYUI_CUSTOM_NODES="node1,node2,node3"
COMFYUI_MODELS_PATH=/workspace/shared/models
```

#### 4.3 Health Server Integration
- [ ] **ComfyUI status endpoints** in health server
- [ ] **Installation progress** reporting
- [ ] **Per-instance health** monitoring
- [ ] **Service dependency** tracking

## Implementation Tasks

### Sprint 1: Research & Setup (Current)
**Duration**: 1-2 days
**Focus**: Understanding requirements and designing architecture

#### Tasks:
1. [ ] **Audit existing ComfyUI implementations**
   - Search codebase for ComfyUI setup scripts
   - Identify EmProps-specific requirements
   - Document installation dependencies

2. [ ] **Design service architecture**
   - Installer service responsibilities
   - Runtime service enhancements
   - Health check integration
   - PM2 configuration strategy

3. [ ] **Plan environment configuration**
   - Required environment variables
   - Configuration file patterns
   - Port allocation strategy
   - GPU assignment logic

4. [ ] **Create implementation checklist**
   - Break down into specific code changes
   - Identify testing requirements
   - Plan integration steps

### Sprint 2: Installer Implementation
**Duration**: 2-3 days
**Focus**: Automated ComfyUI installation

#### Tasks:
1. [ ] **Create ComfyUIInstallerService**
   - Repository cloning logic
   - Python dependency installation
   - Custom node installation
   - Installation validation

2. [ ] **Add installation configuration**
   - Environment variable handling
   - Custom node list management
   - Model path configuration
   - Installation status tracking

3. [ ] **Test installation process**
   - Fresh container installation
   - Installation validation
   - Error handling testing
   - Installation status reporting

### Sprint 3: Runtime Integration
**Duration**: 2-3 days
**Focus**: PM2 integration and multi-GPU support

#### Tasks:
1. [ ] **Enhance ComfyUIService**
   - Installation validation
   - PM2 configuration generation
   - GPU-specific instance management
   - Port allocation per GPU

2. [ ] **PM2 ecosystem integration**
   - Dynamic configuration generation
   - Process naming conventions
   - GPU assignment logic
   - Resource allocation

3. [ ] **Health check implementation**
   - Installation status checks
   - Runtime health monitoring
   - API endpoint validation
   - Model accessibility checks

### Sprint 4: End-to-End Testing
**Duration**: 1-2 days
**Focus**: Full integration testing

#### Tasks:
1. [ ] **Integration testing**
   - Full machine startup with ComfyUI
   - Multi-GPU instance testing
   - Worker connection testing
   - Job processing end-to-end

2. [ ] **Error scenario testing**
   - Installation failure handling
   - Instance crash recovery
   - Port conflict resolution
   - GPU allocation conflicts

3. [ ] **Performance validation**
   - Startup time measurement
   - Resource usage monitoring
   - Concurrent job handling
   - System stability testing

## Technical Specifications

### ComfyUI Installation Requirements
```bash
# Repository
COMFYUI_REPO="https://github.com/comfyanonymous/ComfyUI.git"
COMFYUI_INSTALL_PATH="/workspace/ComfyUI"

# Python Dependencies
python3 -m pip install torch torchvision torchaudio --extra-index-url https://download.pytorch.org/whl/cu121
python3 -m pip install -r requirements.txt

# Custom Nodes (EmProps specific)
# TBD: Identify from base-machine or EmProps requirements
```

### PM2 Configuration Pattern
```javascript
// Generated PM2 ecosystem entry per GPU
{
  name: `comfyui-gpu${gpuIndex}`,
  script: "main.py",
  cwd: "/workspace/ComfyUI",
  env: {
    CUDA_VISIBLE_DEVICES: gpuIndex.toString(),
    COMFYUI_PORT: (8188 + gpuIndex).toString()
  },
  args: [
    "--listen", "0.0.0.0",
    "--port", (8188 + gpuIndex).toString(),
    "--output-directory", "/workspace/shared/outputs",
    "--input-directory", "/workspace/shared/inputs"
  ],
  restart_delay: 5000,
  max_restarts: 10
}
```

### Health Check Endpoints
```javascript
// Health server endpoints
GET /health/comfyui                    # Overall ComfyUI health
GET /health/comfyui/installation       # Installation status
GET /health/comfyui/instances          # All GPU instances
GET /health/comfyui/instances/:gpu     # Specific GPU instance
GET /health/comfyui/models             # Model availability
```

## Risk Mitigation

### Technical Risks
1. **Installation complexity** - Start with minimal ComfyUI setup, add features incrementally
2. **GPU resource conflicts** - Implement proper GPU assignment validation
3. **Port conflicts** - Dynamic port allocation with conflict detection
4. **Model storage** - Plan for large model downloads and sharing
5. **Custom node dependencies** - Robust dependency installation with error handling

### Integration Risks
1. **PM2 complexity** - Test PM2 configuration thoroughly before integration
2. **Worker compatibility** - Ensure ComfyUI changes don't break existing worker functionality
3. **Health check reliability** - Implement comprehensive health validation
4. **Startup time** - Monitor and optimize startup sequence performance

## Success Metrics

### Installation Metrics
- [ ] **Installation success rate** > 95% on fresh containers
- [ ] **Installation time** < 5 minutes for full setup
- [ ] **Error recovery** handles common installation failures

### Runtime Metrics
- [ ] **Instance startup time** < 30 seconds per GPU
- [ ] **Health check response** < 1 second for all endpoints
- [ ] **Worker connection success** > 99% when ComfyUI healthy

### Performance Metrics
- [ ] **Job processing** successful end-to-end through ComfyUI
- [ ] **Multi-GPU utilization** scales properly with job load
- [ ] **System stability** runs for 24+ hours without issues

## Next Steps

1. **Immediate** (Today): Begin ComfyUI research and architecture design
2. **Phase 1** (1-2 days): Complete requirements analysis and design
3. **Phase 2** (2-3 days): Implement ComfyUI installer service
4. **Phase 3** (2-3 days): Enhance runtime service and PM2 integration
5. **Phase 4** (1-2 days): End-to-end testing and validation

---

## Notes

- This plan builds on the successful service badge debugging work
- Workers already configured for comfyui connector - ready for integration
- Focus on minimal viable implementation first, then enhance features
- Maintain compatibility with existing worker and job queue architecture