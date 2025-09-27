# Redis Event Stream + Single Collector Container Architecture - Execution Plan

**Date:** September 27, 2025
**Status:** Ready for Implementation
**Priority:** High - Critical for Development Productivity
**Initiative:** Simplified Telemetry & Observability
**Estimated Duration:** 5-7 days (Core implementation + Basic integration)

## Implementation Strategy

### Core Philosophy
**Incremental Implementation with Immediate Value**
- Week 1: Core infrastructure + API server integration (immediate debugging value)
- Week 2: Worker and machine service integration (complete event coverage)
- Week 3: Advanced debugging tools + Dash0 forwarding (production readiness)

### Success Definition
- **Primary Goal**: Reduce distributed debugging time from 45 minutes to <15 minutes
- **Secondary Goal**: Establish foundation for production observability
- **Constraints**: <5% memory overhead, zero service performance impact

## Phase 1: Core Infrastructure (Days 1-2)

### Task 1.1: Redis Event Stream Foundation
**Duration:** 4 hours
**Location:** `packages/core/src/telemetry/`

#### Implementation Steps

1. **Create Event Client Library**
```typescript
// packages/core/src/telemetry/event-client.ts
export interface TelemetryEvent {
  timestamp: number;
  service: string;
  eventType: string;
  traceId: string;
  data: Record<string, any>;

  // Optional correlation IDs
  jobId?: string;
  workerId?: string;
  machineId?: string;
  userId?: string;
}

export class EventClient {
  constructor(private serviceName: string) {}

  async event(type: string, data: Record<string, any> = {}): Promise<void> {
    // Fire-and-forget Redis Stream emission
  }

  // Convenience methods
  async jobEvent(jobId: string, type: string, data?: Record<string, any>): Promise<void>
  async workerEvent(workerId: string, type: string, data?: Record<string, any>): Promise<void>
  async machineEvent(machineId: string, type: string, data?: Record<string, any>): Promise<void>
}
```

2. **Redis Stream Configuration**
```typescript
// packages/core/src/telemetry/stream-config.ts
export const TELEMETRY_CONFIG = {
  streamName: 'emp:events',
  maxLength: 10000, // Keep last 10k events
  retention: 24 * 60 * 60 * 1000, // 24 hours
  trimStrategy: 'MAXLEN' // Trim by count, not time
};
```

3. **Service-Specific Clients**
```typescript
// packages/core/src/telemetry/index.ts
export const apiTelemetry = new EventClient('api-server');
export const workerTelemetry = new EventClient('worker');
export const machineTelemetry = new EventClient('machine');
export const webhookTelemetry = new EventClient('webhook-service');
export const monitorTelemetry = new EventClient('monitor');
```

**Acceptance Criteria:**
- Event client emits events to Redis Stream without blocking
- Events include proper timestamp and correlation IDs
- Silent failure handling prevents service disruption
- Unit tests cover event emission and error scenarios

### Task 1.2: Telemetry Collector Container
**Duration:** 6 hours
**Location:** `apps/telemetry-collector/`

#### Implementation Steps

1. **Container Structure**
```
apps/telemetry-collector/
├── Dockerfile
├── package.json
├── src/
│   ├── collector.js           # Main collector process
│   ├── redis-reader.js        # Redis Stream consumer
│   ├── dash0-forwarder.js     # OpenTel format + Dash0 forwarding
│   ├── file-logger.js         # Development mode file logging
│   └── config.js              # Environment configuration
└── docker-compose.yml         # Local development integration
```

2. **Redis Stream Consumer**
```javascript
// src/redis-reader.js
class RedisStreamReader {
  constructor(redisClient, streamName) {
    this.redis = redisClient;
    this.streamName = streamName;
    this.lastId = '$'; // Start from latest
  }

  async start() {
    while (true) {
      try {
        const streams = await this.redis.xread(
          'BLOCK', 1000,
          'STREAMS', this.streamName, this.lastId
        );

        if (streams) {
          await this.processEvents(streams[0][1]);
        }
      } catch (error) {
        console.error('Stream read error:', error);
        await this.delay(5000); // Backoff on error
      }
    }
  }

  async processEvents(events) {
    for (const [id, fields] of events) {
      const event = this.parseEvent(fields);
      await this.emit('event', event);
      this.lastId = id;
    }
  }
}
```

