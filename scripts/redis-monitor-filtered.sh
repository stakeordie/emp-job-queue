#!/bin/bash

# Redis Monitor with Filtering
# Filters out ZREVRANGE and common polling commands

echo "📊 Redis Monitor (filtered) - Hiding polling queries"
echo "Press Ctrl+C to stop"
echo ""

# Filter out common polling patterns
redis-cli monitor | grep -v -E 'ZREVRANGE|"hget" "worker:[^"]*" "status"' | grep -v "findMatchingJob"