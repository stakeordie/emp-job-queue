#!/bin/bash
# Fluentd Docker Compose with environment loading
# Usage: ./fluentd-compose.sh [--env ENV] <command> [args...]
# Example: ./fluentd-compose.sh --env local-dev build --no-cache
#          ./fluentd-compose.sh --env production up -d
#          ./fluentd-compose.sh build  # defaults to local-dev

set -e

# Default values
ENV="local-dev"
DOCKER_COMPOSE_ARGS=()

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --env)
      ENV="$2"
      shift 2
      ;;
    *)
      # All remaining arguments go to docker compose
      DOCKER_COMPOSE_ARGS+=("$1")
      shift
      ;;
  esac
done

# Default command if none provided
if [[ ${#DOCKER_COMPOSE_ARGS[@]} -eq 0 ]]; then
    DOCKER_COMPOSE_ARGS=("up")
fi

echo "🔍 Loading environment: $ENV"

# Load environment variables from the appropriate .env file
ENV_FILE=".env.$ENV"
SECRET_ENV_FILE=".env.secret.$ENV"

if [[ ! -f "$ENV_FILE" ]]; then
    echo "❌ Environment file not found: $ENV_FILE"
    echo "Available files:"
    ls -la .env.* 2>/dev/null || echo "No .env files found"
    exit 1
fi

# Source the environment files to load variables into shell
source "$ENV_FILE"

# Source secret environment file if it exists
if [[ -f "$SECRET_ENV_FILE" ]]; then
    source "$SECRET_ENV_FILE"
else
    echo "⚠️ Secret environment file not found: $SECRET_ENV_FILE"
fi

# Export the variables so they're available to docker compose
export ENV DASH0_API_KEY DASH0_DATASET DASH0_LOGS_ENDPOINT

echo "✅ Loaded environment variables:"
echo "   ENV: $ENV"
echo "   DASH0_DATASET: $DASH0_DATASET"
echo "   DASH0_LOGS_ENDPOINT: $DASH0_LOGS_ENDPOINT"
echo "   DASH0_API_KEY: ${DASH0_API_KEY:0:8}..."

# Run docker compose with the loaded environment
echo "🚀 Running: docker compose ${DOCKER_COMPOSE_ARGS[*]}"
docker compose "${DOCKER_COMPOSE_ARGS[@]}"