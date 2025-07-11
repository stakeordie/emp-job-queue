#!/bin/bash

# Generate docker-compose ports section from EXPOSED_PORTS env var
# Usage: ./generate-ports.sh

if [ -f .env.local ]; then
    source .env.local
fi

EXPOSED_PORTS=${EXPOSED_PORTS:-"22,80,443,3001,8188,9090,11434,6379"}

echo "    ports:"
IFS=',' read -ra PORTS <<< "$EXPOSED_PORTS"
for port in "${PORTS[@]}"; do
    port=$(echo "$port" | tr -d ' ')  # Remove spaces
    echo "      - \"$port:$port\""
done