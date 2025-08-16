#!/bin/bash
# Complete VAST.ai deployment script - build and push profile for development
set -e

PROFILE="${1}"
if [ -z "$PROFILE" ]; then
    echo "❌ Error: Profile required"
    echo "Usage: pnpm vast:deploy comfyui-production"
    exit 1
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 VAST.ai Development Deployment Script${NC}"
echo "=========================================="
echo -e "${BLUE}Profile: ${PROFILE}${NC}"

echo -e "${YELLOW}📦 Building development version...${NC}"
./scripts/vast-build.sh "$PROFILE"

echo -e "${YELLOW}📤 Pushing to Docker Hub...${NC}"
./scripts/vast-push.sh "$PROFILE"

# Build the image
docker build -f Dockerfile.vast-base -t "$LATEST_TAG" -t "$TIMESTAMP_TAG" .

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Docker build failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build successful${NC}"

# Test the image locally first
echo -e "${YELLOW}🧪 Testing image locally...${NC}"
docker run --rm "$LATEST_TAG" /bin/bash -c "
    echo '✅ Container starts successfully'
    node --version
    pnpm --version
    pm2 --version
    python3 -c 'import pynvml; print(\"✅ GPU monitoring tools available\")'
    ls -la /usr/local/bin/build_replication.sh
    echo '✅ All checks passed'
"

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Local test failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Local test passed${NC}"

# Push to Docker Hub
echo -e "${YELLOW}📤 Pushing to Docker Hub...${NC}"
docker push "$LATEST_TAG"
docker push "$TIMESTAMP_TAG"

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Docker push failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Successfully deployed to Docker Hub${NC}"
echo ""
echo -e "${BLUE}🎯 VAST.ai Setup Instructions:${NC}"
echo "1. Launch instance with image: $LATEST_TAG"
echo "2. Inside container, run: build_replication.sh"
echo "3. Test with: node src/index-pm2.js"
echo ""
echo -e "${BLUE}📋 Available tags:${NC}"
echo "  Latest: $LATEST_TAG" 
echo "  Timestamped: $TIMESTAMP_TAG"
echo ""
echo -e "${GREEN}🚀 Ready for VAST.ai deployment!${NC}"