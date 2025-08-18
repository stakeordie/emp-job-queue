#!/bin/bash
set -euo pipefail

# =====================================================
# EMP Unified Entrypoint - Base Foundation
# =====================================================
# Purpose: Unified entrypoint for all EMP services
# Based on: Machine service entrypoint (most mature)
# Services: API, Webhook, Machine
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
# Service Detection and Hook Loading
# =====================================================
detect_service_type() {
    # Detect service type from environment or working directory
    if [[ -n "${SERVICE_TYPE:-}" ]]; then
        echo "${SERVICE_TYPE}"
    elif [[ "${PWD}" == *"/api-server" ]]; then
        echo "api"
    elif [[ "${PWD}" == *"/webhook-server" ]]; then
        echo "webhook"
    elif [[ "${PWD}" == *"/service-manager" ]] || [[ "${PWD}" == *"/workspace" ]]; then
        echo "machine"
    else
        log_error "Unable to detect service type. Please set SERVICE_TYPE environment variable."
        exit 1
    fi
}

load_service_hooks() {
    local service_type="$1"
    local hook_file
    
    # Look for service-specific hooks in multiple locations
    local possible_locations=(
        "${PWD}/hooks/${service_type}-hooks.sh"
        "${PWD}/../hooks/${service_type}-hooks.sh"
        "${PWD}/scripts/${service_type}-hooks.sh"
        "/shared/hooks/${service_type}-hooks.sh"
    )
    
    for hook_file in "${possible_locations[@]}"; do
        if [[ -f "$hook_file" ]]; then
            log_info "🔗 Loading service hooks: $hook_file"
            source "$hook_file"
            return 0
        fi
    done
    
    log_warn "⚠️  No service hooks found for $service_type, using defaults"
    return 0
}

# Hook system - services can override these functions
call_hook() {
    local hook_name="$1"
    local hook_function="${hook_name}_hook"
    
    if declare -f "$hook_function" >/dev/null 2>&1; then
        log_info "🪝 Calling hook: $hook_name"
        "$hook_function"
    else
        log_info "🪝 Hook not defined: $hook_name (skipping)"
    fi
}

# =====================================================
# Environment Setup (Based on Machine Foundation)
# =====================================================
setup_environment() {
    log_section "Unified Environment Setup"
    
    # Core environment variables (from machine foundation)
    export NODE_ENV=${NODE_ENV:-production}
    export LOG_LEVEL=${LOG_LEVEL:-info}
    
    # Service-specific environment setup
    call_hook "setup_environment"
    
    log_info "✅ Environment setup completed"
}

# =====================================================
# Directory Setup (Based on Machine Foundation)
# =====================================================
setup_directories() {
    log_section "Directory Setup"
    
    # Common directories needed by all services
    mkdir -p logs tmp
    
    # Service-specific directory setup
    call_hook "setup_directories"
    
    log_info "✅ Directories setup completed"
}

# =====================================================
# Dependencies Setup (Unified Approach)
# =====================================================
setup_dependencies() {
    log_section "Dependencies Setup"
    
    # Service-specific dependency setup (API/webhook need pnpm, machine needs different setup)
    call_hook "setup_dependencies"
    
    log_info "✅ Dependencies setup completed"
}

# =====================================================
# Application Setup (Service-Specific)
# =====================================================
setup_application() {
    log_section "Application Setup"
    
    # Service-specific application setup
    call_hook "setup_application"
    
    log_info "✅ Application setup completed"
}

# =====================================================
# Health Check (Based on Machine Foundation)
# =====================================================
perform_health_check() {
    log_section "Health Check"
    
    # Basic system health checks
    log_info "Checking system health..."
    
    # Service-specific health checks
    call_hook "health_check"
    
    log_info "✅ Health check completed"
}

# =====================================================
# Start Application (Service-Specific)
# =====================================================
start_application() {
    log_section "Starting Application"
    
    # Enhanced TelemetryClient will handle ALL telemetry processes during Node.js startup:
    # - nginx proxy for Forward protocol
    # - OTEL Collector process  
    # - Fluent Bit process
    log_info "🔧 Enhanced TelemetryClient will start ALL telemetry processes during application startup"
    log_info "🔧 This includes: nginx proxy + OTEL Collector + Fluent Bit"
    
    # Service-specific application startup
    call_hook "start_application"
}

# =====================================================
# Cleanup function (Based on Machine Foundation)
# =====================================================
cleanup() {
    log_warn "Received shutdown signal, cleaning up..."
    
    # Service-specific cleanup
    call_hook "cleanup"
    
    log_info "Cleanup complete"
    exit 0
}

# =====================================================
# Main Function (Unified Flow)
# =====================================================
main() {
    # Detect service type and load hooks
    local service_type
    service_type=$(detect_service_type)
    
    log_section "EMP Service Starting - Unified Entrypoint"
    log_info "Service Type: $service_type"
    log_info "Entrypoint script version: 4.0.0-unified-base"
    log_info "Date: $(date '+%Y-%m-%d %H:%M:%S')"
    
    # Load service-specific hooks
    load_service_hooks "$service_type"
    
    # Execute unified setup flow (based on machine foundation)
    setup_environment || exit 1
    setup_directories || exit 1
    setup_dependencies || exit 1
    setup_application || exit 1
    perform_health_check || log_warn "Health check had warnings but continuing..."
    
    # Start the application (service-specific)
    start_application
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT

# Run main function
main "$@"