#!/bin/bash
# Local container build script for both API and Machine containers

set -e

# Default values
VERSION="${1:-latest}"
PUSH_FLAG="${2}"

echo "🚀 Building both API and Machine containers locally"
echo "📦 Version: ${VERSION}"
echo

# Build API container
echo "🔨 Building API container..."
cd apps/api
pnpm docker:build:version "${VERSION}" emprops emp-job-queue-api ${PUSH_FLAG}
cd ../..
echo

# Build Machine container  
echo "🔨 Building Machine container..."
pnpm machines:basic:prod "${VERSION}" emprops basic-machine ${PUSH_FLAG}
echo

echo "🎉 All containers built successfully!"
echo
echo "📋 Built containers:"
echo "   • emprops/emp-job-queue-api:${VERSION}"
echo "   • emprops/basic-machine:${VERSION}"
echo

if [ "${PUSH_FLAG}" = "--push" ]; then
  echo "✅ All containers pushed to DockerHub!"
else
  echo "💡 To push to DockerHub, run:"
  echo "   ./scripts/build-containers-local.sh ${VERSION} --push"
fi

echo
echo "📋 To create GitHub release (worker bundle only):"
echo "   git tag ${VERSION}"
echo "   git push origin ${VERSION}"