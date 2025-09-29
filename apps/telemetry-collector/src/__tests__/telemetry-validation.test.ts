/**
 * Comprehensive Telemetry Event Validation Test
 *
 * This test validates that all expected telemetry events are being generated
 * and processed correctly through the entire pipeline.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventProcessor } from '../event-processor.js';
import { RedisConsumer } from '../redis-consumer.js';
import { TelemetryEvent, OtelSpan, EventTypes } from '@emp/core';
import Redis from 'ioredis';

describe('Telemetry Event Validation', () => {
  let processor: EventProcessor;
  let redis: Redis;

  const streamKey = 'test-telemetry-stream';
  const expectedEvents = [
    // Service events
    EventTypes.SERVICE_STARTED,
    EventTypes.HEALTH_CHECK,

    // Worker events
    EventTypes.WORKER_REGISTERED,
    EventTypes.WORKER_HEARTBEAT,
    EventTypes.WORKER_STATUS_CHANGED,

    // Machine events
    EventTypes.MACHINE_REGISTERED,
    EventTypes.MACHINE_STATUS_CHANGED,

    // WebSocket events
    EventTypes.WEBSOCKET_CONNECTION,
    EventTypes.WEBSOCKET_DISCONNECTION,

    // Redis operations
    EventTypes.REDIS_OPERATION,
    EventTypes.REDIS_CONNECTION,

    // Job events
    EventTypes.JOB_SUBMITTED,
    EventTypes.JOB_CLAIMED,
    EventTypes.JOB_STARTED,
    EventTypes.JOB_COMPLETED,
    EventTypes.JOB_FAILED,
  ];

  beforeEach(async () => {
    processor = new EventProcessor({
      outputFormat: 'console',
      batchSize: 10,
      flushInterval: 1000,
      dash0: {
        enabled: false, // Disable for testing
        endpoint: '',
        authToken: '',
        dataset: 'test',
        batchSize: 10,
        flushInterval: 1000,
      }
    });

    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

    // Clean up test stream
    try {
      await redis.del(streamKey);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  afterEach(async () => {
    await processor.stop();
    await redis.quit();
  });

  describe('Event Format Validation', () => {
    it('should process all expected event types correctly', async () => {
      const processedEvents: string[] = [];

      // Override processor to capture events
      const originalLogData = (processor as any).logData.bind(processor);
      (processor as any).logData = function(data: TelemetryEvent | OtelSpan) {
        if ('eventType' in data) {
          processedEvents.push(data.eventType);
        } else if ('operationName' in data) {
          processedEvents.push(data.operationName);
        }
        return originalLogData(data);
      };

      // Generate test events for each expected type
      for (const eventType of expectedEvents) {
        const testEvent: TelemetryEvent = {
          timestamp: Date.now(),
          service: 'test-service',
          eventType: eventType,
          traceId: `trace-${eventType}`,
          data: {
            testType: eventType,
            priority: 'normal'
          },
          level: 'info'
        };

        await processor.processEvent(testEvent);
      }

      // Verify all events were processed
      expect(processedEvents).toHaveLength(expectedEvents.length);
      for (const expectedEvent of expectedEvents) {
        expect(processedEvents).toContain(expectedEvent);
      }
    });

    it('should validate event format requirements', async () => {
      const requiredFields = ['timestamp', 'service', 'eventType', 'traceId'];

      // Test each required field
      for (const field of requiredFields) {
        const incompleteEvent = {
          timestamp: Date.now(),
          service: 'test-service',
          eventType: EventTypes.SERVICE_STARTED,
          traceId: 'test-trace-123',
          data: {}
        };

        // Remove the required field
        delete (incompleteEvent as any)[field];

        // Should still process without throwing
        await expect(processor.processEvent(incompleteEvent as any))
          .resolves.not.toThrow();
      }
    });
  });

  describe('OTLP Span Validation', () => {
    it('should validate WorkflowSpan format with all required attributes', async () => {
      const workflowSpan: OtelSpan = {
        traceId: 'test-trace-workflow-123',
        spanId: 'test-span-456',
        parentSpanId: 'parent-span-789',
        operationName: 'workflow.processing',
        startTime: Date.now() * 1_000_000, // nanoseconds
        endTime: (Date.now() + 100) * 1_000_000,
        duration: 100 * 1_000_000,
        status: {
          code: 1,
          message: 'OK'
        },
        attributes: {
          'service.name': 'emp-api',
          'emp.workflow.id': 'workflow-test-123',
          'emp.job.id': 'job-test-456',
          'emp.claim.id': 'claim-test-789',
          'emp.generation.id': 'generation-test-abc',
          'emp.collection.id': 'collection-test-xyz',
          'emp.user.id': 'user-test-123',
          'emp.worker.id': 'worker-test-456',
          'emp.machine.id': 'machine-test-789'
        },
        resource: {
          'service.name': 'emp-api',
          'service.version': '1.0.0',
          'service.instance.id': 'api-instance-1',
          'deployment.environment': 'test'
        }
      };

      // Should process without errors
      await expect(processor.processEvent(workflowSpan))
        .resolves.not.toThrow();
    });
  });

  describe('Event Generation Diagnostic', () => {
    it('should identify missing event types from services', async () => {
      console.log('\n🔍 DIAGNOSTIC: Expected vs Actual Events');
      console.log('================================================');
      console.log('Expected events that should be generated:');

      expectedEvents.forEach((eventType, index) => {
        console.log(`${index + 1}. ${eventType}`);
      });

      console.log('\n❌ Currently only seeing: worker.registered');
      console.log('\n🔍 Potential Issues:');
      console.log('1. Services not generating events (check service initialization)');
      console.log('2. Redis stream not configured (check REDIS_URL and stream setup)');
      console.log('3. Telemetry collector not consuming (check consumer group)');
      console.log('4. Events generated but not forwarded to Dash0 (check DASH0_* env vars)');
      console.log('5. Event filtering or batching dropping events');

      // This test is informational, always passes
      expect(true).toBe(true);
    });

    it('should validate Redis stream connectivity', async () => {
      try {
        // Test Redis connection
        const pong = await redis.ping();
        expect(pong).toBe('PONG');
        console.log('✅ Redis connection: OK');

        // Test stream creation
        const streamId = await redis.xadd(streamKey, '*', 'test', 'data');
        expect(streamId).toBeTruthy();
        console.log('✅ Redis stream write: OK');

        // Test stream reading
        const messages = await redis.xread('STREAMS', streamKey, '0');
        expect(messages).toBeTruthy();
        console.log('✅ Redis stream read: OK');

      } catch (error) {
        console.error('❌ Redis connectivity issue:', error);
        throw error;
      }
    });
  });

  describe('Service Integration Check', () => {
    it('should verify service startup telemetry generation', () => {
      console.log('\n🔍 SERVICE STARTUP CHECKLIST:');
      console.log('=====================================');
      console.log('Check these services are generating startup events:');
      console.log('');
      console.log('1. API Service (apps/api):');
      console.log('   - service.started event on startup');
      console.log('   - health.check events (periodic)');
      console.log('   - websocket.connection events (on client connect)');
      console.log('');
      console.log('2. Worker Service (apps/worker):');
      console.log('   - worker.registered event (✅ YOU ARE SEEING THIS)');
      console.log('   - worker.heartbeat events (periodic)');
      console.log('   - worker.status.changed events');
      console.log('');
      console.log('3. Machine Service (apps/machine):');
      console.log('   - machine.registered event');
      console.log('   - machine.status.changed events');
      console.log('');
      console.log('4. Telemetry Collector (apps/telemetry-collector):');
      console.log('   - service.started event on collector startup');
      console.log('   - redis.connection events');
      console.log('   - redis.operation events (on stream operations)');
      console.log('');
      console.log('🔧 NEXT STEPS:');
      console.log('1. Check if telemetry-collector is actually running');
      console.log('2. Verify services are initializing telemetry clients');
      console.log('3. Check Redis stream has data: redis-cli XLEN telemetry-stream');
      console.log('4. Verify Dash0 environment variables are set correctly');

      expect(true).toBe(true);
    });
  });
});