# Basic Machine Implementation Plan

## Overview
Two critical components need to be implemented for the basic machine to function as intended:

1. **Health Monitoring System** - Independent service health reporting
2. **ComfyUI Installation & Management** - Complete migration from base-machine logic

---

## Phase 1: Health Monitoring System

### Current Status
- ✅ Health server skeleton created (`src/services/health-server.js`)
- ✅ Port 9090 exposed in Docker configuration
- ✅ Orchestrator integration started
- ❌ Service health reporting incomplete
- ❌ Independent health status (service not installed vs service failed)

### Requirements
The health monitor must be **independent of service implementation**:
- Report when a service is **not installed/configured**
- Report when a service is **installed but not running**  
- Report when a service is **running but unhealthy**
- Report when a service is **healthy and operational**

### Implementation Tasks

#### 1.1 Enhanced Health Server API
- [ ] **Service Discovery**: Dynamically detect which services are configured vs enabled
- [ ] **Health Status Types**: 
  - `not_configured` - Service not enabled in config
  - `not_installed` - Service enabled but installation missing
  - `stopped` - Service installed but not running
  - `starting` - Service in startup process
  - `unhealthy` - Service running but failing health checks
  - `healthy` - Service operational
- [ ] **Detailed Health Endpoints**:
  - `GET /health` - Overall machine health summary
  - `GET /services` - All services with detailed status
  - `GET /services/:service/health` - Individual service health
  - `GET /services/:service/logs` - Recent service logs
  - `GET /ready` - Machine readiness (all enabled services healthy)

#### 1.2 Service Health Integration
- [ ] **Base Service Health**: Update `base-service.js` with standardized health checking
- [ ] **Installation Detection**: Each service reports installation status separately from runtime status
- [ ] **Health Check Framework**: Consistent health check pattern across all services
- [ ] **Dependency Tracking**: Services report their dependencies and dependency health

#### 1.3 Worker Integration
- [ ] **Machine Health Client**: Update worker connectors to use machine health endpoint
- [ ] **Service Availability Waiting**: Workers wait for specific services to be `healthy` before connecting
- [ ] **Graceful Degradation**: Workers handle partial service availability
- [ ] **Health-based Job Acceptance**: Workers only accept jobs for healthy services

---

## Phase 2: ComfyUI Installation & Management

### Current Status
- ❌ No ComfyUI installation logic
- ❌ Missing forked repo handling
- ❌ No custom nodes installation
- ❌ No model management
- ❌ Missing PM2 integration
- ❌ No GPU-specific instance management

### Base Machine Analysis Required
Complete audit of base-machine's ComfyUI setup:

#### 2.1 Installation Logic Migration
- [ ] **Repository Cloning**:
  - Identify ComfyUI fork being used
  - Determine EmProps shared repository requirements
  - Map custom node repositories and versions
- [ ] **Dependency Installation**:
  - Python environment setup
  - Package requirements analysis
  - Custom node dependency handling
- [ ] **Configuration Management**:
  - Model path configuration
  - GPU assignment logic
  - Command line flag analysis

#### 2.2 Per-GPU Instance Management
- [ ] **Instance Isolation**: Separate ComfyUI instance per GPU
- [ ] **Port Management**: Dynamic port assignment (8188 + GPU index)
- [ ] **Process Management**: PM2 integration with proper process naming
- [ ] **Resource Allocation**: GPU memory and CPU thread allocation
- [ ] **Model Sharing**: Shared model directory with per-instance access

#### 2.3 Service Lifecycle Integration
- [ ] **Installation Service**: New service type for ComfyUI installation
- [ ] **Health Checks**: ComfyUI-specific health validation
- [ ] **Startup Coordination**: Ensure installation before service startup
- [ ] **Update Management**: Handle ComfyUI and custom node updates
- [ ] **Cleanup Procedures**: Proper shutdown and resource cleanup

### Detailed Migration Tasks

#### 2.4 ComfyUI Installation Service
```javascript
// New service: src/services/comfyui-installer.js
class ComfyUIInstallerService extends BaseService {
  async installComfyUI() {
    // Clone forked ComfyUI repository
    // Install Python dependencies
    // Setup custom nodes
    // Configure model paths
    // Validate installation
  }
}
```

#### 2.5 ComfyUI Runtime Service Updates
```javascript
// Updated: src/services/comfyui-service.js
class ComfyUIService extends BaseService {
  async validateInstallation() {
    // Check ComfyUI installation
    // Verify custom nodes
    // Validate model access
  }
  
  async buildPM2Config() {
    // Generate PM2 ecosystem file
    // Set proper GPU assignments
    // Configure command line flags
  }
}
```

#### 2.6 Base Machine Code Audit
- [ ] **Locate base-machine ComfyUI setup scripts**
- [ ] **Document installation commands and flags**
- [ ] **Identify custom node list and versions**
- [ ] **Map model download and linking logic**
- [ ] **Extract PM2 configuration patterns**

---

## Implementation Order

### Sprint 1: Health Monitoring Foundation
1. Complete health server API implementation
2. Add service installation detection
3. Update base service health framework
4. Test health endpoints with existing services

### Sprint 2: Worker Health Integration  
1. Update worker connectors to use health endpoint
2. Implement health-based service waiting
3. Add graceful degradation for partial services
4. Test end-to-end worker coordination

### Sprint 3: ComfyUI Analysis & Planning
1. Complete base-machine audit
2. Document all installation steps
3. Design ComfyUI service architecture
4. Plan PM2 integration approach

### Sprint 4: ComfyUI Installation Service
1. Implement ComfyUI installer service
2. Add repository cloning logic
3. Handle custom node installation
4. Setup model management

### Sprint 5: ComfyUI Runtime Integration
1. Update ComfyUI service for PM2
2. Add per-GPU instance management
3. Integrate with health monitoring
4. End-to-end ComfyUI testing

---

## Success Criteria

### Health Monitoring
- [ ] Health endpoint accessible at `localhost:9090`
- [ ] Services report accurate installation status
- [ ] Workers wait for service health before connecting
- [ ] Clear differentiation between not-installed vs unhealthy services

### ComfyUI Integration
- [ ] ComfyUI automatically installed on first run
- [ ] Per-GPU instances running with correct ports
- [ ] PM2 managing ComfyUI processes
- [ ] Custom nodes and models properly configured
- [ ] Workers successfully connect to ComfyUI instances
- [ ] Jobs processed end-to-end through ComfyUI

---

## Risk Mitigation

### Technical Risks
- **Base-machine differences**: Thorough audit before migration
- **PM2 integration complexity**: Start with simple PM2 setup, iterate
- **GPU resource conflicts**: Implement proper resource locking
- **Model storage**: Plan for large model download handling

### Timeline Risks  
- **Unknown base-machine complexity**: Budget extra time for discovery
- **Integration testing**: Plan for extensive end-to-end testing
- **Worker compatibility**: Ensure worker changes don't break existing functionality

---

## Next Steps
1. **Immediate**: Complete health monitoring implementation
2. **Parallel**: Begin base-machine ComfyUI audit
3. **Sequential**: Implement ComfyUI installation after health system stable