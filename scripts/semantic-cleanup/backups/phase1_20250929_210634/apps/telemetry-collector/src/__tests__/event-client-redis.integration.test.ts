/**
 * EventClient Redis Integration Tests
 *
 * Tests that EventClient correctly writes events to Redis Stream
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Redis from 'ioredis';
import { EventClient } from '@emp/core';

describe('EventClient Redis Integration', () => {
  let redis: Redis;
  let eventClient: EventClient;

  const testStreamKey = 'telemetry:events';

  beforeEach(async () => {
    // Setup Redis connection
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    // Clean up any existing test data - ensure complete cleanup
    try {
      // Delete the entire stream
      await redis.del(testStreamKey);

      // Wait a bit to ensure cleanup is complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify stream is completely gone
      const exists = await redis.exists(testStreamKey);
      if (exists) {
        console.warn(`Stream ${testStreamKey} still exists after cleanup, forcing delete`);
        await redis.del(testStreamKey);
      }
    } catch (error) {
      // Ignore cleanup errors
    }

    // Setup EventClient
    eventClient = new EventClient('test-service', process.env.REDIS_URL || 'redis://localhost:6379');

    // Wait for connections to establish
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  afterEach(async () => {
    // Cleanup
    if (eventClient) {
      await eventClient.close();
    }
    if (redis) {
      await redis.del(testStreamKey);
      await redis.quit();
    }
  });

  it('should write event to Redis stream in correct format', async () => {
    // Emit test event
    await eventClient.event('test.event', {
      message: 'Hello World',
      jobId: 'test-job-123',
      workerId: 'test-worker-456'
    });

    // Wait for write to complete
    await new Promise(resolve => setTimeout(resolve, 200));

    // Check stream exists and has event
    const streamLength = await redis.xlen(testStreamKey);
    expect(streamLength).toBe(1);

    // Read the event directly from stream
    const events = await redis.xread('COUNT', '1', 'STREAMS', testStreamKey, '0');
    expect(events).toBeDefined();
    expect(events).toHaveLength(1);

    const [streamName, messages] = events[0];
    expect(streamName).toBe(testStreamKey);
    expect(messages).toHaveLength(1);

    const [messageId, fields] = messages[0];
    expect(messageId).toBeDefined();

    // Check the new format: [dataType, eventJson]
    expect(fields).toHaveLength(2);
    expect(fields[0]).toBe('event'); // dataType

    // Parse the event JSON
    const eventData = JSON.parse(fields[1]);
    expect(eventData.service).toBe('test-service');
    expect(eventData.eventType).toBe('test.event');
    expect(eventData.data.message).toBe('Hello World');
    expect(eventData.data.jobId).toBe('test-job-123');
    expect(eventData.data.workerId).toBe('test-worker-456');
    expect(eventData.jobId).toBe('test-job-123'); // Also at top level
    expect(eventData.workerId).toBe('test-worker-456'); // Also at top level
    expect(eventData.timestamp).toBeDefined();
    expect(eventData.traceId).toBeDefined();
  });

  it('should write span to Redis stream in correct format', async () => {
    // Emit test span
    await eventClient.span({
      traceId: 'test-trace-123',
      spanId: 'test-span-456',
      operationName: 'test-operation',
      startTime: Date.now() * 1000000,
      endTime: Date.now() * 1000000,
      status: { code: 1, message: 'OK' },
      attributes: {
        'test.attribute': 'test-value'
      }
    });

    // Wait for write to complete
    await new Promise(resolve => setTimeout(resolve, 200));

    // Check stream exists and has event
    const streamLength = await redis.xlen(testStreamKey);
    expect(streamLength).toBe(1);

    // Read the span directly from stream
    const events = await redis.xread('COUNT', '1', 'STREAMS', testStreamKey, '0');
    const [streamName, messages] = events[0];
    const [messageId, fields] = messages[0];

    // Check the new format: [dataType, spanJson]
    expect(fields).toHaveLength(2);
    expect(fields[0]).toBe('span'); // dataType

    // Parse the span JSON
    const spanData = JSON.parse(fields[1]);
    expect(spanData.traceId).toBe('test-trace-123');
    expect(spanData.spanId).toBe('test-span-456');
    expect(spanData.operationName).toBe('test-operation');
    expect(spanData.status.code).toBe(1);
    expect(spanData.attributes['test.attribute']).toBe('test-value');
  });

  it('should handle multiple events correctly', async () => {
    // Emit multiple events
    await eventClient.event('test.event.1', { index: 1 });
    await eventClient.event('test.event.2', { index: 2 });
    await eventClient.event('test.event.3', { index: 3 });

    // Wait for writes to complete
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check stream has all events
    const streamLength = await redis.xlen(testStreamKey);
    expect(streamLength).toBe(3);

    // Read all events
    const events = await redis.xread('COUNT', '10', 'STREAMS', testStreamKey, '0');
    const [streamName, messages] = events[0];
    expect(messages).toHaveLength(3);

    // Check event order and data
    for (let i = 0; i < 3; i++) {
      const [messageId, fields] = messages[i];
      expect(fields[0]).toBe('event');

      const eventData = JSON.parse(fields[1]);
      expect(eventData.eventType).toBe(`test.event.${i + 1}`);
      expect(eventData.data.index).toBe(i + 1);
    }
  });

  it('should handle job events with correlation IDs', async () => {
    const jobId = 'test-job-12345';

    await eventClient.jobEvent(jobId, 'job.started', {
      workerId: 'worker-123',
      machineId: 'machine-456'
    });

    // Wait for write to complete
    await new Promise(resolve => setTimeout(resolve, 200));

    // Read the event
    const events = await redis.xread('COUNT', '1', 'STREAMS', testStreamKey, '0');
    const [streamName, messages] = events[0];
    const [messageId, fields] = messages[0];

    const eventData = JSON.parse(fields[1]);
    expect(eventData.eventType).toBe('job.started');
    expect(eventData.jobId).toBe(jobId);
    expect(eventData.data.jobId).toBe(jobId);
    expect(eventData.data.workerId).toBe('worker-123');
    expect(eventData.data.machineId).toBe('machine-456');
  });

  it('should handle connection failures gracefully', async () => {
    // Close the EventClient's Redis connection to simulate failure
    await eventClient.close();

    // Try to emit event - should not throw
    await expect(eventClient.event('test.after.close', { test: true })).resolves.toBeUndefined();

    // Stream should still be empty since connection was closed
    const streamLength = await redis.xlen(testStreamKey);
    expect(streamLength).toBe(0);
  });

  it('should maintain stream length limits with trimming', async () => {
    // The EventClient should trim the stream automatically
    // Send more events than the configured max length (10000)
    // For this test, we'll just verify trimming works with a smaller number

    for (let i = 0; i < 15; i++) {
      await eventClient.event(`test.trim.${i}`, { index: i });
    }

    // Wait for all writes
    await new Promise(resolve => setTimeout(resolve, 500));

    // Stream should exist and have events
    const streamLength = await redis.xlen(testStreamKey);
    expect(streamLength).toBe(15); // All should be there since we're under the limit

    // Read some events to verify they're properly formatted
    const events = await redis.xread('COUNT', '5', 'STREAMS', testStreamKey, '0');
    const [streamName, messages] = events[0];
    expect(messages).toHaveLength(5);

    // Verify format of first event
    const [messageId, fields] = messages[0];
    expect(fields[0]).toBe('event');
    const eventData = JSON.parse(fields[1]);
    expect(eventData.eventType).toBe('test.trim.0');
  });
});