#!/bin/bash
# Rollback script for Phase 2 migration
# Generated: 2025-09-29 21:16:01

set -e

BACKUP_DIR="/Users/the_dusky/code/emprops/ai_infra/emp-job-queue-semantic-fix/scripts/semantic-cleanup/backups/phase2_20250929_211601"
REPO_ROOT="/Users/the_dusky/code/emprops/ai_infra/emp-job-queue-semantic-fix"

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
