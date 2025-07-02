# Redis-Direct Architecture Testing Guide

This guide shows how to test the new Redis-direct architecture where workers poll Redis directly and the API is a lightweight HTTP+WebSocket hybrid.

## Quick Start

### 1. Build and Start (Basic Setup)
```bash
# Build the project
pnpm build

# Start Redis + API + 2 workers
docker compose -f docker-compose.redis-direct.yml up --build

# In another terminal, run the test
./test-redis-direct.sh
```

### 2. Different Configurations

```bash
# Basic: Redis + API + 2 simulation workers
docker compose -f docker-compose.redis-direct.yml up

# With GPU worker (needs ComfyUI)
docker compose -f docker-compose.redis-direct.yml --profile gpu up

# With Redis UI for debugging
docker compose -f docker-compose.redis-direct.yml --profile debug up

# Scale test: 5+ workers
docker compose -f docker-compose.redis-direct.yml --profile scale up

# Full setup: everything
docker compose -f docker-compose.redis-direct.yml --profile full up
```

## Manual Testing

### API Endpoints

```bash
# Health check
curl http://localhost:3001/health

# Submit a job
curl -X POST http://localhost:3001/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "service_required": "simulation",
    "priority": 100,
    "payload": {
      "action": "test",
      "duration": 5000
    }
  }'

# Get job status
curl http://localhost:3001/api/jobs/{job-id}

# List all jobs
curl http://localhost:3001/api/jobs

# Stream progress (Server-Sent Events)
curl -N http://localhost:3001/api/jobs/{job-id}/progress
```

### WebSocket Testing

```javascript
const ws = new WebSocket('ws://localhost:3001');

ws.onopen = () => {
  // Submit job via WebSocket (legacy compatibility)
  ws.send(JSON.stringify({
    id: 1,
    type: 'submit_job',
    data: {
      service_required: 'simulation',
      priority: 50,
      payload: { test: true }
    }
  }));
  
  // Subscribe to progress
  ws.send(JSON.stringify({
    id: 2,
    type: 'subscribe_progress',
    job_id: 'your-job-id'
  }));
};

ws.onmessage = (event) => {
  console.log('Received:', JSON.parse(event.data));
};
```

### Redis Inspection

```bash
# Enter Redis CLI
docker exec -it emp-redis redis-cli

# Check pending jobs
ZREVRANGE jobs:pending 0 -1 WITHSCORES

# Check active workers  
SMEMBERS workers:active

# Check worker heartbeats
KEYS worker:*:heartbeat
TTL worker:worker1-direct:heartbeat

# Monitor job progress streams
XREAD COUNT 10 STREAMS progress:* $

# Monitor all Redis operations
MONITOR
```

## Architecture Components

### Services Running:
- **Redis** (port 6379): Central data store and message broker
- **API** (port 3001): Lightweight HTTP+WebSocket API 
- **Worker1** (worker1-direct): Fast simulation worker
- **Worker2** (worker2-direct): Medium simulation worker  
- **Worker3** (worker3-comfyui): GPU worker with ComfyUI support (gpu profile)
- **Redis Commander** (port 8081): Web UI for Redis (debug profile)

### Data Flow:
1. **Job Submission**: Client → API → Redis (`jobs:pending` queue)
2. **Job Claiming**: Worker polls Redis → Claims job via `ZREM`
3. **Job Processing**: Worker processes job using connectors
4. **Progress Updates**: Worker → Redis Streams (`progress:{jobId}`)
5. **Progress Streaming**: API subscribes to Redis Streams → Forwards to clients via SSE/WebSocket

## Testing Scenarios

### 1. Basic Functionality
```bash
# Start basic setup
docker compose -f docker-compose.redis-direct.yml up

# Run the automated test
./test-redis-direct.sh
```

**Expected Results:**
- ✅ Jobs submitted successfully via HTTP
- ✅ Workers claim jobs from Redis directly  
- ✅ Progress updates flow through Redis Streams
- ✅ Jobs complete and return results

### 2. Multiple Workers
```bash
# Check worker distribution
for i in {1..10}; do
  curl -X POST http://localhost:3001/api/jobs \
    -H "Content-Type: application/json" \
    -d "{\"service_required\":\"simulation\",\"priority\":$i,\"payload\":{\"job\":$i}}"
done

# Watch logs
docker logs -f emp-worker1 & docker logs -f emp-worker2
```

**Expected Results:**
- ✅ Jobs distributed across multiple workers
- ✅ Higher priority jobs processed first
- ✅ No coordination required between workers

