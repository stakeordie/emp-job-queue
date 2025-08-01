#!/bin/bash
# Production Test Environment Startup Script
# Starts the EMP Job Queue system in production-testing mode

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo -e "${BLUE}🚀 Starting EMP Job Queue Production Test Environment${NC}"
echo -e "${BLUE}=================================================${NC}"

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to wait for service
wait_for_service() {
    local url=$1
    local service_name=$2
    local max_attempts=30
    local attempt=1
    
    echo -e "${YELLOW}⏳ Waiting for $service_name to be ready...${NC}"
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f -s "$url" >/dev/null 2>&1; then
            echo -e "${GREEN}✅ $service_name is ready!${NC}"
            return 0
        fi
        
        echo -n "."
        sleep 2
        ((attempt++))
    done
    
    echo -e "${RED}❌ $service_name failed to start within expected time${NC}"
    return 1
}

# Check prerequisites
echo -e "${YELLOW}📋 Checking prerequisites...${NC}"

if ! command_exists docker; then
    echo -e "${RED}❌ Docker is not installed or not in PATH${NC}"
    exit 1
fi

if ! command_exists docker-compose; then
    echo -e "${RED}❌ Docker Compose is not installed or not in PATH${NC}"
    echo -e "${YELLOW}💡 Try: docker compose (built into Docker) or install docker-compose${NC}"
    exit 1
fi

if ! command_exists pnpm; then
    echo -e "${RED}❌ pnpm is not installed or not in PATH${NC}"
    echo -e "${YELLOW}💡 Install with: npm install -g pnpm${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites check passed${NC}"

# Change to project directory
cd "$PROJECT_DIR"

# Build images if they don't exist
echo -e "${YELLOW}🔨 Building Docker images...${NC}"
docker-compose -f docker-compose.prod-test.yml build

# Start services
echo -e "${YELLOW}🎬 Starting services...${NC}"
docker-compose -f docker-compose.prod-test.yml up -d

# Wait for services to be ready
echo -e "${YELLOW}⏳ Waiting for services to start...${NC}"

wait_for_service "http://localhost:6379" "Redis" || {
    echo -e "${RED}❌ Redis failed to start${NC}"
    docker-compose -f docker-compose.prod-test.yml logs redis
    exit 1
}

wait_for_service "http://localhost:3331/health" "API Server" || {
    echo -e "${RED}❌ API Server failed to start${NC}"
    docker-compose -f docker-compose.prod-test.yml logs api
    exit 1
}

wait_for_service "http://localhost:3332/health" "Webhook Service" || {
    echo -e "${RED}❌ Webhook Service failed to start${NC}"
    docker-compose -f docker-compose.prod-test.yml logs webhook-service
    exit 1
}

wait_for_service "http://localhost:3333" "Monitor" || {
    echo -e "${YELLOW}⚠️ Monitor failed to start (optional service)${NC}"
}

# Show status
echo -e "${GREEN}🎉 Production Test Environment is ready!${NC}"
echo -e "${BLUE}=================================================${NC}"
echo -e "${GREEN}📊 Service Status:${NC}"
echo -e "  🔴 Redis:           http://localhost:6379"
echo -e "  🔵 API Server:      http://localhost:3331"
echo -e "  🟡 Webhook Service: http://localhost:3332"
echo -e "  🟢 Monitor:         http://localhost:3333"
echo
echo -e "${BLUE}🔧 Useful Commands:${NC}"
echo -e "  View logs:          docker-compose -f docker-compose.prod-test.yml logs -f"
echo -e "  Stop services:      docker-compose -f docker-compose.prod-test.yml down"
echo -e "  Restart service:    docker-compose -f docker-compose.prod-test.yml restart <service>"
echo -e "  View service status: docker-compose -f docker-compose.prod-test.yml ps"
echo
echo -e "${BLUE}🧪 Testing:${NC}"
echo -e "  API Health:         curl http://localhost:3331/health"
echo -e "  Webhook Health:     curl http://localhost:3332/health"
echo -e "  Submit test job:    Use the Monitor UI at http://localhost:3333"
echo
echo -e "${YELLOW}📝 Note: This environment uses debug logging and reduced timeouts for testing${NC}"