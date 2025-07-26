# Production-Test Mode

This is an intermediary deployment mode that combines production-like behavior with local testing capabilities.

## What is Production-Test Mode?

**Production-Test Mode** bridges the gap between local development and full production deployment by providing:

1. **Worker Downloaded from GitHub Releases** (like production)
2. **Production Redis Connection** (remote Redis)
3. **Local Machine Testing** (no ephemeral platform needed)

## Key Features

| Aspect | Development | Production-Test | Production |
|--------|-------------|-----------------|------------|
| Worker Source | Local bundled | GitHub releases | GitHub releases |
| Redis | Local | Remote production | Remote production |
| Environment | Local dev | Local machine | Ephemeral platforms |
| GPU Detection | Manual config | Manual config | Platform-provided |
| Ports | 3190, 9092 | 3199, 9099 | Platform-assigned |

## Usage

### Quick Start

```bash
# Start production-test machine
pnpm machines:basic:prod-test:up:build

# Check status
pnpm machines:basic:prod-test:status

# View logs
pnpm machines:basic:prod-test:logs

# Stop
pnpm machines:basic:prod-test:down
```

### Configuration

The production-test mode uses `.env.local.prod-test` which includes:

- **Production Redis**: Real production Redis connection
- **GitHub Worker Download**: Worker automatically downloaded from releases
- **Production Tokens**: Real HF, CivitAI, API tokens
- **Test Ports**: Different ports to avoid conflicts (3199, 9099)

### Key Differences from Development

1. **No Local Worker Mount**: Worker is downloaded from GitHub releases during startup
2. **Production Redis**: Connects to remote Redis (same as production)
3. **Production Tokens**: Uses real tokens for model downloads
4. **Production Environment**: `NODE_ENV=production`, no test mode

### Key Differences from Production

1. **Local Machine**: Runs on local Docker, not ephemeral platform
2. **Manual GPU Config**: GPU specs set manually, not platform-provided
3. **Different Ports**: Uses 3199/9099 to avoid conflicts with dev (3190/9092)
4. **Local Storage**: Uses local volumes, not ephemeral storage

## Testing Scenarios

### Worker Release Testing
Test that the latest GitHub release worker works correctly:
```bash
# This will download worker from latest GitHub release
pnpm machines:basic:prod-test:up:build

# Check worker downloaded successfully
docker exec basic-machine-prod-test ls -la /tmp/worker_gpu0/

# Check worker process started
docker exec basic-machine-prod-test pm2 logs redis-worker-gpu0
```

### Production Redis Integration
Test that the machine properly connects to production Redis:
```bash
# Check Redis connection
docker exec basic-machine-prod-test redis-cli -u "$HUB_REDIS_URL" ping

# Check machine registered in production Redis
curl -s http://your-production-api/api/monitor/state | jq '.data.machines'
```

### Model Download Testing
Test production model management:
```bash
# Enable model downloads
# Edit .env.local.prod-test: SKIP_MODEL_DOWNLOAD=false

# Start and watch model downloads
pnpm machines:basic:prod-test:up:build
docker logs basic-machine-prod-test -f
```

## Troubleshooting

### Worker Download Issues
```bash
# Check worker download logs
docker exec basic-machine-prod-test pm2 logs redis-worker-gpu0

# Manual worker download test
docker exec basic-machine-prod-test curl -L https://github.com/stakeordie/emp-job-queue/releases/latest/download/emp-job-queue-worker.tar.gz -o /tmp/test-worker.tar.gz
```

### Redis Connection Issues
```bash
# Test Redis connection manually
docker exec basic-machine-prod-test redis-cli -u "$HUB_REDIS_URL" ping

# Check if machine appears in production monitoring
# (Use production monitor UI or API)
```

### Port Conflicts
If ports 3199 or 9099 are in use, edit `.env.local.prod-test`:
```bash
# Change ports in EXPOSED_PORTS
EXPOSED_PORTS=2230:22,8090:80,3200:8188,9100:9090
```

## Integration with Development Workflow

### 1. Development Phase
```bash
pnpm machines:basic:local:up:build  # Local dev with bundled worker
```

### 2. Pre-Production Testing
```bash
pnpm machines:basic:prod-test:up:build  # Test with GitHub worker + prod Redis
```

### 3. Production Deployment
```bash
pnpm prod:up  # Full production with ephemeral machines
```

## When to Use Production-Test Mode

✅ **Use when:**
- Testing worker releases before production deployment
- Debugging production Redis integration issues
- Testing model downloads with production tokens
- Validating production environment variables
- Testing custom nodes with production cloud storage

❌ **Don't use when:**
- Active development (use local dev mode)
- Testing new features (use local dev mode)
- Production workloads (use full production deployment)

## Monitoring

### Health Checks
- **Health endpoint**: `http://localhost:9099/health`
- **ComfyUI**: `http://localhost:3199`
- **Machine logs**: `docker logs basic-machine-prod-test -f`

### Production Integration
The machine will appear in production monitoring alongside real production machines:
- Same Redis connection
- Same machine registration process
- Same worker capabilities and job handling

This allows testing the complete production workflow without needing ephemeral platforms.