# Telemetry Collector - Lightweight Redis Stream Consumer
FROM ubuntu:22.04

    # Layer cache bust
    ARG CACHE_BUST=1
    RUN echo "Telemetry Collector cache bust: ${CACHE_BUST}"

    # Install Node.js 18 and essential system packages (matching webhook pattern)
    RUN apt-get clean && \
        rm -rf /var/lib/apt/lists/* && \
        apt-get update --allow-releaseinfo-change && \
        apt-get install -y ca-certificates gnupg curl git wget jq tar nano net-tools lsof && \
        curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
        apt-get install -y nodejs && \
        npm install -g pnpm && \
        apt-get clean && \
        rm -rf /var/lib/apt/lists/*

    # Install OpenTelemetry Collector binary
    RUN wget https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v0.91.0/otelcol-contrib_0.91.0_linux_amd64.tar.gz && \
        tar -xzf otelcol-contrib_0.91.0_linux_amd64.tar.gz && \
        mv otelcol-contrib /usr/local/bin/ && \
        rm otelcol-contrib_0.91.0_linux_amd64.tar.gz

    # Set up workspace structure
    WORKDIR /telemetry-collector

    # Create .workspace-packages directory structure for monorepo support
    RUN mkdir -p /telemetry-collector/.workspace-packages

    # Build args for configuration
    ARG BUILD_DATE
    ARG MACHINE_ID=telemetry-collector-local

    # Convert build args to environment variables
    ENV BUILD_DATE=${BUILD_DATE}
    ENV MACHINE_ID=${MACHINE_ID}

    # Copy workspace packages for dependencies (cached for install, fresh copy later)
    COPY .workspace-packages/ /telemetry-collector/.workspace-packages/

    # Copy package files and install dependencies during build (matching machine pattern)
    COPY package.docker.json /telemetry-collector/package.json
    COPY pnpm-lock.yaml* /telemetry-collector/

    # Install dependencies during Docker build (not at runtime)
    RUN pnpm install --prod --no-frozen-lockfile --ignore-workspace

    # Copy workspace packages again (always fresh - no caching)
    RUN date
    COPY .workspace-packages/ /telemetry-collector/.workspace-packages/

    # Copy application source
    COPY dist/ /telemetry-collector/dist/
    COPY src/ /telemetry-collector/src/
    COPY otel-config.yaml /telemetry-collector/otel-config.yaml
    COPY start-telemetry.sh /telemetry-collector/start-telemetry.sh
    RUN chmod +x /telemetry-collector/start-telemetry.sh

    # Set environment
    ENV NODE_ENV=production \
        LOG_LEVEL=info \
        LOG_DIR=/telemetry-collector/logs \
        PATH="/telemetry-collector/node_modules/.bin:${PATH}"

    # Expose health check port
    EXPOSE 9090

    # Health check
    HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
        CMD curl -f http://localhost:9090/health || exit 1

    # Start both OTEL Collector and Bridge
    CMD ["./start-telemetry.sh"]