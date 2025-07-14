#!/bin/bash

# Stop all services started by dev-full-stack.sh

echo "🛑 Stopping full-stack development environment..."

# Stop all node processes related to our services
echo "📨 Stopping API server..."
pkill -f "tsx watch src/index.ts" 2>/dev/null || true

echo "🖥️  Stopping Monitor UI..."
pkill -f "next dev" 2>/dev/null || true

echo "📡 Stopping Event Stream Logger..."
pkill -f "event-stream-logger.js" 2>/dev/null || true

echo "🐳 Stopping Docker containers..."
cd apps/machines/basic_machine 2>/dev/null && \
docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.override.yml \
  --env-file .env.local.dev \
  --project-name basic-machine-local \
  down 2>/dev/null || true
cd - > /dev/null 2>&1

echo "📨 Stopping Redis server..."
/opt/homebrew/bin/redis-cli shutdown 2>/dev/null || pkill redis-server 2>/dev/null || true

# Also try to kill any lingering processes
echo "🧹 Cleaning up any remaining processes..."
pkill -f "pnpm dev" 2>/dev/null || true
pkill -f "turbo run dev" 2>/dev/null || true

# Check if anything is still running on our ports
echo ""
echo "🔍 Checking service ports..."
ports_in_use=false

if lsof -i :6379 > /dev/null 2>&1; then
    echo "  ⚠️  Port 6379 (Redis) still in use"
    ports_in_use=true
else
    echo "  ✅ Port 6379 (Redis) is free"
fi

if lsof -i :3001 > /dev/null 2>&1; then
    echo "  ⚠️  Port 3001 (API) still in use"
    ports_in_use=true
else
    echo "  ✅ Port 3001 (API) is free"
fi

if lsof -i :3000 > /dev/null 2>&1; then
    echo "  ⚠️  Port 3000 (Monitor) still in use"
    ports_in_use=true
else
    echo "  ✅ Port 3000 (Monitor) is free"
fi

if lsof -i :9092 > /dev/null 2>&1; then
    echo "  ⚠️  Port 9092 (Machine) still in use"
    ports_in_use=true
else
    echo "  ✅ Port 9092 (Machine) is free"
fi

echo ""
if [ "$ports_in_use" = true ]; then
    echo "⚠️  Some services may still be running. You can check with:"
    echo "  lsof -i :6379  # Redis"
    echo "  lsof -i :3001  # API"
    echo "  lsof -i :3000  # Monitor"
    echo "  lsof -i :9092  # Machine"
    echo ""
    echo "To force kill processes on a port:"
    echo "  kill -9 \$(lsof -t -i:PORT)"
else
    echo "✅ All services stopped successfully!"
fi

echo ""
echo "📝 Log files are preserved in:"
echo "  logs/api-redis.log"
echo "  logs/monitor.log"
echo "  logs/machine.log"
echo "  logs/monitorEventStream.log"
echo ""
echo "💡 To restart, run: pnpm dev:full-stack"