### 3. WebSocket Backwards Compatibility  
```bash
# Use existing monitor or WebSocket client
# Should work unchanged with new API
```

**Expected Results:**
- ✅ Legacy WebSocket clients work without modification
- ✅ Real-time progress updates continue working
- ✅ Job submission via WebSocket successful

### 4. Scale Testing
```bash
# Start with scale profile (5 workers)
docker compose -f docker-compose.redis-direct.yml --profile scale up

# Submit many jobs rapidly
for i in {1..50}; do
  curl -X POST http://localhost:3001/api/jobs \
    -H "Content-Type: application/json" \
    -d "{\"service_required\":\"simulation\",\"priority\":$RANDOM,\"payload\":{\"job\":$i}}" &
done
```

**Expected Results:**
- ✅ All jobs processed without conflicts
- ✅ No race conditions or lost jobs
- ✅ Redis handles concurrent worker polling

### 5. Resilience Testing
```bash
# Start system
docker compose -f docker-compose.redis-direct.yml up -d

# Submit jobs
curl -X POST http://localhost:3001/api/jobs -H "Content-Type: application/json" -d '{"service_required":"simulation","priority":100,"payload":{}}'

# Kill a worker mid-job
docker kill emp-worker1

# Submit more jobs
curl -X POST http://localhost:3001/api/jobs -H "Content-Type: application/json" -d '{"service_required":"simulation","priority":100,"payload":{}}'

# Restart worker
docker start emp-worker1
```

**Expected Results:**
- ✅ System continues working with remaining workers
- ✅ New jobs still get processed
- ✅ Restarted worker rejoins and starts taking jobs
- ✅ No orchestration layer required

## Environment Variables

### API Server
```bash
API_PORT=3001                    # HTTP/WebSocket port
REDIS_URL=redis://redis:6379/0   # Redis connection
CORS_ORIGINS=*                   # CORS policy
LOG_LEVEL=info                   # Logging level
```

### Redis-Direct Workers
```bash
WORKER_ID=worker1-direct                    # Unique worker identifier
HUB_REDIS_URL=redis://redis:6379/0         # Redis connection
WORKER_SERVICES=simulation                  # Service types supported
WORKER_CONNECTORS=simulation                # Connector modules to load
WORKER_POLL_INTERVAL_MS=1000               # Redis polling frequency
WORKER_HEARTBEAT_INTERVAL_MS=30000         # Heartbeat frequency
WORKER_MAX_CONCURRENT_JOBS=2               # Max parallel jobs
WORKER_JOB_TIMEOUT_MINUTES=30              # Job timeout

# Hardware specs
WORKER_GPU_COUNT=1
WORKER_GPU_MEMORY_GB=8
WORKER_GPU_MODEL=RTX4090
WORKER_CPU_CORES=4
WORKER_RAM_GB=16

# Connector-specific config
WORKER_SIMULATION_PROCESSING_TIME=5        # Simulation duration (seconds)
WORKER_SIMULATION_STEPS=25                 # Progress steps
WORKER_COMFYUI_HOST=localhost              # ComfyUI server
WORKER_COMFYUI_PORT=8188                   # ComfyUI port
```

## Monitoring

### Logs
```bash
# API logs
docker logs -f emp-api

# Worker logs
docker logs -f emp-worker1
docker logs -f emp-worker2

# Redis logs
docker logs -f emp-redis
```

### Metrics
```bash
# Redis stats
docker exec emp-redis redis-cli info stats

# Connection counts
curl http://localhost:3001/api/connection-stats

# Worker status
redis-cli hgetall worker:worker1-direct
```

### Redis UI (with debug profile)
Open http://localhost:8081 to inspect Redis data structures visually.

## Troubleshooting

### Workers not taking jobs
```bash
# Check worker connection
docker exec emp-worker1 node -e "require('ioredis').createClient(process.env.HUB_REDIS_URL).ping().then(console.log)"

# Check Redis job queue
redis-cli zrange jobs:pending 0 -1 WITHSCORES

# Check worker heartbeats
redis-cli keys "worker:*:heartbeat"
```

### Progress not streaming
```bash
# Check Redis keyspace notifications
redis-cli config get notify-keyspace-events

# Should return: "Ex" (keyspace events enabled)

# Test progress stream manually
redis-cli xread STREAMS progress:test-job-id $
```

### API not responding
```bash
# Check API health
curl http://localhost:3001/health

# Check API logs
docker logs emp-api

# Check Redis connection
redis-cli ping
```

This Redis-direct architecture provides bulletproof scalability where workers operate independently and the API layer is lightweight and flexible!