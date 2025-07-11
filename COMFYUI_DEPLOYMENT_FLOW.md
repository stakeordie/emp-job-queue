# ComfyUI Deployment Flow - Complete Analysis

## Overview
The base_machine uses a sophisticated multi-step deployment process to install and configure ComfyUI with custom nodes, models, and websocket functionality. This document outlines the complete flow to ensure nothing is missed when implementing ComfyUI in the basic_machine.

## 1. ComfyUI Fork with WebSocket Functionality

### Repository Configuration
- **Fork URL**: `https://github.com/stakeordie/ComfyUI.git`
- **Branch**: `forward` (previously `websocket_version`)
- **Base Commit**: `02a1b01aad28470f06c8b4f95b90914413d3e4c8`
- **Fallback**: `https://github.com/comfyanonymous/ComfyUI.git` (official repo)

### Fork Detection Logic
```bash
# In mgpu script (line 493)
if [ "$repo_url" = "https://github.com/stakeordie/ComfyUI.git" ]; then
    log "Fork detected, checking out forward branch..."
    git checkout forward
else
    log "Using official ComfyUI, checking out specific commit..."
    git checkout "$base_commit"
fi
```

### Key Features of Fork
- Enhanced websocket functionality for real-time communication
- Custom API endpoints for EmProps integration
- Extended model loading capabilities
- Progress tracking improvements

## 2. EmProps Shared Repository Integration

### Repository Details
- **URL**: `https://github.com/stakeordie/emprops_shared.git`
- **Location**: `/workspace/shared`
- **Purpose**: Centralized configuration and custom nodes repository

### SSH Setup for Private Access
```bash
# SSH configuration for GitHub access
Host github.com
    StrictHostKeyChecking no
    IdentityFile /root/.ssh/id_ed25519
```

### Directory Structure
```
/workspace/shared/
├── config_nodes.json          # Production custom nodes config
├── config_nodes_test.json     # Test environment config
├── comfy_dir_config.yaml      # ComfyUI directory configuration
├── custom_nodes/              # Custom node installations
├── models/                    # Shared model storage
│   ├── checkpoints/
│   ├── clip_vision/
│   ├── controlnet/
│   ├── loras/
│   ├── upscale_models/
│   └── vae/
├── workflows/                 # Workflow definitions
└── static-models.json        # Model inventory
```

## 3. Custom Nodes Installation Process

### Configuration File Structure (`config_nodes.json`)
```json
{
  "custom_nodes": [
    {
      "name": "ComfyUI-Manager",
      "url": "git clone https://github.com/Comfy-Org/ComfyUI-Manager.git",
      "requirements": true
    },
    {
      "name": "emprops_comfy_nodes",
      "url": "https://github.com/stakeordie/emprops_comfy_nodes.git",
      "recursive": true,
      "requirements": true,
      "env": {
        "AWS_ACCESS_KEY_ID": "${AWS_ACCESS_KEY_ID}",
        "AWS_SECRET_ACCESS_KEY_ENCODED": "${AWS_SECRET_ACCESS_KEY_ENCODED}",
        "CLOUD_PROVIDER": "${CLOUD_PROVIDER}",
        "HF_TOKEN": "${HF_TOKEN}",
        "CIVITAI_TOKEN": "${CIVITAI_TOKEN}",
        "OLLAMA_HOST": "${OLLAMA_HOST}"
      }
    }
  ]
}
```

### Installation Logic
1. **Config File Selection**: Test mode uses `config_nodes_test.json`, production uses `config_nodes.json`
2. **JSON Validation**: Validates configuration format before processing
3. **Node Processing**: Iterates through each node configuration
4. **Clone/Update**: Clones new nodes or updates existing ones
5. **Requirements Installation**: Installs Python dependencies if specified
6. **Environment Setup**: Configures environment variables for nodes

### Key Custom Nodes
- **ComfyUI-Manager**: Node management interface
- **emprops_comfy_nodes**: EmProps-specific nodes with cloud integration

## 4. Multi-GPU ComfyUI Setup

### GPU Instance Configuration
- **Base Port**: 8188 (configurable via `WORKER_BASE_COMFYUI_PORT`)
- **Port Calculation**: `BASE_PORT + GPU_NUM`
- **Work Directory**: `/workspace/comfyui_gpu{N}`
- **Service Script**: `/etc/init.d/comfyui`

### Service Management
```bash
# Service operations per GPU
/etc/init.d/comfyui start {gpu_id}
/etc/init.d/comfyui stop {gpu_id}  
/etc/init.d/comfyui status {gpu_id}
/etc/init.d/comfyui restart {gpu_id}
```

### Mock GPU Mode
- **Trigger**: `MOCK_GPU=1` or test_gpus parameter
- **Behavior**: Forces `--cpu` mode for testing without GPU hardware
- **Port Mapping**: Still uses GPU-based port calculation

