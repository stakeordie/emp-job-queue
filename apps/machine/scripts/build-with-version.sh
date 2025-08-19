#!/bin/bash
# Build machine Docker container with workspace dependencies

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Default values
MACHINE_VERSION="latest"
REGISTRY=""
IMAGE_NAME="machine"
PUSH=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --version)
      MACHINE_VERSION="$2"
      shift 2
      ;;
    --registry)
      REGISTRY="$2"
      shift 2
      ;;
    --name)
      IMAGE_NAME="$2"
      shift 2
      ;;
    --push)
      PUSH=true
      shift
      ;;
    *)
      # Handle shorthand: version --push
      if [[ $1 =~ ^v[0-9] ]]; then
        MACHINE_VERSION="$1"
        shift
      elif [[ $1 == "--push" ]]; then
        PUSH=true
        shift
      else
        echo -e "${RED}Unknown argument: $1${NC}"
        exit 1
      fi
      ;;
  esac
done

# Build image names
LOCAL_IMAGE_NAME="${IMAGE_NAME}:${MACHINE_VERSION}"
PUSH_IMAGE_NAME="emprops/basic-machine:latest"

echo -e "${GREEN}Building machine container: ${LOCAL_IMAGE_NAME}${NC}"

# Get absolute paths
MACHINE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ROOT_DIR="$(cd "$MACHINE_DIR/../.." && pwd)"

echo -e "${YELLOW}Machine directory: ${MACHINE_DIR}${NC}"
echo -e "${YELLOW}Root directory: ${ROOT_DIR}${NC}"

# Build required workspace packages first
echo -e "${YELLOW}Building required workspace packages...${NC}"
cd "$ROOT_DIR"
pnpm --filter @emp/service-config build
pnpm --filter @emp/custom-nodes build

# Return to machine directory  
cd "$MACHINE_DIR"

# Create workspace packages directory for Docker context
echo -e "${YELLOW}Preparing workspace packages for Docker build...${NC}"
rm -rf .workspace-packages
mkdir -p .workspace-packages

# Copy built workspace packages to Docker context
cp -r "$ROOT_DIR/packages/service-config" .workspace-packages/
cp -r "$ROOT_DIR/packages/custom-nodes" .workspace-packages/

# Copy required entrypoint scripts to local scripts directory
echo -e "${YELLOW}Copying required entrypoint scripts...${NC}"
cp "$ROOT_DIR/scripts/entrypoint-base-common.sh" scripts/

# Build the Docker image with workspace packages
echo -e "${GREEN}Building Docker image...${NC}"
BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

docker build \
  --build-arg MACHINE_VERSION="${MACHINE_VERSION}" \
  --build-arg BUILD_DATE="${BUILD_DATE}" \
  --tag "${LOCAL_IMAGE_NAME}" \
  .

echo -e "${GREEN}✓ Docker image built successfully: ${LOCAL_IMAGE_NAME}${NC}"

# Push if requested
if [[ "$PUSH" == "true" ]]; then
  echo -e "${YELLOW}Tagging for registry push...${NC}"
  docker tag "${LOCAL_IMAGE_NAME}" "${PUSH_IMAGE_NAME}"
  
  echo -e "${YELLOW}Pushing image to registry...${NC}"
  docker push "${PUSH_IMAGE_NAME}"
  echo -e "${GREEN}✓ Image pushed successfully: ${PUSH_IMAGE_NAME}${NC}"
fi

# Clean up
echo -e "${YELLOW}Cleaning up...${NC}"
rm -rf .workspace-packages

echo -e "${GREEN}✓ Machine build complete!${NC}"
echo "Local Image: ${LOCAL_IMAGE_NAME}"
if [[ "$PUSH" == "true" ]]; then
  echo "Registry Image: ${PUSH_IMAGE_NAME}"
fi
echo "Version: ${MACHINE_VERSION}"
echo "Build Date: ${BUILD_DATE}"