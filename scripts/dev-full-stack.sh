#!/bin/bash

# Full Stack Development Setup
# Starts Redis + API + Monitor + Machine with centralized logging

set -e

echo "🚀 Starting full-stack development environment..."
echo "📊 All logs will be written to logs/ directory"

# Create logs directory
mkdir -p logs

# Function to cleanup background processes on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down all services..."
    
    # Kill background processes
    [[ ! -z "$api_pid" ]] && kill $api_pid 2>/dev/null || true
    [[ ! -z "$monitor_pid" ]] && kill $monitor_pid 2>/dev/null || true
    [[ ! -z "$machine_pid" ]] && kill $machine_pid 2>/dev/null || true
    [[ ! -z "$eventstream_pid" ]] && kill $eventstream_pid 2>/dev/null || true
    
    # Kill docker containers
    echo "🐳 Stopping Docker containers..."
    pnpm machines:basic:local:down 2>/dev/null || true
    
    # Kill Redis
    echo "📨 Stopping Redis..."
    pkill redis-server 2>/dev/null || true
    
    echo "✅ Cleanup complete"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

echo ""
echo "🔧 Starting Redis server..."

# Kill any existing Redis instances first
pkill redis-server 2>/dev/null || true
sleep 1

# Start Redis server with logging
if [ -f /opt/homebrew/etc/redis.conf ]; then
    /opt/homebrew/bin/redis-server /opt/homebrew/etc/redis.conf --daemonize yes
else
    /opt/homebrew/bin/redis-server --daemonize yes --port 6379 --logfile /opt/homebrew/var/log/redis.log
fi

# Wait for Redis to be ready
echo "⏳ Waiting for Redis to be ready..."
timeout=30
counter=0
while ! /opt/homebrew/bin/redis-cli ping > /dev/null 2>&1; do
    sleep 1
    counter=$((counter + 1))
    if [ $counter -ge $timeout ]; then
        echo "❌ Redis failed to start within $timeout seconds"
        cleanup
        exit 1
    fi
done
echo "✅ Redis is ready"

echo ""
echo "🔧 Setting up Redis functions and starting API..."

# Now run the rest of the setup (core build, Redis functions, API)
cd packages/core
echo "📦 Building core package..."
pnpm build

echo "⚙️  Installing Redis functions..."
node dist/cli/redis-functions.js install

cd ../..

# Configure and start API
echo "🌐 Configuring API for local Redis..."
cat > apps/api/.env.local.dev << EOF
REDIS_URL=redis://localhost:6379
API_PORT=3331
CORS_ORIGINS=http://localhost:3333,http://localhost:3331
EOF

echo "🚀 Starting API server..."
cd apps/api
REDIS_URL=redis://localhost:6379 pnpm dev > ../../logs/api-redis.log 2>&1 &
api_pid=$!
cd ../..

# Wait for API to be ready
echo "⏳ Waiting for API server to be ready..."
timeout=60
counter=0
while ! curl -s http://localhost:3331/health > /dev/null 2>&1; do
    sleep 2
    counter=$((counter + 2))
    if [ $counter -ge $timeout ]; then
        echo "❌ API server failed to start within $timeout seconds"
        cleanup
        exit 1
    fi
done
echo "✅ API server is ready"

echo ""
echo "🖥️  Starting Monitor UI..."
cd apps/monitor
pnpm dev > ../../logs/monitor.log 2>&1 &
monitor_pid=$!
cd ../..

# Wait for Monitor to be ready
echo "⏳ Waiting for Monitor UI to be ready..."
timeout=60
counter=0
while ! curl -s http://localhost:3333 > /dev/null 2>&1; do
    sleep 2
    counter=$((counter + 2))
    if [ $counter -ge $timeout ]; then
        echo "❌ Monitor UI failed to start within $timeout seconds"
        cleanup
        exit 1
    fi
done
echo "✅ Monitor UI is ready"

echo ""
echo "🔄 Starting Event Stream Logger..."
node tools/event-stream-logger.js > logs/monitorEventStream.log 2>&1 &
eventstream_pid=$!

echo ""
echo "🏗️  Building and starting Machine..."
pnpm machines:basic:local:up > logs/machine.log 2>&1 &
machine_pid=$!

echo ""
echo "✅ Full stack started successfully!"
echo ""
echo "📊 Services:"
echo "  🔗 API Server:      http://localhost:3331"
echo "  🖥️  Monitor UI:      http://localhost:3333"
echo "  🏭 Machine Health:  http://localhost:9092/health"
echo "  🧪 Simulation:     http://localhost:8299"
echo "  🎨 ComfyUI GPU0:    http://localhost:3190"
echo "  🎨 ComfyUI GPU1:    http://localhost:3191"
echo ""
echo "📝 Log Files:"
echo "  📨 API + Redis:     logs/api-redis.log"
echo "  🔴 Redis Server:    /opt/homebrew/var/log/redis.log"
echo "  🖥️  Monitor UI:      logs/monitor.log"
echo "  🏭 Machine:         logs/machine.log"
echo "  📡 Event Stream:    logs/monitorEventStream.log"
echo ""
echo "🛠️  Useful Commands:"
echo "  📖 View all logs:   pnpm logs:all"
echo "  📊 API+Redis logs:  pnpm logs:api-redis"
echo "  🔴 Redis server:    pnpm logs:redis"
echo "  🖥️  Monitor logs:    pnpm logs:monitor"
echo "  🏭 Machine logs:    pnpm logs:machines"
echo "  📡 Event stream:    pnpm logs:monitorEventStream"
echo "  🧹 Clear all logs:  pnpm logs:clear"
echo ""
echo "⏸️  Press Ctrl+C to stop all services"
echo "🛑 Or run: pnpm dev:full-stack:stop"

# Wait for all background processes
wait