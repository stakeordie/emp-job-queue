# Multi-stage build for optimized image size
# Stage 1: AI services base (using existing PyTorch image)
FROM pytorch/pytorch:2.7.0-cuda12.8-cudnn9-devel AS ai-base

    # Layer cache bust (separate from version to preserve custom nodes cache)
    ARG CACHE_BUST=2
    RUN echo "Cache bust: ${CACHE_BUST}"

    # Install Node.js 18 and PM2 (without starting daemon processes)
    RUN apt-get update && \
        apt-get install -y curl && \
        curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
        apt-get install -y nodejs && \
        npm install -g pnpm pm2 && \
        PM2_SILENT=true pm2 install pm2-logrotate && \
        PM2_SILENT=true pm2 set pm2-logrotate:max_size 10M && \
        PM2_SILENT=true pm2 set pm2-logrotate:retain 7 && \
        PM2_SILENT=true pm2 set pm2-logrotate:compress true && \
        PM2_SILENT=true pm2 kill && \
        apt-get clean && \
        rm -rf /var/lib/apt/lists/* ~/.pm2

    # Install system dependencies
    RUN apt-get update && \
        DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        git git-lfs wget curl jq tar nano net-tools lsof nvtop \
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

# Stage 3: Removed standalone installer - using runtime installation via ComfyUIManagementClient

# Stage 4: Base Machine - COMPLETE APPLICATION RUNTIME
FROM ai-base AS base-machine

    # Install dependencies first (better caching)
    COPY .workspace-packages/ /service-manager/.workspace-packages/
    COPY package.docker.json /service-manager/package.json
    COPY pnpm-lock.yaml* /service-manager/

    # Install dependencies
    WORKDIR /service-manager
    RUN pnpm install --prod --no-frozen-lockfile --ignore-workspace

    # Version injection will be moved to end to preserve cache

    # Copy all application files FIRST
    COPY src/ /service-manager/src/
    COPY scripts/ /service-manager/scripts/
    COPY container-profile.sh /service-manager/container-profile.sh
    RUN chmod +x /service-manager/container-profile.sh
    
    # Copy worker-driven ecosystem generator
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
    COPY scripts/entrypoint-base-common.sh /scripts/
    RUN chmod +x /scripts/entrypoint-*.sh /scripts/entrypoint-base-common.sh

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
# Copy encrypted environment file and decryption script
COPY env.encrypted /service-manager/env.encrypted
COPY env.encrypted.info /service-manager/env.encrypted.info

# Add build metadata at the very end to preserve Docker cache
ARG BUILD_TIMESTAMP
ARG MACHINE_VERSION=latest
ARG BUILD_DATE
ARG GIT_COMMIT=unknown
ARG GIT_BRANCH=unknown
ARG BUILD_ENV=production
ENV BUILD_TIMESTAMP=${BUILD_TIMESTAMP}
ENV MACHINE_VERSION=${MACHINE_VERSION}
ENV BUILD_DATE=${BUILD_DATE}
ENV GIT_COMMIT=${GIT_COMMIT}
ENV GIT_BRANCH=${GIT_BRANCH}
ENV BUILD_ENV=${BUILD_ENV}
ENV BUILD_VERSION=${MACHINE_VERSION}
ENV NODE_VERSION="18"
RUN echo "Image built at: ${BUILD_TIMESTAMP}" > /workspace/BUILD_INFO.txt && \
    echo "MACHINE_VERSION=${MACHINE_VERSION}" > /service-manager/.version && \
    echo "BUILD_DATE=${BUILD_DATE}" >> /service-manager/.version

# Use machine-final entrypoint
ENTRYPOINT ["/scripts/entrypoint-machine-final.sh"]

# Development stage - for debugging with volume mounts
FROM base-machine AS development

# Development environment setup
ENV NODE_ENV=development
ENV DEVELOPMENT_MODE=true

# Install development dependencies (like nodemon, debugger tools)
RUN cd /service-manager && npm install --include=dev

# Expose Node.js inspector port for debugging
EXPOSE 9229

# Don't copy source code - it will be volume mounted
# Source code comes from host volume mounts at runtime:
# - ./src:/service-manager/src:ro
# - ./package.json:/service-manager/package.json:ro

ENTRYPOINT ["/scripts/entrypoint-machine-final.sh"]

# Profile: comfyui - Internal ComfyUI connectors (PURE RUNTIME INSTALLATION)
FROM base-machine AS comfyui

# Accept build args from compose generator
ARG WORKER_SPEC
ARG WORKERS
ARG MACHINE_ID
ARG ENV_FILE=.env

# Convert build args to environment variables so they're baked into the container
ENV WORKERS=${WORKERS}
ENV MACHINE_ID=${MACHINE_ID}

# Copy installer tools for runtime custom node installation
# Removed installer-builder copying - using runtime ComfyUIManagementClient instead

# Copy encrypted environment file and decryption script
COPY env.encrypted /service-manager/env.encrypted
COPY env.encrypted.info /service-manager/env.encrypted.info

# Add build metadata at the very end to preserve Docker cache
ARG BUILD_TIMESTAMP
ARG MACHINE_VERSION=latest
ARG BUILD_DATE
ARG GIT_COMMIT=unknown
ARG GIT_BRANCH=unknown
ARG BUILD_ENV=production
ENV BUILD_TIMESTAMP=${BUILD_TIMESTAMP}
ENV MACHINE_VERSION=${MACHINE_VERSION}
ENV BUILD_DATE=${BUILD_DATE}
ENV GIT_COMMIT=${GIT_COMMIT}
ENV GIT_BRANCH=${GIT_BRANCH}
ENV BUILD_ENV=${BUILD_ENV}
ENV BUILD_VERSION=${MACHINE_VERSION}
ENV NODE_VERSION="18"
RUN echo "Image built at: ${BUILD_TIMESTAMP}" > /workspace/BUILD_INFO.txt && \
    echo "MACHINE_VERSION=${MACHINE_VERSION}" > /service-manager/.version && \
    echo "BUILD_DATE=${BUILD_DATE}" >> /service-manager/.version

# Use machine-final entrypoint (service manager handles ComfyUI-specific logic at runtime)
ENTRYPOINT ["/scripts/entrypoint-machine-final.sh"]


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
# Copy encrypted environment file and decryption script
COPY env.encrypted /service-manager/env.encrypted
COPY env.encrypted.info /service-manager/env.encrypted.info

# Add build metadata at the very end to preserve Docker cache
ARG BUILD_TIMESTAMP
ARG MACHINE_VERSION=latest
ARG BUILD_DATE
ARG GIT_COMMIT=unknown
ARG GIT_BRANCH=unknown
ARG BUILD_ENV=production
ENV BUILD_TIMESTAMP=${BUILD_TIMESTAMP}
ENV MACHINE_VERSION=${MACHINE_VERSION}
ENV BUILD_DATE=${BUILD_DATE}
ENV GIT_COMMIT=${GIT_COMMIT}
ENV GIT_BRANCH=${GIT_BRANCH}
ENV BUILD_ENV=${BUILD_ENV}
ENV BUILD_VERSION=${MACHINE_VERSION}
ENV NODE_VERSION="18"
RUN echo "Image built at: ${BUILD_TIMESTAMP}" > /workspace/BUILD_INFO.txt && \
    echo "MACHINE_VERSION=${MACHINE_VERSION}" > /service-manager/.version && \
    echo "BUILD_DATE=${BUILD_DATE}" >> /service-manager/.version

# Use machine-final entrypoint
ENTRYPOINT ["/scripts/entrypoint-machine-final.sh"]