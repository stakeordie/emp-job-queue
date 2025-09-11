#!/bin/bash
set -e

# Check and Rebuild Core Packages Script
# Automatically detects changes to core packages and forces rebuild to prevent Docker cache issues

echo "🔍 Checking for core package changes..."

# Define core packages that affect Docker builds
CORE_PACKAGES=("packages/core" "packages/telemetry" "packages/service-config")

# Check if any core packages have changed
CORE_CHANGED=false
for package in "${CORE_PACKAGES[@]}"; do
    if git status --porcelain | grep -q "^.M $package\|^ M $package"; then
        echo "📦 Detected changes in $package"
        CORE_CHANGED=true
    fi
done

# Also check if there are unstaged changes in core packages
for package in "${CORE_PACKAGES[@]}"; do
    if [[ -d "$package" ]] && git diff --name-only | grep -q "^$package/"; then
        echo "📦 Detected unstaged changes in $package"
        CORE_CHANGED=true
    fi
done

if [[ "$CORE_CHANGED" == "true" ]]; then
    echo "🔧 Core packages changed - forcing rebuild to update .workspace-packages/"
    echo "🚀 Running: pnpm turbo build --force --filter=@emp/core --filter=@emp/telemetry --filter=@emp/service-config"
    pnpm turbo build --force --filter=@emp/core --filter=@emp/telemetry --filter=@emp/service-config
    
    echo "🔧 Rebuilding webhook service to pick up core changes"
    pnpm turbo build --force --filter=webhook-service
    
    echo "✅ Core packages and webhook service rebuilt successfully"
    echo "💡 Now rebuild your Docker image to pick up the changes"
else
    echo "✅ No core package changes detected - standard build is safe"
fi