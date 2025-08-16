#!/bin/bash
# Push development image to Docker Hub for VAST.ai
set -e

PROFILE="${1}"
if [ -z "$PROFILE" ]; then
    echo "❌ Error: Profile required"
    echo "Usage: pnpm vast:push comfyui-production"
    exit 1
fi

DEV_IMAGE="emprops/deploydev:$PROFILE"

echo "📤 Pushing development image: $DEV_IMAGE"
docker push "$DEV_IMAGE"

if [ $? -eq 0 ]; then
    echo "✅ Successfully pushed: $DEV_IMAGE"
    echo ""
    echo "🎯 VAST.ai Setup:"
    echo "  Image: $DEV_IMAGE"
    echo "  Command: build_replication.sh"
else
    echo "❌ Push failed"
    exit 1
fi