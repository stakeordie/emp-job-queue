# Phase 4.3: Redis Keys Migration Strategy

## Executive Summary

Phase 4.3 migrates Redis key patterns from `job:*` to `step:*`. This is **HIGH RISK** because it affects:
- Runtime data persistence
- Active jobs in the queue
- Worker claims and assignments
- Cross-service communication

**Estimated Impact:**
- Development time: 6-8 hours
- Testing time: 4-6 hours
- Rollout time: 2-4 weeks (dual-write + migration + verification)
- Total: ~4-6 weeks for safe production deployment

## Current Redis Key Patterns

### Job (Step) Keys
```
job:{id}                    → Hash containing step data
job:{id}:progress           → Hash containing progress updates
jobs:pending                → Sorted set (priority queue)
jobs:active                 → Set of active job IDs
jobs:completed              → Set of completed job IDs (TTL)
jobs:failed                 → Set of failed job IDs (TTL)
```

### Worker Keys
```
worker:{id}                 → Hash containing worker capabilities
workers:active              → Set of active worker IDs
workers:idle                → Set of idle worker IDs
worker:{id}:heartbeat       → Last heartbeat timestamp
worker:{id}:jobs            → Set of jobs assigned to worker
```

### Pub/Sub Channels
```
job_events                  → Job lifecycle events
worker_events               → Worker status events
```

## Target Redis Key Patterns

### Step Keys (New)
```
step:{id}                   → Hash containing step data
step:{id}:progress          → Hash containing progress updates
steps:pending               → Sorted set (priority queue)
steps:active                → Set of active step IDs
steps:completed             → Set of completed step IDs (TTL)
steps:failed                → Set of failed step IDs (TTL)
```

### Worker Keys (Updated)
```
worker:{id}                 → Hash containing worker capabilities
workers:active              → Set of active worker IDs
workers:idle                → Set of idle worker IDs
worker:{id}:heartbeat       → Last heartbeat timestamp
worker:{id}:steps           → Set of steps assigned to worker (was jobs)
```

### Pub/Sub Channels (New)
```
step_events                 → Step lifecycle events
worker_events               → Worker status events (unchanged)
```

## Migration Phases

### Phase 4.3.1: Dual-Write Implementation (Week 1)
**Goal:** Write to both old and new keys simultaneously
**Risk:** LOW - No breaking changes
**Rollback:** Easy - disable dual-write flag

**Implementation:**
1. Add feature flag: `ENABLE_DUAL_WRITE_STEPS=true`
2. Update RedisService methods to write to both patterns:
   - `job:{id}` AND `step:{id}`
   - `jobs:pending` AND `steps:pending`
   - etc.
3. Keep reads from old keys (`job:*`)
4. Monitor for errors and performance impact

**Code Changes:**
```typescript
async submitStep(step): Promise<string> {
  const stepId = uuidv4();

  // Write to new pattern
  await this.redis.hmset(`step:${stepId}`, stepData);
  await this.redis.zadd('steps:pending', priority, stepId);

  if (process.env.ENABLE_DUAL_WRITE_STEPS) {
    // Also write to old pattern for backwards compatibility
    await this.redis.hmset(`job:${stepId}`, stepData);
    await this.redis.zadd('jobs:pending', priority, stepId);
  }

  return stepId;
}
```

### Phase 4.3.2: Data Migration Script (Week 2)
**Goal:** Copy existing `job:*` data to `step:*` keys
**Risk:** MEDIUM - Data consistency issues possible
**Rollback:** Keep old keys, revert to reading from them

**Implementation:**
1. Create migration script that:
   - Scans all `job:*` keys
   - Copies data to corresponding `step:*` keys
   - Validates data integrity
   - Logs progress and errors
