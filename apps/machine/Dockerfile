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

# Stage 3: Bundle standalone installer  
FROM node:18-slim AS installer-builder
WORKDIR /build
COPY package.json pnpm-lock.yaml* ./
COPY .workspace-packages/ ./.workspace-packages/
RUN npm install -g pnpm && \
    # Remove workspace references for standalone build
    sed -i 's/"@emp\/service-config": "workspace:\*"/"@emp\/service-config": "file:.workspace-packages\/service-config"/' package.json && \
    sed -i 's/"@emp\/custom-nodes": "workspace:\*"/"@emp\/custom-nodes": "file:.workspace-packages\/custom-nodes"/' package.json && \
    pnpm install --prod --no-frozen-lockfile --ignore-workspace

COPY src/services/comfyui-installer-standalone.js ./installer.js
# Create package.json for ES module support
RUN echo '{"type": "module"}' > installer-package.json
# Create properly bundled executable file
RUN cat installer.js | sed '1{/^#!/d;}' > installer-bundle.js && \
    sed -i '1i#!/usr/bin/env node' installer-bundle.js && \
    chmod +x installer-bundle.js

# Stage 4: ComfyUI base (runs in parallel with installer build)
FROM ai-base AS comfyui-base
RUN echo "Installing ComfyUI base..." && \
    git clone -b forward https://github.com/stakeordie/ComfyUI.git /workspace/ComfyUI && \
    cd /workspace/ComfyUI && \
    pip install -r requirements.txt && \
    echo "ComfyUI base installation complete"

# Stage 5: Custom nodes installation (combines previous stages)
FROM comfyui-base AS with-custom-nodes
# Copy bundled installer and dependencies from builder stage
COPY --from=installer-builder /build/node_modules /installer/node_modules  
COPY --from=installer-builder /build/installer-bundle.js /installer/
COPY --from=installer-builder /build/installer-package.json /installer/package.json
COPY --from=installer-builder /build/.workspace-packages /installer/.workspace-packages

# Copy custom nodes config
COPY config_nodes.json /workspace/config_nodes.json

# Install custom nodes using bundled installer (cached until config changes)
ARG CUSTOM_NODES_CACHE_BUST=default
ENV CUSTOM_NODES_CACHE_BUST=${CUSTOM_NODES_CACHE_BUST}
RUN echo "Installing custom nodes (cache bust: $CUSTOM_NODES_CACHE_BUST)" && \
    cd /installer && \
    NODE_PATH=/installer/node_modules node installer-bundle.js --build-time --custom-nodes-only

# Stage 6: Final image with service source code
FROM with-custom-nodes AS installed-comfy

# Copy service source code (changes frequently but doesn't affect custom nodes cache)
COPY src/ /service-manager/src/
COPY package.json pnpm-lock.yaml* /service-manager/
COPY .workspace-packages/ /service-manager/.workspace-packages/

# Install service dependencies
RUN cd /service-manager && \
    sed -i 's/"@emp\/service-config": "workspace:\*"/"@emp\/service-config": "file:.workspace-packages\/service-config"/' package.json && \
    sed -i 's/"@emp\/custom-nodes": "workspace:\*"/"@emp\/custom-nodes": "file:.workspace-packages\/custom-nodes"/' package.json && \
    pnpm install --prod --no-frozen-lockfile --ignore-workspace

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
COPY generate-pm2-ecosystem.js /service-manager/generate-pm2-ecosystem.js

# Set up environment
ENV NODE_ENV=production \
    LOG_LEVEL=info \
    SERVICE_MANAGER_PATH=/service-manager \
    WORKSPACE_PATH=/workspace \
    PM2_HOME=/workspace/.pm2 \
    PATH="/service-manager/node_modules/.bin:${PATH}"

# Copy PM2 ecosystem config to workspace (needed by PM2)
RUN cp /service-manager/scripts/pm2-ecosystem.config.cjs /workspace/pm2-ecosystem.config.cjs

# Create env files script
RUN echo 'import EnvCreator from "../src/services/comfyui-env-creator.js";\n\
const creator = new EnvCreator({}, {});\n\
await creator.onStart();\n\
console.log("Environment files created successfully");' > /service-manager/scripts/create-env-files.mjs

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
node /service-manager/scripts/create-env-files.mjs\n\
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