#!/bin/bash

echo "🛑 Shutting down ALL emp-job-queue services..."


# Kill all monitors
echo "🔥 Killing monitors..."
pkill -f "emp-job-queue/apps/monitor"
pkill -f "next dev"

# Wait a moment
sleep 2

# Show what's still running
echo "📊 Checking for remaining processes..."
ps aux | grep -E "(emp-job-queue|redis-server|basic-machine)" | grep -v grep

echo "✅ Shutdown complete!"
echo ""
echo "To start:"
echo "  pnpm dev:monitor"