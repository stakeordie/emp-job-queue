# Logging System Update: Implementation Plan

**Status**: Ready for Implementation
**Date**: 2025-01-30
**Prerequisites**: OpenTelemetry Phase 1 & 2 Complete
**Related**: [Justification Document](./logs_update_justification.md)

## Implementation Overview

This document provides step-by-step implementation for migrating from console.* logging to Winston + OpenTelemetry integrated with Dash0.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Application Services                     │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌──────────────┐  │
│  │   API   │  │ Worker  │  │Collector│  │   Webhook    │  │
│  │         │  │         │  │         │  │              │  │
│  │ @emp/   │  │ @emp/   │  │ @emp/   │  │   @emp/      │  │
│  │ logger  │  │ logger  │  │ logger  │  │   logger     │  │
│  └────┬────┘  └────┬────┘  └────┬────┘  └──────┬───────┘  │
│       │            │            │               │           │
│       └────────────┴────────────┴───────────────┘           │
│                            │                                 │
└────────────────────────────┼─────────────────────────────────┘
                             │
                             │ OTLP HTTP (port 4318)
                             │ /v1/logs
                             ↓
                  ┌──────────────────────┐
                  │  OTLP Collector      │
                  │  localhost:4318      │
                  │                      │
                  │  Receives:           │
                  │  - Traces (/v1/traces)│
                  │  - Metrics(/v1/metrics)│
                  │  - Logs   (/v1/logs) │◄── NEW
                  └──────────┬───────────┘
                             │
                             │ OTLP HTTP
                             ↓
                  ┌──────────────────────┐
                  │       Dash0          │
                  │  (us-west-2.aws)     │
                  │                      │
                  │  Unified Platform:   │
                  │  - Logs              │
                  │  - Traces            │
                  │  - Metrics           │
                  │  - Correlation       │
                  └──────────────────────┘
```

## Phase 1: Create `@emp/logger` Package

### Step 1.1: Create Package Structure

```bash
mkdir -p packages/logger/src
cd packages/logger
```

### Step 1.2: Create `package.json`

```json
{
  "name": "@emp/logger",
  "version": "1.0.0",
  "description": "OpenTelemetry-integrated Winston logger for emp-job-queue",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "winston": "^3.17.0",
    "@opentelemetry/api": "^1.9.0",
    "@opentelemetry/api-logs": "^0.54.2",
    "@opentelemetry/instrumentation-winston": "^0.42.0",
    "@opentelemetry/sdk-logs": "^0.54.2",
    "@opentelemetry/exporter-logs-otlp-http": "^0.54.2",
    "@opentelemetry/resources": "^1.28.0",
    "@opentelemetry/semantic-conventions": "^1.28.0"
  },
  "devDependencies": {
    "@types/node": "^20.9.0",
    "typescript": "^5.2.2",
    "vitest": "^3.2.4"
  }
}
```

### Step 1.3: Create `tsconfig.json`

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

### Step 1.4: Create Logger Implementation

**File**: `packages/logger/src/index.ts`

```typescript
import winston from 'winston';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { Resource } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME
} from '@opentelemetry/semantic-conventions';
import {
  LoggerProvider,
  BatchLogRecordProcessor,
  ConsoleLogRecordExporter
} from '@opentelemetry/sdk-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { WinstonInstrumentation } from '@opentelemetry/instrumentation-winston';

// Log level mapping
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
} as const;

const WINSTON_TO_OTEL_SEVERITY: Record<string, SeverityNumber> = {
  error: SeverityNumber.ERROR,
  warn: SeverityNumber.WARN,
  info: SeverityNumber.INFO,
  http: SeverityNumber.INFO,
  debug: SeverityNumber.DEBUG,
};

export interface LoggerConfig {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  collectorEndpoint?: string;
  logLevel?: keyof typeof LOG_LEVELS;
  enableConsole?: boolean;
}

