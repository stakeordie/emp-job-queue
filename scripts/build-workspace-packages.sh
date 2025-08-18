#!/bin/bash
# Build and prepare workspace packages for Docker build
# This script is used for local development builds

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Building workspace packages for Docker build...${NC}"

# Get absolute paths
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MACHINE_DIR="$ROOT_DIR/apps/machine"

echo -e "${YELLOW}Root directory: ${ROOT_DIR}${NC}"
echo -e "${YELLOW}Machine directory: ${MACHINE_DIR}${NC}"

# Build required workspace packages first
echo -e "${YELLOW}Building required workspace packages...${NC}"
cd "$ROOT_DIR"
pnpm --filter @emp/core build
pnpm --filter @emp/service-config build
pnpm --filter @emp/custom-nodes build
pnpm --filter @emp/telemetry build

# Change to machine directory for workspace packages
cd "$MACHINE_DIR"

# Create workspace packages directory for Docker context
echo -e "${YELLOW}Preparing workspace packages for Docker build...${NC}"
rm -rf .workspace-packages
mkdir -p .workspace-packages

# Copy built workspace packages to Docker context
cp -r "$ROOT_DIR/packages/core" .workspace-packages/
cp -r "$ROOT_DIR/packages/service-config" .workspace-packages/
cp -r "$ROOT_DIR/packages/custom-nodes" .workspace-packages/
cp -r "$ROOT_DIR/packages/telemetry" .workspace-packages/

echo -e "${GREEN}✓ Workspace packages prepared successfully${NC}"
echo "Location: $MACHINE_DIR/.workspace-packages"