# ComfyUI Migration Checklist

## Research Summary ✅ COMPLETED

Based on the comprehensive codebase analysis, here are the key findings:

### Existing Implementation (Base Machine)
- **Repository**: Uses stakeordie fork with "forward" branch
- **Custom Nodes**: 58 packages defined in `config_nodes.json`
- **Model Management**: Symlink system via `static-models.json`  
- **Environment**: 20+ cloud/service environment variables required
- **Multi-GPU**: Port allocation (8188 + GPU index) with CUDA_VISIBLE_DEVICES
- **PM2 Integration**: Dynamic ecosystem generation per GPU

## Migration Implementation Tasks

### Phase 1: Foundation Setup

#### 1.1 Copy Configuration Files ✅ NEXT
- [ ] Copy `/apps/machines/base_machine/data/shared/config_nodes.json` to basic_machine
- [ ] Copy `/apps/machines/base_machine/data/shared/static-models.json` to basic_machine  
- [ ] Copy `/apps/machines/base_machine/data/shared/comfy_dir_config.yaml` to basic_machine
- [ ] Add ComfyUI environment variables to `.env.local`

#### 1.2 Environment Configuration
- [ ] Add all 20+ EmProps environment variables to docker-compose.yml
- [ ] Configure ComfyUI-specific environment variables:
  ```bash
  ENABLE_COMFYUI=true
  COMFYUI_CPU_ONLY=false
  COMFYUI_PORT_START=8188
  COMFYUI_REPO_URL=https://github.com/stakeordie/ComfyUI.git
  COMFYUI_BRANCH=forward
  COMFYUI_COMMIT=02a1b01aad28470f06c8b4f95b90914413d3e4c8
  ```

### Phase 2: ComfyUI Installer Service

#### 2.1 Create ComfyUI Installer Service
- [ ] Create `src/services/comfyui-installer.js` with base-service inheritance
- [ ] Implement repository cloning logic with fork detection
- [ ] Add branch/commit checkout functionality  
- [ ] Implement Python dependency installation
- [ ] Add custom nodes installation (58 packages)
- [ ] Environment variable injection per node
- [ ] Installation validation and health checks

#### 2.2 Migration from Base Machine Scripts
**Source**: `/apps/machines/base_machine/scripts/`
- [ ] Migrate installation logic from `mgpu` script
- [ ] Port setup logic from `comfyui` script
- [ ] Adapt custom nodes installation from `update_nodes.sh`
- [ ] Integrate model setup logic from `start.sh`

#### 2.3 Installation Features
```javascript
class ComfyUIInstallerService extends BaseService {
  async installComfyUI() {
    // 1. Clone repository (stakeordie/ComfyUI:forward)
    // 2. Install base Python dependencies
    // 3. Install 58 custom nodes with requirements
    // 4. Setup environment variables per node
    // 5. Create model symlinks via static-models.json
    // 6. Validate installation
  }
}
```

### Phase 3: Enhanced ComfyUI Runtime Service

#### 3.1 Update Existing ComfyUI Service
**File**: `src/services/comfyui-service.js`
- [ ] Add installation validation before startup
- [ ] Implement PM2 ecosystem generation per GPU
- [ ] Add GPU assignment logic (CUDA_VISIBLE_DEVICES)
- [ ] Configure port allocation (8188 + GPU index)
- [ ] Add health checks (installation + runtime + functional)

#### 3.2 PM2 Integration
- [ ] Update `pm2-ecosystem.config.cjs` for ComfyUI
- [ ] Dynamic process generation per enabled GPU
- [ ] Proper environment variable injection
- [ ] Resource limits and restart policies

#### 3.3 Multi-GPU Support
```javascript
// Generate PM2 config per GPU
{
  name: `comfyui-gpu${gpuIndex}`,
  script: "main.py", 
  cwd: "/workspace/ComfyUI",
  env: {
    CUDA_VISIBLE_DEVICES: gpuIndex.toString(),
    COMFYUI_PORT: (8188 + gpuIndex).toString(),
    // ... all EmProps environment variables
  },
  args: [
    "--listen", "0.0.0.0",
    "--port", (8188 + gpuIndex).toString(),
    "--extra-model-paths-config", "/workspace/shared/comfy_dir_config.yaml"
  ]
}
```

### Phase 4: Shared Setup Integration

#### 4.1 Update Shared Setup Service
**File**: `src/services/shared-setup-service.js`
- [ ] Add ComfyUI directory creation
- [ ] Setup `comfy_dir_config.yaml` configuration
- [ ] Create model symlinks from `static-models.json`
- [ ] Ensure proper permissions for ComfyUI access

