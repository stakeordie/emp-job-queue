#!/bin/bash
set -euo pipefail

# =====================================================
# EMP Machine Entrypoint - ComfyUI Profile
# =====================================================
# Purpose: Full ComfyUI setup with GPU support
# Profile: comfyui (local ComfyUI instances)
# =====================================================

# Color codes for better logging
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
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

log_debug() {
    echo -e "${PURPLE}[DEBUG]${NC} $1"
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
    log_section "ComfyUI Profile - Environment Setup"
    
    # Core environment variables
    export PM2_HOME=/workspace/.pm2
    export SERVICE_MANAGER_PATH=/service-manager
    export WORKSPACE_PATH=/workspace
    export NODE_ENV=${NODE_ENV:-production}
    export LOG_LEVEL=${LOG_LEVEL:-info}
    
    # ComfyUI specific environment
    export COMFYUI_PATH=/workspace/ComfyUI
    export PYTHONPATH="${COMFYUI_PATH}:${PYTHONPATH:-}"
    
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
    log_info "ComfyUI Profile Configuration:"
    log_info "  - NODE_ENV: ${NODE_ENV}"
    log_info "  - LOG_LEVEL: ${LOG_LEVEL}"
    log_info "  - WORKER_BUNDLE_MODE: ${WORKER_BUNDLE_MODE:-not set}"
    log_info "  - WORKERS: ${WORKERS:-not set}"
    log_info "  - MACHINE_ID: ${MACHINE_ID:-not set}"
    log_info "  - HUB_REDIS_URL: ${HUB_REDIS_URL:-not set}"
    log_info "  - COMFYUI_RESOURCE_BINDING: ${COMFYUI_RESOURCE_BINDING:-not set}"
    log_info "  - COMFYUI_PATH: ${COMFYUI_PATH}"
}

# =====================================================
# GPU Detection and Setup
# =====================================================
setup_gpu_environment() {
    log_section "GPU Detection and Setup"
    
    # Check if we're in mock GPU mode
    if [ "${COMFYUI_RESOURCE_BINDING:-}" = "mock_gpu" ]; then
        log_info "🧪 Mock GPU mode enabled - no real GPU detection needed"
        export GPU_COUNT=${MACHINE_NUM_GPUS:-1}
        log_info "Mock GPU count: $GPU_COUNT"
        return 0
    fi
    
    # Real GPU detection
    log_info "Detecting available GPUs..."
    
    # Check for nvidia-smi
    if command -v nvidia-smi &> /dev/null; then
        local gpu_count=$(nvidia-smi --list-gpus | wc -l)
        log_info "🎮 Detected $gpu_count NVIDIA GPU(s):"
        nvidia-smi --list-gpus | while read -r line; do
            log_info "  - $line"
        done
        export GPU_COUNT=$gpu_count
    else
        log_warn "⚠️ nvidia-smi not found - assuming CPU-only mode"
        export GPU_COUNT=0
    fi
    
    # Check CUDA availability
    if command -v nvcc &> /dev/null; then
        local cuda_version=$(nvcc --version | grep -oP 'release \K[0-9]+\.[0-9]+')
        log_info "🔧 CUDA version: $cuda_version"
    else
        log_warn "⚠️ CUDA compiler not found"
    fi
    
    # Check PyTorch CUDA support
    python -c "import torch; print(f'PyTorch CUDA available: {torch.cuda.is_available()}'); print(f'PyTorch CUDA devices: {torch.cuda.device_count()}')" 2>/dev/null || {
        log_warn "Could not check PyTorch CUDA support"
    }
}

