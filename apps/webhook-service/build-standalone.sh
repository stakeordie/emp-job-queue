#!/bin/bash

# Build standalone deployment package for webhook service
set -e

echo "Building standalone webhook service package..."

# Clean up previous builds
rm -rf standalone
mkdir -p standalone

# Copy package.json files
cp ../../package.json standalone/
cp ../../pnpm-lock.yaml standalone/
cp ../../pnpm-workspace.yaml standalone/

# Copy core package
mkdir -p standalone/packages/core
cp -r ../../packages/core/package.json standalone/packages/core/
cp -r ../../packages/core/dist standalone/packages/core/

# Copy webhook service
mkdir -p standalone/apps/webhook-service
cp package.json standalone/apps/webhook-service/
cp -r dist standalone/apps/webhook-service/

# Copy tsconfig.json
cp ../../tsconfig.json standalone/

echo "Standalone package created in ./standalone/"
echo "Use Dockerfile.standalone to build Docker image"