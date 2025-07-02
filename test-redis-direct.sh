#!/bin/bash
# Test script for Redis-Direct Architecture
# Tests the complete system: API + Workers + Redis

set -e

echo "🚀 Testing Redis-Direct Architecture"
echo "Using: docker compose (v2)"
echo "====================================="

# Check if API is running
echo "📡 Checking API health..."
curl -s http://localhost:3001/health | jq '.status'

# Submit test jobs
echo "📝 Submitting test jobs..."

JOB1=$(curl -s -X POST http://localhost:3001/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "service_required": "simulation",
    "priority": 100,
    "payload": {
      "action": "fast_test",
      "duration": 2000
    }
  }' | jq -r '.job_id')

echo "✅ Submitted job 1: $JOB1"

JOB2=$(curl -s -X POST http://localhost:3001/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "service_required": "simulation", 
    "priority": 50,
    "payload": {
      "action": "medium_test",
      "duration": 5000
    }
  }' | jq -r '.job_id')

echo "✅ Submitted job 2: $JOB2"

JOB3=$(curl -s -X POST http://localhost:3001/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "service_required": "simulation",
    "priority": 75,
    "payload": {
      "action": "priority_test", 
      "duration": 3000
    }
  }' | jq -r '.job_id')

echo "✅ Submitted job 3: $JOB3"

# Wait a moment for jobs to start
sleep 2

# Check job statuses
echo ""
echo "📊 Job Statuses:"
echo "=================="

for job in $JOB1 $JOB2 $JOB3; do
  status=$(curl -s http://localhost:3001/api/jobs/$job | jq -r '.job.status')
  worker=$(curl -s http://localhost:3001/api/jobs/$job | jq -r '.job.worker_id // "unassigned"')
  echo "Job $job: $status (worker: $worker)"
done

# Check Redis directly
echo ""
echo "🔍 Redis Status:"
echo "================"

echo "Pending jobs: $(redis-cli zcard jobs:pending)"
echo "Active workers: $(redis-cli scard workers:active)"
echo "Worker heartbeats: $(redis-cli keys 'worker:*:heartbeat' | wc -l)"

# Show progress stream for one job
echo ""
echo "📈 Streaming progress for job $JOB1..."
echo "======================================"

timeout 10s curl -N http://localhost:3001/api/jobs/$JOB1/progress || echo "Progress stream completed or timed out"

echo ""
echo "🎉 Test completed!"
echo ""
echo "💡 Tips:"
echo "  - View all jobs: curl http://localhost:3001/api/jobs | jq"
echo "  - Monitor Redis: docker exec -it emp-redis redis-cli monitor"
echo "  - Check worker logs: docker logs emp-worker1"
echo "  - Redis UI: http://localhost:8081 (if using 'full' profile)"