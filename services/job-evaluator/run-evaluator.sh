#!/bin/bash

# Job Evaluator Cron Runner
# Runs every 10 minutes to evaluate job completion status

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Log with timestamp
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting job evaluator run..."

# Run the job evaluator
if npm run start; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Job evaluator completed successfully"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Job evaluator failed with exit code $?"
    exit 1
fi