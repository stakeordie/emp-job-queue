#!/bin/bash

# Build standalone deployment package for API service
set -e

echo "Building standalone API service package..."

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

# Copy API service
mkdir -p standalone/apps/api
cp package.json standalone/apps/api/
cp -r dist standalone/apps/api/

# Copy tsconfig.json
cp ../../tsconfig.json standalone/

echo "Standalone package created in ./standalone/"
echo "Use Dockerfile.standalone to build Docker image"