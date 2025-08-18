#!/bin/bash

# =====================================================
# Telemetry Entrypoint Functions
# =====================================================
# Reusable functions for starting telemetry services
# Used by: API, webhook, and machine entrypoint scripts
# =====================================================

# Color codes for logging (if not already defined)
if [ -z "${RED:-}" ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m'
fi

# Logging functions (if not already defined)
if ! declare -f log_info >/dev/null; then
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
fi

# =====================================================
# Prepare Telemetry Infrastructure
# =====================================================
prepare_telemetry() {
    log_section "Preparing Telemetry Infrastructure"
    
    # Get service directory from environment or use default
    local SERVICE_DIR="${SERVICE_DIR:-/app}"
    
    # Create directories for TelemetryClient to use
    mkdir -p "${SERVICE_DIR}/nginx" "${SERVICE_DIR}/fluent-bit" "${SERVICE_DIR}/otel" "/var/log/nginx"
    
    log_info "✅ Telemetry directories prepared"
    log_info "📋 TelemetryClient will configure and start nginx during Node.js startup"
    log_info "📋 nginx will proxy localhost:24224 → production Fluentd"
    log_info "📋 Expected configs: /tmp/telemetry/{nginx.conf,fluent-bit.conf,otel-collector.yaml}"
}

# =====================================================
# Start OTEL Collector
# =====================================================
start_otel_collector() {
    log_section "Starting OpenTelemetry Collector"
    
    # Get service directory and name from environment
    local SERVICE_DIR="${SERVICE_DIR:-/app}"
    local SERVICE_NAME="${SERVICE_NAME:-emp-service}"
    local SERVICE_VERSION="${SERVICE_VERSION:-1.0.0}"
    local TELEMETRY_ENV="${TELEMETRY_ENV:-development}"
    
    log_info "Generating OTel Collector configuration at runtime..."
    log_info "  - Service: ${SERVICE_NAME} v${SERVICE_VERSION}"
    log_info "  - Environment: ${TELEMETRY_ENV}"
    log_info "  - Template: ${SERVICE_DIR}/otel/otel-collector.yaml.template"
    log_info "  - Config: ${SERVICE_DIR}/otel/otel-collector.yaml"
    
    # Create otel directory
    mkdir -p "${SERVICE_DIR}/otel"
    
    # Generate OTel Collector config from template at runtime
    if [ -f "${SERVICE_DIR}/otel/otel-collector.yaml.template" ]; then
        envsubst < "${SERVICE_DIR}/otel/otel-collector.yaml.template" > "${SERVICE_DIR}/otel/otel-collector.yaml"
        log_info "✅ OTel Collector configuration generated successfully"
    else
        log_error "❌ OTel Collector template not found at ${SERVICE_DIR}/otel/otel-collector.yaml.template"
        return 1
    fi
    
    # Start OTel Collector in background with logs to file
    otelcol-contrib --config="${SERVICE_DIR}/otel/otel-collector.yaml" \
        > "${SERVICE_DIR}/logs/otel-collector.log" 2>&1 &
    OTEL_COLLECTOR_PID=$!
    
    log_info "✅ OTel Collector started (PID: $OTEL_COLLECTOR_PID)"
    log_info "📁 OTel Collector logs: ${SERVICE_DIR}/logs/otel-collector.log"
    
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
# Start Fluent Bit
# =====================================================
start_fluent_bit() {
    log_section "Starting Fluent Bit Logger"
    
    # Get service directory and configuration from environment
    local SERVICE_DIR="${SERVICE_DIR:-/app}"
    local SERVICE_NAME="${SERVICE_NAME:-emp-service}"
    local SERVICE_VERSION="${SERVICE_VERSION:-1.0.0}"
    local TELEMETRY_ENV="${TELEMETRY_ENV:-development}"
    local FLUENTD_HOST="${FLUENTD_HOST:-host.docker.internal}"
    local FLUENTD_PORT="${FLUENTD_PORT:-24224}"
    
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
    log_info "  - Template: ${SERVICE_DIR}/fluent-bit-forward.conf.template (Forward Protocol)"
    log_info "  - Config: ${SERVICE_DIR}/fluent-bit/fluent-bit.conf"
    
    # Generate Fluent Bit config from template at runtime (keeps credentials secure)
    # Try Forward protocol template first (more reliable), fallback to HTTP
    if [ -f "${SERVICE_DIR}/fluent-bit-forward.conf.template" ]; then
        envsubst < "${SERVICE_DIR}/fluent-bit-forward.conf.template" > "${SERVICE_DIR}/fluent-bit/fluent-bit.conf"
        log_info "✅ Fluent Bit configuration generated successfully (Forward Protocol)"
        log_info "📁 Fluent Bit will monitor: ${SERVICE_DIR}/logs/*.log files"
        log_info "🔍 Expected connection: Forward protocol to port 24224"
    elif [ -f "${SERVICE_DIR}/fluent-bit.conf.template" ]; then
        envsubst < "${SERVICE_DIR}/fluent-bit.conf.template" > "${SERVICE_DIR}/fluent-bit/fluent-bit.conf"
        log_info "✅ Fluent Bit configuration generated successfully (HTTP fallback)"
        log_info "📁 Fluent Bit will monitor: ${SERVICE_DIR}/logs/*.log files"
        log_info "🔍 Expected connection: HTTP protocol to port ${FLUENTD_PORT}"
    else
        log_error "❌ No Fluent Bit template found"
        return 1
    fi
    
    # Start Fluent Bit in background with logs to file
    /opt/fluent-bit/bin/fluent-bit -c "${SERVICE_DIR}/fluent-bit/fluent-bit.conf" \
        > "${SERVICE_DIR}/logs/fluent-bit.log" 2>&1 &
    FLUENT_BIT_PID=$!
    
    log_info "✅ Fluent Bit started (PID: $FLUENT_BIT_PID)"
    log_info "📁 Fluent Bit logs: ${SERVICE_DIR}/logs/fluent-bit.log"
    
    # Give it a moment to start
    sleep 2
    
    # Check if it's still running
    if kill -0 $FLUENT_BIT_PID 2>/dev/null; then
        log_info "✅ Fluent Bit is running successfully"
    
        # Show which files Fluent Bit is monitoring
        log_info "📋 Fluent Bit monitoring status:"
        log_info "  - Watching directory: ${SERVICE_DIR}/logs/*.log"
        log_info "  - Current files in directory:"
        ls -la "${SERVICE_DIR}/logs/" 2>/dev/null | while read line; do
            log_info "    $line"
        done || log_info "    (directory will be created by Node.js)"
    else
        log_error "❌ Fluent Bit failed to start"
        return 1
    fi
}

# =====================================================
# Install Dependencies (pnpm)
# =====================================================
install_dependencies() {
    log_section "Installing Node.js Dependencies"
    
    local SERVICE_DIR="${SERVICE_DIR:-/app}"
    cd "${SERVICE_DIR}"
    
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
# Cleanup Function (for signal handlers)
# =====================================================
cleanup_telemetry() {
    log_warn "Received shutdown signal, cleaning up telemetry services..."
    
    # Stop Node.js service first
    if [ -n "${NODE_PID:-}" ] && kill -0 $NODE_PID 2>/dev/null; then
        log_info "Stopping Node.js service..."
        kill -TERM $NODE_PID 2>/dev/null || true
        wait $NODE_PID 2>/dev/null || true
    fi
    
    # Stop nginx (managed by TelemetryClient)
    if pgrep -f "nginx.*daemon off" >/dev/null; then
        log_info "Stopping nginx..."
        pkill -TERM -f "nginx.*daemon off" 2>/dev/null || true
        sleep 2
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
    
    log_info "Telemetry cleanup complete"
    exit 0
}

# =====================================================
# Setup Signal Handlers
# =====================================================
setup_signal_handlers() {
    trap cleanup_telemetry SIGTERM SIGINT
}

log_info "📋 Telemetry entrypoint functions loaded"
log_info "📋 Available functions: prepare_telemetry, start_otel_collector, start_fluent_bit, install_dependencies, cleanup_telemetry, setup_signal_handlers"