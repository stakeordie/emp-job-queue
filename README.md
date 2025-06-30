# emp-redis JavaScript Rebuild

A modern TypeScript/Node.js rebuild of the emp-redis system, maintaining the proven pull-based job broker architecture while improving developer experience and deployment.

## Architecture Overview

This system implements a **pull-based job broker** where workers actively request jobs they can handle, rather than being assigned jobs by a central dispatcher. This enables:

- **Dynamic job selection**: Workers choose jobs based on real-time capabilities
- **Priority + FIFO ordering**: High priority jobs first, then oldest within priority
- **Multi-service support**: Single worker can handle ComfyUI, A1111, etc.
- **Smart capability matching**: Jobs matched to workers across multiple dimensions

## Key Features

### ✅ Pull-Based Job Selection
Workers query: "What's the highest priority job I can process?"
- Workers actively request jobs from Redis-based broker
- Real-time capability validation before job assignment
- No central dispatcher bottleneck

### ✅ Multi-Dimensional Job Matching
Jobs matched to workers using comprehensive scoring:
- **Service compatibility** (ComfyUI, A1111, etc.)
- **Hardware requirements** (GPU memory, CPU cores)
- **Model availability** (specific models loaded)
- **Customer isolation** (strict/loose/none)
- **Performance needs** (quality levels, speed)
- **Geographic constraints** (region, compliance)
- **Cost efficiency** (budget optimization)

### ✅ Priority + FIFO Ordering
- Priority jobs always processed first
- Same priority jobs processed in submission order
- Dynamic priority based on customer tier, urgency, deadlines

### ✅ Flexible Worker Deployment
- Single download/extract/run for GPU servers
- Multiple service types per worker
- Dynamic connector loading
- PM2 process management

## Quick Start

### Prerequisites
- Node.js 18+
- Redis 6+
- GPU servers with AI services (ComfyUI, A1111, etc.)

### Hub Deployment (Docker)
```bash
cd js-rebuild
cp .env.hub.example .env.hub
# Edit .env.hub with your Redis connection
docker-compose up hub
```

### Worker Deployment (GPU Server)
```bash
# Download worker release
curl -L https://github.com/org/repo/releases/latest/worker-linux.tar.gz | tar xz

# Configure
cp .env.worker.example .env.worker
vim .env.worker  # Set HUB_REDIS_URL, services, etc.

# Run with PM2
pm2 start worker.js --name gpu-worker

# Or run directly
node worker.js
```

## Development

### Setup
```bash
pnpm install
pnpm build
```

### Development Servers
```bash
# Start hub in development mode
pnpm dev:hub

# Start worker in development mode  
pnpm dev:worker
```

### Testing
```bash
# Run all tests
pnpm test

# Run specific test types
pnpm test:unit
pnpm test:integration
pnpm test:coverage
```

### Code Quality
```bash
# Lint and format
pnpm lint
pnpm format
pnpm typecheck
```

## Configuration

### Hub Configuration (.env.hub)
```env
# Redis connection
REDIS_URL=redis://localhost:6379

# API server
HUB_PORT=3001
HUB_HOST=0.0.0.0

# WebSocket server
WS_PORT=3002
WS_AUTH_TOKEN=your-secret-token

# Job processing
MAX_JOB_TIMEOUT_MINUTES=30
DEFAULT_JOB_PRIORITY=50
```

### Worker Configuration (.env.worker)
```env
# Hub connection
HUB_REDIS_URL=redis://hub-host:6379
HUB_WS_URL=ws://hub-host:3002
HUB_AUTH_TOKEN=your-secret-token

# Worker identity
WORKER_ID=gpu-worker-01
WORKER_TYPE=gpu

# Services supported
SERVICES=comfyui,a1111
COMFYUI_URL=http://localhost:8188
A1111_URL=http://localhost:7860

# Hardware specifications
GPU_COUNT=1
GPU_MEMORY_GB=16
GPU_MODEL=RTX 4090
CPU_CORES=8
RAM_GB=32

# Performance settings
CONCURRENT_JOBS=1
QUALITY_LEVELS=fast,balanced,quality

# Worker dashboard settings
WORKER_DASHBOARD_ENABLED=true
WORKER_DASHBOARD_PORT=1511
```

## Worker Dashboard

Each worker includes a built-in web dashboard for real-time monitoring and debugging:

### 🎛️ Dashboard Features
- **Real-time Status**: Worker status, uptime, heartbeat monitoring
- **Job Management**: Current jobs, job history, and cancellation controls
- **Performance Metrics**: Job success rates, processing times, system resources
- **Connector Status**: Real-time status of ComfyUI, A1111, and other connectors

### 📍 Accessing Dashboards

