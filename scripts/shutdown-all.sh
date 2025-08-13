#!/bin/bash

echo "🛑 Shutting down ALL emp-job-queue services..."

# Kill all API servers
echo "🔥 Killing API servers..."
pkill -f "emp-job-queue/apps/api.*tsx.*watch"
pkill -f "emp-job-queue.*api.*dev"
pkill -f "tsx watch src/index.ts"

# Kill all workers
echo "🔥 Killing workers..."
pkill -f "emp-job-queue/apps/worker"
pkill -f "redis-direct-worker"

# Kill all machines
echo "🔥 Killing machines..."
pkill -f "basic-machine"
pkill -f "pm2-ecosystem"

# Kill all monitors
echo "🔥 Killing monitors..."
pkill -f "emp-job-queue/apps/monitor"
pkill -f "next dev"

# Kill all docs servers
echo "🔥 Killing docs servers..."
pkill -f "vitepress dev"
pkill -f "emp-job-queue/apps/docs"

# Kill processes on specific ports (8080, 3000)
echo "🔥 Killing services on ports 8080 and 3000..."
lsof -ti:8080 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Kill Redis
echo "🔥 Killing Redis..."
pkill -f "redis-server"
pkill -f "redis-cli"

# Kill Docker containers
echo "🔥 Stopping all running Docker containers..."
docker stop $(docker ps -q) 2>/dev/null || true

# Kill any remaining node processes in the project
echo "🔥 Killing any remaining project processes..."
pkill -f "emp-job-queue"

# Wait a moment
sleep 2

# Show what's still running
echo "📊 Checking for remaining processes..."
ps aux | grep -E "(emp-job-queue|redis-server|basic-machine)" | grep -v grep

echo "✅ Shutdown complete!"
echo ""
echo "To restart everything:"
echo "  pnpm dev:local-redis"
echo ""
echo "To start individual services:"
echo "  pnpm dev:api"
echo "  pnpm fluentd:up"
echo "  pnpm machines:basic:local:up:build"
echo "  pnpm dev:monitor"