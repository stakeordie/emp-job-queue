#!/bin/bash

# Start development environment with split terminals
# This script will open multiple terminal tabs/panes for each service

echo "🧹 Cleaning up existing processes..."
pkill -f 'pnpm.*dev' 2>/dev/null
for port in 3000 3331 8080 6379; do
  lsof -ti:$port | xargs -r kill -9 2>/dev/null
done
echo "✅ Cleanup complete"

echo "🚀 Starting development environment..."

# Get the project root directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Function to open new terminal tab (macOS specific)
new_tab() {
  local title="$1"
  local command="$2"
  
  osascript <<EOF
tell application "Terminal"
    do script "cd '$PROJECT_ROOT' && echo '🚀 $title' && $command"
    set custom title of front window to "$title"
end tell
EOF
}

# Start each service in a new terminal tab
echo "📱 Opening Redis terminal..."
new_tab "Redis Server" "pnpm dev:local-redis"

sleep 2
echo "📱 Opening API terminal..."
new_tab "API Server" "pnpm dev:api"

sleep 2  
echo "📱 Opening Monitor terminal..."
new_tab "Monitor Server" "pnpm dev:monitor"

sleep 2
echo "📱 Opening Webhook terminal..."
new_tab "Webhook Server" "pnpm dev:webhook"

echo "✅ All services started in separate terminals!"
echo "📋 Services:"
echo "   - Redis: Check first terminal"
echo "   - API: http://localhost:3000 (second terminal)"
echo "   - Monitor: http://localhost:3331 (third terminal)"  
echo "   - Webhook: http://localhost:8080 (fourth terminal)"