#!/bin/bash

# Test script for capability-based job matching
# Submits jobs with different service requirements to test worker matching

API_URL="${API_URL:-http://localhost:3001}"

echo "🧪 Testing Capability-Based Job Matching"
echo "======================================="
echo "API URL: $API_URL"
echo ""

# Submit a basic simulation job (any worker can handle)
echo "1. Submitting basic simulation job..."
curl -X POST "$API_URL/api/jobs" \
  -H "Content-Type: application/json" \
  -d '{
    "job_type": "simulation",
    "service_required": "simulation",
    "priority": 50,
    "payload": {
      "test": "basic-simulation",
      "description": "Should be picked up by any worker"
    }
  }' | jq .

echo ""
sleep 1

# Submit ComfyUI-specific job
echo "2. Submitting ComfyUI simulation job..."
curl -X POST "$API_URL/api/jobs" \
  -H "Content-Type: application/json" \
  -d '{
    "job_type": "comfyui-sim",
    "service_required": "comfyui-sim",
    "priority": 50,
    "payload": {
      "test": "comfyui-specific",
      "description": "Should only be picked up by ComfyUI-capable workers"
    },
    "requirements": {
      "service_type": "comfyui-sim",
      "hardware": {
        "gpu_memory_gb": 12
      }
    }
  }' | jq .

echo ""
sleep 1

# Submit A1111-specific job
echo "3. Submitting A1111 simulation job..."
curl -X POST "$API_URL/api/jobs" \
  -H "Content-Type: application/json" \
  -d '{
    "job_type": "a1111-sim",
    "service_required": "a1111-sim",
    "priority": 50,
    "payload": {
      "test": "a1111-specific",
      "description": "Should only be picked up by A1111-capable workers"
    },
    "requirements": {
      "service_type": "a1111-sim"
    }
  }' | jq .

echo ""
sleep 1

# Submit high GPU memory job
echo "4. Submitting high GPU memory job..."
curl -X POST "$API_URL/api/jobs" \
  -H "Content-Type: application/json" \
  -d '{
    "job_type": "comfyui-sim",
    "service_required": "comfyui-sim",
    "priority": 60,
    "payload": {
      "test": "high-gpu-memory",
      "description": "Requires 20GB+ GPU memory"
    },
    "requirements": {
      "service_type": "comfyui-sim",
      "hardware": {
        "gpu_memory_gb": 20
      }
    }
  }' | jq .

echo ""
sleep 1

# Submit workflow jobs with different priorities
echo "5. Submitting workflow jobs..."
WORKFLOW_ID="workflow-$(date +%s)"
WORKFLOW_TIME=$(date +%s)000

for i in 1 2 3; do
  echo "   - Step $i of workflow $WORKFLOW_ID"
  curl -X POST "$API_URL/api/jobs" \
    -H "Content-Type: application/json" \
    -d "{
      \"job_type\": \"simulation\",
      \"service_required\": \"simulation\",
      \"priority\": 40,
      \"workflow_id\": \"$WORKFLOW_ID\",
      \"workflow_priority\": 100,
      \"workflow_datetime\": $WORKFLOW_TIME,
      \"step_number\": $i,
      \"payload\": {
        \"test\": \"workflow-step\",
        \"workflow_id\": \"$WORKFLOW_ID\",
        \"step\": $i,
        \"description\": \"Workflow job step $i\"
      }
    }" | jq .
  echo ""
  sleep 0.5
done

echo ""
echo "✅ Test jobs submitted!"
echo ""
echo "Monitor the workers to see capability-based matching in action:"
echo "  - worker-sim-only: Should only process 'simulation' jobs"
echo "  - worker-comfy-sim: Should process 'comfyui-sim' jobs"
echo "  - worker-a1111-sim: Should process 'a1111-sim' jobs"
echo "  - worker-multi-sim: Should process any job type"
echo "  - worker-low-gpu: Should skip high GPU memory jobs"
echo ""
echo "View logs: docker compose -f docker-compose.redis-direct.yml --profile capability-test logs -f"