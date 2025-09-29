# Business Stream Consumer Examples

## Consumer Pattern Overview

Each service subscribes only to the streams it needs, using Redis consumer groups for reliable processing and horizontal scaling.

## Webhook Service Consumer

**Subscribes to**: `job:lifecycle`, `workflow:lifecycle`
**Purpose**: Send webhook notifications to external systems

```typescript
// PLACEHOLDER: Webhook service stream consumer
class WebhookStreamConsumer {
  async startConsuming() {
    // Subscribe to multiple streams with selective event filtering
    await this.redis.xgroup('CREATE', 'job:lifecycle', 'webhook-service', '0', 'MKSTREAM');
    await this.redis.xgroup('CREATE', 'workflow:lifecycle', 'webhook-service', '0', 'MKSTREAM');

    while (true) {
      // Read from multiple streams
      const results = await this.redis.xreadgroup(
        'GROUP', 'webhook-service', 'webhook-worker-1',
        'COUNT', 10,
        'BLOCK', 1000,
        'STREAMS',
        'job:lifecycle', 'workflow:lifecycle',
        '>', '>'
      );

      for (const [stream, messages] of results) {
        for (const [messageId, fields] of messages) {
          const event = this.parseEvent(fields);

          // Only process completion/failure events
          if (['job.completed', 'job.failed', 'workflow.completed', 'workflow.failed'].includes(event.eventType)) {
            await this.sendWebhook(event);
            await this.redis.xack(stream, 'webhook-service', messageId);
          }
        }
      }
    }
  }
}
```

## Workflow Orchestrator Consumer

**Subscribes to**: `job:lifecycle`, `workflow:lifecycle`
**Purpose**: Coordinate multi-job workflows

```typescript
// PLACEHOLDER: Workflow orchestrator stream consumer
class WorkflowOrchestrator {
  async startConsuming() {
    await this.redis.xgroup('CREATE', 'job:lifecycle', 'workflow-orchestrator', '0', 'MKSTREAM');
    await this.redis.xgroup('CREATE', 'workflow:lifecycle', 'workflow-orchestrator', '0', 'MKSTREAM');

    while (true) {
      const results = await this.redis.xreadgroup(
        'GROUP', 'workflow-orchestrator', 'orchestrator-worker-1',
        'COUNT', 5,
        'BLOCK', 2000,
        'STREAMS',
        'job:lifecycle', 'workflow:lifecycle',
        '>', '>'
      );

      for (const [stream, messages] of results) {
        for (const [messageId, fields] of messages) {
          const event = this.parseEvent(fields);

          // Process job completion in workflows
          if (event.eventType === 'job.completed' && event.workflowId) {
            await this.handleJobCompletedInWorkflow(event);
          }

          // Process job failures in workflows
          if (event.eventType === 'job.failed' && event.workflowId) {
            await this.handleJobFailedInWorkflow(event);
          }

          await this.redis.xack(stream, 'workflow-orchestrator', messageId);
        }
      }
    }
  }
}
```

## Capacity Planner Consumer

**Subscribes to**: `worker:lifecycle`, `machine:lifecycle`
**Purpose**: Scale infrastructure based on demand

```typescript
// PLACEHOLDER: Capacity planner stream consumer
class CapacityPlanner {
  async startConsuming() {
    await this.redis.xgroup('CREATE', 'worker:lifecycle', 'capacity-planner', '0', 'MKSTREAM');
    await this.redis.xgroup('CREATE', 'machine:lifecycle', 'capacity-planner', '0', 'MKSTREAM');

    while (true) {
      const results = await this.redis.xreadgroup(
        'GROUP', 'capacity-planner', 'capacity-worker-1',
        'COUNT', 20,
        'BLOCK', 5000,
        'STREAMS',
        'worker:lifecycle', 'machine:lifecycle',
        '>', '>'
      );

      for (const [stream, messages] of results) {
        for (const [messageId, fields] of messages) {
          const event = this.parseEvent(fields);

          // Track worker availability
          if (['worker.registered', 'worker.disconnected'].includes(event.eventType)) {
            await this.updateWorkerCapacity(event);
          }

          // Track machine lifecycle
          if (['machine.provisioned', 'machine.decommissioned'].includes(event.eventType)) {
            await this.updateMachineInventory(event);
          }

          await this.redis.xack(stream, 'capacity-planner', messageId);
        }
      }
    }
  }
}
```

## Billing Service Consumer

