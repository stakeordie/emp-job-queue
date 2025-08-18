#!/bin/bash
# =====================================================
# Webhook Service Hooks - Service-Specific Setup
# =====================================================
# Purpose: Webhook-specific setup functions for unified entrypoint
# =====================================================

# =====================================================
# Webhook Environment Setup
# =====================================================
setup_environment_hook() {
    log_info "Setting up webhook-specific environment..."
    
    # Webhook-specific paths and environment
    export SERVICE_DIR=${SERVICE_DIR:-/webhook-server}
    export LOG_DIR=${SERVICE_DIR}/logs
    export PATH="${SERVICE_DIR}/node_modules/.bin:${PATH}"
    
    # Webhook service identification
    export SERVICE_NAME=${SERVICE_NAME:-emp-service}
    export SERVICE_VERSION=${SERVICE_VERSION:-1.0.0}
    
    # Telemetry environment variables (required by unified telemetry client)
    export TELEMETRY_ENV=${TELEMETRY_ENV:-development}
    export MACHINE_ID=${MACHINE_ID:-webhook-local}
    export WORKER_ID=${WORKER_ID:-${MACHINE_ID}}
    
    log_info "✅ Webhook environment configured"
}

# =====================================================
# Webhook Directory Setup
# =====================================================
setup_directories_hook() {
    log_info "Setting up webhook-specific directories..."
    
    # Ensure we're in the correct directory
    cd /webhook-server
    
    # Webhook-specific directories
    mkdir -p logs nginx fluent-bit otel tmp
    
    log_info "✅ Webhook directories created"
}

# =====================================================
# Webhook Dependencies Setup
# =====================================================
setup_dependencies_hook() {
    log_info "Installing webhook Node.js dependencies..."
    
    # Change to webhook directory
    cd /webhook-server
    
    # Check for package files
    if [[ -f "package.json" && -f "pnpm-lock.yaml" ]]; then
        log_info "Installing production dependencies (including workspace packages)..."
        # Remove --ignore-workspace to allow @emp/telemetry and @emp/core workspace dependencies
        pnpm install --prod --no-frozen-lockfile
        log_info "✅ Dependencies installed successfully"
    else
        log_error "❌ No package.json or pnpm-lock.yaml found"
        return 1
    fi
}

# =====================================================
# Webhook Application Setup
# =====================================================
setup_application_hook() {
    log_info "Setting up webhook application..."
    
    # Any webhook-specific application setup can go here
    # Currently webhook doesn't need special application setup
    
    log_info "✅ Webhook application setup completed"
}

# =====================================================
# Webhook Health Check
# =====================================================
health_check_hook() {
    log_info "Performing webhook-specific health checks..."
    
    # Check if Node.js is available
    if ! command -v node >/dev/null 2>&1; then
        log_error "❌ Node.js not found"
        return 1
    fi
    
    # Check if required files exist
    if [[ ! -f "/webhook-server/dist/src/index.js" ]]; then
        log_error "❌ Webhook application files not found"
        return 1
    fi
    
    log_info "✅ Webhook health checks passed"
}

# =====================================================
# Webhook Application Start
# =====================================================
start_application_hook() {
    log_info "Starting Webhook Service..."
    log_info "  - Working Directory: $(pwd)"
    log_info "  - Node Environment: ${NODE_ENV}"
    log_info "  - Service: ${SERVICE_NAME} v${SERVICE_VERSION}"
    
    # Start the webhook service (this will run in foreground)
    exec node dist/src/index.js
}

# =====================================================
# Webhook Cleanup
# =====================================================
cleanup_hook() {
    log_info "Performing webhook-specific cleanup..."
    
    # Stop Node.js service if running
    if [[ -n "${NODE_PID:-}" ]] && kill -0 $NODE_PID 2>/dev/null; then
        log_info "Stopping webhook service..."
        kill -TERM $NODE_PID 2>/dev/null || true
        wait $NODE_PID 2>/dev/null || true
    fi
    
    log_info "✅ Webhook cleanup completed"
}