3. **Development Mode File Logger**
```javascript
// src/file-logger.js
class FileLogger {
  constructor(logPath = './telemetry-events.log') {
    this.logPath = logPath;
    this.stream = fs.createWriteStream(logPath, { flags: 'a' });
  }

  async logEvent(event) {
    const logLine = JSON.stringify({
      timestamp: new Date(event.timestamp).toISOString(),
      service: event.service,
      eventType: event.eventType,
      ...event.data
    }) + '\n';

    this.stream.write(logLine);
  }
}
```

4. **Environment Configuration**
```javascript
// src/config.js
module.exports = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  },

  dash0: {
    enabled: process.env.DASH0_ENABLED === 'true',
    endpoint: process.env.DASH0_OTEL_ENDPOINT,
    apiKey: process.env.DASH0_API_KEY
  },

  development: {
    fileLogging: process.env.NODE_ENV !== 'production',
    logPath: './logs/telemetry-events.log'
  }
};
```

**Acceptance Criteria:**
- Collector reads Redis Stream events continuously
- Development mode logs events to local file
- Container starts with existing docker-compose workflow
- Memory usage <30MB
- Handles Redis connection failures gracefully

### Task 1.3: Development Integration
**Duration:** 2 hours
**Location:** Project root configuration

#### Implementation Steps

1. **Docker Compose Integration**
```yaml
# docker-compose.yml (add service)
services:
  telemetry-collector:
    build: ./apps/telemetry-collector
    depends_on:
      - redis
    environment:
      - REDIS_HOST=redis
      - NODE_ENV=development
      - DASH0_ENABLED=false
    volumes:
      - ./logs/telemetry:/app/logs
    restart: unless-stopped
```

2. **Development Scripts**
```json
// package.json (add scripts)
{
  "scripts": {
    "dev:telemetry": "docker-compose up telemetry-collector",
    "debug:events": "node tools/debug-events/cli.js",
    "debug:events:stream": "node tools/debug-events/stream.js",
    "debug:events:search": "node tools/debug-events/search.js"
  }
}
```

3. **Log Directory Setup**
```bash
mkdir -p logs/telemetry
echo "logs/telemetry/*.log" >> .gitignore
```

**Acceptance Criteria:**
- Collector starts with single `pnpm dev:telemetry` command
- Events written to `logs/telemetry/events.log`
- Integration with existing development workflow
- No impact on current development commands

## Phase 2: API Server Integration (Day 3)

### Task 2.1: Core Event Emission Points
**Duration:** 4 hours
**Location:** `apps/api/src/`

#### Key Integration Points

1. **Server Lifecycle Events**
```typescript
// apps/api/src/lightweight-api-server.ts
import { apiTelemetry } from '@emp/core/telemetry';

async function startServer() {
  await apiTelemetry.event('server.starting', { port: PORT });

  const server = app.listen(PORT, () => {
    apiTelemetry.event('server.ready', {
      port: PORT,
      pid: process.pid,
      version: process.env.npm_package_version
    });
  });

  process.on('SIGTERM', () => {
    apiTelemetry.event('server.shutting_down', { reason: 'SIGTERM' });
  });
}
```

2. **Job Lifecycle Events**
```typescript
// apps/api/src/routes/jobs.ts
app.post('/jobs', async (req, res) => {
  const jobId = generateJobId();

  await apiTelemetry.jobEvent(jobId, 'job.created', {
    userId: req.user.id,
    jobType: req.body.type,
    priority: req.body.priority || 'normal'
  });

  try {
    await createJobInRedis(jobData);
    await apiTelemetry.jobEvent(jobId, 'job.queued', { queueName: 'default' });
  } catch (error) {
    await apiTelemetry.jobEvent(jobId, 'job.creation_failed', {
      error: error.message
    });
    throw error;
  }
});
```

