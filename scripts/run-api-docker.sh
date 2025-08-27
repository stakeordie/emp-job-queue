#!/bin/bash

# Run API Docker container with environment-specific env files
# Usage: ./scripts/run-api-docker.sh [environment]
# Default: local-dev

ENV_NAME="${1:-local-dev}"
cd apps/api

echo "🚀 Starting API container with environment: $ENV_NAME"

docker run --rm --name api-service \
  -p 3331:3331 \
  --env-file ".env.$ENV_NAME" \
  --env-file ".env.secret.$ENV_NAME" \
  emprops/api:latest