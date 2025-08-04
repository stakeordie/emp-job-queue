#!/bin/bash
# Start Machine Instance with Unique Ports
# Usage: ./start-machine-instance.sh [instance_number] [worker_config]
# Example: ./start-machine-instance.sh 0 simulation:1
# Example: ./start-machine-instance.sh 1 comfyui:2

set -e

INSTANCE=${1:-0}
WORKERS=${2:-simulation:1}

echo "🚀 Starting machine instance $INSTANCE with workers: $WORKERS"

# Port allocation:
# Instance 0: Health 9090, ComfyUI 3188+
# Instance 1: Health 9100, ComfyUI 3288+ 
# Instance 2: Health 9110, ComfyUI 3388+
# etc.

HEALTH_PORT=$((9090 + INSTANCE * 10))
COMFYUI_BASE=$((3188 + INSTANCE * 100))

echo "📋 Port allocation for instance $INSTANCE:"
echo "   Health: $HEALTH_PORT"
echo "   ComfyUI: $COMFYUI_BASE+"

# Set environment variables
export MACHINE_INSTANCE=$INSTANCE
export WORKERS=$WORKERS
export MACHINE_HEALTH_PORT=9090  # Internal port (always 9090)
export EXPOSE_PORTS=$HEALTH_PORT  # External port (unique per instance)
export COMFYUI_EXPOSED_HOST_PORT_BASE=$COMFYUI_BASE

# Create unique container name
CONTAINER_NAME="emp-machine-$INSTANCE"

echo "🐳 Container name: $CONTAINER_NAME"

# Navigate to machine directory
cd "$(dirname "$0")/../apps/machine"

# Stop existing container if running
if docker ps -q -f name=$CONTAINER_NAME | grep -q .; then
    echo "🛑 Stopping existing container: $CONTAINER_NAME"
    docker stop $CONTAINER_NAME
fi

# Remove existing container
if docker ps -aq -f name=$CONTAINER_NAME | grep -q .; then
    echo "🗑️  Removing existing container: $CONTAINER_NAME"
    docker rm $CONTAINER_NAME
fi

# Generate docker-compose with correct ports
echo "⚙️  Generating ports configuration..."
node scripts/generate-docker-compose-ports.js

# Start the machine
echo "🚀 Starting machine instance $INSTANCE..."
docker-compose up --build -d

# Rename container for easy identification
docker rename $(docker-compose ps -q) $CONTAINER_NAME

echo "✅ Machine instance $INSTANCE started successfully!"
echo "🔗 Health check: http://localhost:$HEALTH_PORT/health"
echo "📊 Status: http://localhost:$HEALTH_PORT/status"

if [[ "$WORKERS" == *"comfyui"* ]]; then
    echo "🎨 ComfyUI: http://localhost:$COMFYUI_BASE"
fi

echo ""
echo "📝 To stop this instance: docker stop $CONTAINER_NAME"
echo "📝 To view logs: docker logs -f $CONTAINER_NAME"