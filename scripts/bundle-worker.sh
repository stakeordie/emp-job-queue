#!/bin/bash
# Bundle worker for local development use
# This mimics what CI/CD does to create a self-contained worker

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Bundling worker for local development...${NC}"

# Build core and worker first
echo -e "${YELLOW}Building @emp/core and worker...${NC}"
pnpm --filter @emp/core build
pnpm --filter worker build

# Create bundled worker directories
WORKER_BUNDLE_DIR="apps/worker/bundled"
MACHINE_BUNDLE_DIR="apps/machine/worker-bundled"

rm -rf $WORKER_BUNDLE_DIR $MACHINE_BUNDLE_DIR
mkdir -p $WORKER_BUNDLE_DIR $MACHINE_BUNDLE_DIR

# Bundle worker into a single file using esbuild
echo -e "${YELLOW}Bundling with esbuild...${NC}"
npx esbuild apps/worker/src/redis-direct-worker.ts \
  --bundle \
  --platform=node \
  --target=node18 \
  --format=cjs \
  --external:sharp \
  --external:canvas \
  --external:@tensorflow/tfjs-node \
  --external:sqlite3 \
  --outfile=$WORKER_BUNDLE_DIR/redis-direct-worker.cjs

# Rename .cjs to .js (no shebang needed since we call with 'node')
mv $WORKER_BUNDLE_DIR/redis-direct-worker.cjs $WORKER_BUNDLE_DIR/redis-direct-worker.js

# Get version info - use timestamp for local dev, git tags for releases
BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
TIMESTAMP_VERSION=$(date +"%Y%m%d.%H%M%S")

# For local development, use timestamp. For releases, CI/CD should set RELEASE_VERSION
if [ -z "$RELEASE_VERSION" ]; then
  WORKER_VERSION="local-${TIMESTAMP_VERSION}"
else
  WORKER_VERSION="$RELEASE_VERSION"
fi

# Create package.json with appropriate version
cat > $WORKER_BUNDLE_DIR/package.json << EOF
{
  "name": "emp-worker-bundled",
  "version": "${WORKER_VERSION}",
  "description": "Bundled EMP Worker - Local Development",
  "buildDate": "${BUILD_DATE}"
}
EOF

# Copy to machine directory for Docker build
cp $WORKER_BUNDLE_DIR/* $MACHINE_BUNDLE_DIR/

# Copy service mapping for bundled worker
echo -e "${YELLOW}Copying service mapping for bundled worker...${NC}"
mkdir -p $MACHINE_BUNDLE_DIR/src/config/
cp apps/machine/src/config/service-mapping.json $MACHINE_BUNDLE_DIR/src/config/

# Copy scripts directory (includes init-winston-logs.sh)
echo -e "${YELLOW}Copying worker scripts...${NC}"
mkdir -p $MACHINE_BUNDLE_DIR/scripts/
cp -r apps/worker/scripts/* $MACHINE_BUNDLE_DIR/scripts/ 2>/dev/null || true

echo -e "${GREEN}✓ Worker bundled successfully at: $WORKER_BUNDLE_DIR${NC}"
echo -e "${GREEN}✓ Worker copied to machine directory: $MACHINE_BUNDLE_DIR${NC}"
echo -e "${GREEN}  Ready for Docker build with WORKER_BUNDLE_MODE=local${NC}"