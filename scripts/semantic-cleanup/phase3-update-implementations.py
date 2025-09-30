#!/usr/bin/env python3
"""
Phase 3: Update Core Implementations (INCREMENTAL APPROACH)
- Start with highest-priority files only
- Make surgical, targeted changes
- Extensive backups and validation at each step
- Can be run multiple times (idempotent where possible)
"""

import os
import shutil
import re
from datetime import datetime
from pathlib import Path
from typing import List, Dict

REPO_ROOT = Path("/Users/the_dusky/code/emprops/ai_infra/emp-job-queue-semantic-fix")
SCRIPT_DIR = Path(__file__).parent
TIMESTAMP = datetime.now().strftime("%Y%m%d_%H%M%S")
BACKUP_DIR = SCRIPT_DIR / "backups" / f"phase3_{TIMESTAMP}"

print("🔄 Phase 3: Implementation Updates (INCREMENTAL)")
print(f"📁 Repository: {REPO_ROOT}")
print(f"💾 Backup Directory: {BACKUP_DIR}")

# Create backup directory
BACKUP_DIR.mkdir(parents=True, exist_ok=True)

def backup_file(file_path: Path) -> None:
    """Create backup of a file before modification"""
    if not file_path.exists():
        return

    relative = file_path.relative_to(REPO_ROOT)
    backup_path = BACKUP_DIR / relative
    backup_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(file_path, backup_path)
    print(f"  💾 Backed up: {relative}")

def update_step_ts_internal_refs() -> bool:
    """
    Phase 3.1: Update internal references in step.ts
    Since step.ts is a copy of old job.ts, update its internal documentation
    """
    print("\n📝 Phase 3.1: Updating step.ts internal references...")

    step_file = REPO_ROOT / "packages/core/src/types/step.ts"

    if not step_file.exists():
        print("  ❌ step.ts not found")
        return False

    backup_file(step_file)

    content = step_file.read_text(encoding='utf-8')
    original_content = content

    # Add clear header explaining this is the Step type file
    if not content.startswith("// Step types"):
        header = """// Step types - what workers process (formerly Job types)
// This file was migrated from job.ts as part of semantic cleanup
//
// Semantic Model:
// - Step = Individual processing unit that workers claim and execute
// - Job = User's request (may contain multiple steps) - see job-new.ts
//
// During migration, "Job" in this file refers to what should semantically be "Step"
// The types are exported with correct naming via index.ts

"""
        content = header + content

    # Update the file
    if content != original_content:
        step_file.write_text(content, encoding='utf-8')
        print("  ✅ Updated step.ts header")
        return True
    else:
        print("  ℹ️  step.ts already up to date")
        return False

def update_job_ts_deprecation_notice() -> bool:
    """
    Phase 3.2: Add deprecation notice to original job.ts
    """
    print("\n📝 Phase 3.2: Adding deprecation notice to job.ts...")

    job_file = REPO_ROOT / "packages/core/src/types/job.ts"

    if not job_file.exists():
        print("  ❌ job.ts not found")
        return False

    backup_file(job_file)

    content = job_file.read_text(encoding='utf-8')
    original_content = content

    # Add deprecation notice if not present
    if "DEPRECATED" not in content:
        deprecation_notice = """// ⚠️  DEPRECATED - This file is being phased out
//
// The types in this file represent "Steps" (worker processing units)
// but are named "Job" which causes confusion.
//
// NEW CODE SHOULD USE:
// - import { Step } from '@emp/core' (for worker processing units)
// - import { Job } from '@emp/core/types/job-new.js' (for user requests)
//
// This file is preserved for backwards compatibility during migration.
// See: packages/core/src/types/MIGRATION_STATUS.md

"""
        content = deprecation_notice + content
        job_file.write_text(content, encoding='utf-8')
        print("  ✅ Added deprecation notice to job.ts")
        return True
    else:
        print("  ℹ️  job.ts already has deprecation notice")
        return False

