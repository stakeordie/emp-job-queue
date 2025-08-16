#!/bin/bash
# Development entrypoint that exactly matches production but allows code changes

set -e

echo "🐳 Starting development container with production environment"

# If code is mounted, use it; otherwise copy from image
if [ -d "/mounted-code" ]; then
    echo "📁 Using mounted code from host"
    cp -r /mounted-code/* /service-manager/
    cd /service-manager
    
    # Install any new dependencies
    if [ -f "package.json" ]; then
        echo "📦 Installing/updating dependencies..."
        pnpm install
    fi
else
    echo "📁 Using code from image"
fi

# Set exact production environment variables if not provided
export WORKSPACE_DIR=${WORKSPACE_DIR:-/workspace}
export LOG_LEVEL=${LOG_LEVEL:-info}
export NODE_ENV=${NODE_ENV:-production}

# Create directories exactly as production would
mkdir -p /workspace/ComfyUI/custom_nodes
mkdir -p /var/log/pm2

echo "🚀 Environment setup complete. Starting application..."

# Execute the command passed to docker run
exec "$@"