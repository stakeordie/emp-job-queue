#!/bin/bash
set -euo pipefail

# =====================================================
# EMP Machine Entrypoint - Base Profile
# =====================================================
# Purpose: Minimal setup for external API connectors
# Profile: base (comfyui-remote, openai, etc.)
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
# Environment Setup
# =====================================================
setup_environment() {
    log_section "Base Profile - Environment Setup"
    
    # Core environment variables
    export PM2_HOME=/workspace/.pm2
    export SERVICE_MANAGER_PATH=/service-manager
    export WORKSPACE_PATH=/workspace
    export NODE_ENV=${NODE_ENV:-production}
    export LOG_LEVEL=${LOG_LEVEL:-info}
    
    # Source .env file if it exists
    if [ -f "/service-manager/.env" ]; then
        log_info "Loading environment from /service-manager/.env"
        set -a
        . /service-manager/.env
        set +a
    else
        log_warn "No .env file found at /service-manager/.env"
    fi
    
    # Log key environment variables for debugging
    log_info "Base Profile Configuration:"
    log_info "  - NODE_ENV: ${NODE_ENV}"
    log_info "  - LOG_LEVEL: ${LOG_LEVEL}"
    log_info "  - WORKER_BUNDLE_MODE: ${WORKER_BUNDLE_MODE:-not set}"
    log_info "  - WORKERS: ${WORKERS:-not set}"
    log_info "  - MACHINE_ID: ${MACHINE_ID:-not set}"
    log_info "  - HUB_REDIS_URL: ${HUB_REDIS_URL:-not set}"
}

# =====================================================
# Basic Directories Setup
# =====================================================
setup_directories() {
    log_section "Setting up Basic Directories"
    
    # Create essential directories only
    local dirs=(
        "/workspace/logs"
        "/workspace/tmp"
        "/workspace/.pm2"
    )
    
    for dir in "${dirs[@]}"; do
        if [ ! -d "$dir" ]; then
            log_info "Creating directory: $dir"
            mkdir -p "$dir"
        fi
    done
    
    # Set permissions
    chmod -R 755 /workspace/logs 2>/dev/null || true
    chmod -R 755 /workspace/.pm2 2>/dev/null || true
    
    log_info "Base directories setup complete"
}

# =====================================================
# Worker Bundle Setup
# =====================================================
setup_worker_bundle() {
    log_section "Setting up Worker Bundle"
    
    local bundle_mode="${WORKER_BUNDLE_MODE:-remote}"
    log_info "Worker bundle mode: $bundle_mode"
    
    if [ "$bundle_mode" = "local" ]; then
        log_info "Local mode: Using bundled worker from build time"
        
        if [ -d "/service-manager/worker-bundled" ]; then
            log_info "Copying worker bundle to workspace..."
            cp -r /service-manager/worker-bundled /workspace/
            
            if [ -f "/workspace/worker-bundled/redis-direct-worker.js" ]; then
                log_info "Worker bundle successfully copied"
                ls -la /workspace/worker-bundled/ | head -5
            else
                log_error "Worker bundle copy failed - redis-direct-worker.js not found"
                return 1
            fi
        else
            log_error "Worker bundle directory not found at /service-manager/worker-bundled"
            return 1
        fi
    else
        log_info "Remote mode: Workers will be downloaded as needed"
    fi
}

# =====================================================
# Service Manager Setup
# =====================================================
setup_service_manager() {
    log_section "Setting up Service Manager"
    
    cd /service-manager
    
    # Verify package.json exists
    if [ ! -f "package.json" ]; then
        log_error "package.json not found in /service-manager"
        return 1
    fi
    
    # Install dependencies if needed (lightweight for base profile)
    if [ ! -d "node_modules" ] || [ "${FORCE_NPM_INSTALL:-false}" = "true" ]; then
        log_info "Installing service manager dependencies..."
        pnpm install --prod --no-frozen-lockfile || {
            log_error "Failed to install service manager dependencies"
            return 1
        }
    else
        log_info "Service manager dependencies already installed"
    fi
    
    # Verify main entry point exists
    if [ ! -f "src/index-pm2.js" ]; then
        log_error "Main entry point src/index-pm2.js not found"
        return 1
    fi
    
    log_info "Service manager setup complete"
}

# =====================================================
# Health Check (Basic)
# =====================================================
perform_health_check() {
    log_section "Performing Basic Health Check"
    
    # Check Redis connectivity if configured
    if [ -n "${HUB_REDIS_URL:-}" ]; then
        log_info "Checking Redis connectivity..."
        
        # Extract host and port from Redis URL
        if [[ "$HUB_REDIS_URL" =~ redis://([^:]+:)?([^@]+@)?([^:]+):([0-9]+) ]]; then
            local redis_host="${BASH_REMATCH[3]}"
            local redis_port="${BASH_REMATCH[4]}"
            
            # Use timeout to check if port is accessible
            if timeout 2 bash -c "echo > /dev/tcp/$redis_host/$redis_port" 2>/dev/null; then
                log_info "✅ Redis is accessible at $redis_host:$redis_port"
            else
                log_warn "⚠️ Cannot reach Redis at $redis_host:$redis_port - will retry during startup"
            fi
        fi
    else
        log_warn "No Redis URL configured"
    fi
    
    # Check essential tools
    log_info "Node.js version: $(node --version)"
    log_info "PM2 version: $(pm2 --version 2>&1 || echo 'PM2 not found')"
    
    # Quick disk space check
    local available_space=$(df /workspace | awk 'NR==2 {print $4}')
    local required_space=524288  # 512MB in KB (minimal for base profile)
    
    if [ "$available_space" -lt "$required_space" ]; then
        log_warn "Low disk space: $(echo $available_space | awk '{print $1/1024}')MB available"
    else
        log_info "✅ Disk space OK: $(echo $available_space | awk '{print $1/1024}')MB available"
    fi
}

# =====================================================
# Start Application
# =====================================================
start_application() {
    log_section "Starting EMP Machine - Base Profile"
    
    cd /service-manager
    
    # Display base profile banner
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
    log_info "Profile: Base (External APIs)"
    
    # Start the main application
    exec node src/index-pm2.js
}

# =====================================================
# Error Handler
# =====================================================
handle_error() {
    local exit_code=$?
    local line_number=$1
    
    log_error "Base profile startup failed at line $line_number with exit code $exit_code"
    log_error "Last command: ${BASH_COMMAND:-unknown}"
    log_error "Working directory: $(pwd)"
    
    exit $exit_code
}

# =====================================================
# Signal Handlers
# =====================================================
handle_sigterm() {
    log_warn "Received SIGTERM signal, initiating graceful shutdown..."
    exit 0
}

handle_sigint() {
    log_warn "Received SIGINT signal, initiating graceful shutdown..."
    exit 0
}

# Register signal handlers
trap 'handle_sigterm' SIGTERM
trap 'handle_sigint' SIGINT
trap 'handle_error ${LINENO}' ERR

# =====================================================
# Main Execution
# =====================================================
main() {
    log_section "EMP Machine Starting - Base Profile"
    log_info "Entrypoint script version: 2.0.0-base"
    log_info "Date: $(date '+%Y-%m-%d %H:%M:%S')"
    
    # Execute setup steps (minimal for base profile)
    setup_environment || exit 1
    setup_directories || exit 1
    setup_worker_bundle || exit 1
    setup_service_manager || exit 1
    perform_health_check || log_warn "Health check had warnings but continuing..."
    
    # Start the application
    start_application
}

# Run main function
main "$@"