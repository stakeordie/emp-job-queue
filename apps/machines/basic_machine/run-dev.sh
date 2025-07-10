#!/bin/bash
# Development runner for basic-machine
# This script builds the worker locally and runs the container with the local build

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Basic Machine Development Runner${NC}"
echo "================================="

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    echo -e "${RED}Error: Must run from basic_machine directory${NC}"
    exit 1
fi

# Build the worker first
echo -e "\n${YELLOW}Building worker...${NC}"
cd ../../worker
pnpm install
pnpm build

if [ ! -d "dist" ]; then
    echo -e "${RED}Error: Worker build failed - dist directory not found${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Worker built successfully${NC}"

# Return to basic_machine directory
cd ../machines/basic_machine

# Check for .env.local.dev
if [ ! -f ".env.local.dev" ]; then
    echo -e "${YELLOW}Warning: .env.local.dev not found, creating from example...${NC}"
    cp .env.example .env.local.dev
    echo -e "${YELLOW}Please update .env.local.dev with your configuration${NC}"
fi

# Generate docker-compose.override.yml
echo -e "\n${YELLOW}Generating docker-compose.override.yml...${NC}"
./generate-docker-compose.sh

# Run with both compose files
echo -e "\n${YELLOW}Starting basic-machine in development mode...${NC}"
echo -e "${YELLOW}Using local worker from: ../../worker/dist${NC}\n"

docker-compose \
    -f docker-compose.yml \
    -f docker-compose.dev.yml \
    --env-file .env.local.dev \
    up --build

echo -e "\n${GREEN}Development session ended${NC}"