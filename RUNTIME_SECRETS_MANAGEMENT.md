# Runtime Secrets Management

This document explains how secrets are handled differently between build-time and runtime to ensure security in production deployments.

## Problem Statement

Custom nodes (especially `emprops_custom_nodes`) need access to secrets like:
- Azure Storage keys
- AWS credentials  
- API tokens (HF_TOKEN, CIVITAI_TOKEN, OpenAI)

However, we **don't want these secrets baked into Docker images** for security reasons.

## Solution: Build-Time vs Runtime Separation

### Build-Time (Docker Build)
- **Purpose**: Install custom nodes and dependencies
- **Secrets**: Minimal secrets only for installation (if needed)
- **Location**: Docker build args (not persisted in image)
- **Security**: Build-time secrets are not stored in final image

### Runtime (Container Startup)  
- **Purpose**: Configure services with production secrets
- **Secrets**: Full production secrets provided by platform
- **Location**: Environment variables from platform
- **Security**: Secrets never stored in image, only in memory

## Implementation

### 1. Runtime Environment Creator Service

The `RuntimeEnvCreatorService` runs at container startup (Phase 1.5) and:

1. **Reads runtime environment variables** (provided by platform)
2. **Creates `.env` files** for custom nodes that need them
3. **Runs before ComfyUI starts** so nodes have access to secrets

```javascript
// Creates: /workspace/ComfyUI/custom_nodes/emprops_custom_nodes/.env
await this.createEmPropsCustomNodeEnv();
```

### 2. Custom Node .env Creation

For `emprops_custom_nodes`, creates a `.env` file with:

```bash
# Runtime environment variables created by emp-job-queue
# Generated at: 2025-01-15T10:30:00.000Z

AZURE_STORAGE_ACCOUNT="empstartupstore"
AZURE_STORAGE_KEY="y+ToFQaE0JnG..."
AWS_ACCESS_KEY_ID="AKIA3Z6A..."
AWS_SECRET_ACCESS_KEY="decoded-secret"
HF_TOKEN="hf_vCSmZlOo..."
CIVITAI_TOKEN="5285f9f4..."
CLOUD_PROVIDER="azure"
CLOUD_MODELS_CONTAINER="emprops-models"
```

### 3. Platform Integration

#### SALAD/vast.ai Deployment
The platform provides secrets as environment variables:

```bash
# Platform sets these at container runtime
export HF_TOKEN="hf_actualtoken"
export AZURE_STORAGE_KEY="actualkey"
export AWS_ACCESS_KEY_ID="actualkey"
# etc.
```

#### Local Testing
Use `.env.local.prod-test` with real secrets for testing:

```bash
# Test runtime secret creation locally
pnpm machines:basic:prod-test:up:build
```

## Security Benefits

### ✅ Secrets Never in Images
- Docker images contain no production secrets
- Images can be shared/stored safely
- No risk of secret exposure through image inspection

### ✅ Runtime-Only Access
- Secrets only exist in container memory
- Secrets are provided fresh by platform each deployment
- No persistent secret storage

### ✅ Granular Secret Control
- Different environments get different secrets
- Platform controls which secrets each deployment receives
- Easy secret rotation without image rebuilds

## File Structure

```
/workspace/ComfyUI/custom_nodes/
├── emprops_custom_nodes/
│   ├── .env                    # ← Created at runtime
│   ├── __init__.py
│   └── ...
├── ComfyUI-Manager/
│   ├── .env                    # ← Created at runtime (if needed)
│   └── ...
└── other-nodes/
```

## Development Workflow

### 1. Local Development
```bash
# Uses bundled worker + local Redis + mounted secrets
pnpm machines:basic:local:up:build
```

### 2. Production Testing  
```bash
# Uses GitHub worker + prod Redis + real secrets
pnpm machines:basic:prod-test:up:build
```

### 3. Production Deployment
```bash
# Platform provides all secrets at runtime
# Image contains no secrets
docker run -e HF_TOKEN=... -e AZURE_STORAGE_KEY=... emprops/gpu-machine:latest
```

## Platform Configuration Examples

### SALAD Configuration
```yaml
environment:
  HF_TOKEN: "hf_actualproductiontoken"
  CIVITAI_TOKEN: "actualproductiontoken"
  AZURE_STORAGE_ACCOUNT: "empstartupstore"
  AZURE_STORAGE_KEY: "actualproductionkey"
  AWS_ACCESS_KEY_ID: "AKIA..."
  AWS_SECRET_ACCESS_KEY_ENCODED: "base64encodedkey"
  CLOUD_PROVIDER: "azure"
  CLOUD_MODELS_CONTAINER: "emprops-models"
  NUM_GPUS: "2"                    # Auto-set by platform
  GPU_MEMORY_GB: "48"              # Auto-set by platform  
  GPU_MODEL: "RTX 4090"            # Auto-set by platform
```

### vast.ai Configuration
```bash
# Environment variables set by vast.ai
HF_TOKEN=hf_actualtoken
AZURE_STORAGE_KEY=actualkey
NUM_GPUS=1                         # Based on allocated hardware
GPU_MEMORY_GB=24                   # Based on allocated hardware
GPU_MODEL=RTX 3090                 # Based on allocated hardware
```

## Debugging

### Check Runtime .env Creation
```bash
# Verify .env files were created
docker exec gpu-machine-1 ls -la /workspace/ComfyUI/custom_nodes/emprops_custom_nodes/.env

# View created .env content
docker exec gpu-machine-1 cat /workspace/ComfyUI/custom_nodes/emprops_custom_nodes/.env
```

### Check Service Logs
```bash
# Check runtime-env-creator service
docker exec gpu-machine-1 pm2 logs runtime-env-creator

# Check if secrets are available to custom nodes
docker exec gpu-machine-1 pm2 logs comfyui-gpu0
```

### Manual Testing
```bash
# Test secret availability in custom node environment
docker exec gpu-machine-1 bash -c "cd /workspace/ComfyUI/custom_nodes/emprops_custom_nodes && python -c 'import os; print(os.environ.get(\"AZURE_STORAGE_KEY\"))'"
```

## Security Best Practices

### ✅ Do
- Use platform environment variables for secrets
- Create `.env` files at runtime only
- Clean up `.env` files on container shutdown (optional)
- Rotate secrets regularly through platform

### ❌ Don't  
- Put production secrets in Docker build args
- Commit secrets to git repositories
- Store secrets in Docker images
- Use the same secrets across environments

## Migration from Build-Time Secrets

If you currently have secrets in Docker build:

1. **Remove from Dockerfile**: Remove `ARG` and `ENV` for secrets
2. **Add to Runtime**: Move secrets to platform environment variables
3. **Update Custom Nodes**: Ensure they read from `.env` files
4. **Test**: Verify runtime `.env` creation works

This approach ensures production security while maintaining development convenience.