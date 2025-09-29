/**
 * Redis-to-OTLP Bridge Tests
 *
 * Tests the Redis Stream to OTLP conversion bridge
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Redis from 'ioredis';
import { RedisToOtlpBridge, BridgeConfig } from '../redis-to-otlp-bridge.js';

describe('Redis-to-OTLP Bridge', () => {
  let redis: Redis;
  let bridge: RedisToOtlpBridge;
  let mockOtlpEndpoint: string;
  let receivedOtlpPayloads: any[] = [];

  const testStreamKey = 'telemetry:events:bridge-test';
  const testGroupName = 'test-bridge-group';

  beforeEach(async () => {
    // Clear received payloads
    receivedOtlpPayloads = [];

    // Setup Redis connection
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    // Clean up any existing test data
    await redis.del(testStreamKey);
    try {
      await redis.xgroup('DESTROY', testStreamKey, testGroupName);
    } catch (error) {
      // Group might not exist, that's okay
    }

    // Bridge tests don't need EventClient since they manually write to Redis stream

    // Mock fetch for OTLP endpoint
    mockOtlpEndpoint = 'http://localhost:4318/v1/traces';
    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (url === mockOtlpEndpoint) {
        // Capture the OTLP payload
        receivedOtlpPayloads.push(JSON.parse(options.body));
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(''),
        });
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    // Setup bridge
    const config: BridgeConfig = {
      redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
      streamKey: testStreamKey,
      consumerGroup: testGroupName,
      consumerName: 'test-consumer',
      batchSize: 5,
      blockTime: 100,
      otlpEndpoint: mockOtlpEndpoint
    };

    bridge = new RedisToOtlpBridge(config);
  });

  afterEach(async () => {
    // Stop bridge if running
    await bridge.stop();

    // No EventClient to close in bridge tests

    // Clean up test data
    await redis.del(testStreamKey);
    try {
      await redis.xgroup('DESTROY', testStreamKey, testGroupName);
    } catch (error) {
      // Ignore errors
    }

    // Close Redis connection
    await redis.quit();

    // Restore fetch
    vi.restoreAllMocks();
  });

  it('should consume events from Redis and convert to OTLP format', async () => {
    // Start the bridge
    await bridge.start();

    // Wait for bridge to initialize
    await new Promise(resolve => setTimeout(resolve, 500));

    // Manually add test event to bridge test stream
    await redis.xadd(
      testStreamKey,
      '*',
      'event', // dataType field
      JSON.stringify({
        timestamp: Date.now(),
        service: 'test-service',
        eventType: 'test.event',
        traceId: 'test-trace-abc123',
        data: {
          message: 'Test message',
          jobId: 'test-job-123',
          workerId: 'test-worker-456'
        },
        level: 'info',
        jobId: 'test-job-123',
        workerId: 'test-worker-456'
      })
    );

    // Wait for bridge to process
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check that OTLP payload was sent
    expect(receivedOtlpPayloads).toHaveLength(1);

    const otlpPayload = receivedOtlpPayloads[0];
    expect(otlpPayload.resourceSpans).toBeDefined();
    expect(otlpPayload.resourceSpans[0].scopeSpans).toBeDefined();
    expect(otlpPayload.resourceSpans[0].scopeSpans[0].spans).toHaveLength(1);

    const span = otlpPayload.resourceSpans[0].scopeSpans[0].spans[0];
    expect(span.name).toBe('test.event');
    expect(span.traceId).toBeDefined();
    expect(span.spanId).toBeDefined();

    // Check attributes
    const attributes = span.attributes;
    const jobIdAttr = attributes.find((attr: any) => attr.key === 'emp.job.id');
    const workerIdAttr = attributes.find((attr: any) => attr.key === 'emp.worker.id');

    expect(jobIdAttr?.value.stringValue).toBe('test-job-123');
    expect(workerIdAttr?.value.stringValue).toBe('test-worker-456');
  });

  it('should handle span data correctly', async () => {
    // Start the bridge
    await bridge.start();

    // Wait for bridge to initialize
    await new Promise(resolve => setTimeout(resolve, 500));

    // Manually add test span to bridge test stream
    await redis.xadd(
      testStreamKey,
      '*',
      'span', // dataType field
      JSON.stringify({
        traceId: 'abcd1234567890efabcd1234567890ef',
        spanId: 'test-span-456',
        operationName: 'test-operation',
        startTime: Date.now() * 1000000,
        endTime: Date.now() * 1000000,
        status: { code: 1, message: 'OK' },
        attributes: {
          'test.attribute': 'test-value',
          'emp.job.id': 'test-job-789'
        }
      })
    );

    // Wait for bridge to process
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check that OTLP payload was sent
    expect(receivedOtlpPayloads).toHaveLength(1);

    const otlpPayload = receivedOtlpPayloads[0];
    const span = otlpPayload.resourceSpans[0].scopeSpans[0].spans[0];

    expect(span.name).toBe('test-operation');
    expect(span.traceId).toBe('abcd1234567890efabcd1234567890ef'); // Exact match for hex traceId
    expect(span.status.code).toBe(1);

    // Check attributes
    const attributes = span.attributes;
    const testAttr = attributes.find((attr: any) => attr.key === 'test.attribute');
    const jobIdAttr = attributes.find((attr: any) => attr.key === 'emp.job.id');

    expect(testAttr?.value.stringValue).toBe('test-value');
    expect(jobIdAttr?.value.stringValue).toBe('test-job-789');
  });

  it('should handle multiple events in batch', async () => {
    // Start the bridge
    await bridge.start();

    // Wait for bridge to initialize
    await new Promise(resolve => setTimeout(resolve, 500));

    // Manually add multiple test events to bridge test stream
    for (let i = 0; i < 3; i++) {
      await redis.xadd(
        testStreamKey,
        '*',
        'event', // dataType field
        JSON.stringify({
          timestamp: Date.now(),
          service: 'test-service',
          eventType: `test.event.${i}`,
          traceId: `test-trace-${i}`,
          data: {
            index: i,
            jobId: `job-${i}`
          },
          level: 'info',
          jobId: `job-${i}`
        })
      );
    }

    // Wait for bridge to process
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Should have received OTLP payloads (may be batched)
    expect(receivedOtlpPayloads.length).toBeGreaterThan(0);

    // Count total spans across all payloads
    let totalSpans = 0;
    receivedOtlpPayloads.forEach(payload => {
      payload.resourceSpans.forEach((rs: any) => {
        rs.scopeSpans.forEach((ss: any) => {
          totalSpans += ss.spans.length;
        });
      });
    });

    expect(totalSpans).toBe(3);
  });

  it('should handle malformed data gracefully', async () => {
    // Start the bridge
    await bridge.start();

    // Wait for bridge to initialize
    await new Promise(resolve => setTimeout(resolve, 500));

    // Manually add malformed data to stream
    await redis.xadd(
      testStreamKey,
      '*',
      'malformed', 'not-json'
    );

    await redis.xadd(
      testStreamKey,
      '*',
      'event', 'not-valid-json{'
    );

    // Add a valid event after malformed ones
    await redis.xadd(
      testStreamKey,
      '*',
      'event', // dataType field
      JSON.stringify({
        timestamp: Date.now(),
        service: 'test-service',
        eventType: 'test.valid',
        traceId: 'test-trace-valid',
        data: { message: 'valid event' },
        level: 'info'
      })
    );

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Should have received only the valid event
    expect(receivedOtlpPayloads).toHaveLength(1);

    const span = receivedOtlpPayloads[0].resourceSpans[0].scopeSpans[0].spans[0];
    expect(span.name).toBe('test.valid');
  });

  it('should maintain bridge stats correctly', async () => {
    // Start the bridge
    await bridge.start();

    // Wait for bridge to initialize
    await new Promise(resolve => setTimeout(resolve, 500));

    // Initial stats
    let stats = bridge.getStats();
    expect(stats.isRunning).toBe(true);
    expect(stats.processedCount).toBe(0);

    // Send an event
    await redis.xadd(
      testStreamKey,
      '*',
      'event', // dataType field
      JSON.stringify({
        timestamp: Date.now(),
        service: 'test-service',
        eventType: 'test.stats',
        traceId: 'test-trace-stats',
        data: { message: 'stats test' },
        level: 'info'
      })
    );

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check updated stats
    stats = bridge.getStats();
    expect(stats.processedCount).toBe(1);
  });

  it('should handle OTLP endpoint failures gracefully', async () => {
    // Mock fetch to simulate failure
    global.fetch = vi.fn().mockImplementation(() => {
      return Promise.resolve({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error'),
      });
    });

    // Start the bridge
    await bridge.start();

    // Wait for bridge to initialize
    await new Promise(resolve => setTimeout(resolve, 500));

    // Send an event
    await redis.xadd(
      testStreamKey,
      '*',
      'event', // dataType field
      JSON.stringify({
        timestamp: Date.now(),
        service: 'test-service',
        eventType: 'test.failure',
        traceId: 'test-trace-failure',
        data: { message: 'failure test' },
        level: 'info'
      })
    );

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Bridge should still be running despite OTLP failures
    const stats = bridge.getStats();
    expect(stats.isRunning).toBe(true);
  });
});