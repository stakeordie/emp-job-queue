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
ARG CACHE_BUST=1
RUN echo "Cache bust: ${CACHE_BUST}"

# Install Node.js 18
RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g pnpm && \
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
    /workspace/tmp

# Stage 3: Final image
FROM ai-base

# Copy Node.js application
COPY --from=node-deps /app/node_modules /service-manager/node_modules
COPY . /service-manager/

# Set up environment
ENV NODE_ENV=production \
    LOG_LEVEL=info \
    SERVICE_MANAGER_PATH=/service-manager \
    WORKSPACE_PATH=/workspace \
    PATH="/service-manager/node_modules/.bin:${PATH}"

# Create startup script
RUN echo '#!/bin/bash\n\
set -e\n\
echo "Starting Basic Machine..."\n\
cd /service-manager\n\
exec node src/index.js' > /entrypoint.sh && \
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