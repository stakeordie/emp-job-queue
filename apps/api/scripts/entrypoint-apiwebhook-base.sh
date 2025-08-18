#!/bin/bash
set -euo pipefail

# =====================================================
# EMP API/Webhook Base - Middle Layer
# =====================================================
# Purpose: Common functionality for API and Webhook services
# Inherits: base-common.sh
# Used by: API and Webhook services (NOT machine)
# =====================================================

# Source the base common entrypoint
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/entrypoint-base-common.sh"

# =====================================================
# Node.js Dependencies Installation (API/Webhook pattern)
# =====================================================
install_dependencies() {
    log_section "Installing Node.js Dependencies"
    
    # Both API and webhook use the same dependency pattern
    local service_dir="${SERVICE_DIR:-$(pwd)}"
    cd "$service_dir"
    
    if [[ -f "package.json" && -f "pnpm-lock.yaml" ]]; then
        log_info "Installing production dependencies (including workspace packages)..."
        # Remove --ignore-workspace to allow @emp/telemetry and @emp/core workspace dependencies
        pnpm install --prod --no-frozen-lockfile
        log_info "✅ Dependencies installed successfully"
    else
        log_error "❌ No package.json or pnpm-lock.yaml found in $service_dir"
        return 1
    fi
}

# =====================================================
# Common Node.js Service Directories (API/Webhook pattern)
# =====================================================
setup_node_service_directories() {
    log_info "Setting up Node.js service directories..."
    
    local service_dir="${SERVICE_DIR:-$(pwd)}"
    cd "$service_dir"
    
    # Common directories for Node.js services
    mkdir -p logs nginx fluent-bit otel tmp
    
    log_info "✅ Node.js service directories created"
}

# =====================================================
# Common Node.js Health Checks (API/Webhook pattern)
# =====================================================
check_node_application() {
    log_info "Checking Node.js application files..."
    
    local service_dir="${SERVICE_DIR:-$(pwd)}"
    local app_file="${APP_FILE:-dist/src/index.js}"
    
    if [[ ! -f "$service_dir/$app_file" ]]; then
        log_error "❌ Application file not found: $service_dir/$app_file"
        return 1
    fi
    
    log_info "✅ Node.js application files found"
}

# =====================================================
# Common Node.js Service Environment (API/Webhook pattern)
# =====================================================
setup_node_service_environment() {
    log_info "Setting up Node.js service environment..."
    
    local service_dir="${SERVICE_DIR:-$(pwd)}"
    
    # Common Node.js service paths
    export LOG_DIR=${service_dir}/logs
    export PATH="${service_dir}/node_modules/.bin:${PATH}"
    
    # Default WORKER_ID to MACHINE_ID for non-worker services
    export WORKER_ID=${WORKER_ID:-${MACHINE_ID}}
    
    log_info "✅ Node.js service environment configured"
}

# =====================================================
# Common Node.js Application Start Pattern
# =====================================================
start_node_application() {
    local service_name="$1"
    local service_dir="${SERVICE_DIR:-$(pwd)}"
    local app_file="${APP_FILE:-dist/src/index.js}"
    
    log_section "Starting $service_name"
    
    cd "$service_dir"
    
    log_info "Starting $service_name..."
    log_info "  - Working Directory: $(pwd)"
    log_info "  - Node Environment: ${NODE_ENV}"
    log_info "  - Service: ${SERVICE_NAME} v${SERVICE_VERSION}"
    log_info "  - Machine ID: ${MACHINE_ID}"
    
    # Start the Node.js application (foreground)
    exec node "$app_file"
}

# =====================================================
# Common Main Template for Node.js Services
# =====================================================
apiwebhook_main_template() {
    local service_name="$1"
    local version="$2"
    
    # Use base main setup
    base_main_setup "$service_name" "$version"
    
    # Execute common Node.js service setup steps
    setup_environment || exit 1
    setup_directories || exit 1
    install_dependencies || exit 1
    perform_health_check || log_warn "Health check had warnings but continuing..."
    
    # Show telemetry message (machine gold standard)
    base_telemetry_message
    
    # Start the application
    start_application
}