export function createLogger(config: LoggerConfig): winston.Logger {
  const {
    serviceName,
    serviceVersion = '1.0.0',
    environment = process.env.NODE_ENV || 'development',
    collectorEndpoint = process.env.OTEL_COLLECTOR_ENDPOINT || 'http://localhost:4318',
    logLevel = 'info',
    enableConsole = true,
  } = config;

  // Create OpenTelemetry Resource
  const resource = new Resource({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: serviceVersion,
    [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: environment,
  });

  // Create OTLP Log Exporter
  const otlpExporter = new OTLPLogExporter({
    url: `${collectorEndpoint}/v1/logs`,
    headers: {},
  });

  // Create Logger Provider
  const loggerProvider = new LoggerProvider({ resource });

  // Add batch processor with OTLP exporter
  loggerProvider.addLogRecordProcessor(
    new BatchLogRecordProcessor(otlpExporter, {
      scheduledDelayMillis: 1000, // Batch every 1 second
      exportTimeoutMillis: 30000,
      maxQueueSize: 2048,
      maxExportBatchSize: 512,
    })
  );

  // Set as global logger provider
  logs.setGlobalLoggerProvider(loggerProvider);

  // Create Winston Instrumentation
  const winstonInstrumentation = new WinstonInstrumentation();
  winstonInstrumentation.enable();

  // Winston format for structured logging
  const format = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  );

  // Console format for development
  const consoleFormat = winston.format.combine(
    winston.format.colorize({ all: true }),
    winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length > 0
        ? `\n${JSON.stringify(meta, null, 2)}`
        : '';
      return `${timestamp} [${level}] ${message}${metaStr}`;
    })
  );

  // Create transports
  const transports: winston.transport[] = [];

  if (enableConsole) {
    transports.push(
      new winston.transports.Console({
        format: consoleFormat,
        level: logLevel,
      })
    );
  }

  // Create Winston logger
  const logger = winston.createLogger({
    levels: LOG_LEVELS,
    format,
    transports,
    exitOnError: false,
  });

  // Add metadata to all logs
  logger.defaultMeta = {
    service: serviceName,
    environment,
  };

  // Log initialization
  logger.info('Logger initialized', {
    serviceName,
    serviceVersion,
    environment,
    collectorEndpoint,
    logLevel,
  });

  return logger;
}

// Convenience exports
export { winston };
export type Logger = winston.Logger;

// Shutdown function for graceful cleanup
export async function shutdownLogger(): Promise<void> {
  const loggerProvider = logs.getLoggerProvider() as LoggerProvider;
  if (loggerProvider?.shutdown) {
    await loggerProvider.shutdown();
  }
}
```

### Step 1.5: Install Dependencies

```bash
cd packages/logger
pnpm install
pnpm build
```

### Step 1.6: Add to Workspace

Update root `package.json` workspaces if not auto-detected:

```json
{
  "workspaces": [
    "apps/*",
    "packages/*",
    "tools"
  ]
}
```

## Phase 2: Integrate with API Service

### Step 2.1: Install Logger in API

```bash
cd apps/api
pnpm add @emp/logger@workspace:*
```

### Step 2.2: Initialize Logger in API

**File**: `apps/api/src/logger.ts` (new file)

```typescript
import { createLogger } from '@emp/logger';

export const logger = createLogger({
  serviceName: 'emp-api',
  serviceVersion: '1.0.0',
  environment: process.env.TELEMETRY_ENV || process.env.NODE_ENV || 'development',
  collectorEndpoint: process.env.OTEL_COLLECTOR_ENDPOINT || 'http://localhost:4318',
  logLevel: (process.env.LOG_LEVEL as any) || 'info',
  enableConsole: true,
});

export default logger;
```

### Step 2.3: Update API Index to Use Logger

**File**: `apps/api/src/index.ts`

```typescript
// Replace console.log calls with logger
import logger from './logger';

// Before:
console.log(`📋 Loaded environment from: ${envFile}`);

// After:
logger.info('Environment loaded', { profile, envFile });

// Before:
console.log('🚀 API Server initialized successfully');