#### 4.2 Model Management
- [ ] Implement model symlink creation logic
- [ ] Handle model directory structure:
  ```
  /workspace/shared/
  ├── models/checkpoints/     # ComfyUI symlinks
  ├── models/loras/          # LoRA models
  ├── models/controlnet/     # ControlNet models
  ├── sd_models/Stable-diffusion/  # Actual storage
  └── custom_nodes/          # Custom nodes
  ```

### Phase 5: Health Monitoring Integration

#### 5.1 Health Server Enhancement  
**File**: `src/services/health-server.js`
- [ ] Add ComfyUI installation status endpoint
- [ ] Add per-GPU instance health endpoints
- [ ] Add functional health checks (API responsiveness)
- [ ] Add model availability validation

#### 5.2 Health Check Endpoints
```javascript
GET /health/comfyui                    # Overall ComfyUI health
GET /health/comfyui/installation       # Installation status
GET /health/comfyui/instances          # All GPU instances  
GET /health/comfyui/instances/:gpu     # Specific GPU instance
GET /health/comfyui/models             # Model availability
```

### Phase 6: Startup Orchestration

#### 6.1 Service Startup Sequence
1. **shared-setup** - Create directories, config files, model symlinks
2. **comfyui-installer** - Install ComfyUI if not present  
3. **comfyui-service** - Start per-GPU instances via PM2
4. **health validation** - Wait for all instances healthy
5. **redis-worker** - Start workers after ComfyUI ready

#### 6.2 Integration Points
- [ ] Update `src/index-pm2.js` for service dependencies
- [ ] Add ComfyUI to service orchestration logic
- [ ] Configure service startup order
- [ ] Add proper error handling and retries

### Phase 7: Configuration Files Setup

#### 7.1 Copy Required Configuration Files
**From base_machine to basic_machine:**

```bash
# Configuration files to copy
cp base_machine/data/shared/config_nodes.json basic_machine/data/shared/
cp base_machine/data/shared/static-models.json basic_machine/data/shared/
cp base_machine/data/shared/comfy_dir_config.yaml basic_machine/data/shared/
```

#### 7.2 Environment Variables
Add to `docker-compose.yml`:
```yaml
environment:
  # ComfyUI Configuration
  - ENABLE_COMFYUI=${ENABLE_COMFYUI}
  - COMFYUI_CPU_ONLY=${COMFYUI_CPU_ONLY}
  - COMFYUI_PORT_START=${COMFYUI_PORT_START}
  
  # EmProps Cloud Integration (20+ variables)
  - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
  - CLOUD_PROVIDER=${CLOUD_PROVIDER}
  - HF_TOKEN=${HF_TOKEN}
  - CIVITAI_TOKEN=${CIVITAI_TOKEN}
  - OLLAMA_HOST=${OLLAMA_HOST}
  # ... (full list from research)
```

## Implementation Priority

### Sprint 1: Foundation (1-2 days)
1. Copy configuration files ✅ **START HERE**
2. Add environment variables
3. Create ComfyUI installer service skeleton
4. Plan PM2 integration approach

### Sprint 2: Installation Logic (2-3 days)  
1. Implement repository cloning
2. Add Python dependency installation
3. Custom nodes installation logic
4. Environment variable injection

### Sprint 3: Runtime Integration (2-3 days)
1. Enhance ComfyUI service for PM2
2. Multi-GPU instance management
3. Health check implementation
4. Startup orchestration

### Sprint 4: Testing & Validation (1-2 days)
1. End-to-end installation testing
2. Multi-GPU functionality
3. Worker integration
4. Job processing validation

## Risk Mitigation

### Technical Risks
- **Installation Complexity**: Start with minimal setup, add features incrementally
- **Custom Node Dependencies**: Robust error handling for node installation failures  
- **Environment Variables**: Validate all required variables before installation
- **Model Storage**: Ensure adequate disk space for models and nodes

### Testing Strategy
- **Fresh Container Testing**: Validate installation on clean containers
- **Multi-GPU Testing**: Test with different GPU configurations
- **Error Scenarios**: Test installation failures and recovery
- **Performance Testing**: Monitor startup times and resource usage

## Success Criteria
- [ ] ComfyUI installs automatically when `ENABLE_COMFYUI=true`
- [ ] Multiple GPU instances start with correct port allocation
- [ ] All 58 custom nodes install successfully
- [ ] Workers connect successfully to ComfyUI instances
- [ ] Health endpoints report accurate status
- [ ] End-to-end job processing works

---

## Next Steps
1. **Immediate**: Copy configuration files from base_machine
2. **Today**: Implement ComfyUI installer service skeleton
3. **This Sprint**: Complete installation logic and testing