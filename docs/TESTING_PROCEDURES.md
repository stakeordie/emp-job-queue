# Testing Procedures - EMP Job Queue

This document outlines standardized testing procedures for the emp-job-queue system to ensure consistent development and debugging workflows.

## Infrastructure Overview

### Redis Servers
- **Remote Production**: `redis://default:JQSoNVpIPsuaDQYicNvocglialxPrTjj@ballast.proxy.rlwy.net:30645`
- **Local Development**: `redis://host.docker.internal:6379` (accessible from containers)
- **Local Host**: `redis://localhost:6379` (from host machine)

### API Servers  
- **Remote Production**: `emp-job-queue-production.up.railway.app`
- **Local Development**: `localhost:3331`

### Container Configuration
- **Machine Container**: Uses `redis://host.docker.internal:6379` to connect to local Redis from within Docker
- **Host Services**: Use `redis://localhost:6379` when running directly on host

## Standard Testing Workflow

### 1. Monitor UI Testing

**Terminal 1 - Start Monitor Server:**
```bash
# Start the monitor UI server
# All logs are written to logs/monitor.log
pnpm dev:monitor
```

**Terminal 2 - Monitor UI Logs:**
```bash
# In a separate terminal, watch all monitor server activity
tail -f logs/monitor.log
```

**Browser Testing via Playwright:**
1. Navigate to `localhost:3333` 
2. Verify real-time machine cards display
3. Check console logs for WebSocket connections
4. Monitor network requests for `/api/monitor/state` polling
5. Verify machine status updates in real-time

**Expected Monitor Behavior:**
- WebSocket connection established to API server
- Machine cards showing status (ready/starting/error)
- Worker information displayed per machine
- Real-time updates when workers change status
- No console errors during normal operation

**Console Log Verification:**
- WebSocket connection messages
- State update events
- Error handling for disconnections

**Network Request Verification:**
- `/api/monitor/state` requests every few seconds
- WebSocket upgrade requests
- Static asset loading

**Event Stream Logging:**
```bash
# Start event stream logger to capture all SSE events to file
pnpm logs:eventstream

# This will create logs/monitorEventStream.log with all events including full_state_snapshot
# Check the log file:
tail -f logs/monitorEventStream.log
```

### 2. Local Development Setup

**Option A: Full Stack Setup (Recommended):**
```bash
# Start everything: Redis + API + Monitor + Machine with centralized logging
pnpm dev:full-stack

# This automatically starts and logs:
# - Redis + API → logs/redis.log
# - Monitor UI → logs/monitor.log  
# - Machine → logs/machine.log
# - Event Stream → logs/monitorEventStream.log
```

**Option B: Individual Components:**

**Terminal 1 - Start Local Redis + API Server:**
```bash
# This command starts both local Redis and API server
# All logs are written to logs/redis.log
pnpm dev:local-redis
```

**Terminal 2 - Monitor API Logs:**
```bash
# In a separate terminal, watch all API server activity
tail -f logs/redis.log
```

**Expected Output:**
- Redis connection established
- API server started on port 3331
- WebSocket endpoints active
- Machine event subscriptions active

**Terminal 3 - Start Machine Container:**
```bash
# Start basic machine (automatically runs pnpm machines:basic:local:down first)
pnpm machines:basic:local:up:build
```

**Terminal 4 - Monitor Machine Logs:**
```bash
# Watch machine container logs in real-time
docker logs basic-machine-local -f --tail 50
```

### 2. Machine Registration Testing

**Prerequisites:**
- Local Redis + API running (`pnpm dev:local-redis` or `pnpm dev:full-stack`)
- Log monitoring active (`tail -f logs/redis.log`)

**Start Machine Container:**
```bash
# Start basic machine (this will first run pnpm machines:basic:local:down to clear existing containers)
pnpm machines:basic:local:up:build

# Watch machine logs in real-time
docker logs basic-machine-local -f --tail 50
```

**Alternative - Restart Existing Machine:**
```bash
# If machine is already running, restart to trigger full startup sequence
docker restart basic-machine-local

# Watch machine logs
docker logs basic-machine-local -f --tail 50
```

**Expected Machine Events Sequence:**
1. `machine_startup` (phase: 'starting')
2. `startup_step` (shared_setup_starting)
3. `service_started` (pm2-daemon, shared-setup)
4. `startup_step` (comfyui_install_starting)
5. `service_started` (comfyui-installer)
6. `startup_step` (comfyui_services_starting)
7. `service_started` (comfyui-gpu0, comfyui-gpu1)
8. `startup_step` (workers_starting)
9. `service_started` (redis-worker-gpu0, redis-worker-gpu1)
10. `machine_startup` (phase: 'configuring')
11. `machine_startup` (phase: 'ready')
12. `startup_complete`

