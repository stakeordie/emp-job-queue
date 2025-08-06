# Fluentd Log Aggregation Service
# Receives logs from Fluent Bit instances and forwards to Dash0

FROM fluent/fluentd:v1.16-debian

# Switch to root to install packages
USER root

# Install additional gems
RUN gem install fluent-plugin-redis \
                fluent-plugin-elasticsearch \
                fluent-plugin-prometheus \
                fluent-plugin-multi-format-parser \
                fluent-plugin-rewrite-tag-filter \
                fluent-plugin-record-modifier

# Create directories
RUN mkdir -p /fluentd/etc /fluentd/plugins

# Copy configuration
COPY fluentd.conf /fluentd/etc/fluent.conf
COPY plugins/ /fluentd/plugins/

# Switch back to fluent user
USER fluent

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:24220/api/plugins.json || exit 1

# Expose ports
# 24224: Fluent forward protocol (TCP)
# 24225: Fluent forward protocol with TLS (TCP) 
# 24220: HTTP monitoring interface
# 9880: Prometheus metrics
EXPOSE 24224 24225 24220 9880

# Start Fluentd
CMD ["fluentd", "-c", "/fluentd/etc/fluent.conf", "-v"]