#!/bin/bash
set -euo pipefail

# =====================================================
# Webhook Service Entrypoint
# =====================================================
# Purpose: Start webhook service with integrated telemetry stack
# =====================================================

# Set service directory for telemetry functions
export SERVICE_DIR="/webhook-server"

# Load reusable telemetry functions
source "${SERVICE_DIR}/scripts/telemetry-entrypoint-functions.sh"

# Dependencies handled by telemetry-entrypoint-functions.sh

# =====================================================
# Environment Setup
# =====================================================
log_section "Webhook Service Starting"

log_info "Entrypoint script version: 1.0.0-webhook"
log_info "Date: $(date)"
log_info "Build timestamp: ${BUILD_TIMESTAMP:-unknown}"

# Set defaults
export NODE_ENV=${NODE_ENV:-development}
export LOG_LEVEL=${LOG_LEVEL:-info}
export WEBHOOK_PORT=${WEBHOOK_PORT:-3332}
export MACHINE_ID=${MACHINE_ID:-webhook-local}
export HOSTNAME=$(hostname)

# Fluent Bit defaults
export SERVICE_NAME=${SERVICE_NAME:-webhook-service}
export SERVICE_VERSION=${SERVICE_VERSION:-1.0.0}
export FLUENTD_HOST=${FLUENTD_HOST:-localhost}
export FLUENTD_PORT=${FLUENTD_PORT:-24224}
export FLUENTD_SECURE=${FLUENTD_SECURE:-off}

# OTEL defaults
export DASH0_API_KEY=${DASH0_API_KEY:-}
export DASH0_DATASET=${DASH0_DATASET:-webhook-local}

log_info "Environment Configuration:"
log_info "  - NODE_ENV: $NODE_ENV"
log_info "  - LOG_LEVEL: $LOG_LEVEL"
log_info "  - WEBHOOK_PORT: $WEBHOOK_PORT"
log_info "  - MACHINE_ID: $MACHINE_ID"
log_info "  - HUB_REDIS_URL: ${HUB_REDIS_URL:-not set}"

# =====================================================
# Configure Fluent Bit using TelemetryClient
# =====================================================
configure_fluent_bit() {
    log_section "Configuring Fluent Bit"
    
    # TelemetryClient will generate configuration at /tmp/telemetry/fluent-bit.conf
    if [ -f "/tmp/telemetry/fluent-bit.conf" ]; then
        log_info "Using TelemetryClient-generated Fluent Bit configuration..."
        
        # Create fluent-bit directory if it doesn't exist
        mkdir -p /webhook-server/fluent-bit
        
        # Copy TelemetryClient config to expected location
        cp /tmp/telemetry/fluent-bit.conf /webhook-server/fluent-bit/fluent-bit-webhook.conf
        
        log_info "✅ Fluent Bit configuration copied from TelemetryClient"
        log_info "📁 Config path: /webhook-server/fluent-bit/fluent-bit-webhook.conf"
        
        # Show first few lines for verification
        log_info "📋 Configuration preview:"
        head -10 /webhook-server/fluent-bit/fluent-bit-webhook.conf | while read line; do
            log_info "    $line"
        done
    else
        log_warn "⚠️  TelemetryClient Fluent Bit configuration not found at /tmp/telemetry/fluent-bit.conf"
        log_warn "⚠️  Node.js service should generate this during startup"
    fi
}

# =====================================================
# Configure OTEL Collector using TelemetryClient
# =====================================================
configure_otel() {
    log_section "Configuring OpenTelemetry Collector"
    
    # TelemetryClient will generate configuration at /tmp/telemetry/otel-collector.yaml
    if [ -f "/tmp/telemetry/otel-collector.yaml" ]; then
        log_info "Using TelemetryClient-generated OTEL Collector configuration..."
        
        # Create otel directory if it doesn't exist
        mkdir -p /webhook-server/otel
        
        # Copy TelemetryClient config to expected location
        cp /tmp/telemetry/otel-collector.yaml /webhook-server/otel/otel-collector-webhook.yaml
        
        log_info "✅ OTEL Collector configuration copied from TelemetryClient"
        log_info "📁 Config path: /webhook-server/otel/otel-collector-webhook.yaml"
        
        # Show first few lines for verification
        log_info "📋 Configuration preview:"
        head -10 /webhook-server/otel/otel-collector-webhook.yaml | while read line; do
            log_info "    $line"
        done
    else
        log_warn "⚠️  TelemetryClient OTEL Collector configuration not found at /tmp/telemetry/otel-collector.yaml"
        log_warn "⚠️  Node.js service should generate this during startup"
    fi
}