3. **Redis Function Events**
```typescript
// apps/api/src/services/redis-functions.ts
async function executeRedisFunction(functionName: string, args: any[]) {
  const traceId = generateTraceId();

  await apiTelemetry.event('redis_function.executing', {
    functionName,
    argCount: args.length,
    traceId
  });

  try {
    const result = await redis.fcall(functionName, 0, ...args);

    await apiTelemetry.event('redis_function.completed', {
      functionName,
      resultSize: JSON.stringify(result).length,
      traceId
    });

    return result;
  } catch (error) {
    await apiTelemetry.event('redis_function.failed', {
      functionName,
      error: error.message,
      traceId
    });
    throw error;
  }
}
```

4. **WebSocket Events**
```typescript
// apps/api/src/websocket/events.ts
io.on('connection', (socket) => {
  apiTelemetry.event('websocket.connected', {
    socketId: socket.id,
    userId: socket.user?.id
  });

  socket.on('subscribe', (channel) => {
    apiTelemetry.event('websocket.subscribed', {
      socketId: socket.id,
      channel
    });
  });

  socket.on('disconnect', (reason) => {
    apiTelemetry.event('websocket.disconnected', {
      socketId: socket.id,
      reason
    });
  });
});
```

**Acceptance Criteria:**
- API server emits events for all major lifecycle points
- Job creation, queuing, and completion events captured
- WebSocket connection events tracked
- Redis function execution events logged
- No performance impact on API response times

### Task 2.2: Error and Edge Case Events
**Duration:** 2 hours

#### Implementation Steps

1. **Error Handling Events**
```typescript
// Global error handler integration
app.use((error, req, res, next) => {
  apiTelemetry.event('api.error', {
    route: req.path,
    method: req.method,
    error: error.message,
    statusCode: error.statusCode || 500,
    userId: req.user?.id
  });

  // Existing error handling...
});
```

2. **Health Check Events**
```typescript
// apps/api/src/routes/health.ts
app.get('/health', async (req, res) => {
  const healthStatus = await checkSystemHealth();

  await apiTelemetry.event('health_check.performed', {
    status: healthStatus.overall,
    redis: healthStatus.redis,
    responseTimeMs: Date.now() - req.startTime
  });

  res.json(healthStatus);
});
```

**Acceptance Criteria:**
- Error events provide actionable debugging information
- Health check events tracked for monitoring
- Edge cases covered (rate limiting, validation failures)

## Phase 3: Basic Debugging Tools (Day 4)

### Task 3.1: Event Query Tools
**Duration:** 6 hours
**Location:** `tools/debug-events/`

#### Implementation Steps

1. **CLI Search Tool**
```javascript
// tools/debug-events/search.js
const yargs = require('yargs');
const redis = require('redis');

async function searchEvents(options) {
  const client = redis.createClient();

  // Build Redis Stream search query
  const searchArgs = ['XRANGE', 'emp:events'];

  if (options.since) {
    searchArgs.push(options.since);
  } else {
    searchArgs.push('-'); // Start from beginning
  }

  if (options.until) {
    searchArgs.push(options.until);
  } else {
    searchArgs.push('+'); // Until end
  }

  const events = await client.sendCommand(searchArgs);

  // Filter by criteria
  const filtered = events.filter(event => {
    if (options.jobId && !event.data.jobId?.includes(options.jobId)) return false;
    if (options.service && event.service !== options.service) return false;
    if (options.eventType && !event.eventType.includes(options.eventType)) return false;
    return true;
  });

  // Format output
  filtered.forEach(event => {
    console.log(`${formatTimestamp(event.timestamp)} [${event.service}] ${event.eventType}`);
    if (event.jobId) console.log(`  Job: ${event.jobId}`);
    if (Object.keys(event.data).length > 0) {
      console.log(`  Data: ${JSON.stringify(event.data, null, 2)}`);
    }
    console.log('');
  });
}

// CLI interface
yargs
  .command('search', 'Search telemetry events', {
    jobId: { type: 'string', describe: 'Filter by job ID' },
    service: { type: 'string', describe: 'Filter by service name' },
    eventType: { type: 'string', describe: 'Filter by event type' },
    since: { type: 'string', describe: 'Events since timestamp' },
    until: { type: 'string', describe: 'Events until timestamp' },
    last: { type: 'string', describe: 'Last N time (e.g., "1h", "30m")' }
  })
  .parse();
```

