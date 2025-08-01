# Production Test Environment

The Production Test Environment provides a production-like setup for testing the EMP Job Queue system locally. This environment simulates production conditions while maintaining local control for debugging and validation.

## Overview

The prod-test environment includes:
- **Local Redis**: Isolated database with production-like settings
- **API Server**: Production build with debug logging
- **Webhook Service**: Full webhook processing and delivery system
- **Monitor Dashboard**: Web-based monitoring and job submission
- **Mock GPU Support**: Simulated GPU resources for testing

## Quick Start

### Prerequisites
- Docker and Docker Compose
- pnpm (for building)
- Node.js 20+

### Start Environment
```bash
./scripts/start-prod-test.sh
```

### Stop Environment
```bash
./scripts/stop-prod-test.sh
```

## Configuration Details

### Environment Profile
The prod-test environment uses the `prod-test.json` profile located in `config/environments/profiles/`. This profile configures all components with production-like settings optimized for testing.

### Component Configurations

#### API Server
- **Port**: 3331
- **Log Level**: debug
- **Max Pending Jobs**: 1000 (reduced from production)
- **Job Cleanup**: 10 minutes (faster than production)
- **CORS**: Configured for local development

#### Webhook Service
- **Port**: 3332
- **Log Level**: debug
- **Timeout**: 15 seconds (reduced for faster testing)
- **Max Retries**: 2 (reduced from production)
- **Full webhook delivery pipeline**: notifications, retries, storage

#### Redis
- **Port**: 6379 (standard)
- **Database**: 1 (separate from local development)
- **Max Connections**: 20
- **Memory Policy**: LRU eviction with 256MB limit

#### Monitor
- **Port**: 3333
- **Connections**: Configured for local API and webhook service
- **Enhanced logging**: For debugging webhook flows

### Mock GPU Mode
The prod-test environment includes mock GPU support for testing ComfyUI workflows without requiring actual GPU hardware:
- Simulated GPU resources
- Reduced installation times
- Custom nodes disabled for faster startup
- Resource binding set to `mock_gpu`

## Testing Workflows

### 1. Basic Health Checks
```bash
# API Server
curl http://localhost:3331/health

# Webhook Service
curl http://localhost:3332/health

# Redis connectivity
redis-cli -p 6379 ping
```

### 2. Job Submission Testing
1. Open Monitor: http://localhost:3333
2. Submit a test job through the UI
3. Watch real-time progress in the job dashboard
4. Verify webhook notifications in the webhook test panel

### 3. Webhook Testing
1. Navigate to Webhook Test tab in Monitor
2. Create a test webhook receiver
3. Register webhooks for different event types
4. Submit jobs and verify webhook deliveries
5. Test webhook retry mechanisms by using invalid URLs

### 4. End-to-End Integration Testing
```bash
# Example: Submit a job via API and verify webhook delivery
curl -X POST http://localhost:3331/submit-job \
  -H "Content-Type: application/json" \
  -d '{
    "service_required": "simulation",
    "payload": {"test": "data"},
    "priority": 100
  }'
```

## Directory Structure

```
config/environments/
├── profiles/prod-test.json           # Main environment profile
├── components/
│   ├── api.env                       # API configurations with [prod-test] section
│   ├── webhook-service.env           # Webhook service configurations
│   ├── redis.env                     # Redis configurations
│   ├── monitor.env                   # Monitor configurations
│   ├── machine.env                   # Machine configurations
│   ├── worker.env                    # Worker configurations
│   └── comfyui.env                   # ComfyUI mock configurations
scripts/
├── start-prod-test.sh                # Environment startup script
└── stop-prod-test.sh                 # Environment shutdown script
docker-compose.prod-test.yml          # Docker Compose configuration
```

## Differences from Production

| Component | Production | Prod-Test | Reason |
|-----------|------------|-----------|---------|
| **Logging** | `info` | `debug` | Enhanced debugging |
| **Redis** | External service | Local container | Isolation and control |
| **Job Limits** | 10000 | 1000 | Faster testing cycles |
| **Timeouts** | 30s webhooks | 15s webhooks | Faster failure detection |
| **Retries** | 3 attempts | 2 attempts | Reduced test time |
| **GPU** | Real hardware | Mock mode | Testing without GPU dependency |
| **Custom Nodes** | Full installation | Disabled | Faster startup |

## Debugging

### Service Logs
```bash
# View all logs
docker-compose -f docker-compose.prod-test.yml logs -f

# View specific service logs
docker-compose -f docker-compose.prod-test.yml logs -f api
docker-compose -f docker-compose.prod-test.yml logs -f webhook-service
docker-compose -f docker-compose.prod-test.yml logs -f redis
```

### Redis Inspection
```bash
# Connect to Redis
redis-cli -p 6379

# Switch to prod-test database
SELECT 1

# View all keys
KEYS *

# Monitor Redis commands
MONITOR
```

### Container Status
```bash
# View running containers
docker-compose -f docker-compose.prod-test.yml ps

# Restart a service
docker-compose -f docker-compose.prod-test.yml restart webhook-service

# Rebuild and restart
docker-compose -f docker-compose.prod-test.yml up -d --build webhook-service
```

## Common Issues and Solutions

### Port Conflicts
If ports 3331, 3332, or 6379 are in use:
1. Stop conflicting services
2. Or modify ports in `docker-compose.prod-test.yml`
3. Update component configurations accordingly

### Services Won't Start
1. Check Docker daemon is running
2. Verify no port conflicts
3. Check logs for specific error messages
4. Ensure images built successfully

### Webhook Delivery Failures
1. Check webhook service logs for connection errors
2. Verify test receiver endpoints are accessible
3. Check Redis connectivity between services
4. Validate webhook payload format

### Job Processing Issues
1. Verify Redis job queues: `redis-cli -p 6379 -n 1 KEYS "jobs:*"`
2. Check worker status and capabilities
3. Verify service-to-service communication
4. Check for resource conflicts in mock GPU mode

## Integration with Development

The prod-test environment is designed to complement local development:
- Uses different Redis database (1 vs 0) to avoid conflicts
- Different ports to run alongside dev environment
- Production-like builds to catch deployment issues early
- Webhook service testing without external dependencies

## Next Steps

After validating in prod-test environment:
1. **Phase 4**: Deploy local ComfyUI in mock_GPU mode
2. **Phase 5**: Deploy to Railway staging environment
3. **Phase 6**: Deploy to production multi-GPU servers
4. **Phase 7**: Migration from legacy system

## Environment Variables Reference

Key environment variables used in prod-test:

```bash
# API Server
NODE_ENV=production
REDIS_URL=redis://redis:6379
LOG_LEVEL=debug
MAX_PENDING_JOBS=1000

# Webhook Service
WEBHOOK_SERVICE_PORT=3332
WEBHOOK_TIMEOUT_MS=15000
MAX_RETRY_ATTEMPTS=2

# Redis
REDIS_DATABASE=1
REDIS_MAX_CONNECTIONS=20
```