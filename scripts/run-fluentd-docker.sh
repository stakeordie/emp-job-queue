#!/bin/bash

# Run Fluentd Docker container with environment-specific env files
# Usage: ./scripts/run-fluentd-docker.sh [environment]
# Default: local-dev

ENV_NAME="${1:-local-dev}"
cd apps/fluentd

echo "🚀 Starting Fluentd container with environment: $ENV_NAME"

docker run --rm --name fluentd-service \
  -p 8888:8888 \
  -p 24224:24224 \
  -p 24220:24220 \
  --env-file ".env.$ENV_NAME" \
  --env-file ".env.secret.$ENV_NAME" \
  emprops/fluentd:latest