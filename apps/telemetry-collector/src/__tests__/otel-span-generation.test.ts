/**
 * OTEL Span Generation Tests
 *
 * Tests the EventClient's ability to generate proper OTEL spans
 * Validates span structure, attributes, and hierarchical relationships
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Redis from 'ioredis';
import { EventClient, createEventClientWithDefaults, EmpSpanTypes, SpanStatusCode } from '@emp/core';

describe('OTEL Span Generation', () => {
  let redis: Redis;
  let eventClient: EventClient;
  let capturedSpans: any[] = [];

  const testStreamKey = 'test:otel:spans';

  beforeEach(async () => {
    capturedSpans = [];

    // Setup Redis connection
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    // Clean up any existing test data
    await redis.del(testStreamKey);

    // Setup event client with immediate flushing for tests
    eventClient = createEventClientWithDefaults({
      serviceName: 'otel-test-service',
      redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
      streamKey: testStreamKey,
      batchSize: 1, // Immediate flushing
      flushInterval: 100,
    });
  });

  afterEach(async () => {
    if (eventClient) {
      await eventClient.close();
    }
    if (redis) {
      await redis.del(testStreamKey);
      await redis.quit();
    }
  });

  describe('Basic Span Generation', () => {
    it('should generate valid OTEL span with span() method', async () => {
      const spanId = await eventClient.span(EmpSpanTypes.JOB_CREATE, {
        userId: 'user-123',
        jobType: 'image_generation'
      }, {
        jobId: 'job-span-test-123',
        traceId: 'trace-span-test-456'
      });

      await eventClient.flush();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Read the span directly from Redis stream
      const events = await redis.xrange(testStreamKey, '-', '+');
      expect(events).toHaveLength(1);

      const [eventId, fields] = events[0];
      expect(fields[0]).toBe('span'); // Should be 'span', not 'event'

      const spanData = JSON.parse(fields[1]);

      // Verify basic OTEL span structure
      expect(spanData.spanId).toBe(spanId);
      expect(spanData.traceId).toBe('trace-span-test-456');
      expect(spanData.operationName).toBe(EmpSpanTypes.JOB_CREATE);
      expect(spanData.startTime).toBeTypeOf('number');
      expect(spanData.startTime).toBeGreaterThan(Date.now() * 1_000_000 - 1_000_000_000); // Within last second

      // Verify status structure
      expect(spanData.status).toBeDefined();
      expect(spanData.status.code).toBe(SpanStatusCode.UNSET);

      // Verify resource attributes
      expect(spanData.resource).toBeDefined();
      expect(spanData.resource['service.name']).toBe('otel-test-service');
      expect(spanData.resource['service.version']).toBeTypeOf('string');
      expect(spanData.resource['deployment.environment']).toBeTypeOf('string');

      // Verify span attributes
      expect(spanData.attributes).toBeDefined();
      expect(spanData.attributes['emp.job.id']).toBe('job-span-test-123');
      expect(spanData.attributes.userId).toBe('user-123');
      expect(spanData.attributes.jobType).toBe('image_generation');
    });

    it('should generate span with duration when provided', async () => {
      const startTime = Date.now();
      const duration = 5000; // 5 seconds

      await eventClient.span(EmpSpanTypes.JOB_PROCESS, {
        stage: 'inference'
      }, {
        duration,
        status: 'ok'
      });

      await eventClient.flush();
      await new Promise(resolve => setTimeout(resolve, 100));

      const events = await redis.xrange(testStreamKey, '-', '+');
      const spanData = JSON.parse(events[0][1][1]);

      expect(spanData.endTime).toBeDefined();
      expect(spanData.duration).toBe(duration * 1_000_000); // Converted to nanoseconds
      expect(spanData.status.code).toBe(SpanStatusCode.OK);
    });

    it('should generate error span with error status', async () => {
      await eventClient.span(EmpSpanTypes.JOB_COMPLETE, {
        error: 'Job failed during processing',
        errorCode: 'PROCESSING_ERROR'
      }, {
        status: 'error',
        jobId: 'job-error-123'
      });

      await eventClient.flush();
      await new Promise(resolve => setTimeout(resolve, 100));

      const events = await redis.xrange(testStreamKey, '-', '+');
      const spanData = JSON.parse(events[0][1][1]);

      expect(spanData.status.code).toBe(SpanStatusCode.ERROR);
      expect(spanData.attributes.error).toBe('Job failed during processing');
      expect(spanData.attributes.errorCode).toBe('PROCESSING_ERROR');
      expect(spanData.attributes['emp.job.id']).toBe('job-error-123');
    });
  });

  describe('Hierarchical Span Relationships', () => {
    it('should create parent-child span relationships', async () => {
      const traceId = 'trace-hierarchy-123';

      // Create parent span
      const parentSpanId = await eventClient.span(EmpSpanTypes.JOB_CREATE, {
        userId: 'user-parent-test'
      }, {
        traceId,
        jobId: 'job-parent-456'
      });

      // Create child span
      const childSpanId = await eventClient.span(EmpSpanTypes.JOB_QUEUE, {
        queueName: 'default'
      }, {
        traceId,
        parentSpanId,
        jobId: 'job-parent-456'
      });

      await eventClient.flush();
      await new Promise(resolve => setTimeout(resolve, 100));

      const events = await redis.xrange(testStreamKey, '-', '+');
      expect(events).toHaveLength(2);

      // Parse both spans
      const span1 = JSON.parse(events[0][1][1]);
      const span2 = JSON.parse(events[1][1][1]);

      // Identify parent and child
      const parentSpan = span1.spanId === parentSpanId ? span1 : span2;
      const childSpan = span1.spanId === childSpanId ? span1 : span2;

      // Verify hierarchy
      expect(parentSpan.spanId).toBe(parentSpanId);
      expect(parentSpan.traceId).toBe(traceId);
      expect(parentSpan.parentSpanId).toBeUndefined();

      expect(childSpan.spanId).toBe(childSpanId);
      expect(childSpan.traceId).toBe(traceId);
      expect(childSpan.parentSpanId).toBe(parentSpanId);

      // Both should have same job ID
      expect(parentSpan.attributes['emp.job.id']).toBe('job-parent-456');
      expect(childSpan.attributes['emp.job.id']).toBe('job-parent-456');
    });
  });

  describe('Job-Specific Span Helpers', () => {
    it('should generate job span with jobSpan() helper', async () => {
      const spanId = await eventClient.jobSpan('job-helper-123', EmpSpanTypes.JOB_PROCESS, {
        modelName: 'stable-diffusion-xl',
        gpuMemory: '24GB'
      }, {
        duration: 15000,
        status: 'ok'
      });

      await eventClient.flush();
      await new Promise(resolve => setTimeout(resolve, 100));

      const events = await redis.xrange(testStreamKey, '-', '+');
      const spanData = JSON.parse(events[0][1][1]);

      expect(spanData.spanId).toBe(spanId);
      expect(spanData.operationName).toBe(EmpSpanTypes.JOB_PROCESS);
      expect(spanData.attributes['emp.job.id']).toBe('job-helper-123');
      expect(spanData.attributes.modelName).toBe('stable-diffusion-xl');
      expect(spanData.attributes.gpuMemory).toBe('24GB');
      expect(spanData.duration).toBe(15000 * 1_000_000);
    });

    it('should generate worker span with workerSpan() helper', async () => {
      const spanId = await eventClient.workerSpan('worker-helper-456', EmpSpanTypes.WORKER_EXECUTE, {
        capabilities: ['comfyui', 'gpu', 'cuda'],
        machineId: 'machine-789'
      });

      await eventClient.flush();
      await new Promise(resolve => setTimeout(resolve, 100));

      const events = await redis.xrange(testStreamKey, '-', '+');
      const spanData = JSON.parse(events[0][1][1]);

      expect(spanData.spanId).toBe(spanId);
      expect(spanData.operationName).toBe(EmpSpanTypes.WORKER_EXECUTE);
      expect(spanData.attributes['emp.worker.id']).toBe('worker-helper-456');
      expect(spanData.attributes.capabilities).toEqual(['comfyui', 'gpu', 'cuda']);
      expect(spanData.attributes.machineId).toBe('machine-789');
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain compatibility with legacy event() method', async () => {
      await eventClient.event('legacy.test.event', {
        legacyData: 'test-value',
        compatibility: true
      }, {
        jobId: 'job-legacy-123',
        level: 'info'
      });

      await eventClient.flush();
      await new Promise(resolve => setTimeout(resolve, 100));

      const events = await redis.xrange(testStreamKey, '-', '+');
      expect(events).toHaveLength(1);

      const [eventId, fields] = events[0];
      expect(fields[0]).toBe('span'); // Even legacy events become spans

      const spanData = JSON.parse(fields[1]);

      // Verify legacy event was converted to OTEL span
      expect(spanData.operationName).toBe('legacy.test.event');
      expect(spanData.attributes.legacyData).toBe('test-value');
      expect(spanData.attributes.compatibility).toBe(true);
      expect(spanData.attributes['emp.job.id']).toBe('job-legacy-123');
      expect(spanData.status.code).toBe(SpanStatusCode.OK); // info level = OK
    });

    it('should convert legacy error events to error spans', async () => {
      await eventClient.event('error.occurred', {
        message: 'Something went wrong',
        stack: 'Error stack trace...'
      }, {
        level: 'error',
        workerId: 'worker-error-456'
      });

      await eventClient.flush();
      await new Promise(resolve => setTimeout(resolve, 100));

      const events = await redis.xrange(testStreamKey, '-', '+');
      const spanData = JSON.parse(events[0][1][1]);

      expect(spanData.operationName).toBe('error.occurred');
      expect(spanData.status.code).toBe(SpanStatusCode.ERROR);
      expect(spanData.attributes.message).toBe('Something went wrong');
      expect(spanData.attributes.stack).toBe('Error stack trace...');
      expect(spanData.attributes['emp.worker.id']).toBe('worker-error-456');
    });
  });

  describe('Span ID Generation', () => {
    it('should generate unique span IDs', async () => {
      const spanIds = new Set<string>();

      // Generate multiple spans
      for (let i = 0; i < 10; i++) {
        const spanId = await eventClient.span(EmpSpanTypes.JOB_CREATE, {
          iteration: i
        });
        spanIds.add(spanId);
      }

      // All span IDs should be unique
      expect(spanIds.size).toBe(10);

      // All span IDs should be valid hex strings of correct length
      for (const spanId of spanIds) {
        expect(spanId).toMatch(/^[0-9a-f]{16}$/);
      }
    });

    it('should generate valid trace IDs when not provided', async () => {
      await eventClient.span(EmpSpanTypes.JOB_CREATE, {});

      await eventClient.flush();
      await new Promise(resolve => setTimeout(resolve, 100));

      const events = await redis.xrange(testStreamKey, '-', '+');
      const spanData = JSON.parse(events[0][1][1]);

      // Should have a valid trace ID
      expect(spanData.traceId).toBeTypeOf('string');
      expect(spanData.traceId.length).toBeGreaterThan(0);
    });
  });

  describe('Resource Attribute Consistency', () => {
    it('should maintain consistent resource attributes across spans', async () => {
      // Generate multiple spans
      await eventClient.span(EmpSpanTypes.JOB_CREATE, {});
      await eventClient.flush();
      await new Promise(resolve => setTimeout(resolve, 50));

      await eventClient.span(EmpSpanTypes.JOB_QUEUE, {});
      await eventClient.flush();
      await new Promise(resolve => setTimeout(resolve, 50));

      await eventClient.span(EmpSpanTypes.JOB_PROCESS, {});
      await eventClient.flush();
      await new Promise(resolve => setTimeout(resolve, 100));

      const events = await redis.xrange(testStreamKey, '-', '+');
      expect(events).toHaveLength(3);

      // All spans should have identical resource attributes
      const resources = events.map(([_, fields]) => JSON.parse(fields[1]).resource);

      for (let i = 1; i < resources.length; i++) {
        expect(resources[i]).toEqual(resources[0]);
      }

      // Verify required resource attributes are present
      const resource = resources[0];
      expect(resource['service.name']).toBe('otel-test-service');
      expect(resource['service.version']).toBeTypeOf('string');
      expect(resource['service.instance.id']).toBeTypeOf('string');
      expect(resource['deployment.environment']).toBeTypeOf('string');
    });
  });
});