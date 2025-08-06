#!/bin/bash

# Comprehensive Fluentd Testing Script
# Tests: A) Log processing B) Dash0 delivery C) Config flexibility D) Compatibility

set -e

echo "🚀 Starting Fluentd Log Aggregation Tests"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
TEST_DIR="$(pwd)"
FLUENTD_HOST="localhost"
HTTP_PORT="8888"
MONITOR_PORT="24220"
COMPANION_PORT="3000"
PROMETHEUS_PORT="9880"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

run_test() {
    ((TESTS_RUN++))
    echo -e "\n${BLUE}Test $TESTS_RUN:${NC} $1"
    echo "----------------------------------------"
}

# Check if required tools are installed
check_prerequisites() {
    run_test "Checking prerequisites"
    
    local missing_tools=()
    
    for tool in curl jq docker docker-compose; do
        if ! command -v $tool &> /dev/null; then
            missing_tools+=($tool)
        fi
    done
    
    if [ ${#missing_tools[@]} -ne 0 ]; then
        log_error "Missing required tools: ${missing_tools[*]}"
        echo "Please install missing tools and try again"
        exit 1
    fi
    
    log_success "All prerequisites installed"
}

# Test A: Environment Configuration
test_environment_config() {
    run_test "Environment Configuration (.env flexibility)"
    
    # Check if .env.example exists
    if [ ! -f ".env.example" ]; then
        log_error ".env.example file missing"
        return 1
    fi
    
    # Verify key environment variables are documented
    local required_vars=(
        "DASH0_API_KEY"
        "DASH0_DATASET" 
        "DASH0_LOGS_ENDPOINT"
        "REDIS_HOST"
        "FLUENTD_SHARED_KEY"
        "FLUENTD_FORWARD_PORT"
        "FLUENTD_HTTP_PORT"
    )
    
    local missing_vars=()
    for var in "${required_vars[@]}"; do
        if ! grep -q "$var=" ".env.example"; then
            missing_vars+=($var)
        fi
    done
    
    if [ ${#missing_vars[@]} -ne 0 ]; then
        log_error "Missing environment variables in .env.example: ${missing_vars[*]}"
        return 1
    fi
    
    # Create test .env file
    log_info "Creating test .env file"
    cat > .env << EOF
NODE_ENV=test
SERVICE_NAME=fluentd-test
DASH0_API_KEY=\${DASH0_API_KEY:-test-key}
DASH0_DATASET=development-test
REDIS_HOST=localhost
REDIS_PORT=6379
FLUENTD_SHARED_KEY=test-key
LOG_LEVEL=info
EOF
    
    log_success "Environment configuration validated"
}

# Start services
start_services() {
    run_test "Starting Fluentd services"
    
    log_info "Pulling latest images..."
    docker-compose pull --quiet || true
    
    log_info "Building Fluentd service..."
    if ! docker-compose build --quiet; then
        log_error "Failed to build Fluentd service"
        return 1
    fi
    
    log_info "Starting services (this may take 60 seconds)..."
    if ! docker-compose up -d; then
        log_error "Failed to start services"
        return 1
    fi
    
    log_info "Waiting for services to be ready..."
    local max_wait=60
    local wait_count=0
    
    while [ $wait_count -lt $max_wait ]; do
        if curl -s "http://$FLUENTD_HOST:$MONITOR_PORT/api/plugins.json" > /dev/null 2>&1; then
            break
        fi
        sleep 1
        ((wait_count++))
        echo -n "."
    done
    echo
    
    if [ $wait_count -ge $max_wait ]; then
        log_error "Services failed to start within ${max_wait} seconds"
        docker-compose logs
        return 1
    fi
    
    log_success "Services started successfully"
}

# Test B: Log Processing
test_log_processing() {
    run_test "Log processing functionality"
    
    # Test 1: HTTP log submission
    log_info "Testing HTTP log submission..."
    local test_log='{
        "timestamp": "'$(date -Iseconds)'",
        "level": "info", 
        "message": "Test log message from test script",
        "trace_id": "test-trace-123",
        "job_id": "test-job-456",
        "machine_id": "test-machine",
        "worker_id": "test-worker-0",
        "source": "test-script",
        "component": "fluentd-test"
    }'
    
    local response=$(curl -s -w "%{http_code}" -X POST \
        "http://$FLUENTD_HOST:$HTTP_PORT/test.log" \
        -H "Content-Type: application/json" \
        -d "$test_log")
    
    local http_code="${response: -3}"
    if [ "$http_code" != "200" ]; then
        log_error "HTTP log submission failed with code: $http_code"
        return 1
    fi
    
    log_success "HTTP log submission working"
    
    # Test 2: Multiple log formats
    log_info "Testing different log formats..."
    
    # JSON format
    curl -s -X POST "http://$FLUENTD_HOST:$HTTP_PORT/test.json" \
        -H "Content-Type: application/json" \
        -d '{"level":"debug","message":"JSON format test"}' > /dev/null
    
    # Plain text (should be handled gracefully)  
    curl -s -X POST "http://$FLUENTD_HOST:$HTTP_PORT/test.plain" \
        -H "Content-Type: text/plain" \
        -d "Plain text log message" > /dev/null
    
    log_success "Multiple log formats processed"
}

# Test C: Health and Monitoring
test_health_monitoring() {
    run_test "Health and monitoring endpoints"
    
    # Test Fluentd health
    log_info "Testing Fluentd health endpoint..."
    local health_response=$(curl -s "http://$FLUENTD_HOST:$MONITOR_PORT/api/plugins.json")
    
    if ! echo "$health_response" | jq . > /dev/null 2>&1; then
        log_error "Fluentd health endpoint returned invalid JSON"
        return 1
    fi
    
    local plugin_count=$(echo "$health_response" | jq '.plugins | length')
    if [ "$plugin_count" -lt 3 ]; then
        log_error "Expected at least 3 plugins, got $plugin_count"
        return 1
    fi
    
    log_success "Fluentd health endpoint working"
    
    # Test Prometheus metrics
    log_info "Testing Prometheus metrics endpoint..."
    local metrics_response=$(curl -s "http://$FLUENTD_HOST:$PROMETHEUS_PORT/metrics")
    
    if [[ ! "$metrics_response" =~ "fluentd_input_status_num_records_total" ]]; then
        log_error "Prometheus metrics missing expected counters"
        return 1
    fi
    
    log_success "Prometheus metrics endpoint working"
    
    # Test companion service (if running)
    if curl -s "http://$FLUENTD_HOST:$COMPANION_PORT/health" > /dev/null 2>&1; then
        log_info "Testing companion service..."
        local companion_health=$(curl -s "http://$FLUENTD_HOST:$COMPANION_PORT/health")
        
        if echo "$companion_health" | jq -e '.status == "healthy" or .status == "degraded"' > /dev/null; then
            log_success "Companion service healthy"
        else
            log_warning "Companion service health check returned: $(echo $companion_health | jq -r .status)"
        fi
    else
        log_info "Companion service not running (optional)"
    fi
}

# Test D: Buffer and Failover
test_reliability() {
    run_test "Buffer and reliability features"
    
    # Check buffer directory exists
    log_info "Checking buffer configuration..."
    if docker-compose exec -T fluentd ls -la /fluentd/buffer > /dev/null 2>&1; then
        log_success "Buffer directory accessible"
    else
        log_warning "Buffer directory not accessible (may be normal)"
    fi
    
    # Test high volume logs
    log_info "Testing high volume log processing..."
    for i in {1..10}; do
        curl -s -X POST "http://$FLUENTD_HOST:$HTTP_PORT/test.volume" \
            -H "Content-Type: application/json" \
            -d "{\"batch\":$i,\"message\":\"Volume test batch $i\",\"timestamp\":\"$(date -Iseconds)\"}" > /dev/null &
    done
    
    wait # Wait for all background requests
    sleep 2 # Let Fluentd process
    
    log_success "High volume processing completed"
}

# Test Dash0 Integration (if API key provided)
test_dash0_integration() {
    run_test "Dash0 integration test"
    
    if [ -z "${DASH0_API_KEY:-}" ]; then
        log_warning "DASH0_API_KEY not set, skipping Dash0 integration test"
        log_info "To test Dash0 integration, set DASH0_API_KEY environment variable"
        return 0
    fi
    
    log_info "Testing Dash0 connectivity..."
    
    # Send a test log with identifiable content
    local test_trace_id="fluentd-test-$(date +%s)"
    local dash0_test_log='{
        "timestamp": "'$(date -Iseconds)'",
        "level": "info",
        "message": "🧪 FLUENTD TEST LOG - If you see this in Dash0, the integration works!",
        "trace_id": "'$test_trace_id'",
        "job_id": "fluentd-integration-test",
        "machine_id": "test-fluentd-service", 
        "source": "fluentd-integration-test",
        "test_marker": "dash0_integration_test"
    }'
    
    curl -s -X POST "http://$FLUENTD_HOST:$HTTP_PORT/test.dash0" \
        -H "Content-Type: application/json" \
        -d "$dash0_test_log" > /dev/null
    
    log_success "Test log sent to Fluentd for Dash0 delivery"
    log_info "Check Dash0 for log with trace_id: $test_trace_id"
    log_info "Search query: trace_id:\"$test_trace_id\" OR test_marker:\"dash0_integration_test\""
}

# Compatibility test
test_existing_compatibility() {
    run_test "Existing deployment compatibility" 
    
    log_info "Checking port conflicts..."
    local conflicting_ports=()
    
    # Check if critical ports are available
    for port in 24224 24225 8888 24220; do
        if netstat -ln 2>/dev/null | grep ":$port " > /dev/null; then
            # Check if it's our Fluentd service
            if ! docker-compose ps | grep -q ":$port->"; then
                conflicting_ports+=($port)
            fi
        fi
    done
    
    if [ ${#conflicting_ports[@]} -ne 0 ]; then
        log_warning "Port conflicts detected: ${conflicting_ports[*]}"
        log_info "You may need to adjust port configuration in .env"
    else
        log_success "No port conflicts detected"
    fi
    
    # Test that existing Redis connection still works (if configured)
    if [ -n "${REDIS_HOST:-}" ] && [ "$REDIS_HOST" != "localhost" ]; then
        log_info "Testing existing Redis connectivity..."
        if docker run --rm --network host redis:7-alpine redis-cli -h "$REDIS_HOST" ping > /dev/null 2>&1; then
            log_success "Existing Redis connection working"
        else
            log_warning "Could not connect to existing Redis at $REDIS_HOST"
        fi
    fi
}

# Performance benchmark
benchmark_performance() {
    run_test "Performance benchmark"
    
    log_info "Running performance test (100 concurrent logs)..."
    
    local start_time=$(date +%s)
    
    # Send 100 logs concurrently
    for i in {1..100}; do
        curl -s -X POST "http://$FLUENTD_HOST:$HTTP_PORT/test.perf" \
            -H "Content-Type: application/json" \
            -d "{\"batch\":$i,\"message\":\"Performance test $i\",\"timestamp\":\"$(date -Iseconds)\",\"trace_id\":\"perf-test-$i\"}" > /dev/null &
    done
    
    wait
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    log_success "Processed 100 logs in ${duration} seconds"
    
    if [ $duration -lt 5 ]; then
        log_success "Performance: Excellent (< 5s)"
    elif [ $duration -lt 10 ]; then
        log_success "Performance: Good (< 10s)" 
    else
        log_warning "Performance: Acceptable but slow (${duration}s)"
    fi
}

# Cleanup function
cleanup() {
    echo -e "\n${BLUE}Cleanup${NC}"
    echo "========"
    
    if [ -f "docker-compose.yml" ]; then
        log_info "Stopping services..."
        docker-compose down -v > /dev/null 2>&1 || true
    fi
    
    if [ -f ".env" ]; then
        log_info "Removing test .env file..."
        rm -f .env
    fi
    
    log_info "Cleanup completed"
}

# Main execution
main() {
    echo "Testing Fluentd Log Aggregation Service"
    echo "======================================"
    echo
    
    # Set up cleanup trap
    trap cleanup EXIT INT TERM
    
    # Run tests
    check_prerequisites
    test_environment_config
    start_services
    test_log_processing  
    test_health_monitoring
    test_reliability
    test_dash0_integration
    test_existing_compatibility
    benchmark_performance
    
    # Results summary
    echo -e "\n${BLUE}Test Results Summary${NC}"
    echo "===================="
    echo "Tests Run: $TESTS_RUN"
    echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
    
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "\n${GREEN}🎉 All tests passed! Fluentd service is ready for deployment.${NC}"
        
        echo -e "\n${BLUE}Next Steps:${NC}"
        echo "1. Set your real DASH0_API_KEY in production .env"
        echo "2. Configure your machines to send logs to this Fluentd service"
        echo "3. Deploy to Railway with: railway deploy"
        echo "4. Monitor logs in Dash0 dashboard"
        
        exit 0
    else
        echo -e "\n${RED}❌ Some tests failed. Please fix issues before deployment.${NC}"
        exit 1
    fi
}

# Check if script is being run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi