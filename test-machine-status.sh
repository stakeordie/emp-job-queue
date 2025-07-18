#!/bin/bash

# Test runner for machine status reporting integration tests
# This script provides comprehensive failure detection for the dual status system

echo "🔍 Machine Status Reporting Integration Tests"
echo "============================================="

# Check if API server is running
if ! curl -s http://localhost:3331/health > /dev/null; then
    echo "❌ API server not running!"
    echo "Please start with: pnpm dev:local-redis"
    exit 1
fi

echo "✅ API server is running"

# Run the specific integration tests
echo "Running comprehensive integration tests..."
echo ""
echo "Tests will verify:"
echo "1. 🏗️  Machine registration with complete static information"
echo "2. ⚡ Event-driven updates (immediate change events)"  
echo "3. ⏰ Periodic status updates (every 15 seconds)"
echo "4. 🔄 Status consistency between events and periodic updates"
echo "5. 👁️  Component visibility persistence (components never disappear)"
echo ""

cd apps/api
pnpm test src/test/integration/machine-status-reporting.test.ts

# Check test result
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ ALL TESTS PASSED"
    echo "Status reporting system is working correctly!"
    echo "✅ Machine registration: Complete with static info"
    echo "✅ Event-driven updates: Change events broadcast immediately"
    echo "✅ Periodic updates: 15-second comprehensive status updates"
    echo "✅ Status consistency: Events and periodic updates match"
    echo "✅ Component visibility: Components never disappear from UI"
else
    echo ""
    echo "❌ TESTS FAILED"
    echo "This means issues exist in the dual status system:"
    echo "- Machine registration: Missing static info (GPU count, services)"
    echo "- Event-driven updates: Change events not being broadcast"
    echo "- Periodic updates: 15-second updates not occurring"
    echo "- Status consistency: Events and periodic updates don't match"
    echo "- Component visibility: Components disappearing from UI when they shouldn't"
    echo ""
    echo "Use these failures to debug the specific root cause."
fi