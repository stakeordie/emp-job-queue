#!/bin/bash
# Build script for EmProps machine Docker layers
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to log with timestamp and color
log() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[$(date '+%H:%M:%S')] ✅ $1${NC}"
}

log_warn() {
    echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}[$(date '+%H:%M:%S')] ❌ $1${NC}"
}

# Build function with layer caching
build_machine() {
    local machine_type=$1
    local dockerfile_path=$2
    local build_args=$3
    
    log "Building ${machine_type} machine..."
    
    docker build \
        -t "emp-${machine_type}-machine:latest" \
        -f "${dockerfile_path}" \
        ${build_args} \
        .
    
    if [ $? -eq 0 ]; then
        log_success "${machine_type} machine built successfully"
        return 0
    else
        log_error "Failed to build ${machine_type} machine"
        return 1
    fi
}

# Parse command line arguments
MACHINE_TYPE=${1:-"all"}
BUILD_ARGS=""

# Add build cache busting if requested
if [ "$2" = "no-cache" ]; then
    BUILD_ARGS="--no-cache"
    log_warn "Building without cache"
fi

log "Starting EmProps machine build process..."
log "Machine type: ${MACHINE_TYPE}"

# Build base machine first (required by others)
if [ "$MACHINE_TYPE" = "all" ] || [ "$MACHINE_TYPE" = "base" ]; then
    log "========================================="
    log "Building BASE MACHINE (foundation layer)"
    log "========================================="
    
    if build_machine "base" "apps/machine-base/Dockerfile.base" "$BUILD_ARGS"; then
        log_success "Base machine layer ready for extension"
    else
        log_error "Base machine build failed - cannot continue"
        exit 1
    fi
fi

# Build GPU machine (extends base)
if [ "$MACHINE_TYPE" = "all" ] || [ "$MACHINE_TYPE" = "gpu" ]; then
    log "========================================="
    log "Building GPU MACHINE (extends base)"
    log "========================================="
    
    # Check if base image exists
    if ! docker image inspect emp-base-machine:latest > /dev/null 2>&1; then
        log_warn "Base machine image not found, building it first..."
        if ! build_machine "base" "apps/machine-base/Dockerfile.base" "$BUILD_ARGS"; then
            log_error "Failed to build base machine for GPU extension"
            exit 1
        fi
    fi
    
    if build_machine "gpu" "apps/machine-gpu/Dockerfile" "$BUILD_ARGS"; then
        log_success "GPU machine ready for ComfyUI workloads"
    else
        log_error "GPU machine build failed"
        exit 1
    fi
fi

# Build API machine (extends base)
if [ "$MACHINE_TYPE" = "all" ] || [ "$MACHINE_TYPE" = "api" ]; then
    log "========================================="
    log "Building API MACHINE (extends base)"
    log "========================================="
    
    # Check if base image exists
    if ! docker image inspect emp-base-machine:latest > /dev/null 2>&1; then
        log_warn "Base machine image not found, building it first..."
        if ! build_machine "base" "apps/machine-base/Dockerfile.base" "$BUILD_ARGS"; then
            log_error "Failed to build base machine for API extension"
            exit 1
        fi
    fi
    
    if build_machine "api" "apps/machine-api/Dockerfile" "$BUILD_ARGS"; then
        log_success "API machine ready for external API workloads"
    else
        log_error "API machine build failed"
        exit 1
    fi
fi

log "========================================="
log "BUILD SUMMARY"
log "========================================="

# Check what images were built
log "Checking built images..."
docker images | grep "emp-.*-machine" | while read line; do
    log_success "Built: $line"
done

# Show layer information
log "Docker layer information:"
if docker image inspect emp-base-machine:latest > /dev/null 2>&1; then
    BASE_SIZE=$(docker image inspect emp-base-machine:latest --format='{{.Size}}' | numfmt --to=iec)
    log "Base machine size: ${BASE_SIZE}"
fi

if docker image inspect emp-gpu-machine:latest > /dev/null 2>&1; then
    GPU_SIZE=$(docker image inspect emp-gpu-machine:latest --format='{{.Size}}' | numfmt --to=iec)
    log "GPU machine size: ${GPU_SIZE}"
fi

if docker image inspect emp-api-machine:latest > /dev/null 2>&1; then
    API_SIZE=$(docker image inspect emp-api-machine:latest --format='{{.Size}}' | numfmt --to=iec)
    log "API machine size: ${API_SIZE}"
fi

log_success "EmProps machine build process completed!"

# Usage information
if [ "$MACHINE_TYPE" = "all" ]; then
    log ""
    log "Next steps:"
    log "  1. Test GPU machine: docker run --gpus all -p 9090:9090 emp-gpu-machine:latest"
    log "  2. Test API machine: docker run -p 9090:9090 -e OPENAI_API_KEY=your_key emp-api-machine:latest"
    log "  3. Check health: curl http://localhost:9090/health"
fi