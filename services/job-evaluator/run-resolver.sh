#!/bin/bash
# Job Resolver Cron Runner
# Runs every 5 minutes to resolve evaluated jobs

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Log with timestamp
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting job resolver run..."

# Run the job resolver only
if npx tsx --env-file=.env.secret.local-dev --env-file=.env.local-dev src/resolver.ts; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Job resolver completed successfully"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Job resolver failed with exit code $?"
    exit 1
fi