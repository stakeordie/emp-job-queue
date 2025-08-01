#!/bin/bash
# Production Test Environment Shutdown Script
# Gracefully stops the EMP Job Queue production test environment

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

echo -e "${BLUE}🛑 Stopping EMP Job Queue Production Test Environment${NC}"
echo -e "${BLUE}====================================================${NC}"

# Change to project directory
cd "$PROJECT_DIR"

# Check if services are running
if ! docker-compose -f docker-compose.prod-test.yml ps --services --filter "status=running" | grep -q .; then
    echo -e "${YELLOW}⚠️ No running services found${NC}"
    exit 0
fi

# Parse command line options
CLEAN_DATA=false
REMOVE_IMAGES=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --clean-data)
            CLEAN_DATA=true
            shift
            ;;
        --remove-images)
            REMOVE_IMAGES=true
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --clean-data     Remove all Redis data and volumes"
            echo "  --remove-images  Remove built Docker images"
            echo "  --help          Show this help message"
            exit 0
            ;;
        *)
            echo -e "${RED}❌ Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Stop services gracefully
echo -e "${YELLOW}🔄 Stopping services...${NC}"
docker-compose -f docker-compose.prod-test.yml stop

# Remove containers
echo -e "${YELLOW}🗑️ Removing containers...${NC}"
docker-compose -f docker-compose.prod-test.yml down

# Clean data if requested
if [ "$CLEAN_DATA" = true ]; then
    echo -e "${YELLOW}🧹 Cleaning up data volumes...${NC}"
    docker-compose -f docker-compose.prod-test.yml down -v
    echo -e "${GREEN}✅ Data volumes removed${NC}"
fi

# Remove images if requested
if [ "$REMOVE_IMAGES" = true ]; then
    echo -e "${YELLOW}🖼️ Removing built images...${NC}"
    
    # Get list of images built by docker-compose
    IMAGES=$(docker-compose -f docker-compose.prod-test.yml config --services | while read service; do
        docker-compose -f docker-compose.prod-test.yml images -q $service 2>/dev/null || true
    done | sort -u | grep -v '^$')
    
    if [ -n "$IMAGES" ]; then
        echo "$IMAGES" | xargs docker rmi -f 2>/dev/null || true
        echo -e "${GREEN}✅ Built images removed${NC}"
    else
        echo -e "${YELLOW}ℹ️ No images to remove${NC}"
    fi
fi

# Final status
echo -e "${GREEN}🎉 Production Test Environment stopped successfully!${NC}"
echo -e "${BLUE}====================================================${NC}"

if [ "$CLEAN_DATA" = false ]; then
    echo -e "${YELLOW}💡 Tip: Use --clean-data to remove Redis data on next shutdown${NC}"
fi

if [ "$REMOVE_IMAGES" = false ]; then
    echo -e "${YELLOW}💡 Tip: Use --remove-images to remove built Docker images${NC}"
fi

echo -e "${BLUE}🔧 To restart: ./scripts/start-prod-test.sh${NC}"