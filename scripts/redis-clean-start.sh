#!/bin/bash

# Clean Redis startup script
set -e

echo "🧹 Starting fresh Redis instance..."

# Kill any existing Redis processes
echo "📋 Cleaning up existing processes..."
pkill -f redis-server || true
pkill -f dev-redis || true
sleep 2

# Wipe Redis data directory
echo "🗑️ Wiping Redis data..."
rm -rf /opt/homebrew/var/db/redis/* 2>/dev/null || true
rm -f /opt/homebrew/var/log/redis.log 2>/dev/null || true

# Start Redis with minimal config
echo "🚀 Starting Redis on port 6379..."
redis-server --port 6379 --save "" --appendonly no --daemonize yes --loglevel notice

# Wait for Redis to be ready with timeout
echo "⏳ Waiting for Redis..."
timeout=30
count=0
until redis-cli ping > /dev/null 2>&1; do
  if [ $count -ge $timeout ]; then
    echo "❌ Redis failed to start within ${timeout} seconds"
    exit 1
  fi
  sleep 1
  count=$((count + 1))
done

echo "✅ Redis started successfully"

# Install Redis functions
echo "⚙️ Installing Redis functions..."
cd packages/core
pnpm build
node dist/cli/redis-functions.js install
cd ../..

echo "✅ Redis setup complete - ready for development"
echo "📋 To connect: redis-cli"
echo "📋 To stop: pkill redis-server"