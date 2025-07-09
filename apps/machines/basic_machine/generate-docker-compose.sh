#!/bin/bash

# Generate docker-compose.override.yml with ports from EXPOSED_PORTS
# Usage: ./generate-docker-compose.sh

if [ -f .env.local ]; then
    source .env.local
fi

EXPOSED_PORTS=${EXPOSED_PORTS:-"22,80,8188,9090"}

cat > docker-compose.override.yml << EOF
# This file is dynamically generated based on EXPOSED_PORTS in .env.local
# Run: ./generate-docker-compose.sh to regenerate
# 
# Individual service ports are configured in .env.local:
# SSH_PORT=${SSH_PORT:-22}, NGINX_HTTP_PORT=${NGINX_HTTP_PORT:-80}, etc.
# Only ports listed in EXPOSED_PORTS are exposed to the host.

services:
  basic-machine:
    ports:
EOF

# Function to get the environment variable name for a port
get_port_var() {
    case $1 in
        22) echo "SSH_PORT" ;;
        80) echo "NGINX_HTTP_PORT" ;;
        443) echo "NGINX_HTTPS_PORT" ;;
        8188) echo "COMFYUI_PORT_START" ;;
        3001) echo "A1111_PORT_START" ;;
        9090) echo "HEALTH_PORT" ;;
        11434) echo "OLLAMA_PORT" ;;
        6379) echo "REDIS_PORT" ;;
        *) echo "" ;;
    esac
}

IFS=',' read -ra PORTS <<< "$EXPOSED_PORTS"
for port_mapping in "${PORTS[@]}"; do
    port_mapping=$(echo "$port_mapping" | tr -d ' ')  # Remove spaces
    
    # Check if it's a port mapping (host:container) or just a port number
    if [[ "$port_mapping" == *":"* ]]; then
        # Format: host_port:container_port
        host_port=$(echo "$port_mapping" | cut -d':' -f1)
        container_port=$(echo "$port_mapping" | cut -d':' -f2)
        var_name=$(get_port_var "$container_port")
        if [ -n "$var_name" ]; then
            echo "      - \"$host_port:\${$var_name:-$container_port}\"" >> docker-compose.override.yml
        else
            echo "      - \"$host_port:$container_port\"" >> docker-compose.override.yml
        fi
    else
        # Format: port (shorthand for port:port)
        port="$port_mapping"
        var_name=$(get_port_var "$port")
        if [ -n "$var_name" ]; then
            echo "      - \"\${$var_name:-$port}:$port\"" >> docker-compose.override.yml
        else
            echo "      - \"$port:$port\"" >> docker-compose.override.yml
        fi
    fi
done

echo "✅ Generated docker-compose.override.yml with exposed ports: $EXPOSED_PORTS"