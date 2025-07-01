# Implement Job Broker Core Logic

## Status: Pending

## Description
Implement the missing core job broker functionality that handles job selection, priority queues, and multi-dimensional job matching - the heart of the emp-redis system.

## Critical Missing Components
- Job selection algorithm with priority + FIFO ordering
- Redis-based priority queue management (`jobs:pending`, `jobs:active`, `jobs:completed`)
- Multi-dimensional capability matching
- Customer isolation rules
- Hardware requirements validation

## Tasks
- [ ] Port `get_next_available_job()` logic from Python
- [ ] Implement Redis sorted set operations for priority queues
- [ ] Add capability matching algorithm
- [ ] Build job claiming mechanism with conflict resolution
- [ ] Add customer isolation validation
- [ ] Implement hardware requirements matching

## Priority: High

## Dependencies
- Completed interface consolidation (✅ Done)

## Files to Modify
- `src/core/redis-service.ts` - Add core job broker methods
- `src/core/message-handler.ts` - Add job claiming logic
- `src/core/types/job.ts` - Enhance JobRequirements if needed

## Reference Implementation
- Python: `/Users/the_dusky/code/emprops/ai_infra/emp-redis/core/redis_service.py`
- Lines: 200-400 (job selection and matching logic)

## Acceptance Criteria
- [ ] Workers can successfully claim jobs based on capabilities
- [ ] Jobs are selected by priority then FIFO order
- [ ] Multiple workers don't claim the same job
- [ ] Customer isolation rules are enforced
- [ ] Hardware requirements are validated