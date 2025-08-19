#!/bin/bash
set -euo pipefail

# =====================================================
# EMP Machine Service Entrypoint - Final
# =====================================================
# Purpose: Machine service entrypoint (Gold Standard)
# Inheritance: base-common -> machine (bypasses apiwebhook-base)
# =====================================================

# Source the base common directly (NOT apiwebhook-base)
source "/scripts/entrypoint-base-common.sh"

# =====================================================
# Machine-Specific Environment Setup (Override)
# =====================================================
setup_environment() {
    # Call parent implementation
    base_setup_environment
    
    log_section "Machine Profile - Environment Setup"
    
    # Machine-specific environment
    export PM2_HOME=/workspace/.pm2
    export SERVICE_MANAGER_PATH=/service-manager
    export WORKSPACE_PATH=/workspace
    
    # Machine identification
    export MACHINE_ID=${MACHINE_ID:-machine-local}
    export WORKER_ID=${WORKER_ID:-${MACHINE_ID}}
    
    # Workers configuration
    export WORKERS=${WORKERS:-simulation-websocket:1}
    export WORKER_BUNDLE_MODE=${WORKER_BUNDLE_MODE:-local}
    
    log_info "✅ Machine environment configured"
    log_info "  - WORKERS: ${WORKERS}"
    log_info "  - MACHINE_ID: ${MACHINE_ID}"
}

# =====================================================
# Machine Directory Setup (Override)
# =====================================================
setup_directories() {
    # Call parent implementation
    base_setup_directories
    
    log_section "Machine Profile - Directory Setup"
    
    # Machine directory structure
    mkdir -p /workspace/.pm2 /workspace/logs /service-manager
    mkdir -p /workspace/.pm2/logs /workspace/.pm2/pids
    
    log_info "✅ Machine directories created"
}

# =====================================================
# Machine Worker Bundle Setup
# =====================================================
setup_worker_bundle() {
    log_section "Worker Bundle Setup"
    
    local WORKER_BUNDLE_SOURCE="/worker-bundled"
    local WORKER_BUNDLE_TARGET="/service-manager/worker"
    
    if [[ -d "$WORKER_BUNDLE_SOURCE" ]]; then
        log_info "Copying worker bundle from $WORKER_BUNDLE_SOURCE to $WORKER_BUNDLE_TARGET"
        
        mkdir -p "$WORKER_BUNDLE_TARGET"
        cp -r "$WORKER_BUNDLE_SOURCE"/* "$WORKER_BUNDLE_TARGET/"
        chmod +x "$WORKER_BUNDLE_TARGET"/*.js 2>/dev/null || true
        
        log_info "✅ Worker bundle setup completed"
    else
        log_warn "⚠️  Worker bundle source not found: $WORKER_BUNDLE_SOURCE"
    fi
}

# =====================================================
# Machine Service Manager Setup
# =====================================================
setup_service_manager() {
    log_section "Service Manager Setup"
    
    cd /service-manager
    
    if [[ -f "/service-manager/src/index-pm2.js" ]]; then
        log_info "Service manager application found"
        export PM2_HOME=/workspace/.pm2
        log_info "✅ Service manager setup completed"
    else
        log_error "❌ Service manager application not found"
        return 1
    fi
}

# =====================================================
# Machine Health Check (Override)
# =====================================================
perform_health_check() {
    # Call parent implementation
    base_health_check || return 1
    
    log_section "Machine Health Check"
    
    # Check PM2 availability
    if ! command -v pm2 >/dev/null 2>&1; then
        log_error "❌ PM2 not found"
        return 1
    fi
    
    # Check service manager files
    if [[ ! -f "/service-manager/src/index-pm2.js" ]]; then
        log_error "❌ Service manager application not found"
        return 1
    fi
    
    # Check worker bundle (warning only)
    if [[ ! -d "/service-manager/worker" ]]; then
        log_warn "⚠️  Worker bundle not found, may affect functionality"
    fi
    
    log_info "✅ Machine health checks completed"
}

# =====================================================
# Machine Application Start (Override)
# =====================================================
start_application() {
    log_section "Starting EMP Machine - Base Profile"
    
    cd /service-manager
    
    # Display machine profile banner
    echo -e "${GREEN}"
    echo "  ███████╗███╗   ███╗██████╗     ██████╗  █████╗ ███████╗███████╗"
    echo "  ██╔════╝████╗ ████║██╔══██╗    ██╔══██╗██╔══██╗██╔════╝██╔════╝"
    echo "  █████╗  ██╔████╔██║██████╔╝    ██████╔╝███████║███████╗█████╗  "
    echo "  ██╔══╝  ██║╚██╔╝██║██╔═══╝     ██╔══██╗██╔══██║╚════██║██╔══╝  "
    echo "  ███████╗██║ ╚═╝ ██║██║         ██████╔╝██║  ██║███████║███████╗"
    echo "  ╚══════╝╚═╝     ╚═╝╚═╝         ╚═════╝ ╚═╝  ╚═╝╚══════╝╚══════╝"
    echo -e "${NC}"
    echo -e "${BLUE}              External API Connector Profile${NC}"
    
    log_info "Starting main application..."
    log_info "Machine ID: ${MACHINE_ID:-unknown}"
    log_info "Workers: ${WORKERS:-none}"
    
    # Start the machine application (foreground)
    exec node src/index-pm2.js
}

# =====================================================
# Machine Cleanup (Override)
# =====================================================
cleanup() {
    # Call parent implementation
    base_cleanup
    
    log_info "Performing machine-specific cleanup..."
    
    # Stop PM2 processes
    if command -v pm2 >/dev/null 2>&1; then
        log_info "Stopping PM2 processes..."
        pm2 stop all >/dev/null 2>&1 || true
        pm2 delete all >/dev/null 2>&1 || true
    fi
    
    log_info "✅ Machine cleanup completed"
}

# =====================================================
# Machine Main Function
# =====================================================
main() {
    # Use base main setup
    base_main_setup "Machine" "5.0.0-final"
    
    # Execute machine-specific setup steps
    setup_environment || exit 1
    setup_directories || exit 1
    setup_worker_bundle || exit 1
    setup_service_manager || exit 1
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