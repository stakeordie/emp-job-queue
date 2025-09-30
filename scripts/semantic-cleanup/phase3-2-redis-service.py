#!/usr/bin/env python3
"""
Phase 3.2: Update Redis Service Implementation
- Update function names: submitJob → submitStep, getJob → getStep, etc.
- Update variable names: jobId → stepId
- Update comments and documentation
- Maintain backwards compatibility where needed
"""

import os
import shutil
import re
from datetime import datetime
from pathlib import Path
from typing import List, Tuple

REPO_ROOT = Path("/Users/the_dusky/code/emprops/ai_infra/emp-job-queue-semantic-fix")
SCRIPT_DIR = Path(__file__).parent
TIMESTAMP = datetime.now().strftime("%Y%m%d_%H%M%S")
BACKUP_DIR = SCRIPT_DIR / "backups" / f"phase3_2_{TIMESTAMP}"

print("🔄 Phase 3.2: Redis Service Implementation Updates")
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

def update_redis_service() -> bool:
    """
    Update packages/core/src/redis-service.ts
    - Add comments explaining Step terminology
    - Keep function names unchanged for backwards compatibility
    - Update internal variable names where safe
    """
    print("\n📝 Updating packages/core/src/redis-service.ts...")

    redis_service_file = REPO_ROOT / "packages/core/src/redis-service.ts"

    if not redis_service_file.exists():
        print("  ❌ redis-service.ts not found")
        return False

    backup_file(redis_service_file)

    content = redis_service_file.read_text(encoding='utf-8')
    original_content = content

    # Add semantic clarification comment at the top
    if "SEMANTIC NOTE" not in content:
        header_comment = """// SEMANTIC NOTE: This file uses "Job" terminology for backwards compatibility
// In the new semantic model:
// - "Job" in this file = "Step" (what workers process)
// - Functions like submitJob(), getJob() handle Steps (worker processing units)
// - For the new "Job" concept (user requests), see types/job-new.ts
//
// This naming is preserved for API backwards compatibility during migration.
// New code should use the Step type from '@emp/core'

"""
        # Insert after the first comment block
        lines = content.split('\n')
        insert_index = 0
        for i, line in enumerate(lines):
            if line.strip() and not line.strip().startswith('//'):
                insert_index = i
                break

        lines.insert(insert_index, header_comment.rstrip())
        content = '\n'.join(lines)

    # Update imports to use Step type alongside Job
    if "import { Job," in content and "Step" not in content.split("import { Job,")[0]:
        content = content.replace(
            "import { Job, JobStatus",
            "import { Job, Step, JobStatus"
        )

    # Update the file
    if content != original_content:
        redis_service_file.write_text(content, encoding='utf-8')
        print("  ✅ Updated redis-service.ts with semantic clarification")
        return True
    else:
        print("  ℹ️  redis-service.ts already up to date")
        return False

def update_redis_service_interface() -> bool:
    """
    Update packages/core/src/interfaces/redis-service.ts
    Add semantic documentation
    """
    print("\n📝 Updating packages/core/src/interfaces/redis-service.ts...")

    interface_file = REPO_ROOT / "packages/core/src/interfaces/redis-service.ts"

    if not interface_file.exists():
        print("  ❌ redis-service interface not found")
        return False

    backup_file(interface_file)

    content = interface_file.read_text(encoding='utf-8')
    original_content = content

    # Add semantic note
    if "SEMANTIC NOTE" not in content:
        header_comment = """// SEMANTIC NOTE: This interface uses "Job" for backwards compatibility
// In the new semantic model, these methods operate on "Steps" (worker processing units)
// Method names preserved for API compatibility during migration
//
// Examples:
// - submitJob() → submits a Step (worker processing unit)
// - getJob() → retrieves a Step
// - completeJob() → marks a Step as complete

"""
        lines = content.split('\n')
        insert_index = 0
        for i, line in enumerate(lines):
            if line.strip().startswith('import'):
                continue
            if line.strip() and not line.strip().startswith('//'):
                insert_index = i
                break

        if insert_index > 0:
            lines.insert(insert_index, header_comment.rstrip())
            content = '\n'.join(lines)

    if content != original_content:
        interface_file.write_text(content, encoding='utf-8')
        print("  ✅ Updated redis-service interface with semantic documentation")
        return True
    else:
        print("  ℹ️  redis-service interface already up to date")
        return False

