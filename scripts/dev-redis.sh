#!/bin/bash

# Script to start Redis only for development
set -e

echo "🔄 Starting Redis for development..."

# Kill any existing Redis instances
echo "📋 Stopping existing Redis instances..."
pkill redis-server || true
sleep 2

# Start Redis server in foreground with logging
echo "🚀 Starting fresh Redis server on port 6379..."
echo "📋 Logs will be displayed below (use Ctrl+C to stop)"

# Start Redis in background first to install functions
if [ -f /opt/homebrew/etc/redis.conf ]; then
    /opt/homebrew/bin/redis-server /opt/homebrew/etc/redis.conf --daemonize yes
else
    /opt/homebrew/bin/redis-server --daemonize yes --port 6379 --logfile /opt/homebrew/var/log/redis.log
fi

# Wait for Redis to be ready
echo "⏳ Waiting for Redis to be ready..."
until /opt/homebrew/bin/redis-cli ping > /dev/null 2>&1; do
  sleep 1
done
echo "✅ Redis is ready for function installation"

# Check if Redis functions need to be installed
echo "🔧 Checking Redis functions..."
cd packages/core

# Build core package first
echo "📦 Building core package..."
pnpm build

# Install Redis functions
echo "⚙️  Installing Redis functions..."
node dist/cli/redis-functions.js install

cd ../..

echo "✅ Redis setup complete - ready for development"

# Stop the background Redis and restart in foreground for logs
echo "🔄 Restarting Redis in foreground for log visibility..."
pkill redis-server || true
sleep 1

# Start Redis in foreground
echo "📋 Starting Redis with live logs (use Ctrl+C to stop)..."
if [ -f /opt/homebrew/etc/redis.conf ]; then
    exec /opt/homebrew/bin/redis-server /opt/homebrew/etc/redis.conf
else
    exec /opt/homebrew/bin/redis-server --port 6379
fi