# Multi-stage build for optimized image size
# Stage 1: Node.js dependencies
FROM node:18-slim AS node-deps
WORKDIR /app
RUN npm install -g pnpm

# Stage 2: AI services base (using existing PyTorch image)
FROM pytorch/pytorch:2.7.0-cuda12.8-cudnn9-devel AS ai-base

# Layer cache bust (separate from version to preserve custom nodes cache)
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
FROM ai-base as installed-comfy

# No build-time environment variables needed - all handled at runtime

# Cache layer 1: Install ComfyUI base (this rarely changes) 
RUN echo "Installing ComfyUI base..." && \
    git clone -b forward https://github.com/stakeordie/ComfyUI.git /workspace/ComfyUI && \
    cd /workspace/ComfyUI && \
    pip install -r requirements.txt && \
    echo "ComfyUI base installation complete"

# Cache layer 2: Copy workspace packages for dependencies
COPY .workspace-packages/ /service-manager/.workspace-packages/

# Cache layer 3: Copy custom nodes configuration for better custom nodes caching
COPY config_nodes.json /workspace/config_nodes.json

# Cache layer 4: Copy standalone installer and minimal dependencies
COPY src/services/comfyui-installer-standalone.js /service-manager/src/services/
COPY package.json pnpm-lock.yaml* /service-manager/

# Install workspace packages locally first, then install machine dependencies
RUN cd /service-manager && \
    # Remove workspace references from package.json for Docker build and use relative paths
    sed -i 's/"@emp\/service-config": "workspace:\*"/"@emp\/service-config": "file:.workspace-packages\/service-config"/' package.json && \
    sed -i 's/"@emp\/custom-nodes": "workspace:\*"/"@emp\/custom-nodes": "file:.workspace-packages\/custom-nodes"/' package.json && \
    # Install dependencies using file: references
    pnpm install --prod --no-frozen-lockfile --ignore-workspace

# Cache layer 5: Install custom nodes (this layer will cache if config_nodes.json doesn't change)
ARG CUSTOM_NODES_CACHE_BUST=default
ENV CUSTOM_NODES_CACHE_BUST=${CUSTOM_NODES_CACHE_BUST}

RUN echo "Installing custom nodes (cache bust: $CUSTOM_NODES_CACHE_BUST)" && \
    # Install custom nodes WITHOUT environment variables (no .env files created)
    # Environment variables and .env files will be processed at runtime
    node /service-manager/src/services/comfyui-installer-standalone.js --build-time --custom-nodes-only --skip-env

# Cache layer 6: Copy the rest of the service source code (changes frequently)
COPY src/ /service-manager/src/

FROM installed-comfy

# Inject machine version and build info AFTER custom nodes (for better caching)
ARG MACHINE_VERSION=latest
ARG BUILD_DATE
RUN cd /service-manager && \
    sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"${MACHINE_VERSION}\"/" package.json && \
    echo "MACHINE_VERSION=${MACHINE_VERSION}" > .version && \
    echo "BUILD_DATE=${BUILD_DATE}" >> .version

# Set environment variables for runtime
ENV MACHINE_VERSION=${MACHINE_VERSION}
ENV BUILD_DATE=${BUILD_DATE}

# Cache layer 6: Copy remaining application files
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
# Change to service manager directory\n\
cd /service-manager\n\
pnpm install\n\
\n\
# Create runtime .env files for custom nodes before starting services\n\
echo "Creating runtime .env files for custom nodes..."\n\
node src/services/runtime-env-creator.js\n\
\n\
# Start the main application\n\
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