#!/bin/bash
# Rollback script for Phase 3 migration
# Generated: 2025-09-29 21:38:38

set -e

BACKUP_DIR="/Users/the_dusky/code/emprops/ai_infra/emp-job-queue-semantic-fix/packages/core/../../scripts/semantic-cleanup/backups/phase3_20250929_213838"
REPO_ROOT="/Users/the_dusky/code/emprops/ai_infra/emp-job-queue-semantic-fix"

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
