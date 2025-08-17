#!/bin/bash
set -euo pipefail

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
    
    # Set default environment variables for OTel Collector
    export SERVICE_NAME=${SERVICE_NAME:-emp-api-server}
    export SERVICE_VERSION=${SERVICE_VERSION:-1.0.0}
    export NODE_ENV=${NODE_ENV:-production}
    export DASH0_API_KEY=${DASH0_API_KEY:-auth_w8VowQspnZ8whZHWp1pe6azIIehBAAvL}
    export DASH0_DATASET=${DASH0_DATASET:-${NODE_ENV}}
    
    log_info "Generating OTel Collector configuration at runtime..."
    log_info "  - Service: ${SERVICE_NAME} v${SERVICE_VERSION}"
    log_info "  - Environment: ${NODE_ENV}"
    log_info "  - Dash0 Dataset: ${DASH0_DATASET}"
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
    
    # Set default environment variables for Fluent Bit
    export SERVICE_NAME=${SERVICE_NAME:-emp-api-server}
    export SERVICE_VERSION=${SERVICE_VERSION:-1.0.0}
    export NODE_ENV=${NODE_ENV:-production}
    export FLUENTD_HOST=${FLUENTD_HOST:-host.docker.internal}
    export FLUENTD_PORT=${FLUENTD_PORT:-8888}
    
    # Convert true/false to on/off for Fluent Bit (with default)
    if [ "${FLUENTD_SECURE:-false}" = "true" ]; then
        export FLUENTD_SECURE="on"
    else
        export FLUENTD_SECURE="off"
    fi
    
    log_info "Generating Fluent Bit configuration at runtime..."
    log_info "  - Service: ${SERVICE_NAME} v${SERVICE_VERSION}"
    log_info "  - Environment: ${NODE_ENV}"
    log_info "  - Fluentd Host: ${FLUENTD_HOST}:${FLUENTD_PORT}"
    log_info "  - Secure Connection: ${FLUENTD_SECURE}"
    log_info "  - Template: /api-server/fluent-bit/fluent-bit-api.conf.template"
    log_info "  - Config: /api-server/fluent-bit/fluent-bit-api.conf"
    
    # Generate Fluent Bit config from template at runtime (keeps credentials secure)
    if [ -f "/api-server/fluent-bit/fluent-bit-api.conf.template" ]; then
        envsubst < /api-server/fluent-bit/fluent-bit-api.conf.template > /api-server/fluent-bit/fluent-bit-api.conf
        log_info "✅ Fluent Bit configuration generated successfully"
    else
        log_error "❌ Fluent Bit template not found"
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
# Send Direct Fluentd Test Log
# =====================================================
send_direct_fluentd_log() {
    log_section "Sending Direct Fluentd Test Log"
    
    local FLUENTD_HOST=${FLUENTD_HOST:-host.docker.internal}
    local FLUENTD_PORT=${FLUENTD_PORT:-8888}
    
    log_info "Sending test log directly to Fluentd at ${FLUENTD_HOST}:${FLUENTD_PORT}"
    
    # Create the JSON payload
    local json_payload="{
        \"service\": \"api\",
        \"message\": \"direct log from api\",
        \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
        \"machine_id\": \"${MACHINE_ID:-api-server}\",
        \"service_name\": \"${SERVICE_NAME:-emp-api-server}\",
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
# Main Function
# =====================================================
main() {
    log_section "EMP API Server - Starting Up"
    
    # Send direct Fluentd test log first thing
    send_direct_fluentd_log
    
    # Install dependencies
    install_dependencies || exit 1
    
    # Start telemetry services (background)
    start_otel_collector || log_warn "OTel Collector failed to start but continuing..."
    start_fluent_bit || log_warn "Fluent Bit failed to start but continuing..."
    
    # Start the API server (foreground)
    start_application
}

# Run main function
main "$@"