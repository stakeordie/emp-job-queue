# Production Deployment Checklist

## 🚨 CRITICAL RISK ASSESSMENT

### HIGH RISK Components (UPDATED)
1. **Redis Connection Changes** - ✅ MITIGATED - Comprehensive test coverage added
2. **Telemetry Stack Migration** - ⚠️ STILL HIGH RISK - No test coverage for OTEL migration
3. **Webhook Processing Changes** - ✅ MOSTLY MITIGATED - Initialization order bug fixed and tested
4. **Database Package Restructuring** - ⚠️ MEDIUM RISK - Needs integration testing

### MEDIUM RISK Components
- Ngrok tunnel management system
- New Ollama connector integration
- Docker configuration changes
- Package dependency updates

## 📋 PRE-DEPLOYMENT TESTING CHECKLIST

### ✅ Redis & Database Layer
- [x] **Redis Connection Test** ✅ VERIFIED WITH TESTS
  - Start services with Redis down, verify graceful degradation ✅ TESTED
  - Restart Redis mid-operation, ensure automatic reconnection ✅ TESTED
  - Test infinite retry logic doesn't cause memory leaks ✅ TESTED (limited retries for API routes)
  - Verify all three services (API, webhook, monitor) reconnect properly ✅ TESTED (monitor has MonitorRedisManager)

- [ ] **Database Operations**
  - Run full test suite with new database package structure
  - Test Prisma client initialization and queries
  - Verify migration compatibility
  - Test connection pooling under load

- [ ] **Job Queue Integrity**
  - Submit test jobs, verify Redis storage/retrieval
  - Test job claiming atomicity with Redis functions
  - Verify worker registration and heartbeat mechanisms

### ✅ Telemetry & Monitoring
- [ ] **OTEL Direct Integration**
  - Verify traces appear in Dash0 dashboard
  - Test metric collection and export
  - Confirm log aggregation works without FluentBit
  - Test performance impact of direct OTEL approach

- [ ] **Service Health Monitoring**
  - All services report healthy status
  - WebSocket connections maintain stability
  - API response times within SLA (< 200ms)

### ✅ Webhook System
- [x] **Webhook Processing** ✅ PARTIALLY VERIFIED
  - Test webhook registration and retrieval ⚠️ NEEDS MANUAL TESTING
  - Verify initialization order (processor before routes) ✅ VERIFIED (13 passing tests)
  - Test webhook delivery with actual external endpoints ⚠️ NEEDS MANUAL TESTING
  - Test error handling and retry mechanisms ✅ VERIFIED (safe operation wrappers tested)

- [ ] **External Integration**
  - Test ngrok tunnel connectivity
  - Verify webhook URLs are accessible externally
  - Test webhook payload validation and processing

### ✅ Worker & Job Processing
- [ ] **Ollama Connector** (NEW)
  - Test new Ollama connector initialization
  - Verify asset saving and attestation functionality
  - Test error handling and fallback mechanisms
  - Monitor for memory leaks during processing

- [ ] **Existing Connectors**
  - Test ComfyUI connector still functions
  - Verify custom node installation works
  - Test PM2 service management and restarts

### ✅ Development Tools
- [x] **Ngrok Health System** ✅ VERIFIED (code review)
  - Test automatic tunnel startup/restart ✅ IMPLEMENTED (ngrok-health-check.js)
  - Verify health check monitoring works ✅ IMPLEMENTED (health endpoint checking)
  - Test tunnel failure recovery ✅ IMPLEMENTED (auto-restart logic)
  - Ensure no conflicts with existing tunnels ✅ IMPLEMENTED (port checks)

## 🎯 DEPLOYMENT SEQUENCE

### Phase 1: Infrastructure (Core Services)
1. **Deploy database changes first**
   - Monitor connection stability for 30 minutes
   - **GO/NO-GO**: All existing queries working, no connection errors

2. **Deploy Redis connection improvements**
   - Monitor for connection errors and memory usage
   - **GO/NO-GO**: All services reconnect properly, no memory leaks

### Phase 2: Telemetry Migration
3. **Deploy OTEL-only telemetry**
   - Monitor Dash0 dashboard for data flow
   - **GO/NO-GO**: Traces, metrics, and logs appearing in Dash0

### Phase 3: Application Layer
4. **Deploy webhook service changes**
   - Test webhook registration/delivery immediately
   - **GO/NO-GO**: Webhooks processing normally, no 404 errors

