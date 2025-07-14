# EmProps Job Queue Debug Tools

Comprehensive debugging tools to identify failure points in the machine event system.

## Quick Diagnosis

### 1. Full Flow Test (Recommended)
```bash
cd tools
pnpm install
pnpm debug:full
```
This tests the entire event chain from Redis → API → Monitor WebSocket and pinpoints exactly where it breaks.

### 2. Redis Event Monitor
```bash
pnpm debug:redis
```
Shows all events being published to Redis channels in real-time. Use this to verify basic_machine is actually sending events.

### 3. API Event Flow
```bash
pnpm debug:api
```
Tests API server's Redis subscription and WebSocket broadcasting. Shows if API is receiving and processing events.

## Environment Variables

```bash
export REDIS_URL="redis://localhost:6379"          # Redis connection
export API_URL="ws://localhost:3331"               # API WebSocket endpoint  
export WS_AUTH_TOKEN="3u8sdj5389fj3kljsf90u"      # WebSocket auth token
```

## Common Failure Points

### ❌ No events in Redis
**Symptoms**: `debug:redis` shows no events
**Causes**: 
- basic_machine not running
- Redis connection failed in basic_machine
- Wrong Redis URL in basic_machine

### ❌ Redis events but API not receiving
**Symptoms**: `debug:redis` shows events, `debug:api` shows no WebSocket events
**Causes**:
- API server not running
- API not subscribed to `machine:startup:events` channel
- Redis connection failed in API server

### ❌ API receiving but not broadcasting
**Symptoms**: `debug:api` shows Redis events but no WebSocket events
**Causes**:
- EventBroadcaster not properly integrated
- handleMachineStartupEvent not called
- No monitors connected to EventBroadcaster

### ❌ API broadcasting but Monitor not receiving
**Symptoms**: `debug:api` shows WebSocket events, Monitor UI shows nothing
**Causes**:
- Monitor WebSocket connection failed
- Wrong API URL in monitor
- Authentication token mismatch
- Monitor event handlers not working

## Debug Output Examples

### ✅ Healthy System
```
📨 EVENT #1 - Channel: machine:startup:events
🏭 Machine ID: basic-machine-001
👷 Worker ID: basic-machine-gpu0
🎯 Event Type: startup_begin
```

### ❌ Broken System  
```
⚠️ No events received in the last 30 seconds
   Check if:
   1. basic_machine is running and publishing events
   2. Redis connection is working
   3. Events are being published to the correct channels
```

## Verbose Debugging

For detailed event inspection:
```bash
DEBUG=verbose pnpm debug:api
```

Shows full event payloads and internal processing details.