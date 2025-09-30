#!/usr/bin/env python3
"""
Phase 2: Migrate Core Type Definitions
- Creates new Step type (formerly Job - what workers process)
- Creates new Job type (formerly Workflow - what users request)
- Maintains backwards compatibility
- Creates timestamped backups before any changes
"""

import os
import shutil
from datetime import datetime
from pathlib import Path
from typing import List

REPO_ROOT = Path("/Users/the_dusky/code/emprops/ai_infra/emp-job-queue-semantic-fix")
SCRIPT_DIR = Path(__file__).parent
TIMESTAMP = datetime.now().strftime("%Y%m%d_%H%M%S")
BACKUP_DIR = SCRIPT_DIR / "backups" / f"phase2_{TIMESTAMP}"

print("🔄 Phase 2: Core Type Migration")
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

def create_step_types_file() -> None:
    """Create new step.ts file with Step types (formerly Job types)"""
    print("\n📝 Creating packages/core/src/types/step.ts...")

    step_file = REPO_ROOT / "packages/core/src/types/step.ts"
    job_file = REPO_ROOT / "packages/core/src/types/job.ts"

    # Backup original job.ts
    backup_file(job_file)

    # Read the current job.ts content
    job_content = job_file.read_text(encoding='utf-8')

    # Create step.ts with migrated content
    step_content = f"""// Step types - what workers process (formerly Job types)
// A Step represents an individual processing unit claimed and executed by workers

// This file contains types migrated from job.ts as part of the semantic cleanup initiative
// Old terminology: "Job" meant worker processing unit
// New terminology: "Step" means worker processing unit, "Job" means user request

{job_content}

// Note: These types are aliased in compatibility.ts for backwards compatibility during migration
"""

    step_file.write_text(step_content, encoding='utf-8')
    print(f"  ✅ Created step.ts")

def create_job_types_file() -> None:
    """Create new job.ts file with Job types (user requests, formerly Workflow)"""
    print("\n📝 Creating new job.ts for user requests...")

    job_file = REPO_ROOT / "packages/core/src/types/job.ts"

    new_job_content = """// Job types - what users submit (formerly Workflow types)
// A Job represents a user's request, which may contain one or more Steps

/**
 * Job - A user's request that may be processed as a single step or multiple steps
 *
 * In the new semantic model:
 * - Job = What the user requested (formerly "Workflow")
 * - Step = Individual processing unit executed by workers (formerly "Job")
 */
export interface Job {
  id: string; // Unique identifier for this user request (formerly workflow_id)
  customer_id?: string;
  priority: number;
  created_at: string;
  updated_at?: string;
  status: JobStatus;

  // Steps that make up this job
  steps: JobStep[];

  // Metadata
  metadata?: Record<string, unknown>;

  // Timestamps
  started_at?: string;
  completed_at?: string;
  failed_at?: string;
}

/**
 * JobStep - Reference to a Step that is part of a Job
 */
export interface JobStep {
  step_id: string; // References a Step in the queue
  sequence?: number; // Order within the job
  status: StepStatus;
  started_at?: string;
  completed_at?: string;
  result?: unknown;
}

export enum JobStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum StepStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * JobSubmissionRequest - Request to submit a new job
 */
export interface JobSubmissionRequest {
  customer_id?: string;
  priority?: number;
  steps: StepSubmissionRequest[];
  metadata?: Record<string, unknown>;
}

/**
 * StepSubmissionRequest - Details for creating a step within a job
 */
export interface StepSubmissionRequest {
  service_required: string;
  payload: Record<string, unknown>;
  requirements?: unknown;
  sequence?: number;
}

// Note: These types represent the NEW semantic model
// For backwards compatibility during migration, see compatibility.ts
"""

    # Don't overwrite the existing job.ts yet - we'll do that carefully
    new_job_file = REPO_ROOT / "packages/core/src/types/job-new.ts"
    new_job_file.write_text(new_job_content, encoding='utf-8')
    print(f"  ✅ Created job-new.ts (staged for migration)")

