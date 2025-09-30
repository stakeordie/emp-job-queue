# Phase 4: Actual Code Migration - Job → Step

## Executive Summary

Phase 4 migrates actual code from "Job" terminology to "Step" terminology. This is **real code changes** that will affect:
- ✅ Runtime behavior (event names, webhook payloads)
- ✅ API responses
- ✅ Database/Redis keys
- ✅ Client-facing interfaces

**Status:** Ready to execute
**Risk Level:** HIGH - Breaking changes for external clients
**Estimated Time:** 8-12 hours for complete migration
**Prerequisites:** Phases 1-3.4 complete ✅

## What Changes

### Before (Current State)
```typescript
// Events
JobSubmittedEvent, JobCompletedEvent, JobFailedEvent

// Functions
submitJob(), getJob(), completeJob()

// Redis Keys
job:123, jobs:pending, jobs:active

// API Endpoints
POST /submit-job
GET /job/:id

// Webhooks
{ type: 'job_submitted', job_id: '123', job_data: {...} }
```

### After (Phase 4 Complete)
```typescript
// Events
StepSubmittedEvent, StepCompletedEvent, StepFailedEvent

// Functions
submitStep(), getStep(), completeStep()

// Redis Keys
step:123, steps:pending, steps:active

// API Endpoints
POST /submit-step
GET /step/:id

// Webhooks
{ type: 'step_submitted', step_id: '123', step_data: {...} }
```

## Migration Strategy

### Phase 4.1: Type Definitions & Events (Low Risk)
**Goal:** Migrate event types and monitor interfaces
**Breaking:** ❌ No (create aliases first)
**Time:** 1-2 hours

Files:
- `packages/core/src/types/monitor-events.ts` - Event interface definitions
- Create `StepSubmittedEvent`, `StepCompletedEvent`, etc.
- Create type aliases: `type JobSubmittedEvent = StepSubmittedEvent` (backwards compat)

### Phase 4.2: Core Service Layer (Medium Risk)
**Goal:** Migrate Redis service and worker client
**Breaking:** ⚠️ Partial (with compatibility layer)
**Time:** 2-3 hours

Files:
- `packages/core/src/redis-service.ts` - Core job queue operations
- `packages/core/src/interfaces/redis-service.ts` - Service interfaces
- `apps/worker/src/redis-direct-worker-client.ts` - Worker operations

Changes:
- Add new methods: `submitStep()`, `getStep()`, `completeStep()`
- Keep old methods: `submitJob()` as wrapper to `submitStep()`
- Update internal variables: `jobId` → `stepId`

### Phase 4.3: Redis Keys Migration (HIGH RISK)
**Goal:** Migrate Redis key patterns
**Breaking:** ✅ YES - Requires data migration
**Time:** 2-3 hours + testing

Changes:
- `job:*` → `step:*`
- `jobs:pending` → `steps:pending`
- `jobs:active` → `steps:active`
- Update all Redis function scripts

**Migration Strategy:**
1. **Dual-write period:** Write to both `job:*` and `step:*` keys
2. **Data migration:** Background job to copy existing data
3. **Dual-read period:** Read from both, prefer `step:*`
4. **Cleanup:** Remove old `job:*` keys after validation

### Phase 4.4: API Endpoints (HIGH RISK)
**Goal:** Migrate HTTP API endpoints
**Breaking:** ✅ YES - Breaks HTTP clients
**Time:** 2-3 hours

Files:
- `apps/api/src/lightweight-api-server.ts`

Changes:
- Add new endpoints: `POST /submit-step`, `GET /step/:id`
- Keep old endpoints: `POST /submit-job` → proxy to `/submit-step`
- Deprecation warnings in responses

### Phase 4.5: Webhook Events (HIGH RISK)
**Goal:** Migrate webhook event payloads
**Breaking:** ✅ YES - Breaks webhook consumers
**Time:** 1-2 hours

Files:
- `packages/core/src/services/webhook-notification-service.ts`
- `packages/core/src/services/emprops-message-adapter.ts`

Changes:
- New event types: `step_submitted`, `step_completed`
- Keep old events with deprecation notices
- Dual-send period (both old and new events)

## Breaking Changes Strategy

### Option A: Big Bang (Not Recommended)
- Switch everything at once
- Coordinate with all clients
- High risk, high coordination overhead

