# Telemetry Collector - Official OTEL Collector Binary
FROM ubuntu:22.04

# Layer cache bust
ARG CACHE_BUST=1
RUN echo "Telemetry Collector cache bust: ${CACHE_BUST}"

# Install essential system packages
RUN apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    apt-get update --allow-releaseinfo-change && \
    apt-get install -y ca-certificates wget curl tar && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install OpenTelemetry Collector binary
RUN wget https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v0.91.0/otelcol-contrib_0.91.0_linux_amd64.tar.gz && \
    tar -xzf otelcol-contrib_0.91.0_linux_amd64.tar.gz && \
    mv otelcol-contrib /usr/local/bin/ && \
    rm otelcol-contrib_0.91.0_linux_amd64.tar.gz

# Set up workspace
WORKDIR /telemetry-collector

# Build args for configuration
ARG BUILD_DATE
ARG MACHINE_ID=telemetry-collector-local

# Convert build args to environment variables
ENV BUILD_DATE=${BUILD_DATE}
ENV MACHINE_ID=${MACHINE_ID}

# Copy OTEL Collector configuration and startup script
COPY otel-config.yaml /telemetry-collector/otel-config.yaml
COPY start-telemetry.sh /telemetry-collector/start-telemetry.sh
RUN chmod +x /telemetry-collector/start-telemetry.sh

# Set environment
ENV LOG_LEVEL=info

# Expose OTLP ports
EXPOSE 4317 4318 13133

# Health check on OTEL Collector's built-in health endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:13133 || exit 1

# Start OTEL Collector
CMD ["./start-telemetry.sh"]
