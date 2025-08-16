#!/bin/bash
# Reset environment to clean state without relaunching container

echo "🧹 Resetting environment to clean state..."

# Kill any running processes
pkill -f "node" || true
pkill -f "pm2" || true
pm2 kill || true

# Clean application directories
rm -rf /service-manager/* || true
rm -rf /workspace/ComfyUI || true
rm -rf /var/log/pm2/* || true

# Clear PM2 processes and logs
pm2 delete all || true
pm2 flush || true

# Reset environment variables to defaults
unset HUB_REDIS_URL WORKER_ID WORKER_CONNECTORS

# Clear npm cache
npm cache clean --force || true

# Clear any temp files
rm -rf /tmp/npm-* /tmp/node-* || true

echo "✅ Environment reset complete. Ready for fresh build_replication.sh run"