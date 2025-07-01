#!/bin/bash

# Docker Multi-GPU Integration Test Runner
# This script starts an isolated Docker environment and runs tests

set -e

echo "🐳 Starting Docker Multi-GPU Integration Test..."

# Change to the project root
cd "$(dirname "$0")/../.."

# Clean up any existing test containers
echo "🧹 Cleaning up existing test containers..."
docker-compose -f tests/integration/docker-simple.test.yml down -v 2>/dev/null || true

# Build and start the test environment
echo "🚀 Starting isolated test environment..."
docker-compose -f tests/integration/docker-simple.test.yml up -d --build

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 10

# Check Redis is ready
echo "📡 Checking Redis connectivity..."
timeout 30 bash -c 'until redis-cli -h localhost -p 6380 ping; do sleep 1; done'

# Check Hub is ready  
echo "🎯 Checking Hub connectivity..."
timeout 30 bash -c 'until curl -s http://localhost:3011/health; do sleep 1; done'

echo "✅ Test environment is ready!"

# Check what workers are connected
echo "🔍 Checking connected workers..."
redis-cli -h localhost -p 6380 keys "worker:*:info" | wc -l | xargs echo "Connected workers:"

# List worker details
echo "📋 Worker details:"
for key in $(redis-cli -h localhost -p 6380 keys "worker:*:info"); do
    worker_id=$(redis-cli -h localhost -p 6380 hget "$key" worker_id)
    gpu_id=$(redis-cli -h localhost -p 6380 hget "$key" gpu_id)
    services=$(redis-cli -h localhost -p 6380 hget "$key" services)
    echo "  $worker_id (GPU $gpu_id): $services"
done

# Submit a test job
echo "🎯 Submitting test job..."
curl -X POST http://localhost:3011/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "service_required": "comfyui",
    "priority": 80,
    "payload": {"prompt": "Docker test job"}
  }'

echo ""
echo "🕐 Waiting for job processing..."
sleep 5

# Check job status
echo "📊 Job statistics:"
redis-cli -h localhost -p 6380 eval "
local pending = redis.call('zcard', 'jobs:pending')
local active = redis.call('zcard', 'jobs:active')
local completed = redis.call('zcard', 'jobs:completed')
return {pending, active, completed}
" 0 | paste -d' ' - - - | xargs echo "Pending/Active/Completed:"

echo "✅ Docker integration test complete!"

# Keep environment running for monitor connection
echo "🎯 Docker environment is running and ready for monitor connection!"
echo ""
echo "📡 Monitor WebSocket URL: ws://localhost:3012"
echo "🌐 Hub HTTP API URL: http://localhost:3011"
echo "🔍 Redis URL: redis://localhost:6380"
echo ""
echo "💡 Connect your monitor to ws://localhost:3012 to see the isolated environment"
echo "🛑 To stop the environment later, run:"
echo "   docker-compose -f tests/integration/docker-simple.test.yml down -v"
echo ""
echo "🎉 Test environment ready for monitoring!"