#!/bin/bash

# Run Telemetry Collector Docker container with environment-specific env files
# Usage: ./scripts/run-telcollect-docker.sh [environment]
# Default: testrunner

ENV_NAME="${1:-testrunner}"
cd apps/telemetry-collector

echo "🚀 Starting Telemetry Collector container with environment: $ENV_NAME"

docker run --rm --name telemetry-collector \
  --platform linux/amd64 \
  -p 9090:9090 \
  -p 4318:4318 \
  --env-file ".env.$ENV_NAME" \
  --env-file ".env.secret.$ENV_NAME" \
  emprops/telemetry-collector:latest