#!/bin/bash
set -e

echo "🚀 Starting EMP Telemetry Collector..."

# Function to handle shutdown
shutdown() {
    echo "🛑 Shutting down telemetry collector..."
    if kill -0 $COLLECTOR_PID 2>/dev/null; then
        echo "Stopping collector..."
        kill $COLLECTOR_PID
    fi
    wait
    echo "✅ Telemetry collector stopped"
    exit 0
}

# Handle signals
trap shutdown SIGTERM SIGINT

# Start the telemetry collector
echo "📡 Starting collector (Redis → OpenTelemetry SDK → Dash0)..."
node dist/index.js &
COLLECTOR_PID=$!

# Wait a moment for collector to start
sleep 2

# Check if collector is running
if ! kill -0 $COLLECTOR_PID 2>/dev/null; then
    echo "❌ Telemetry collector failed to start"
    exit 1
fi

echo "✅ Telemetry Collector running (PID: $COLLECTOR_PID)"
echo "📊 Architecture: Redis Stream → Collector (OTLP SDK) → Dash0"
echo "🏥 Health check: http://localhost:${HEALTH_PORT:-3334}/health"

# Wait for process
wait $COLLECTOR_PID
