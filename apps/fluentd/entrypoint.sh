#!/bin/bash
# Entrypoint script for Calyptia Fluentd container

set -e

echo "🚀 Starting Calyptia Fluentd..."

# Verify installation
if [ ! -f "/usr/sbin/calyptia-fluentd" ]; then
    echo "❌ Calyptia Fluentd binary not found at /usr/sbin/calyptia-fluentd"
    exit 1
fi

# Generate config from template at runtime (keeps credentials secure)
echo "🔧 Generating Fluentd configuration at runtime..."
echo "  - Environment: ${ENV:-dev}"
echo "  - Dash0 Dataset: ${DASH0_DATASET:-unknown}"
echo "  - Dash0 Endpoint: ${DASH0_LOGS_ENDPOINT:-unknown}"
echo "  - Template: /etc/calyptia-fluentd/calyptia-fluentd.conf.template"
echo "  - Config: /etc/calyptia-fluentd/calyptia-fluentd.conf"

if [ -f "/etc/calyptia-fluentd/calyptia-fluentd.conf.template" ]; then
    envsubst < /etc/calyptia-fluentd/calyptia-fluentd.conf.template > /etc/calyptia-fluentd/calyptia-fluentd.conf
    echo "✅ Fluentd configuration generated successfully"
else
    echo "❌ Fluentd template not found at /etc/calyptia-fluentd/calyptia-fluentd.conf.template"
    exit 1
fi

# Verify generated config file
if [ ! -f "/etc/calyptia-fluentd/calyptia-fluentd.conf" ]; then
    echo "❌ Generated config file not found at /etc/calyptia-fluentd/calyptia-fluentd.conf"
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