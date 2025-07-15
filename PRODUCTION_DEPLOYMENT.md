# Production Deployment Guide

This guide covers deploying the EMP Job Queue system in production with GPU machines that automatically download worker bundles from GitHub releases.

## Architecture Overview

The production deployment consists of:

1. **API Server**: Lightweight API using `emprops/emp-job-queue-api:latest` (published via CI/CD)
2. **Redis**: Shared job broker and state management
3. **GPU Machines**: Full machines with ComfyUI, workers, and custom nodes (builds locally)
4. **Worker Bundles**: Automatically downloaded from GitHub releases

## Quick Start

### 1. Clone and Configure

```bash
git clone https://github.com/stakeordie/emp-job-queue.git
cd emp-job-queue

# Copy environment template
cp apps/machines/basic_machine/.env.production.example apps/machines/basic_machine/.env.production
```

### 2. Edit Configuration

Edit `apps/machines/basic_machine/.env.production` with your settings:

```bash
# Essential settings
HF_TOKEN=your-huggingface-token
CIVITAI_TOKEN=your-civitai-token
WORKER_WEBSOCKET_AUTH_TOKEN=your-secure-token
```

### 3. Deploy

```bash
# Single GPU machine
pnpm prod:up

# Multiple GPU machines  
pnpm prod:multi:up
```

## Architecture Details

### Component Responsibilities

| Component | Image | Purpose | Built By |
|-----------|-------|---------|----------|
| API Server | `emprops/emp-job-queue-api:latest` | Job broker, WebSocket monitoring | CI/CD |
| Redis | `redis:7-alpine` | Job queue, state management | Docker Hub |
| GPU Machines | Local build | ComfyUI, workers, custom nodes | Local Docker |
| Worker Bundle | GitHub release | TypeScript worker with connectors | CI/CD |

### How Worker Download Works

1. **Development**: Worker is bundled locally via `scripts/bundle-worker.sh` and mounted
2. **Production**: Worker is automatically downloaded from GitHub releases on container startup

The GPU machine automatically:
- Downloads latest worker from `https://github.com/stakeordie/emp-job-queue/releases/latest/download/emp-job-queue-worker.tar.gz`
- Extracts to `/tmp/worker_gpu<N>` directories
- Starts worker processes with proper GPU assignment via `CUDA_VISIBLE_DEVICES`

### Custom Nodes Installation

64 custom nodes are pre-installed at Docker build time for fast startup:
- **Build Time**: Custom nodes installed during `docker build` (cached layer)
- **Runtime**: ComfyUI starts immediately with all nodes available
- **No Downloads**: Eliminates 5+ minute startup delays in production

## Configuration

### Environment Variables

#### Core Settings
```bash
# API Server
API_PORT=3001
REDIS_URL=redis://redis:6379

# GPU Machines  
GPU_MACHINE_1_GPUS=1
GPU_MACHINE_1_MEMORY=24
WORKER_CONNECTORS=comfyui,simulation
```

#### Service Toggles
```bash
ENABLE_COMFYUI=true      # ComfyUI per GPU
ENABLE_REDIS_WORKERS=true # TypeScript workers 
ENABLE_A1111=false       # Automatic1111 (optional)
ENABLE_OLLAMA=false      # Local LLM service (optional)
```

#### Model Management
```bash
# Skip model downloads for faster testing
SKIP_MODEL_DOWNLOAD=false

# Tokens for model repositories
HF_TOKEN=your-token
CIVITAI_TOKEN=your-token
```

### GPU Configuration

Configure GPU allocation per machine:

```bash
# Machine 1: Single GPU
GPU_MACHINE_1_GPUS=1
GPU_MACHINE_1_MEMORY=24
GPU_MACHINE_1_MODEL=RTX 4090

# Machine 2: Dual GPU  
GPU_MACHINE_2_GPUS=2
GPU_MACHINE_2_MEMORY=48
GPU_MACHINE_2_MODEL=RTX 4090
```

Each GPU gets:
- Dedicated ComfyUI instance: `comfyui-gpu0`, `comfyui-gpu1`
- Dedicated worker process: `redis-worker-gpu0`, `redis-worker-gpu1`
- Isolated `CUDA_VISIBLE_DEVICES` assignment

## Scaling and Management

### Adding More Machines

To add additional GPU machines, edit `docker-compose.gpu-machines.yml`:

```yaml
# Add gpu-machine-3
gpu-machine-3:
  # Copy gpu-machine-1 config
  # Update ports: 2232:22, 8092:80, 3220:8188, 9102:9090
  # Update environment: MACHINE_ID=gpu-machine-3
```

### Monitoring

#### Health Checks
```bash
# API Server
curl http://localhost:3001/health

# GPU Machine 1
curl http://localhost:9100/health

# GPU Machine 2  
curl http://localhost:9101/health
```

#### Service Status
```bash
# Check all services
docker-compose -f docker-compose.prod.yml -f docker-compose.gpu-machines.yml ps

# GPU machine PM2 status
docker exec gpu-machine-1 pm2 status
```

