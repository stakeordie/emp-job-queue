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

#### Architecture Decision: Streams vs Pub/Sub
**Critical:** Separate persistent telemetry events from ephemeral status updates

##### Use Redis Streams for Telemetry Events
- **Purpose**: Audit trail, debugging, observability
- **Examples**: job.created, job.completed, worker.connected, errors
- **Characteristics**:
  - Persistent (survives Redis restart with persistence)
  - Guaranteed delivery to collectors
  - Replay-able for debugging
  - Forwarded to Dash0 for analysis

##### Use Redis Pub/Sub for High-Frequency Status
- **Purpose**: Real-time UI updates, progress monitoring
- **Examples**: job progress (1/sec), GPU stats, FPS, preview images
- **Characteristics**:
  - Zero storage overhead
  - Fire-and-forget delivery
  - Real-time only (lost if no listeners)
  - Not forwarded to Dash0 (reduces noise)

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

3. **Dual-Mode Job Progress**
```typescript
// apps/worker/src/services/job-progress.ts
class JobProgressTracker {
  private statusInterval: NodeJS.Timeout;

  async startProgressTracking(jobId: string) {
    // Important event → Stream (persistent telemetry)
    await workerTelemetry.jobEvent(jobId, 'job.processing_started', {
      workerId: this.workerId,
      timestamp: Date.now()
    });

    // High-frequency status → Pub/Sub (ephemeral updates)
    this.statusInterval = setInterval(async () => {
      const status = {
        jobId,
        progress: this.getCurrentProgress(),
        fps: this.getFramesPerSecond(),
        eta: this.calculateETA(),
        gpuTemp: await this.getGPUTemp(),
        vramUsage: await this.getVRAMUsage(),
        preview: this.getLatestPreview() // Base64 preview image
      };

      // Pub/Sub - no storage, real-time only
      await redis.publish(`job:${jobId}:status`, JSON.stringify(status));
    }, 1000); // Every second
  }

  async markCompleted(jobId: string, result: JobResult) {
    // Stop high-frequency updates
    clearInterval(this.statusInterval);

    // Important event → Stream (persistent telemetry)
    await workerTelemetry.jobEvent(jobId, 'job.completed', {
      resultType: typeof result,
      hasAssets: result.assets?.length > 0,
      completionTimeMs: Date.now() - result.startTime
    });
  }
}
```

4. **Status-Only Updates (No Stream Storage)**
```typescript
// apps/worker/src/services/realtime-status.ts
class RealtimeStatusPublisher {
  // These NEVER go to streams - pure pub/sub
  async publishGPUStatus(machineId: string) {
    setInterval(async () => {
      const gpuStats = await this.collectGPUStats();
      await redis.publish(`machine:${machineId}:gpu`, JSON.stringify({
        timestamp: Date.now(),
        gpus: gpuStats.map(gpu => ({
          index: gpu.index,
          utilization: gpu.utilization,
          memory: gpu.memory,
          temperature: gpu.temperature,
          powerDraw: gpu.powerDraw
        }))
      }));
    }, 1000);
  }

  async publishComfyUIProgress(jobId: string, nodeProgress: any) {
    // ComfyUI generates tons of node progress updates
    await redis.publish(`comfyui:${jobId}:progress`, JSON.stringify({
      currentNode: nodeProgress.node,
      step: nodeProgress.step,
      totalSteps: nodeProgress.totalSteps,
      preview: nodeProgress.previewImage // Latest generated image
    }));
  }
}
```

**Acceptance Criteria:**
- Worker startup and shutdown events captured in streams
- Job claiming and processing events logged to streams
- High-frequency progress updates use pub/sub only
- No stream pollution from 1/sec status updates
- Connector-specific events for different AI services

### Task 4.1b: Monitor UI Dual Subscription
**Duration:** 2 hours
**Location:** `apps/monitor/src/`

#### Implementation for Consuming Both Systems

