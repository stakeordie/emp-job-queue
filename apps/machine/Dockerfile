# Multi-stage build for optimized image size
# Stage 1: AI services base (using existing PyTorch image)
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

# Stage 3: ComfyUI Base Installation (HEAVY BUT STABLE)
FROM ai-base AS comfyui-base

    # Install ComfyUI base - this layer caches until ComfyUI repo changes
    RUN echo "Installing ComfyUI base..." && \
        git clone -b forward https://github.com/stakeordie/ComfyUI.git /workspace/ComfyUI && \
        cd /workspace/ComfyUI && \
        pip install -r requirements.txt && \
        echo "ComfyUI base installation complete"

    # Stage 4: Bundle standalone installer
    FROM node:18-slim AS installer-builder
    WORKDIR /build
    RUN npm install -g pnpm

    # Copy minimal files needed for installer
    COPY package.json pnpm-lock.yaml* ./
    COPY .workspace-packages/ ./.workspace-packages/
    RUN sed -i 's/"@emp\/service-config": "workspace:\*"/"@emp\/service-config": "file:.workspace-packages\/service-config"/' package.json && \
        sed -i 's/"@emp\/custom-nodes": "workspace:\*"/"@emp\/custom-nodes": "file:.workspace-packages\/custom-nodes"/' package.json && \
        pnpm install --prod --no-frozen-lockfile --ignore-workspace

    COPY src/services/comfyui-installer-standalone.js ./installer.js
    RUN echo '{"type": "module"}' > installer-package.json && \
        cat installer.js | sed '1{/^#!/d;}' > installer-bundle.js && \
        sed -i '1i#!/usr/bin/env node' installer-bundle.js && \
        chmod +x installer-bundle.js

# Stage 5: ComfyUI + Custom Nodes (HEAVY BUT STABLE UNTIL CONFIG CHANGES)
FROM comfyui-base AS comfyui-with-nodes

    # Copy custom nodes config (cache busts only when this file changes)
    COPY config_nodes.json /workspace/config_nodes.json

    # Copy bundled installer
    COPY --from=installer-builder /build/node_modules /installer/node_modules  
    COPY --from=installer-builder /build/installer-bundle.js /installer/
    COPY --from=installer-builder /build/installer-package.json /installer/package.json
    COPY --from=installer-builder /build/.workspace-packages /installer/.workspace-packages

    # Install custom nodes - this caches until config_nodes.json changes
    ARG CUSTOM_NODES_CACHE_BUST=default
    ENV CUSTOM_NODES_CACHE_BUST=${CUSTOM_NODES_CACHE_BUST}
    RUN echo "Installing custom nodes (cache bust: $CUSTOM_NODES_CACHE_BUST)" && \
        cd /installer && \
        NODE_PATH=/installer/node_modules node installer-bundle.js --build-time --custom-nodes-only

# Stage 6: Base Machine - COMPLETE APPLICATION RUNTIME (BUILT AFTER COMFYUI CACHING)
FROM ai-base AS base-machine

    # Install dependencies first (better caching)
    COPY package.json pnpm-lock.yaml* /service-manager/
    COPY .workspace-packages/ /service-manager/.workspace-packages/

    # Install dependencies
    WORKDIR /service-manager
    RUN sed -i 's/"@emp\/service-config": "workspace:\*"/"@emp\/service-config": "file:.workspace-packages\/service-config"/' package.json && \
        sed -i 's/"@emp\/custom-nodes": "workspace:\*"/"@emp\/custom-nodes": "file:.workspace-packages\/custom-nodes"/' package.json && \
        pnpm install --prod --no-frozen-lockfile --ignore-workspace

    # Inject machine version and build info
    ARG MACHINE_VERSION=latest
    ARG BUILD_DATE
    RUN sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"${MACHINE_VERSION}\"/" package.json && \
        echo "MACHINE_VERSION=${MACHINE_VERSION}" > .version && \
        echo "BUILD_DATE=${BUILD_DATE}" >> .version

    # Set environment variables for runtime
    ENV MACHINE_VERSION=${MACHINE_VERSION}
    ENV BUILD_DATE=${BUILD_DATE}

    # Copy all application files
    COPY src/ /service-manager/src/
    COPY scripts/ /service-manager/scripts/
    COPY generate-pm2-ecosystem-worker-driven.js /service-manager/generate-pm2-ecosystem-worker-driven.js

    # Set up environment
    ENV NODE_ENV=production \
        LOG_LEVEL=info \
        SERVICE_MANAGER_PATH=/service-manager \
        WORKSPACE_PATH=/workspace \
        PM2_HOME=/workspace/.pm2 \
        PATH="/service-manager/node_modules/.bin:${PATH}"

    # Worker bundle mode - build arg for build-time decisions, ENV for runtime
    ENV WORKER_BUNDLE_MODE=${WORKER_BUNDLE_MODE}

    # Create worker-bundled directory
    RUN mkdir -p /workspace/worker-bundled

    COPY worker-bundled/ /service-manager/worker-bundled/

    # Copy PM2 ecosystem config to workspace (needed by PM2)
    RUN cp /service-manager/scripts/pm2-ecosystem.config.cjs /workspace/pm2-ecosystem.config.cjs

    # Create env files script
    RUN echo 'import EnvCreator from "../src/services/comfyui-env-creator.js";\n\
    const creator = new EnvCreator({}, {});\n\
    await creator.onStart();\n\
    console.log("Environment files created successfully");' > /service-manager/scripts/create-env-files.mjs

    # Create base startup script for all profiles
    RUN echo '#!/bin/bash\n\
    set -e\n\
    echo "Starting EMP Machine..."\n\
    \n\
    # Set environment\n\
    export PM2_HOME=/workspace/.pm2\n\
    export SERVICE_MANAGER_PATH=/service-manager\n\
    export WORKSPACE_PATH=/workspace\n\
    \n\
    # Source the entire .env file\n\
    if [ -f "/service-manager/.env" ]; then\n\
        set -a\n\
        . /service-manager/.env\n\
        set +a\n\
    fi\n\
    \n\
    # Handle worker bundle based on WORKER_BUNDLE_MODE\n\
    echo "Worker bundle mode: $WORKER_BUNDLE_MODE"\n\
    if [ "$WORKER_BUNDLE_MODE" = "local" ]; then\n\
        echo "Local mode: Using bundled worker from build time"\n\
        cp -r /service-manager/worker-bundled /workspace/\n\
        ls /workspace/worker-bundled\n\
    else\n\
      echo "Remote mode: Individual services will download workers as needed"\n\
    fi\n\
    \n\
    # Change to service manager directory\n\
    cd /service-manager\n\
    pnpm install\n\
    \n\
    # Create runtime .env files for custom nodes (if needed)\n\
    if [ -f "/service-manager/scripts/create-env-files.mjs" ]; then\n\
        echo "Creating runtime .env files for custom nodes..."\n\
        node /service-manager/scripts/create-env-files.mjs || echo "No custom nodes env setup needed"\n\
    fi\n\
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

    # Base entrypoint - all profiles inherit this
    ENTRYPOINT ["/entrypoint.sh"]

    # PROFILE TARGETS - Each inherits from appropriate base

