# Fluentd Service Testing Guide

This guide covers how to test all four requirements for the Fluentd log aggregation service:

- **A)** We can send logs and they get processed
- **B)** Test logs make it to Dash0  
- **C)** All values are fully configurable (.env instead of hardcoded)
- **D)** Deployed version continues to work

## Quick Start

### 1. Test Dash0 Connectivity First

Before testing the full Fluentd service, verify your Dash0 connection:

```bash
# Set your Dash0 API key
export DASH0_API_KEY=auth_w8VowQspnZ8whZHWp1pe6azIIehBAAvL

# Test direct connectivity
./test-dash0-direct.sh
```

**Expected Output:**
```
✅ SUCCESS: Log sent to Dash0 successfully!
🎉 Dash0 integration is working correctly!
```

If this fails, fix your Dash0 configuration before proceeding.

### 2. Run Full Fluentd Test Suite

```bash
# Run comprehensive tests
./test-fluentd.sh
```

**Expected Output:**
```
🎉 All tests passed! Fluentd service is ready for deployment.

Next Steps:
1. Set your real DASH0_API_KEY in production .env
2. Configure your machines to send logs to this Fluentd service  
3. Deploy to Railway with: railway deploy
4. Monitor logs in Dash0 dashboard
```

## Detailed Test Breakdown

### Test A: Log Processing Functionality

**What it tests:**
- HTTP log submission endpoint works
- Multiple log formats are handled correctly
- Logs are parsed and enriched properly

**Manual verification:**
```bash
# Start services
docker-compose up -d

# Send test log
curl -X POST http://localhost:8888/test.log \
  -H "Content-Type: application/json" \
  -d '{
    "level": "info",
    "message": "Manual test log",
    "trace_id": "manual-test-123"
  }'

# Check Fluentd received it
curl -s http://localhost:24220/api/plugins.json | jq
```

### Test B: Dash0 Integration

**What it tests:**
- Logs reach Dash0 with correct OpenTelemetry format
- Correlation IDs are preserved
- Dataset routing works correctly

**Manual verification:**
```bash
# Send identifiable test log
curl -X POST http://localhost:8888/dash0.test \
  -H "Content-Type: application/json" \
  -d '{
    "message": "🧪 Manual Dash0 test",
    "trace_id": "manual-dash0-'$(date +%s)'",
    "test_marker": "manual_verification"
  }'

# Check Dash0 dashboard for the log
# Search: test_marker:"manual_verification"
```

### Test C: Configuration Flexibility

**What it tests:**
- All hardcoded values moved to environment variables
- .env.example contains all required settings
- Port configuration is customizable

**Manual verification:**
```bash
# Check environment variable usage
grep -r "ENV\[" fluentd.conf

# Test custom port configuration
FLUENTD_HTTP_PORT=9999 docker-compose up -d
curl http://localhost:9999/test.log  # Should work on custom port
```

**Configuration checklist:**
- [ ] `DASH0_API_KEY` - Your API key
- [ ] `DASH0_DATASET` - Environment/dataset name
- [ ] `DASH0_LOGS_ENDPOINT` - Dash0 endpoint URL
- [ ] `REDIS_HOST/PORT/PASSWORD` - Redis failover config
- [ ] `FLUENTD_*_PORT` - All port configurations
- [ ] `FLUENTD_SHARED_KEY` - Security key for Fluent Bit
- [ ] `LOG_LEVEL` - Logging verbosity

### Test D: Deployment Compatibility

**What it tests:**
- No port conflicts with existing services
- Existing Redis connections still work
- Service starts cleanly in production environment

**Manual verification:**
```bash
# Check for port conflicts
netstat -ln | grep -E ":(24224|24225|8888|24220|9880)"

# Test with production-like environment
NODE_ENV=production docker-compose up -d

# Verify service health
curl http://localhost:24220/api/plugins.json
curl http://localhost:9880/metrics
```

## Performance Testing

### Load Test

```bash
# Send 100 concurrent logs
for i in {1..100}; do
  curl -X POST http://localhost:8888/load.test \
    -H "Content-Type: application/json" \
    -d "{\"batch\":$i,\"message\":\"Load test $i\"}" &
done
wait

# Check processing metrics
curl http://localhost:9880/metrics | grep fluentd_input_status_num_records_total
```

