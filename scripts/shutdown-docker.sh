#!/bin/bash

echo "🛑 Shutting down ALL emp-job-queue services..."

# Kill all API servers
echo "🔥 Killing docker..."
# Kill Docker containers
echo "🔥 Stopping all running Docker containers..."
docker stop $(docker ps -q) 2>/dev/null || true

echo "✅ Docker Stopped!"