# Profile: base - External API connectors (minimal setup)
FROM base-machine AS base

# Accept build args from compose generator
ARG WORKER_SPEC
ARG WORKERS
ARG MACHINE_ID

# Convert build args to environment variables so they're baked into the container
ENV WORKERS=${WORKERS}
ENV MACHINE_ID=${MACHINE_ID}

# Inherits: Complete application runtime including entrypoint, PM2, service manager
# No additional installations - for external API connectors like comfyui-remote
COPY --from=base-machine /service-manager/worker-bundled /service-manager/worker-bundled
COPY .env /service-manager/.env

# Profile: comfyui - Internal ComfyUI connectors  
FROM base-machine AS comfyui

# Accept build args from compose generator
ARG WORKER_SPEC
ARG WORKERS
ARG MACHINE_ID

# Convert build args to environment variables so they're baked into the container
ENV WORKERS=${WORKERS}
ENV MACHINE_ID=${MACHINE_ID}

# Inherits: Complete application runtime including entrypoint, PM2, service manager
# Add: ComfyUI installation and custom nodes
COPY .env /service-manager/.env

# Copy ComfyUI installation from the ComfyUI pipeline
COPY --from=comfyui-with-nodes /workspace/ComfyUI /workspace/ComfyUI
COPY --from=comfyui-with-nodes /installer /installer
COPY --from=comfyui-with-nodes /workspace/config_nodes.json /workspace/config_nodes.json
COPY --from=base-machine /service-manager/worker-bundled /service-manager/worker-bundled
COPY .env /service-manager/.env

# Profile: playwright - Browser automation
FROM base-machine AS playwright
# Inherits: Complete application runtime including entrypoint, PM2, service manager
# Add: Playwright browsers

RUN apt-get update && \
    apt-get install -y wget && \
    npx playwright install --with-deps chromium && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

    # Accept build args from compose generator
    ARG WORKER_SPEC
    ARG WORKERS
    ARG MACHINE_ID

    # Convert build args to environment variables so they're baked into the container
    ENV WORKERS=${WORKERS}
    ENV MACHINE_ID=${MACHINE_ID}

    COPY --from=base-machine /service-manager/worker-bundled /service-manager/worker-bundled
    COPY .env /service-manager/.env

# Profile: simulation - Testing and simulation  
FROM base-machine AS simulation

# Accept build args from compose generator
ARG WORKER_SPEC
ARG WORKERS
ARG MACHINE_ID

# Convert build args to environment variables so they're baked into the container
ENV WORKERS=${WORKERS}
ENV MACHINE_ID=${MACHINE_ID}

# Inherits: Complete application runtime including entrypoint, PM2, service manager
# Add: Any simulation-specific setup here if needed
COPY --from=base-machine /service-manager/worker-bundled /service-manager/worker-bundled
COPY .env /service-manager/.env