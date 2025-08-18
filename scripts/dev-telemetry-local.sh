#!/bin/bash

# Local Telemetry Development Script
set -e

echo "🔬 Setting up local telemetry development environment..."

# Change to project root
cd "$(dirname "$0")/.."

# Environment setup for local development
export NODE_ENV=development
export TELEMETRY_ENV=local-dev
export SERVICE_NAME=emp-api
export SERVICE_VERSION=dev
export API_BASE_ID=local-api
export MACHINE_ID=local-dev-machine

# Telemetry endpoints (local testing)
export TELEMETRY_OTEL_ENABLED=true
export TELEMETRY_OTEL_COLLECTOR_ENDPOINT=http://localhost:4318/v1/traces

# Fluentd local setup
export TELEMETRY_LOGGING_ENABLED=true
export FLUENTD_HOST=localhost
export FLUENTD_PORT=24224  # Forward protocol port
export FLUENTD_SECURE=false

# Dash0 (use real endpoints for testing)
export DASH0_API_KEY=${DASH0_API_KEY:-dummy-key-for-local-testing}
export DASH0_DATASET=local-development
export DASH0_LOGS_ENDPOINT=https://ingress.us-west-2.aws.dash0.com/logs/json

# Create local log directory
mkdir -p ./logs/local-dev

echo "📋 Environment configured:"
echo "  - Service: $SERVICE_NAME v$SERVICE_VERSION"
echo "  - Environment: $TELEMETRY_ENV"
echo "  - Log Directory: ./logs/local-dev"
echo "  - Fluentd: $FLUENTD_HOST:$FLUENTD_PORT"
echo "  - OTEL Collector: $TELEMETRY_OTEL_COLLECTOR_ENDPOINT"

# Function to cleanup on exit
cleanup() {
    echo "🧹 Cleaning up local telemetry processes..."
    pkill -f "fluent-bit" || true
    pkill -f "fluentd" || true
    pkill -f "otelcol" || true
    sleep 2
    echo "✅ Cleanup complete"
}

# Set up cleanup trap
trap cleanup EXIT

# Start Fluentd locally (if available)
start_fluentd() {
    echo "🔍 Checking for local Fluentd..."
    if command -v fluentd >/dev/null 2>&1; then
        echo "✅ Found Fluentd, starting with Forward input..."
        
        # Create minimal Fluentd config for local testing
        cat > ./logs/local-dev/fluentd-local.conf << EOF
<source>
  @type forward
  port 24224
  bind 0.0.0.0
</source>

<match **>
  @type stdout
  <format>
    @type json
  </format>
</match>
EOF
        
        echo "🚀 Starting Fluentd with Forward protocol on port 24224..."
        fluentd -c ./logs/local-dev/fluentd-local.conf &
        FLUENTD_PID=$!
        echo "✅ Fluentd started (PID: $FLUENTD_PID)"
        sleep 2
    else
        echo "⚠️  Fluentd not available locally, will test without it"
        echo "💡 To install: gem install fluentd"
    fi
}

# Start OTEL Collector locally (if available)
start_otel_collector() {
    echo "🔍 Checking for local OTEL Collector..."
    if command -v otelcol >/dev/null 2>&1 || command -v otelcol-contrib >/dev/null 2>&1; then
        echo "✅ Found OTEL Collector, starting..."
        
        # Create minimal OTEL config for local testing
        cat > ./logs/local-dev/otel-local.yaml << EOF
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:

exporters:
  logging:
    loglevel: debug

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [logging]
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [logging]
EOF
        
        echo "🚀 Starting OTEL Collector on ports 4317/4318..."
        (otelcol-contrib --config=./logs/local-dev/otel-local.yaml || otelcol --config=./logs/local-dev/otel-local.yaml) &
        OTEL_PID=$!
        echo "✅ OTEL Collector started (PID: $OTEL_PID)"
        sleep 2
    else
        echo "⚠️  OTEL Collector not available locally"
        echo "💡 To install: brew install otelcol-contrib"
    fi
}

# Build and test telemetry package
test_telemetry() {
    echo "🔧 Building telemetry package..."
    cd packages/telemetry
    pnpm build
    
    echo "🧪 Testing telemetry client..."
    node -e "
        import { createTelemetryClient } from './dist/client.js';
        
        async function test() {
            console.log('🚀 Creating telemetry client...');
            const client = createTelemetryClient('api');
            
            console.log('🔍 Testing telemetry pipeline...');
            const health = await client.startup({
                testConnections: true,
                logConfiguration: true,
                sendStartupPing: true
            });
            
            console.log('📊 Pipeline Health:', health);
            
            // Write some test logs
            await client.log.info('🧪 LOCAL TEST: Telemetry client working locally!', {
                test_type: 'local_development',
                timestamp: new Date().toISOString()
            });
            
            // Send test metric
            await client.otel.counter('local.test.counter', 1, { test: 'local_dev' });
            
            console.log('✅ Local telemetry test completed');
        }
        
        test().catch(console.error);
    "
    
    cd ../..
}

# Main execution
echo "🚀 Starting local telemetry services..."

# Start services
start_fluentd
start_otel_collector

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 3

# Test the telemetry package
test_telemetry

echo "🎉 Local telemetry development environment ready!"
echo ""
echo "📋 Services running:"
echo "  - Fluentd (Forward): localhost:24224"
echo "  - OTEL Collector: localhost:4317 (gRPC), localhost:4318 (HTTP)"
echo ""
echo "💡 You can now develop and test telemetry changes locally"
echo "🔍 Logs are in: ./logs/local-dev/"
echo ""
echo "Press Ctrl+C to stop all services and cleanup"

# Keep script running
wait