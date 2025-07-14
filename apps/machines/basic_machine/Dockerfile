# Multi-stage build for optimized image size
# Stage 1: Node.js dependencies
FROM node:18-slim AS node-deps
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --no-frozen-lockfile

# Stage 2: AI services base (using existing PyTorch image)
FROM pytorch/pytorch:2.7.0-cuda12.8-cudnn9-devel AS ai-base

# Layer cache bust
ARG CACHE_BUST=2
RUN echo "Cache bust: ${CACHE_BUST}"

# Install Node.js 18 and PM2
RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g pnpm pm2 && \
    pm2 install pm2-logrotate && \
    pm2 set pm2-logrotate:max_size 10M && \
    pm2 set pm2-logrotate:retain 7 && \
    pm2 set pm2-logrotate:compress true && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install system dependencies
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    git git-lfs wget curl jq tar nano net-tools lsof \
    nginx ffmpeg libsm6 libxext6 rsync \
    build-essential libgoogle-perftools-dev cmake ninja-build \
    openssh-client sudo cron zstd ca-certificates \
    python3-pip python3-dev python3-venv && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set up working directory
WORKDIR /workspace

# Create necessary directories
RUN mkdir -p \
    /workspace/logs \
    /workspace/models \
    /workspace/ComfyUI \
    /workspace/stable-diffusion-webui \
    /workspace/configs \
    /workspace/tmp \
    /workspace/.pm2 \
    /workspace/scripts

# Stage 3: Final image
FROM ai-base

# Build arguments for secrets (ComfyUI custom nodes)
ARG AWS_ACCESS_KEY_ID
ARG AWS_SECRET_ACCESS_KEY_ENCODED
ARG AWS_DEFAULT_REGION
ARG GOOGLE_APPLICATION_CREDENTIALS
ARG AZURE_STORAGE_ACCOUNT
ARG AZURE_STORAGE_KEY
ARG CLOUD_STORAGE_CONTAINER
ARG CLOUD_MODELS_CONTAINER
ARG CLOUD_STORAGE_TEST_CONTAINER
ARG CLOUD_PROVIDER
ARG STATIC_MODELS
ARG EMPROPS_DEBUG_LOGGING
ARG HF_TOKEN
ARG CIVITAI_TOKEN
ARG OLLAMA_HOST
ARG OLLAMA_PORT
ARG OLLAMA_DEFAULT_MODEL
ARG OPENAI_API_KEY

# Cache layer 1: Install ComfyUI base (this rarely changes) 
RUN echo "Installing ComfyUI base..." && \
    git clone https://github.com/comfyanonymous/ComfyUI.git /workspace/ComfyUI && \
    cd /workspace/ComfyUI && \
    pip install -r requirements.txt && \
    echo "ComfyUI base installation complete"

# Cache layer 2: Copy custom nodes configuration for better custom nodes caching
COPY config_nodes.json /workspace/config_nodes.json

# Cache layer 3: Copy minimal files needed for custom nodes installation
COPY src/ /service-manager/src/
COPY package.json /service-manager/package.json
COPY --from=node-deps /app/node_modules /service-manager/node_modules

# Cache layer 4: Install custom nodes (this layer will cache if config_nodes.json doesn't change)
ARG CUSTOM_NODES_CACHE_BUST=default
ENV CUSTOM_NODES_CACHE_BUST=${CUSTOM_NODES_CACHE_BUST}

RUN echo "Installing custom nodes (cache bust: $CUSTOM_NODES_CACHE_BUST)" && \
    # Set environment variables for the installer
    export AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID" && \
    export AWS_SECRET_ACCESS_KEY_ENCODED="$AWS_SECRET_ACCESS_KEY_ENCODED" && \
    export AWS_DEFAULT_REGION="$AWS_DEFAULT_REGION" && \
    export GOOGLE_APPLICATION_CREDENTIALS="$GOOGLE_APPLICATION_CREDENTIALS" && \
    export AZURE_STORAGE_ACCOUNT="$AZURE_STORAGE_ACCOUNT" && \
    export AZURE_STORAGE_KEY="$AZURE_STORAGE_KEY" && \
    export CLOUD_STORAGE_CONTAINER="$CLOUD_STORAGE_CONTAINER" && \
    export CLOUD_MODELS_CONTAINER="$CLOUD_MODELS_CONTAINER" && \
    export CLOUD_STORAGE_TEST_CONTAINER="$CLOUD_STORAGE_TEST_CONTAINER" && \
    export CLOUD_PROVIDER="$CLOUD_PROVIDER" && \
    export STATIC_MODELS="$STATIC_MODELS" && \
    export EMPROPS_DEBUG_LOGGING="$EMPROPS_DEBUG_LOGGING" && \
    export HF_TOKEN="$HF_TOKEN" && \
    export CIVITAI_TOKEN="$CIVITAI_TOKEN" && \
    export OLLAMA_HOST="$OLLAMA_HOST" && \
    export OLLAMA_PORT="$OLLAMA_PORT" && \
    export OLLAMA_DEFAULT_MODEL="$OLLAMA_DEFAULT_MODEL" && \
    export OPENAI_API_KEY="$OPENAI_API_KEY" && \
    # Run ComfyUI custom nodes installer only
    node /service-manager/src/services/comfyui-installer.js --build-time --custom-nodes-only

# Cache layer 5: Copy remaining application files
COPY scripts/ /service-manager/scripts/

# Set up environment
ENV NODE_ENV=production \
    LOG_LEVEL=info \
    SERVICE_MANAGER_PATH=/service-manager \
    WORKSPACE_PATH=/workspace \
    PM2_HOME=/workspace/.pm2 \
    PATH="/service-manager/node_modules/.bin:${PATH}"

# Copy PM2 ecosystem config to workspace (needed by PM2)
RUN cp /service-manager/scripts/pm2-ecosystem.config.cjs /workspace/pm2-ecosystem.config.cjs

# Create startup script that runs our Node.js app as PID 1
RUN echo '#!/bin/bash\n\
set -e\n\
echo "Starting Basic Machine with Node.js as PID 1..."\n\
\n\
# Set environment\n\
export PM2_HOME=/workspace/.pm2\n\
export SERVICE_MANAGER_PATH=/service-manager\n\
export WORKSPACE_PATH=/workspace\n\
\n\
# Change to service manager directory and run our Node.js app directly\n\
cd /service-manager\n\
exec node src/index-pm2.js' > /entrypoint.sh && \
    chmod +x /entrypoint.sh

# Expose common ports
# SSH
EXPOSE 22
# NGINX (optional)
EXPOSE 80 443
# ComfyUI (8188-8195 for up to 8 GPUs)
EXPOSE 8188-8195
# Automatic1111 (3001-3008 for up to 8 GPUs)
EXPOSE 3001-3008
# Ollama
EXPOSE 11434
# Health monitoring
EXPOSE 9090

# Health check (use health monitoring port instead of NGINX)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5m --retries=3 \
    CMD curl -f http://localhost:9090/health || exit 1

# Set entrypoint
ENTRYPOINT ["/entrypoint.sh"]