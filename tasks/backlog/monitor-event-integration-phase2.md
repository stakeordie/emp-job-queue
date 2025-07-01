# Monitor Event Integration - Phase 2

## Status: Ready to Start

## Description
Complete the event-driven monitor system by integrating the Phase 1 event infrastructure with the actual worker/job lifecycle methods and updating the monitor frontend to consume real-time events instead of polling.

## Prerequisites
✅ Phase 1 Complete: Event infrastructure implemented
- EventBroadcaster service ready
- MonitorWebSocketHandler implemented
- Event type definitions complete
- WebSocket integration done

## Phase 2 Tasks

### 2.1 Hub Integration - Add Event Broadcasting to Lifecycle Methods

**Priority: High**

#### Worker Lifecycle Events
- [ ] **Worker Registration**: Broadcast `worker_connected` when worker registers
  - File: `src/core/message-handler.ts` - handleWorkerRegistration()
  - Integration: Call `eventBroadcaster.broadcastWorkerConnected()`

- [ ] **Worker Disconnection**: Broadcast `worker_disconnected` when worker disconnects  
  - File: `src/hub/websocket-manager.ts` - connection close handler
  - Integration: Call `eventBroadcaster.broadcastWorkerDisconnected()`

- [ ] **Worker Status Changes**: Broadcast `worker_status_changed` when worker status updates
  - File: `src/core/redis-service.ts` - updateWorkerStatus()
  - Integration: Call `eventBroadcaster.broadcastWorkerStatusChanged()`

#### Job Lifecycle Events
- [ ] **Job Submission**: Broadcast `job_submitted` when job is submitted
  - File: `src/core/job-broker.ts` - submitJob()
  - Integration: Call `eventBroadcaster.broadcastJobSubmitted()`

- [ ] **Job Assignment**: Broadcast `job_assigned` when job is claimed by worker
  - File: `src/core/job-broker.ts` - claimJob()
  - Integration: Call `eventBroadcaster.broadcastJobAssigned()`

- [ ] **Job Status Changes**: Broadcast `job_status_changed` for all status transitions
  - File: `src/core/redis-service.ts` - updateJobStatus()
  - Integration: Call `eventBroadcaster.broadcastJobStatusChanged()`

- [ ] **Job Progress**: Broadcast `job_progress` when progress updates received
  - File: `src/core/message-handler.ts` - handleJobProgress()
  - Integration: Call `eventBroadcaster.broadcastJobProgress()`

- [ ] **Job Completion**: Broadcast `job_completed` when job finishes successfully
  - File: `src/core/message-handler.ts` - handleJobCompletion()
  - Integration: Call `eventBroadcaster.broadcastJobCompleted()`

- [ ] **Job Failure**: Broadcast `job_failed` when job fails
  - File: `src/core/message-handler.ts` - handleJobFailure()
  - Integration: Call `eventBroadcaster.broadcastJobFailed()`

#### Hub Service Integration
- [ ] **EventBroadcaster Integration**: Ensure EventBroadcaster is available in all services
  - File: `src/hub/hub-server.ts` - Initialize and pass EventBroadcaster to services
  - File: `src/core/message-handler.ts` - Accept EventBroadcaster in constructor
  - File: `src/core/redis-service.ts` - Accept EventBroadcaster in constructor

### 2.2 Monitor Frontend Updates

**Priority: High**

#### WebSocket Service Enhancement
- [ ] **Event Subscription**: Add event subscription after connection
  - File: `apps/monitor-nextjs/src/services/websocket.ts`
  - Feature: Send subscribe message with topics after connect
  - Feature: Handle subscription confirmation

- [ ] **Full State Request**: Request full state snapshot on connect
  - File: `apps/monitor-nextjs/src/services/websocket.ts`  
  - Feature: Send monitor_connect message with request_full_state: true
  - Feature: Handle full_state_snapshot response

- [ ] **Event Type Handling**: Add proper TypeScript types for events
  - File: `apps/monitor-nextjs/src/types/events.ts` (new)
  - Feature: Import and use monitor event types from hub

#### Store Event Processing
- [ ] **Real-time Event Handlers**: Replace stats_broadcast with event handlers
  - File: `apps/monitor-nextjs/src/store/index.ts`
  - Feature: Remove stats_broadcast message handling
  - Feature: Add handleRealtimeEvent() function
  - Feature: Process all event types (worker_connected, job_status_changed, etc.)

