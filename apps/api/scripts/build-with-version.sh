#!/bin/bash
# Build script for API container with version tagging

set -e

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Go up from apps/api/scripts to project root
PROJECT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Default values
DEFAULT_TAG="latest"
DEFAULT_REGISTRY="emprops"
DEFAULT_IMAGE_NAME="emp-ai-backend-api"

# Parse command line arguments
VERSION="${1:-$DEFAULT_TAG}"

# Handle shorthand: version --push
if [ "$2" = "--push" ]; then
  REGISTRY="$DEFAULT_REGISTRY"
  IMAGE_NAME="$DEFAULT_IMAGE_NAME"
  PUSH_FLAG="--push"
else
  REGISTRY="${2:-$DEFAULT_REGISTRY}"
  IMAGE_NAME="${3:-$DEFAULT_IMAGE_NAME}"
  PUSH_FLAG="$4"
fi

# Build timestamp
BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Full image name
FULL_IMAGE_NAME="${REGISTRY}/${IMAGE_NAME}"

echo "🏗️  Building API container with version: ${VERSION}"
echo "📅 Build date: ${BUILD_DATE}"
echo "🏷️  Full image name: ${FULL_IMAGE_NAME}:${VERSION}"
echo

# Build the container
echo "🔨 Building Docker image..."
docker build \
  --build-arg API_VERSION="${VERSION}" \
  --build-arg BUILD_DATE="${BUILD_DATE}" \
  -f apps/api/Dockerfile.ci \
  --tag "${FULL_IMAGE_NAME}:${VERSION}" \
  --tag "${FULL_IMAGE_NAME}:latest" \
  "${PROJECT_DIR}"

echo "✅ Build completed successfully!"
echo
echo "🏷️  Tagged images:"
echo "   ${FULL_IMAGE_NAME}:${VERSION}"
echo "   ${FULL_IMAGE_NAME}:latest"
echo

# Optionally push to registry
if [ "$PUSH_FLAG" = "--push" ]; then
  echo "📤 Pushing to registry..."
  docker push "${FULL_IMAGE_NAME}:${VERSION}"
  docker push "${FULL_IMAGE_NAME}:latest"
  echo "✅ Push completed successfully!"
fi

echo "🎉 API container build complete!"
echo
echo "📋 To test the version:"
echo "   docker run --rm -p 3001:3001 ${FULL_IMAGE_NAME}:${VERSION}"
echo "   curl http://localhost:3001/version"
echo
echo "📋 To run the container:"
echo "   docker run -d --name api-server -p 3001:3001 ${FULL_IMAGE_NAME}:${VERSION}"