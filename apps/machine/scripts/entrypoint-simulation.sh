#!/bin/bash
set -euo pipefail

# =====================================================
# EMP Machine Entrypoint - Simulation Profile
# =====================================================
# Purpose: Testing and simulation environment setup
# Profile: simulation (testing, development, CI/CD)
# =====================================================

# Color codes for better logging
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
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
    echo -e "${CYAN}[DEBUG]${NC} $1"
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
    log_section "Simulation Profile - Environment Setup"
    
    # Core environment variables
    export PM2_HOME=/workspace/.pm2
    export SERVICE_MANAGER_PATH=/service-manager
    export WORKSPACE_PATH=/workspace
    export NODE_ENV=${NODE_ENV:-development}  # Default to development for simulation
    export LOG_LEVEL=${LOG_LEVEL:-debug}      # More verbose logging for testing
    
    # Simulation specific environment
    export SIMULATION_MODE=true
    export TEST_MODE=${TEST_MODE:-true}
    
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
    log_info "Simulation Profile Configuration:"
    log_info "  - NODE_ENV: ${NODE_ENV}"
    log_info "  - LOG_LEVEL: ${LOG_LEVEL}"
    log_info "  - TEST_MODE: ${TEST_MODE}"
    log_info "  - SIMULATION_MODE: ${SIMULATION_MODE}"
    log_info "  - WORKER_BUNDLE_MODE: ${WORKER_BUNDLE_MODE:-not set}"
    log_info "  - WORKERS: ${WORKERS:-not set}"
    log_info "  - MACHINE_ID: ${MACHINE_ID:-not set}"
    log_info "  - HUB_REDIS_URL: ${HUB_REDIS_URL:-not set}"
}