// After:
logger.info('API server initialized');
```

### Step 2.4: Migration Pattern for API

Replace all console.* calls following this pattern:

```typescript
// Error logs
console.error('Redis connection failed', error);
→ logger.error('Redis connection failed', { error: error.message, stack: error.stack });

// Warning logs
console.warn('Job queue is full');
→ logger.warn('Job queue full', { queueSize: queue.length });

// Info logs (meaningful state changes)
console.log('Job submitted successfully', jobId);
→ logger.info('Job submitted', { job_id: jobId, customer_id, service_required });

// Debug logs (verbose operational details)
console.log('Processing job', jobData);
→ logger.debug('Processing job', { job_id: jobData.workflow_id, data: jobData });

// HTTP logs (request/response tracking)
console.log(`POST /api/jobs - 201`);
→ logger.http('Job creation request', {
    method: 'POST',
    path: '/api/jobs',
    status: 201,
    duration_ms: responseTime
  });
```

## Phase 3: Create E2E Log Test

### Step 3.1: Create Test File

**File**: `apps/api/src/__tests__/logging-e2e.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { createLogger, shutdownLogger } from '@emp/logger';

describe('Logging E2E Test', () => {
  let logger: any;

  beforeAll(() => {
    logger = createLogger({
      serviceName: 'emp-api-test',
      serviceVersion: '1.0.0',
      environment: 'testrunner',
      collectorEndpoint: 'http://localhost:4318',
      logLevel: 'debug',
      enableConsole: true,
    });
  });

  it('should send logs to OTLP collector', async () => {
    const testRunId = Date.now();

    // Emit various log levels
    logger.error('Test error log', { testRunId, type: 'error_test' });
    logger.warn('Test warning log', { testRunId, type: 'warn_test' });
    logger.info('Test info log', { testRunId, type: 'info_test' });
    logger.debug('Test debug log', { testRunId, type: 'debug_test' });

    // Wait for batch export
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Query Dash0 for logs
    const timeRange = {
      from: new Date(testRunId - 60000).toISOString(),
      to: new Date(Date.now() + 60000).toISOString(),
    };

    const dash0Response = await fetch('https://api.us-west-2.aws.dash0.com/api/logs/query', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'authorization': `Bearer ${process.env.DASH0_AUTH_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        timeRange,
        dataset: process.env.DASH0_DATASET || 'testrunner',
        query: {
          'service.name': 'emp-api-test',
          'testRunId': testRunId,
        },
      }),
    });

    expect(dash0Response.ok).toBe(true);
    const logs = await dash0Response.json();

    // Verify logs were received
    expect(logs.logs.length).toBeGreaterThanOrEqual(4);

    // Verify structured attributes
    const errorLog = logs.logs.find((log: any) => log.severity === 'ERROR');
    expect(errorLog).toBeDefined();
    expect(errorLog.attributes.testRunId).toBe(testRunId);

    await shutdownLogger();
  }, 30000);
});
```

### Step 3.2: Run E2E Test

```bash
cd apps/api
EMP_PROFILE=testrunner pnpm test src/__tests__/logging-e2e.test.ts
```

## Phase 4: Roll Out to Other Services

### Step 4.1: Worker Service

```bash
cd apps/worker
pnpm add @emp/logger@workspace:*
```

Create `apps/worker/src/logger.ts`:

```typescript
import { createLogger } from '@emp/logger';

export const logger = createLogger({
  serviceName: 'emp-worker',
  serviceVersion: '1.0.0',
  environment: process.env.TELEMETRY_ENV || process.env.NODE_ENV || 'development',
  collectorEndpoint: process.env.OTEL_COLLECTOR_ENDPOINT || 'http://localhost:4318',
  logLevel: (process.env.LOG_LEVEL as any) || 'info',
});

export default logger;
```

**Migration Strategy**:
- Replace console.* calls in `redis-direct-worker.ts`
- Update connector logging in `connectors/` directory
- Preserve existing OpenAI Winston logger (it's specialized)

### Step 4.2: Telemetry Collector Service

```bash
cd apps/telemetry-collector
pnpm add @emp/logger@workspace:*
```

Create `apps/telemetry-collector/src/logger.ts` (same pattern as API)

**Migration Strategy**:
- Replace console.* in `index.ts`, `event-processor.ts`, `official-otlp-forwarder.ts`
- Add structured logging for event processing pipeline
- Log collector health and performance metrics

### Step 4.3: Webhook Service

```bash
cd apps/webhook-service
pnpm add @emp/logger@workspace:*
```

Create `apps/webhook-service/src/logger.ts` (same pattern as API)

**Migration Strategy**:
- Replace console.* calls
- Log webhook deliveries with structured attributes
- Track webhook retry attempts

## Phase 5: Verification & Testing

### Step 5.1: Verify OTLP Collector Configuration

**File**: `apps/telemetry-collector/src/index.ts`

Ensure collector accepts logs on `/v1/logs`:

```typescript
// Should already have traces and metrics endpoints
app.post('/v1/traces', ...);
app.post('/v1/metrics', ...);

// Add logs endpoint
app.post('/v1/logs', async (req, res) => {
  try {
    logger.debug('Received OTLP logs', {
      resourceLogs: req.body.resourceLogs?.length
    });

    // Forward to Dash0
    const dash0Response = await fetch(dash0LogsEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${dash0AuthToken}`,
      },
      body: JSON.stringify(req.body),
    });

    if (!dash0Response.ok) {
      logger.error('Failed to forward logs to Dash0', {
        status: dash0Response.status,
        statusText: dash0Response.statusText,
      });
    }

    res.status(200).send({ status: 'ok' });
  } catch (error) {
    logger.error('Error processing OTLP logs', { error });
    res.status(500).send({ error: 'Internal server error' });
  }
});
```

### Step 5.2: Test Complete Pipeline

```bash
# 1. Start OTLP collector
pnpm dev:telcollect testrunner

