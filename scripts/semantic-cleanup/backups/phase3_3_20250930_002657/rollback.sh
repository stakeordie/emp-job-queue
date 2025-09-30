#!/bin/bash
# Rollback script for Phase 3.3 migration
# Generated: 2025-09-30 00:26:57

set -e

BACKUP_DIR="/Users/the_dusky/code/emprops/ai_infra/emp-job-queue-semantic-fix/scripts/semantic-cleanup/backups/phase3_3_20250930_002657"
REPO_ROOT="/Users/the_dusky/code/emprops/ai_infra/emp-job-queue-semantic-fix"

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
