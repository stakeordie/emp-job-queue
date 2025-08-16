#!/bin/bash

# Script to start Redis only for development
set -e

echo "🔄 Starting Redis for development..."

# Kill any existing Redis instances
echo "📋 Stopping existing Redis instances..."
pkill redis-server || true
sleep 2

# Start Redis server in background with logging
echo "🚀 Starting fresh Redis server on port 6379..."
# Check if Homebrew Redis config exists and use it for logging
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
echo "✅ Redis is ready"

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