2. **Real-time Stream Monitor**
```javascript
// tools/debug-events/stream.js
async function streamEvents(options = {}) {
  const client = redis.createClient();
  let lastId = '$'; // Start from latest

  console.log('Monitoring event stream (Ctrl+C to exit)...\n');

  while (true) {
    try {
      const streams = await client.xread(
        'BLOCK', 1000,
        'STREAMS', 'emp:events', lastId
      );

      if (streams) {
        const events = streams[0][1];
        events.forEach(([id, fields]) => {
          const event = parseRedisEvent(fields);

          if (matchesFilter(event, options)) {
            console.log(`${formatTimestamp(event.timestamp)} [${event.service}] ${event.eventType}`);
            if (event.jobId) console.log(`  Job: ${event.jobId}`);
            console.log('');
          }

          lastId = id;
        });
      }
    } catch (error) {
      console.error('Stream error:', error.message);
      await delay(5000);
    }
  }
}
```

3. **Job Timeline Visualizer**
```javascript
// tools/debug-events/timeline.js
async function showJobTimeline(jobId) {
  const events = await searchEventsByJobId(jobId);

  console.log(`\nJob Timeline: ${jobId}\n`);
  console.log('Time'.padEnd(12) + 'Service'.padEnd(15) + 'Event'.padEnd(25) + 'Details');
  console.log('-'.repeat(70));

  events.forEach(event => {
    const time = formatTime(event.timestamp);
    const service = event.service.padEnd(15);
    const eventType = event.eventType.padEnd(25);
    const details = formatEventDetails(event.data);

    console.log(`${time} ${service} ${eventType} ${details}`);
  });

  // Show timeline gaps
  const gaps = findTimelineGaps(events);
  if (gaps.length > 0) {
    console.log('\n⚠️  Timeline Gaps Detected:');
    gaps.forEach(gap => {
      console.log(`  ${gap.duration}ms gap between ${gap.before} and ${gap.after}`);
    });
  }
}
```

**Acceptance Criteria:**
- Search events by job ID, service, event type, and time range
- Real-time event monitoring for active debugging
- Timeline visualization shows event flow and gaps
- Tools handle large event volumes efficiently

### Task 3.2: Package.json Integration
**Duration:** 1 hour

#### Implementation Steps

1. **Debug Commands**
```json
// package.json
{
  "scripts": {
    "debug:events": "node tools/debug-events/search.js search",
    "debug:events:stream": "node tools/debug-events/stream.js",
    "debug:events:job": "node tools/debug-events/timeline.js",
    "debug:events:health": "node tools/debug-events/health.js"
  }
}
```

2. **Usage Examples Documentation**
```bash
# Search for specific job events
pnpm debug:events --jobId="job_123"

# Monitor real-time events for API service
pnpm debug:events:stream --service="api-server"

# Show job timeline with gaps analysis
pnpm debug:events:job job_456

# Health check for event system
pnpm debug:events:health
```

**Acceptance Criteria:**
- All debug commands accessible via `pnpm` scripts
- Clear help text and usage examples
- Error handling for missing parameters
- Integration with existing development workflow

