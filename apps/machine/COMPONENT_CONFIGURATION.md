# Component-Based Machine Configuration

This document explains how to configure machines for specific components and collections, advancing toward the North Star architecture of specialized machine pools.

## Overview

Component-based configuration allows you to:

1. **Specify components**: Define which ComfyUI workflows this machine should support
2. **Install dependencies**: Automatically install required custom nodes and models
3. **Limit capabilities**: Restrict worker to only accept jobs for supported components
4. **Support collections**: Configure multiple components via collection IDs

## Environment Variables

### Component Configuration

```bash
# Option 1: Individual Components
COMPONENTS=txt2img-flux,upscale-esrgan,video-generation

# Option 2: Collections
COLLECTIONS=920b200a-4197-42c0-a9bd-7739bbdc4dfd

# Option 3: Mixed (both components and collections)
COMPONENTS=txt2img-flux
COLLECTIONS=920b200a-4197-42c0-a9bd-7739bbdc4dfd
```

### Required Base Configuration

```bash
# Must include ComfyUI workers for component support
WORKERS=comfyui:1
WORKER_CONNECTORS=comfyui

# API access for component fetching
ECLI_API_URL=http://localhost:3331

# ComfyUI settings
COMFYUI_BASE_PORT=8188
```

### EmProps Custom Nodes Environment

Component-based workflows often use EmProps custom nodes that require cloud storage and API access:

```bash
# Cloud Storage (required for EmProps_Cloud_Storage_Saver)
CLOUD_PROVIDER=azure
AZURE_STORAGE_ACCOUNT=your_storage_account
AZURE_STORAGE_KEY=your_storage_key
CLOUD_STORAGE_CONTAINER=emprops-share
CLOUD_MODELS_CONTAINER=models

# Model Access (required for EmProps_Asset_Downloader)
HF_TOKEN=your_huggingface_token
CIVITAI_TOKEN=your_civitai_token

# AWS (if using AWS cloud provider)
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY_ENCODED=your_aws_secret
AWS_DEFAULT_REGION=us-east-1
```

## How It Works

### 1. Component Analysis

When the machine starts with component configuration:

1. **Component Manager Service** starts during ComfyUI installation
2. **Fetches components** using ECLI tool from the API
3. **Analyzes requirements** from workflow definitions
4. **Extracts custom nodes** needed by workflows
5. **Extracts models** referenced by components

### 2. Dependency Installation

Based on the analysis:

1. **Custom nodes** are installed via ComfyUI installer
2. **Environment files** are created for nodes requiring configuration
3. **Models** are noted for runtime download by EmProps_Asset_Downloader

### 3. Worker Capabilities

Worker capabilities are enhanced with component restrictions:

```json
{
  "worker_id": "worker-gpu0",
  "services": ["comfyui"],
  "supported_components": ["txt2img-flux", "upscale-esrgan"],
  "component_restrictions": {
    "allowed_component_ids": ["19e53d4a-899a-4cc9-b268-bf3823160367"],
    "allowed_component_names": ["txt2img-flux"],
    "custom_nodes": ["emprops_comfy_nodes"],
    "models": ["flux1-dev-fp8.safetensors", "ae.safetensors", ...]
  }
}
```

## Example: txt2img-flux Component

The `txt2img-flux` component automatically configures:

### Custom Nodes
- **emprops_comfy_nodes**: For EmProps cloud integration

### Models (downloaded at runtime)
- **clip_I.safetensors** (0.2GB): Text encoder
- **t5xxl_fp8_e4m3fn.safetensors** (4.9GB): Text encoder  
- **flux1-dev-fp8.safetensors** (17.2GB): Main Flux model
- **ae.safetensors** (0.3GB): VAE decoder

### Environment Configuration
Automatically creates `.env` files for EmProps nodes with cloud storage and API credentials.

## Docker Compose Example