### Option B: Gradual Migration (Recommended)
1. **Phase 4.1-4.2:** Internal changes, full backwards compatibility
2. **Phase 4.3:** Redis dual-write period (2 weeks)
3. **Phase 4.4-4.5:** API dual-endpoint period (4 weeks)
4. **Deprecation notices:** 8 weeks warning
5. **Cleanup:** Remove old endpoints/events

## Client Migration Path

### For HTTP Clients
```typescript
// Old (deprecated but working)
POST /submit-job
{ /* job data */ }

// New (recommended)
POST /submit-step
{ /* step data */ }

// Both work during transition period (4-8 weeks)
```

### For Webhook Consumers
```typescript
// Old events (deprecated but sent)
{ type: 'job_submitted', job_id: '123', job_data: {...} }

// New events (recommended)
{ type: 'step_submitted', step_id: '123', step_data: {...} }

// Both sent during transition period (4-8 weeks)
```

### For Internal Code
```typescript
// Old (deprecated)
import { Job, JobSubmittedEvent } from '@emp/core';
await redis.submitJob(data);

// New (recommended)
import { Step, StepSubmittedEvent } from '@emp/core';
await redis.submitStep(data);
```

## Rollout Timeline

### Week 1-2: Phase 4.1-4.2 (Internal)
- ✅ Deploy type changes
- ✅ Deploy service layer with compatibility
- ✅ No client impact
- ✅ Monitor for internal issues

### Week 3-4: Phase 4.3 (Redis Dual-Write)
- ✅ Start dual-write to both key patterns
- ✅ Migrate existing data in background
- ✅ Validate data consistency
- ✅ No client impact (internal only)

### Week 5-6: Phase 4.4 (API Dual-Endpoints)
- ✅ Deploy new `/submit-step` endpoints
- ✅ Keep `/submit-job` working
- ⚠️ Send deprecation notices to clients
- ⚠️ Update documentation

### Week 7-8: Phase 4.5 (Webhook Dual-Events)
- ✅ Send both old and new event types
- ⚠️ Webhook consumers see duplicate events
- ⚠️ Update webhook documentation
- ⚠️ Provide migration guide

### Week 9-12: Deprecation Period
- ⚠️ Loud deprecation warnings
- ⚠️ Email notifications to active clients
- ⚠️ Monitor old endpoint usage
- ⚠️ Support client migrations

### Week 13+: Cleanup
- ✅ Remove old `/submit-job` endpoints
- ✅ Remove old `job_*` events
- ✅ Remove old Redis `job:*` keys
- ✅ Remove compatibility layers
- ✅ Complete migration!

## Testing Strategy

### Phase 4.1-4.2: Unit Tests
```bash
# Test new Step types
pnpm test packages/core/src/types

# Test service compatibility
pnpm test packages/core/src/redis-service

# Verify old code still works
pnpm test --grep "Job"
```

### Phase 4.3: Integration Tests
```bash
# Test dual-write
pnpm test:integration redis-dual-write

# Test data migration
pnpm test:integration data-migration

# Verify consistency
pnpm test:integration redis-consistency
```

### Phase 4.4-4.5: E2E Tests
```bash
# Test old API endpoints
curl -X POST /submit-job

# Test new API endpoints
curl -X POST /submit-step

# Test webhook dual-send
pnpm test:e2e webhooks
```

## Risks & Mitigation

### Risk 1: Breaking External Clients
**Mitigation:**
- Long deprecation period (8+ weeks)
- Dual-endpoint/dual-event support
- Clear migration documentation
- Email notifications to active users

### Risk 2: Data Inconsistency (Redis Keys)
**Mitigation:**
- Dual-write period with validation
- Background data migration with checksums
- Rollback capability at each step
- Monitoring and alerts

### Risk 3: Performance Impact (Dual Operations)
**Mitigation:**
- Async dual-write (non-blocking)
- Monitor Redis latency
- Optimize Redis functions
- Remove dual-write after validation

### Risk 4: Incomplete Client Migration
**Mitigation:**
- Track old endpoint usage metrics
- Extend deprecation period if needed
- Direct support for high-value clients
- Graceful degradation during transition

## Execution Checklist

### Pre-Flight
- [ ] All tests passing on dev/sandy-test
- [ ] Backup production database/Redis
- [ ] Communication plan for clients
- [ ] Rollback procedures documented
- [ ] Monitoring alerts configured

