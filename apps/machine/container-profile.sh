#!/bin/bash
# Container Profile Script - Shows build-time and run-time information
# Usage: ./container-profile.sh or npm run profile

set -e

echo "🐳 =================================================="
echo "🐳 CONTAINER PROFILE INFORMATION"
echo "🐳 =================================================="
echo ""

# Build-time Information (set during docker build)
echo "📦 BUILD INFORMATION:"
echo "   Build Timestamp: ${BUILD_TIMESTAMP:-'Not set'}"
echo "   Build Version: ${BUILD_VERSION:-'Not set'}"
echo "   Git Commit: ${GIT_COMMIT:-'Not set'}"
echo "   Git Branch: ${GIT_BRANCH:-'Not set'}"
echo "   Build Environment: ${BUILD_ENV:-'Not set'}"
echo "   Node Version: ${NODE_VERSION:-$(node --version 2>/dev/null || echo 'N/A')}"
echo ""

# Run-time Information (set when container starts)
echo "🚀 RUNTIME INFORMATION:"
echo "   Container Start Time: ${CONTAINER_START_TIME:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
echo "   Current Time: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "   Uptime: $(uptime -p 2>/dev/null || echo 'N/A')"
echo "   Container ID: ${HOSTNAME}"
echo "   Machine ID: ${MACHINE_ID:-'Not set'}"
echo "   Worker ID: ${WORKER_ID:-'Not set'}"
echo ""

# Deployment Information
echo "🌐 DEPLOYMENT INFORMATION:"
echo "   Environment: ${NODE_ENV:-'Not set'}"
echo "   Platform: ${DEPLOYMENT_PLATFORM:-'Unknown'}"
echo "   Service Name: ${SERVICE_NAME:-'Unknown'}"
echo "   Instance Type: ${INSTANCE_TYPE:-'Unknown'}"
echo "   Redis URL: ${HUB_REDIS_URL:+[CONFIGURED]} ${HUB_REDIS_URL:-'Not configured'}" | sed 's/redis:\/\/[^@]*@/redis:\/\/***@/g'
echo ""

# Hardware Information
echo "🔧 HARDWARE INFORMATION:"
echo "   CPU Cores: $(nproc 2>/dev/null || echo 'N/A')"
echo "   Memory: $(free -h 2>/dev/null | grep '^Mem:' | awk '{print $2}' || echo 'N/A')"
echo "   GPU Mode: ${GPU_MODE:-'Not set'}"
echo "   GPU Count: ${NUM_GPUS:-'Not set'}"
if command -v nvidia-smi >/dev/null 2>&1; then
    echo "   GPU Info:"
    nvidia-smi --query-gpu=index,name,memory.total --format=csv,noheader,nounits 2>/dev/null | \
        sed 's/^/     GPU /' || echo "     nvidia-smi failed"
else
    echo "   GPU Info: nvidia-smi not available"
fi
echo ""

# Service Configuration
echo "⚙️  SERVICE CONFIGURATION:"
echo "   Worker Connectors: ${WORKER_CONNECTORS:-${WORKERS:-'Not set'}}"
echo "   ComfyUI Base Port: ${COMFYUI_BASE_PORT:-'Not set'}"
echo "   ComfyUI Port: ${COMFYUI_PORT:-'Not set'}"
echo "   Log Level: ${LOG_LEVEL:-'Not set'}"
echo "   Unified Machine Status: ${UNIFIED_MACHINE_STATUS:-'Not set'}"
echo ""

# PM2 Services (if running)
echo "📋 PM2 SERVICES:"
if command -v pm2 >/dev/null 2>&1; then
    pm2 jlist 2>/dev/null | jq -r '.[] | "   \(.name): \(.pm2_env.status) (PID: \(.pid // "N/A"))"' 2>/dev/null || \
    pm2 list --no-colors 2>/dev/null | grep -E "^\s*(id|│)" | head -10 || \
    echo "   PM2 services not accessible"
else
    echo "   PM2 not available"
fi
echo ""

# File System Information
echo "💾 FILESYSTEM INFORMATION:"
echo "   Working Directory: $(pwd)"
echo "   Workspace Usage: $(du -sh /workspace 2>/dev/null || echo 'N/A')"
echo "   Log Directory: $(ls -la /workspace/logs 2>/dev/null | wc -l || echo '0') files"
echo "   Available Space: $(df -h / 2>/dev/null | tail -1 | awk '{print $4}' || echo 'N/A')"
echo ""

# Network Information
echo "🌍 NETWORK INFORMATION:"
echo "   Hostname: $(hostname)"
echo "   IP Address: $(hostname -i 2>/dev/null || echo 'N/A')"
echo "   DNS: $(cat /etc/resolv.conf 2>/dev/null | grep nameserver | head -1 | awk '{print $2}' || echo 'N/A')"
echo ""

# Quick Health Check
echo "🏥 QUICK HEALTH CHECK:"
echo "   Redis Connection: $(timeout 5 redis-cli -u "${HUB_REDIS_URL}" ping 2>/dev/null || echo 'FAILED')"
echo "   Internet Access: $(timeout 5 curl -s https://api.github.com >/dev/null 2>&1 && echo 'OK' || echo 'FAILED')"
echo "   Disk Health: $(timeout 5 touch /tmp/health-test 2>/dev/null && rm /tmp/health-test 2>/dev/null && echo 'OK' || echo 'FAILED')"
echo ""

echo "🐳 =================================================="
echo "🐳 Profile generated at: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "🐳 =================================================="