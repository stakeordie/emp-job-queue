#!/bin/bash
set -e

echo "🚀 Starting EMP Telemetry System..."

# Start OpenTelemetry Collector in background
echo "📡 Starting OpenTelemetry Collector..."
/usr/local/bin/otelcol-contrib --config=/telemetry-collector/otel-config.yaml &
OTEL_PID=$!

# Wait a moment for OTEL Collector to start
sleep 2

# Check if OTEL Collector is running
if ! kill -0 $OTEL_PID 2>/dev/null; then
    echo "❌ OpenTelemetry Collector failed to start"
    exit 1
fi

echo "✅ OpenTelemetry Collector running (PID: $OTEL_PID)"

# Start the Redis-to-OTLP Bridge
echo "🌉 Starting Redis-to-OTLP Bridge..."
node dist/main-otel.js &
BRIDGE_PID=$!

# Function to handle shutdown
shutdown() {
    echo "🛑 Shutting down telemetry system..."
    if kill -0 $BRIDGE_PID 2>/dev/null; then
        echo "Stopping bridge..."
        kill $BRIDGE_PID
    fi
    if kill -0 $OTEL_PID 2>/dev/null; then
        echo "Stopping OTEL collector..."
        kill $OTEL_PID
    fi
    wait
    echo "✅ Telemetry system stopped"
    exit 0
}

# Handle signals
trap shutdown SIGTERM SIGINT

echo "✅ EMP Telemetry System running!"
echo "📊 Architecture: EventClient → Redis Stream → Bridge → OTEL Collector → Dash0"
echo "🔗 OTEL Collector: http://localhost:4318 (HTTP) | localhost:4317 (gRPC)"
echo "🏥 Health check: http://localhost:9090/health"

# Wait for processes
wait $BRIDGE_PID $OTEL_PID