# =====================================================
# Simulation Directories Setup
# =====================================================
setup_directories() {
    log_section "Setting up Simulation Directories"
    
    # Create simulation-specific directories
    local dirs=(
        "/workspace/logs"
        "/workspace/logs/simulation"
        "/workspace/tmp"
        "/workspace/tmp/test-data"
        "/workspace/tmp/simulation-results"
        "/workspace/.pm2"
        "/workspace/configs"
        "/workspace/test-workspace"
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
    chmod -R 755 /workspace/tmp 2>/dev/null || true
    
    log_info "Simulation directories setup complete"
}

# =====================================================
# Worker Bundle Setup
# =====================================================
setup_worker_bundle() {
    log_section "Setting up Worker Bundle"
    
    local bundle_mode="${WORKER_BUNDLE_MODE:-local}"  # Default to local for simulation
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
# Simulation Environment Setup
# =====================================================
setup_simulation_environment() {
    log_section "Setting up Simulation Environment"
    
    # Create test configuration files
    log_info "Creating simulation configuration..."
    
    # Create a simple test job configuration
    cat > /workspace/configs/test-jobs.json << EOF
{
  "test_jobs": [
    {
      "id": "sim-job-1",
      "service_required": "simulation",
      "priority": 100,
      "payload": {
        "task": "simple-test",
        "duration": 5,
        "success_rate": 0.95
      },
      "requirements": {
        "hardware": {
          "cpu_cores": 1
        }
      }
    },
    {
      "id": "sim-job-2", 
      "service_required": "simulation",
      "priority": 75,
      "payload": {
        "task": "load-test",
        "duration": 10,
        "success_rate": 0.9
      },
      "requirements": {
        "hardware": {
          "cpu_cores": 2
        }
      }
    }
  ]
}
EOF
    
    log_info "✅ Test job configuration created"
    
    # Create simulation metrics file
    cat > /workspace/configs/simulation-metrics.json << EOF
{
  "metrics": {
    "startup_time": 0,
    "jobs_processed": 0,
    "jobs_failed": 0,
    "average_job_duration": 0,
    "last_health_check": null
  },
  "test_results": []
}
EOF
    
    log_info "✅ Simulation metrics file created"
    
    # Set up mock data if needed
    if [ "${CREATE_MOCK_DATA:-false}" = "true" ]; then
        log_info "Creating mock test data..."
        
        for i in {1..10}; do
            echo "Mock data entry $i: $(date)" >> /workspace/tmp/test-data/mock-data-$i.txt
        done
        
        log_info "✅ Mock test data created"
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
    
    # Install dependencies if needed (include dev dependencies for testing)
    if [ ! -d "node_modules" ] || [ "${FORCE_NPM_INSTALL:-false}" = "true" ]; then
        log_info "Installing service manager dependencies (including dev dependencies for simulation)..."
        pnpm install --no-frozen-lockfile || {
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
# Health Check (Simulation Specific)
# =====================================================
perform_health_check() {
    log_section "Performing Simulation Health Check"
    
    # Check Redis connectivity
    if [ -n "${HUB_REDIS_URL:-}" ]; then
        log_info "Checking Redis connectivity..."
        
        if [[ "$HUB_REDIS_URL" =~ redis://([^:]+:)?([^@]+@)?([^:]+):([0-9]+) ]]; then
            local redis_host="${BASH_REMATCH[3]}"
            local redis_port="${BASH_REMATCH[4]}"
            
            if timeout 2 bash -c "echo > /dev/tcp/$redis_host/$redis_port" 2>/dev/null; then
                log_info "✅ Redis is accessible at $redis_host:$redis_port"
            else
                log_warn "⚠️ Cannot reach Redis at $redis_host:$redis_port"
                log_info "🧪 In simulation mode, this may be expected for isolated testing"
            fi
        fi
    else
        log_info "🧪 No Redis URL configured - simulation may run in standalone mode"
    fi
    
    # Check disk space (minimal requirements for simulation)
    local available_space=$(df /workspace | awk 'NR==2 {print $4}')
    local required_space=262144  # 256MB in KB (minimal for simulation)
    
    if [ "$available_space" -lt "$required_space" ]; then
        log_warn "⚠️ Low disk space: $(echo $available_space | awk '{print $1/1024}')MB available"
    else
        log_info "✅ Disk space OK: $(echo $available_space | awk '{print $1/1024}')MB available"
    fi
    
    # Check essential tools
    log_info "Node.js version: $(node --version)"
    log_info "PM2 version: $(pm2 --version 2>&1 || echo 'PM2 not found')"
    
    # Check if Python is available (for some simulation tasks)
    if command -v python &> /dev/null; then
        log_info "Python version: $(python --version 2>&1)"
    else
        log_debug "Python not available (not required for basic simulation)"
    fi
    
    # Test basic Node.js functionality
    log_info "Testing Node.js basic functionality..."
    node -e "console.log('✅ Node.js test passed')" || {
        log_error "❌ Node.js test failed"
        return 1
    }
    
    # Validate simulation configuration files
    if [ -f "/workspace/configs/test-jobs.json" ]; then
        log_info "✅ Test job configuration found"
        node -e "
        try {
            const config = require('/workspace/configs/test-jobs.json');
            console.log('✅ Test job configuration is valid JSON');
            console.log(\`Found \${config.test_jobs.length} test jobs\`);
        } catch (e) {
            console.error('❌ Invalid test job configuration:', e.message);
            process.exit(1);
        }
        " || return 1
    fi
}

# =====================================================
# Start Application
# =====================================================
start_application() {
    log_section "Starting EMP Machine - Simulation Profile"
    
    cd /service-manager
    
    # Display simulation profile banner
    echo -e "${GREEN}"
    echo "  ███████╗███╗   ███╗██████╗     ███████╗██╗███╗   ███╗██╗   ██╗██╗      █████╗ ████████╗██╗ ██████╗ ███╗   ██╗"
    echo "  ██╔════╝████╗ ████║██╔══██╗    ██╔════╝██║████╗ ████║██║   ██║██║     ██╔══██╗╚══██╔══╝██║██╔═══██╗████╗  ██║"
    echo "  █████╗  ██╔████╔██║██████╔╝    ███████╗██║██╔████╔██║██║   ██║██║     ███████║   ██║   ██║██║   ██║██╔██╗ ██║"
    echo "  ██╔══╝  ██║╚██╔╝██║██╔═══╝     ╚════██║██║██║╚██╔╝██║██║   ██║██║     ██╔══██║   ██║   ██║██║   ██║██║╚██╗██║"
    echo "  ███████╗██║ ╚═╝ ██║██║         ███████║██║██║ ╚═╝ ██║╚██████╔╝███████╗██║  ██║   ██║   ██║╚██████╔╝██║ ╚████║"
    echo "  ╚══════╝╚═╝     ╚═╝╚═╝         ╚══════╝╚═╝╚═╝     ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝   ╚═╝   ╚═╝ ╚═════╝ ╚═╝  ╚═══╝"
    echo -e "${NC}"
    echo -e "${CYAN}                              Testing & Development Environment${NC}"
    
    log_info "Starting main application..."
    log_info "Machine ID: ${MACHINE_ID:-simulation-$(date +%s)}"
    log_info "Workers: ${WORKERS:-simulation:1}"
    log_info "Profile: Simulation (Testing)"
    log_info "Test Mode: ${TEST_MODE}"
    
    # Record startup time for metrics
    echo "{\"startup_time\": $(date +%s), \"status\": \"started\"}" > /workspace/tmp/simulation-startup.json
    
    # Start the main application
    exec node src/index-pm2.js
}

# =====================================================
# Error Handler
# =====================================================
handle_error() {
    local exit_code=$?
    local line_number=$1
    
    log_error "Simulation profile startup failed at line $line_number with exit code $exit_code"
    log_error "Last command: ${BASH_COMMAND:-unknown}"
    log_error "Working directory: $(pwd)"
    
    # Record failure for simulation metrics
    echo "{\"startup_time\": $(date +%s), \"status\": \"failed\", \"exit_code\": $exit_code, \"line\": $line_number}" > /workspace/tmp/simulation-startup.json
    
    # Log simulation specific debugging info
    if [ -d "/workspace/logs/simulation" ]; then
        log_error "Recent simulation logs:"
        find /workspace/logs/simulation -name "*.log" -type f -exec tail -n 5 {} \; 2>/dev/null || true
    fi
    
    exit $exit_code
}

# =====================================================
# Signal Handlers
# =====================================================
handle_sigterm() {
    log_warn "Received SIGTERM signal, initiating graceful shutdown..."
    
    # Record shutdown for simulation metrics
    echo "{\"shutdown_time\": $(date +%s), \"signal\": \"SIGTERM\"}" >> /workspace/tmp/simulation-shutdown.json
    
    exit 0
}

handle_sigint() {
    log_warn "Received SIGINT signal, initiating graceful shutdown..."
    
    # Record shutdown for simulation metrics
    echo "{\"shutdown_time\": $(date +%s), \"signal\": \"SIGINT\"}" >> /workspace/tmp/simulation-shutdown.json
    
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
    log_section "EMP Machine Starting - Simulation Profile"
    log_info "Entrypoint script version: 2.0.0-simulation"
    log_info "Date: $(date '+%Y-%m-%d %H:%M:%S')"
    
    # Execute setup steps (testing-focused for simulation)
    setup_environment || exit 1
    setup_directories || exit 1
    setup_worker_bundle || exit 1
    setup_simulation_environment || exit 1
    setup_service_manager || exit 1
    perform_health_check || log_warn "Health check had warnings but continuing..."
    
    # Start the application
    start_application
}

# Run main function
main "$@"