#!/usr/bin/env python3
"""
Phase 3.3: Update API Server and Worker Implementation
- Add semantic clarification documentation
- Update comments to reflect Step terminology
- Maintain backwards compatibility
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
BACKUP_DIR = SCRIPT_DIR / "backups" / f"phase3_3_{TIMESTAMP}"

print("🔄 Phase 3.3: API Server and Worker Implementation Updates")
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

def update_api_server() -> bool:
    """
    Update apps/api/src/lightweight-api-server.ts
    Add semantic clarification documentation
    """
    print("\n📝 Updating apps/api/src/lightweight-api-server.ts...")

    api_file = REPO_ROOT / "apps/api/src/lightweight-api-server.ts"

    if not api_file.exists():
        print("  ❌ lightweight-api-server.ts not found")
        return False

    backup_file(api_file)

    content = api_file.read_text(encoding='utf-8')
    original_content = content

    # Add semantic clarification comment at the top
    if "SEMANTIC NOTE" not in content:
        header_comment = """// SEMANTIC NOTE: This API server uses "Job" terminology for backwards compatibility
// In the new semantic model:
// - "Job" in this file = "Step" (individual worker processing unit)
// - API endpoints like /submit-job actually handle Steps (worker processing units)
// - For the new "Job" concept (user requests containing multiple steps), see future Workflow API
//
// This naming is preserved for client backwards compatibility during migration.
// Example: submitJob() submits a Step to be processed by a worker

"""
        # Insert after the first comment block
        lines = content.split('\n')
        insert_index = 0
        for i, line in enumerate(lines):
            if line.strip() and not line.strip().startswith('//'):
                insert_index = i
                break

        if insert_index > 0:
            lines.insert(insert_index, header_comment.rstrip())
            content = '\n'.join(lines)

    # Update key comments in the file
    replacements = [
        (
            "// Job submission (modern HTTP endpoint)",
            "// Step submission (modern HTTP endpoint)\n    // Note: Called 'job' for backwards compatibility, but submits a Step"
        ),
        (
            "// Job status query",
            "// Step status query\n    // Note: Called 'job' for backwards compatibility, but queries a Step"
        ),
        (
            "// Job list endpoint",
            "// Step list endpoint\n    // Note: Called 'jobs' for backwards compatibility, but lists Steps"
        ),
    ]

    for old, new in replacements:
        if old in content:
            content = content.replace(old, new)

    if content != original_content:
        api_file.write_text(content, encoding='utf-8')
        print("  ✅ Updated lightweight-api-server.ts with semantic clarification")
        return True
    else:
        print("  ℹ️  lightweight-api-server.ts already up to date")
        return False

def update_worker_client() -> bool:
    """
    Update apps/worker/src/redis-direct-worker-client.ts
    Add semantic clarification documentation
    """
    print("\n📝 Updating apps/worker/src/redis-direct-worker-client.ts...")

    worker_file = REPO_ROOT / "apps/worker/src/redis-direct-worker-client.ts"

    if not worker_file.exists():
        print("  ❌ redis-direct-worker-client.ts not found")
        return False

    backup_file(worker_file)

    content = worker_file.read_text(encoding='utf-8')
    original_content = content

    # Add semantic clarification comment at the top
    if "SEMANTIC NOTE" not in content:
        header_comment = """// SEMANTIC NOTE: This worker client uses "Job" terminology for backwards compatibility
// In the new semantic model:
// - "Job" in this file = "Step" (individual worker processing unit)
// - Workers request, claim, and process Steps (not full user Jobs)
// - requestJob() requests a Step from the queue
// - claimJob() claims a Step for processing
//
// This naming is preserved for API backwards compatibility during migration.
// Workers operate on Steps - individual processing units from the work queue.

"""
        # Insert after the first comment block
        lines = content.split('\n')
        insert_index = 0
        for i, line in enumerate(lines):
            if line.strip() and not line.strip().startswith('//'):
                insert_index = i
                break

        if insert_index > 0:
            lines.insert(insert_index, header_comment.rstrip())
            content = '\n'.join(lines)

    # Update key function documentation
    replacements = [
        (
            "  /**\n   * Convert Redis job data (strings) to typed Job object\n   */",
            "  /**\n   * Convert Redis step data (strings) to typed Job object\n   * Note: Returns 'Job' type for backwards compatibility, but represents a Step\n   */"
        ),
        (
            "  async requestJob(capabilities: WorkerCapabilities): Promise<Job | null> {",
            "  /**\n   * Request a Step from the queue\n   * Note: Called 'requestJob' for backwards compatibility, but requests a Step\n   */\n  async requestJob(capabilities: WorkerCapabilities): Promise<Job | null> {"
        ),
    ]

    for old, new in replacements:
        if old in content:
            content = content.replace(old, new)

    if content != original_content:
        worker_file.write_text(content, encoding='utf-8')
        print("  ✅ Updated redis-direct-worker-client.ts with semantic clarification")
        return True
    else:
        print("  ℹ️  redis-direct-worker-client.ts already up to date")
        return False

def generate_rollback_script() -> None:
    """Generate rollback script"""
    print("\n📝 Creating rollback script...")

    rollback_file = BACKUP_DIR / "rollback.sh"

    rollback_content = f"""#!/bin/bash
