#!/bin/bash
set -euo pipefail

# =====================================================
# Webhook Service Entrypoint - Based on API pattern
# =====================================================

# Color codes for better logging
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_section() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

# =====================================================
# Dependency Installation
# =====================================================
install_dependencies() {
    log_section "Installing Node.js Dependencies"
    
    cd /webhook-server
    
    if [ -f "package.json" ] && [ -f "pnpm-lock.yaml" ]; then
        log_info "Installing production dependencies..."
        pnpm install --prod --no-frozen-lockfile --ignore-workspace
        log_info "✅ Dependencies installed successfully"
    else
        log_warn "⚠️  No package.json or pnpm-lock.yaml found, skipping dependency installation"
    fi
}

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
# Configure Fluent Bit
# =====================================================
configure_fluent_bit() {
    log_section "Configuring Fluent Bit"
    
    if [ -f "/webhook-server/fluent-bit/fluent-bit-webhook.conf.template" ]; then
        log_info "Processing Fluent Bit configuration template..."
        
        # Use envsubst to replace environment variables
        envsubst < /webhook-server/fluent-bit/fluent-bit-webhook.conf.template > /webhook-server/fluent-bit/fluent-bit-webhook.conf
        
        log_info "✅ Fluent Bit configuration generated"
    else
        log_warn "⚠️  Fluent Bit configuration template not found"
    fi
}

# =====================================================
# Configure OTEL Collector
# =====================================================
configure_otel() {
    log_section "Configuring OpenTelemetry Collector"
    
    if [ -f "/webhook-server/otel/otel-collector-webhook.yaml.template" ]; then
        log_info "Processing OTEL Collector configuration template..."
        
        # Use envsubst to replace environment variables
        envsubst < /webhook-server/otel/otel-collector-webhook.yaml.template > /webhook-server/otel/otel-collector-webhook.yaml
        
        log_info "✅ OTEL Collector configuration generated"
    else
        log_warn "⚠️  OTEL Collector configuration template not found"
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
    if [ "${OTEL_ENABLED:-true}" = "true" ] && [ -f "/webhook-server/otel/otel-collector-webhook.yaml" ]; then
        log_section "Starting OpenTelemetry Collector"
        
        # Start OTEL Collector in background with proper log redirection
        /usr/local/bin/otelcol-contrib \
            --config=/webhook-server/otel/otel-collector-webhook.yaml \
            > /webhook-server/logs/otel-collector.log 2>&1 &
        
        OTEL_PID=$!
        log_info "✅ OTEL Collector started (PID: $OTEL_PID)"
        
        # Give it a moment to start
        sleep 3
        
        # Check if it's still running
        if ! kill -0 $OTEL_PID 2>/dev/null; then
            log_error "❌ OTEL Collector failed to start"
            tail -n 50 /webhook-server/logs/otel-collector.log
        fi
    else
        log_info "OTEL Collector is disabled or configuration not found"
    fi
}

# =====================================================
# Cleanup function
# =====================================================
cleanup() {
    log_warn "Received shutdown signal, cleaning up..."
    
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

# Set up signal handlers
trap cleanup SIGTERM SIGINT

# =====================================================
# Send Direct Fluentd Test Log
# =====================================================
send_direct_fluentd_log() {
    log_section "Sending Direct Fluentd Test Log"
    
    local FLUENTD_HOST=${FLUENTD_HOST:-host.docker.internal}
    local FLUENTD_PORT=${FLUENTD_PORT:-8888}
    
    log_info "Sending test log directly to Fluentd at ${FLUENTD_HOST}:${FLUENTD_PORT}"
    
    # Create the JSON payload
    local json_payload="{
        \"service\": \"webhook\",
        \"message\": \"direct log from webhook\",
        \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
        \"machine_id\": \"${MACHINE_ID:-webhook-server}\",
        \"service_name\": \"${SERVICE_NAME:-emp-webhook-service}\",
        \"environment\": \"${NODE_ENV:-production}\",
        \"event_type\": \"container_startup_test\"
    }"
    
    log_info "📋 Fluentd payload: $json_payload"
    log_info "📋 Fluentd URL: http://${FLUENTD_HOST}:${FLUENTD_PORT}/test"
    
    # Send a direct log message to Fluentd via HTTP
    local response=$(curl -X POST "http://${FLUENTD_HOST}:${FLUENTD_PORT}/test" \
        -H "Content-Type: application/json" \
        -d "$json_payload" \
        -w "HTTP_CODE:%{http_code}" \
        -s 2>&1)
    
    log_info "📋 Fluentd response: $response"
    
    if [[ "$response" == *"HTTP_CODE:200"* ]]; then
        log_info "✅ Fluentd log sent successfully"
    else
        log_warn "⚠️ Fluentd response indicates potential issue: $response"
    fi
    
    log_info "✅ Direct Fluentd test log sent"
}

# =====================================================
# Main execution
# =====================================================
main() {
    log_section "Initializing Webhook Service"
    
    # Send direct Fluentd test log first thing
    send_direct_fluentd_log
    
    # Install dependencies first
    install_dependencies
    
    # Create necessary directories
    mkdir -p /webhook-server/logs
    
    # Configure services
    configure_fluent_bit
    configure_otel
    
    # Start observability services
    start_fluent_bit
    start_otel_collector
    
    # Give services time to initialize
    sleep 2
    
    log_section "Starting Webhook Service"
    log_info "Starting EMP Webhook Service..."
    log_info "  - Working Directory: $(pwd)"
    log_info "  - Node Environment: ${NODE_ENV}"
    log_info "  - Service: ${SERVICE_NAME} v${SERVICE_VERSION}"
    
    # Start the webhook service (this will run in foreground)
    exec node dist/index.js
}

# Run main function with all arguments
main "$@"