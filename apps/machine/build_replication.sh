#!/bin/bash
# Replicates the exact build process from Dockerfile.gpu
# Can be run multiple times on the same container

set -e

echo "🔄 Resetting environment for fresh build..."

# Built-in reset (no external script needed)
pkill -f "node" || true
pkill -f "pm2" || true
pm2 kill || true
rm -rf /service-manager/* || true
rm -rf /workspace/ComfyUI || true
rm -rf /var/log/pm2/* || true
pm2 delete all || true
pm2 flush || true

echo "🚀 Starting build replication process..."

# Create working directory exactly as Dockerfile
mkdir -p /service-manager
cd /service-manager

echo "📦 Installing GPU monitoring tools..."
pip3 install --no-cache-dir \
    nvidia-ml-py3 \
    gpustat \
    py3nvml \
    psutil

echo "📁 Cloning/updating source code..."
if [ -d ".git" ]; then
    git pull origin main
else
    # Replace with your actual repo URL
    git clone https://github.com/your-username/emp-job-queue.git temp-repo
    cp -r temp-repo/apps/machine/* .
    rm -rf temp-repo
fi

echo "📦 Installing Node.js dependencies..."
pnpm install --frozen-lockfile

echo "🔧 Setting up PM2 ecosystem..."
# Copy the exact setup from Dockerfile
cp scripts/generate-pm2-ecosystem-worker-driven.js /usr/local/bin/
chmod +x /usr/local/bin/generate-pm2-ecosystem-worker-driven.js

echo "📁 Creating workspace directories..."
mkdir -p /workspace/ComfyUI/custom_nodes
mkdir -p /var/log/pm2

echo "🎯 Setting development environment variables..."
export HUB_REDIS_URL="${HUB_REDIS_URL:-redis://your-redis-url}"
export TEST_MODE=true
export NUM_GPUS=1
export ENABLE_NGINX=false
export ENABLE_A1111=false
export ENABLE_OLLAMA=false
export LOG_LEVEL=debug
export WORKSPACE_DIR=/workspace

echo "✅ Build replication complete!"
echo ""
echo "🚀 Ready to test. Run:"
echo "  node src/index-pm2.js"
echo ""
echo "🔧 Or test specific components:"
echo "  node debug-telemetry.js"
echo "  node src/services/component-manager.js"