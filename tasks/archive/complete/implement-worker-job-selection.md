# Build Pull-Based Job Selection Logic

## Status: Pending

## Description
Implement the worker-side job selection logic with pull-based claiming, timeouts, retries, and conflict resolution.

## Missing Components
- Worker job claiming with timeouts
- Retry logic for failed claims
- Conflict resolution when multiple workers claim same job
- Job timeout and reassignment
- Worker capability self-assessment

## Tasks
- [ ] Implement `claimJob()` method in workers
- [ ] Add job claiming timeouts and retries
- [ ] Build conflict resolution for concurrent claims
- [ ] Add job timeout monitoring
- [ ] Implement failed job reassignment
- [ ] Add worker capability filtering before claiming

## Priority: Medium

## Dependencies
- Job broker core logic
- Message processing system

## Files to Modify
- `src/worker/base-worker.ts` - Add claiming logic
- `src/core/redis-service.ts` - Add claim validation
- `src/core/message-handler.ts` - Handle claim conflicts

## Reference Implementation
- Python: `/Users/the_dusky/code/emprops/ai_infra/emp-redis/worker/base_worker.py`
- Lines: 150-250 (job claiming and processing)

## Acceptance Criteria
- [ ] Workers only claim jobs they can handle
- [ ] Failed claims are automatically retried
- [ ] Concurrent claims are resolved without conflicts
- [ ] Timed-out jobs are reassigned to other workers
- [ ] Workers gracefully handle claim failures