# =====================================================
# Configure nginx using TelemetryClient
# =====================================================
configure_nginx() {
    log_section "Configuring nginx proxy"
    
    # TelemetryClient will generate configuration at /tmp/telemetry/nginx.conf
    if [ -f "/tmp/telemetry/nginx.conf" ]; then
        log_info "Using TelemetryClient-generated nginx configuration..."
        
        # Create nginx directory if it doesn't exist
        mkdir -p /webhook-server/nginx
        
        # Copy TelemetryClient config to expected location
        cp /tmp/telemetry/nginx.conf /webhook-server/nginx/nginx.conf
        
        log_info "✅ nginx configuration copied from TelemetryClient"
        log_info "📁 Config path: /webhook-server/nginx/nginx.conf"
        
        # Show first few lines for verification
        log_info "📋 Configuration preview:"
        head -15 /webhook-server/nginx/nginx.conf | while read line; do
            log_info "    $line"
        done
    else
        log_warn "⚠️  TelemetryClient nginx configuration not found at /tmp/telemetry/nginx.conf"
        log_warn "⚠️  Node.js service should generate this during startup"
    fi
}

# =====================================================
# Start Fluent Bit
# =====================================================
start_fluent_bit() {
    if [ "${FLUENT_BIT_ENABLED:-true}" = "true" ] && [ -f "/webhook-server/fluent-bit/fluent-bit-webhook.conf" ]; then
        log_section "Starting Fluent Bit"
        
        # Start Fluent Bit in background with proper log redirection
        /opt/fluent-bit/bin/fluent-bit \
            -c /webhook-server/fluent-bit/fluent-bit-webhook.conf \
            > /webhook-server/logs/fluent-bit.log 2>&1 &
        
        FLUENT_BIT_PID=$!
        log_info "✅ Fluent Bit started (PID: $FLUENT_BIT_PID)"
        
        # Give it a moment to start
        sleep 2
        
        # Check if it's still running
        if ! kill -0 $FLUENT_BIT_PID 2>/dev/null; then
            log_error "❌ Fluent Bit failed to start"
            cat /webhook-server/logs/fluent-bit.log
        fi
    else
        log_info "Fluent Bit is disabled or configuration not found"
    fi
}

# =====================================================
# Start OTEL Collector
# =====================================================
start_otel_collector() {
    log_section "Starting OpenTelemetry Collector"
    
    # Environment variables will be validated by Node.js telemetry client
    
    log_info "Generating OTel Collector configuration at runtime..."
    log_info "  - Service: ${SERVICE_NAME} v${SERVICE_VERSION}"
    log_info "  - Environment: ${TELEMETRY_ENV}"
    log_info "  - Template: /webhook-server/otel/otel-collector-webhook.yaml.template"
    log_info "  - Config: /webhook-server/otel/otel-collector-webhook.yaml"
    
    # Create otel directory
    mkdir -p /webhook-server/otel
    
    # Generate OTel Collector config from template at runtime
    if [ -f "/webhook-server/otel/otel-collector-webhook.yaml.template" ]; then
        envsubst < /webhook-server/otel/otel-collector-webhook.yaml.template > /webhook-server/otel/otel-collector-webhook.yaml
        log_info "✅ OTel Collector configuration generated successfully"
    else
        log_error "❌ OTel Collector template not found"
        return 1
    fi
    
    # Start OTel Collector in background with logs to file
    otelcol-contrib --config=/webhook-server/otel/otel-collector-webhook.yaml \
        > /webhook-server/logs/otel-collector.log 2>&1 &
    OTEL_COLLECTOR_PID=$!
    
    log_info "✅ OTel Collector started (PID: $OTEL_COLLECTOR_PID)"
    log_info "📁 OTel Collector logs: /webhook-server/logs/otel-collector.log"
    
    # Give it a moment to start
    sleep 2
    
    # Check if it's still running
    if kill -0 $OTEL_COLLECTOR_PID 2>/dev/null; then
        log_info "✅ OTel Collector is running successfully"
        # Test collector health
        if curl -f http://localhost:13133 >/dev/null 2>&1; then
            log_info "✅ OTel Collector health check passed"
        else
            log_warn "⚠️  OTel Collector health check failed, but continuing..."
        fi
    else
        log_error "❌ OTel Collector failed to start"
        return 1
    fi
}