## Phase 4: Worker Service Integration (Day 5)

### Task 4.1: Worker Event Integration
**Duration:** 4 hours
**Location:** `apps/worker/src/`

#### Key Integration Points

1. **Worker Lifecycle Events**
```typescript
// apps/worker/src/redis-direct-worker-client.ts
import { workerTelemetry } from '@emp/core/telemetry';

class RedisDirectWorkerClient {
  async start() {
    await workerTelemetry.workerEvent(this.workerId, 'worker.starting', {
      capabilities: this.capabilities,
      machineId: this.machineId
    });

    // Existing startup logic...

    await workerTelemetry.workerEvent(this.workerId, 'worker.ready', {
      connectorTypes: this.getConnectorTypes()
    });
  }

  async claimJob() {
    const job = await this.redis.fcall('findMatchingJob', 0, this.capabilities);

    if (job) {
      await workerTelemetry.jobEvent(job.id, 'job.claimed', {
        workerId: this.workerId,
        claimTimeMs: Date.now() - job.createdAt
      });
    }

    return job;
  }
}
```

2. **Connector Events**
```typescript
// apps/worker/src/connectors/base-connector.ts
abstract class BaseConnector {
  async processJob(job: Job): Promise<JobResult> {
    await workerTelemetry.jobEvent(job.id, 'connector.processing_started', {
      connectorType: this.getType(),
      workerId: this.workerId
    });

    try {
      const result = await this.executeJob(job);

      await workerTelemetry.jobEvent(job.id, 'connector.processing_completed', {
        connectorType: this.getType(),
        processingTimeMs: Date.now() - job.startTime,
        resultSize: JSON.stringify(result).length
      });

      return result;
    } catch (error) {
      await workerTelemetry.jobEvent(job.id, 'connector.processing_failed', {
        connectorType: this.getType(),
        error: error.message
      });
      throw error;
    }
  }
}
```

3. **Job Progress Events**
```typescript
// apps/worker/src/services/job-progress.ts
class JobProgressTracker {
  async updateProgress(jobId: string, progress: number, details?: string) {
    await workerTelemetry.jobEvent(jobId, 'job.progress_updated', {
      progress,
      details,
      timestamp: Date.now()
    });

    // Existing progress update logic...
  }

  async markCompleted(jobId: string, result: JobResult) {
    await workerTelemetry.jobEvent(jobId, 'job.completed', {
      resultType: typeof result,
      hasAssets: result.assets?.length > 0,
      completionTimeMs: Date.now() - result.startTime
    });
  }
}
```

**Acceptance Criteria:**
- Worker startup and shutdown events captured
- Job claiming and processing events logged
- Progress updates tracked throughout job execution
- Connector-specific events for different AI services

### Task 4.2: Machine Integration
**Duration:** 3 hours
**Location:** `apps/machines/basic_machine/`

#### Implementation Steps

1. **Machine Lifecycle Events**
```typescript
// apps/machines/basic_machine/src/machine-startup.ts
import { machineTelemetry } from '@emp/core/telemetry';

async function startMachine() {
  const machineId = process.env.MACHINE_ID;

  await machineTelemetry.machineEvent(machineId, 'machine.starting', {
    imageVersion: process.env.IMAGE_VERSION,
    capabilities: await detectCapabilities()
  });

  // Hardware detection
  const hardware = await detectHardware();
  await machineTelemetry.machineEvent(machineId, 'machine.hardware_detected', {
    gpuCount: hardware.gpus.length,
    totalMemoryMB: hardware.memoryMB,
    diskSpaceGB: hardware.diskSpaceGB
  });

  // Service startup
  await startPM2Services();
  await machineTelemetry.machineEvent(machineId, 'machine.services_ready', {
    services: await listPM2Services()
  });

  await machineTelemetry.machineEvent(machineId, 'machine.ready', {
    startupTimeMs: Date.now() - machineStartTime
  });
}
```