#### Logs
```bash
# API Server logs
docker-compose logs api

# GPU Machine logs
docker-compose logs gpu-machine-1

# Worker logs (inside GPU machine)
docker exec gpu-machine-1 pm2 logs redis-worker-gpu0
```

### Restart Strategies

#### Rolling Restart (Preserve Jobs)
```bash
# Restart individual GPU machine (jobs return to queue)
docker-compose restart gpu-machine-1

# Restart individual worker (inside machine)
docker exec gpu-machine-1 pm2 restart redis-worker-gpu0
```

#### Full Restart
```bash
# Stop all
docker-compose -f docker-compose.prod.yml -f docker-compose.gpu-machines.yml down

# Start all
docker-compose -f docker-compose.prod.yml -f docker-compose.gpu-machines.yml up -d
```

## Storage and Persistence

### Persistent Volumes

Each GPU machine has dedicated volumes:
```
gpu_machine_1_models     # Model files (2-15GB each)
gpu_machine_1_comfyui    # ComfyUI installation  
gpu_machine_1_data       # Job outputs and temp files
gpu_machine_1_logs       # Service logs
gpu_machine_1_shared     # Shared configurations
```

### Backup Strategy

Critical data to backup:
- **Model files**: `gpu_machine_*_models` volumes (largest, consider cloud storage)
- **Configurations**: `gpu_machine_*_shared` volumes (small, essential)
- **Redis data**: `redis_data` volume (job state, critical)

## Networking

### Internal Communication
- **API ↔ Redis**: `redis://redis:6379`
- **GPU Machines ↔ Redis**: `redis://redis:6379`
- **Workers ↔ ComfyUI**: `http://localhost:8188+gpu_id`

### External Access
- **API Server**: `http://localhost:3001`
- **Monitor UI**: `http://localhost:3333` (if running)
- **GPU Machine 1**: `http://localhost:9100/health`
- **ComfyUI GPU0**: `http://localhost:3200`

## Security Considerations

### Tokens and Secrets
- Store `HF_TOKEN`, `CIVITAI_TOKEN` in secure environment
- Use strong `WORKER_WEBSOCKET_AUTH_TOKEN`
- Consider Docker secrets for production

### Network Security
- Run behind reverse proxy (nginx/traefik)
- Enable TLS termination
- Restrict GPU machine ports to internal network

### Access Control
- SSH disabled by default (`ENABLE_NGINX=false`)
- Health endpoints on internal ports only
- Consider VPN for management access

## Troubleshooting

### Common Issues

#### Worker Not Starting
```bash
# Check worker download
docker exec gpu-machine-1 ls -la /tmp/worker_gpu0/

# Check worker logs
docker exec gpu-machine-1 pm2 logs redis-worker-gpu0

# Manual worker download test
docker exec gpu-machine-1 curl -L https://github.com/stakeordie/emp-job-queue/releases/latest/download/emp-job-queue-worker.tar.gz -o /tmp/test-worker.tar.gz
```

#### ComfyUI Not Responding
```bash
# Check ComfyUI logs
docker exec gpu-machine-1 pm2 logs comfyui-gpu0

# Test ComfyUI directly
curl http://localhost:3200/system_stats
```

#### Custom Nodes Missing
```bash
# Check custom nodes installation
docker exec gpu-machine-1 ls -la /workspace/ComfyUI/custom_nodes/

# Rebuild with fresh custom nodes
docker-compose build --no-cache gpu-machine-1
```

### Performance Tuning

#### Model Caching
- Use cloud storage for model sharing: Set `CLOUD_PROVIDER=aws`
- Pre-warm popular models: Copy to volumes before startup
- Monitor storage usage: `docker system df -v`

#### Resource Allocation
- Adjust `max_memory_restart` in PM2 config for your GPU memory
- Monitor GPU utilization: `nvidia-smi`
- Scale worker instances based on job queue depth

## Advanced Configuration

### Cloud Storage Integration

For model sharing across machines:

```bash
# AWS S3 configuration
CLOUD_PROVIDER=aws
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY_ENCODED=base64-encoded-secret
CLOUD_MODELS_CONTAINER=your-models-bucket
```

### Custom Node Development

To add custom nodes:

1. Edit `apps/machines/basic_machine/config_nodes.json`
2. Rebuild machine image: `docker-compose build gpu-machine-1`
3. Restart: `docker-compose up -d gpu-machine-1`

### Multi-Region Deployment

For distributed deployment:
- Run API server centrally with external Redis
- Deploy GPU machines in multiple regions
- Use cloud storage for model consistency
- Consider Redis Cluster for scale

---

## Support and Development

- **Documentation**: See `docs/` folder for architecture details
- **Local Development**: Use `pnpm dev:full-stack` for testing
- **Issues**: Report at GitHub repository
- **Monitoring**: Access monitor UI during development

This deployment advances toward the north star architecture of specialized machine pools with intelligent model management while providing a production-ready foundation.