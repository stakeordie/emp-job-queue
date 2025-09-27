#!/bin/bash
# start-all.sh - Start all development services in background with centralized logging

set -e
cd "$(dirname "$0")/.."

echo "🚀 Starting all EmProps development services..."
mkdir -p logs

# Function to start service and save PID
start_service() {
    local name=$1
    local command=$2
    local dir=${3:-$(pwd)}
    local central_logs="$(pwd)/logs"

    echo "   Starting ${name}..."
    (cd "$dir" && eval "$command") > "$central_logs/${name}.log" 2>&1 &
    echo $! > "$central_logs/${name}.pid"
    sleep 2
}

# Core job queue services
start_service "redis" "pnpm dev:redis"
start_service "api" "pnpm d:api:run local-dev"
start_service "webhook" "pnpm d:webhook:run local-dev"
start_service "monitor" "pnpm dev:monitor --env local-dev"

# EmProps services
start_service "emprops-api" "yarn dev:local:dev" "/Users/the_dusky/code/emprops/emprops-open-api"
start_service "emprops-ui" "yarn dev:local:dev" "/Users/the_dusky/code/emprops/core-services/emprops-open-interface"

# Mini-app services
start_service "miniapp" "PORT=3002 pnpm dev:local" "/Users/the_dusky/code/emerge/emerge-mini-app"
start_service "miniapp-ngrok" "pnpm ngrok:local" "/Users/the_dusky/code/emerge/emerge-mini-app"

# Job queue ngrok tunnels
start_service "ngrok-tunnels" "pnpm ngrok"

echo ""
echo "✅ All services started! PIDs saved to logs/*.pid"
echo ""
echo "📁 Individual logs: logs/"
echo "🔧 Restart service: pnpm dash:dev:restart <service>"
echo "🛑 Stop all: ./scripts/stop-all.sh"