def create_step_alias_exports() -> bool:
    """
    Add Step-based function aliases to redis-service for new code
    """
    print("\n📝 Adding Step-based function aliases to redis-service.ts...")

    redis_service_file = REPO_ROOT / "packages/core/src/redis-service.ts"

    if not redis_service_file.exists():
        return False

    content = redis_service_file.read_text(encoding='utf-8')
    original_content = content

    # Check if aliases already exist
    if "// Step-based aliases" in content:
        print("  ℹ️  Step aliases already exist")
        return False

    # Add aliases at the end of the class, before the closing brace
    alias_code = """
  // =============================================================================
  // Step-based aliases for new code (semantic clarity)
  // =============================================================================
  // These aliases provide clearer semantics for new code while maintaining
  // backwards compatibility with existing job-based function names

  /**
   * Submit a Step (worker processing unit) to the queue
   * Alias for submitJob() with clearer semantics
   */
  async submitStep(step: Partial<Job>): Promise<string> {
    return this.submitJob(step);
  }

  /**
   * Get a Step by ID
   * Alias for getJob() with clearer semantics
   */
  async getStep(stepId: string): Promise<Job | null> {
    return this.getJob(stepId);
  }

  /**
   * Complete a Step
   * Alias for completeJob() with clearer semantics
   */
  async completeStep(stepId: string, result: { success: boolean; data?: unknown; processing_time?: number }): Promise<void> {
    return this.completeJob(stepId, result);
  }

  /**
   * Fail a Step
   * Alias for failJob() with clearer semantics
   */
  async failStep(stepId: string, error: string, retry = true): Promise<void> {
    return this.failJob(stepId, error, retry);
  }

  /**
   * Cancel a Step
   * Alias for cancelJob() with clearer semantics
   */
  async cancelStep(stepId: string, reason: string): Promise<void> {
    return this.cancelJob(stepId, reason);
  }
"""

    # Find the last closing brace of the class
    lines = content.split('\n')
    last_brace_index = -1
    for i in range(len(lines) - 1, -1, -1):
        if lines[i].strip() == '}' and 'export class RedisService' in content[:content.find('\n'.join(lines[:i]))]:
            last_brace_index = i
            break

    if last_brace_index > 0:
        lines.insert(last_brace_index, alias_code)
        content = '\n'.join(lines)
        redis_service_file.write_text(content, encoding='utf-8')
        print("  ✅ Added Step-based function aliases")
        return True

    return False

def generate_rollback_script() -> None:
    """Generate rollback script"""
    print("\n📝 Creating rollback script...")

    rollback_file = BACKUP_DIR / "rollback.sh"

    rollback_content = f"""#!/bin/bash
# Rollback script for Phase 3.2 migration
# Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

set -e

BACKUP_DIR="{BACKUP_DIR}"
REPO_ROOT="{REPO_ROOT}"

echo "🔙 Rolling back Phase 3.2 migration..."
echo "📁 Backup source: $BACKUP_DIR"
echo "📁 Target: $REPO_ROOT"

# Restore backed up files
if [ -d "$BACKUP_DIR/packages/core/src" ]; then
    echo "  Restoring packages/core/src files..."
    cp -r "$BACKUP_DIR/packages/core/src"/* "$REPO_ROOT/packages/core/src/" 2>/dev/null || true
    echo "  ✅ Restored Redis service files"
fi

echo "✅ Rollback complete!"
echo ""
echo "🔍 Verify rollback:"
echo "  pnpm typecheck"
echo "  pnpm test"
"""

    rollback_file.write_text(rollback_content, encoding='utf-8')
    rollback_file.chmod(0o755)
    print(f"  ✅ Created rollback.sh")

