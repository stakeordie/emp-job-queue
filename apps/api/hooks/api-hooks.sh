#!/bin/bash
# =====================================================
# API Service Hooks - Service-Specific Setup
# =====================================================
# Purpose: API-specific setup functions for unified entrypoint
# =====================================================

# =====================================================
# API Environment Setup
# =====================================================
setup_environment_hook() {
    log_info "Setting up API-specific environment..."
    
    # API-specific paths and environment
    export SERVICE_DIR=${SERVICE_DIR:-/api-server}
    export LOG_DIR=${SERVICE_DIR}/logs
    export PATH="${SERVICE_DIR}/node_modules/.bin:${PATH}"
    
    # API service identification
    export SERVICE_NAME=${SERVICE_NAME:-emp-service}
    export SERVICE_VERSION=${SERVICE_VERSION:-1.0.0}
    
    # Telemetry environment variables (required by unified telemetry client)
    export TELEMETRY_ENV=${TELEMETRY_ENV:-development}
    export MACHINE_ID=${MACHINE_ID:-api-local}
    export WORKER_ID=${WORKER_ID:-${MACHINE_ID}}
    
    log_info "✅ API environment configured"
}

# =====================================================
# API Directory Setup
# =====================================================
setup_directories_hook() {
    log_info "Setting up API-specific directories..."
    
    # Ensure we're in the correct directory
    cd /api-server
    
    # API-specific directories
    mkdir -p logs nginx fluent-bit otel tmp
    
    log_info "✅ API directories created"
}

# =====================================================
# API Dependencies Setup
# =====================================================
setup_dependencies_hook() {
    log_info "Installing API Node.js dependencies..."
    
    # Change to API directory
    cd /api-server
    
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
# API Application Setup
# =====================================================
setup_application_hook() {
    log_info "Setting up API application..."
    
    # Any API-specific application setup can go here
    # Currently API doesn't need special application setup
    
    log_info "✅ API application setup completed"
}

# =====================================================
# API Health Check
# =====================================================
health_check_hook() {
    log_info "Performing API-specific health checks..."
    
    # Check if Node.js is available
    if ! command -v node >/dev/null 2>&1; then
        log_error "❌ Node.js not found"
        return 1
    fi
    
    # Check if required files exist
    if [[ ! -f "/api-server/dist/src/index.js" ]]; then
        log_error "❌ API application files not found"
        return 1
    fi
    
    log_info "✅ API health checks passed"
}

# =====================================================
# API Application Start
# =====================================================
start_application_hook() {
    log_info "Starting API Server..."
    log_info "  - Working Directory: $(pwd)"
    log_info "  - Node Environment: ${NODE_ENV}"
    log_info "  - Service: ${SERVICE_NAME} v${SERVICE_VERSION}"
    
    # Start the API server (this will run in foreground)
    exec node dist/src/index.js
}

# =====================================================
# API Cleanup
# =====================================================
cleanup_hook() {
    log_info "Performing API-specific cleanup..."
    
    # Stop Node.js service if running
    if [[ -n "${NODE_PID:-}" ]] && kill -0 $NODE_PID 2>/dev/null; then
        log_info "Stopping API service..."
        kill -TERM $NODE_PID 2>/dev/null || true
        wait $NODE_PID 2>/dev/null || true
    fi
    
    log_info "✅ API cleanup completed"
}