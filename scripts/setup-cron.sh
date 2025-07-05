#!/bin/bash

# Setup Cron Job for Job Archival
# This script helps set up automated job archival every 5 minutes

set -e

# Get the absolute path to the project directory
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CRON_SCRIPT="$PROJECT_DIR/dist/cli/cron-archive.js"
LOG_DIR="$PROJECT_DIR/logs"

echo "Setting up cron job for job archival..."
echo "Project directory: $PROJECT_DIR"

# Ensure logs directory exists
mkdir -p "$LOG_DIR"

# Ensure the script is built
if [ ! -f "$CRON_SCRIPT" ]; then
    echo "Building project first..."
    cd "$PROJECT_DIR"
    pnpm build
fi

# Create cron entry
CRON_ENTRY="*/5 * * * * cd $PROJECT_DIR && node $CRON_SCRIPT >> $LOG_DIR/archive.log 2>&1"

echo "Cron entry to add:"
echo "$CRON_ENTRY"
echo ""

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "cron-archive.js"; then
    echo "⚠️  Cron job already exists. Current crontab:"
    crontab -l | grep "cron-archive.js"
    echo ""
    read -p "Replace existing cron job? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Remove existing and add new
        (crontab -l 2>/dev/null | grep -v "cron-archive.js"; echo "$CRON_ENTRY") | crontab -
        echo "✅ Cron job updated"
    else
        echo "❌ Cancelled"
        exit 1
    fi
else
    # Add new cron job
    (crontab -l 2>/dev/null; echo "$CRON_ENTRY") | crontab -
    echo "✅ Cron job added"
fi

echo ""
echo "Current crontab:"
crontab -l

echo ""
echo "📋 Setup complete!"
echo "🔄 Jobs will be archived every 5 minutes"
echo "📝 Logs will be written to: $LOG_DIR/archive.log"
echo "🔍 Monitor with: tail -f $LOG_DIR/archive.log"
echo ""
echo "To remove the cron job later:"
echo "  crontab -e"
echo "  # Then delete the line containing 'cron-archive.js'"