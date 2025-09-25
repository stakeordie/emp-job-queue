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
    
    # Set container start time for profile script
    export CONTAINER_START_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    echo "🐳 Container started at: $CONTAINER_START_TIME"
    
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
    
    # Early ecosystem generator configuration logging
    log_info "🔧 PM2 Ecosystem Generator Configuration:"
    log_info "  - WORKER_CONNECTORS: ${WORKER_CONNECTORS:-${WORKERS}}"
    log_info "  - COMFYUI_BASE_PORT: ${COMFYUI_BASE_PORT:-8188}"
    log_info "  - GPU_MODE: ${GPU_MODE:-actual}"
    log_info "  - NUM_GPUS: ${NUM_GPUS:-auto}"
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
    
    # Initialize Winston log files for FluentBit tail input
    if [[ -f "/workspace/worker-bundled/scripts/init-winston-logs.sh" ]]; then
        log_info "🔧 Initializing Winston OpenAI log files..."
        bash "/workspace/worker-bundled/scripts/init-winston-logs.sh" || log_warn "Failed to initialize Winston log files"
    fi
    
    log_info "✅ Machine directories created"
}

# =====================================================
# Worker Bundle Download and Extraction
# =====================================================
download_and_extract_worker_bundle() {
    local target_dir="$1"
    local download_url="${WORKER_DOWNLOAD_URL:-https://github.com/stakeordie/emp-job-queue/releases/latest/download/emp-job-queue-worker.tar.gz}"
    local temp_file="/tmp/worker-bundle-entrypoint.tar.gz"
    
    log_info "🌐 Downloading worker bundle from: $download_url"
    log_info "📁 Extracting to: $target_dir"
    
    # Clean up any existing temp file
    rm -f "$temp_file" 2>/dev/null || true
    
    # Create target directory
    mkdir -p "$target_dir"
    
    # Download with wget
    if wget --no-check-certificate --timeout=60 --tries=3 -O "$temp_file" "$download_url" 2>/dev/null; then
        log_info "✅ Download completed successfully"
        
        # Verify file was downloaded and is not empty
        if [[ -f "$temp_file" && -s "$temp_file" ]]; then
            log_info "📦 Extracting worker bundle..."
            
            # Extract to target directory
            if tar -xzf "$temp_file" -C "$target_dir" --strip-components=1 2>/dev/null; then
                log_info "✅ Extraction completed successfully"
                
                # Ensure package.json exists with type: module
                local package_json="$target_dir/package.json"
                if [[ ! -f "$package_json" ]]; then
                    cat > "$package_json" << 'EOF'
{
  "name": "emp-worker",
  "type": "module",
  "version": "1.0.0",
  "description": "EMP Worker - Production"
}
EOF
                    log_info "✅ Created package.json with ES module support"
                fi
                
                # Make scripts executable
                chmod +x "$target_dir"/*.js 2>/dev/null || true
                
                # Cleanup temp file
                rm -f "$temp_file" 2>/dev/null || true
                
                return 0  # Success
            else
                log_error "❌ Failed to extract worker bundle"
                rm -f "$temp_file" 2>/dev/null || true
                return 1  # Failure
            fi
        else
            log_error "❌ Downloaded file is empty or missing"
            rm -f "$temp_file" 2>/dev/null || true
            return 1  # Failure
        fi
    else
        log_error "❌ Failed to download worker bundle"
        rm -f "$temp_file" 2>/dev/null || true
        return 1  # Failure
    fi
}

# =====================================================
# Machine Worker Bundle Setup
# =====================================================
setup_worker_bundle() {
    log_section "Worker Bundle Setup"
    
    # Unified target location for both local and production modes
    local WORKER_BUNDLE_TARGET="/workspace/worker-bundled"
    
    echo ""
    echo "🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄"
    echo "🎯 WORKER BUNDLE DEPLOYMENT - UNIFIED ARCHITECTURE"
    echo "🎯 MODE: ${WORKER_BUNDLE_MODE:-remote}"
    echo "🎯 TARGET: ${WORKER_BUNDLE_TARGET}"
    echo "🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄"
    echo ""
    
    if [[ "$WORKER_BUNDLE_MODE" == "local" ]]; then
        local WORKER_BUNDLE_SOURCE="/service-manager/worker-bundled"
        
        log_info "🏠 LOCAL MODE: Copying bundled worker from build to runtime location"
        log_info "📁 Source: $WORKER_BUNDLE_SOURCE"
        log_info "📁 Target: $WORKER_BUNDLE_TARGET"
        
        if [[ -d "$WORKER_BUNDLE_SOURCE" ]]; then
            mkdir -p "$WORKER_BUNDLE_TARGET"
            cp -r "$WORKER_BUNDLE_SOURCE"/* "$WORKER_BUNDLE_TARGET/"
            chmod +x "$WORKER_BUNDLE_TARGET"/*.js 2>/dev/null || true
            
            echo ""
            echo "✅✅✅ LOCAL WORKER BUNDLE DEPLOYED SUCCESSFULLY ✅✅✅"
            echo "📦 Bundle copied to: $WORKER_BUNDLE_TARGET"
            echo "🔧 All workers will copy from this shared location"
            echo ""
            
            # Show what was deployed
            log_info "📋 Deployed bundle contents:"
            ls -la "$WORKER_BUNDLE_TARGET" 2>/dev/null || true
        else
            echo ""
            echo "❌❌❌ LOCAL WORKER BUNDLE SOURCE NOT FOUND ❌❌❌"
            echo "🔍 Expected: $WORKER_BUNDLE_SOURCE"
            echo "📂 Available directories in /service-manager/:"
            ls -la /service-manager/ || true
            echo ""
        fi
    else
        log_info "☁️  REMOTE MODE: Downloading worker bundle during entrypoint setup"
        log_info "📁 Download target: $WORKER_BUNDLE_TARGET"
        log_info "🌐 Download URL: ${WORKER_DOWNLOAD_URL:-https://github.com/stakeordie/emp-job-queue/releases/latest/download/emp-job-queue-worker.tar.gz}"
        
        echo ""
        echo "📥📥📥 DOWNLOADING WORKER BUNDLE TO SHARED LOCATION 📥📥📥"
        echo ""
        
        if download_and_extract_worker_bundle "$WORKER_BUNDLE_TARGET"; then
            echo ""
            echo "✅✅✅ REMOTE WORKER BUNDLE DOWNLOADED SUCCESSFULLY ✅✅✅"
            echo "📦 Bundle extracted to: $WORKER_BUNDLE_TARGET"
            echo "🔧 All workers will copy from this shared location"
            echo ""
            
            # Show what was downloaded
            log_info "📋 Downloaded bundle contents:"
            ls -la "$WORKER_BUNDLE_TARGET" 2>/dev/null || true
        else
            echo ""
            echo "❌❌❌ REMOTE WORKER BUNDLE DOWNLOAD FAILED ❌❌❌"
            echo "🌐 URL: ${WORKER_DOWNLOAD_URL:-https://github.com/stakeordie/emp-job-queue/releases/latest/download/emp-job-queue-worker.tar.gz}"
            echo "🔄 FALLING BACK TO LOCAL BUNDLE AS BACKUP"
            echo ""
            
            # Fallback: try to use local bundle if available
            local WORKER_BUNDLE_SOURCE="/service-manager/worker-bundled"
            if [[ -d "$WORKER_BUNDLE_SOURCE" ]]; then
                log_info "🏠 FALLBACK: Using local worker bundle as backup"
                log_info "📁 Source: $WORKER_BUNDLE_SOURCE"
                log_info "📁 Target: $WORKER_BUNDLE_TARGET"
                
                mkdir -p "$WORKER_BUNDLE_TARGET"
                cp -r "$WORKER_BUNDLE_SOURCE"/* "$WORKER_BUNDLE_TARGET/"
                chmod +x "$WORKER_BUNDLE_TARGET"/*.js 2>/dev/null || true
                
                echo ""
                echo "✅✅✅ FALLBACK TO LOCAL BUNDLE SUCCESSFUL ✅✅✅"
                echo "📦 Local bundle copied to: $WORKER_BUNDLE_TARGET"
                echo "🔧 All workers will copy from this shared location"
                echo ""
                
                # Show what was deployed
                log_info "📋 Fallback bundle contents:"
                ls -la "$WORKER_BUNDLE_TARGET" 2>/dev/null || true
            else
                echo ""
                echo "❌❌❌ NO LOCAL BUNDLE AVAILABLE FOR FALLBACK ❌❌❌"
                echo "🔍 Checked: $WORKER_BUNDLE_SOURCE"
                echo "⚠️  Workers will attempt individual downloads as last resort"
                echo ""
            fi
        fi
    fi
}

# =====================================================
# System Services Setup (Ollama, etc.)
# =====================================================
setup_system_services() {
    log_section "System Services Setup"

    # Parse workers to see what system services we need
    local workers="${WORKERS:-}"
    log_info "🔍 Checking workers for system service requirements: $workers"

    # Check if we need Ollama for ollama workers
    if [[ "$workers" =~ ollama ]]; then
        log_info "🦙 Ollama worker detected - setting up Ollama service"

        # Check if ollama is already installed
        if command -v ollama >/dev/null 2>&1; then
            log_info "✅ Ollama is already installed"
        else
            log_info "📦 Installing Ollama..."
            echo "🌐 EXECUTING: curl -fsSL https://ollama.ai/install.sh | sh"
            if curl -fsSL https://ollama.ai/install.sh | sh; then
                log_info "✅ Ollama installation completed"
            else
                log_warn "⚠️ Ollama installation failed, but continuing..."
                return 0  # Don't fail the entire startup
            fi
        fi

        # Start ollama serve in background if not already running
        if ! pgrep -f "ollama serve" >/dev/null 2>&1; then
            log_info "🚀 Starting Ollama daemon..."
            echo "🆔 EXECUTING: ollama serve (background)"

            # Set environment for ollama
            export OLLAMA_HOST="${OLLAMA_HOST:-0.0.0.0:11434}"
            export OLLAMA_MODELS="${OLLAMA_MODELS:-/workspace/models}"
            mkdir -p /workspace/models

            # Start in background
            nohup ollama serve > /workspace/logs/ollama.log 2>&1 &
            local ollama_pid=$!
            log_info "🆔 Ollama daemon started with PID: $ollama_pid"

            # Wait a few seconds for startup
            sleep 3
        else
            log_info "✅ Ollama daemon is already running"
        fi

        # Always check if daemon is responding and download models if needed
        log_info "⏳ Waiting for Ollama to become ready..."
        local max_retries=10
        local retry=0
        while [ $retry -lt $max_retries ]; do
            if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
                log_info "✅ Ollama daemon is responding"
                break
            else
                log_info "⏳ Ollama not ready yet, waiting... ($((retry+1))/$max_retries)"
                sleep 2
                ((retry++))
            fi
        done

        if [ $retry -ge $max_retries ]; then
            log_warn "⚠️ Ollama daemon not responding after $max_retries retries, but continuing..."
        else
            # Download default models if specified
            local default_models="${OLLAMA_DEFAULT_MODELS:-}"
            if [[ -n "$default_models" ]]; then
                log_info "📥 Downloading default models: $default_models"
                echo "📥 Models to download: $default_models"
                IFS=',' read -ra MODELS <<< "$default_models"
                for model in "${MODELS[@]}"; do
                    model=$(echo "$model" | xargs)  # trim whitespace
                    if [[ -n "$model" ]]; then
                        echo "📥 EXECUTING: ollama pull $model"
                        if timeout 300 ollama pull "$model"; then
                            echo "✅ Model downloaded: $model"
                            log_info "✅ Model downloaded: $model"
                        else
                            echo "❌ Failed to download model: $model"
                            log_warn "⚠️ Failed to download model: $model (but continuing...)"
                        fi
                    fi
                done
            else
                log_info "ℹ️ No default models specified in OLLAMA_DEFAULT_MODELS"
            fi
        fi
    fi

    # Add other system services here as needed (Redis, PostgreSQL, etc.)
    # if [[ "$workers" =~ redis ]]; then
    #     setup_redis_service
    # fi

    log_info "🎉 System services setup completed"
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
    
    # Check worker bundle at unified location
    if [[ ! -d "/workspace/worker-bundled" ]]; then
        log_warn "⚠️  Worker bundle not found at /workspace/worker-bundled"
        log_info "🔍 This will be populated by:"
        log_info "   • LOCAL MODE: Copy from /service-manager/worker-bundled"
        log_info "   • REMOTE MODE: Download during worker startup"
    else
        echo ""
        echo "🎉🎉🎉 WORKER BUNDLE SUCCESSFULLY DEPLOYED 🎉🎉🎉"
        echo "📍 Location: /workspace/worker-bundled"
        echo "✅ Redis workers can now access bundled worker code"
        echo ""
    fi
    
    log_info "✅ Machine health checks completed"
}

# =====================================================
# Debug Hook Function
# =====================================================
debug_hook() {
    local hook_name="$1"
    local env_var="DEBUG_HOOK_${hook_name^^}"  # Convert to uppercase
    
    if [[ -n "${!env_var:-}" ]]; then
        log_info "🐛 [DEBUG-HOOK] ${hook_name}: PAUSED INDEFINITELY"
        log_info "🐛 [DEBUG-HOOK] ============================================"
        log_info "🐛 [DEBUG-HOOK] TO CONTINUE:"
        log_info "🐛 [DEBUG-HOOK] 1. SSH into container: docker exec -it <container> bash"
        log_info "🐛 [DEBUG-HOOK] 2. Inspect state, files, environment variables"
        log_info "🐛 [DEBUG-HOOK] 3. To resume: unset ${env_var}"
        log_info "🐛 [DEBUG-HOOK] 4. Or restart container without the debug env var"
        log_info "🐛 [DEBUG-HOOK] ============================================"
        
        # Sleep indefinitely until env var is unset
        while [[ -n "${!env_var:-}" ]]; do
            sleep 1
        done
        
        log_info "🐛 [DEBUG-HOOK] ${hook_name}: Resuming - environment variable cleared"
    fi
}

# =====================================================
# Machine Application Start (Override)
# =====================================================
start_application() {
    log_section "Starting EMP Machine - Base Profile"
    
    debug_hook "BEFORE_CD_SERVICE_MANAGER"
    
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
    
    debug_hook "BEFORE_NODE_START"
    
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
    setup_system_services || log_warn "System services setup had warnings but continuing..."
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