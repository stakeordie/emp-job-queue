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

# Create bundled worker directory
BUNDLE_DIR="apps/worker/bundled"
rm -rf $BUNDLE_DIR
mkdir -p $BUNDLE_DIR

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
  --outfile=$BUNDLE_DIR/redis-direct-worker.cjs

# Rename .cjs to .js (no shebang needed since we call with 'node')
mv $BUNDLE_DIR/redis-direct-worker.cjs $BUNDLE_DIR/redis-direct-worker.js

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
cat > $BUNDLE_DIR/package.json << EOF
{
  "name": "emp-worker-bundled",
  "version": "${WORKER_VERSION}",
  "description": "Bundled EMP Worker - Local Development",
  "buildDate": "${BUILD_DATE}"
}
EOF

echo -e "${GREEN}✓ Worker bundled successfully at: $BUNDLE_DIR${NC}"
echo -e "${GREEN}  Use WORKER_LOCAL_PATH=/workspace/worker-bundled in docker-compose.dev.yml${NC}"