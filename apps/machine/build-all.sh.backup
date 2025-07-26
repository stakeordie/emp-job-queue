#!/bin/bash

# Unified Machine Build Script
# Builds all machine types with optimal Docker layer caching

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REGISTRY=${REGISTRY:-""}
TAG=${TAG:-"latest"}
PLATFORM=${PLATFORM:-"linux/amd64"}
BUILD_ARGS=${BUILD_ARGS:-""}

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to build a Docker image
build_image() {
    local dockerfile=$1
    local image_name=$2
    local build_context=${3:-"."}
    
    print_status "Building $image_name from $dockerfile..."
    
    # Build command with platform and caching
    local build_cmd="docker build"
    build_cmd="$build_cmd --platform $PLATFORM"
    build_cmd="$build_cmd --file $dockerfile"
    build_cmd="$build_cmd --tag $image_name:$TAG"
    
    # Add registry prefix if specified
    if [ -n "$REGISTRY" ]; then
        build_cmd="$build_cmd --tag $REGISTRY/$image_name:$TAG"
    fi
    
    # Add build args if specified
    if [ -n "$BUILD_ARGS" ]; then
        build_cmd="$build_cmd $BUILD_ARGS"
    fi
    
    # Add build context
    build_cmd="$build_cmd $build_context"
    
    # Execute build
    if eval $build_cmd; then
        print_success "Successfully built $image_name:$TAG"
        return 0
    else
        print_error "Failed to build $image_name:$TAG"
        return 1
    fi
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS] [TARGETS]"
    echo ""
    echo "Build unified machine Docker images with optimal layer caching"
    echo ""
    echo "TARGETS:"
    echo "  base     Build base machine image (foundation layer)"
    echo "  gpu      Build GPU machine image (extends base)"
    echo "  api      Build API machine image (extends base)"
    echo "  hybrid   Build hybrid machine image (extends base)"
    echo "  all      Build all images (default)"
    echo ""
    echo "OPTIONS:"
    echo "  --registry PREFIX    Docker registry prefix (e.g., myregistry.com/)"
    echo "  --tag TAG           Image tag (default: latest)"
    echo "  --platform PLATFORM Target platform (default: linux/amd64)"
    echo "  --no-cache          Disable Docker cache"
    echo "  --push              Push images to registry after building"
    echo "  --clean             Remove existing images before building"
    echo "  --help              Show this help message"
    echo ""
    echo "ENVIRONMENT VARIABLES:"
    echo "  REGISTRY            Docker registry prefix"
    echo "  TAG                 Image tag"
    echo "  PLATFORM            Target platform"
    echo "  BUILD_ARGS          Additional Docker build arguments"
    echo ""
    echo "EXAMPLES:"
    echo "  $0                                    # Build all images"
    echo "  $0 base gpu                          # Build only base and GPU images"
    echo "  $0 --registry myregistry.com/ --tag v1.0.0 all"
    echo "  $0 --no-cache --push hybrid         # Build hybrid with no cache and push"
}

# Function to clean existing images
clean_images() {
    print_status "Cleaning existing images..."
    
    local images=("machine-base" "machine-gpu" "machine-api" "machine-hybrid")
    
    for image in "${images[@]}"; do
        if docker image inspect "$image:$TAG" >/dev/null 2>&1; then
            print_status "Removing existing image: $image:$TAG"
            docker rmi "$image:$TAG" || print_warning "Failed to remove $image:$TAG"
        fi
        
        if [ -n "$REGISTRY" ] && docker image inspect "$REGISTRY/$image:$TAG" >/dev/null 2>&1; then
            print_status "Removing existing registry image: $REGISTRY/$image:$TAG"
            docker rmi "$REGISTRY/$image:$TAG" || print_warning "Failed to remove $REGISTRY/$image:$TAG"
        fi
    done
}

# Function to push images
push_images() {
    if [ -z "$REGISTRY" ]; then
        print_error "Cannot push images: REGISTRY not specified"
        return 1
    fi
    
    print_status "Pushing images to $REGISTRY..."
    
    local images=("machine-base" "machine-gpu" "machine-api" "machine-hybrid")
    
    for image in "${images[@]}"; do
        if docker image inspect "$REGISTRY/$image:$TAG" >/dev/null 2>&1; then
            print_status "Pushing $REGISTRY/$image:$TAG..."
            if docker push "$REGISTRY/$image:$TAG"; then
                print_success "Successfully pushed $REGISTRY/$image:$TAG"
            else
                print_error "Failed to push $REGISTRY/$image:$TAG"
            fi
        else
            print_warning "Image $REGISTRY/$image:$TAG not found, skipping push"
        fi
    done
}