### Phase 4.1: Types
- [ ] Create `Step*Event` types
- [ ] Create backwards-compatible aliases
- [ ] Update type exports
- [ ] Run type checking
- [ ] Commit and deploy

### Phase 4.2: Services
- [ ] Add `submitStep()` methods
- [ ] Keep `submitJob()` as wrappers
- [ ] Update internal variables
- [ ] Run unit tests
- [ ] Deploy to staging
- [ ] Validate compatibility
- [ ] Deploy to production

### Phase 4.3: Redis Keys
- [ ] Implement dual-write logic
- [ ] Deploy dual-write
- [ ] Run data migration script
- [ ] Validate data consistency
- [ ] Monitor for 2 weeks
- [ ] Switch to step:* primary
- [ ] Schedule job:* cleanup

### Phase 4.4: API Endpoints
- [ ] Create `/submit-step` endpoints
- [ ] Add deprecation warnings to old endpoints
- [ ] Update API documentation
- [ ] Deploy to staging
- [ ] Test both endpoints
- [ ] Deploy to production
- [ ] Send client notifications

### Phase 4.5: Webhooks
- [ ] Implement dual-send logic
- [ ] Update webhook documentation
- [ ] Deploy dual-send
- [ ] Monitor webhook delivery
- [ ] Support client migrations
- [ ] Track old event usage

### Cleanup (Week 13+)
- [ ] Remove old API endpoints
- [ ] Remove old webhook events
- [ ] Remove old Redis keys
- [ ] Remove compatibility layers
- [ ] Update all documentation
- [ ] Celebrate! 🎉

## Success Metrics

### Technical Metrics
- ✅ 100% test coverage maintained
- ✅ Zero production incidents
- ✅ <10ms latency impact
- ✅ Data consistency: 100%

### Business Metrics
- ✅ 95%+ client migration rate
- ✅ <5% support ticket increase
- ✅ Zero client data loss
- ✅ Deprecation period: 8+ weeks

## Documentation Updates

### For Developers
- Update `MIGRATION_GUIDE.md`
- Update `semantic-terminology.md`
- Add Phase 4 changelog entries
- Create breaking change notices

### For API Clients
- Update API documentation
- Create migration guide
- Provide code examples
- Set up deprecation timeline page

### For Webhook Consumers
- Update webhook documentation
- Provide event mapping guide
- Create testing sandbox
- Support migration testing

## Rollback Procedures

### Phase 4.1-4.2: Easy Rollback
```bash
# Git revert
git revert <commit-hash>
git push

# Re-deploy previous version
pnpm deploy:api
pnpm deploy:worker
```

### Phase 4.3: Redis Rollback
```bash
# Switch back to job:* keys
redis-cli CONFIG SET read-preference "job"

# Stop writing to step:* keys
redis-cli CONFIG SET write-pattern "job-only"
```

### Phase 4.4-4.5: API/Webhook Rollback
```bash
# Disable new endpoints
export FEATURE_FLAG_STEP_API=false

# Stop sending new events
export FEATURE_FLAG_STEP_EVENTS=false

# Re-deploy
pnpm deploy:api
```

## Cost Analysis

### Development Time
- Phase 4.1: 2 hours
- Phase 4.2: 3 hours
- Phase 4.3: 4 hours
- Phase 4.4: 3 hours
- Phase 4.5: 2 hours
- Testing: 3 hours
- Documentation: 2 hours
- **Total:** ~19 hours

### Operational Cost
- Dual-write Redis storage: +20% for 2 weeks
- Dual-send webhooks: +100% bandwidth for 4 weeks
- Extended deprecation support: Ongoing monitoring
- **Estimated:** $200-500 in infrastructure costs

### Risk Cost
- Client migration support: Variable (depends on client count)
- Potential downtime: Aim for zero
- Data migration validation: Included in development time

## Decision Point

**Start Phase 4?**

✅ **Yes, if:**
- You need external clients to see "Step" terminology
- You want clean semantic model throughout
- You can support 12+ week rollout
- You have resources for client support

❌ **No, if:**
- Current documentation-only approach is sufficient
- External clients don't care about terminology
- Limited resources for long migration
- Want to avoid breaking changes

**Hybrid:** Execute Phase 4.1-4.2 (internal only, no breaking changes), defer 4.3-4.5 until needed.