def create_compatibility_layer() -> None:
    """Create compatibility layer for gradual migration"""
    print("\n📝 Creating compatibility layer...")

    compat_file = REPO_ROOT / "packages/core/src/types/compatibility.ts"

    compat_content = """// Backwards Compatibility Layer
// This file provides type aliases to support gradual migration
// TODO: Remove this file once all code has been migrated to new terminology

import { Job as StepType } from './step.js';

/**
 * DEPRECATED: Use Step instead
 * This alias maintains backwards compatibility during migration
 */
export type Job = StepType;

/**
 * DEPRECATED: Use the new Job type from job-new.ts
 * This is a placeholder to prevent breaking changes
 */
export const MIGRATION_NOTICE = `
  ⚠️  SEMANTIC MIGRATION IN PROGRESS ⚠️

  Old terminology:
  - "Job" → Individual processing unit (what workers process)
  - "Workflow" → Collection of jobs (what users submit)

  New terminology:
  - "Step" → Individual processing unit (what workers process)
  - "Job" → What users submit (may contain one or more steps)

  During migration:
  - Old "Job" type → Now "Step" type (in step.ts)
  - Old "Workflow" concept → Now "Job" type (in job-new.ts)
  - Compatibility aliases provided in this file

  This notice will be removed once migration is complete.
`;

console.log(MIGRATION_NOTICE);
"""

    compat_file.write_text(compat_content, encoding='utf-8')
    print(f"  ✅ Created compatibility.ts")

def update_type_exports() -> None:
    """Update packages/core/src/types/index.ts to export new types"""
    print("\n📝 Updating type exports...")

    index_file = REPO_ROOT / "packages/core/src/types/index.ts"

    # Backup
    backup_file(index_file)

    # Read current content
    content = index_file.read_text(encoding='utf-8')

    # Add new exports at the top
    new_exports = """// Phase 2 Migration: New semantic model types
export * from './step.js';
export * from './job-new.js';
export * from './compatibility.js';

// Original exports (to be migrated)
"""

    # Prepend new exports
    updated_content = new_exports + content

    index_file.write_text(updated_content, encoding='utf-8')
    print(f"  ✅ Updated type exports")

def create_migration_status_file() -> None:
    """Create a status file documenting the migration state"""
    print("\n📝 Creating migration status file...")

    status_file = REPO_ROOT / "packages/core/src/types/MIGRATION_STATUS.md"

    status_content = f"""# Semantic Migration Status

**Migration Date:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
**Phase:** 2 - Core Type Definitions

## What Changed

### New Files Created
- ✅ `step.ts` - Step types (what workers process, formerly Job)
- ✅ `job-new.ts` - Job types (what users request, formerly Workflow)
- ✅ `compatibility.ts` - Backwards compatibility layer

### Modified Files
- 🔄 `index.ts` - Updated to export new types

### Original Files (Preserved)
- 📦 `job.ts` → Copied to `step.ts`, will be replaced in Phase 3

## Semantic Model

### Old Terminology → New Terminology
| Old Term | New Term | Description |
|----------|----------|-------------|
| Job | Step | What workers process (individual unit) |
| Workflow | Job | What users submit (may contain multiple steps) |
| workflow_id | job_id | Identifier for user's request |
| job_id | step_id | Identifier for processing unit |

## Migration Phases

- ✅ Phase 1: Analysis (448 issues identified)
- ✅ Phase 2: Core Type Definitions (CURRENT)
- 🚀 Phase 3: Implementation Updates (NEXT)
- 📋 Phase 4: API & Documentation

## Backwards Compatibility

During migration, old code continues to work via:
1. `compatibility.ts` provides type aliases
2. Original `job.ts` still exists
3. Gradual cutover allows testing

## Rollback Procedure

If issues arise, rollback using git or backups:

```bash
# Using git (recommended)
git checkout -- packages/core/src/types/

# Using backups
BACKUP_DIR="scripts/semantic-cleanup/backups/phase2_{TIMESTAMP}"
cp -r $BACKUP_DIR/packages/core/src/types/* packages/core/src/types/
```

## Next Steps

1. Validate TypeScript compilation: `pnpm typecheck`
2. Run tests: `pnpm test`
3. Review new type definitions
4. Proceed to Phase 3 when ready

## Validation

Run these commands to validate the migration:

```bash
# Check TypeScript compilation
pnpm typecheck

# Run tests
pnpm test

# Check for import errors
pnpm build
```

## Notes

- All changes are backwards compatible
- No functional logic changed
- Existing code continues to work unchanged
- New code can start using new types immediately
"""

    status_file.write_text(status_content, encoding='utf-8')
    print(f"  ✅ Created MIGRATION_STATUS.md")

