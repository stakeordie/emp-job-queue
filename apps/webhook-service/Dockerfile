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
    COPY install-telemetry-stack.sh /tmp/install-telemetry-stack.sh
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
    COPY conf/fluent-bit-webhook.conf.template /webhook-server/fluent-bit/fluent-bit-webhook.conf.template

    # Copy OTEL collector configuration template
    COPY conf/otel-collector-webhook.yaml.template /webhook-server/otel/otel-collector-webhook.yaml.template

    # Copy workspace packages for dependencies (cached for install, fresh copy later)
    COPY .workspace-packages/ /webhook-server/.workspace-packages/

    # Copy package files and install dependencies during build (matching machine pattern)
    COPY package.docker.json /webhook-server/package.json
    COPY pnpm-lock.yaml* /webhook-server/
    
    # Install dependencies during Docker build (not at runtime)
    RUN pnpm install --prod --no-frozen-lockfile --ignore-workspace

    # Copy workspace packages again (always fresh - no caching)
    RUN date
    COPY .workspace-packages/ /webhook-server/.workspace-packages/

    # Copy application source
    COPY dist/ /webhook-server/dist/
    COPY src/ /webhook-server/src/

    # Copy inheritance-based entrypoint system
    COPY scripts/entrypoint-base-common.sh /scripts/entrypoint-base-common.sh
    COPY scripts/entrypoint-apiwebhook-base.sh /scripts/entrypoint-apiwebhook-base.sh
    COPY entrypoint-webhook-final.sh /scripts/entrypoint-webhook-final.sh
    RUN chmod +x /scripts/*.sh

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

    # Use inheritance-based entrypoint script
    ENTRYPOINT ["/scripts/entrypoint-webhook-final.sh"]