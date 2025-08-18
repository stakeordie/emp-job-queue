#!/bin/bash
set -euo pipefail

# =====================================================
# EMP Base Entrypoint - Common Foundation
# =====================================================
# Purpose: Common functionality for all EMP services
# Gold Standard: Machine service telemetry approach
# Pattern: Parent script for inheritance
# =====================================================

# Color codes for better logging
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# =====================================================
# Common Logging Functions (from machine gold standard)
# =====================================================
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
# Common Environment Setup
# =====================================================
base_setup_environment() {
    log_section "Base Environment Setup"
    
    # Core environment variables (from machine gold standard)
    export NODE_ENV=${NODE_ENV:-production}
    export LOG_LEVEL=${LOG_LEVEL:-info}
    
    # Telemetry environment variables (required by unified telemetry client)
    export TELEMETRY_ENV=${TELEMETRY_ENV:-development}
    export SERVICE_NAME=${SERVICE_NAME:-emp-service}
    export SERVICE_VERSION=${SERVICE_VERSION:-1.0.0}
    
    log_info "✅ Base environment configured"
}

# =====================================================
# Common Directory Setup
# =====================================================
base_setup_directories() {
    log_section "Base Directory Setup"
    
    # Common directories all services need
    mkdir -p logs tmp
    
    log_info "✅ Base directories created"
}

# =====================================================
# Common Health Check
# =====================================================
base_health_check() {
    log_section "Base Health Check"
    
    # Check Node.js availability (all services need this)
    if ! command -v node >/dev/null 2>&1; then
        log_error "❌ Node.js not found"
        return 1
    fi
    
    log_info "✅ Base health checks passed"
}

# =====================================================
# Enhanced TelemetryClient Message (Machine Gold Standard)
# =====================================================
base_telemetry_message() {
    # This is the machine's gold standard telemetry approach
    log_info "🔧 Enhanced TelemetryClient will start ALL telemetry processes during Node.js startup"
    log_info "🔧 This includes: nginx proxy + OTEL Collector + Fluent Bit"
}

# =====================================================
# Common Cleanup Function (from machine)
# =====================================================
base_cleanup() {
    log_warn "Received shutdown signal, cleaning up..."
    
    # Stop Node.js service if running (common to all)
    if [[ -n "${NODE_PID:-}" ]] && kill -0 $NODE_PID 2>/dev/null; then
        log_info "Stopping Node.js service..."
        kill -TERM $NODE_PID 2>/dev/null || true
        wait $NODE_PID 2>/dev/null || true
    fi
    
    log_info "Base cleanup complete"
}

# =====================================================
# Base Main Function Template
# =====================================================
# Services should override this but can call base_main_setup for common parts
base_main_setup() {
    local service_name="$1"
    local version="$2"
    
    log_section "EMP $service_name Starting"
    log_info "Entrypoint script version: $version"
    log_info "Date: $(date '+%Y-%m-%d %H:%M:%S')"
}

# =====================================================
# Signal Handlers (from machine)
# =====================================================
setup_signal_handlers() {
    trap 'cleanup' SIGTERM SIGINT
}

# =====================================================
# Default implementations (services can override)
# =====================================================
setup_environment() {
    base_setup_environment
}

setup_directories() {
    base_setup_directories
}

perform_health_check() {
    base_health_check
}

cleanup() {
    base_cleanup
}

# Services must implement start_application
start_application() {
    log_error "start_application must be implemented by the service"
    exit 1
}