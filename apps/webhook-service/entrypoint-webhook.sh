#!/bin/bash
set -euo pipefail

# =====================================================
# Webhook Service Entrypoint
# =====================================================
# Purpose: Start webhook service with local logging only
# Fluent Bit removed - using direct logging approach
# =====================================================

# Set service directory for telemetry functions
export SERVICE_DIR="/webhook-server"

# Load reusable telemetry functions
source "${SERVICE_DIR}/scripts/telemetry-entrypoint-functions.sh"

# =====================================================
# Environment Setup
# =====================================================
log_section "Webhook Service Starting"

log_info "Entrypoint script version: 1.0.0-webhook (Fluent Bit removed)"
log_info "Date: $(date)"
log_info "Build timestamp: ${BUILD_TIMESTAMP:-unknown}"

# Set defaults
export NODE_ENV=${NODE_ENV:-development}
export LOG_LEVEL=${LOG_LEVEL:-info}
export WEBHOOK_PORT=${WEBHOOK_PORT:-3332}
export MACHINE_ID=${MACHINE_ID:-webhook-local}
export HOSTNAME=$(hostname)

# Service defaults
export SERVICE_NAME=${SERVICE_NAME:-webhook-service}
export SERVICE_VERSION=${SERVICE_VERSION:-1.0.0}

log_info "Environment Configuration:"
log_info "  - NODE_ENV: $NODE_ENV"
log_info "  - LOG_LEVEL: $LOG_LEVEL"
log_info "  - WEBHOOK_PORT: $WEBHOOK_PORT"
log_info "  - MACHINE_ID: $MACHINE_ID"
log_info "  - HUB_REDIS_URL: ${HUB_REDIS_URL:-not set}"

# =====================================================
# Start OTEL Collector (Optional)
# =====================================================
start_otel_collector() {
    if [ "${OTEL_ENABLED:-false}" = "true" ]; then
        log_section "Starting OpenTelemetry Collector"

        # Environment variables will be validated by Node.js telemetry client

        log_info "Generating OTel Collector configuration at runtime..."
        log_info "  - Service: ${SERVICE_NAME} v${SERVICE_VERSION}"
        log_info "  - Environment: ${TELEMETRY_ENV:-development}"
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
    else
        log_info "OTEL Collector disabled - using local logging only"
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

    # Stop OTEL Collector
    if [ -n "${OTEL_COLLECTOR_PID:-}" ] && kill -0 $OTEL_COLLECTOR_PID 2>/dev/null; then
        log_info "Stopping OTEL Collector..."
        kill -TERM $OTEL_COLLECTOR_PID 2>/dev/null || true
        wait $OTEL_COLLECTOR_PID 2>/dev/null || true
    fi

    log_info "Cleanup complete (local logging only)"
    exit 0
}

# Cleanup and signal handlers from telemetry-entrypoint-functions.sh
setup_signal_handlers

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
    log_info "  - Logging: Local file logging only (Fluent Bit removed)"

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

    # Prepare local logging directories
    prepare_telemetry || exit 1

    # Start optional OTEL collector
    start_otel_collector || log_warn "OTEL Collector startup had issues, continuing with local logging only..."

    # Enhanced TelemetryClient will handle local logging during Node.js startup
    log_info "🔧 TelemetryClient will use direct local logging (no external services)"
    log_info "🔧 Fluent Bit and external log forwarding removed"

    # Start the webhook service (foreground)
    start_application
}

# Run main function with all arguments
main "$@"