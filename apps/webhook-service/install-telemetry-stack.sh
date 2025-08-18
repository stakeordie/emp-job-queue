#!/bin/bash
set -euo pipefail

# =====================================================
# Telemetry Stack Installation Script
# =====================================================
# Installs nginx-full, Fluent Bit, and OTEL Collector
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

# =====================================================
# Install nginx with Stream Module
# =====================================================
install_nginx() {
    log_section "Installing nginx with Stream Module"
    
    log_info "Installing nginx-full (includes stream module for Forward protocol proxy)..."
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends nginx-full
    
    log_info "✅ nginx-full installed with stream module support"
    log_info "📋 nginx can now proxy Forward protocol: localhost:24224 → production Fluentd"
}

# =====================================================
# Install Fluent Bit
# =====================================================
install_fluent_bit() {
    log_section "Installing Fluent Bit"
    
    local FLUENT_BIT_VERSION="3.1.8"
    
    log_info "Adding Fluent Bit repository..."
    curl -fsSL "https://packages.fluentbit.io/fluentbit.key" | apt-key add -
    echo "deb https://packages.fluentbit.io/ubuntu/jammy jammy main" | tee /etc/apt/sources.list.d/fluent-bit.list
    
    log_info "Installing Fluent Bit ${FLUENT_BIT_VERSION}..."
    apt-get update
    apt-get install -y fluent-bit=${FLUENT_BIT_VERSION}*
    
    log_info "✅ Fluent Bit ${FLUENT_BIT_VERSION} installed"
    log_info "📋 Fluent Bit will monitor log files and send via Forward protocol"
}

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
    log_info "📋 OTEL Collector will export traces and metrics to Dash0"
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
        "${SERVICE_DIR}/fluent-bit" \
        "${SERVICE_DIR}/otel" \
        "${SERVICE_DIR}/nginx" \
        "/var/log/nginx" \
        "/tmp/fluent-bit-buffer"
    
    log_info "✅ Directory structure created"
    log_info "📁 Logs: ${SERVICE_DIR}/logs"
    log_info "📁 Configs: ${SERVICE_DIR}/{fluent-bit,otel,nginx}"
    log_info "📁 nginx logs: /var/log/nginx"
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
    install_nginx
    install_fluent_bit
    install_otel_collector
    create_directories
    cleanup
    
    log_section "Installation Complete"
    log_info "✅ Telemetry stack installed successfully"
    log_info "📋 Components installed:"
    log_info "   - nginx-full (with stream module)"
    log_info "   - Fluent Bit 3.1.8"
    log_info "   - OTEL Collector 0.114.0"
    log_info "📋 Ready for TelemetryClient configuration and startup"
}

# Run main function
main "$@"