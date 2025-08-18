#!/bin/bash
set -euo pipefail

# =====================================================
# EMP API Service Entrypoint - Inherits from Base
# =====================================================
# Purpose: API service entrypoint using inheritance model
# Foundation: Machine service telemetry approach
# =====================================================

# Source the base entrypoint
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../scripts/entrypoint-base-common.sh"

# =====================================================
# API-Specific Environment Setup
# =====================================================
setup_environment() {
    # Call parent implementation first
    base_setup_environment
    
    log_info "Setting up API-specific environment..."
    
    # API-specific paths
    export SERVICE_DIR=${SERVICE_DIR:-/api-server}
    export LOG_DIR=${SERVICE_DIR}/logs
    export PATH="${SERVICE_DIR}/node_modules/.bin:${PATH}"
    
    # API identification (for telemetry)
    export MACHINE_ID=${MACHINE_ID:-api-local}
    export WORKER_ID=${WORKER_ID:-${MACHINE_ID}}
    
    log_info "✅ API environment configured"
}

# =====================================================
# API Directory Setup
# =====================================================
setup_directories() {
    # Call parent implementation first
    base_setup_directories
    
    log_info "Setting up API directories..."
    
    # Ensure we're in the API directory
    cd /api-server
    
    # API-specific directories
    mkdir -p nginx fluent-bit otel
    
    log_info "✅ API directories created"
}

# =====================================================
# API Dependencies Installation
# =====================================================
install_dependencies() {
    log_section "Installing Node.js Dependencies"
    
    cd /api-server
    
    if [[ -f "package.json" && -f "pnpm-lock.yaml" ]]; then
        log_info "Installing production dependencies (including workspace packages)..."
        pnpm install --prod --no-frozen-lockfile
        log_info "✅ Dependencies installed successfully"
    else
        log_error "❌ No package.json or pnpm-lock.yaml found"
        return 1
    fi
}

# =====================================================
# API Health Check
# =====================================================
perform_health_check() {
    # Call parent implementation first
    base_health_check || return 1
    
    log_info "Performing API-specific health checks..."
    
    # Check if API application files exist
    if [[ ! -f "/api-server/dist/src/index.js" ]]; then
        log_error "❌ API application files not found"
        return 1
    fi
    
    log_info "✅ API health checks passed"
}

# =====================================================
# API Application Start
# =====================================================
start_application() {
    log_section "Starting API Server"
    
    cd /api-server
    
    log_info "Starting EMP API Server..."
    log_info "  - Working Directory: $(pwd)"
    log_info "  - Node Environment: ${NODE_ENV}"
    log_info "  - Service: ${SERVICE_NAME} v${SERVICE_VERSION}"
    
    # Start the API server (foreground)
    exec node dist/src/index.js
}

# =====================================================
# API Main Function
# =====================================================
main() {
    # Use base main setup
    base_main_setup "API Server" "4.0.0-inherit"
    
    # Execute setup steps
    setup_environment || exit 1
    setup_directories || exit 1
    install_dependencies || exit 1
    perform_health_check || log_warn "Health check had warnings but continuing..."
    
    # Show telemetry message (machine gold standard)
    base_telemetry_message
    
    # Start the application
    start_application
}

# Set up signal handlers
setup_signal_handlers

# Run main function
main "$@"