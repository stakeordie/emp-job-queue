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

    # Install minimal system dependencies
    RUN apt-get update && \
        DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        git-lfs openssh-client zstd ca-certificates \
        python3-pip python3-dev gettext-base && \
        apt-get clean && \
        rm -rf /var/lib/apt/lists/*

    # Install Fluent Bit for structured logging (exactly like minimal-base)
    RUN FLUENT_BIT_VERSION="3.1.8" && \
        curl -fsSL "https://packages.fluentbit.io/fluentbit.key" | apt-key add - && \
        echo "deb https://packages.fluentbit.io/ubuntu/jammy jammy main" | tee /etc/apt/sources.list.d/fluent-bit.list && \
        apt-get update && \
        apt-get install -y fluent-bit=${FLUENT_BIT_VERSION}* && \
        apt-get clean && \
        rm -rf /var/lib/apt/lists/*

    # Install OpenTelemetry Collector (lightweight)
    RUN OTEL_VERSION="0.114.0" && \
        curl -fsSL "https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v${OTEL_VERSION}/otelcol-contrib_${OTEL_VERSION}_linux_amd64.tar.gz" | \
        tar -xzC /usr/local/bin/ && \
        chmod +x /usr/local/bin/otelcol-contrib

    # Set up workspace structure
    WORKDIR /api-server
    RUN mkdir -p \
        /api-server/logs \
        /api-server/configs \
        /api-server/tmp \
        /api-server/scripts \
        /api-server/fluent-bit \
        /api-server/otel

    # Copy workspace packages for dependencies
    COPY .workspace-packages/ ./.workspace-packages/

    # Copy package files (dependencies will be installed at runtime)
    COPY package.docker.json ./package.json
    COPY pnpm-lock.yaml ./

    # Copy application source
    COPY src/ ./src/
    COPY dist/ ./dist/

    # Copy configuration templates
    COPY otel-collector-api.yaml.template ./otel/otel-collector-api.yaml.template
    COPY fluent-bit-api.conf.template ./fluent-bit/fluent-bit-api.conf.template

    # Copy entrypoint script
    COPY entrypoint-api.sh ./entrypoint-api.sh
    RUN chmod +x ./entrypoint-api.sh

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
    EXPOSE 3001

    # Health check
    HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
      CMD curl -f http://localhost:3001/health || exit 1

    # Use entrypoint script
    ENTRYPOINT ["./entrypoint-api.sh"]