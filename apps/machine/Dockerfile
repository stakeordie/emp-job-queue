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
        python3-pip python3-dev python3-venv gettext-base && \
        apt-get clean && \
        rm -rf /var/lib/apt/lists/*

    # Install unified telemetry stack (nginx-extras, Fluent Bit, OTEL Collector)
    COPY install-telemetry-stack.sh /tmp/install-telemetry-stack.sh
    RUN chmod +x /tmp/install-telemetry-stack.sh && \
        SERVICE_TYPE=machine SERVICE_DIR=/workspace /tmp/install-telemetry-stack.sh && \
        rm /tmp/install-telemetry-stack.sh

    # Set up working directory
    WORKDIR /workspace
    
    # Add build timestamp for debugging
    ARG BUILD_TIMESTAMP
    ENV BUILD_TIMESTAMP=${BUILD_TIMESTAMP}
    RUN echo "Image built at: ${BUILD_TIMESTAMP}" > /workspace/BUILD_INFO.txt

    # Create necessary directories
    RUN mkdir -p \
        /workspace/logs \
        /workspace/models \
        /workspace/ComfyUI \
        /workspace/stable-diffusion-webui \
        /workspace/configs \
        /workspace/tmp \
        /workspace/.pm2 \
        /workspace/scripts \
        /workspace/fluent-bit \
        /tmp/fluent-bit-buffer

    # TelemetryClient will generate all configs at runtime
    # Removed static template files - using unified TelemetryClient instead

# Stage 3: ComfyUI Base Installation (HEAVY BUT STABLE)
FROM ai-base AS comfyui-base

    # Install ComfyUI base - this layer caches until ComfyUI repo changes
    RUN echo "Installing ComfyUI base..." && \
        git clone -b forward https://github.com/stakeordie/ComfyUI.git /workspace/ComfyUI && \
        cd /workspace/ComfyUI && \
        pip install -r requirements.txt && \
        echo "ComfyUI base installation complete"

# Stage 4: Bundle standalone installer
FROM comfyui-base AS installer-builder
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

# Stage 5: Base Machine - COMPLETE APPLICATION RUNTIME (BUILT AFTER COMFYUI CACHING)
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

    # Copy entrypoint scripts
    COPY scripts/entrypoint-*.sh /scripts/
    RUN chmod +x /scripts/entrypoint-*.sh

    # Health check (use health monitoring port instead of NGINX)
    HEALTHCHECK --interval=30s --timeout=10s --start-period=5m --retries=3 \
        CMD curl -f http://localhost:9090/health || exit 1

    # PROFILE TARGETS - Each inherits from appropriate base

# Profile: base - External API connectors (minimal setup)
FROM base-machine AS base

# Accept build args from compose generator
ARG WORKER_SPEC
ARG WORKERS
ARG MACHINE_ID
ARG ENV_FILE=.env

# Convert build args to environment variables so they're baked into the container
ENV WORKERS=${WORKERS}
ENV MACHINE_ID=${MACHINE_ID}

# Inherits: Complete application runtime including entrypoint, PM2, service manager
# No additional installations - for external API connectors like comfyui-remote
COPY --from=base-machine /service-manager/worker-bundled /service-manager/worker-bundled
COPY ${ENV_FILE} /service-manager/.env

# Use base-specific entrypoint
ENTRYPOINT ["/scripts/entrypoint-base.sh"]

# Profile: comfyui - Internal ComfyUI connectors (NOW USES RUNTIME COMPONENT INSTALLATION)
FROM comfyui-base AS comfyui

# Accept build args from compose generator
ARG WORKER_SPEC
ARG WORKERS
ARG MACHINE_ID
ARG ENV_FILE=.env

# Convert build args to environment variables so they're baked into the container
ENV WORKERS=${WORKERS}
ENV MACHINE_ID=${MACHINE_ID}

# Copy application runtime from base-machine
COPY --from=base-machine /service-manager /service-manager

# Copy installer tools for runtime custom node installation
COPY --from=installer-builder /build/installer-bundle.js /service-manager/installer-bundle.js
COPY --from=installer-builder /build/node_modules /service-manager/node_modules

# Set up environment (copied from base-machine)
ENV NODE_ENV=production \
    LOG_LEVEL=info \
    SERVICE_MANAGER_PATH=/service-manager \
    WORKSPACE_PATH=/workspace \
    PM2_HOME=/workspace/.pm2 \
    PATH="/service-manager/node_modules/.bin:${PATH}"

# Worker bundle mode
ENV WORKER_BUNDLE_MODE=${WORKER_BUNDLE_MODE}

# Create worker-bundled directory and copy worker files
RUN mkdir -p /workspace/worker-bundled
COPY worker-bundled/ /service-manager/worker-bundled/

# Copy PM2 ecosystem config to workspace (needed by PM2)
RUN cp /service-manager/scripts/pm2-ecosystem.config.cjs /workspace/pm2-ecosystem.config.cjs

# Copy environment file
COPY ${ENV_FILE} /service-manager/.env

# Copy entrypoint scripts
COPY scripts/entrypoint-*.sh /scripts/
RUN chmod +x /scripts/entrypoint-*.sh

# Health check (use health monitoring port instead of NGINX)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5m --retries=3 \
    CMD curl -f http://localhost:9090/health || exit 1

# Use base entrypoint (service manager handles ComfyUI-specific logic)
ENTRYPOINT ["/scripts/entrypoint-base.sh"]


# Profile: simulation - Testing and simulation  
FROM base-machine AS simulation

# Accept build args from compose generator
ARG WORKER_SPEC
ARG WORKERS
ARG MACHINE_ID
ARG ENV_FILE=.env

# Convert build args to environment variables so they're baked into the container
ENV WORKERS=${WORKERS}
ENV MACHINE_ID=${MACHINE_ID}

# Inherits: Complete application runtime including entrypoint, PM2, service manager
# Add: Any simulation-specific setup here if needed
COPY --from=base-machine /service-manager/worker-bundled /service-manager/worker-bundled
COPY ${ENV_FILE} /service-manager/.env

# Use simulation-specific entrypoint
ENTRYPOINT ["/scripts/entrypoint-base.sh"]