#!/bin/bash
# stop-all.sh - Stop all development services

cd "$(dirname "$0")/.."

echo "🛑 Stopping all EmProps development services..."

# Kill all processes by PID files
for pid_file in logs/*.pid; do
    if [ -f "$pid_file" ]; then
        service_name=$(basename "$pid_file" .pid)
        pid=$(cat "$pid_file")

        if kill -0 "$pid" 2>/dev/null; then
            echo "   Stopping $service_name (PID: $pid)"
            kill "$pid"
        else
            echo "   $service_name was already stopped"
        fi

        rm -f "$pid_file"
    fi
done

# Cleanup any remaining processes
pkill -f "pnpm dev:redis" || true
pkill -f "pnpm d:api:run" || true
pkill -f "pnpm d:webhook:run" || true
pkill -f "pnpm dev:monitor" || true
pkill -f "yarn dev:local:dev" || true
pkill -f "pnpm dev:local" || true
pkill -f "pnpm ngrok" || true

echo "✅ All services stopped"
echo "📁 Logs preserved in logs/ directory"