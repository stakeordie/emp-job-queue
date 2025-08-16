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

    # Install minimal system dependencies
    RUN apt-get update && \
        DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        git-lfs openssh-client zstd ca-certificates \
        python3-pip python3-dev gettext-base && \
        apt-get clean && \
        rm -rf /var/lib/apt/lists/*

    # Install Fluent Bit for structured logging
    RUN FLUENT_BIT_VERSION="3.1.8" && \
        curl -fsSL "https://packages.fluentbit.io/fluentbit.key" | apt-key add - && \
        echo "deb https://packages.fluentbit.io/ubuntu/jammy jammy main" | tee /etc/apt/sources.list.d/fluent-bit.list && \
        apt-get update && \
        apt-get install -y fluent-bit=${FLUENT_BIT_VERSION}* && \
        apt-get clean && \
        rm -rf /var/lib/apt/lists/*

    # Install OpenTelemetry Collector
    RUN OTEL_VERSION="0.114.0" && \
        curl -fsSL "https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v${OTEL_VERSION}/otelcol-contrib_${OTEL_VERSION}_linux_amd64.tar.gz" | \
        tar -xzC /usr/local/bin/ && \
        chmod +x /usr/local/bin/otelcol-contrib

    # Set up workspace structure
    WORKDIR /webhook-server
    RUN mkdir -p \
        /webhook-server/logs \
        /webhook-server/configs \
        /webhook-server/tmp \
        /webhook-server/scripts \
        /webhook-server/fluent-bit \
        /webhook-server/otel \
        /tmp/fluent-bit-buffer

    # Create .workspace-packages directory structure for monorepo support
    RUN mkdir -p /webhook-server/.workspace-packages

    # Build args for configuration
    ARG BUILD_TIMESTAMP
    ARG MACHINE_ID=webhook-local
    ARG ENV_FILE=.env.local-dev

    # Convert build args to environment variables
    ENV BUILD_TIMESTAMP=${BUILD_TIMESTAMP}
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

    # Copy entrypoint script
    COPY entrypoint-webhook.sh ./entrypoint-webhook.sh
    RUN chmod +x ./entrypoint-webhook.sh

    # Set environment
    ENV NODE_ENV=production \
        LOG_LEVEL=info \
        PATH="/webhook-server/node_modules/.bin:${PATH}"

    # Expose webhook service port
    EXPOSE 3332

    # Health check
    HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
      CMD curl -f http://localhost:3332/health || exit 1

    # Use entrypoint script
    ENTRYPOINT ["./entrypoint-webhook.sh"]