#!/bin/bash
# Test script for Calyptia Fluentd setup
# This script builds, starts the service, and tests log ingestion

set -e  # Exit on any error

echo "🚀 Testing Calyptia Fluentd Setup"
echo "================================="

# Build and start the service
echo "📦 Building and starting Fluentd..."
docker-compose up -d --build

# Wait for service to be ready
echo "⏳ Waiting for Fluentd to start..."
sleep 10

# Check if container is running
if ! docker-compose ps | grep -q "Up"; then
    echo "❌ Container failed to start"
    docker-compose logs
    exit 1
fi

echo "✅ Container is running"

# Test the HTTP endpoint
echo "📨 Sending test log to Fluentd..."
curl -X POST http://localhost:8888/test \
     -H "Content-Type: application/json" \
     -d '{
       "timestamp": "'$(date -Iseconds)'",
       "level": "info", 
       "message": "Test log from Calyptia Fluentd setup",
       "source": "test-script",
       "env": "local-dev"
     }'

echo ""
echo "✅ Test log sent successfully"

# Check monitoring endpoint
echo "🔍 Checking Fluentd status..."
curl -s http://localhost:24220/api/plugins.json | head -c 200
echo ""

# Show recent logs
echo "📋 Recent Fluentd logs:"
docker-compose logs --tail=20 fluentd

echo ""
echo "🎉 Test complete! Check Dash0 for your test log entry."
echo ""
echo "Next steps:"
echo "- Visit your Dash0 dashboard to see the test log"
echo "- Use 'docker-compose logs -f' to watch real-time logs"
echo "- Use 'docker-compose down' to stop the service"