2. **PM2 Service Events**
```typescript
// apps/machines/basic_machine/src/services/pm2-manager.ts
class PM2Manager {
  async startService(serviceName: string) {
    await machineTelemetry.event('pm2.service_starting', {
      serviceName,
      machineId: process.env.MACHINE_ID
    });

    try {
      await pm2.start(serviceConfig);
      await machineTelemetry.event('pm2.service_started', {
        serviceName,
        pid: result.pid
      });
    } catch (error) {
      await machineTelemetry.event('pm2.service_failed', {
        serviceName,
        error: error.message
      });
    }
  }
}
```

**Acceptance Criteria:**
- Machine startup sequence fully tracked
- PM2 service lifecycle events captured
- Hardware detection events logged
- Service health events monitored

## Phase 5: Testing and Validation (Day 6)

### Task 5.1: Integration Testing
**Duration:** 4 hours

#### Test Scenarios

1. **End-to-End Event Flow Test**
```typescript
// tests/integration/telemetry-flow.test.ts
describe('Telemetry Event Flow', () => {
  it('should track complete job lifecycle', async () => {
    // Create job via API
    const jobId = await createTestJob();

    // Wait for events to propagate
    await delay(2000);

    // Verify event sequence
    const events = await getEventsForJob(jobId);

    expect(events).toContainEqual(
      expect.objectContaining({
        eventType: 'job.created',
        service: 'api-server'
      })
    );

    expect(events).toContainEqual(
      expect.objectContaining({
        eventType: 'job.queued',
        service: 'api-server'
      })
    );

    expect(events).toContainEqual(
      expect.objectContaining({
        eventType: 'job.claimed',
        service: 'worker'
      })
    );
  });
});
```

2. **Performance Impact Test**
```typescript
describe('Telemetry Performance', () => {
  it('should not impact API response times', async () => {
    const baselineTime = await measureAPIResponseTime();

    // Enable telemetry
    process.env.TELEMETRY_ENABLED = 'true';

    const telemetryTime = await measureAPIResponseTime();

    // Should be <5% impact
    expect(telemetryTime).toBeLessThan(baselineTime * 1.05);
  });
});
```

3. **Error Handling Test**
```typescript
describe('Telemetry Error Handling', () => {
  it('should continue service operation when Redis unavailable', async () => {
    // Stop Redis
    await stopRedis();

    // API should still work
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);

    // Start Redis and verify event emission resumes
    await startRedis();
    await delay(1000);

    const events = await getRecentEvents();
    expect(events.length).toBeGreaterThan(0);
  });
});
```

**Acceptance Criteria:**
- All integration tests pass
- Performance impact <5% on API response times
- Error handling prevents service disruption
- Event correlation works across services

### Task 5.2: Documentation and Training
**Duration:** 2 hours

#### Deliverables

1. **Developer Guide**
```markdown
# Telemetry Event Guide

## Quick Start
```typescript
import { apiTelemetry } from '@emp/core/telemetry';

// Emit simple event
await apiTelemetry.event('user.login', { userId: '123' });

// Emit job-related event
await apiTelemetry.jobEvent('job_456', 'processing.started');
```

## Debugging Commands
```bash
# Show events for specific job
pnpm debug:events --jobId="job_123"

# Monitor real-time events
pnpm debug:events:stream

# Show job timeline
pnpm debug:events:job job_456
```
```

2. **Event Standards Documentation**
```markdown
# Event Naming Standards

## Event Types
- Lifecycle: `{entity}.{action}` (user.login, job.created)
- Progress: `{entity}.{status}_updated` (job.progress_updated)
- Errors: `{entity}.{action}_failed` (connector.processing_failed)

## Required Fields
- All events: timestamp, service, eventType, traceId
- Job events: jobId
- Worker events: workerId
- Machine events: machineId
```

**Acceptance Criteria:**
- Clear documentation for adding events
- Debugging command reference
- Event naming standards established
- Developer onboarding guide complete

