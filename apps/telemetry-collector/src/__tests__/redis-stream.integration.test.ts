/**
 * Redis Stream Integration Tests
 *
 * Tests the complete telemetry flow from event emission to collection
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Redis from 'ioredis';
import { EventClient, TelemetryEvent, OtelSpan } from '@emp/core';
import { RedisConsumer, ConsumerConfig } from '../redis-consumer.js';

// Helper function to convert OTEL span to legacy event format for test compatibility
function spanToEvent(span: OtelSpan): TelemetryEvent {
  return {
    timestamp: Math.floor(span.startTime / 1_000_000), // Convert nanoseconds to milliseconds
    service: span.resource['service.name'],
    eventType: span.operationName,
    traceId: span.traceId,
    data: span.attributes,
    jobId: span.attributes['emp.job.id'] as string,
    workerId: span.attributes['emp.worker.id'] as string,
    machineId: span.attributes['emp.machine.id'] as string,
    userId: span.attributes['emp.user.id'] as string,
    level: span.status.code === 2 ? 'error' : 'info' // SpanStatusCode.ERROR = 2
  };
}

describe('Redis Stream Integration', () => {
  let redis: Redis;
  let eventClient: EventClient;
  let consumer: RedisConsumer;
  let receivedEvents: TelemetryEvent[] = [];

  const testStreamKey = 'test:telemetry:events';
  const testGroupName = 'test-collectors';

  beforeEach(async () => {
    // Clear received events
    receivedEvents = [];

    // Setup Redis connection
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    // Clean up any existing test data
    await redis.del(testStreamKey);
    try {
      await redis.xgroup('DESTROY', testStreamKey, testGroupName);
    } catch {
      // Group might not exist, ignore
    }

    // Setup event client pointing to test stream
    eventClient = new EventClient({
      serviceName: 'test-service',
      redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
      streamKey: testStreamKey,
      maxBufferSize: 100,
      batchSize: 1, // Immediate flushing for tests
      flushInterval: 100, // Fast flush for tests
    });

    // Setup consumer
    const consumerConfig: ConsumerConfig = {
      redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
      streamKey: testStreamKey,
      consumerGroup: testGroupName,
      consumerName: 'test-consumer',
      batchSize: 10,
      blockTime: 1000,
    };

    consumer = new RedisConsumer(consumerConfig, async (event: TelemetryEvent | OtelSpan) => {
      // Convert OTEL spans to legacy events for test compatibility
      if ('operationName' in event && 'resource' in event) {
        // This is an OTEL span
        receivedEvents.push(spanToEvent(event as OtelSpan));
      } else {
        // This is already a legacy event
        receivedEvents.push(event as TelemetryEvent);
      }
    });
  });

  afterEach(async () => {
    // Cleanup
    if (consumer) {
      await consumer.stop();
    }
    if (eventClient) {
      await eventClient.close();
    }
    if (redis) {
      await redis.del(testStreamKey);
      try {
        await redis.xgroup('DESTROY', testStreamKey, testGroupName);
      } catch {
        // Ignore if group doesn't exist
      }
      await redis.quit();
    }
  });

  it('should emit event to Redis stream', async () => {
    // Emit test event
    await eventClient.event('test.event', {
      message: 'Hello World',
      timestamp: Date.now()
    });

    // Flush events immediately
    await eventClient.flush();

    // Wait a bit for Redis to process
    await new Promise(resolve => setTimeout(resolve, 100));

    // Check stream exists and has event
    const streamLength = await redis.xlen(testStreamKey);
    expect(streamLength).toBe(1);

    // Read the event directly from stream
    const events = await redis.xrange(testStreamKey, '-', '+');
    expect(events).toHaveLength(1);

    const [eventId, fields] = events[0];
    expect(eventId).toBeDefined();
    expect(fields[0]).toBe('span'); // Now emits OTEL spans

    const spanData = JSON.parse(fields[1]);
    expect(spanData.resource['service.name']).toBe('test-service');
    expect(spanData.operationName).toBe('test.event'); // OTEL uses operationName instead of eventType
    expect(spanData.attributes.message).toBe('Hello World'); // Data is now in attributes
  });

  it('should consume events from Redis stream', async () => {
    // Start consumer
    await consumer.start();

    // Give consumer time to set up
    await new Promise(resolve => setTimeout(resolve, 500));

    // Emit test events
    await eventClient.event('test.start', { action: 'starting' });
    await eventClient.event('test.process', { action: 'processing' });
    await eventClient.event('test.complete', { action: 'done' });

    // Flush events immediately
    await eventClient.flush();

    // Wait for events to be processed
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify events were received
    expect(receivedEvents).toHaveLength(3);

    expect(receivedEvents[0].eventType).toBe('test.start');
    expect(receivedEvents[0].data.action).toBe('starting');

    expect(receivedEvents[1].eventType).toBe('test.process');
    expect(receivedEvents[1].data.action).toBe('processing');

    expect(receivedEvents[2].eventType).toBe('test.complete');
    expect(receivedEvents[2].data.action).toBe('done');

    // All events should have proper metadata
    receivedEvents.forEach(event => {
      expect(event.service).toBe('test-service');
      expect(event.timestamp).toBeTypeOf('number');
      expect(event.traceId).toBeTypeOf('string');
    });
  });

  it('should handle job-specific events with correlation', async () => {
    await consumer.start();
    await new Promise(resolve => setTimeout(resolve, 500));

    const jobId = 'job_test_123';
    const traceId = 'trace_abc_456';

    // Emit correlated job events
    await eventClient.event('job.created', { priority: 'high' }, { jobId, traceId });
    await eventClient.event('job.queued', { queue: 'default' }, { jobId, traceId });
    await eventClient.event('job.claimed', { workerId: 'worker-1' }, { jobId, traceId });

    // Flush events immediately
    await eventClient.flush();

    await new Promise(resolve => setTimeout(resolve, 2000));

    expect(receivedEvents).toHaveLength(3);

    // Verify correlation IDs
    receivedEvents.forEach(event => {
      expect(event.jobId).toBe(jobId);
      expect(event.traceId).toBe(traceId);
    });

    expect(receivedEvents[0].eventType).toBe('job.created');
    expect(receivedEvents[1].eventType).toBe('job.queued');
    expect(receivedEvents[2].eventType).toBe('job.claimed');
  });

  it('should handle consumer group persistence and recovery', async () => {
    // Start consumer, emit event, stop
    await consumer.start();
    await new Promise(resolve => setTimeout(resolve, 500));

    await eventClient.event('test.before.restart', { phase: 'before' });
    await eventClient.flush();
    await new Promise(resolve => setTimeout(resolve, 1000));

    await consumer.stop();

    // Emit event while consumer is down
    await eventClient.event('test.during.downtime', { phase: 'during' });
    await eventClient.flush();

    // Start new consumer with same group
    const newConsumer = new RedisConsumer({
      redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
      streamKey: testStreamKey,
      consumerGroup: testGroupName,
      consumerName: 'test-consumer-2',
      batchSize: 10,
      blockTime: 1000,
    }, async (event: TelemetryEvent | OtelSpan) => {
      // Convert OTEL spans to legacy events for test compatibility
      if ('operationName' in event && 'resource' in event) {
        // This is an OTEL span
        receivedEvents.push(spanToEvent(event as OtelSpan));
      } else {
        // This is already a legacy event
        receivedEvents.push(event as TelemetryEvent);
      }
    });

    await newConsumer.start();
    await new Promise(resolve => setTimeout(resolve, 500));

    await eventClient.event('test.after.restart', { phase: 'after' });
    await eventClient.flush();
    await new Promise(resolve => setTimeout(resolve, 2000));

    await newConsumer.stop();

    // Should have received all events
    expect(receivedEvents.length).toBeGreaterThanOrEqual(3);

    const phases = receivedEvents.map(e => e.data.phase);
    expect(phases).toContain('before');
    expect(phases).toContain('during');
    expect(phases).toContain('after');
  });

  it('should handle connection failures gracefully', async () => {
    // Create consumer with invalid Redis URL
    const badConsumer = new RedisConsumer({
      redisUrl: 'redis://nonexistent:6379',
      streamKey: testStreamKey,
      consumerGroup: 'bad-group',
      consumerName: 'bad-consumer',
      batchSize: 10,
      blockTime: 1000,
    }, async (event: TelemetryEvent) => {
      // Should not receive events
      receivedEvents.push(event);
    });

    // Should start without throwing (resilient startup)
    await expect(badConsumer.start()).resolves.not.toThrow();

    // Should report as not running with connection issues
    const stats = badConsumer.getStats();
    expect(stats.processedCount).toBe(0);

    await badConsumer.stop();
  });
});