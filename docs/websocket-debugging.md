# WebSocket Event System Debugging Plan

## Problem Summary

Two critical issues affecting the WebSocket event system:

1. **Client connections receive NO events** - Despite EventBroadcaster logging that it's sending messages, clients receive nothing from the EventBroadcaster
2. **Monitor auto-updates stopped working** - Machine status changes aren't updating the UI anymore (regression)

## Current Symptoms

### Client Issues
- Client connects successfully as type "emprops" ✓
- Client subscribes to jobs ✓
- EventBroadcaster logs show it's attempting to send ✓
- BUT: Client WebSocket receives NOTHING from EventBroadcaster
- Client receives its own `submit_job` message (echo)
- Client receives duplicate `complete_job` messages in wrong format

### Monitor Issues  
- Machine status events ARE being broadcast
- Logs show `[EventBroadcaster] BROADCAST - Event type: machine_status_change`
- BUT: Monitor UI doesn't reflect these updates

## Step-by-Step Debugging Plan

### Step 1: Test Basic WebSocket Communication
**What to check:** Can we send ANY message through the WebSocket?

**How to check:**
```typescript
// In lightweight-api-server.ts, handleClientConnection method, after line 732:
ws.send(JSON.stringify({
  type: 'debug_client_test',
  message: 'If you see this, WebSocket works',
  timestamp: Date.now()
}));

// In handleMonitorConnection method, after line 672:
ws.send(JSON.stringify({
  type: 'debug_monitor_test', 
  message: 'Monitor WebSocket test',
  timestamp: Date.now()
}));
```

**Expected result:** These messages should appear in browser DevTools Network tab → WebSocket → Messages

**How to verify:**
1. Open browser DevTools (F12)
2. Go to Network tab
3. Filter by WS (WebSocket)
4. Click on the WebSocket connection
5. Go to Messages tab
6. Look for the debug messages

### Step 2: Verify EventBroadcaster Has Valid WebSocket References
**What to check:** Are the WebSocket objects stored in EventBroadcaster still valid?

**How to check:**
```typescript
// In event-broadcaster.ts, modify sendToClient method:
private sendToClient(client: ClientConnection, event: MonitorEvent): void {
  console.log(`[DEBUG] sendToClient called for ${client.clientId}`);
  console.log(`[DEBUG] WebSocket readyState: ${client.ws.readyState}`);
  console.log(`[DEBUG] WebSocket OPEN constant: ${WebSocket.OPEN}`);
  console.log(`[DEBUG] Is WebSocket open? ${client.ws.readyState === WebSocket.OPEN}`);
  
  // Add similar logging in sendToMonitor
}
```

**WebSocket readyState values:**
- 0 = CONNECTING
- 1 = OPEN (only state where send() works)
- 2 = CLOSING
- 3 = CLOSED

**Expected result:** readyState should be 1 (OPEN). Any other value indicates a broken connection.

### Step 3: Track EventBroadcaster Instance
**What to check:** Is there only one EventBroadcaster instance, or are we accidentally creating multiple?

**How to check:**
```typescript
// In event-broadcaster.ts constructor:
export class EventBroadcaster {
  private instanceId = Math.random().toString(36).substring(7);
  
  constructor() {
    console.log(`[DEBUG] EventBroadcaster instance created: ${this.instanceId}`);
  }
}

// Everywhere that uses eventBroadcaster:
console.log(`[DEBUG] Using EventBroadcaster instance: ${this.eventBroadcaster.instanceId}`);
```

**Expected result:** Should see the same instance ID everywhere. Multiple IDs = problem.

### Step 4: Trace the Complete Event Flow
**What to check:** Where exactly does the event flow break?

**How to check with numbered checkpoints:**

```typescript
// 1. In submitJob:
console.log('[TRACE 1] Job submitted, about to broadcast');

// 2. In eventBroadcaster.broadcast:
console.log('[TRACE 2] broadcast() called with event:', event.type);

// 3. In broadcastToClients:
console.log('[TRACE 3] broadcastToClients() - checking', this.clients.size, 'clients');

// 4. In shouldClientReceiveEvent:
console.log('[TRACE 4] Checking if client should receive event');

// 5. In sendToClient:
console.log('[TRACE 5] sendToClient() called');

// 6. In createEmPropsMessage:
console.log('[TRACE 6] Creating EmProps message');

// 7. Just before ws.send:
console.log('[TRACE 7] About to call ws.send()');

// 8. After ws.send:
console.log('[TRACE 8] ws.send() completed');
```

**Expected result:** Should see all 8 traces in order. The last trace indicates where the flow breaks.

### Step 5: Verify Client Registration
**What to check:** Is the client actually being added to EventBroadcaster's internal map?

