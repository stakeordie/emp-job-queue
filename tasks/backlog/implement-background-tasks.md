# Implement Background Task Management

## Status: Backlog

## Description
Add the background task management system that handles job broadcasting, heartbeat monitoring, and failed job retry logic like the Python version.

## Missing Components
- Job broadcasting to idle workers
- Heartbeat monitoring and cleanup
- Failed job retry logic
- Worker timeout detection
- Automatic job reassignment

## Tasks
- [ ] Implement job broadcasting system
- [ ] Add heartbeat monitoring with configurable intervals
- [ ] Build failed job retry mechanism with exponential backoff
- [ ] Add worker timeout detection and cleanup
- [ ] Implement automatic job reassignment for failed workers
- [ ] Add background task scheduling and management

## Priority: Medium

## Dependencies
- Job broker core logic
- Message processing system
- Worker job selection logic

## Files to Modify
- `src/hub/hub-server.ts` - Add background task manager
- `src/core/message-handler.ts` - Add broadcasting logic
- `src/core/redis-service.ts` - Add cleanup operations
- Create new: `src/core/background-task-manager.ts`

## Reference Implementation
- Python: `/Users/the_dusky/code/emprops/ai_infra/emp-redis/hub/main.py`
- Background task management and job broadcasting

## Acceptance Criteria
- [ ] Idle workers automatically receive job broadcasts
- [ ] Failed workers are detected within timeout period
- [ ] Jobs from failed workers are reassigned automatically
- [ ] Heartbeat monitoring prevents stale worker connections
- [ ] Configurable retry attempts and backoff strategies