## Phase 6: Advanced Features (Day 7)

### Task 6.1: Dash0 Integration
**Duration:** 4 hours

#### Implementation Steps

1. **OpenTelemetry Format Translation**
```javascript
// apps/telemetry-collector/src/otel-translator.js
class OtelTranslator {
  translateEvent(event) {
    return {
      timestamp: event.timestamp * 1000000, // Convert to nanoseconds
      trace_id: event.traceId,
      span_id: this.generateSpanId(),
      name: event.eventType,
      attributes: {
        'service.name': event.service,
        'job.id': event.jobId,
        'worker.id': event.workerId,
        'machine.id': event.machineId,
        ...event.data
      }
    };
  }
}
```

2. **Dash0 Forwarder**
```javascript
// apps/telemetry-collector/src/dash0-forwarder.js
class Dash0Forwarder {
  constructor(endpoint, apiKey) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.batch = [];
    this.batchTimer = null;
  }

  async sendEvent(event) {
    this.batch.push(event);

    if (this.batch.length >= 100) {
      await this.flush();
    } else if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => this.flush(), 5000);
    }
  }

  async flush() {
    if (this.batch.length === 0) return;

    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ spans: this.batch })
      });

      this.batch = [];
      this.batchTimer = null;
    } catch (error) {
      console.error('Dash0 forwarding failed:', error);
      // Keep events in batch for retry
    }
  }
}
```

**Acceptance Criteria:**
- Events forwarded to Dash0 in OpenTelemetry format
- Batch processing for efficiency
- Error handling with retry logic
- Production configuration ready

### Task 6.2: Advanced Debugging Features
**Duration:** 2 hours

#### Implementation Steps

1. **Event Correlation Analysis**
```javascript
// tools/debug-events/correlate.js
async function analyzeCorrelation(jobId) {
  const events = await getEventsForJob(jobId);

  // Find gaps in timeline
  const gaps = findTimelineGaps(events);

  // Find related events by trace ID
  const relatedEvents = await getEventsByTraceId(events[0].traceId);

  // Analyze service handoffs
  const handoffs = analyzeServiceHandoffs(events);

  console.log(`\nCorrelation Analysis for Job: ${jobId}\n`);

  if (gaps.length > 0) {
    console.log('⚠️  Timeline Gaps:');
    gaps.forEach(gap => console.log(`  ${gap.duration}ms between ${gap.before} → ${gap.after}`));
  }

  console.log('\n🔗 Service Handoffs:');
  handoffs.forEach(handoff => {
    console.log(`  ${handoff.from} → ${handoff.to} (${handoff.durationMs}ms)`);
  });
}
```

2. **Performance Monitoring**
```javascript
// tools/debug-events/performance.js
async function analyzePerformance(timeRange = '1h') {
  const events = await getEventsInTimeRange(timeRange);

  // Group by event type
  const eventGroups = groupBy(events, 'eventType');

  // Calculate statistics
  const stats = Object.entries(eventGroups).map(([eventType, events]) => ({
    eventType,
    count: events.length,
    avgDurationMs: calculateAverageDuration(events),
    p95DurationMs: calculatePercentile(events, 95)
  }));

  console.table(stats);
}
```

**Acceptance Criteria:**
- Event correlation analysis identifies bottlenecks
- Performance monitoring tracks event patterns
- Advanced filtering and aggregation capabilities
- Automated anomaly detection

## Deployment and Rollout Strategy

### Development Environment Rollout

#### Week 1: Core Team Testing
- **Participants**: 2-3 core developers
- **Scope**: API server + basic debugging tools
- **Goal**: Validate core functionality and gather feedback

#### Week 2: Full Team Adoption
- **Participants**: All developers
- **Scope**: All services + complete debugging toolkit
- **Goal**: Team training and workflow integration

#### Week 3: Production Readiness
- **Participants**: DevOps + core team
- **Scope**: Dash0 integration + production configuration
- **Goal**: Production deployment preparation

