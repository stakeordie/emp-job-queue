#!/bin/bash

# Check if the full-stack development environment is running

echo "🔍 Checking full-stack development environment status..."
echo ""

# Function to check if a port is in use
check_port() {
    local port=$1
    local service=$2
    if lsof -i :$port > /dev/null 2>&1; then
        echo "  ✅ $service (port $port) - RUNNING"
        return 0
    else
        echo "  ❌ $service (port $port) - NOT RUNNING"
        return 1
    fi
}

# Function to check if a process is running
check_process() {
    local pattern=$1
    local service=$2
    if pgrep -f "$pattern" > /dev/null 2>&1; then
        echo "  ✅ $service - RUNNING"
        return 0
    else
        echo "  ❌ $service - NOT RUNNING"
        return 1
    fi
}

# Check services
running_count=0
total_count=0

echo "📊 Service Status:"

# Redis
total_count=$((total_count + 1))
if check_port 6379 "Redis Server"; then
    running_count=$((running_count + 1))
fi

# API Server
total_count=$((total_count + 1))
if check_port 3331 "API Server"; then
    running_count=$((running_count + 1))
fi

# Monitor UI
total_count=$((total_count + 1))
if check_port 3333 "Monitor UI"; then
    running_count=$((running_count + 1))
fi

# Machine Health
total_count=$((total_count + 1))
if check_port 9092 "Machine Health"; then
    running_count=$((running_count + 1))
fi

# ComfyUI (optional)
if lsof -i :3190 > /dev/null 2>&1; then
    echo "  ✅ ComfyUI (port 3190) - RUNNING"
fi

echo ""
echo "📡 Background Processes:"

# Event Stream Logger
total_count=$((total_count + 1))
if check_process "event-stream-logger" "Event Stream Logger"; then
    running_count=$((running_count + 1))
fi

echo ""
echo "🐳 Docker Containers:"

# Check if basic machine container is running
if docker ps --format "table {{.Names}}" | grep -q "basic-machine-local"; then
    echo "  ✅ Machine Container - RUNNING"
    total_count=$((total_count + 1))
    running_count=$((running_count + 1))
else
    echo "  ❌ Machine Container - NOT RUNNING"
    total_count=$((total_count + 1))
fi

echo ""
echo "📁 Log Files:"

# Check if log files exist and show their sizes
logs_dir="logs"
if [ -d "$logs_dir" ]; then
    for log_file in api-redis.log monitor.log machine.log monitorEventStream.log; do
        if [ -f "$logs_dir/$log_file" ]; then
            size=$(ls -lh "$logs_dir/$log_file" | awk '{print $5}')
            echo "  📝 $log_file ($size)"
        else
            echo "  📝 $log_file (not found)"
        fi
    done
else
    echo "  📁 logs/ directory not found"
fi

echo ""
echo "📊 Summary:"
echo "  Running: $running_count/$total_count services"

if [ $running_count -eq $total_count ]; then
    echo "  🟢 Full stack is RUNNING"
    exit_code=0
elif [ $running_count -eq 0 ]; then
    echo "  🔴 Full stack is STOPPED"
    exit_code=1
else
    echo "  🟡 Full stack is PARTIALLY RUNNING"
    exit_code=2
fi

echo ""
if [ $running_count -lt $total_count ]; then
    echo "💡 To start missing services:"
    echo "  pnpm dev:full-stack"
    echo ""
    echo "💡 To stop all services:"
    echo "  pnpm dev:full-stack:stop"
    echo ""
    echo "💡 To view logs:"
    echo "  pnpm logs:all"
fi

exit $exit_code