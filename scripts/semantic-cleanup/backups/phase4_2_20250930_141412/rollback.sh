#!/bin/bash
# Rollback script for Phase 4.2 migration
# Generated: 2025-09-30 14:14:12

set -e

BACKUP_DIR="/Users/the_dusky/code/emprops/ai_infra/emp-job-queue/scripts/semantic-cleanup/backups/phase4_2_20250930_141412"
REPO_ROOT="/Users/the_dusky/code/emprops/ai_infra/emp-job-queue"

echo "🔙 Rolling back Phase 4.2 migration..."
echo "📁 Backup source: $BACKUP_DIR"
echo "📁 Target: $REPO_ROOT"

# Restore backed up files
if [ -d "$BACKUP_DIR/packages/core/src" ]; then
    echo "  Restoring redis-service files..."
    [ -f "$BACKUP_DIR/packages/core/src/redis-service.ts" ] && cp "$BACKUP_DIR/packages/core/src/redis-service.ts" "$REPO_ROOT/packages/core/src/redis-service.ts"
    [ -f "$BACKUP_DIR/packages/core/src/interfaces/redis-service.ts" ] && cp "$BACKUP_DIR/packages/core/src/interfaces/redis-service.ts" "$REPO_ROOT/packages/core/src/interfaces/redis-service.ts"
    echo "  ✅ Restored redis-service files"
fi

echo "✅ Rollback complete!"
echo ""
echo "🔍 Verify rollback:"
echo "  pnpm typecheck"
echo "  pnpm test"
