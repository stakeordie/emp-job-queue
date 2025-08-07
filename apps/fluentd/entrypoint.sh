#!/bin/bash
# Entrypoint script for Calyptia Fluentd container

set -e

echo "🚀 Starting Calyptia Fluentd..."

# Verify installation
if [ ! -f "/usr/sbin/calyptia-fluentd" ]; then
    echo "❌ Calyptia Fluentd binary not found at /usr/sbin/calyptia-fluentd"
    exit 1
fi

# Verify config file
if [ ! -f "/etc/calyptia-fluentd/calyptia-fluentd.conf" ]; then
    echo "❌ Config file not found at /etc/calyptia-fluentd/calyptia-fluentd.conf"
    exit 1
fi

# Show version info
echo "📋 Calyptia Fluentd version:"
/usr/sbin/calyptia-fluentd --version

# Test config syntax
echo "🔍 Testing configuration..."
/usr/sbin/calyptia-fluentd --dry-run -c /etc/calyptia-fluentd/calyptia-fluentd.conf

echo "✅ Configuration is valid!"
echo "🚀 Starting Calyptia Fluentd with custom config..."

# Run Calyptia Fluentd
exec /usr/sbin/calyptia-fluentd -c /etc/calyptia-fluentd/calyptia-fluentd.conf