```typescript
// apps/monitor/src/services/event-consumer.ts
class MonitorEventConsumer {
  constructor(private io: Server) {}

  // Subscribe to important events from stream
  async consumeTelemetryEvents() {
    const redis = createRedisClient();

    // Read from stream for historical and important events
    while (true) {
      const events = await redis.xread(
        'BLOCK', 1000,
        'STREAMS', 'telemetry:events', this.lastEventId
      );

      if (events) {
        events[0][1].forEach(([id, fields]) => {
          const event = parseEvent(fields);

          // Emit to relevant UI channels
          if (event.jobId) {
            this.io.to(`job:${event.jobId}`).emit('telemetry', event);
          }

          this.lastEventId = id;
        });
      }
    }
  }

  // Subscribe to real-time status via pub/sub
  async subscribeToStatusUpdates() {
    const subscriber = createRedisClient();

    // Subscribe to all job status channels
    await subscriber.psubscribe('job:*:status');
    await subscriber.psubscribe('machine:*:gpu');
    await subscriber.psubscribe('comfyui:*:progress');

    subscriber.on('pmessage', (pattern, channel, message) => {
      const data = JSON.parse(message);

      // Parse channel to get entity ID
      const [entity, id, type] = channel.split(':');

      // Emit to UI subscribers
      if (entity === 'job') {
        this.io.to(`job:${id}`).emit('status', data);
        this.updateProgressBar(id, data.progress);
        this.updatePreview(id, data.preview);
      } else if (entity === 'machine') {
        this.io.to('machines').emit('gpu-stats', { machineId: id, ...data });
      } else if (entity === 'comfyui') {
        this.io.to(`job:${id}`).emit('node-progress', data);
      }
    });
  }

  // Hybrid approach for job timeline
  async getJobTimeline(jobId: string) {
    // Get historical events from stream
    const streamEvents = await this.searchStreamForJob(jobId);

    // Get current status from pub/sub (if job is active)
    const currentStatus = await redis.get(`job:${jobId}:latest-status`);

    return {
      events: streamEvents,  // Important milestones
      currentStatus: currentStatus ? JSON.parse(currentStatus) : null
    };
  }
}
```

**Benefits of Dual System:**
- Stream provides complete audit trail for debugging
- Pub/Sub enables real-time UI without storage overhead
- Monitor can replay history OR watch live
- Different retention policies for different data types

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

## Appendix A: Separate Error Stream Architecture

**Added:** September 28, 2025
**Context:** Production-scale error handling requires dedicated stream architecture for optimal performance and operational clarity.

### Error Stream Design

#### Architecture Overview
Implement a separate Redis Stream (`emp:errors`) dedicated to error events, providing:
- **Isolated Processing**: Error events don't compete with regular telemetry for processing resources
- **Different Retention**: Longer retention for errors (7 days vs 24 hours for regular events)
- **Specialized Alerting**: Direct integration with monitoring systems for immediate error notification
- **Enhanced Debugging**: Error-specific correlation and analysis tools

#### Implementation Strategy

##### 1. Dual Stream Configuration
```typescript
// packages/core/src/telemetry/stream-config.ts
export const TELEMETRY_CONFIG = {
  // Regular telemetry stream
  eventStream: {
    name: 'emp:events',
    maxLength: 10000,
    retention: 24 * 60 * 60 * 1000, // 24 hours
    trimStrategy: 'MAXLEN'
  },

  // Dedicated error stream
  errorStream: {
    name: 'emp:errors',
    maxLength: 50000, // More errors retained
    retention: 7 * 24 * 60 * 60 * 1000, // 7 days
    trimStrategy: 'MAXLEN'
  }
};
```

##### 2. Enhanced Event Client
```typescript
// packages/core/src/telemetry/event-client.ts
export class EventClient {
  // Regular event emission (existing)
  async event(type: string, data: Record<string, any> = {}): Promise<void> {
    // Emit to emp:events stream
  }

  // Error-specific methods
  async error(errorType: string, error: Error, context?: Record<string, any>): Promise<void> {
    const errorEvent = {
      timestamp: Date.now(),
      service: this.serviceName,
      eventType: `error.${errorType}`,
      traceId: context?.traceId || this.generateTraceId(),
      data: {
        message: error.message,
        stack: error.stack,
        name: error.constructor.name,
        ...context
      }
    };

    // Emit to emp:errors stream
    await this.emitToStream('emp:errors', errorEvent);
  }

  // Convenience error methods
  async jobError(jobId: string, error: Error, context?: Record<string, any>): Promise<void>
  async workerError(workerId: string, error: Error, context?: Record<string, any>): Promise<void>
  async machineError(machineId: string, error: Error, context?: Record<string, any>): Promise<void>
}
```