def create_migration_guide() -> None:
    """Create a guide for developers on how to use new types"""
    print("\n📝 Creating developer migration guide...")

    guide_file = REPO_ROOT / "packages/core/src/types/MIGRATION_GUIDE.md"

    guide_content = """# Developer Migration Guide

## Quick Reference

### When to use Step vs Job

**Use `Step` when:**
- Working with worker processing units
- Referring to individual items in the queue
- Dealing with what workers claim and execute
- Old code used: `Job`, `jobId`, `job_id`

**Use `Job` when:**
- Working with user requests
- Referring to what customers submit
- Dealing with workflows or collections of steps
- Old code used: `Workflow`, `workflowId`, `workflow_id`

## Import Examples

### Old Way (Still works, but deprecated)
```typescript
import { Job } from '@emp/core';  // ⚠️  Confusing - actually means "Step"

const job: Job = await getJob(jobId);  // Actually getting a Step
```

### New Way (Recommended)
```typescript
import { Step } from '@emp/core';  // ✅ Clear - worker processing unit

const step: Step = await getStep(stepId);  // Clear intent
```

### For User Requests
```typescript
import { Job } from '@emp/core/types/job-new.js';  // ✅ User's request

const job: Job = {
  id: 'user-request-123',
  customer_id: 'cust-456',
  priority: 5,
  steps: [
    { step_id: 'step-1', sequence: 1, status: 'pending' },
    { step_id: 'step-2', sequence: 2, status: 'pending' }
  ]
};
```

## Common Patterns

### Worker Code
```typescript
// OLD (still works)
const currentJob = await claimJob(workerId);

// NEW (clearer)
const currentStep = await claimStep(workerId);
```

### API Code
```typescript
// OLD (confusing)
async function submitWorkflow(workflowData) {
  const jobId = await createJob(workflowData);
  return jobId;
}

// NEW (clear)
async function submitJob(jobData) {
  const jobId = await createJob(jobData);
  // Job can have multiple steps
  for (const stepData of jobData.steps) {
    await createStep(jobId, stepData);
  }
  return jobId;
}
```

### Redis Keys
```typescript
// OLD
const key = `job:${jobId}:status`;  // Ambiguous

// NEW
const stepKey = `step:${stepId}:status`;  // Worker processing unit
const jobKey = `job:${jobId}:status`;     // User request
```

## Migration Timeline

- **Now**: Both old and new terminology work
- **Phase 3**: Implementations updated to use new types
- **Phase 4**: API endpoints updated, documentation revised
- **Future**: Old terminology deprecated and eventually removed

## Need Help?

1. Check `MIGRATION_STATUS.md` for current migration state
2. Review Phase 1 analysis reports in `scripts/semantic-cleanup/reports/`
3. Look at the compatibility layer in `compatibility.ts`

## Rollback

If you encounter issues, rollback is available:
```bash
# Latest Phase 3 backup
./scripts/semantic-cleanup/backups/phase3_*/rollback.sh

# Or use git
git checkout -- packages/core/src/types/
```
"""

    guide_file.write_text(guide_content, encoding='utf-8')
    print(f"  ✅ Created MIGRATION_GUIDE.md")

def generate_rollback_script() -> None:
    """Generate rollback script for Phase 3"""
    print("\n📝 Creating rollback script...")

    rollback_file = BACKUP_DIR / "rollback.sh"

    rollback_content = f"""#!/bin/bash
# Rollback script for Phase 3 migration
# Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

set -e

BACKUP_DIR="{BACKUP_DIR}"
REPO_ROOT="{REPO_ROOT}"

echo "🔙 Rolling back Phase 3 migration..."
echo "📁 Backup source: $BACKUP_DIR"
echo "📁 Target: $REPO_ROOT"

# Restore backed up files
if [ -d "$BACKUP_DIR/packages/core/src/types" ]; then
    echo "  Restoring packages/core/src/types/..."
    cp -r "$BACKUP_DIR/packages/core/src/types"/* "$REPO_ROOT/packages/core/src/types/"
    echo "  ✅ Restored type definitions"
fi

# Remove Phase 3 created files
echo "  Removing Phase 3 created files..."
rm -f "$REPO_ROOT/packages/core/src/types/MIGRATION_GUIDE.md"
echo "  ✅ Removed Phase 3 files"

echo "✅ Rollback complete!"
echo ""
echo "🔍 Verify rollback:"
echo "  pnpm typecheck"
echo "  pnpm test"
"""

    rollback_file.write_text(rollback_content, encoding='utf-8')
    rollback_file.chmod(0o755)  # Make executable
    print(f"  ✅ Created rollback.sh")

