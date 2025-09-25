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

    # Create directories for local logging only (Fluent Bit removed)
    mkdir -p "${SERVICE_DIR}/logs" "${SERVICE_DIR}/otel" "${SERVICE_DIR}/tmp"

    log_info "✅ Telemetry directories prepared"
    log_info "📋 TelemetryClient will use direct local logging (no external services)"
    log_info "📋 Expected configs: /tmp/telemetry/{otel-collector.yaml} (optional)"
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
# Fluent Bit removed - using direct logging approach
# =====================================================

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

    # Stop OTEL Collector (optional)
    if [ -n "${OTEL_COLLECTOR_PID:-}" ] && kill -0 $OTEL_COLLECTOR_PID 2>/dev/null; then
        log_info "Stopping OTEL Collector..."
        kill -TERM $OTEL_COLLECTOR_PID 2>/dev/null || true
        wait $OTEL_COLLECTOR_PID 2>/dev/null || true
    fi

    log_info "Telemetry cleanup complete (local logging only)"
    exit 0
}

# =====================================================
# Setup Signal Handlers
# =====================================================
setup_signal_handlers() {
    trap cleanup_telemetry SIGTERM SIGINT
}

log_info "📋 Telemetry entrypoint functions loaded"
log_info "📋 Available functions: prepare_telemetry, start_otel_collector, install_dependencies, cleanup_telemetry, setup_signal_handlers (Fluent Bit removed)"