**Docker Deployment (Multiple Workers):**
```bash
# Worker 1 dashboard
http://localhost:1511

# Worker 2 dashboard  
http://localhost:1512

# Worker 3 dashboard
http://localhost:1513
```

**Standalone Workers:**
- Workers automatically find available ports
- Check worker logs for assigned dashboard URL:
```
🎛️ Worker gpu-worker-01 dashboard available at http://localhost:9247
📊 Dashboard accessible on host machine at http://localhost:9247
```

### ⚙️ Dashboard Configuration

```env
# Enable/disable dashboard (default: enabled)
WORKER_DASHBOARD_ENABLED=true

# Fixed port for container deployments (default: auto-assign)
WORKER_DASHBOARD_PORT=1511

# For multiple workers, use different ports:
# worker1: WORKER_DASHBOARD_PORT=1511
# worker2: WORKER_DASHBOARD_PORT=1512  
# worker3: WORKER_DASHBOARD_PORT=1513
```

### 🔧 Dashboard Controls
- **Pause/Resume Worker**: Control job processing (future implementation)
- **Cancel Jobs**: Cancel individual running jobs
- **Real-time Updates**: Auto-refresh every 2 seconds

## API Usage

### Submit Job
```bash
curl -X POST http://localhost:3001/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "service_type": "comfyui",
    "customer_id": "customer-123",
    "priority": 75,
    "payload": {
      "workflow": {...}
    },
    "requirements": {
      "hardware": {
        "gpu": {"memory_gb": 8}
      }
    }
  }'
```

### Check Job Status
```bash
curl http://localhost:3001/jobs/job-123
```

### Monitor Workers
```bash
curl http://localhost:3001/workers
```

## Architecture Details

### Core Components
- **JobBroker**: Redis-based job queue and matching
- **WorkerRegistry**: Worker capability tracking and health
- **JobMatcher**: Multi-dimensional job-worker scoring
- **MessageRouter**: WebSocket and Redis pub/sub communication

### Data Flow
1. Client submits job via REST API
2. Hub calculates priority and adds to Redis queue
3. Workers poll for jobs matching their capabilities
4. Best worker claims job and reports progress
5. Worker completes job and submits results

### Redis Data Model
```redis
jobs:pending              # Priority-ordered job queue (sorted set)
jobs:active:{workerId}    # Active jobs per worker (hash)
job:{jobId}              # Job details and requirements
worker:{workerId}        # Worker capabilities and status
```

## Deployment Options

### Development (Local)
- Redis on localhost
- Hub and workers run locally
- Mock AI services for testing

### Production (Distributed)
- Redis cluster or managed Redis
- Hub deployed on cloud platform
- Workers on GPU servers worldwide

### Hybrid (Mixed)
- Managed Redis (Railway, AWS)
- Hub on cloud platform
- Workers on local GPU hardware

## Monitoring

### Dashboards
- Real-time job queue status
- Worker health and utilization
- Performance metrics and alerts
- Job history and debugging

### Metrics
- Job submission and completion rates
- Worker utilization and performance
- Queue depth and processing times
- Error rates and failure analysis

### Logging
- Structured JSON logging
- Correlation IDs for request tracing
- Configurable log levels
- Centralized log aggregation

## Migration from Python emp-redis

This rebuild maintains compatibility with the Python version:
- Same message protocols and data structures
- Compatible Redis schema
- Equivalent worker capabilities model
- Similar configuration patterns

### Migration Steps
1. Deploy JavaScript hub alongside Python hub
2. Gradually migrate workers to JavaScript version
3. Switch job submission to new hub
4. Decommission Python components

## Differences from emp-bullmq

Unlike the BullMQ-based system, this architecture provides:
- **True pull-based job selection** (workers choose jobs)
- **Dynamic capability matching** (real-time worker state)
- **Single queue with filtering** (no queue proliferation)
- **Priority within FIFO** (proper job ordering)

## Contributing

### Development Guidelines
- TypeScript strict mode required
- 100% type coverage
- Comprehensive error handling
- Interface-driven design
- Event-driven communication

### Testing Requirements
- Unit tests for all core logic
- Integration tests for job flows
- Load tests for performance
- Error scenario testing

### Code Quality
- ESLint and Prettier configuration
- Pre-commit hooks for quality checks
- Dependency vulnerability scanning
- Automated CI/CD pipeline

## Support

### Documentation
- [Architecture Guide](./ARCHITECTURE.md)
- [TODO List](./TODO.md)
- [Development Guide](./CLAUDE.md)

### Troubleshooting
- Check Redis connectivity
- Verify worker registration
- Monitor job queue depth
- Review worker capabilities

### Performance Tuning
- Redis connection pooling
- Message batching optimization
- Worker capability indexing
- Job matching algorithm tuning

## License

MIT License - see LICENSE file for details.