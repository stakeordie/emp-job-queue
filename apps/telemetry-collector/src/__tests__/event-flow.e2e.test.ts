/**
 * End-to-End Event Flow Tests
 *
 * Tests the complete telemetry system including collector and processor
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Redis from 'ioredis';
import { EventClient, TelemetryEvent, OtelSpan } from '@emp/core';
import { RedisConsumer, ConsumerConfig } from '../redis-consumer.js';
import { EventProcessor, ProcessorConfig } from '../event-processor.js';

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

describe('End-to-End Event Flow', () => {
  let redis: Redis;
  let eventClient: EventClient;
  let consumer: RedisConsumer;
  let processor: EventProcessor;
  let processedEvents: TelemetryEvent[] = [];
  let consoleOutput: string[] = [];

  const testStreamKey = 'test:e2e:events';
  const testGroupName = 'test-e2e-collectors';

  // Mock console.log to capture output
  const originalConsoleLog = console.log;

  beforeEach(async () => {
    processedEvents = [];
    consoleOutput = [];

    // Mock console.log
    console.log = (...args: any[]) => {
      consoleOutput.push(args.join(' '));
    };

    // Setup Redis
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    await redis.del(testStreamKey);
    try {
      await redis.xgroup('DESTROY', testStreamKey, testGroupName);
    } catch {
      // Ignore if group doesn't exist
    }

    // Setup event client
    eventClient = new EventClient(
      'e2e-test-service',
      process.env.REDIS_URL || 'redis://localhost:6379'
    );

    // Setup processor
    const processorConfig: ProcessorConfig = {
      outputFormat: 'console',
      batchSize: 5,
      flushInterval: 1000,
    };

    processor = new EventProcessor(processorConfig);

    // Setup consumer with processor
    const consumerConfig: ConsumerConfig = {
      redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
      streamKey: testStreamKey,
      consumerGroup: testGroupName,
      consumerName: 'e2e-consumer',
      batchSize: 10,
      blockTime: 1000,
    };

    consumer = new RedisConsumer(consumerConfig, async (event: TelemetryEvent | OtelSpan) => {
      // Convert OTEL spans to legacy events for test compatibility
      let legacyEvent: TelemetryEvent;
      if ('operationName' in event && 'resource' in event) {
        // This is an OTEL span
        legacyEvent = spanToEvent(event as OtelSpan);
      } else {
        // This is already a legacy event
        legacyEvent = event as TelemetryEvent;
      }

      processedEvents.push(legacyEvent);
      await processor.processEvent(legacyEvent);
    });
  });

  afterEach(async () => {
    // Restore console.log
    console.log = originalConsoleLog;

    // Cleanup
    if (processor) {
      await processor.stop();
    }
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
        // Ignore
      }
      await redis.quit();
    }
  });

  it('should process complete job lifecycle through telemetry system', async () => {
    await consumer.start();
    await new Promise(resolve => setTimeout(resolve, 500));

    const jobId = 'job_e2e_test_123';
    const workerId = 'worker_e2e_test_456';
    const traceId = 'trace_e2e_test_789';

    // Simulate complete job lifecycle
    await eventClient.jobEvent(jobId, 'job.created', {
      userId: 'user_123',
      jobType: 'image_generation',
      priority: 'normal',
      traceId
    });

    await eventClient.jobEvent(jobId, 'job.queued', {
      queueName: 'default',
      position: 1,
      traceId
    });

    await eventClient.workerEvent(workerId, 'worker.claimed_job', {
      jobId,
      capabilities: ['comfyui', 'gpu'],
      traceId
    });

    await eventClient.jobEvent(jobId, 'job.processing_started', {
      workerId,
      startTime: Date.now(),
      traceId
    });

    await eventClient.jobEvent(jobId, 'job.progress_updated', {
      progress: 50,
      details: 'Generating image...',
      traceId
    });

    await eventClient.jobEvent(jobId, 'job.completed', {
      workerId,
      duration: 5000,
      resultSize: 1024 * 512, // 512KB
      traceId
    });

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify all events were processed
    expect(processedEvents).toHaveLength(6);

    // Verify event sequence
    const eventTypes = processedEvents.map(e => e.eventType);
    expect(eventTypes).toEqual([
      'job.created',
      'job.queued',
      'worker.claimed_job',
      'job.processing_started',
      'job.progress_updated',
      'job.completed'
    ]);

    // Verify correlation IDs are maintained
    processedEvents.forEach(event => {
      expect(event.traceId).toBe(traceId);
      if (event.eventType.startsWith('job.')) {
        expect(event.jobId).toBe(jobId);
      }
      if (event.eventType.startsWith('worker.')) {
        expect(event.workerId).toBe(workerId);
      }
    });

    // Verify console output was generated
    expect(consoleOutput.length).toBeGreaterThan(0);

    // Check that job events have proper formatting
    const jobCreatedLog = consoleOutput.find(log =>
      log.includes('job.created') && log.includes(jobId.slice(0, 8))
    );
    expect(jobCreatedLog).toBeDefined();
    expect(jobCreatedLog).toContain('🔵'); // Info level icon
    expect(jobCreatedLog).toContain('[e2e-test-service]');
  });

  it('should handle error events with proper formatting', async () => {
    await consumer.start();
    await new Promise(resolve => setTimeout(resolve, 500));

    const jobId = 'job_error_test';
    const traceId = 'trace_error_test';

    // Emit error event
    await eventClient.jobEvent(jobId, 'job.failed', {
      error: 'Out of memory',
      errorCode: 'OOM',
      retryable: false,
      traceId,
      level: 'error'
    });

    await new Promise(resolve => setTimeout(resolve, 1500));

    expect(processedEvents).toHaveLength(1);
    expect(processedEvents[0].eventType).toBe('job.failed');
    expect(processedEvents[0].data.error).toBe('Out of memory');

    // Verify error formatting in console
    const errorLog = consoleOutput.find(log =>
      log.includes('job.failed') && log.includes('Out of memory')
    );
    expect(errorLog).toBeDefined();
    expect(errorLog).toContain('🔴'); // Error level icon
  });

  it('should batch and flush events correctly', async () => {
    // Create processor with small batch size for testing
    const batchProcessor = new EventProcessor({
      outputFormat: 'console',
      batchSize: 3,
      flushInterval: 5000, // Long interval to test batch triggering
    });

    const batchConsumer = new RedisConsumer({
      redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
      streamKey: testStreamKey,
      consumerGroup: testGroupName + '_batch',
      consumerName: 'batch-consumer',
      batchSize: 10,
      blockTime: 1000,
    }, async (event: TelemetryEvent) => {
      await batchProcessor.processEvent(event);
    });

    await batchConsumer.start();
    await new Promise(resolve => setTimeout(resolve, 500));

    // Emit exactly batchSize events to trigger flush
    await eventClient.event('batch.test1', { order: 1 });
    await eventClient.event('batch.test2', { order: 2 });
    await eventClient.event('batch.test3', { order: 3 }); // Should trigger flush

    await new Promise(resolve => setTimeout(resolve, 1500));

    // Verify batch processing
    const batchStats = batchProcessor.getStats();
    expect(batchStats.pendingEvents).toBe(0); // Should have flushed

    await batchConsumer.stop();
    await batchProcessor.stop();
  });

  it('should maintain performance under load', async () => {
    await consumer.start();
    await new Promise(resolve => setTimeout(resolve, 500));

    const startTime = Date.now();
    const eventCount = 100;

    // Emit many events quickly
    const emitPromises = [];
    for (let i = 0; i < eventCount; i++) {
      emitPromises.push(
        eventClient.event('load.test', {
          sequence: i,
          timestamp: Date.now()
        })
      );
    }

    await Promise.all(emitPromises);

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 3000));

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Verify all events were processed
    expect(processedEvents).toHaveLength(eventCount);

    // Performance assertion - should process 100 events in reasonable time
    expect(duration).toBeLessThan(10000); // Less than 10 seconds

    // Verify sequence integrity
    const sequences = processedEvents.map(e => e.data.sequence).sort((a, b) => a - b);
    for (let i = 0; i < eventCount; i++) {
      expect(sequences[i]).toBe(i);
    }

    console.log(`Processed ${eventCount} events in ${duration}ms (${(eventCount / duration * 1000).toFixed(2)} events/sec)`);
  });

  it('should handle processor errors gracefully', async () => {
    // Create processor that throws errors
    const errorProcessor = new EventProcessor({
      outputFormat: 'console',
      batchSize: 10,
      flushInterval: 1000,
    });

    // Override flush method to throw error
    const originalFlush = errorProcessor.flush.bind(errorProcessor);
    errorProcessor.flush = async () => {
      throw new Error('Simulated processor error');
    };

    const errorConsumer = new RedisConsumer({
      redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
      streamKey: testStreamKey,
      consumerGroup: testGroupName + '_error',
      consumerName: 'error-consumer',
      batchSize: 10,
      blockTime: 1000,
    }, async (event: TelemetryEvent) => {
      await errorProcessor.processEvent(event);
    });

    await errorConsumer.start();
    await new Promise(resolve => setTimeout(resolve, 500));

    // Should not throw even with processor errors
    await expect(eventClient.event('error.test', { data: 'test' })).resolves.not.toThrow();

    await new Promise(resolve => setTimeout(resolve, 1500));

    await errorConsumer.stop();

    // The error processor will throw when stopping due to the simulated error in flush()
    // This is expected behavior for this test
    try {
      await errorProcessor.stop();
    } catch (error) {
      // Expected error from simulated processor failure
      expect(error.message).toBe('Simulated processor error');
    }
  });
});