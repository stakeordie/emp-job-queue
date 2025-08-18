#!/bin/bash
set -euo pipefail

# =====================================================
# EMP Webhook Service Entrypoint - Final
# =====================================================
# Purpose: Webhook service entrypoint
# Inheritance: base-common -> apiwebhook-base -> webhook
# =====================================================

# Source the API/Webhook base (which sources base-common)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../scripts/entrypoint-apiwebhook-base.sh"

# =====================================================
# Webhook-Specific Configuration
# =====================================================
export SERVICE_DIR="/webhook-server"
export APP_FILE="dist/index.js"
export MACHINE_ID=${MACHINE_ID:-webhook-local}

# =====================================================
# Webhook Environment Setup (Override)
# =====================================================
setup_environment() {
    # Call parent implementations
    base_setup_environment
    setup_node_service_environment
    
    log_info "Setting up webhook-specific environment..."
    
    # Webhook-specific configuration
    export WEBHOOK_PORT=${WEBHOOK_PORT:-3332}
    
    log_info "✅ Webhook environment configured"
}

# =====================================================
# Webhook Directory Setup (Override)
# =====================================================
setup_directories() {
    # Call parent implementations
    base_setup_directories
    setup_node_service_directories
    
    log_info "✅ Webhook directories ready"
}

# =====================================================
# Webhook Health Check (Override)
# =====================================================
perform_health_check() {
    # Call parent implementations
    base_health_check || return 1
    check_node_application || return 1
    
    log_info "✅ Webhook health checks passed"
}

# =====================================================
# Webhook Application Start (Override)
# =====================================================
start_application() {
    start_node_application "Webhook Service"
}

# =====================================================
# Webhook Main Function
# =====================================================
main() {
    apiwebhook_main_template "Webhook Service" "5.0.0-final"
}

# Set up signal handlers
setup_signal_handlers

# Run main function
main "$@"