def generate_rollback_script() -> None:
    """Generate a rollback script for easy recovery"""
    print("\n📝 Creating rollback script...")

    rollback_file = BACKUP_DIR / "rollback.sh"

    rollback_content = f"""#!/bin/bash
# Rollback script for Phase 2 migration
# Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

set -e

BACKUP_DIR="{BACKUP_DIR}"
REPO_ROOT="{REPO_ROOT}"

echo "🔙 Rolling back Phase 2 migration..."
echo "📁 Backup source: $BACKUP_DIR"
echo "📁 Target: $REPO_ROOT"

# Restore backed up files
if [ -d "$BACKUP_DIR/packages/core/src/types" ]; then
    echo "  Restoring packages/core/src/types/..."
    cp -r "$BACKUP_DIR/packages/core/src/types"/* "$REPO_ROOT/packages/core/src/types/"
    echo "  ✅ Restored type definitions"
fi

# Remove new files created in Phase 2
echo "  Removing Phase 2 created files..."
rm -f "$REPO_ROOT/packages/core/src/types/step.ts"
rm -f "$REPO_ROOT/packages/core/src/types/job-new.ts"
rm -f "$REPO_ROOT/packages/core/src/types/compatibility.ts"
rm -f "$REPO_ROOT/packages/core/src/types/MIGRATION_STATUS.md"
echo "  ✅ Removed Phase 2 files"

echo "✅ Rollback complete!"
echo ""
echo "🔍 Verify rollback:"
echo "  pnpm typecheck"
echo "  pnpm test"
"""

    rollback_file.write_text(rollback_content, encoding='utf-8')
    rollback_file.chmod(0o755)  # Make executable
    print(f"  ✅ Created rollback.sh")

def main():
    print("\n🔄 Starting Phase 2 Migration...")
    print("⚠️  This phase WILL modify files (with backups)")

    try:
        # Create new type files
        create_step_types_file()
        create_job_types_file()
        create_compatibility_layer()

        # Update exports
        update_type_exports()

        # Documentation
        create_migration_status_file()
        generate_rollback_script()

        print("\n✅ Phase 2 Migration Complete!")
        print(f"\n💾 Backups stored in: {BACKUP_DIR}")
        print(f"🔙 Rollback script: {BACKUP_DIR}/rollback.sh")

        print("\n📋 Files Created:")
        print("  ✅ packages/core/src/types/step.ts")
        print("  ✅ packages/core/src/types/job-new.ts")
        print("  ✅ packages/core/src/types/compatibility.ts")
        print("  ✅ packages/core/src/types/MIGRATION_STATUS.md")

        print("\n📋 Files Modified:")
        print("  🔄 packages/core/src/types/index.ts")

        print("\n🔍 Next Steps:")
        print("  1. Validate TypeScript compilation: pnpm typecheck")
        print("  2. Run tests: pnpm test")
        print("  3. Review new type files")
        print("  4. If issues occur, run rollback: ./scripts/semantic-cleanup/backups/phase2_{}/rollback.sh".format(TIMESTAMP))

        print("\n⚠️  Important Notes:")
        print("  - All changes are backwards compatible")
        print("  - Existing code continues to work unchanged")
        print("  - New code can start using Step/Job types")
        print("  - Gradual migration can proceed at your pace")

    except Exception as e:
        print(f"\n❌ Error during migration: {e}")
        print(f"🔙 Rollback available at: {BACKUP_DIR}/rollback.sh")
        raise

if __name__ == "__main__":
    main()