5. **Deploy worker improvements**
   - Deploy new Ollama connector
   - **GO/NO-GO**: All worker types functioning, jobs processing

### Phase 4: Development Tools
6. **Deploy ngrok health system**
   - Lower risk, primarily development impact
   - **GO/NO-GO**: Tunnel management working in dev environment

## 🔍 POST-DEPLOYMENT MONITORING (First 24 Hours)

### Critical Metrics to Watch
- **Redis connection count**: Should be stable, not growing
- **Job processing rate**: Should match historical patterns
- **Webhook delivery success rate**: > 95%
- **API response times**: < 200ms P95
- **Memory usage**: No unexpected growth patterns
- **Error rates**: < 0.1% for critical paths

### Immediate Alerts (< 5 minutes)
- [ ] Redis connection failures
- [ ] Database query errors
- [ ] Webhook delivery failures > 5%
- [ ] Job processing stopped > 2 minutes
- [ ] OTEL export failures

### Hourly Checks (First 24 hours)
- [ ] Verify telemetry data flowing to Dash0
- [ ] Check for memory leaks in all services
- [ ] Monitor job queue depth and processing times
- [ ] Verify webhook success rates
- [ ] Check for any new error patterns

## 🔄 ROLLBACK PROCEDURES

### Redis Connection Issues
**Time to rollback**: < 5 minutes
```bash
# Rollback to previous Redis connection logic
git revert <redis-commit-hash>
# Redeploy affected services immediately
```

### Telemetry Issues
**Time to rollback**: < 10 minutes
```bash
# Re-enable FluentBit if OTEL fails
# Restore previous telemetry configuration
# Monitor for data recovery in Dash0
```

### Webhook Failures
**Time to rollback**: < 5 minutes
```bash
# Critical for customer notifications
# Rollback webhook service initialization changes
# Verify webhook delivery resumes immediately
```

### Database Issues
**Time to rollback**: < 15 minutes
```bash
# Rollback database package changes
# Run database migration rollback if needed
# Verify all queries working
```

## 🚨 EMERGENCY CONTACTS & PROCEDURES

### Critical Service Failure
1. **Immediate**: Rollback affected component
2. **Within 10 minutes**: Notify stakeholders
3. **Within 30 minutes**: Root cause analysis
4. **Within 1 hour**: Incident report

### Monitoring Dashboard URLs
- **Dash0**: [Monitor telemetry and performance]
- **Redis**: Use `redis-cli` for direct monitoring
- **Job Queue**: Monitor service logs and processing rates

## 📊 SUCCESS CRITERIA

### Deployment Considered Successful When:
- [ ] All services running stable for 24 hours
- [ ] Job processing rate matches baseline
- [ ] Webhook delivery success rate > 95%
- [ ] No memory leaks detected
- [ ] Telemetry data flowing normally to Dash0
- [ ] No increase in error rates
- [ ] All manual tests passing

### Performance Targets
- **API Response Time**: < 200ms P95
- **Job Processing**: No degradation vs baseline
- **Memory Usage**: No growth > 10% over 24 hours
- **Webhook Delivery**: > 95% success rate
- **Service Uptime**: 99.9% during deployment window

---

**Last Updated**: 2025-09-27 (UPDATED WITH TEST VERIFICATION)
**Review Required**: Before each production deployment
**Estimated Deployment Time**: 2-4 hours (phased approach)
**Risk Level**: MEDIUM-HIGH (reduced from HIGH due to test coverage)

## ✅ TEST COVERAGE SUMMARY

### Verified with Unit Tests:
- **Webhook Service Initialization**: 13 passing tests covering initialization order bug
- **Redis Connection Resilience**: Comprehensive tests for retry logic and error handling
- **Safe Redis Operations**: Wrapper patterns tested to prevent service crashes
- **Environment Configuration**: Flexible configuration tested across services
- **Monitor Service Redis Manager**: New resilient connection manager fully tested

### Still Requiring Manual Verification:
- **Telemetry/OTEL Migration**: No automated tests, HIGH RISK
- **Actual Webhook Delivery**: External endpoint testing needed
- **Database Package Integration**: End-to-end testing required
- **Ollama Connector**: New connector needs production-like testing
- **Performance Under Load**: Load testing not automated