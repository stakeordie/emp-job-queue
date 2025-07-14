#!/bin/bash

# Script to start fresh local Redis and API server for development
set -e

echo "🔄 Starting local Redis development environment..."

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

# Create local environment for API
echo "🌐 Configuring API for local Redis..."
cat > apps/api/.env.local.dev << EOF
REDIS_URL=redis://localhost:6379
API_PORT=3331
CORS_ORIGINS=http://localhost:3333,http://localhost:3331
EOF

# Start API server with local Redis
echo "🚀 Starting API server with local Redis..."
mkdir -p ../../logs
cd apps/api
REDIS_URL=redis://localhost:6379 pnpm dev 2>&1 | tee ../../logs/api-redis.log