# Function to build base image
build_base() {
    print_status "Building base machine image..."
    build_image "Dockerfile.base" "machine-base"
}

# Function to build GPU image
build_gpu() {
    print_status "Building GPU machine image..."
    build_image "Dockerfile.gpu" "machine-gpu"
}

# Function to build API image
build_api() {
    print_status "Building API machine image..."
    build_image "Dockerfile.api" "machine-api"
}

# Function to build hybrid image
build_hybrid() {
    print_status "Building hybrid machine image..."
    build_image "Dockerfile.hybrid" "machine-hybrid"
}

# Main execution
main() {
    local targets=()
    local clean_before=false
    local push_after=false
    local no_cache=false
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --registry)
                REGISTRY="$2"
                shift 2
                ;;
            --tag)
                TAG="$2"
                shift 2
                ;;
            --platform)
                PLATFORM="$2"
                shift 2
                ;;
            --no-cache)
                BUILD_ARGS="$BUILD_ARGS --no-cache"
                no_cache=true
                shift
                ;;
            --push)
                push_after=true
                shift
                ;;
            --clean)
                clean_before=true
                shift
                ;;
            --help)
                show_usage
                exit 0
                ;;
            base|gpu|api|hybrid|all)
                targets+=("$1")
                shift
                ;;
            *)
                print_error "Unknown argument: $1"
                show_usage
                exit 1
                ;;
        esac
    done
    
    # Default to building all if no targets specified
    if [ ${#targets[@]} -eq 0 ]; then
        targets=("all")
    fi
    
    # Show configuration
    print_status "Build configuration:"
    echo "  Registry: ${REGISTRY:-"(none)"}"
    echo "  Tag: $TAG"
    echo "  Platform: $PLATFORM"
    echo "  Targets: ${targets[*]}"
    echo "  No cache: $no_cache"
    echo "  Clean before: $clean_before"
    echo "  Push after: $push_after"
    echo ""
    
    # Clean existing images if requested
    if [ "$clean_before" = true ]; then
        clean_images
        echo ""
    fi
    
    # Build targets
    local build_base_needed=false
    local build_gpu_needed=false
    local build_api_needed=false
    local build_hybrid_needed=false
    
    # Determine what needs to be built
    for target in "${targets[@]}"; do
        case $target in
            all)
                build_base_needed=true
                build_gpu_needed=true
                build_api_needed=true
                build_hybrid_needed=true
                ;;
            base)
                build_base_needed=true
                ;;
            gpu)
                build_base_needed=true
                build_gpu_needed=true
                ;;
            api)
                build_base_needed=true
                build_api_needed=true
                ;;
            hybrid)
                build_base_needed=true
                build_hybrid_needed=true
                ;;
        esac
    done
    
    # Build in dependency order
    local failed=false
    
    if [ "$build_base_needed" = true ]; then
        if ! build_base; then
            failed=true
        fi
        echo ""
    fi
    
    if [ "$build_gpu_needed" = true ] && [ "$failed" = false ]; then
        if ! build_gpu; then
            failed=true
        fi
        echo ""
    fi
    
    if [ "$build_api_needed" = true ] && [ "$failed" = false ]; then
        if ! build_api; then
            failed=true
        fi
        echo ""
    fi
    
    if [ "$build_hybrid_needed" = true ] && [ "$failed" = false ]; then
        if ! build_hybrid; then
            failed=true
        fi
        echo ""
    fi
    
    # Push images if requested and build succeeded
    if [ "$push_after" = true ] && [ "$failed" = false ]; then
        push_images
        echo ""
    fi
    
    # Final status
    if [ "$failed" = true ]; then
        print_error "Build failed!"
        exit 1
    else
        print_success "Build completed successfully!"
        
        # Show built images
        print_status "Built images:"
        docker images | grep -E "machine-(base|gpu|api|hybrid)" | head -10
    fi
}

# Check if Docker is available
if ! command -v docker >&1 >/dev/null; then
    print_error "Docker is not installed or not in PATH"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "Dockerfile.base" ]; then
    print_error "Dockerfile.base not found. Please run this script from the machine directory."
    exit 1
fi

# Run main function
main "$@"