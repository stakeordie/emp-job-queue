#!/bin/bash

# Basic Machine Port Testing Script
# Tests all exposed ports and their services

echo "🌐 Basic Machine Port Status Check"
echo "=================================="

# Function to test port with timeout
test_port() {
    local port=$1
    local service=$2
    local timeout=3
    
    if timeout $timeout bash -c "echo >/dev/tcp/localhost/$port" 2>/dev/null; then
        echo "  ✅ Port $port ($service) - OPEN"
        return 0
    else
        echo "  ❌ Port $port ($service) - CLOSED"
        return 1
    fi
}

# Function to test HTTP endpoint
test_http() {
    local port=$1
    local path=$2
    local service=$3
    
    if curl -s -m 3 "http://localhost:$port$path" >/dev/null 2>&1; then
        echo "  ✅ HTTP $port$path ($service) - RESPONDING"
        return 0
    else
        echo "  ❌ HTTP $port$path ($service) - NOT RESPONDING"
        return 1
    fi
}

echo ""
echo "🔍 Testing Core Ports:"
test_port 9090 "Health Monitoring"
test_port 8188 "ComfyUI GPU0"

echo ""
echo "🌐 Testing HTTP Endpoints:"
test_http 9090 "/health" "Health Check"
test_http 9090 "/status" "Status Check"
test_http 8188 "/" "ComfyUI Web UI"

echo ""
echo "🎮 Testing Multi-GPU ComfyUI Ports:"
for gpu in {0..3}; do
    port=$((8188 + gpu))
    test_port $port "ComfyUI GPU$gpu"
done

echo ""
echo "🤖 Testing A1111 Ports (if enabled):"
for gpu in {0..3}; do
    port=$((3001 + gpu))
    test_port $port "A1111 GPU$gpu"
done

echo ""
echo "🔧 Testing Infrastructure Ports:"
test_port 22 "SSH"
test_port 80 "HTTP"
test_port 443 "HTTPS"
test_port 11434 "Ollama"

echo ""
echo "📊 Service Health Summary:"
echo "========================"

# Test main services
if test_http 9090 "/health" "Health" >/dev/null 2>&1; then
    echo "🟢 Basic Machine: HEALTHY"
    
    # Get detailed status
    if command -v jq >/dev/null 2>&1; then
        echo "📋 Service Status:"
        curl -s http://localhost:9090/status | jq -r '.services | to_entries[] | "  \(.key): \(.value.status)"' 2>/dev/null || echo "  Unable to parse status"
    fi
else
    echo "🔴 Basic Machine: UNHEALTHY or NOT RUNNING"
fi

if test_http 8188 "/" "ComfyUI" >/dev/null 2>&1; then
    echo "🟢 ComfyUI: RESPONDING"
else
    echo "🔴 ComfyUI: NOT RESPONDING"
fi

echo ""
echo "💡 Useful Commands:"
echo "  Start: pnpm machines:basic:up"
echo "  Logs:  pnpm machines:basic:logs"
echo "  Stop:  pnpm machines:basic:down"
echo "  Health: curl http://localhost:9090/health"
echo "  ComfyUI: curl http://localhost:8188/"