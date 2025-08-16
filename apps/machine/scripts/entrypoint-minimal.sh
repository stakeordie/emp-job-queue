#!/bin/bash

# Minimal entrypoint for external API connectors (OpenAI, etc.)
# Skips ComfyUI, GPU detection, and heavy AI frameworks

set -euo pipefail

# Source shared functions
source /scripts/entrypoint-base.sh

# Override heavy functions with minimal versions
start_comfyui() {
    log_info "🚫 ComfyUI disabled in minimal image"
}

start_stable_diffusion_webui() {
    log_info "🚫 Stable Diffusion WebUI disabled in minimal image"
}

start_ollama() {
    log_info "🚫 Ollama disabled in minimal image"
}

detect_hardware() {
    log_info "🖥️  Hardware detection: CPU-only minimal machine"
    
    # Minimal hardware detection for external API workers
    cat > /workspace/hardware-info.json << EOF
{
  "cpu": {
    "cores": $(nproc),
    "model": "CPU-Only"
  },
  "memory": {
    "total_gb": $(awk '/MemTotal/ {printf "%.1f", $2/1024/1024}' /proc/meminfo)
  },
  "gpu": {
    "hasGpu": false,
    "gpuCount": 0,
    "gpuModel": "none",
    "gpuMemoryGB": 0
  },
  "disk": {
    "available_gb": $(df /workspace | awk 'NR==2 {printf "%.1f", $4/1024/1024}')
  },
  "detected_at": "$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")",
  "machine_type": "minimal"
}
EOF
    
    log_info "✅ Minimal hardware detection completed"
}

# Main execution
main() {
    log_section "🚀 Starting Minimal EMP Machine"
    
    # Show build info
    show_build_info
    
    # Start telemetry services  
    start_otel_collector
    start_fluent_bit
    
    # Minimal hardware detection
    detect_hardware
    
    # Start service manager with minimal configuration
    start_service_manager
    
    log_info "🎉 Minimal machine startup completed successfully"
    log_info "📊 Services: OTel Collector, Fluent Bit, Service Manager"
    log_info "🎯 Optimized for: External API connectors (OpenAI, Anthropic, etc.)"
    
    # Wait for service manager
    wait
}

# Execute main function
main "$@"