# 2. Start API with logging
EMP_PROFILE=testrunner pnpm dev:api

# 3. Trigger log events
curl -X POST http://localhost:3331/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "test-log-workflow",
    "customer_id": "test-customer",
    "service_required": "comfyui",
    "priority": 50
  }'

# 4. Check Dash0 for logs
# Query: service.name="emp-api" AND workflow_id="test-log-workflow"
```

### Step 5.3: Verify Trace Context Correlation

In Dash0 UI:
1. Find a trace for a job submission
2. Click on trace to see details
3. Verify logs panel shows correlated logs
4. Verify trace_id and span_id in log attributes

## Log Level Guidelines

### Error (logger.error)
**Use when**: Something failed that requires immediate attention
- Database connection failures
- Redis connection errors
- Job processing failures
- External API errors (5xx responses)
- Unhandled exceptions

**Example**:
```typescript
logger.error('Job processing failed', {
  job_id: jobData.workflow_id,
  step_id: jobId,
  error: error.message,
  stack: error.stack,
  customer_id: jobData.customer_id,
});
```

### Warn (logger.warn)
**Use when**: Something unexpected happened but system continues
- Job queue near capacity
- Slow response times
- Retry attempts
- Configuration issues (non-blocking)
- External API errors (4xx responses)

**Example**:
```typescript
logger.warn('Job queue approaching capacity', {
  current_size: queueSize,
  max_size: maxQueueSize,
  utilization_percent: (queueSize / maxQueueSize) * 100,
});
```

### Info (logger.info)
**Use when**: Significant state changes or milestones
- Service startup/shutdown
- Job lifecycle events (received, started, completed)
- Configuration loaded
- External service connections established
- Business-level events

**Example**:
```typescript
logger.info('Job completed successfully', {
  job_id: jobData.workflow_id,
  step_id: jobId,
  duration_ms: completionTime - startTime,
  service_required: jobData.service_required,
});
```

### HTTP (logger.http)
**Use when**: HTTP request/response tracking
- API endpoint calls
- External API requests
- WebSocket connections
- Health check responses

**Example**:
```typescript
logger.http('Job submission request', {
  method: 'POST',
  path: '/api/jobs',
  status: 201,
  duration_ms: responseTime,
  job_id: result.job_id,
  client_ip: req.ip,
});
```

### Debug (logger.debug)
**Use when**: Detailed operational information for troubleshooting
- Function entry/exit
- Internal state changes
- Detailed processing steps
- Cache hits/misses
- Queue operations

**Example**:
```typescript
logger.debug('Attempting to claim job from Redis', {
  worker_id: workerId,
  capabilities: workerCapabilities,
  queue_name: queueName,
});
```

## Migration Checklist

### Per Service

- [ ] Install `@emp/logger` package
- [ ] Create `src/logger.ts` with service-specific config
- [ ] Replace all `console.error()` with `logger.error()`
- [ ] Replace all `console.warn()` with `logger.warn()`
- [ ] Replace all `console.log()` with appropriate level
- [ ] Replace all `console.info()` with `logger.info()`
- [ ] Replace all `console.debug()` with `logger.debug()`
- [ ] Add structured attributes to all logs
- [ ] Test locally with OTLP collector
- [ ] Verify logs in Dash0
- [ ] Verify trace context correlation
- [ ] Update service documentation

### System-Wide

- [ ] Create `@emp/logger` package
- [ ] API service integration
- [ ] API E2E test (logs → Dash0)
- [ ] Worker service integration
- [ ] Telemetry collector integration
- [ ] Telemetry collector `/v1/logs` endpoint
- [ ] Webhook service integration
- [ ] Update CLAUDE.md with logging guidelines
- [ ] Create migration guide for future services
- [ ] Document Dash0 log queries

## Environment Variables

Add to all service `.env` files:

```bash
# Logging Configuration
LOG_LEVEL=info                           # error|warn|info|http|debug
OTEL_COLLECTOR_ENDPOINT=http://localhost:4318
TELEMETRY_ENV=testrunner                # testrunner|development|production
```

## Success Criteria

### Technical
- ✅ All services send logs to OTLP collector on port 4318
- ✅ Logs appear in Dash0 within 5 seconds
- ✅ Trace context automatically included in logs
- ✅ Logs queryable by service.name, trace_id, job_id, customer_id
- ✅ No console.* calls remaining in production code

### Operational
- ✅ Can query "all errors for customer X" in Dash0
- ✅ Can see logs for a specific trace/job in Dash0
- ✅ Can filter logs by log level
- ✅ Can build dashboards from structured log attributes
- ✅ Logs from ephemeral machines preserved after scale-down

## Rollback Plan

If issues arise:

1. **Immediate**: Services still work (logger added alongside console.*)
2. **Quick rollback**: Remove `@emp/logger` import, keep console.*
3. **Clean rollback**: Revert to previous commit before logger integration

**Risk**: Low - logger is additive, not replacing critical functionality

## Timeline

| Phase | Duration | Effort |
|-------|----------|--------|
| Phase 1: Create @emp/logger | 4 hours | 1 person |
| Phase 2: API integration | 2 hours | 1 person |
| Phase 3: E2E test | 2 hours | 1 person |
| Phase 4: Other services | 6 hours | 1 person |
| Phase 5: Verification | 3 hours | 1 person |
| **Total** | **17 hours** | **2-3 days** |

## Next Steps

1. Review and approve this implementation plan
2. Create `@emp/logger` package (Phase 1)
3. Integrate with API service (Phase 2)
4. Create and run E2E test (Phase 3)
5. Roll out to remaining services (Phase 4)
6. Final verification in Dash0 (Phase 5)

---

**Related Documents**:
- [Logging System Update: Justification](./logs_update_justification.md)
- [OpenTelemetry Migration Guide](../telemetry/migration-guide.md)
- [Dash0 Integration Guide](https://www.dash0.com/guides/winston-production-logging-nodejs)