**How to check:**
```typescript
// In EventBroadcaster.addClient:
addClient(clientId: string, ws: WebSocket, clientType: 'emprops'): void {
  console.log('[DEBUG] addClient called with:', clientId);
  console.log('[DEBUG] Clients before add:', Array.from(this.clients.keys()));
  
  // ... existing code ...
  
  console.log('[DEBUG] Clients after add:', Array.from(this.clients.keys()));
  console.log('[DEBUG] Client successfully added?', this.clients.has(clientId));
}

// In removeClient:
removeClient(clientId: string): void {
  console.log('[DEBUG] removeClient called for:', clientId);
  console.log('[DEBUG] Client existed?', this.clients.has(clientId));
}
```

**Expected result:** Client ID should appear in the "after" list and `has()` should return true.

### Step 6: Test Monitor Updates
**What to check:** Why aren't monitors receiving machine status updates?

**How to check:**
```typescript
// In sendToMonitor:
private sendToMonitor(connection: MonitorConnection, event: MonitorEvent): void {
  console.log('[DEBUG] sendToMonitor event type:', event.type);
  console.log('[DEBUG] Connection is WebSocket?', connection instanceof WebSocket);
  console.log('[DEBUG] WebSocket state:', (connection as any).readyState);
  
  // Try sending a test message first:
  if (connection instanceof WebSocket) {
    try {
      connection.send(JSON.stringify({ type: 'monitor_test', time: Date.now() }));
      console.log('[DEBUG] Test message sent successfully');
    } catch (error) {
      console.error('[DEBUG] Test message failed:', error);
    }
  }
}
```

**Expected result:** Test messages should appear in monitor WebSocket connection.

### Step 7: Check for Silent Errors
**What to check:** Are errors being swallowed silently?

**How to check:**
```typescript
// Wrap ALL ws.send calls:
try {
  ws.send(data);
  console.log('[DEBUG] Send successful for data:', data.substring(0, 100));
} catch (error) {
  console.error('[DEBUG] Send FAILED:', error);
  console.error('[DEBUG] WebSocket state at failure:', ws.readyState);
  console.error('[DEBUG] Data that failed:', data.substring(0, 100));
}
```

### Step 8: Manual Broadcast Test
**What to check:** Can we manually trigger a broadcast to all connections?

**How to check - add test endpoint:**
```typescript
app.get('/test-broadcast', (req, res) => {
  const testMessage = { type: 'manual_test', timestamp: Date.now() };
  
  // Test client broadcast
  console.log('[TEST] Broadcasting to clients...');
  this.eventBroadcaster.clients.forEach((client, id) => {
    console.log(`[TEST] Client ${id} - readyState: ${client.ws.readyState}`);
    try {
      client.ws.send(JSON.stringify(testMessage));
      console.log(`[TEST] Success sending to client ${id}`);
    } catch (error) {
      console.error(`[TEST] Failed sending to client ${id}:`, error);
    }
  });
  
  // Test monitor broadcast
  console.log('[TEST] Broadcasting to monitors...');
  this.eventBroadcaster.monitors.forEach((monitor, id) => {
    console.log(`[TEST] Monitor ${id}`);
    if (monitor instanceof WebSocket) {
      console.log(`[TEST] Monitor ${id} - readyState: ${monitor.readyState}`);
      try {
        monitor.send(JSON.stringify(testMessage));
        console.log(`[TEST] Success sending to monitor ${id}`);
      } catch (error) {
        console.error(`[TEST] Failed sending to monitor ${id}:`, error);
      }
    }
  });
  
  res.json({ 
    clientCount: this.eventBroadcaster.clients.size,
    monitorCount: this.eventBroadcaster.monitors.size 
  });
});
```

**How to test:**
1. Open monitor UI
2. Check that WebSocket connections are established  
3. Visit http://localhost:3331/test-broadcast
4. Check browser console and network tab for test messages

## Common Issues and Solutions

### Issue: WebSocket readyState is not OPEN (1)
**Solution:** The WebSocket reference is stale. Need to ensure we're storing the WebSocket immediately after connection and not after any async operations.

### Issue: Multiple EventBroadcaster instances
**Solution:** Ensure EventBroadcaster is instantiated only once in the constructor and reused.

### Issue: Client not in EventBroadcaster's map
**Solution:** Check that addClient is called with the correct parameters and that the client isn't immediately removed.

### Issue: Silent WebSocket errors
**Solution:** WebSocket.send() can throw if the connection is closed. Always wrap in try-catch.

## Quick Diagnostic Commands

```bash
# Watch API logs for debug output
tail -f logs/api.log | grep -E "(DEBUG|TRACE|TEST)"

# Check for EventBroadcaster activity
tail -f logs/api.log | grep "EventBroadcaster"

# Monitor WebSocket errors
tail -f logs/api.log | grep -E "(WebSocket|readyState|Send FAILED)"
```

## Next Steps After Debugging

Based on the debugging results:

1. **If WebSockets are broken:** Fix the WebSocket reference storage
2. **If EventBroadcaster has wrong references:** Ensure proper lifecycle management
3. **If events aren't being created:** Fix the event creation flow
4. **If send() is failing:** Add proper error handling and reconnection logic