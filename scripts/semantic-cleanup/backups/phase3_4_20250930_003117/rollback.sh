#!/bin/bash
# Rollback script for Phase 3.4 migration
# Generated: 2025-09-30 00:31:17

set -e

BACKUP_DIR="/Users/the_dusky/code/emprops/ai_infra/emp-job-queue-semantic-fix/scripts/semantic-cleanup/backups/phase3_4_20250930_003117"
REPO_ROOT="/Users/the_dusky/code/emprops/ai_infra/emp-job-queue-semantic-fix"

echo "🔙 Rolling back Phase 3.4 migration..."
echo "📁 Backup source: $BACKUP_DIR"
echo "📁 Target: $REPO_ROOT"

# Restore backed up files
if [ -d "$BACKUP_DIR/packages/core/src/redis-functions/__tests__" ]; then
    echo "  Restoring test files..."
    cp -r "$BACKUP_DIR/packages/core/src/redis-functions/__tests__"/* "$REPO_ROOT/packages/core/src/redis-functions/__tests__/" 2>/dev/null || true
    echo "  ✅ Restored test files"
fi

if [ -d "$BACKUP_DIR/apps/docs/src" ]; then
    echo "  Restoring documentation files..."
    cp -r "$BACKUP_DIR/apps/docs/src"/* "$REPO_ROOT/apps/docs/src/" 2>/dev/null || true
    echo "  ✅ Restored documentation files"
fi

# Remove new file if it was created
if [ -f "$REPO_ROOT/apps/docs/src/01-understanding-the-system/semantic-terminology.md" ]; then
    echo "  Removing semantic-terminology.md..."
    rm "$REPO_ROOT/apps/docs/src/01-understanding-the-system/semantic-terminology.md"
    echo "  ✅ Removed semantic-terminology.md"
fi

echo "✅ Rollback complete!"
echo ""
echo "🔍 Verify rollback:"
echo "  pnpm typecheck"
echo "  pnpm test"
