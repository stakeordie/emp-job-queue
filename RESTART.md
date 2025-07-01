# RESTART - Monitor Job Count Issue Investigation

## Current Status
**ISSUE**: Monitor app shows inconsistent job counts (75 pending jobs) while Redis shows 0 pending jobs.

## Problem Summary
- Monitor displays jobs like "workflow-021", "workflow-020" with proper priorities
- Direct Redis queries show `ZCARD jobs:pending` = 0 
- Hub workers display correctly (4 workers visible)
- Issue persists after hard browser refresh and Redis FLUSHALL

## Root Cause Analysis Progress

### ✅ Fixed Issues
1. **Monitor WebSocket routing**: Fixed monitor messages being sent to main message handler
2. **Worker retrieval**: Fixed MonitorWebSocketHandler to use ConnectionManager instead of JobBroker for worker data
3. **Redis WRONGTYPE errors**: Eliminated by using correct data sources

### 🔍 Current Investigation
**Suspected Issue**: `getAllJobs()` method in JobBroker returning phantom jobs

### Debug Setup Added
- Added debug logging to `src/core/job-broker.ts` `getAllJobs()` method:
  ```typescript
  console.log(`[JobBroker] DEBUG: getAllJobs() starting - checking Redis data`);
  console.log(`[JobBroker] DEBUG: Found ${pendingJobs.length} pending job IDs:`, pendingJobs.slice(0, 5));
  console.log(`[JobBroker] DEBUG: Returning ${jobs.length} total jobs`);
  ```

## Next Steps for MCP/Playwright Investigation

### 1. Monitor with Playwright
Use Playwright MCP to:
- Navigate to `http://localhost:3003` (monitor app)
- Take screenshots of job display
- Inspect network requests to see WebSocket data
- Compare what monitor receives vs what hub sends

### 2. WebSocket Message Inspection
- Monitor WebSocket messages in browser DevTools
- Check `full_state_snapshot` message content
- Verify if phantom jobs are in WebSocket data or added client-side

### 3. Hub Log Analysis
- Check if debug logs from `getAllJobs()` appear when monitor connects
- Verify if `getAllJobs()` is being called at all
- Look for any job creation/accumulation in logs

### 4. Data Flow Verification
```
Redis (0 jobs) → JobBroker.getAllJobs() → MonitorWebSocketHandler → WebSocket → Monitor App (75 jobs)
```
Need to verify where the 75 jobs are being introduced in this chain.

## Current Docker Setup
```bash
# All containers running
docker ps
# Hub: localhost:3001 (HTTP), localhost:3002 (WebSocket)  
# Workers: worker1-js, worker2-js, worker3-comfyui, worker4-js
# Monitor: localhost:3003
# Redis: localhost:6379
```

## Commands to Resume Investigation

### Start Dev Environment
```bash
cd /Users/the_dusky/code/emprops/ai_infra/emp-job-queue
# Containers should already be running, but if needed:
docker compose up -d
cd apps/monitor-nextjs && pnpm dev  # If monitor not running on :3003
```

### Trigger Debug Output
```bash
# Refresh monitor at http://localhost:3003 to trigger getAllJobs()
# Then check debug logs:
docker logs hub --tail 50 | grep "DEBUG"
```

### Verify Current State
```bash
# Check Redis directly
docker exec redis redis-cli ZCARD "jobs:pending"  # Should be 0
docker exec redis redis-cli KEYS "*job*"

# Check what monitor shows
# Navigate to http://localhost:3003 and count jobs
```

## Key Files Modified
- `src/hub/monitor-websocket-handler.ts` - Fixed worker retrieval
- `src/hub/websocket-manager.ts` - Fixed monitor message routing  
- `src/core/job-broker.ts` - Added debug logging
- `src/hub/index.ts` - Updated MonitorWebSocketHandler constructor

## Expected Investigation Flow
1. **MCP/Playwright**: Capture monitor state and network traffic
2. **Debug Analysis**: Determine if issue is in JobBroker, WebSocket transmission, or client-side
3. **Fix Implementation**: Based on where phantom jobs are introduced
4. **Verification**: Confirm consistent job counts across refreshes

The mystery is why monitor shows 75 structured jobs (with workflows, priorities) when Redis has 0 pending jobs. This suggests either:
- Data coming from unexpected source
- Client-side accumulation/caching 
- WebSocket message corruption/duplication
- JobBroker reading from wrong data structure

Use Playwright to capture the exact WebSocket messages and DOM state for analysis.