## 5. Directory Configuration (`comfy_dir_config.yaml`)

### Purpose
Defines shared directory paths for ComfyUI model discovery.

### Configuration
```yaml
comfyui:
    base_path: /workspace/shared
    custom_nodes: custom_nodes/
    checkpoints: models/checkpoints/
```

### Usage
- **Parameter**: `--extra-model-paths-config ${ROOT}/shared/comfy_dir_config.yaml`
- **Effect**: ComfyUI automatically discovers models in shared directories
- **Benefit**: Multiple ComfyUI instances share same model storage

## 6. Complete Deployment Flow

### Phase 1: Docker Build (Dockerfile)
1. **Base Image**: PyTorch with CUDA support
2. **System Dependencies**: Git, SSH, build tools
3. **ComfyUI Clone**: Official repo during build
4. **EmProps Shared**: HTTPS clone of shared repository
5. **Script Installation**: Service management scripts

### Phase 2: Container Startup (start.sh)
1. **SSH Setup**: Configure GitHub access keys
2. **Shared Repository**: Update emprops_shared with SSH
3. **Pre-installed Nodes**: Move any pre-built custom nodes
4. **Custom Node Management**: Process config_nodes.json
5. **GPU Instance Setup**: Create per-GPU ComfyUI instances
6. **Service Launch**: Start ComfyUI services per GPU
7. **Health Verification**: Validate all services are running

### Phase 3: Service Operation
1. **Port Management**: Each GPU gets dedicated port
2. **Log Management**: Per-instance logging with rotation
3. **Health Monitoring**: Continuous service health checks
4. **Model Sharing**: Shared model directory across instances
5. **Cleanup Jobs**: Automated output cleanup via cron

## 7. Key Environment Variables

### Core Configuration
- `COMFY_REPO_URL`: Fork repository URL
- `NUM_GPUS`: Number of GPU instances to create
- `WORKER_BASE_COMFYUI_PORT`: Base port for ComfyUI services
- `MOCK_GPU`: Enable CPU-only testing mode
- `STORAGE_TEST_MODE`: Use test configuration files

### Cloud Integration (via emprops_comfy_nodes)
- `AWS_ACCESS_KEY_ID`: AWS credentials
- `CLOUD_PROVIDER`: Cloud storage provider
- `HF_TOKEN`: Hugging Face token
- `CIVITAI_TOKEN`: CivitAI model access
- `OLLAMA_HOST`: Ollama integration

## 8. Logging and Monitoring

### Log Structure
```
/workspace/logs/
├── start.log                  # Main startup log
└── comfyui_gpu{N}/
    └── logs/
        └── output.log         # Per-GPU service logs
```

### Health Checks
1. **Process Check**: Verify PID file and running process
2. **Port Check**: Confirm service listening on expected port
3. **API Check**: Test ComfyUI API responsiveness
4. **Log Analysis**: Check for startup errors or warnings

## 9. Critical Success Factors

### For basic_machine Implementation
1. **Fork Integration**: Must use stakeordie/ComfyUI fork on forward branch
2. **Shared Repository**: Requires emprops_shared for custom nodes and config
3. **SSH Access**: GitHub SSH keys needed for private repository access
4. **Port Management**: Proper port allocation per GPU instance
5. **Directory Sharing**: Correct model path configuration
6. **Environment Variables**: All cloud integration variables properly set
7. **Health Verification**: Comprehensive startup validation

### Potential Issues
1. **SSH Key Access**: Missing or incorrect GitHub SSH keys
2. **Repository Branch**: Wrong branch checkout for ComfyUI fork
3. **Port Conflicts**: Multiple services trying to use same ports
4. **Missing Dependencies**: Custom node requirements not installed
5. **Directory Permissions**: Incorrect permissions on shared directories
6. **Network Access**: Unable to reach GitHub or model repositories

## 10. Migration Considerations

### From base_machine to basic_machine
1. **Simplify Multi-GPU**: basic_machine typically uses single GPU
2. **Streamline Logging**: Less complex logging requirements
3. **Reduce Services**: Fewer concurrent ComfyUI instances
4. **Environment Setup**: Ensure all required environment variables
5. **Health Monitoring**: Adapt health checks for single instance
6. **Port Configuration**: Simplify port management

### Key Files to Port
- `scripts/comfyui` - Service management script
- `scripts/mgpu` - GPU setup logic (adapt for single GPU)
- `comfy_dir_config.yaml` - Directory configuration
- Custom node installation logic from `start.sh`

This comprehensive flow ensures that ComfyUI deployment includes all necessary components: the websocket-enhanced fork, custom nodes from emprops_shared, proper multi-GPU support, and robust health monitoring.