- [ ] **State Initialization**: Handle full state snapshot
  - File: `apps/monitor-nextjs/src/store/index.ts`
  - Feature: Process full_state_snapshot to populate initial state
  - Feature: Clear loading states after full state received

- [ ] **Real-time Updates**: Ensure UI updates instantly
  - File: `apps/monitor-nextjs/src/store/index.ts`  
  - Feature: Update workers array on worker_connected/disconnected
  - Feature: Update jobs array on job status changes
  - Feature: Update job progress in real-time

#### Connection Management
- [ ] **Connection State Tracking**: Track event subscription status
  - File: `apps/monitor-nextjs/src/services/websocket.ts`
  - Feature: Add isSubscribed state
  - Feature: Add connection health monitoring

- [ ] **Remove Auto-Connect**: Ensure manual connection only
  - File: `apps/monitor-nextjs/src/store/index.ts`
  - Feature: Verify no auto-connect on page load (already done but verify)

### 2.3 Testing & Validation

**Priority: High**

#### Functional Testing  
- [ ] **Worker Connection Events**: Test worker connect/disconnect shows instantly
- [ ] **Job Submission Events**: Test job submission appears immediately in queue
- [ ] **Job Progress Events**: Test progress updates in real-time
- [ ] **Job Completion Events**: Test job completion/failure updates instantly
- [ ] **Monitor Reconnection**: Test monitor reconnect gets full state correctly

#### Performance Testing
- [ ] **Event Latency**: Measure event delivery time (target < 100ms)
- [ ] **Network Traffic**: Compare with old polling system (expect 80%+ reduction)
- [ ] **Multiple Monitors**: Test multiple monitors can connect simultaneously
- [ ] **High Load**: Test with 50+ concurrent jobs

## Implementation Order

### Step 1: Hub Event Integration (1-2 days)
1. Initialize EventBroadcaster in HubServer
2. Pass EventBroadcaster to MessageHandler and RedisService
3. Add event broadcasting to worker registration/disconnection
4. Add event broadcasting to job submission/assignment/completion
5. Test events are being broadcast (can use Redis monitor or debug logs)

### Step 2: Monitor Frontend Updates (1-2 days)  
1. Update WebSocket service to request full state and subscribe to events
2. Add event type definitions for monitor
3. Update store to handle real-time events instead of stats_broadcast
4. Remove stats_broadcast handling completely
5. Test monitor receives and processes events correctly

### Step 3: Testing & Refinement (1 day)
1. End-to-end testing of complete flow
2. Performance benchmarking vs old system
3. Multiple monitor testing
4. Bug fixes and edge case handling

## Expected Results

### Before Phase 2 (Current State)
- Monitor polls hub every 2 seconds with stats_broadcast
- 2-second delay for all updates
- Potential for missed events between polls
- High network traffic for full state transfers

### After Phase 2 (Target State)  
- Monitor receives instant event notifications
- Sub-100ms update latency
- Zero missed events
- 80%+ reduction in network traffic
- Better user experience with real-time updates

## Files to Modify

### Hub/Backend Files
- `src/hub/hub-server.ts` - Initialize EventBroadcaster
- `src/core/message-handler.ts` - Add event broadcasting to job handlers
- `src/core/redis-service.ts` - Add event broadcasting to status updates  
- `src/core/job-broker.ts` - Add event broadcasting to job lifecycle
- `src/hub/websocket-manager.ts` - Add event broadcasting to worker disconnect

### Monitor Frontend Files
- `apps/monitor-nextjs/src/services/websocket.ts` - Event subscription
- `apps/monitor-nextjs/src/store/index.ts` - Real-time event processing
- `apps/monitor-nextjs/src/types/events.ts` - Event type definitions

## Success Criteria
- [ ] All job status changes appear instantly in monitor (< 100ms)
- [ ] Worker connections/disconnections show immediately
- [ ] Job progress updates smoothly in real-time  
- [ ] Monitor reconnection restores full state without data loss
- [ ] Network traffic reduced by 80%+ compared to polling
- [ ] Multiple monitors work simultaneously
- [ ] No regression in existing functionality

## Risk Mitigation
- **Fallback Strategy**: Keep old stats_broadcast as backup during transition
- **Gradual Rollout**: Test with single monitor first, then multiple
- **Performance Monitoring**: Add metrics to track event delivery performance
- **Rollback Plan**: Easy to revert to polling if issues discovered