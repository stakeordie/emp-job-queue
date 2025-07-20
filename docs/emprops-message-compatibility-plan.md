# EmProps Message Format Compatibility Plan

## Problem Statement

The EmProps API expects specific WebSocket message types and formats, but the Job Queue API is sending different message types. This causes the EmProps UI to not respond properly to job updates and completions.

**Current Mismatch:**
- Job Queue API sends: `connected` → `job_submitted` → `complete_job`
- EmProps API expects: `connection_established` → `job_accepted` → `update_job_progress` (multiple) → `complete_job` (with result.status)

**Impact:**
- EmProps UI shows generations as "queued" and doesn't react to completion
- Missing progress updates during job execution
- Incorrect `complete_job` message format prevents proper job resolution

## Root Cause Analysis

### Message Type Mismatches
1. **Connection**: `connected` vs `connection_established`
2. **Job Submission**: `job_submitted` vs `job_accepted` 
3. **Missing Progress**: No `update_job_progress` messages sent to EmProps clients
4. **Completion Format**: `complete_job` missing `result.status` field structure

### EmProps API Expectations (from redis-server-client.ts)
```typescript
// Connection established
{ type: "connection_established", message: "Connected", timestamp: ... }

// Job accepted  
{ type: "job_accepted", job_id: "...", status: "queued", timestamp: ... }

// Progress updates (multiple during execution)
{ type: "update_job_progress", job_id: "...", progress: 0.5, timestamp: ... }

// Job completion with proper result.status
{ 
  type: "complete_job", 
  job_id: "...", 
  result: { 
    status: "success" | "failed",
    data: { /* actual result */ },
    error?: string
  },
  timestamp: ... 
}
```

## Solution Strategy

**SIMPLIFIED APPROACH**: All client connections (`/ws/client/`) now use EmProps message format:
1. **Monitor connections** (`/ws/monitor/`) continue receiving current format (no changes)
2. **All client connections** (`/ws/client/`) receive EmProps format
3. **Single unified client format** - no complex client type detection needed

## Implementation Plan

### Phase 1: ~~Client Type Detection~~ **SIMPLIFIED**
**Goal**: ~~Identify EmProps clients vs Monitor clients during WebSocket connection~~ **All clients use EmProps format**

**Files Modified:**
- `apps/api/src/lightweight-api-server.ts`

**Implementation:**
1. ~~Add client type detection in WebSocket connection handler~~ **Removed complex detection**
2. ~~Parse connection URL or headers to identify client type~~ **Not needed**
3. ~~Track client type in connection metadata~~ **All clients are EmProps type**
4. ~~Add EmProps client tracking alongside existing monitor connections~~ **Simplified tracking**

**Connection Strategy:**
- EmProps clients connect to `/ws/client/{clientId}` path → **EmProps format**
- Monitor clients connect to `/ws/monitor/{monitorId}` path → **Original format** 
- ~~Use URL path parsing to determine client type~~ **Path determines endpoint, format is fixed**

### Phase 2: Message Format Adaptation Layer
**Goal**: Create service to translate internal messages to EmProps format

**Files to Create:**
- `packages/core/src/services/emprops-message-adapter.ts`

**Implementation:**
1. Create `EmPropsMessageAdapter` class
2. Implement message type mapping functions
3. Handle format conversion for each message type
4. Ensure proper timestamp and structure formatting

**Message Mappings:**
```typescript
interface EmPropsMessageAdapter {
  adaptConnectionMessage(): EmPropsConnectionMessage;
  adaptJobSubmittedToAccepted(jobSubmitted: JobSubmittedEvent): EmPropsJobAcceptedMessage;
  adaptProgressUpdate(progress: JobProgressEvent): EmPropsProgressMessage;
  adaptJobCompletion(completion: JobCompletedEvent): EmPropsCompletionMessage;
}
```

### Phase 3: Broadcast Logic Modification
**Goal**: ~~Update EventBroadcaster to send appropriate format based on client type~~ **Send EmProps format to all clients**

**Files Modified:**
- `packages/core/src/services/event-broadcaster.ts`
- `apps/api/src/lightweight-api-server.ts`

**Implementation:**
1. ~~Add client-type-aware broadcasting methods~~ **All clients get EmProps format**
2. Maintain backward compatibility for monitor clients (**unchanged**)
3. Route ~~EmProps~~ **all client** messages through adaptation layer
4. Ensure ~~both client types~~ **monitors and clients** receive appropriate messages

### Phase 4: Progress Update Implementation
**Goal**: Ensure EmProps clients receive regular progress updates during job execution

**Files to Modify:**
- Worker connectors (various)
- `apps/api/src/lightweight-api-server.ts` (progress streaming)

**Implementation:**
1. Verify internal progress events are being generated
2. Ensure progress events reach EmProps clients
3. Map internal progress format to EmProps `update_job_progress`
4. Test progress flow end-to-end

### Phase 5: Result Format Fixing
**Goal**: Fix complete_job message structure for EmProps compatibility

**Files to Modify:**
- `packages/core/src/services/emprops-message-adapter.ts`
- `apps/api/src/lightweight-api-server.ts`

**Implementation:**
1. Ensure `result.status` field is included with values "success"/"failed"
2. Map internal job completion data to EmProps expected format
3. Handle error cases properly with appropriate status values
4. Preserve original result data within new structure

## Technical Details

### Message Format Mappings

**Connection Messages:**
```typescript
// Internal (current)
{ type: "connected", timestamp: 1642700000000 }

// EmProps (target)
{ type: "connection_established", message: "Connected to server", timestamp: 1642700000000 }
```

