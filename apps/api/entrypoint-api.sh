#!/bin/bash
set -eo pipefail

# =====================================================
# EMP API Server Entrypoint - Following Machine Pattern
# =====================================================
# Purpose: Start API server with integrated OTel and Fluent Bit
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
    
    cd /api-server
    
    if [ -f "package.json" ] && [ -f "pnpm-lock.yaml" ]; then
        log_info "Installing production dependencies (including workspace packages)..."
        # Remove --ignore-workspace to allow @emp/telemetry and @emp/core workspace dependencies
        pnpm install --prod --no-frozen-lockfile
        log_info "✅ Dependencies installed successfully"
    else
        log_warn "⚠️  No package.json or pnpm-lock.yaml found, skipping dependency installation"
    fi
}

# =====================================================
# Start OpenTelemetry Collector (Background Process)
# =====================================================
start_otel_collector() {
    log_section "Starting OpenTelemetry Collector"
    
    # Environment variables will be validated by Node.js telemetry client
    
    log_info "Generating OTel Collector configuration at runtime..."
    log_info "  - Service: ${SERVICE_NAME} v${SERVICE_VERSION}"
    log_info "  - Environment: ${TELEMETRY_ENV}"
    log_info "  - Template: /api-server/otel/otel-collector-api.yaml.template"
    log_info "  - Config: /api-server/otel/otel-collector-api.yaml"
    
    # Create otel directory
    mkdir -p /api-server/otel
    
    # Generate OTel Collector config from template at runtime
    if [ -f "/api-server/otel/otel-collector-api.yaml.template" ]; then
        envsubst < /api-server/otel/otel-collector-api.yaml.template > /api-server/otel/otel-collector-api.yaml
        log_info "✅ OTel Collector configuration generated successfully"
    else
        log_error "❌ OTel Collector template not found"
        return 1
    fi
    
    # Start OTel Collector in background with logs to file
    otelcol-contrib --config=/api-server/otel/otel-collector-api.yaml \
        > /api-server/logs/otel-collector.log 2>&1 &
    OTEL_COLLECTOR_PID=$!
    
    log_info "✅ OTel Collector started (PID: $OTEL_COLLECTOR_PID)"
    log_info "📁 OTel Collector logs: /api-server/logs/otel-collector.log"
    
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
# Start Fluent Bit (Background Process)
# =====================================================
start_fluent_bit() {
    log_section "Starting Fluent Bit Logger"
    
    # Environment variables will be validated by Node.js telemetry client
    
    # Convert true/false to on/off for Fluent Bit (with default)
    if [ "${FLUENTD_SECURE:-false}" = "true" ]; then
        export FLUENTD_SECURE="on"
    else
        export FLUENTD_SECURE="off"
    fi
    
    log_info "Generating Fluent Bit configuration at runtime..."
    log_info "  - Service: ${SERVICE_NAME} v${SERVICE_VERSION}"
    log_info "  - Environment: ${TELEMETRY_ENV}"
    log_info "  - Fluentd Host: ${FLUENTD_HOST}:${FLUENTD_PORT}"
    log_info "  - Secure Connection: ${FLUENTD_SECURE}"
    log_info "  - Template: /api-server/fluent-bit-api-forward.conf.template (Forward Protocol)"
    log_info "  - Config: /api-server/fluent-bit/fluent-bit-api.conf"
    
    # Generate Fluent Bit config from template at runtime (keeps credentials secure)
    # Try Forward protocol template first (more reliable), fallback to HTTP
    if [ -f "/api-server/fluent-bit-api-forward.conf.template" ]; then
        envsubst < /api-server/fluent-bit-api-forward.conf.template > /api-server/fluent-bit/fluent-bit-api.conf
        log_info "✅ Fluent Bit configuration generated successfully (Forward Protocol)"
        log_info "📁 Fluent Bit will monitor: /api-server/logs/*.log files"
        log_info "🔍 Expected connection: Forward protocol to port 24224"
    elif [ -f "/api-server/fluent-bit-api.conf.template" ]; then
        envsubst < /api-server/fluent-bit-api.conf.template > /api-server/fluent-bit/fluent-bit-api.conf
        log_info "✅ Fluent Bit configuration generated successfully (HTTP fallback)"
        log_info "📁 Fluent Bit will monitor: /api-server/logs/*.log files"
        log_info "🔍 Expected connection: HTTP protocol to port ${FLUENTD_PORT}"
    else
        log_error "❌ No Fluent Bit template found"
        return 1
    fi
    
    # Start Fluent Bit in background with logs to file
    /opt/fluent-bit/bin/fluent-bit -c /api-server/fluent-bit/fluent-bit-api.conf \
        > /api-server/logs/fluent-bit.log 2>&1 &
    FLUENT_BIT_PID=$!
    
    log_info "✅ Fluent Bit started (PID: $FLUENT_BIT_PID)"
    log_info "📁 Fluent Bit logs: /api-server/logs/fluent-bit.log"
    
    # Give it a moment to start
    sleep 2
    
    # Check if it's still running
    if kill -0 $FLUENT_BIT_PID 2>/dev/null; then
        log_info "✅ Fluent Bit is running successfully"
    
    # Show which files Fluent Bit is monitoring
    log_info "📋 Fluent Bit monitoring status:"
    log_info "  - Watching directory: /api-server/logs/*.log"
    log_info "  - Current files in directory:"
    ls -la /api-server/logs/ 2>/dev/null | while read line; do
        log_info "    $line"
    done || log_info "    (directory will be created by Node.js)"
    else
        log_error "❌ Fluent Bit failed to start"
        return 1
    fi
}

# =====================================================
# Start Application
# =====================================================
start_application() {
    log_section "Starting API Server"
    
    cd /api-server
    
    log_info "Starting EMP API Server..."
    log_info "  - Working Directory: $(pwd)"
    log_info "  - Node Environment: ${NODE_ENV}"
    log_info "  - Service: ${SERVICE_NAME} v${SERVICE_VERSION}"
    
    # Start the API server (this will run in foreground)
    exec node dist/src/index.js
}

# =====================================================
# Configure nginx using TelemetryClient
# =====================================================
prepare_nginx() {
    log_section "Preparing nginx for TelemetryClient"
    
    # Create nginx directories for TelemetryClient to use
    mkdir -p /api-server/nginx /var/log/nginx
    
    log_info "✅ nginx directories created"
    log_info "📋 TelemetryClient will configure and start nginx during Node.js startup"
    log_info "📋 nginx will proxy localhost:24224 → production Fluentd"
}

# =====================================================
# Start nginx proxy
# =====================================================
# nginx startup is now handled by TelemetryClient in Node.js


# =====================================================
# Main Function
# =====================================================
main() {
    log_section "EMP API Server - Starting Up"
    
    # Debug environment variables
    log_info "🔍 Environment check:"
    log_info "  - API_BASE_ID: ${API_BASE_ID:-not set}"
    log_info "  - TELEMETRY_ENV: ${TELEMETRY_ENV:-not set}"
    log_info "  - SERVICE_NAME: ${SERVICE_NAME:-not set}"
    log_info "  - MACHINE_ID: ${MACHINE_ID:-not set (will be generated)}"
    
    # Install dependencies only
    install_dependencies || exit 1
    
    # Enhanced TelemetryClient will handle ALL telemetry processes during Node.js startup:
    # - nginx proxy for Forward protocol
    # - OTEL Collector process
    # - Fluent Bit process
    log_info "🔧 Enhanced TelemetryClient will start ALL telemetry processes during Node.js startup"
    log_info "🔧 This includes: nginx proxy + OTEL Collector + Fluent Bit"
    
    # Start the API server (foreground)
    start_application
}

# =====================================================
# Cleanup function
# =====================================================
cleanup() {
    log_warn "Received shutdown signal, cleaning up..."
    
    # Stop Node.js service first
    if [ -n "${NODE_PID:-}" ] && kill -0 $NODE_PID 2>/dev/null; then
        log_info "Stopping API service..."
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
    if [ -n "${OTEL_COLLECTOR_PID:-}" ] && kill -0 $OTEL_COLLECTOR_PID 2>/dev/null; then
        log_info "Stopping OTEL Collector..."
        kill -TERM $OTEL_COLLECTOR_PID 2>/dev/null || true
        wait $OTEL_COLLECTOR_PID 2>/dev/null || true
    fi
    
    log_info "Cleanup complete"
    exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT

# Run main function
main "$@"