```yaml
version: '3.8'
services:
  component-machine:
    build: .
    environment:
      # Component configuration
      - COMPONENTS=txt2img-flux
      - WORKERS=comfyui:1
      - WORKER_CONNECTORS=comfyui
      
      # API access
      - ECLI_API_URL=http://api:3331
      
      # Cloud storage
      - CLOUD_PROVIDER=azure
      - AZURE_STORAGE_ACCOUNT=${AZURE_STORAGE_ACCOUNT}
      - AZURE_STORAGE_KEY=${AZURE_STORAGE_KEY}
      - CLOUD_STORAGE_CONTAINER=emprops-share
      
      # Model access
      - HF_TOKEN=${HF_TOKEN}
      - CIVITAI_TOKEN=${CIVITAI_TOKEN}
      
      # Machine settings
      - MACHINE_NUM_GPUS=1
      - MACHINE_GPU_MEMORY_GB=16
    volumes:
      - workspace:/workspace
    networks:
      - emp-network

volumes:
  workspace:

networks:
  emp-network:
```

## Component Configuration File

The system generates `/workspace/component-config.json`:

```json
{
  "timestamp": "2025-01-12T10:30:00.000Z",
  "components": [
    {
      "id": "19e53d4a-899a-4cc9-b268-bf3823160367",
      "name": "txt2img-flux",
      "type": "comfy_workflow"
    }
  ],
  "customNodes": ["emprops_comfy_nodes"],
  "models": ["clip_I.safetensors", "t5xxl_fp8_e4m3fn.safetensors", "flux1-dev-fp8.safetensors", "ae.safetensors"],
  "capabilities": {
    "job_service_required_map": ["comfyui"],
    "supported_component_ids": ["19e53d4a-899a-4cc9-b268-bf3823160367"],
    "supported_component_names": ["txt2img-flux"]
  }
}
```

## Benefits

### 1. Specialized Machines
- Machines only install what they need
- Reduced storage and startup time
- Clear capability boundaries

### 2. Job Routing
- Workers can only accept jobs for supported components
- Eliminates incompatible job assignments
- Enables specialized machine pools

### 3. Predictable Setup
- Consistent environment for specific workflows
- Automated dependency resolution
- Reproducible machine configurations

## Next Steps

### Phase 1: Manual Component Configuration ✅
- Environment variable based component specification
- Automatic dependency installation
- Worker capability restrictions

### Phase 2: Collection Support ✅
- Collection ID based configuration
- Multiple components per machine
- Collection-wide dependency analysis

### Phase 3: Dynamic Model Management (Future)
- Predictive model placement
- Cross-machine model sharing
- Intelligent model caching

### Phase 4: ML-Based Pool Optimization (Future)
- Demand-based component grouping
- Automatic pool scaling
- Performance optimization

## Troubleshooting

### Component Not Found
```
❌ Failed to fetch component txt2img-flux: HTTP error! status: 404
```
- Check `ECLI_API_URL` is correct
- Verify component name exists in the API
- Check network connectivity to API server

### Missing Environment Variables
```
⚠️ Environment variable HF_TOKEN not found for emprops_comfy_nodes
```
- Add required environment variables for EmProps custom nodes
- Check `component-example.env` for complete list

### Installation Failures
```
❌ Custom nodes installation failed
```
- Check network connectivity for git clone operations
- Verify all required environment variables are set
- Check disk space for model downloads

### Worker Capability Issues
```
No matching job found - checking Redis logs
```
- Verify component configuration was successful
- Check worker capabilities include component restrictions
- Ensure job specifies supported component ID

## Advanced Configuration

### Custom Node Development
When developing custom nodes for component-based workflows:

1. **Environment Variables**: Use `.env` files for configuration
2. **Model Downloads**: Use EmProps_Asset_Downloader for consistency
3. **Cloud Storage**: Use EmProps_Cloud_Storage_Saver for outputs
4. **Dependencies**: Include `requirements.txt` for Python packages

### Collection Creation
To create collections for component grouping:

1. **Analyze Usage**: Group frequently used components
2. **Dependency Overlap**: Maximize shared custom nodes/models
3. **Hardware Requirements**: Match GPU/memory needs
4. **Performance Characteristics**: Group similar duration jobs

This component-based approach is a crucial step toward the North Star architecture of specialized machine pools with intelligent model management.