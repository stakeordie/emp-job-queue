#!/bin/bash
# Rollback script for Phase 3.2 migration
# Generated: 2025-09-30 00:23:06

set -e

BACKUP_DIR="/Users/the_dusky/code/emprops/ai_infra/emp-job-queue-semantic-fix/scripts/semantic-cleanup/backups/phase3_2_20250930_002306"
REPO_ROOT="/Users/the_dusky/code/emprops/ai_infra/emp-job-queue-semantic-fix"

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