##### 3. Dual Consumer Architecture
```typescript
// apps/telemetry-collector/src/redis-consumer.ts
export class DualStreamConsumer {
  constructor(
    private config: ConsumerConfig,
    private onEvent: (event: TelemetryEvent) => Promise<void>,
    private onError: (error: ErrorEvent) => Promise<void>
  ) {
    // Create separate consumers for each stream
    this.eventConsumer = new RedisConsumer({
      ...config,
      streamKey: 'emp:events',
      consumerGroup: 'telemetry-collectors'
    }, onEvent);

    this.errorConsumer = new RedisConsumer({
      ...config,
      streamKey: 'emp:errors',
      consumerGroup: 'error-collectors'
    }, onError);
  }

  async start(): Promise<void> {
    // Start both consumers in parallel
    await Promise.all([
      this.eventConsumer.start(),
      this.errorConsumer.start()
    ]);
  }
}
```

##### 4. Error-Specific Debugging Tools
```javascript
// tools/debug-events/error-analysis.js
async function analyzeErrors(options = {}) {
  const errors = await searchErrorStream({
    since: options.since || '-1h',
    service: options.service,
    errorType: options.errorType
  });

  // Group by error type and frequency
  const errorGroups = groupBy(errors, 'data.name');

  // Calculate error rates
  const errorRates = Object.entries(errorGroups).map(([errorType, errors]) => ({
    errorType,
    count: errors.length,
    rate: errors.length / getTimeRangeHours(options.since || '-1h'),
    lastSeen: Math.max(...errors.map(e => e.timestamp)),
    services: [...new Set(errors.map(e => e.service))]
  }));

  console.log('\n🚨 Error Analysis Report\n');
  console.table(errorRates);

  // Show recent error details
  const recentErrors = errors.slice(-10);
  console.log('\n📋 Recent Errors:');
  recentErrors.forEach(error => {
    console.log(`${formatTimestamp(error.timestamp)} [${error.service}] ${error.data.name}: ${error.data.message}`);
  });
}

// Enhanced CLI commands
yargs
  .command('errors', 'Analyze error patterns', {
    service: { type: 'string', describe: 'Filter by service' },
    since: { type: 'string', describe: 'Time range (e.g. -1h, -24h)' },
    type: { type: 'string', describe: 'Filter by error type' }
  })
  .parse();
```

##### 5. Monitoring Integration
```typescript
// apps/telemetry-collector/src/error-alerting.ts
export class ErrorAlerting {
  private errorCounts = new Map<string, number>();
  private alertThresholds = {
    criticalErrors: 10, // per minute
    serviceFailures: 5,  // per minute
    newErrorTypes: 1     // immediate alert
  };

  async processError(error: ErrorEvent): Promise<void> {
    // Track error frequency
    const key = `${error.service}:${error.data.name}`;
    this.errorCounts.set(key, (this.errorCounts.get(key) || 0) + 1);

    // Check for alert conditions
    if (this.shouldAlert(error)) {
      await this.sendAlert({
        type: 'error_threshold_exceeded',
        service: error.service,
        errorType: error.data.name,
        count: this.errorCounts.get(key),
        timeframe: '1 minute'
      });
    }

    // Forward to monitoring systems
    await this.forwardToMonitoring(error);
  }
}
```

#### Benefits of Separate Error Stream

1. **Performance Isolation**: Regular telemetry processing not impacted by error bursts
2. **Specialized Retention**: Longer error retention without inflating regular stream storage
3. **Enhanced Alerting**: Immediate error notifications without filtering noise
4. **Focused Debugging**: Error-specific tools and correlation analysis
5. **Operational Clarity**: Clear separation between operational telemetry and error tracking

#### Migration Strategy

1. **Phase 1**: Implement dual event client with backwards compatibility
2. **Phase 2**: Deploy dual stream consumer to telemetry collector
3. **Phase 3**: Update services to use error-specific methods
4. **Phase 4**: Enable error-specific monitoring and alerting

#### CLI Integration
```bash
# New error-specific debugging commands
pnpm debug:errors --service=api-server --since=-1h
pnpm debug:errors:timeline --jobId=job_123
pnpm debug:errors:patterns --type=ValidationError
pnpm debug:errors:alerts --threshold=critical
```

---

## Conclusion

This execution plan provides a structured approach to implementing the Redis Event Stream + Single Collector Container Architecture, delivering immediate debugging value while establishing the foundation for production observability. The incremental implementation strategy ensures continuous value delivery and minimizes risk, while the comprehensive testing and monitoring approach ensures system reliability and performance.

The addition of separate error stream architecture ensures production-scale error handling with dedicated processing, retention, and alerting capabilities.

**Next Steps:**
1. Review and approve execution plan
2. Begin Phase 1 implementation (Days 1-2)
3. Schedule daily standup check-ins during implementation
4. Plan user training sessions for Week 2
5. Prepare production deployment strategy for Week 3