# @emp/telemetry Migration Guide

## What Changed

The `@emp/telemetry` package has been completely rebuilt from scratch to send telemetry directly via OTLP to the telemetry collector. This ensures proper service attribution in Dash0.

**Old Architecture**: File logging + complex configuration
**New Architecture**: Direct OTLP export via OpenTelemetry SDK

## New API

```typescript
import { createTelemetryClient, SpanKind } from '@emp/telemetry';

// 1. Initialize client (do this once at startup)
const telemetry = createTelemetryClient({
  serviceName: 'emp-webhook',  // CRITICAL: This becomes service.name in Dash0
  serviceVersion: '1.0.0',
  environment: 'development',
  collectorEndpoint: 'http://localhost:4318' // Optional, defaults to env var
});

// 2. Create traced operations
await telemetry.withSpan('operation.name', async (span) => {
  // Your code here
  span.setAttributes({
    'custom.attribute': 'value',
    'user.id': userId
  });

  return result;
}, {
  kind: SpanKind.INTERNAL, // or SERVER, CLIENT, PRODUCER, CONSUMER
  attributes: { 'initial.attribute': 'value' }
});

// 3. Record metrics
telemetry.counter('requests.total', 1, { endpoint: '/api/health' });
telemetry.gauge('queue.size', 42, { queue: 'jobs' });
telemetry.histogram('request.duration', 123, { endpoint: '/api/data' });

// 4. Add events to current span (structured logging)
telemetry.addEvent('user.registered', {
  userId: '123',
  email: 'user@example.com'
});

// 5. Shutdown (flush remaining data)
await telemetry.shutdown();
```

## Migration Steps for Services

### 1. Remove old telemetry initialization

**OLD CODE (DELETE THIS)**:
```typescript
import { createTelemetryClient } from '@emp/telemetry';

const telemetryClient = createTelemetryClient('webhook');
await telemetryClient.startup({
  testConnections: false,
  logConfiguration: true,
  sendStartupPing: true,
});
await telemetryClient.log.info('message', { context });
await telemetry.otel.gauge('metric', value, labels);
```

### 2. Add new telemetry client

**NEW CODE**:
```typescript
import { createTelemetryClient, SpanKind } from '@emp/telemetry';

const telemetry = createTelemetryClient({
  serviceName: 'emp-webhook', // MUST match service name for Dash0
  serviceVersion: '1.0.0',
  environment: process.env.NODE_ENV || 'development',
});

// Create traced operations
await telemetry.withSpan('webhook.startup', async (span) => {
  span.setAttributes({
    startup_time_ms: Date.now() - startTime,
    port: config.port
  });

  // Your startup logic here
  await server.start();
}, { kind: SpanKind.INTERNAL });

// Record metrics
telemetry.counter('webhook.requests.total', 1, {
  endpoint: '/webhook',
  status: '200'
});
```

### 3. Remove all old @emp/core/otel usage

**No longer needed**: The old `initTracer()` from `@emp/core/otel` is replaced by the telemetry client.

## Key Benefits

1. **Correct Service Attribution**: Service names are preserved in Dash0
2. **Simpler API**: One client does everything (traces, metrics, events)
3. **OTLP Native**: Direct export to collector, no intermediate steps
4. **Automatic Context**: Spans automatically capture context
5. **Type Safety**: Full TypeScript support

## Environment Variables

- `OTEL_COLLECTOR_ENDPOINT`: OTLP collector URL (default: `http://localhost:4318`)
- `NODE_ENV`: Deployment environment (captured in traces)

## Troubleshooting

- **Service name shows as wrong service**: Check `serviceName` in `createTelemetryClient()`
- **No traces appearing**: Verify OTLP collector is running on port 4318
- **Port conflicts**: Set `OTEL_COLLECTOR_ENDPOINT` environment variable

## Complete Example

See `apps/webhook-service/src/index.ts` for a complete working example.
