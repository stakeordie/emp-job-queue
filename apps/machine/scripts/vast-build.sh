#!/bin/bash
# Build development version of existing profile for VAST.ai
set -e

PROFILE="${1}"
if [ -z "$PROFILE" ]; then
    echo "❌ Error: Profile required"
    echo "Usage: pnpm vast:build comfyui-production"
    exit 1
fi

echo "🚀 Building VAST.ai development version of profile: $PROFILE"

# Check if base image already exists
BASE_IMAGE="emprops/machine:$PROFILE"
if docker image inspect "$BASE_IMAGE" >/dev/null 2>&1; then
    echo "✅ Base image $BASE_IMAGE already exists, skipping rebuild"
else
    echo "📦 Building base profile..."
    # Go to root directory to use machine:build command
    cd ../..
    pnpm machine:build "$PROFILE"
    cd apps/machine
fi

# Get the built image name (assuming it follows your pattern)
BASE_IMAGE="emprops/machine:$PROFILE"
DEV_IMAGE="emprops/deploydev:$PROFILE"

echo "🔄 Converting to development image..."

# Create development version using multi-stage build approach
# Use --platform to ensure we build for the right architecture
docker build --platform linux/amd64 -f- -t "$DEV_IMAGE" . <<EOF
# Use your existing built profile as base
FROM $BASE_IMAGE AS base

# Add development tools
RUN apt-get update && apt-get install -y git vim nano htop curl wget jq

# Create development tools inline (no external file dependencies)
RUN cat > /usr/local/bin/manual-startup.sh << 'SCRIPT_EOF'
#!/bin/bash
# Manual startup script for development
echo "🚀 EMP Machine Manual Startup"
echo "Environment: \${NODE_ENV:-unknown}"
echo "Machine ID: \${MACHINE_ID:-unknown}"
echo "Workers: \${WORKERS:-unknown}"
echo ""
echo "Available commands:"
echo "  start-machine     - Start the full machine (same as production)"
echo "  start-pm2-only    - Start PM2 services only"
echo "  start-comfyui     - Start ComfyUI installer only"
echo "  debug-env         - Show all environment variables"
echo "  debug-gpu         - Show GPU information"
echo "  shell             - Just give me a shell"
echo ""
read -p "What would you like to do? " choice
case \$choice in
  start-machine)
    echo "🚀 Starting full machine..."
    cd /service-manager && node src/index-pm2.js
    ;;
  start-pm2-only)
    echo "🚀 Starting PM2 services only..."
    cd /service-manager && node -e "
      import('./src/lib/pm2-manager.cjs').then(pm2 => {
        console.log('PM2 manager loaded');
        // Add PM2 startup logic here
      });
    "
    ;;
  start-comfyui)
    echo "🚀 Starting ComfyUI installer..."
    cd /service-manager && node -e "
      import('./src/services/comfyui-installer.js').then(module => {
        const installer = new module.ComfyUIInstallerService();
        installer.onStart();
      });
    "
    ;;
  debug-env)
    echo "🔍 Environment variables:"
    env | sort
    ;;
  debug-gpu)
    echo "🔍 GPU information:"
    nvidia-smi || echo "No nvidia-smi available"
    python3 /service-manager/scripts/gpu-info.py || echo "No GPU info script"
    ;;
  shell|*)
    echo "🐚 Dropping to shell..."
    exec bash
    ;;
esac
SCRIPT_EOF

RUN cat > /usr/local/bin/debug-redis.sh << 'SCRIPT_EOF'
#!/bin/bash
# Debug Redis connection
echo "🔍 Testing Redis connection..."
echo "HUB_REDIS_URL: \${HUB_REDIS_URL:-not set}"
if [ -n "\${HUB_REDIS_URL}" ]; then
  echo "Attempting to connect..."
  # Simple Redis ping test
  node -e "
    const url = process.env.HUB_REDIS_URL;
    console.log('Testing Redis at:', url);
    // Add actual Redis test here
  "
else
  echo "❌ HUB_REDIS_URL not set"
fi
SCRIPT_EOF

RUN chmod +x /usr/local/bin/*.sh

# Override entrypoint for development - go straight to manual startup
CMD ["/usr/local/bin/manual-startup.sh"]
EOF

echo "✅ Development image built: $DEV_IMAGE"