**Verify Machine Registration:**
```bash
# Check if machine appears in state
curl -s http://localhost:3331/api/monitor/state | jq '.data.machines'

# Should show machine with status 'ready' and associated workers
```

### 3. Worker Connection Testing

**Verify Workers:**
```bash
# Check worker registration
curl -s http://localhost:3331/api/monitor/state | jq '.data.workers'

# Should show 2 workers: basic-machine-local-worker-0, basic-machine-local-worker-1
```

**Expected Worker Properties:**
- `machine_id`: "basic-machine-local"
- `status`: "idle"
- `capabilities.services`: ["simulation", "comfyui"]
- `connector_statuses`: Object with service status

### 4. Event Flow Validation

**Machine Events:**
```bash
# Monitor API logs for machine events
grep "machine_startup\|startup_step\|service_started" logs/redis.log
```

**Worker Events:**
```bash
# Monitor worker registration events
grep "worker_status\|Worker registered" logs/redis.log
```

**Connector Events:**
```bash
# Monitor connector status events
grep "connector_status" logs/redis.log
```

## Debugging Common Issues

### Machine Container Management

**Start Fresh Machine:**
```bash
# Always use this command to start machine (cleans up first)
pnpm machines:basic:local:up:build

# This runs internally:
# 1. pnpm machines:basic:local:down  (cleanup)
# 2. Builds and starts new container
```

**Stop Machine:**
```bash
pnpm machines:basic:local:down
```

### Machine Not Appearing in State

**Symptoms:**
- `curl /api/monitor/state` shows `"machines": []`
- Workers exist but no parent machine

**Check List:**
1. Verify API server is subscribed to `machine:startup:events`
2. Check machine container logs for startup event publishing
3. Verify Redis connection between container and host
4. Check if `RedisStartupNotifier` methods are being called

**Debug Commands:**
```bash
# Check if API is listening to machine events
grep "machine:startup:events" logs/redis.log

# Check machine event publishing
docker logs basic-machine-local | grep "Publishing.*event"

# Verify Redis connectivity from container
docker exec basic-machine-local ping host.docker.internal
```

### Workers Not Connecting

**Symptoms:**
- No workers in `/api/monitor/state`
- Machine exists but `workers: []`

**Check List:**
1. Verify PM2 services are running: `docker exec basic-machine-local pm2 list`
2. Check Redis worker logs: `docker exec basic-machine-local pm2 logs redis-worker-gpu0`
3. Verify Redis URL configuration in container

### API Server Connection Issues

**Symptoms:**
- `curl localhost:3331/health` fails
- Connection refused errors

**Solutions:**
```bash
# Check if process is running
ps aux | grep tsx

# Restart local development
pkill -f "tsx.*api"
pnpm dev:local-redis

# Check port availability
lsof -i :3331
```

## Environment Files

### Machine Container (.env.local.dev)
```bash
HUB_REDIS_URL=redis://host.docker.internal:6379
REDIS_URL=redis://host.docker.internal:6379
```

### Host Development (.env)
```bash
REDIS_URL=redis://localhost:6379
API_PORT=3331
```

## Success Criteria

A successful test run should show:

1. **Machine Registration**: 1 machine with status "ready"
2. **Worker Registration**: 2 workers with status "idle" 
3. **Service Health**: All connectors reporting status
4. **Event Flow**: Complete startup sequence in logs
5. **API Connectivity**: All endpoints responding correctly

## Troubleshooting Commands

```bash
# Quick system check
curl -s http://localhost:3331/api/monitor/state | jq '{machines: .data.machines | length, workers: .data.workers | length}'

# Redis connection test
docker exec basic-machine-local wget -q -O- host.docker.internal:6379 2>/dev/null || echo "Redis unreachable"

# PM2 service status
docker exec basic-machine-local pm2 jlist | jq '.[] | {name: .name, status: .pm2_env.status}'

# Simulation service health check
curl -s http://localhost:8299/health | jq || echo "Simulation service unreachable"

# Container health
docker inspect basic-machine-local | jq '.[0].State.Health.Status'
```

## Centralized Logging System

All logs are now written to the `/logs` directory in the root of the project:

**Log Files:**
- `logs/api-redis.log` - API server logs (when connected to local Redis)
- `logs/redis.log` - Actual Redis server logs (symlink to `/opt/homebrew/var/log/redis.log`)
- `logs/monitor.log` - Monitor UI server logs
- `logs/machine.log` - Machine container build and startup logs
- `logs/monitorEventStream.log` - Raw SSE events from `/api/events/monitor`
- `logs/api.log` - API server only (when run individually)
- `logs/worker.log` - Worker service logs (when run individually)
- `logs/docs.log` - Documentation site logs

