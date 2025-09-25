#!/bin/bash
set -euo pipefail

# =====================================================
# Telemetry Stack Installation Script
# =====================================================
# Installs OTEL Collector only (Fluent Bit removed)
# Used by: API, webhook, and machine containers
# =====================================================

# Color codes for logging
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[TELEMETRY-INSTALL]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[TELEMETRY-INSTALL]${NC} $1"
}

log_error() {
    echo -e "${RED}[TELEMETRY-INSTALL]${NC} $1"
}

log_section() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

# =====================================================
# Install System Dependencies
# =====================================================
install_system_deps() {
    log_section "Installing System Dependencies"
    
    log_info "Updating package lists..."
    apt-get clean
    rm -rf /var/lib/apt/lists/*
    apt-get update --allow-releaseinfo-change
    
    log_info "Installing core system packages..."
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        ca-certificates gnupg curl git wget jq tar nano net-tools lsof \
        git-lfs openssh-client zstd python3-pip python3-dev gettext-base
    
    log_info "✅ System dependencies installed"
}

# nginx removed - direct logging approach only

# Fluent Bit removed - direct logging approach only

# =====================================================
# Install OTEL Collector
# =====================================================
install_otel_collector() {
    log_section "Installing OpenTelemetry Collector"
    
    local OTEL_VERSION="0.114.0"
    
    log_info "Downloading OTEL Collector ${OTEL_VERSION}..."
    curl -fsSL "https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v${OTEL_VERSION}/otelcol-contrib_${OTEL_VERSION}_linux_amd64.tar.gz" | \
        tar -xzC /usr/local/bin/
    
    chmod +x /usr/local/bin/otelcol-contrib
    
    log_info "✅ OTEL Collector ${OTEL_VERSION} installed"
    log_info "📋 OTEL Collector will export traces and metrics to Dash0 (direct approach)"
}

# =====================================================
# Create Standard Directory Structure
# =====================================================
create_directories() {
    log_section "Creating Telemetry Directory Structure"
    
    # Get service directory from environment or use default
    local SERVICE_DIR="${SERVICE_DIR:-/app}"
    
    log_info "Creating directories in ${SERVICE_DIR}..."
    mkdir -p \
        "${SERVICE_DIR}/logs" \
        "${SERVICE_DIR}/configs" \
        "${SERVICE_DIR}/tmp" \
        "${SERVICE_DIR}/scripts" \
        "${SERVICE_DIR}/otel"
    
    log_info "✅ Directory structure created"
    log_info "📁 Logs: ${SERVICE_DIR}/logs"
    log_info "📁 Configs: ${SERVICE_DIR}/otel"
}

# =====================================================
# Cleanup
# =====================================================
cleanup() {
    log_section "Cleaning Up"
    
    log_info "Removing package caches..."
    apt-get clean
    rm -rf /var/lib/apt/lists/*
    
    log_info "✅ Cleanup completed"
}

# =====================================================
# Main Installation
# =====================================================
main() {
    log_section "EMP Telemetry Stack Installation"
    
    log_info "Installing telemetry stack for: ${SERVICE_TYPE:-unknown-service}"
    log_info "Target directory: ${SERVICE_DIR:-/app}"
    
    install_system_deps
    install_otel_collector
    create_directories
    cleanup
    
    log_section "Installation Complete"
    log_info "✅ Telemetry stack installed successfully"
    log_info "📋 Components installed:"
    log_info "   - OTEL Collector 0.114.0 (direct approach)"
    log_info "📋 Ready for TelemetryClient configuration and startup (Fluent Bit removed)"
}

# Run main function
main "$@"