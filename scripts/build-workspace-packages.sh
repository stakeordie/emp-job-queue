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
# Note: @emp/custom-nodes package has been removed
pnpm --filter @emp/telemetry build

# Change to machine directory for workspace packages
cd "$MACHINE_DIR"

# Create workspace packages directory for Docker context
echo -e "${YELLOW}Preparing workspace packages for Docker build...${NC}"
rm -rf .workspace-packages
mkdir -p .workspace-packages

# Copy ONLY the package files (not entire repo) to Docker context
# Only copy package.json, dist/, src/, and essential files - NOT apps/ or logs/
mkdir -p .workspace-packages/core
mkdir -p .workspace-packages/service-config
mkdir -p .workspace-packages/telemetry

# Copy core package files only (exclude apps/, logs/, etc.)
cp "$ROOT_DIR/packages/core/package.json" .workspace-packages/core/
cp -r "$ROOT_DIR/packages/core/dist" .workspace-packages/core/ 2>/dev/null || true
cp -r "$ROOT_DIR/packages/core/src" .workspace-packages/core/ 2>/dev/null || true

# Copy other packages selectively (exclude large unnecessary directories)
# Service-config: exclude shared-configs (111MB) and node_modules
cp "$ROOT_DIR/packages/service-config/package.json" .workspace-packages/service-config/
cp -r "$ROOT_DIR/packages/service-config/dist" .workspace-packages/service-config/ 2>/dev/null || true
cp -r "$ROOT_DIR/packages/service-config/src" .workspace-packages/service-config/ 2>/dev/null || true
cp -r "$ROOT_DIR/packages/service-config/comfy-nodes" .workspace-packages/service-config/ 2>/dev/null || true

# Note: custom-nodes package has been removed - nodes are now installed from GitHub repo

# Telemetry: copy normally but exclude node_modules
cp "$ROOT_DIR/packages/telemetry/package.json" .workspace-packages/telemetry/
cp -r "$ROOT_DIR/packages/telemetry/dist" .workspace-packages/telemetry/ 2>/dev/null || true
cp -r "$ROOT_DIR/packages/telemetry/src" .workspace-packages/telemetry/ 2>/dev/null || true

echo -e "${GREEN}✓ Workspace packages prepared successfully${NC}"
echo "Location: $MACHINE_DIR/.workspace-packages"