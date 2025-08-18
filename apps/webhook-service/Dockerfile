# Webhook Service Dockerfile - Based on API pattern with OTEL & Fluent Bit
FROM ubuntu:22.04

    # Layer cache bust
    ARG CACHE_BUST=1
    RUN echo "Webhook cache bust: ${CACHE_BUST}"

    # Install Node.js 18 and essential system packages (matching API pattern)
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
    COPY scripts/install-telemetry-stack.sh /tmp/install-telemetry-stack.sh
    RUN chmod +x /tmp/install-telemetry-stack.sh && \
        SERVICE_TYPE=webhook SERVICE_DIR=/webhook-server /tmp/install-telemetry-stack.sh && \
        rm /tmp/install-telemetry-stack.sh

    # Set up workspace structure
    WORKDIR /webhook-server
    # Directories already created by install-telemetry-stack.sh
    RUN mkdir -p /tmp/fluent-bit-buffer

    # Create .workspace-packages directory structure for monorepo support
    RUN mkdir -p /webhook-server/.workspace-packages

    # Build args for configuration
    ARG BUILD_DATE
    ARG MACHINE_ID=webhook-local
    ARG ENV_FILE=.env.local-dev

    # Convert build args to environment variables
    ENV BUILD_DATE=${BUILD_DATE}
    ENV MACHINE_ID=${MACHINE_ID}

    # Copy Fluent Bit configuration template
    COPY fluent-bit-webhook.conf.template /webhook-server/fluent-bit/fluent-bit-webhook.conf.template

    # Copy OTEL collector configuration template
    COPY otel-collector-webhook.yaml.template /webhook-server/otel/otel-collector-webhook.yaml.template

    # Copy workspace packages first (for better layer caching)
    COPY .workspace-packages/ /webhook-server/.workspace-packages/

    # Copy package files (dependencies will be installed at runtime)
    COPY package.docker.json /webhook-server/package.json
    COPY pnpm-lock.yaml* /webhook-server/

    # Copy application source
    COPY dist/ /webhook-server/dist/
    COPY src/ /webhook-server/src/

    # Copy entrypoint script and telemetry functions
    COPY scripts/telemetry-entrypoint-functions.sh ./scripts/telemetry-entrypoint-functions.sh
    COPY entrypoint-webhook.sh ./entrypoint-webhook.sh
    RUN chmod +x ./scripts/telemetry-entrypoint-functions.sh ./entrypoint-webhook.sh

    # Set environment
    ENV NODE_ENV=production \
        LOG_LEVEL=info \
        LOG_DIR=/webhook-server/logs \
        PATH="/webhook-server/node_modules/.bin:${PATH}"

    # Expose webhook service port
    EXPOSE 3332

    # Health check
    HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
      CMD curl -f http://localhost:3332/health || exit 1

    # Use entrypoint script
    ENTRYPOINT ["./entrypoint-webhook.sh"]