**Job Acceptance:**
```typescript
// Internal (current)
{ type: "job_submitted", job_id: "job-123", timestamp: 1642700000000 }

// EmProps (target)  
{ type: "job_accepted", job_id: "job-123", status: "queued", timestamp: 1642700000000 }
```

**Progress Updates:**
```typescript
// Internal (via stats broadcast)
{ type: "update_job_progress", job_id: "job-123", progress: 0.5, worker_id: "worker-1" }

// EmProps (target)
{ type: "update_job_progress", job_id: "job-123", progress: 0.5, timestamp: 1642700000000 }
```

**Job Completion:**
```typescript
// Internal (current)
{ 
  type: "complete_job", 
  job_id: "job-123", 
  result: { /* actual result data */ },
  timestamp: 1642700000000 
}

// EmProps (target)
{ 
  type: "complete_job", 
  job_id: "job-123", 
  result: { 
    status: "success",
    data: { /* actual result data */ }
  },
  timestamp: 1642700000000 
}
```

### Architecture Changes

```
Current Flow:
Job Event → EventBroadcaster → All WebSocket Clients (same format)

New Flow:
Job Event → EventBroadcaster → {
  Monitor Clients: Original format
  EmProps Clients: Adapted format via EmPropsMessageAdapter
}
```

### Client Type Detection Implementation

```typescript
// In lightweight-api-server.ts WebSocket handler
wsServer.on('connection', (ws, request) => {
  const url = request.url || '';
  
  if (url.includes('/ws/client/')) {
    // EmProps client
    const clientId = extractClientId(url);
    const connection: EmPropsClientConnection = {
      ws, clientId, type: 'emprops', 
      connectedAt: new Date().toISOString()
    };
    empropsConnections.set(clientId, connection);
    
    // Send connection_established message
    sendEmPropsMessage(ws, adapter.adaptConnectionMessage());
    
  } else if (url.includes('/ws/monitor/')) {
    // Monitor client (existing logic)
    // ... existing monitor handling
  }
});
```

## Testing Strategy

### Unit Tests
1. **Message Adapter Tests**: Verify all message format conversions
2. **Client Detection Tests**: Ensure proper client type identification
3. **Broadcasting Logic Tests**: Verify correct message routing

### Integration Tests
1. **EmProps Client Flow**: Full job submission → progress → completion
2. **Monitor Client Flow**: Verify no regressions in existing functionality
3. **Dual Client Tests**: Both client types connected simultaneously

### Manual Testing Scenarios
1. **EmProps Integration**: Submit job from EmProps UI, verify proper message flow
2. **Monitor Verification**: Ensure monitor UI continues working unchanged
3. **Error Cases**: Test failed jobs, network disconnections, malformed messages

## Success Criteria

✅ **Monitor UI**: Continues working exactly as before (no regressions)
✅ **EmProps Integration**: Receives messages in expected format
✅ **Message Flow**: Complete job lifecycle with proper progress updates
✅ **Backward Compatibility**: Existing functionality unaffected
✅ **Job Completion**: EmProps UI properly resolves completed jobs
✅ **Progress Updates**: Real-time progress display in EmProps UI

## Risk Mitigation

### Technical Risks
- **Message Format Errors**: Comprehensive unit tests for all format conversions
- **Performance Impact**: Minimal overhead from message adaptation
- **Connection Handling**: Robust client type detection with fallbacks

### Deployment Risks
- **Gradual Rollout**: Implement client detection first, then gradually add format adaptation
- **Feature Flags**: Option to disable EmProps format adaptation if issues arise
- **Monitor Testing**: Extensive verification that monitor functionality remains unchanged

### Rollback Plan
- **Easy Revert**: Message adaptation can be disabled via feature flag
- **Backward Compatibility**: Original message format preserved for monitors
- **Database Changes**: None required - only message format changes

## Timeline Estimate

- **Phase 1-2**: 1 day (client detection + message adapter)
- **Phase 3**: 1 day (broadcaster modification) 
- **Phase 4-5**: 1 day (progress updates + result format)
- **Testing**: 1 day (verification and edge cases)

**Total**: 4 days for complete implementation and testing

## North Star Alignment

This work advances the North Star architecture by:
- **Improving Client Integration**: Better EmProps API compatibility supports broader ecosystem
- **Message Infrastructure**: Establishes pattern for client-specific message formatting
- **Monitoring Preservation**: Maintains existing monitoring capabilities while adding new client support
- **Foundation for Pools**: Message adaptation layer will support future specialized pool messaging

## Implementation Checklist

- [ ] Phase 1: Client type detection in WebSocket connections
- [ ] Phase 2: EmPropsMessageAdapter service creation
- [ ] Phase 3: EventBroadcaster client-aware broadcasting
- [ ] Phase 4: Progress update implementation for EmProps clients
- [ ] Phase 5: Complete_job message format fixing
- [ ] Unit tests for all message format conversions
- [ ] Integration tests for EmProps client flow
- [ ] Manual testing verification
- [ ] Monitor regression testing
- [ ] Documentation updates

## References

- **EmProps API Client**: `/Users/the_dusky/code/emprops/emprops-open-api/src/clients/redis-server-client.ts`
- **Current Job Queue Messages**: `/Users/the_dusky/code/emprops/ai_infra/emp-job-queue/packages/core/src/types/messages.ts`
- **Event Broadcasting**: `/Users/the_dusky/code/emprops/ai_infra/emp-job-queue/packages/core/src/services/event-broadcaster.ts`
- **API Server**: `/Users/the_dusky/code/emprops/ai_infra/emp-job-queue/apps/api/src/lightweight-api-server.ts`