def create_status_report(changes: List[str]) -> None:
    """Create status report"""
    print("\n📝 Creating Phase 3.2 status report...")

    status_file = BACKUP_DIR / "PHASE3_2_STATUS.md"

    status_content = f"""# Phase 3.2 Status Report

**Execution Date:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
**Phase:** 3.2 - Redis Service Implementation Updates

## Changes Made

"""

    if changes:
        for change in changes:
            status_content += f"- ✅ {change}\n"
    else:
        status_content += "- ℹ️  No changes needed (files already up to date)\n"

    status_content += f"""

## Strategy

Phase 3.2 takes a **conservative approach**:

1. **Documentation First**: Add semantic clarification comments
2. **Aliases**: Create Step-based aliases (submitStep, getStep, etc.)
3. **Backwards Compatible**: Keep existing function names unchanged
4. **Gradual Migration**: New code can use Step aliases, old code keeps working

## What This Enables

### For New Code
```typescript
import {{ RedisService }} from '@emp/core';

const redis = new RedisService(redisUrl);

// Use clear Step-based functions
const stepId = await redis.submitStep({{
  service_required: 'image-gen',
  payload: {{ prompt: 'test' }}
}});

const step = await redis.getStep(stepId);
await redis.completeStep(stepId, {{ success: true }});
```

### For Existing Code
```typescript
// Still works exactly as before
const jobId = await redis.submitJob(jobData);
const job = await redis.getJob(jobId);
await redis.completeJob(jobId, result);
```

## Validation

```bash
# Check TypeScript compilation
pnpm typecheck

# Run tests
pnpm test

# Build packages
pnpm --filter=@emp/core build
```

## Rollback

If issues arise:

```bash
# Using rollback script
{BACKUP_DIR}/rollback.sh

# Using git
git checkout -- packages/core/src/redis-service.ts
git checkout -- packages/core/src/interfaces/redis-service.ts
```

## Next Steps

1. Validate Phase 3.2 changes
2. Update worker client to use Step terminology
3. Continue to Phase 3.3 (API server updates)
"""

    status_file.write_text(status_content, encoding='utf-8')
    print(f"  ✅ Created PHASE3_2_STATUS.md")

def main():
    print("\n🔄 Starting Phase 3.2 Migration...")
    print("⚠️  Conservative approach: Documentation + Aliases")

    changes = []

    try:
        if update_redis_service():
            changes.append("Added semantic clarification to redis-service.ts")

        if update_redis_service_interface():
            changes.append("Added semantic documentation to redis-service interface")

        if create_step_alias_exports():
            changes.append("Created Step-based function aliases (submitStep, getStep, etc.)")

        generate_rollback_script()
        create_status_report(changes)

        print("\n✅ Phase 3.2 Complete!")
        print(f"\n💾 Backups stored in: {BACKUP_DIR}")
        print(f"🔙 Rollback script: {BACKUP_DIR}/rollback.sh")

        print("\n📋 Changes Made:")
        for change in changes:
            print(f"  ✅ {change}")

        print("\n🔍 Next Steps:")
        print("  1. Validate changes: pnpm --filter=@emp/core typecheck")
        print("  2. Build: pnpm --filter=@emp/core build")
        print("  3. Test: pnpm test")
        print("  4. Review changes: git diff")

        print("\n💡 What's Available Now:")
        print("  - New code can use: submitStep(), getStep(), completeStep()")
        print("  - Old code keeps working: submitJob(), getJob(), completeJob()")
        print("  - Full backwards compatibility maintained")

    except Exception as e:
        print(f"\n❌ Error during migration: {e}")
        print(f"🔙 Rollback available at: {BACKUP_DIR}/rollback.sh")
        raise

if __name__ == "__main__":
    main()