#!/bin/bash
set -euo pipefail

# =====================================================
# EMP API Service Entrypoint - Final
# =====================================================
# Purpose: API service entrypoint
# Inheritance: base-common -> apiwebhook-base -> api
# =====================================================

# Source the API/Webhook base (which sources base-common)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../scripts/entrypoint-apiwebhook-base.sh"

# =====================================================
# API-Specific Configuration
# =====================================================
export SERVICE_DIR="/api-server"
export APP_FILE="dist/src/index.js"
export MACHINE_ID=${MACHINE_ID:-api-local}

# =====================================================
# API Environment Setup (Override)
# =====================================================
setup_environment() {
    # Call parent implementations
    base_setup_environment
    setup_node_service_environment
    
    log_info "Setting up API-specific environment..."
    
    # API-specific configuration
    export API_PORT=${API_PORT:-3001}
    
    log_info "✅ API environment configured"
}

# =====================================================
# API Directory Setup (Override)
# =====================================================
setup_directories() {
    # Call parent implementations
    base_setup_directories
    setup_node_service_directories
    
    log_info "✅ API directories ready"
}

# =====================================================
# API Health Check (Override)
# =====================================================
perform_health_check() {
    # Call parent implementations
    base_health_check || return 1
    check_node_application || return 1
    
    log_info "✅ API health checks passed"
}

# =====================================================
# API Application Start (Override)
# =====================================================
start_application() {
    start_node_application "API Server"
}

# =====================================================
# API Main Function
# =====================================================
main() {
    apiwebhook_main_template "API Server" "5.0.0-final"
}

# Set up signal handlers
setup_signal_handlers

# Run main function
main "$@"