# =====================================================
# ComfyUI Directories Setup
# =====================================================
setup_directories() {
    log_section "Setting up ComfyUI Directories"
    
    # Create ComfyUI-specific directories
    local dirs=(
        "/workspace/logs"
        "/workspace/models"
        "/workspace/models/checkpoints"
        "/workspace/models/loras"
        "/workspace/models/embeddings"
        "/workspace/models/vae"
        "/workspace/models/upscale_models"
        "/workspace/models/controlnet"
        "/workspace/ComfyUI/user"
        "/workspace/ComfyUI/logs"
        "/workspace/tmp"
        "/workspace/.pm2"
        "/workspace/configs"
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
    chmod -R 755 /workspace/models 2>/dev/null || true
    
    log_info "ComfyUI directories setup complete"
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
                log_info "✅ Worker bundle successfully copied"
                ls -la /workspace/worker-bundled/ | head -5
            else
                log_error "❌ Worker bundle copy failed - redis-direct-worker.js not found"
                return 1
            fi
        else
            log_error "❌ Worker bundle directory not found at /service-manager/worker-bundled"
            return 1
        fi
    else
        log_info "Remote mode: Workers will be downloaded as needed"
    fi
}

# =====================================================
# ComfyUI Setup and Validation
# =====================================================
setup_comfyui() {
    log_section "ComfyUI Setup and Validation"
    
    # Verify ComfyUI installation
    if [ ! -d "/workspace/ComfyUI" ]; then
        log_error "❌ ComfyUI directory not found at /workspace/ComfyUI"
        return 1
    fi
    
    if [ ! -f "/workspace/ComfyUI/main.py" ]; then
        log_error "❌ ComfyUI main.py not found"
        return 1
    fi
    
    log_info "✅ ComfyUI installation verified"
    
    cd /workspace/ComfyUI
    
    # Check Python requirements
    log_info "Checking ComfyUI Python requirements..."
    
    # Check if key packages are installed
    local required_packages=("torch" "torchvision" "torchaudio" "Pillow" "numpy")
    local missing_packages=()
    
    for package in "${required_packages[@]}"; do
        if ! python -c "import $package" 2>/dev/null; then
            missing_packages+=("$package")
        fi
    done
    
    if [ ${#missing_packages[@]} -eq 0 ]; then
        log_info "✅ All required Python packages are installed"
    else
        log_warn "⚠️ Missing packages: ${missing_packages[*]}"
        log_info "Installing missing ComfyUI requirements..."
        
        # Only install if requirements file exists and packages are missing
        if [ -f "requirements.txt" ]; then
            pip install -r requirements.txt --no-cache-dir || {
                log_error "❌ Failed to install ComfyUI requirements"
                return 1
            }
            log_info "✅ ComfyUI requirements installed"
        else
            log_error "❌ requirements.txt not found"
            return 1
        fi
    fi
    
    # Check custom nodes
    if [ -d "/workspace/ComfyUI/custom_nodes" ]; then
        local node_count=$(find /workspace/ComfyUI/custom_nodes -mindepth 1 -maxdepth 1 -type d | wc -l)
        log_info "📦 Found $node_count custom node directories"
        
        # List some custom nodes for debugging
        find /workspace/ComfyUI/custom_nodes -mindepth 1 -maxdepth 1 -type d | head -5 | while read -r node_dir; do
            log_debug "  - $(basename "$node_dir")"
        done
    else
        log_warn "⚠️ No custom_nodes directory found"
    fi
    
    cd /service-manager
}

# =====================================================
# Custom Nodes Environment Setup
# =====================================================
setup_custom_nodes_env() {
    log_section "Custom Nodes Environment Setup"
    
    # Create runtime .env files for custom nodes if needed
    if [ -f "/service-manager/scripts/create-env-files.mjs" ]; then
        log_info "Creating runtime .env files for custom nodes..."
        node /service-manager/scripts/create-env-files.mjs || {
            log_warn "⚠️ Custom nodes env setup failed or not needed"
        }
    else
        log_info "No custom nodes env setup script found"
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
        log_error "❌ package.json not found in /service-manager"
        return 1
    fi
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ] || [ "${FORCE_NPM_INSTALL:-false}" = "true" ]; then
        log_info "Installing service manager dependencies..."
        pnpm install --prod --no-frozen-lockfile || {
            log_error "❌ Failed to install service manager dependencies"
            return 1
        }
    else
        log_info "✅ Service manager dependencies already installed"
    fi
    
    # Verify main entry point exists
    if [ ! -f "src/index-pm2.js" ]; then
        log_error "❌ Main entry point src/index-pm2.js not found"
        return 1
    fi
    
    log_info "✅ Service manager setup complete"
}

# =====================================================
# Health Check (ComfyUI Specific)
# =====================================================
perform_health_check() {
    log_section "Performing ComfyUI Health Check"
    
    # Check Redis connectivity
    if [ -n "${HUB_REDIS_URL:-}" ]; then
        log_info "Checking Redis connectivity..."
        
        if [[ "$HUB_REDIS_URL" =~ redis://([^:]+:)?([^@]+@)?([^:]+):([0-9]+) ]]; then
            local redis_host="${BASH_REMATCH[3]}"
            local redis_port="${BASH_REMATCH[4]}"
            
            if timeout 2 bash -c "echo > /dev/tcp/$redis_host/$redis_port" 2>/dev/null; then
                log_info "✅ Redis is accessible at $redis_host:$redis_port"
            else
                log_warn "⚠️ Cannot reach Redis at $redis_host:$redis_port - will retry during startup"
            fi
        fi
    fi
    
    # Check disk space (ComfyUI needs more space for models)
    local available_space=$(df /workspace | awk 'NR==2 {print $4}')
    local required_space=2097152  # 2GB in KB for ComfyUI
    
    if [ "$available_space" -lt "$required_space" ]; then
        log_warn "⚠️ Low disk space: $(echo $available_space | awk '{print $1/1024/1024}')GB available"
        log_warn "ComfyUI may have issues downloading models"
    else
        log_info "✅ Disk space OK: $(echo $available_space | awk '{print $1/1024/1024}')GB available"
    fi
    
    # Check Python environment
    log_info "Python version: $(python --version 2>&1)"
    log_info "Node.js version: $(node --version)"
    log_info "PM2 version: $(pm2 --version 2>&1 || echo 'PM2 not found')"
    
    # Check PyTorch installation
    python -c "
import torch
print(f'PyTorch version: {torch.__version__}')
print(f'CUDA available: {torch.cuda.is_available()}')
if torch.cuda.is_available():
    print(f'CUDA devices: {torch.cuda.device_count()}')
    for i in range(torch.cuda.device_count()):
        print(f'  GPU {i}: {torch.cuda.get_device_name(i)}')
" 2>/dev/null || log_warn "Could not check PyTorch installation"
}

# =====================================================
# Start Application
# =====================================================
start_application() {
    log_section "Starting EMP Machine - ComfyUI Profile"
    
    cd /service-manager
    
    # Display ComfyUI profile banner
    echo -e "${GREEN}"
    echo "  ███████╗███╗   ███╗██████╗      ██████╗ ██████╗ ███╗   ███╗███████╗██╗   ██╗██╗   ██╗██╗"
    echo "  ██╔════╝████╗ ████║██╔══██╗    ██╔════╝██╔═══██╗████╗ ████║██╔════╝╚██╗ ██╔╝██║   ██║██║"
    echo "  █████╗  ██╔████╔██║██████╔╝    ██║     ██║   ██║██╔████╔██║█████╗   ╚████╔╝ ██║   ██║██║"
    echo "  ██╔══╝  ██║╚██╔╝██║██╔═══╝     ██║     ██║   ██║██║╚██╔╝██║██╔══╝    ╚██╔╝  ██║   ██║██║"
    echo "  ███████╗██║ ╚═╝ ██║██║         ╚██████╗╚██████╔╝██║ ╚═╝ ██║██║        ██║   ╚██████╔╝██║"
    echo "  ╚══════╝╚═╝     ╚═╝╚═╝          ╚═════╝ ╚═════╝ ╚═╝     ╚═╝╚═╝        ╚═╝    ╚═════╝ ╚═╝"
    echo -e "${NC}"
    echo -e "${BLUE}                     GPU-Accelerated AI Image Generation${NC}"
    
    log_info "Starting main application..."
    log_info "Machine ID: ${MACHINE_ID:-unknown}"
    log_info "Workers: ${WORKERS:-none}"
    log_info "Profile: ComfyUI (Local GPU)"
    log_info "GPU Count: ${GPU_COUNT:-unknown}"
    
    # Start the main application
    exec node src/index-pm2.js
}

# =====================================================
# Error Handler
# =====================================================
handle_error() {
    local exit_code=$?
    local line_number=$1
    
    log_error "ComfyUI profile startup failed at line $line_number with exit code $exit_code"
    log_error "Last command: ${BASH_COMMAND:-unknown}"
    log_error "Working directory: $(pwd)"
    
    # Log ComfyUI specific debugging info
    if [ -d "/workspace/ComfyUI" ]; then
        log_error "ComfyUI directory exists: $(ls -la /workspace/ComfyUI | head -3)"
    fi
    
    if [ -f "/workspace/logs/comfyui-gpu0-error.log" ]; then
        log_error "Recent ComfyUI errors:"
        tail -n 10 /workspace/logs/comfyui-gpu0-error.log 2>/dev/null || true
    fi
    
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
    log_section "EMP Machine Starting - ComfyUI Profile"
    log_info "Entrypoint script version: 2.0.0-comfyui"
    log_info "Date: $(date '+%Y-%m-%d %H:%M:%S')"
    
    # Execute setup steps (comprehensive for ComfyUI)
    setup_environment || exit 1
    setup_gpu_environment || exit 1
    setup_directories || exit 1
    setup_worker_bundle || exit 1
    setup_comfyui || exit 1
    setup_custom_nodes_env || log_warn "Custom nodes env setup had issues but continuing..."
    setup_service_manager || exit 1
    perform_health_check || log_warn "Health check had warnings but continuing..."
    
    # Start the application
    start_application
}

# Run main function
main "$@"