**Expected Performance:**
- **Throughput**: 1000+ logs/second
- **Latency**: P95 < 100ms processing time  
- **Memory**: < 500MB peak usage
- **Buffer**: Handles bursts up to 10,000 logs

## Error Scenarios

### Test Failover to Redis

```bash
# Simulate Dash0 outage by using invalid API key
DASH0_API_KEY=invalid docker-compose up -d

# Send logs (should queue in Redis)
curl -X POST http://localhost:8888/failover.test \
  -H "Content-Type: application/json" \
  -d '{"message":"Failover test","level":"error"}'

# Check Redis queue
docker-compose exec redis redis-cli keys "fluentd_failed_logs:*"
docker-compose exec redis redis-cli llen fluentd_failed_logs:default
```

### Test Buffer Overflow

```bash
# Send large volume to fill buffers
for i in {1..10000}; do
  curl -X POST http://localhost:8888/buffer.test \
    -H "Content-Type: application/json" \
    -d '{"message":"Buffer test '$i'"}' &
  
  # Rate limit to avoid overwhelming
  if (( $i % 100 == 0 )); then
    wait
  fi
done

# Check buffer status
docker-compose exec fluentd ls -la /fluentd/buffer/
```

## Troubleshooting

### Common Issues

1. **"Connection refused" to Dash0**
   ```bash
   # Check API key and endpoint
   ./test-dash0-direct.sh
   ```

2. **"Port already in use"**
   ```bash
   # Check what's using the port
   lsof -i :24224
   # Or configure different port
   echo "FLUENTD_FORWARD_PORT=24224" >> .env
   ```

3. **"Fluentd not starting"**
   ```bash
   # Check logs for configuration errors
   docker-compose logs fluentd
   # Validate configuration syntax
   docker-compose exec fluentd fluentd --dry-run -c /fluentd/etc/fluent.conf
   ```

4. **"Logs not reaching Dash0"**
   ```bash
   # Check Fluentd processing
   curl http://localhost:24220/api/plugins.json | jq '.plugins[] | select(.type=="output")'
   # Check buffer status
   curl http://localhost:9880/metrics | grep buffer_queue_length
   ```

### Debug Mode

```bash
# Enable verbose logging
LOG_LEVEL=debug docker-compose up -d

# Watch real-time logs
docker-compose logs -f fluentd

# Check detailed metrics
curl http://localhost:9880/metrics
```

### Health Checks

```bash
# Service health
curl http://localhost:24220/api/plugins.json

# Buffer status  
curl http://localhost:9880/metrics | grep -E "(buffer|queue|retry)"

# Redis connectivity
docker-compose exec redis redis-cli ping

# Companion service (if running)
curl http://localhost:3000/health
```

## Production Readiness Checklist

Before deploying to Railway:

- [ ] All tests pass locally
- [ ] Real `DASH0_API_KEY` configured
- [ ] Production `.env` file created
- [ ] Port configuration matches Railway setup
- [ ] Redis credentials configured (if using external Redis)
- [ ] TLS certificates available (if using TLS)
- [ ] Resource limits appropriate for expected log volume
- [ ] Monitoring/alerting configured for service health
- [ ] Backup/disaster recovery plan in place

## Integration Testing

To test with real machines sending logs:

1. **Configure Fluent Bit** on a machine:
   ```ini
   [OUTPUT]
       Name              forward
       Match             *
       Host              your-fluentd-host
       Port              24224
       Shared_Key        your-shared-key
   ```

2. **Send test logs** from the machine:
   ```bash
   echo '{"message":"Integration test"}' | fluent-cat test.integration
   ```

3. **Verify in Dash0** dashboard:
   - Search for recent logs from your machine
   - Check correlation IDs are preserved
   - Verify log format is correct

## Monitoring After Deployment

Key metrics to monitor:

- **Input rate**: `fluentd_input_status_num_records_total`
- **Output rate**: `fluentd_output_status_num_records_total`
- **Buffer depth**: `fluentd_buffer_queue_length`
- **Error rate**: `fluentd_retry_count`
- **Memory usage**: Container memory metrics
- **Dash0 connectivity**: HTTP response codes in logs

Set up alerts for:
- Buffer queue length > 1000
- Error rate > 1%
- Memory usage > 80%
- Service down for > 1 minute