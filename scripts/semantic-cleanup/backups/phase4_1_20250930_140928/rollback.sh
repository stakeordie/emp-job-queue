#!/bin/bash
# Rollback script for Phase 4.1 migration
# Generated: 2025-09-30 14:09:28

set -e

BACKUP_DIR="/Users/the_dusky/code/emprops/ai_infra/emp-job-queue/scripts/semantic-cleanup/backups/phase4_1_20250930_140928"
REPO_ROOT="/Users/the_dusky/code/emprops/ai_infra/emp-job-queue"

echo "🔙 Rolling back Phase 4.1 migration..."
echo "📁 Backup source: $BACKUP_DIR"
echo "📁 Target: $REPO_ROOT"

# Restore backed up files
if [ -d "$BACKUP_DIR/packages/core/src/types" ]; then
    echo "  Restoring type files..."
    cp -r "$BACKUP_DIR/packages/core/src/types"/* "$REPO_ROOT/packages/core/src/types/" 2>/dev/null || true
    echo "  ✅ Restored type files"
fi

if [ -f "$BACKUP_DIR/packages/core/src/index.ts" ]; then
    echo "  Restoring index.ts..."
    cp "$BACKUP_DIR/packages/core/src/index.ts" "$REPO_ROOT/packages/core/src/index.ts"
    echo "  ✅ Restored index.ts"
fi

echo "✅ Rollback complete!"
echo ""
echo "🔍 Verify rollback:"
echo "  pnpm typecheck"
echo "  pnpm test"
