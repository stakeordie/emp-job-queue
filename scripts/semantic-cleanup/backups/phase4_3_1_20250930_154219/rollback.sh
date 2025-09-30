#!/bin/bash
# Rollback script for Phase 4.3.1 migration
# Generated: 2025-09-30 15:42:19

set -e

BACKUP_DIR="/Users/the_dusky/code/emprops/ai_infra/emp-job-queue-semantic-fix/scripts/semantic-cleanup/backups/phase4_3_1_20250930_154219"
REPO_ROOT="/Users/the_dusky/code/emprops/ai_infra/emp-job-queue-semantic-fix"

echo "🔙 Rolling back Phase 4.3.1 migration..."
echo "📁 Backup source: $BACKUP_DIR"
echo "📁 Target: $REPO_ROOT"

# Restore backed up files
if [ -f "$BACKUP_DIR/packages/core/src/redis-service.ts" ]; then
    echo "  Restoring redis-service.ts..."
    cp "$BACKUP_DIR/packages/core/src/redis-service.ts" "$REPO_ROOT/packages/core/src/redis-service.ts"
    echo "  ✅ Restored redis-service.ts"
fi

if [ -f "$BACKUP_DIR/.env.example" ]; then
    echo "  Restoring .env.example..."
    cp "$BACKUP_DIR/.env.example" "$REPO_ROOT/.env.example"
    echo "  ✅ Restored .env.example"
fi

echo "✅ Rollback complete!"
echo ""
echo "🔍 Verify rollback:"
echo "  pnpm typecheck"
echo "  pnpm test"
echo ""
echo "⚠️  Remember to restart services:"
echo "  pnpm restart:api"
echo "  pnpm restart:workers"
