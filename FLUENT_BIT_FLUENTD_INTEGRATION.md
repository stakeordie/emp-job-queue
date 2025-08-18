# Fluent Bit → Fluentd Integration Solutions

Based on research from official Fluent Bit and Fluentd documentation, here are two solutions to fix the communication issue between Fluent Bit and Fluentd.

## Current Issue

The logs show Fluent Bit connection errors:
```
[error] [http_client] broken connection to host.docker.internal:8888 ?
[error] [output:http:http.0] host.docker.internal:8888, HTTP status=0
```

And Fluentd parsing errors:
```
[warn]: #0 [http_input] unexpected error error="Could not parse data entirely"
```

## Solution 1: Fixed HTTP Configuration (CURRENT)

**Files changed:**
- `apps/api/fluent-bit-api.conf.template` - Fixed URI and format

**Changes made:**
- Changed URI from `/api.logs` to `/` (root path expected by Fluentd HTTP input)
- Changed Format from `json_lines` to `json` (better compatibility with Fluentd)

**Fluent Bit config:**
```ini
[OUTPUT]
    Name http
    Match api.*
    Host ${FLUENTD_HOST}
    Port ${FLUENTD_PORT}
    URI /
    Header Content-Type application/json
    tls ${FLUENTD_SECURE}
    tls.verify off
    Format json
```

**Fluentd config (existing):**
```xml
<source>
  @type http
  @id http_input
  port 8888
  bind 0.0.0.0
  body_size_limit 32m
  keepalive_timeout 10s
</source>
```

## Solution 2: Forward Protocol (RECOMMENDED)

**Why Forward Protocol is Better:**
- Binary efficiency (uses MessagePack instead of JSON)
- Built specifically for log streaming between Fluentd/Fluent Bit
- Includes acknowledgment support for reliable delivery
- Less prone to parsing errors

**Files created:**
- `apps/api/fluent-bit-api-forward.conf.template` - Forward protocol config

**Fluent Bit Forward config:**
```ini
[OUTPUT]
    Name forward
    Match api.*
    Host ${FLUENTD_HOST}
    Port 24224
    tls ${FLUENTD_SECURE}
    tls.verify off
```

**Fluentd Forward config (added):**
```xml
<source>
  @type forward
  @id forward_input
  port 24224
  bind 0.0.0.0
</source>
```

## Configuration Variables

**Environment variables needed:**
- `FLUENTD_HOST` - Host where Fluentd is running
- `FLUENTD_PORT` - Port for communication (8888 for HTTP, 24224 for Forward)
- `FLUENTD_SECURE` - "true" for TLS, "false" for plain connection

## Testing Recommendation

1. **Test Solution 1 first** (HTTP with fixes) since it requires no infrastructure changes
2. **If issues persist, switch to Solution 2** (Forward protocol) for more reliable communication

## Implementation Steps

### For Solution 1 (HTTP - Fixed):
1. The fixes are already applied to `fluent-bit-api.conf.template`
2. Restart the API container to regenerate config
3. Monitor Fluent Bit and Fluentd logs

### For Solution 2 (Forward Protocol):
1. Update entrypoint to use `fluent-bit-api-forward.conf.template`
2. Ensure Fluentd has Forward input (already added)
3. Update environment variables if needed (change port to 24224)
4. Restart both services

## Expected Result

After applying either solution:
- Fluent Bit connection errors should disappear
- Fluentd parsing errors should stop
- Validation logs with emojis should appear in Dash0 correctly
- Log pipeline: `file → fluent-bit → fluentd → dash0` should work end-to-end