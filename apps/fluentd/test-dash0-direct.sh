#!/bin/bash

# Direct Dash0 Connectivity Test
# Tests that we can send logs directly to Dash0 (bypassing Fluentd)

set -e

echo "🔌 Testing Direct Dash0 Connectivity"
echo "===================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if API key is provided
if [ -z "${DASH0_API_KEY:-}" ]; then
    echo -e "${RED}Error: DASH0_API_KEY environment variable not set${NC}"
    echo "Usage: DASH0_API_KEY=your-api-key $0"
    echo "Or: export DASH0_API_KEY=your-api-key && $0"
    exit 1
fi

# Configuration
DASH0_ENDPOINT="${DASH0_LOGS_ENDPOINT:-https://ingress.us-west-2.aws.dash0.com/logs/json}"
DASH0_DATASET="${DASH0_DATASET:-development-test}"
TRACE_ID="direct-test-$(date +%s)"

echo -e "${BLUE}Configuration:${NC}"
echo "Endpoint: $DASH0_ENDPOINT"
echo "Dataset: $DASH0_DATASET"
echo "Trace ID: $TRACE_ID"
echo

# Create OpenTelemetry log payload
echo -e "${BLUE}Creating test log payload...${NC}"

OTEL_PAYLOAD=$(cat << EOF
{
  "resourceLogs": [{
    "resource": {
      "attributes": [
        {"key": "service.name", "value": {"stringValue": "fluentd-direct-test"}},
        {"key": "service.version", "value": {"stringValue": "1.0.0"}},
        {"key": "deployment.environment", "value": {"stringValue": "$DASH0_DATASET"}}
      ]
    },
    "scopeLogs": [{
      "scope": {
        "name": "fluentd-connectivity-test",
        "version": "1.0.0"
      },
      "logRecords": [{
        "timeUnixNano": "$(date +%s%N)",
        "severityNumber": 9,
        "severityText": "INFO",
        "body": {"stringValue": "🧪 DIRECT DASH0 TEST - If you see this, Dash0 connectivity works!"},
        "attributes": [
          {"key": "trace_id", "value": {"stringValue": "$TRACE_ID"}},
          {"key": "test_type", "value": {"stringValue": "direct_connectivity"}},
          {"key": "source", "value": {"stringValue": "fluentd-test-script"}},
          {"key": "machine_id", "value": {"stringValue": "test-fluentd-direct"}}
        ],
        "traceId": "$TRACE_ID"
      }]
    }]
  }]
}
EOF
)

echo -e "${BLUE}Sending test log to Dash0...${NC}"

# Send to Dash0
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$DASH0_ENDPOINT" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $DASH0_API_KEY" \
    -H "Dash0-Dataset: $DASH0_DATASET" \
    -H "User-Agent: fluentd-test-script/1.0.0" \
    -d "$OTEL_PAYLOAD")

# Parse response
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$RESPONSE" | head -n -1)

echo -e "${BLUE}Response:${NC}"
echo "HTTP Code: $HTTP_CODE"
if [ -n "$RESPONSE_BODY" ]; then
    echo "Body: $RESPONSE_BODY"
fi
echo

# Check result
if [[ "$HTTP_CODE" =~ ^2[0-9][0-9]$ ]]; then
    echo -e "${GREEN}✅ SUCCESS: Log sent to Dash0 successfully!${NC}"
    echo
    echo -e "${BLUE}Verification:${NC}"
    echo "1. Open your Dash0 dashboard"
    echo "2. Search for: trace_id:\"$TRACE_ID\""
    echo "3. Or search for: test_type:\"direct_connectivity\""
    echo "4. You should see the test log message"
    echo
    echo -e "${GREEN}🎉 Dash0 integration is working correctly!${NC}"
    exit 0
else
    echo -e "${RED}❌ FAILED: HTTP $HTTP_CODE${NC}"
    echo
    echo -e "${YELLOW}Troubleshooting:${NC}"
    
    case "$HTTP_CODE" in
        401)
            echo "- Check your DASH0_API_KEY is correct"
            echo "- Verify the API key has write permissions"
            ;;
        403)
            echo "- API key may not have access to this dataset"
            echo "- Check dataset name: $DASH0_DATASET"
            ;;
        404)
            echo "- Check endpoint URL: $DASH0_ENDPOINT"
            echo "- Verify your Dash0 region is correct"
            ;;
        413)
            echo "- Payload too large (unlikely for this test)"
            ;;
        429)
            echo "- Rate limited - wait and try again"
            ;;
        5*)
            echo "- Dash0 server error - try again later"
            ;;
        *)
            echo "- Unexpected error - check network connectivity"
            echo "- Verify Dash0 service status"
            ;;
    esac
    
    exit 1
fi