**Subscribes to**: `job:lifecycle`, `machine:lifecycle`
**Purpose**: Track usage for billing

```typescript
// PLACEHOLDER: Billing service stream consumer
class BillingService {
  async startConsuming() {
    await this.redis.xgroup('CREATE', 'job:lifecycle', 'billing-service', '0', 'MKSTREAM');
    await this.redis.xgroup('CREATE', 'machine:lifecycle', 'billing-service', '0', 'MKSTREAM');

    while (true) {
      const results = await this.redis.xreadgroup(
        'GROUP', 'billing-service', 'billing-worker-1',
        'COUNT', 50,
        'BLOCK', 10000,
        'STREAMS',
        'job:lifecycle', 'machine:lifecycle',
        '>', '>'
      );

      for (const [stream, messages] of results) {
        for (const [messageId, fields] of messages) {
          const event = this.parseEvent(fields);

          // Bill for completed jobs
          if (event.eventType === 'job.completed') {
            await this.recordJobUsage(event);
          }

          // Track machine costs
          if (['machine.provisioned', 'machine.decommissioned'].includes(event.eventType)) {
            await this.recordMachineUsage(event);
          }

          await this.redis.xack(stream, 'billing-service', messageId);
        }
      }
    }
  }
}
```

## Monitoring/Alerting Consumer

**Subscribes to**: All streams
**Purpose**: System health monitoring and alerting

```typescript
// PLACEHOLDER: Monitoring service stream consumer
class MonitoringService {
  async startConsuming() {
    // Subscribe to all business streams for comprehensive monitoring
    const streams = ['job:lifecycle', 'workflow:lifecycle', 'worker:lifecycle', 'machine:lifecycle'];

    for (const stream of streams) {
      await this.redis.xgroup('CREATE', stream, 'monitoring-service', '0', 'MKSTREAM');
    }

    while (true) {
      const results = await this.redis.xreadgroup(
        'GROUP', 'monitoring-service', 'monitor-worker-1',
        'COUNT', 100,
        'BLOCK', 1000,
        'STREAMS',
        ...streams,
        ...Array(streams.length).fill('>')
      );

      for (const [stream, messages] of results) {
        for (const [messageId, fields] of messages) {
          const event = this.parseEvent(fields);

          // Update metrics
          await this.updateMetrics(stream, event);

          // Check for alert conditions
          await this.checkAlertConditions(event);

          await this.redis.xack(stream, 'monitoring-service', messageId);
        }
      }
    }
  }
}
```

## Consumer Group Benefits

### Reliability
- **At-least-once delivery**: Messages persist until acknowledged
- **Consumer recovery**: Services can restart and resume from last processed event
- **Dead letter handling**: Failed messages can be retried or moved to error streams

### Scalability
- **Horizontal scaling**: Multiple instances of same service share consumer group
- **Load balancing**: Redis automatically distributes messages across consumers
- **Independent scaling**: Each service scales based on its own processing needs

### Selective Consumption
- **Stream filtering**: Services only read streams they care about
- **Event filtering**: Services can ignore irrelevant event types within streams
- **Reduced overhead**: No processing of unnecessary events

## Implementation Notes

### Error Handling
```typescript
// PLACEHOLDER: Error handling pattern
try {
  await this.processEvent(event);
  await this.redis.xack(stream, consumerGroup, messageId);
} catch (error) {
  logger.error(`Failed to process event ${messageId}:`, error);

  // Increment retry count in event metadata
  const retryCount = parseInt(event.retryCount || '0') + 1;

  if (retryCount < MAX_RETRIES) {
    // Re-queue with backoff
    await this.scheduleRetry(event, retryCount);
  } else {
    // Move to dead letter stream
    await this.moveToDeadLetter(event);
  }

  await this.redis.xack(stream, consumerGroup, messageId);
}
```

### Stream Lag Monitoring
```typescript
// PLACEHOLDER: Monitor consumer lag
async function monitorStreamLag() {
  const streams = ['job:lifecycle', 'workflow:lifecycle', 'worker:lifecycle', 'machine:lifecycle'];

  for (const stream of streams) {
    const info = await redis.xinfo('GROUPS', stream);

    for (const group of info) {
      const [, groupName, , , , , , lag] = group;

      if (lag > LAG_THRESHOLD) {
        await alerting.sendAlert({
          type: 'STREAM_LAG',
          stream,
          consumerGroup: groupName,
          lag: lag,
          severity: 'WARNING'
        });
      }
    }
  }
}
```