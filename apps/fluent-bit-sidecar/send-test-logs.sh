#!/bin/bash
# Script to send test logs to Fluent Bit every 5 seconds

echo "🚀 Starting to send logs to Fluent Bit on http://localhost:9880"
echo "Press Ctrl+C to stop"

counter=1

while true; do
    timestamp=$(date -Iseconds)
    
    # Send a test log message
    curl -X POST http://localhost:9880/ \
         -H "Content-Type: application/json" \
         -d "{
           \"timestamp\": \"${timestamp}\",
           \"level\": \"info\",
           \"message\": \"Test log message #${counter} from external script\",
           \"job_id\": \"job-${counter}\",
           \"worker_process\": \"test-worker-script\",
           \"source\": \"external-script\"
         }" || echo "❌ Failed to send log #${counter}"
    
    echo "📨 Sent log #${counter} at ${timestamp}"
    
    ((counter++))
    sleep 5
done