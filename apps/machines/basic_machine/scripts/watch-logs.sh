#!/bin/bash

# Basic Machine Log Monitoring Script
# Usage: ./scripts/watch-logs.sh [service]

SERVICE=${1:-all}
LOG_DIR=${LOG_DIR:-/workspace/logs}
WORKSPACE_DIR=${WORKSPACE_DIR:-/workspace}

echo "🔍 Basic Machine Log Monitor"
echo "📁 Log directory: $LOG_DIR"
echo "🎯 Monitoring: $SERVICE"
echo "---"

case $SERVICE in
    "all")
        echo "📊 Following all basic-machine logs..."
        if [ -d "$LOG_DIR" ]; then
            tail -f "$LOG_DIR"/basic-machine-*.log 2>/dev/null || \
            echo "⚠️  No log files found in $LOG_DIR - start basic-machine first"
        else
            echo "⚠️  Log directory $LOG_DIR not found"
            echo "💡 Try: LOG_LEVEL=debug npm run dev"
        fi
        ;;
    "comfyui")
        echo "🎨 Following ComfyUI logs..."
        if [ -d "$WORKSPACE_DIR/comfyui_gpu0/logs" ]; then
            tail -f "$WORKSPACE_DIR"/comfyui_gpu*/logs/output.log 2>/dev/null || \
            echo "⚠️  No ComfyUI logs found"
        else
            echo "⚠️  ComfyUI log directory not found"
        fi
        ;;
    "worker")
        echo "📡 Following Redis Worker logs..."
        if [ -d "/tmp/worker_gpu0" ]; then
            tail -f /tmp/worker_gpu*/logs/*.log 2>/dev/null || \
            echo "⚠️  No worker logs found"
        else
            echo "⚠️  Worker log directory not found"
        fi
        ;;
    "docker")
        echo "🐳 Following Docker container logs..."
        docker logs -f basic-machine 2>/dev/null || \
        echo "⚠️  basic-machine container not found"
        ;;
    "debug")
        echo "🐛 Starting basic-machine with debug logging..."
        LOG_LEVEL=debug npm run dev
        ;;
    *)
        echo "Usage: $0 [all|comfyui|worker|docker|debug]"
        echo ""
        echo "Log locations:"
        echo "  📊 All logs: $LOG_DIR/basic-machine-*.log"
        echo "  🎨 ComfyUI: $WORKSPACE_DIR/comfyui_gpu*/logs/output.log"
        echo "  📡 Workers: /tmp/worker_gpu*/logs/*.log"
        echo "  🐳 Docker: docker logs basic-machine"
        echo ""
        echo "Examples:"
        echo "  $0 all       # Follow all basic-machine logs"
        echo "  $0 comfyui   # Follow ComfyUI service logs"
        echo "  $0 docker    # Follow Docker container logs"
        echo "  $0 debug     # Start with debug logging"
        ;;
esac