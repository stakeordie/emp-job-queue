# API Dockerfile - Based 100% on minimal-base machine pattern
FROM ubuntu:22.04

    # Layer cache bust
    ARG CACHE_BUST=1
    RUN echo "API cache bust: ${CACHE_BUST}"

    # Install Node.js 18 and essential system packages (matching minimal-base)
    RUN apt-get clean && \
        rm -rf /var/lib/apt/lists/* && \
        apt-get update --allow-releaseinfo-change && \
        apt-get install -y ca-certificates gnupg curl git wget jq tar nano net-tools lsof && \
        curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
        apt-get install -y nodejs && \
        npm install -g pnpm && \
        apt-get clean && \
        rm -rf /var/lib/apt/lists/*

    # Copy and run telemetry stack installation script
    COPY install-telemetry-stack.sh /tmp/install-telemetry-stack.sh
    RUN chmod +x /tmp/install-telemetry-stack.sh && \
        SERVICE_TYPE=api SERVICE_DIR=/api-server /tmp/install-telemetry-stack.sh && \
        rm /tmp/install-telemetry-stack.sh

    # Set up workspace structure
    WORKDIR /api-server
    # Directories already created by install-telemetry-stack.sh

    # Copy workspace packages for dependencies
    COPY .workspace-packages/ ./.workspace-packages/

    # Copy package files and install dependencies during build (matching machine pattern)
    COPY package.docker.json ./package.json
    COPY pnpm-lock.yaml ./
    
    # Install dependencies during Docker build (not at runtime)
    RUN pnpm install --prod --no-frozen-lockfile --ignore-workspace

    # Copy application source
    COPY src/ ./src/
    COPY dist/ ./dist/

    # Copy configuration templates
    COPY conf/otel-collector-api.yaml.template ./otel/otel-collector-api.yaml.template
    COPY conf/fluent-bit-api.conf.template ./fluent-bit/fluent-bit-api.conf.template
    COPY conf/fluent-bit-api-forward.conf.template ./fluent-bit-api-forward.conf.template

    # Copy inheritance-based entrypoint system
    COPY scripts/entrypoint-base-common.sh /scripts/entrypoint-base-common.sh
    COPY scripts/entrypoint-apiwebhook-base.sh /scripts/entrypoint-apiwebhook-base.sh
    COPY entrypoint-api-final.sh /scripts/entrypoint-api-final.sh
    RUN chmod +x /scripts/*.sh

    # Build-time metadata
    ARG BUILD_DATE
    RUN echo "BUILD_DATE=${BUILD_DATE}" >> .version
    ENV BUILD_DATE=${BUILD_DATE}

    # Set environment
    ENV NODE_ENV=production \
        LOG_LEVEL=info \
        LOG_DIR=/api-server/logs \
        PATH="/api-server/node_modules/.bin:${PATH}"

    # Expose API port
    EXPOSE 3331

    # Health check
    HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
      CMD curl -f http://localhost:3331/health || exit 1

    # Use inheritance-based entrypoint script
    ENV SERVICE_TYPE=api
    ENTRYPOINT ["/scripts/entrypoint-api-final.sh"]