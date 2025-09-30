# Phase 4.3.2: Data Migration Script

## Overview

Phase 4.3.2 migrates existing `job:*` Redis keys to `step:*` keys by **copying** (not moving) data.

**What It Does:**
- Copies `job:{id}` → `step:{id}` (all hash keys)
- Copies `jobs:pending` → `steps:pending` (sorted set)
- Copies `jobs:active` → `steps:active` (set)
- Copies `jobs:completed` → `steps:completed` (set)
- Copies `jobs:failed` → `steps:failed` (set)

**What It Doesn't Do:**
- ❌ Delete original `job:*` keys (preserved for safety)
- ❌ Change reads (still from `job:*` keys)
- ❌ Affect running operations

## Prerequisites

1. **Phase 4.3.1 Complete**: Dual-write should be enabled and running for at least 1-2 weeks
2. **Redis Space**: Ensure enough memory (~2x current usage during migration)
3. **Backup**: Create Redis backup before running

## Usage

### Dry Run (Recommended First)

Test the migration without actually copying data:

\`\`\`bash
# Set environment variables
export REDIS_URL="redis://localhost:6379"
export DRY_RUN=true
export BATCH_SIZE=100
export VALIDATE_COPIES=true

# Run migration
pnpm tsx scripts/semantic-cleanup/migrate-job-keys-to-steps.ts
\`\`\`

**Expected Output:**
\`\`\`
🚀 Job → Step Redis Keys Migration

Configuration:
  Redis URL: redis://localhost:6379
  Dry Run: true
  Batch Size: 100
  Validate Copies: true

✅ Connected to Redis
🔄 Starting job:* → step:* migration
   Mode: DRY RUN

📦 Migrating hash keys: job:{id} → step:{id}
   Batch 1: Found 42 job hash keys
   [DRY RUN] Would migrate: job:abc123 → step:abc123
   [DRY RUN] Would migrate: job:def456 → step:def456
   ...

📊 Migrating sorted sets
   [DRY RUN] Would migrate: jobs:pending → steps:pending (5 members)

📋 Migrating sets
   [DRY RUN] Would migrate: jobs:active → steps:active (3 members)
   [DRY RUN] Would migrate: jobs:completed → steps:completed (100 members)
   [DRY RUN] Would migrate: jobs:failed → steps:failed (10 members)

============================================================
📊 Migration Summary
============================================================
Total keys found:    42
Successfully migrated: 47  # (42 hashes + 4 collections + 1 sorted set)
Skipped (already exist): 0
Errors: 0
Duration: 2.34s
============================================================
✅ All keys migrated successfully!
\`\`\`

### Live Migration

After validating with dry run:

\`\`\`bash
# Disable dry run
export DRY_RUN=false

# Run migration
pnpm tsx scripts/semantic-cleanup/migrate-job-keys-to-steps.ts
\`\`\`

**This will actually copy the data.**

## Configuration Options

### REDIS_URL
Redis connection string

\`\`\`bash
export REDIS_URL="redis://localhost:6379"
export REDIS_URL="redis://:password@host:6379"
export REDIS_URL="redis://user:pass@host:6379/0"
\`\`\`

### DRY_RUN
Simulate migration without copying data

\`\`\`bash
export DRY_RUN=true   # Simulate only
export DRY_RUN=false  # Actually copy data
\`\`\`

### BATCH_SIZE
Number of keys to process per Redis SCAN operation

\`\`\`bash
export BATCH_SIZE=100   # Default
export BATCH_SIZE=1000  # Faster for large datasets
export BATCH_SIZE=10    # Slower, less memory
\`\`\`

### VALIDATE_COPIES
Verify each copy for data integrity

\`\`\`bash
export VALIDATE_COPIES=true   # Validate (slower, safer)
export VALIDATE_COPIES=false  # No validation (faster)
\`\`\`

## Safety Features

### 1. Idempotent
Safe to re-run multiple times:
- Skips already-migrated keys
- Won't overwrite existing `step:*` keys

### 2. Non-Destructive
Never deletes original data:
- Original `job:*` keys preserved
- Only creates new `step:*` keys

### 3. Error Handling
Graceful error handling:
- Logs errors but continues
- Returns summary with error count
- Exit code 1 if any errors

### 4. Validation
Optional data integrity checks:
- Compares source and destination
- Validates all hash fields
- Ensures no data corruption

## Verification

### Check Key Counts

\`\`\`bash
# Count job:* keys
redis-cli --scan --pattern "job:*" | wc -l

# Count step:* keys (should be equal after migration)
redis-cli --scan --pattern "step:*" | wc -l
\`\`\`

### Compare Specific Keys

\`\`\`bash
# Get job data
redis-cli HGETALL job:abc123

# Get step data (should be identical)
redis-cli HGETALL step:abc123
\`\`\`

### Check Memory Usage

\`\`\`bash
redis-cli INFO memory | grep used_memory_human
\`\`\`

## Rollback

### If Migration Has Issues

1. **Stop the migration script** (Ctrl+C)
2. **Delete migrated keys** (if needed):

\`\`\`bash
# Delete all step:* keys
redis-cli --scan --pattern "step:*" | xargs -L 100 redis-cli DEL

# Delete step collections
redis-cli DEL steps:pending steps:active steps:completed steps:failed
\`\`\`

3. **Original `job:*` keys are untouched** - system continues working

## Performance

### Small Dataset (< 1000 keys)
- Duration: ~5-10 seconds
- Memory increase: Minimal

### Medium Dataset (1000-10000 keys)
- Duration: ~1-2 minutes
- Memory increase: ~20-30%

### Large Dataset (> 10000 keys)
- Duration: ~5-15 minutes
- Memory increase: ~50-100%

### Optimization Tips

1. **Increase batch size** for faster migration:
   \`\`\`bash
   export BATCH_SIZE=1000
   \`\`\`

2. **Disable validation** for speed (re-enable for final run):
   \`\`\`bash
   export VALIDATE_COPIES=false
   \`\`\`

3. **Run during low traffic** to minimize impact

## Monitoring

### Watch Progress

\`\`\`bash
# In one terminal: Run migration
pnpm tsx scripts/semantic-cleanup/migrate-job-keys-to-steps.ts

# In another terminal: Monitor Redis
watch -n 1 'redis-cli --scan --pattern "step:*" | wc -l'
\`\`\`

### Check Logs

\`\`\`bash
# Migration outputs to stdout
# Redirect to file if needed:
pnpm tsx scripts/semantic-cleanup/migrate-job-keys-to-steps.ts > migration.log 2>&1
\`\`\`

## Next Steps

After successful migration:

1. **Validate for 1-2 weeks**: Ensure both key patterns working
2. **Monitor memory**: Check Redis memory usage stable
3. **Proceed to Phase 4.3.3**: Implement dual-read (read from step:*, fallback to job:*)

## Troubleshooting

### "Error: Connection timeout"
- Check Redis URL is correct
- Ensure Redis is accessible
- Check firewall rules

### "Error: Out of memory"
- Increase Redis max memory
- Or reduce BATCH_SIZE
- Or free up Redis memory before migrating

### "Error: Key mismatch during validation"
- Data corruption detected
- Check Redis replication lag
- Re-run migration script

### "Migration too slow"
- Increase BATCH_SIZE
- Disable validation temporarily
- Check Redis network latency

## Example: Complete Migration Flow

\`\`\`bash
# 1. Backup Redis
redis-cli SAVE

# 2. Dry run
export REDIS_URL="redis://localhost:6379"
export DRY_RUN=true
pnpm tsx scripts/semantic-cleanup/migrate-job-keys-to-steps.ts

# 3. Review output, fix any issues

# 4. Live migration
export DRY_RUN=false
pnpm tsx scripts/semantic-cleanup/migrate-job-keys-to-steps.ts

# 5. Verify
redis-cli --scan --pattern "job:*" | wc -l
redis-cli --scan --pattern "step:*" | wc -l
# Should be equal

# 6. Spot check
redis-cli HGETALL job:abc123
redis-cli HGETALL step:abc123
# Should be identical

# 7. Monitor for 1-2 weeks before next phase
\`\`\`

## FAQ

**Q: Will this affect production?**
A: No, only creates new keys. Reads still from job:* keys.

**Q: Can I stop and resume the migration?**
A: Yes, it's idempotent. Skips already-migrated keys.

**Q: What if I run it twice?**
A: Safe - skips existing step:* keys, no overwrites.

**Q: How much memory will this use?**
A: ~2x current usage during migration (both old and new keys).

**Q: When can I delete old job:* keys?**
A: After Phase 4.3.4 (switch reads to step:*) + 2-week validation period.

**Q: What if migration fails halfway?**
A: Original keys untouched, system still works. Delete step:* keys and retry.
