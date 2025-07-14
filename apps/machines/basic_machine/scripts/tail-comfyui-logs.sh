#!/bin/bash

# Tail ComfyUI output logs for both GPU instances
# This script monitors the ComfyUI output logs in real-time via Docker exec

set -e

# Define container name and log file paths (inside container)
CONTAINER_NAME="basic-machine-local"
LOG_DIR="/workspace/ComfyUI/logs"
GPU0_LOG="${LOG_DIR}/output-gpu0.log"
GPU1_LOG="${LOG_DIR}/output-gpu1.log"

# Colors for output differentiation
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}🔍 ComfyUI Log Tailer${NC}"
echo -e "${YELLOW}Monitoring ComfyUI output logs...${NC}"
echo ""

# Function to check if container is running
check_container() {
    if ! docker ps --format "table {{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
        echo -e "${RED}❌ Container '$CONTAINER_NAME' is not running${NC}"
        echo -e "${YELLOW}💡 Start the container with: ${NC}${CYAN}pnpm machines:basic:local:up${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Container '$CONTAINER_NAME' is running${NC}"
}

# Function to check if log files exist inside container
check_log_files() {
    local gpu0_exists gpu1_exists
    
    gpu0_exists=$(docker exec "$CONTAINER_NAME" test -f "$GPU0_LOG" && echo "true" || echo "false")
    gpu1_exists=$(docker exec "$CONTAINER_NAME" test -f "$GPU1_LOG" && echo "true" || echo "false")
    
    if [[ "$gpu0_exists" == "false" ]]; then
        echo -e "${YELLOW}⚠️  GPU0 log not found: $GPU0_LOG${NC}"
    else
        echo -e "${GREEN}✅ GPU0 log found: $GPU0_LOG${NC}"
    fi
    
    if [[ "$gpu1_exists" == "false" ]]; then
        echo -e "${YELLOW}⚠️  GPU1 log not found: $GPU1_LOG${NC}"
    else
        echo -e "${GREEN}✅ GPU1 log found: $GPU1_LOG${NC}"
    fi
    
    if [[ "$gpu0_exists" == "false" && "$gpu1_exists" == "false" ]]; then
        echo -e "${YELLOW}💡 Make sure ComfyUI services are running and have generated logs${NC}"
        echo -e "${YELLOW}💡 Check PM2 status: ${NC}${CYAN}docker exec $CONTAINER_NAME pm2 status${NC}"
        echo ""
        return 1
    fi
    
    return 0
}

# Function to wait for log files
wait_for_logs() {
    echo -e "${YELLOW}⏳ Waiting for log files to be created...${NC}"
    
    while ! check_log_files >/dev/null 2>&1; do
        sleep 2
        echo -e "${YELLOW}   Still waiting for logs... (ComfyUI services may still be starting)${NC}"
    done
    
    echo -e "${GREEN}✅ Log files detected, starting tail...${NC}"
    echo ""
}

# Function to tail logs with colored prefixes via docker exec
tail_logs() {
    local gpu0_exists gpu1_exists
    
    # Check which logs exist
    gpu0_exists=$(docker exec "$CONTAINER_NAME" test -f "$GPU0_LOG" && echo "true" || echo "false")
    gpu1_exists=$(docker exec "$CONTAINER_NAME" test -f "$GPU1_LOG" && echo "true" || echo "false")
    
    echo -e "${GREEN}📊 Tailing ComfyUI logs via Docker exec${NC}"
    
    if [[ "$gpu0_exists" == "true" ]]; then
        echo -e "${GREEN}🔹 GPU0: $GPU0_LOG${NC}"
    fi
    
    if [[ "$gpu1_exists" == "true" ]]; then
        echo -e "${BLUE}🔹 GPU1: $GPU1_LOG${NC}"
    fi
    
    echo ""
    echo -e "${CYAN}=== ComfyUI Output Logs (Live) ===${NC}"
    echo ""
    
    # Use docker exec to tail logs with prefixes
    (
        if [[ "$gpu0_exists" == "true" ]]; then
            docker exec "$CONTAINER_NAME" tail -f "$GPU0_LOG" 2>/dev/null | sed "s/^/$(echo -e "${GREEN}[GPU0]${NC}") /" &
        fi
        
        if [[ "$gpu1_exists" == "true" ]]; then
            docker exec "$CONTAINER_NAME" tail -f "$GPU1_LOG" 2>/dev/null | sed "s/^/$(echo -e "${BLUE}[GPU1]${NC}") /" &
        fi
        
        # Wait for all background processes
        wait
    )
}

# Main execution
echo -e "${CYAN}Checking container and log file locations...${NC}"

# Check if container is running
check_container

# Check if log files exist
if ! check_log_files; then
    wait_for_logs
fi

# Start tailing
echo -e "${GREEN}🚀 Starting log monitoring...${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
echo ""

# Trap to handle cleanup
trap 'echo -e "\n${YELLOW}📋 Log monitoring stopped${NC}"; exit 0' INT TERM

tail_logs