# =====================================================
# Cleanup function
# =====================================================
cleanup() {
    log_warn "Received shutdown signal, cleaning up..."
    
    # Stop Node.js service first
    if [ -n "${NODE_PID:-}" ] && kill -0 $NODE_PID 2>/dev/null; then
        log_info "Stopping webhook service..."
        kill -TERM $NODE_PID 2>/dev/null || true
        wait $NODE_PID 2>/dev/null || true
    fi
    
    # Stop nginx
    if [ -n "${NGINX_PID:-}" ] && kill -0 $NGINX_PID 2>/dev/null; then
        log_info "Stopping nginx..."
        kill -TERM $NGINX_PID 2>/dev/null || true
        wait $NGINX_PID 2>/dev/null || true
    fi
    
    # Stop Fluent Bit
    if [ -n "${FLUENT_BIT_PID:-}" ] && kill -0 $FLUENT_BIT_PID 2>/dev/null; then
        log_info "Stopping Fluent Bit..."
        kill -TERM $FLUENT_BIT_PID 2>/dev/null || true
        wait $FLUENT_BIT_PID 2>/dev/null || true
    fi
    
    # Stop OTEL Collector
    if [ -n "${OTEL_PID:-}" ] && kill -0 $OTEL_PID 2>/dev/null; then
        log_info "Stopping OTEL Collector..."
        kill -TERM $OTEL_PID 2>/dev/null || true
        wait $OTEL_PID 2>/dev/null || true
    fi
    
    log_info "Cleanup complete"
    exit 0
}

# Cleanup and signal handlers from telemetry-entrypoint-functions.sh
setup_signal_handlers

# =====================================================
# Start nginx proxy
# =====================================================
start_nginx() {
    if [ "${NGINX_ENABLED:-true}" = "true" ] && [ -f "/webhook-server/nginx/nginx.conf" ]; then
        log_section "Starting nginx proxy"
        
        # Start nginx in background with TelemetryClient configuration
        nginx -c /webhook-server/nginx/nginx.conf -g "daemon off;" \
            > /webhook-server/logs/nginx.log 2>&1 &
        
        NGINX_PID=$!
        log_info "✅ nginx started (PID: $NGINX_PID)"
        log_info "📋 nginx routing localhost:24224 → production Fluentd"
        
        # Give it a moment to start
        sleep 2
        
        # Check if it's still running
        if ! kill -0 $NGINX_PID 2>/dev/null; then
            log_error "❌ nginx failed to start"
            cat /webhook-server/logs/nginx.log
        fi
    else
        log_info "nginx is disabled or configuration not found"
    fi
}

# =====================================================
# Start Application
# =====================================================
start_application() {
    log_section "Starting Webhook Service"
    
    cd /webhook-server
    
    log_info "Starting EMP Webhook Service..."
    log_info "  - Working Directory: $(pwd)"
    log_info "  - Node Environment: ${NODE_ENV}"
    log_info "  - Service: ${SERVICE_NAME} v${SERVICE_VERSION}"
    
    # Start the webhook service (this will run in foreground)
    exec node dist/index.js
}

# =====================================================
# Main execution
# =====================================================
main() {
    log_section "Initializing Webhook Service"
    
    # Install dependencies only
    install_dependencies || exit 1
    
    # Enhanced TelemetryClient will handle ALL telemetry processes during Node.js startup:
    # - nginx proxy for Forward protocol
    # - OTEL Collector process
    # - Fluent Bit process
    log_info "🔧 Enhanced TelemetryClient will start ALL telemetry processes during Node.js startup"
    log_info "🔧 This includes: nginx proxy + OTEL Collector + Fluent Bit"
    
    # Start the webhook service (foreground)
    start_application
}

# Run main function with all arguments
main "$@"