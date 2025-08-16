#!/bin/bash
# Development setup script - mimics Dockerfile.gpu but interactive
set -e

echo "🚀 EMP Machine Development Setup"

# Install system dependencies
echo "📦 Installing system dependencies..."
apt-get update --allow-releaseinfo-change
apt-get install -y ca-certificates gnupg curl git

# Install Node.js
echo "📦 Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs
npm install -g pnpm pm2

# Install GPU monitoring tools
echo "🖥️  Installing GPU monitoring tools..."
pip3 install --no-cache-dir \
    nvidia-ml-py3 \
    gpustat \
    py3nvml \
    psutil

# Setup PM2 logrotate
echo "📝 Setting up PM2 logging..."
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true

# Install dependencies
echo "📦 Installing Node.js dependencies..."
pnpm install

echo "✅ Development setup complete!"
echo ""
echo "🔧 To start development:"
echo "  export HUB_REDIS_URL=redis://your-redis-url"
echo "  export TEST_MODE=true"
echo "  export NUM_GPUS=1"
echo "  node src/index-pm2.js"