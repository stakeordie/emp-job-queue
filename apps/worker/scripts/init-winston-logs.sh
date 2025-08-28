#!/bin/bash
# Initialize Winston log files for FluentBit tail input
# FluentBit's tail input requires files to exist when it starts

set -euo pipefail

LOG_DIR="${LOG_DIR:-/workspace/logs}"
DATE_PATTERN=$(date +%Y-%m-%d-%H)

echo "🔧 Initializing Winston OpenAI log files for FluentBit..."
echo "📁 Log directory: $LOG_DIR"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Create initial OpenAI Winston log files with current date/hour pattern
# These match the winston-daily-rotate-file patterns

# Main OpenAI SDK log
OPENAI_SDK_LOG="$LOG_DIR/openai-sdk-$DATE_PATTERN.log"
if [[ ! -f "$OPENAI_SDK_LOG" ]]; then
    echo '{"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'","level":"info","service":"openai-sdk","message":"Winston OpenAI logging initialized","telemetry_type":"system_initialization"}' > "$OPENAI_SDK_LOG"
    echo "✅ Created: $OPENAI_SDK_LOG"
fi

# OpenAI telemetry log
OPENAI_TELEMETRY_LOG="$LOG_DIR/openai-telemetry-$DATE_PATTERN.log"
if [[ ! -f "$OPENAI_TELEMETRY_LOG" ]]; then
    echo '{"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'","level":"info","service":"openai-sdk","message":"Winston OpenAI telemetry logging initialized","telemetry_type":"telemetry_initialization","has_usage_data":false}' > "$OPENAI_TELEMETRY_LOG"
    echo "✅ Created: $OPENAI_TELEMETRY_LOG"
fi

# OpenAI error log (daily pattern)
OPENAI_ERROR_LOG="$LOG_DIR/openai-errors-$(date +%Y-%m-%d).log"
if [[ ! -f "$OPENAI_ERROR_LOG" ]]; then
    echo '{"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'","level":"info","service":"openai-sdk","message":"Winston OpenAI error logging initialized","telemetry_type":"error_logging_initialization"}' > "$OPENAI_ERROR_LOG"
    echo "✅ Created: $OPENAI_ERROR_LOG"
fi

echo "🎉 Winston OpenAI log files initialized successfully!"
echo "📋 FluentBit can now tail these files:"
ls -la "$LOG_DIR"/openai-* 2>/dev/null || echo "⚠️  No OpenAI log files found after initialization"