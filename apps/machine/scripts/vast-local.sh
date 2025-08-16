#!/bin/bash
# Test VAST.ai development image locally
set -e

PROFILE="${1}"
if [ -z "$PROFILE" ]; then
    echo "❌ Error: Profile required"
    echo "Usage: pnpm vast:local comfyui-production"
    exit 1
fi

DEV_IMAGE="emprops/deploydev:$PROFILE"

echo "🧪 Testing development image locally: $DEV_IMAGE"

# Check if image exists
if ! docker image inspect "$DEV_IMAGE" >/dev/null 2>&1; then
    echo "❌ Image not found. Run 'pnpm vast:build $PROFILE' first"
    exit 1
fi

# Run interactively with GPU support if available
GPU_FLAGS=""
if command -v nvidia-smi &> /dev/null; then
    echo "🖥️  GPU detected, enabling GPU support"
    GPU_FLAGS="--gpus all"
fi

echo "🚀 Starting container..."
docker run -it --rm \
    $GPU_FLAGS \
    -e HUB_REDIS_URL="${HUB_REDIS_URL:-redis://host.docker.internal:6379}" \
    -e TEST_MODE=true \
    -e LOG_LEVEL=debug \
    -v "$(pwd):/local-code:ro" \
    --name "vast-local-test-$PROFILE" \
    "$DEV_IMAGE"