**Log Viewing Commands:**
```bash
# View specific component logs
pnpm logs:api-redis          # API server (when connected to local Redis)
pnpm logs:redis              # Actual Redis server logs
pnpm logs:monitor            # Monitor UI logs
pnpm logs:machines           # Machine container logs
pnpm logs:monitorEventStream # Raw event stream
pnpm logs:api               # API only
pnpm logs:worker            # Worker only

# View all logs with colored prefixes
pnpm logs:all

# Clear all log files
pnpm logs:clear
```

**Quick Troubleshooting:**
```bash
# Check what's running
pnpm dev:full-stack:status

# If partially running, stop and restart
pnpm dev:full-stack:stop
pnpm dev:full-stack:status  # Should show all stopped
pnpm dev:full-stack

# If stuck processes remain
lsof -i :3331  # Check specific ports
kill -9 <PID>  # Force kill if needed
```

**Full Stack Development:**
```bash
# Check if services are running
pnpm dev:full-stack:status

# Start everything at once with centralized logging
pnpm dev:full-stack

# This automatically starts:
# - Redis server → /opt/homebrew/var/log/redis.log
# - API server → logs/api-redis.log
# - Monitor UI → logs/monitor.log
# - Machine container → logs/machine.log
# - Event stream logger → logs/monitorEventStream.log

# Stop all services cleanly
pnpm dev:full-stack:stop
```

## Notes

- Always use `pnpm dev:full-stack` or `pnpm dev:local-redis` for local testing to ensure logs are captured
- Machine container must use `host.docker.internal:6379` to reach host Redis
- API server events are the source of truth for system state
- Event order matters - machine must register before workers can be associated
- All logs are persistent and can be reviewed after services stop

---

## RECENT SYSTEM IMPROVEMENTS (2025-07-16)

### Production Fixes Affecting Testing
Recent infrastructure fixes have improved testing reliability:

#### Worker Download Reliability
- **Fixed**: GitHub download rate limiting preventing worker startup
- **Impact**: Workers now consistently download and start without authentication issues
- **Testing**: Worker download phase should complete successfully every time

#### Dynamic Worker Scaling
- **Fixed**: Redis workers hardcoded to 2 instead of scaling with NUM_GPUS
- **Impact**: Redis workers now properly match ComfyUI scaling (1-8+ workers)
- **Testing**: Verify `NUM_GPUS=4` creates 4 Redis workers AND 4 ComfyUI instances

#### Worker Cache Management
- **Fixed**: Stale cached worker packages causing machine_id association issues
- **Impact**: Workers always download fresh packages with correct machine_id
- **Testing**: All workers should show correct machine_id in monitor, no "unknown" values

#### Monitor Scalability Foundation
- **Enhanced**: Added comprehensive scalable architecture plan for 100+ machines
- **Impact**: Clear roadmap for supporting production-scale monitoring
- **Testing**: Current testing procedures remain valid, scalability improvements are architectural

### Updated Testing Expectations

#### Worker Registration (Enhanced)
```bash
# Verify correct number of workers are created
curl -s http://localhost:3331/api/monitor/state | jq '.data.workers | length'
# Should match NUM_GPUS setting (e.g., 4 workers for NUM_GPUS=4)

# Verify all workers have correct machine_id
curl -s http://localhost:3331/api/monitor/state | jq '.data.workers[] | {worker_id: .worker_id, machine_id: .machine_id}'
# Should show all workers with machine_id: "basic-machine-local", no "unknown" values
```

#### Worker Download Verification
```bash
# Check worker download success in container logs
docker logs basic-machine-local | grep -i "download"
# Should show successful downloads, no rate limiting errors

# Verify worker cache cleanup
docker logs basic-machine-local | grep "Worker cache cleaned"
# Should show cache cleanup before worker startup
```

#### Service Scaling Verification
```bash
# Check PM2 service count matches GPU count
docker exec basic-machine-local pm2 jlist | jq '.[] | select(.name | contains("redis-worker")) | .name'
# Should show redis-worker-gpu0, redis-worker-gpu1, etc. matching NUM_GPUS

docker exec basic-machine-local pm2 jlist | jq '.[] | select(.name | contains("comfyui")) | .name'  
# Should show comfyui-gpu0, comfyui-gpu1, etc. matching NUM_GPUS
```

### Testing Reliability Improvements
- **Consistent Worker Startup**: Workers now start reliably without download failures
- **Predictable Scaling**: Service count matches GPU configuration every time
- **Accurate Machine Association**: All workers properly associated with parent machine
- **Clean State**: No stale cache interference between test runs

### Success Criteria Updates
Updated success criteria for testing workflow:

1. **Worker Download**: 100% success rate, no GitHub rate limiting
2. **Service Scaling**: Service count exactly matches NUM_GPUS setting
3. **Machine Association**: All workers show correct machine_id, no "unknown" values
4. **Cache Management**: Fresh worker packages downloaded every startup
5. **Monitor Stability**: Real-time updates work reliably with proper worker association

**Note**: These improvements make the testing procedures more reliable and predictable, supporting confident production deployment.