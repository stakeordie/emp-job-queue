#!/bin/bash
# =====================================================
# Machine Service Hooks - Service-Specific Setup
# =====================================================
# Purpose: Machine-specific setup functions for unified entrypoint
# Based on: apps/machine/scripts/entrypoint-base.sh
# =====================================================

# =====================================================
# Machine Environment Setup
# =====================================================
setup_environment_hook() {
    log_info "Setting up machine-specific environment..."
    
    # Core environment variables (from machine foundation)
    export PM2_HOME=/workspace/.pm2
    export SERVICE_MANAGER_PATH=/service-manager
    export WORKSPACE_PATH=/workspace
    
    # Telemetry environment variables (required by unified telemetry client)
    export TELEMETRY_ENV=${TELEMETRY_ENV:-development}
    export SERVICE_NAME=${SERVICE_NAME:-emp-service}
    export SERVICE_VERSION=${SERVICE_VERSION:-1.0.0}
    export MACHINE_ID=${MACHINE_ID:-machine-local}
    export WORKER_ID=${WORKER_ID:-${MACHINE_ID}}
    
    # Machine-specific environment
    export WORKERS=${WORKERS:-simulation-websocket:1}
    export WORKER_BUNDLE_MODE=${WORKER_BUNDLE_MODE:-local}
    
    log_info "✅ Machine environment configured"
    log_info "  - WORKERS: ${WORKERS}"
    log_info "  - MACHINE_ID: ${MACHINE_ID}"
}

# =====================================================
# Machine Directory Setup
# =====================================================
setup_directories_hook() {
    log_info "Setting up machine-specific directories..."
    
    # Machine directory structure
    mkdir -p /workspace/.pm2 /workspace/logs /service-manager /tmp
    
    # Create PM2 ecosystem directory structure
    mkdir -p /workspace/.pm2/logs /workspace/.pm2/pids
    
    log_info "✅ Machine directories created"
}

# =====================================================
# Machine Dependencies Setup (Worker Bundle)
# =====================================================
setup_dependencies_hook() {
    log_info "Setting up machine worker bundle..."
    
    # Worker bundle setup (from machine's setup_worker_bundle)
    local WORKER_BUNDLE_SOURCE="/worker-bundled"
    local WORKER_BUNDLE_TARGET="/service-manager/worker"
    
    if [[ -d "$WORKER_BUNDLE_SOURCE" ]]; then
        log_info "Copying worker bundle from $WORKER_BUNDLE_SOURCE to $WORKER_BUNDLE_TARGET"
        
        # Ensure target directory exists
        mkdir -p "$WORKER_BUNDLE_TARGET"
        
        # Copy worker bundle
        cp -r "$WORKER_BUNDLE_SOURCE"/* "$WORKER_BUNDLE_TARGET/"
        
        # Make worker executable
        chmod +x "$WORKER_BUNDLE_TARGET"/*.js 2>/dev/null || true
        
        log_info "✅ Worker bundle setup completed"
    else
        log_warn "⚠️  Worker bundle source not found: $WORKER_BUNDLE_SOURCE"
    fi
}

# =====================================================
# Machine Service Manager Setup
# =====================================================
setup_application_hook() {
    log_info "Setting up machine service manager..."
    
    # Change to service manager directory
    cd /service-manager
    
    # Service manager setup (from machine's setup_service_manager)
    if [[ -f "/service-manager/src/index-pm2.js" ]]; then
        log_info "Service manager application found"
        
        # Set PM2 configuration
        export PM2_HOME=/workspace/.pm2
        
        log_info "✅ Service manager setup completed"
    else
        log_error "❌ Service manager application not found"
        return 1
    fi
}

# =====================================================
# Machine Health Check
# =====================================================
health_check_hook() {
    log_info "Performing machine-specific health checks..."
    
    # Check PM2 availability
    if ! command -v pm2 >/dev/null 2>&1; then
        log_error "❌ PM2 not found"
        return 1
    fi
    
    # Check Node.js availability
    if ! command -v node >/dev/null 2>&1; then
        log_error "❌ Node.js not found" 
        return 1
    fi
    
    # Check service manager files
    if [[ ! -f "/service-manager/src/index-pm2.js" ]]; then
        log_error "❌ Service manager application not found"
        return 1
    fi
    
    # Check worker bundle
    if [[ ! -d "/service-manager/worker" ]]; then
        log_warn "⚠️  Worker bundle not found, may affect functionality"
    fi
    
    log_info "✅ Machine health checks completed"
}

# =====================================================
# Machine Application Start
# =====================================================
start_application_hook() {
    log_section "Starting EMP Machine - Base Profile"
    
    cd /service-manager
    
    # Display machine profile banner (from machine foundation)
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
    
    # Start the machine application (this will run in foreground)
    exec node src/index-pm2.js
}

# =====================================================
# Machine Cleanup
# =====================================================
cleanup_hook() {
    log_info "Performing machine-specific cleanup..."
    
    # Stop PM2 processes
    if command -v pm2 >/dev/null 2>&1; then
        log_info "Stopping PM2 processes..."
        pm2 stop all >/dev/null 2>&1 || true
        pm2 delete all >/dev/null 2>&1 || true
    fi
    
    # Stop Node.js service if running
    if [[ -n "${NODE_PID:-}" ]] && kill -0 $NODE_PID 2>/dev/null; then
        log_info "Stopping machine service..."
        kill -TERM $NODE_PID 2>/dev/null || true
        wait $NODE_PID 2>/dev/null || true
    fi
    
    log_info "✅ Machine cleanup completed"
}