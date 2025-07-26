#!/bin/bash

echo "🔍 Monitoring health check activity in real-time..."
echo "Looking for:"
echo "  - Simulation jobs missing complete_job messages"
echo "  - Health check triggers (WebSocket inactivity >30s)"
echo "  - Health check recovery actions"
echo ""

# Monitor both machine logs and API logs for health check activity
docker logs basic-machine-local -f 2>&1 | grep -E "(health|recover|inactivity|complete_job|WebSocket.*activity)" --line-buffered --color=always &
DOCKER_PID=$!

# Also monitor API logs if available
if [ -f "logs/api.log" ]; then
    tail -f logs/api.log | grep -E "(health|recover|inactivity|complete_job)" --line-buffered --color=always &
    API_PID=$!
fi

echo "Press Ctrl+C to stop monitoring..."

# Handle cleanup
trap 'echo "Stopping monitoring..."; kill $DOCKER_PID 2>/dev/null; kill $API_PID 2>/dev/null; exit 0' INT

wait