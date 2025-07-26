#!/bin/bash

# Cleanup script to kill processes on ComfyUI ports before starting services
# This prevents PM2 restart loops due to port conflicts

set -e

echo "🧹 Starting port cleanup for ComfyUI services..."

# Get number of GPUs (default to 1 if not set)
NUM_GPUS=${NUM_GPUS:-1}
BASE_PORT=${COMFYUI_PORT_START:-8188}

# Function to kill process on a specific port
kill_port_process() {
    local port=$1
    echo "Checking port $port..."
    
    # Find process using the port
    if pid=$(lsof -ti :$port 2>/dev/null); then
        echo "Found process $pid using port $port, killing it..."
        
        # Try graceful shutdown first
        if kill -TERM $pid 2>/dev/null; then
            sleep 2
            
            # Check if still running
            if kill -0 $pid 2>/dev/null; then
                echo "Process $pid still alive, force killing..."
                kill -KILL $pid 2>/dev/null || true
                sleep 1
            fi
        fi
        
        # Verify port is free
        if lsof -ti :$port 2>/dev/null; then
            echo "⚠️  WARNING: Port $port still in use after cleanup"
            return 1
        else
            echo "✅ Port $port is now free"
        fi
    else
        echo "✅ Port $port is already free"
    fi
    
    return 0
}

# Cleanup ports for all GPUs
for ((gpu=0; gpu<NUM_GPUS; gpu++)); do
    port=$((BASE_PORT + gpu))
    kill_port_process $port
done

# Also cleanup any other common ComfyUI ports that might be in use
for additional_port in 8189 8190 8191 8192; do
    if lsof -ti :$additional_port 2>/dev/null; then
        echo "Cleaning up additional port $additional_port..."
        kill_port_process $additional_port
    fi
done

echo "🧹 Port cleanup completed!"