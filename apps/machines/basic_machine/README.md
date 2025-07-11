# Basic Machine

A modern, Node.js-based GPU infrastructure machine that replaces the legacy bash-based `base_machine` with improved reliability, observability, and maintainability.

## Overview

Basic Machine provides the same AI service infrastructure as `base_machine` but with:

- **Node.js orchestration** instead of 2600-line bash script
- **Parallel service startup** for faster boot times  
- **Structured logging** with Winston
- **Health monitoring** with automatic recovery
- **Modular architecture** for easier maintenance

## Quick Start

### Development Mode (with local worker)

```bash
# Run with local worker build (no GitHub download)
./run-dev.sh
```

This automatically builds the worker locally and mounts it into the container. See [DEV_MODE.md](./DEV_MODE.md) for details.

### Production Mode

```bash
# Copy and configure environment
cp .env.example .env.local.prod
nano .env.local.prod

# Run with worker downloaded from GitHub releases
./run.sh
```

### Local Node.js (without Docker)

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env.local

# Edit .env.local with your configuration
nano .env.local

# Start services
npm start
```

## Architecture

```
Service Orchestrator
├── GPU Manager (allocates GPU resources)
├── Port Manager (manages port allocation)
├── Health Manager (monitors service health)
└── Services
    ├── NGINX (reverse proxy)
    ├── ComfyUI (per-GPU instances)
    ├── Automatic1111 (per-GPU instances)
    ├── Redis Workers (per-GPU instances)
    └── Ollama (single instance)
```

## Configuration

Configuration is managed through environment variables. See `.env.example` for all available options.

### Key Configuration

```env
# GPU Configuration
NUM_GPUS=1
GPU_MEMORY_GB=16

# Redis Configuration  
HUB_REDIS_URL=redis://default:password@host:port
WORKER_WEBSOCKET_AUTH_TOKEN=your-auth-token

# Service Ports
COMFYUI_BASE_PORT=8188
A1111_BASE_PORT=3001
```

## Health Monitoring

The machine exposes health endpoints on port 9090:

- `GET /health` - Overall system health
- `GET /status` - Detailed service status
- `GET /ready` - Simple readiness check

Example:
```bash
curl http://localhost:9090/health
```

## Services

### Redis Workers

- One worker per GPU
- Connects to central Redis queue
- Processes AI generation jobs
- Auto-downloads latest release

### ComfyUI

- One instance per GPU
- Base port 8188 (increments per GPU)
- Accessible via NGINX routing

### Automatic1111

- One instance per GPU  
- Base port 3001 (increments per GPU)
- Accessible via NGINX routing

### NGINX

- Reverse proxy for all services
- Handles authentication
- Routes requests to appropriate GPU

### Ollama

- Language model service
- Single instance on port 11434

## Development

### Project Structure

```
src/
├── index.js           # Entry point
├── orchestrator.js    # Service coordination
├── config/           # Configuration
├── services/         # Service implementations
├── managers/         # Cross-cutting concerns
└── utils/           # Utilities
```

### Adding a New Service

1. Create service class extending `BaseService`
2. Implement `onStart()`, `onStop()`, and `onHealthCheck()`
3. Add to service configuration
4. Import in orchestrator

Example:
```javascript
export default class MyService extends BaseService {
  async onStart() {
    // Start your service
  }
  
  async onStop() {
    // Stop your service
  }
  
  async onHealthCheck() {
    // Return true if healthy
    return true;
  }
}
```

### Testing

```bash
# Run tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

## Monitoring

### Logs

Logs are structured JSON and written to:
- Console (colorized in development)
- `/workspace/logs/basic-machine-YYYY-MM-DD.log`
- `/workspace/logs/error-YYYY-MM-DD.log`

### Metrics

Coming soon - Prometheus metrics export

## Migration from base_machine

Basic Machine is designed to be a drop-in replacement:

1. Uses same environment variables
2. Exposes same ports
3. Creates same directory structure
4. Compatible with existing workflows

To migrate:
1. Update docker image to `basic-machine`
2. Copy environment variables
3. Start services

## Troubleshooting

### Service Won't Start

Check logs for specific error:
```bash
docker logs <container> | grep ERROR
```

### Worker Connection Issues

Verify Redis URL:
```bash
curl http://localhost:9090/status | jq '.services["redis-worker-gpu0"]'
```

### GPU Not Detected

Check CUDA_VISIBLE_DEVICES:
```bash
docker exec <container> nvidia-smi
```

## Contributing

1. Follow existing code style
2. Add tests for new features
3. Update documentation
4. Submit PR with description

## License

MIT