def create_status_report(changes_made: List[str]) -> None:
    """Create status report for Phase 3"""
    print("\n📝 Creating Phase 3 status report...")

    status_file = BACKUP_DIR / "PHASE3_STATUS.md"

    status_content = f"""# Phase 3 Status Report

**Execution Date:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
**Phase:** 3.1 - Core Type File Updates (INCREMENTAL)

## Changes Made

"""

    if changes_made:
        for change in changes_made:
            status_content += f"- ✅ {change}\n"
    else:
        status_content += "- ℹ️  No changes needed (files already up to date)\n"

    status_content += f"""

## Phase 3 Strategy

Phase 3 is being executed **incrementally** with careful validation at each step:

### Phase 3.1: Core Type Files ✅ COMPLETE
- Update internal references in step.ts
- Add deprecation notices to job.ts
- Create developer migration guide

### Phase 3.2: High-Priority Service Files 📋 NEXT
- packages/core/src/redis-service.ts
- packages/core/src/interfaces/*.ts
- apps/worker/src/redis-direct-worker-client.ts

### Phase 3.3: Medium-Priority Implementation Files 📋 PLANNED
- apps/api/src/lightweight-api-server.ts
- apps/worker/src/redis-direct-base-worker.ts
- Service layer implementations

### Phase 3.4: Lower-Priority Files 📋 PLANNED
- Test files
- Documentation
- Example code

## Risk Management

- **Incremental approach**: Changes applied in small, testable batches
- **Full backups**: Every file backed up before modification
- **Validation**: TypeScript compilation checked after each phase
- **Rollback ready**: Executable rollback script available

## Validation

```bash
# Check TypeScript compilation
pnpm typecheck

# Run tests
pnpm test

# Build packages
pnpm build
```

## Rollback

If issues arise:

```bash
# Using rollback script (recommended)
{BACKUP_DIR}/rollback.sh

# Using git
git checkout -- packages/core/src/types/
```

## Next Steps

1. Validate Phase 3.1 changes (typecheck, tests)
2. Review developer migration guide
3. Proceed to Phase 3.2 when ready
4. Continue incrementally through remaining sub-phases
"""

    status_file.write_text(status_content, encoding='utf-8')
    print(f"  ✅ Created PHASE3_STATUS.md")

def main():
    print("\n🔄 Starting Phase 3.1 Migration (INCREMENTAL)...")
    print("⚠️  This phase makes MINIMAL changes for safety")

    changes_made = []

    try:
        # Phase 3.1: Update core type files
        if update_step_ts_internal_refs():
            changes_made.append("Updated step.ts header and documentation")

        if update_job_ts_deprecation_notice():
            changes_made.append("Added deprecation notice to job.ts")

        create_migration_guide()
        changes_made.append("Created MIGRATION_GUIDE.md for developers")

        # Generate support files
        generate_rollback_script()
        create_status_report(changes_made)

        print("\n✅ Phase 3.1 Complete!")
        print(f"\n💾 Backups stored in: {BACKUP_DIR}")
        print(f"🔙 Rollback script: {BACKUP_DIR}/rollback.sh")

        print("\n📋 Changes Made:")
        for change in changes_made:
            print(f"  ✅ {change}")

        print("\n📄 New Files:")
        print("  ✅ packages/core/src/types/MIGRATION_GUIDE.md")

        print("\n🔍 Next Steps:")
        print("  1. Validate changes: pnpm typecheck")
        print("  2. Run tests: pnpm test")
        print("  3. Review MIGRATION_GUIDE.md")
        print("  4. Proceed to Phase 3.2 when ready")

        print("\n⚠️  Phase 3 Strategy:")
        print("  - Phase 3.1 ✅ Core type files (CURRENT)")
        print("  - Phase 3.2 🚀 High-priority service files (NEXT)")
        print("  - Phase 3.3 📋 Medium-priority implementations (PLANNED)")
        print("  - Phase 3.4 📋 Lower-priority files (PLANNED)")

        print("\n💡 This incremental approach ensures safety and allows validation at each step")

    except Exception as e:
        print(f"\n❌ Error during migration: {e}")
        print(f"🔙 Rollback available at: {BACKUP_DIR}/rollback.sh")
        raise

if __name__ == "__main__":
    main()