# Rollback script for Phase 3.3 migration
# Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

set -e

BACKUP_DIR="{BACKUP_DIR}"
REPO_ROOT="{REPO_ROOT}"

echo "🔙 Rolling back Phase 3.3 migration..."
echo "📁 Backup source: $BACKUP_DIR"
echo "📁 Target: $REPO_ROOT"

# Restore backed up files
if [ -d "$BACKUP_DIR/apps/api/src" ]; then
    echo "  Restoring apps/api/src files..."
    cp -r "$BACKUP_DIR/apps/api/src"/* "$REPO_ROOT/apps/api/src/" 2>/dev/null || true
    echo "  ✅ Restored API server files"
fi

if [ -d "$BACKUP_DIR/apps/worker/src" ]; then
    echo "  Restoring apps/worker/src files..."
    cp -r "$BACKUP_DIR/apps/worker/src"/* "$REPO_ROOT/apps/worker/src/" 2>/dev/null || true
    echo "  ✅ Restored worker files"
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
    print("\n📝 Creating Phase 3.3 status report...")

    status_file = BACKUP_DIR / "PHASE3_3_STATUS.md"

    status_content = f"""# Phase 3.3 Status Report

**Execution Date:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
**Phase:** 3.3 - API Server and Worker Implementation Updates

## Changes Made

"""

    if changes:
        for change in changes:
            status_content += f"- ✅ {change}\n"
    else:
        status_content += "- ℹ️  No changes needed (files already up to date)\n"

    status_content += f"""

## Strategy

Phase 3.3 continues the **conservative documentation approach**:

1. **Semantic Clarity**: Add comments explaining Step vs Job terminology
2. **Backwards Compatible**: Preserve all existing API endpoints and function names
3. **Client Compatibility**: External clients continue using existing endpoints
4. **Developer Guidance**: Clear documentation for maintainers

## What This Clarifies

### API Server (`apps/api/src/lightweight-api-server.ts`)
- POST `/submit-job` → Submits a Step (worker processing unit)
- GET `/job/:id` → Retrieves Step status
- GET `/jobs` → Lists Steps in queue
- WebSocket events → Step lifecycle events

### Worker Client (`apps/worker/src/redis-direct-worker-client.ts`)
- `requestJob()` → Requests a Step from the queue
- `claimJob()` → Claims a Step for processing
- `updateJobStatus()` → Updates Step status
- Workers process Steps, not full user Jobs

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
# Using rollback script
{BACKUP_DIR}/rollback.sh

# Using git
git checkout -- apps/api/src/lightweight-api-server.ts
git checkout -- apps/worker/src/redis-direct-worker-client.ts
```

## Next Steps

1. Validate Phase 3.3 changes
2. Update tests to use Step terminology (Phase 3.4)
3. Update documentation (Phase 3.4)
4. Consider creating new Workflow API for multi-step user jobs

## Impact Assessment

- **Breaking Changes**: None
- **API Compatibility**: 100% preserved
- **Client Impact**: Zero - all existing clients continue working
- **Documentation Impact**: Improved clarity for developers
"""

    status_file.write_text(status_content, encoding='utf-8')
    print(f"  ✅ Created PHASE3_3_STATUS.md")

def main():
    print("\n🔄 Starting Phase 3.3 Migration...")
    print("⚠️  Conservative approach: Documentation only")

    changes = []

    try:
        if update_api_server():
            changes.append("Added semantic clarification to lightweight-api-server.ts")

        if update_worker_client():
            changes.append("Added semantic clarification to redis-direct-worker-client.ts")

        generate_rollback_script()
        create_status_report(changes)

        print("\n✅ Phase 3.3 Complete!")
        print(f"\n💾 Backups stored in: {BACKUP_DIR}")
        print(f"🔙 Rollback script: {BACKUP_DIR}/rollback.sh")

        print("\n📋 Changes Made:")
        if changes:
            for change in changes:
                print(f"  ✅ {change}")
        else:
            print("  ℹ️  No changes needed")

        print("\n🔍 Next Steps:")
        print("  1. Validate changes: pnpm typecheck")
        print("  2. Build: pnpm build")
        print("  3. Test: pnpm test")
        print("  4. Review changes: git diff")

        print("\n💡 What's Documented Now:")
        print("  - API server endpoints documented as handling Steps")
        print("  - Worker client functions documented as processing Steps")
        print("  - Full backwards compatibility maintained")
        print("  - Developer clarity improved")

    except Exception as e:
        print(f"\n❌ Error during migration: {e}")
        print(f"🔙 Rollback available at: {BACKUP_DIR}/rollback.sh")
        raise

if __name__ == "__main__":
    main()