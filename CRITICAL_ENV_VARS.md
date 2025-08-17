# CRITICAL: NO ENVIRONMENT VARIABLE FALLBACKS ALLOWED

**THIS IS A ZERO-TOLERANCE POLICY**

## RULE: FAIL FAST, FAIL LOUD

Every environment variable MUST be explicitly set. NO DEFAULTS. NO FALLBACKS.
If an env var is missing, the application MUST crash immediately with a clear error message.

## WHY THIS MATTERS

1. **Production Safety**: Fallbacks hide misconfigurations that can cause production disasters
2. **Debugging**: Silent fallbacks waste hours debugging "works on my machine" issues  
3. **Explicit Configuration**: Every deployment should explicitly declare its configuration
4. **Security**: Default values can expose services or use insecure settings

## ENFORCEMENT

- **NO**: `process.env.VAR || 'default'`  
- **NO**: `process.env.VAR || 3000`
- **NO**: `process.env.VAR || 'localhost'`
- **YES**: `if (!process.env.VAR) throw new Error('VAR is required')`
- **YES**: `process.env.VAR` (let it fail if undefined)

## REQUIRED ENVIRONMENT VARIABLES

### API Service
- `API_PORT` - NO DEFAULT (was 3331)
- `REDIS_URL` - NO DEFAULT (was redis://localhost:6379)
- `AUTH_TOKEN` - NO DEFAULT (was random string)
- `NODE_ENV` - NO DEFAULT (was development)
- `CORS_ORIGINS` - NO DEFAULT (was *)

### Worker Service  
- `HUB_REDIS_URL` - NO DEFAULT
- `MACHINE_ID` - NO DEFAULT (was hostname)
- `WORKER_CONNECTORS` - NO DEFAULT
- `WORKER_POLL_INTERVAL_MS` - NO DEFAULT (was 1000)
- `WORKER_HEARTBEAT_INTERVAL_MS` - NO DEFAULT (was 30000)

### OTEL/Telemetry
- `SERVICE_NAME` - NO DEFAULT (was emp-service)
- `SERVICE_VERSION` - NO DEFAULT (was 1.0.0)
- `MACHINE_ID` - NO DEFAULT (was unknown)
- `WORKER_ID` - NO DEFAULT (was unknown)

### Machine/PM2
- `MACHINE_NUM_GPUS` - NO DEFAULT (was 2)
- `MACHINE_HEALTH_PORT` - NO DEFAULT (was 9090)

## AUDIT LOG

Date: 2025-08-17
- Removed fallback from API_PORT
- Started systematic removal of ALL fallbacks
- Created this tracking document

## TODO
- [ ] Remove all worker service fallbacks
- [ ] Remove all webhook service fallbacks  
- [ ] Remove all OTEL client fallbacks
- [ ] Remove all machine/PM2 fallbacks
- [ ] Remove all connector fallbacks
- [ ] Add validation script to detect any remaining fallbacks