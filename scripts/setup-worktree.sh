#!/bin/bash

# Worktree Environment Setup Script
# This script copies necessary environment files from the parent repository
# and sets up the local development environment for a worktree

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Setting up worktree environment...${NC}"

# Get the parent repo path (assuming standard git worktree structure)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
WORKTREE_PATH="$(dirname "$SCRIPT_DIR")"
PARENT_PATH="/Users/the_dusky/code/emprops/conductor/emp-job-queue"

# Function to check if file exists
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} Found: $1"
        return 0
    else
        echo -e "${RED}✗${NC} Not found: $1"
        return 1
    fi
}

# Step 1: Get secrets - try 1Password first, then parent repo, then manual
echo -e "\n${YELLOW}Step 1: Setting up secrets file...${NC}"
PARENT_SECRETS="$PARENT_PATH/config/environments/secrets/.env.secrets.local"
WORKTREE_SECRETS="$WORKTREE_PATH/config/environments/secrets/.env.secrets.local"

# Create secrets directory if it doesn't exist
mkdir -p "$(dirname "$WORKTREE_SECRETS")"

# Try 1Password first (if available)
if command -v op &> /dev/null; then
    echo -e "${GREEN}✓${NC} 1Password CLI detected, fetching secrets..."
    if op read --out-file "$WORKTREE_SECRETS" op://emerge/jobqenv.secrets/.env.secrets.local --force 2>/dev/null; then
        echo -e "${GREEN}✓${NC} Successfully fetched secrets from 1Password"
    else
        echo -e "${YELLOW}⚠${NC} Failed to fetch from 1Password, trying parent repository..."
        if check_file "$PARENT_SECRETS"; then
            cp "$PARENT_SECRETS" "$WORKTREE_SECRETS"
            echo -e "${GREEN}✓${NC} Copied .env.secrets.local from parent repository"
        else
            echo -e "${RED}✗${NC} No secrets found. Please set up manually or use 1Password"
            exit 1
        fi
    fi
elif check_file "$PARENT_SECRETS"; then
    cp "$PARENT_SECRETS" "$WORKTREE_SECRETS"
    echo -e "${GREEN}✓${NC} Copied .env.secrets.local from parent repository"
else
    echo -e "${YELLOW}⚠${NC} No .env.secrets.local found and 1Password CLI not available"
    echo -e "${YELLOW}⚠${NC} Please either:"
    echo -e "    1. Install 1Password CLI and run: op read --out-file ./config/environments/secrets/.env.secrets.local op://emerge/jobqenv.secrets/.env.secrets.local --force"
    echo -e "    2. Copy from parent repo: cp $PARENT_SECRETS $WORKTREE_SECRETS"
    echo -e "    3. Create manually from example: cp config/environments/secrets/.env.secrets.example config/environments/secrets/.env.secrets.local"
    exit 1
fi

# Step 2: Install dependencies if needed
echo -e "\n${YELLOW}Step 2: Installing dependencies...${NC}"
if [ ! -d "$WORKTREE_PATH/node_modules" ]; then
    cd "$WORKTREE_PATH"
    pnpm install
else
    echo -e "${GREEN}✓${NC} Dependencies already installed"
fi

# Step 3: Build the environment files
echo -e "\n${YELLOW}Step 3: Building environment files for local-dev profile...${NC}"
cd "$WORKTREE_PATH"
pnpm env:build local-dev

# Step 4: Verify critical environment files were created
echo -e "\n${YELLOW}Step 4: Verifying environment setup...${NC}"

# Check for commonly needed env files
ENV_FILES=(
    ".env"
    "apps/api/.env"
    "apps/worker/.env"
    "apps/monitor/.env.local"
)

ALL_GOOD=true
for file in "${ENV_FILES[@]}"; do
    if check_file "$WORKTREE_PATH/$file"; then
        :  # File exists, all good
    else
        ALL_GOOD=false
    fi
done

# Step 5: Build the project
echo -e "\n${YELLOW}Step 5: Building the project...${NC}"
cd "$WORKTREE_PATH"
pnpm build

if [ "$ALL_GOOD" = true ]; then
    echo -e "\n${GREEN}✅ Worktree environment setup complete!${NC}"
    echo -e "\n${YELLOW}You can now run:${NC}"
    echo -e "  ${GREEN}pnpm dev:local-redis${NC} - Start local Redis + API"
    echo -e "  ${GREEN}pnpm dev${NC} - Start development servers"
    echo -e "  ${GREEN}pnpm test${NC} - Run tests"
else
    echo -e "\n${YELLOW}⚠ Some environment files are missing.${NC}"
    echo -e "This might be expected depending on your profile configuration."
fi

echo -e "\n${GREEN}💡 Tip:${NC} Add this to your .git/hooks/post-checkout for automatic setup!"