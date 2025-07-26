#!/bin/bash
# Run worker locally using machine's .env file
# This simulates how the worker runs inside the machine container

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting local worker with machine environment...${NC}"

# Check if machine .env exists
if [ ! -f "apps/machine/.env" ]; then
    echo -e "${RED}❌ Error: apps/machine/.env not found${NC}"
    echo -e "${YELLOW}Please run 'pnpm env:build' first to generate environment files${NC}"
    exit 1
fi

# Load machine environment variables
echo -e "${YELLOW}📋 Loading environment from apps/machine/.env${NC}"
set -a
source apps/machine/.env
set +a

# Build the worker if needed
echo -e "${YELLOW}🔨 Building worker...${NC}"
pnpm --filter @emp/core build
pnpm --filter worker build

# Map WORKER_ prefixed vars to simpler names (like PM2 does)
echo -e "${YELLOW}🔄 Mapping environment variables...${NC}"
export CONNECTORS="${WORKER_CONNECTORS:-simulation,comfyui}"
export COMFYUI_HOST="${WORKER_COMFYUI_HOST:-localhost}"
export COMFYUI_PORT="${WORKER_COMFYUI_PORT:-8188}"
export COMFYUI_USERNAME="${WORKER_COMFYUI_USERNAME:-}"
export COMFYUI_PASSWORD="${WORKER_COMFYUI_PASSWORD:-}"
export WEBSOCKET_AUTH_TOKEN="${WORKER_WEBSOCKET_AUTH_TOKEN:-}"

# Set worker-specific variables
export WORKER_ID="${WORKER_ID:-local-dev-worker-0}"
export GPU_INDEX="${GPU_INDEX:-0}"

# Show configuration
echo -e "${GREEN}✅ Worker configuration:${NC}"
echo "   HUB_REDIS_URL: ${HUB_REDIS_URL}"
echo "   MACHINE_ID: ${MACHINE_ID}"
echo "   WORKER_ID: ${WORKER_ID}"
echo "   CONNECTORS: ${CONNECTORS}"
echo "   GPU_INDEX: ${GPU_INDEX}"

# Create logs directory
mkdir -p logs

# Run the worker
echo -e "${GREEN}🏃 Starting worker...${NC}"
echo -e "${YELLOW}   Logs: tail -f logs/worker-local.log${NC}"
echo ""

cd apps/worker
exec tsx watch src/redis-direct-worker.ts 2>&1 | tee ../../logs/worker-local.log