### Production Environment Rollout

#### Phase 1: Staging Deployment
- Deploy collector container to staging environment
- Configure Dash0 forwarding with staging endpoints
- Validate event volume and performance impact

#### Phase 2: Production Canary
- Deploy to 10% of production machines
- Monitor system performance and event quality
- Gradual rollout based on success metrics

#### Phase 3: Full Production
- Complete rollout to all production machines
- Enable full Dash0 integration
- Establish monitoring and alerting

## Risk Mitigation Plan

### Technical Risks

#### Risk: Redis Memory Pressure
**Mitigation:**
- Implement aggressive stream trimming (keep last 10k events)
- Monitor Redis memory usage with alerts
- Fallback to file-only logging if memory exceeds threshold

#### Risk: Event Volume Impact
**Mitigation:**
- Implement event sampling for high-frequency events
- Configurable event levels (debug, info, warn, error)
- Circuit breaker pattern for event emission

#### Risk: Collector Container Failure
**Mitigation:**
- Events persist in Redis Stream regardless of collector status
- Automatic collector restart on failure
- Multiple collector instances for high availability

### Operational Risks

#### Risk: Developer Adoption
**Mitigation:**
- Start with immediate value (debugging tools)
- Gradual event addition without forced adoption
- Clear documentation and training materials

#### Risk: Performance Regression
**Mitigation:**
- Comprehensive performance testing before rollout
- Real-time monitoring of API response times
- Automatic rollback on performance degradation

## Success Metrics and Monitoring

### Primary Success Metrics

1. **Debugging Time Reduction**
   - **Baseline**: 45 minutes average for distributed issues
   - **Target**: <15 minutes average
   - **Measurement**: Manual tracking of debugging sessions

2. **Event Adoption Rate**
   - **Target**: >80% of debugging scenarios use event timeline
   - **Measurement**: Tool usage analytics and developer surveys

3. **System Performance Impact**
   - **Target**: <5% increase in API response times
   - **Measurement**: Automated performance monitoring

### Secondary Success Metrics

1. **Developer Satisfaction**
   - **Target**: Positive feedback on debugging experience
   - **Measurement**: Weekly team surveys

2. **Event Quality**
   - **Target**: >95% of events provide actionable information
   - **Measurement**: Event review and quality assessment

3. **Production Readiness**
   - **Target**: Successful Dash0 integration with <1% event loss
   - **Measurement**: Event delivery monitoring

### Monitoring Dashboard

#### Development Environment
```
Event System Health Dashboard
├── Event Stream Stats
│   ├── Events/minute by service
│   ├── Redis Stream memory usage
│   └── Collector processing lag
├── Debugging Tool Usage
│   ├── Daily search queries
│   ├── Real-time monitor sessions
│   └── Timeline analysis requests
└── Performance Impact
    ├── API response time trends
    ├── Event emission latency
    └── Service memory usage
```

#### Production Environment
```
Production Telemetry Dashboard
├── Event Volume & Quality
│   ├── Events/second by service
│   ├── Event delivery success rate
│   └── Dash0 forwarding health
├── System Performance
│   ├── Telemetry overhead metrics
│   ├── Collector resource usage
│   └── Redis Stream performance
└── Operational Health
    ├── Service event patterns
    ├── Error event trends
    └── Anomaly detection alerts
```

## Conclusion

This execution plan provides a structured approach to implementing the Redis Event Stream + Single Collector Container Architecture, delivering immediate debugging value while establishing the foundation for production observability. The incremental implementation strategy ensures continuous value delivery and minimizes risk, while the comprehensive testing and monitoring approach ensures system reliability and performance.

**Next Steps:**
1. Review and approve execution plan
2. Begin Phase 1 implementation (Days 1-2)
3. Schedule daily standup check-ins during implementation
4. Plan user training sessions for Week 2
5. Prepare production deployment strategy for Week 3