2. Run in background (non-blocking)
3. Handle active jobs carefully (don't disrupt processing)
4. Create checksums for validation

**Migration Script:**
```bash
# scripts/migrate-job-keys-to-steps.ts
#!/usr/bin/env tsx

import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

async function migrateJobKeys() {
  console.log('Starting migration: job:* → step:*');

  // Get all job keys
  const jobKeys = await redis.keys('job:*');
  console.log(`Found ${jobKeys.length} job keys to migrate`);

  let migrated = 0;
  let errors = 0;

  for (const jobKey of jobKeys) {
    try {
      const stepKey = jobKey.replace(/^job:/, 'step:');

      // Check if already migrated
      const exists = await redis.exists(stepKey);
      if (exists) {
        console.log(`Skip: ${stepKey} already exists`);
        continue;
      }

      // Copy hash data
      const data = await redis.hgetall(jobKey);
      if (Object.keys(data).length > 0) {
        await redis.hmset(stepKey, data);
        migrated++;

        if (migrated % 100 === 0) {
          console.log(`Migrated ${migrated} keys...`);
        }
      }
    } catch (error) {
      console.error(`Error migrating ${jobKey}:`, error);
      errors++;
    }
  }

  console.log(`Migration complete: ${migrated} migrated, ${errors} errors`);
}

migrateJobKeys();
```

### Phase 4.3.3: Dual-Read Implementation (Week 3)
**Goal:** Read from new keys, fallback to old keys if missing
**Risk:** LOW - Graceful degradation
**Rollback:** Easy - revert to reading old keys only

**Implementation:**
```typescript
async getStep(stepId: string): Promise<Job | null> {
  // Try new pattern first
  let stepData = await this.redis.hgetall(`step:${stepId}`);

  if (Object.keys(stepData).length === 0) {
    // Fallback to old pattern
    stepData = await this.redis.hgetall(`job:${stepId}`);

    if (Object.keys(stepData).length > 0) {
      // Opportunistically migrate
      await this.redis.hmset(`step:${stepId}`, stepData);
      logger.info(`Lazy migration: job:${stepId} → step:${stepId}`);
    }
  }

  return stepData ? this.parseStepData(stepData) : null;
}
```

### Phase 4.3.4: Switch Primary to Step Keys (Week 4)
**Goal:** Make `step:*` the primary read/write pattern
**Risk:** MEDIUM - Requires confidence in migration completeness
**Rollback:** Revert to dual-read mode

**Implementation:**
1. Set feature flag: `PRIMARY_KEY_PATTERN=step`
2. Monitor for missing data errors
3. Keep dual-read fallback for 1 more week
4. Verify all active workloads using new keys

### Phase 4.3.5: Cleanup Old Keys (Week 5+)
**Goal:** Remove old `job:*` keys
**Risk:** LOW - After validation period
**Rollback:** Re-run migration if needed

**Implementation:**
1. Verify no systems reading old keys
2. Create final backup of old keys
3. Delete old keys in batches
4. Monitor for issues

## Risks & Mitigation

### Risk 1: Data Loss During Migration
**Mitigation:**
- Dual-write ensures no new data lost
- Migration script validates each copy
- Keep old keys until fully validated
- Comprehensive backups before each phase

### Risk 2: Active Jobs Disrupted
**Mitigation:**
- Never delete old keys while jobs active
- Dual-read ensures continuity
- Workers can handle both key patterns
- Graceful fallback mechanisms

### Risk 3: Performance Impact
**Mitigation:**
- Dual-write is async (non-blocking)
- Migration script runs in background
- Monitor Redis memory usage
- Rate limiting on migration operations

### Risk 4: Inconsistent State
**Mitigation:**
- Transaction-based updates where possible
- Checksums for data validation
- Reconciliation scripts
- Health check endpoints

## Rollback Procedures

### Phase 4.3.1 Rollback (Dual-Write)
```bash
# Disable dual-write
export ENABLE_DUAL_WRITE_STEPS=false

# Restart services
pnpm restart:api
pnpm restart:workers
```

### Phase 4.3.2 Rollback (Migration)
```bash
# Stop migration script
kill -9 $(pgrep migrate-job-keys)

# Keep reading from old keys (no code changes needed)
```

### Phase 4.3.3 Rollback (Dual-Read)
```typescript
// Revert to reading old keys only
async getStep(stepId: string): Promise<Job | null> {
  const stepData = await this.redis.hgetall(`job:${stepId}`);
  return stepData ? this.parseStepData(stepData) : null;
}
```

### Phase 4.3.4 Rollback (Primary Switch)
```bash
# Switch back to job keys as primary
export PRIMARY_KEY_PATTERN=job

# Restart services
pnpm restart:api
pnpm restart:workers
```

## Testing Strategy

### Unit Tests
```typescript
describe('RedisService - Dual Write', () => {
  it('should write to both job and step keys', async () => {
    const stepId = await redis.submitStep(stepData);

    const jobData = await redis.hgetall(`job:${stepId}`);
    const stepData = await redis.hgetall(`step:${stepId}`);

    expect(jobData).toEqual(stepData);
  });
});
```

### Integration Tests
```bash
# Test dual-write
pnpm test:integration redis-dual-write

# Test migration script
pnpm test:integration migrate-job-keys

# Test dual-read fallback
pnpm test:integration redis-dual-read
```

### Production Validation
```bash
# Check key counts
redis-cli --scan --pattern "job:*" | wc -l
redis-cli --scan --pattern "step:*" | wc -l

# Compare data integrity
./scripts/validate-migration.sh

# Monitor error rates
curl http://api/health/redis-migration
```

## Decision Point

**Option A: Full Phase 4.3 Implementation**
- Pros: Complete semantic migration
- Cons: 4-6 weeks, high complexity, risk
- Best for: Production systems requiring clean semantics

**Option B: Stop at Phase 4.2**
- Pros: Low risk, immediate value
- Cons: Redis keys still use "job" terminology
- Best for: Active development, defer complexity

**Option C: Phase 4.3 Lite (Alias Keys)**
- Pros: Quick win, lower risk
- Cons: Temporary solution, eventual cleanup needed
- Implementation: Create Redis key aliases instead of full migration

## Recommendation

**For now: STOP at Phase 4.2**

Reasons:
1. Phases 4.1-4.2 provide immediate value (type safety, clear API)
2. Redis key migration is high-complexity, moderate-risk
3. Can defer until truly needed (e.g., external clients care)
4. Focus engineering effort on features instead

**When to do Phase 4.3:**
- External integrations require "step" terminology
- Redis key confusion causes production issues
- Codebase maturity supports 4-6 week migration
- Engineering bandwidth available

**How to proceed if needed:**
1. Start with Phase 4.3.1 (dual-write) only
2. Run for 2 weeks, validate no issues
3. Evaluate if full migration justified
4. Proceed incrementally with constant validation

## Conclusion

Phase 4.3 is technically feasible but operationally expensive. The value gained (cleaner Redis keys) must be weighed against:
- 4-6 weeks development + rollout time
- Ongoing maintenance of dual systems
- Risk of data inconsistency
- Engineering effort opportunity cost

**Current recommendation: Complete Phases 4.1-4.2, defer 4.3 until business need justifies complexity.**
