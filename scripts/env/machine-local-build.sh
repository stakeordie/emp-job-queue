#!/bin/bash
# Build machine Docker image with local bundled worker
# This script bundles the worker locally and builds the Docker image with it

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🔧 EMP Job Queue - Local Machine Build${NC}"
echo -e "${YELLOW}Building machine with locally bundled worker...${NC}\n"

# Get the profile argument
PROFILE=$1
if [ -z "$PROFILE" ]; then
  echo -e "${RED}❌ Error: Please specify a profile${NC}"
  echo "Usage: $0 <profile>"
  echo "Example: $0 comfyui-remote:1"
  exit 1
fi

# Step 1: Bundle the worker
echo -e "${YELLOW}📦 Step 1: Bundling worker...${NC}"
./scripts/bundle-worker.sh
if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Failed to bundle worker${NC}"
  exit 1
fi

# Step 2: Set environment variable for local bundle mode
export WORKER_BUNDLE_MODE=local

# Step 3: Build the Docker image
echo -e "\n${YELLOW}🐳 Step 2: Building Docker image with bundled worker...${NC}"
echo -e "${YELLOW}Profile: ${PROFILE}${NC}"
echo -e "${YELLOW}Bundle mode: local${NC}\n"

# Run the machine build with the local bundle mode
pnpm machine:build "$PROFILE"

echo -e "\n${GREEN}✅ Local build complete!${NC}"
echo -e "${GREEN}The Docker image now contains the bundled worker at /workspace/worker-bundled/${NC}"
echo -e "${GREEN}To run: pnpm machine:up ${PROFILE}${NC}"