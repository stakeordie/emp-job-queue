import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventProcessor } from '../event-processor';
import { TelemetryEvent, OtelSpan } from '@emp/core';

describe('EventProcessor', () => {
  let processor: EventProcessor;
  let consoleSpy: any;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processor = new EventProcessor({
      outputFormat: 'console',
      batchSize: 10,
      flushInterval: 1000
    });
  });

  describe('TelemetryEvent Processing', () => {
    it('should process valid telemetry event with timestamp', async () => {
      const event: TelemetryEvent = {
        timestamp: Date.now(),
        service: 'test-service',
        eventType: 'test.event',
        traceId: 'trace-123',
        data: { test: 'data' }
      };

      await processor.processEvent(event);

      expect(consoleSpy).toHaveBeenCalled();
      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain('test-service');
      expect(logCall).toContain('test.event');
    });

    it('should handle event with invalid timestamp gracefully', async () => {
      const event: TelemetryEvent = {
        timestamp: NaN, // Invalid timestamp
        service: 'test-service',
        eventType: 'test.invalid',
        traceId: 'trace-123',
        data: {}
      };

      // Should not throw
      await expect(processor.processEvent(event)).resolves.not.toThrow();
    });

    it('should handle event with undefined timestamp', async () => {
      const event: TelemetryEvent = {
        timestamp: undefined as any, // Missing timestamp
        service: 'test-service',
        eventType: 'test.missing',
        traceId: 'trace-123',
        data: {}
      };

      await expect(processor.processEvent(event)).resolves.not.toThrow();
    });

    it('should handle event with string timestamp', async () => {
      const event: TelemetryEvent = {
        timestamp: '2024-01-01T00:00:00Z' as any, // String instead of number
        service: 'test-service',
        eventType: 'test.string',
        traceId: 'trace-123',
        data: {}
      };

      await expect(processor.processEvent(event)).resolves.not.toThrow();
    });

    it('should handle event with zero timestamp', async () => {
      const event: TelemetryEvent = {
        timestamp: 0, // Epoch zero
        service: 'test-service',
        eventType: 'test.zero',
        traceId: 'trace-123',
        data: {}
      };

      await expect(processor.processEvent(event)).resolves.not.toThrow();
    });

    it('should handle event with negative timestamp', async () => {
      const event: TelemetryEvent = {
        timestamp: -1, // Negative timestamp
        service: 'test-service',
        eventType: 'test.negative',
        traceId: 'trace-123',
        data: {}
      };

      await expect(processor.processEvent(event)).resolves.not.toThrow();
    });

    it('should handle event with future timestamp', async () => {
      const event: TelemetryEvent = {
        timestamp: Date.now() + 86400000, // Tomorrow
        service: 'test-service',
        eventType: 'test.future',
        traceId: 'trace-123',
        data: {}
      };

      await expect(processor.processEvent(event)).resolves.not.toThrow();
    });
  });

  describe('OtelSpan Processing', () => {
    it('should process valid OTEL span', async () => {
      const span: OtelSpan = {
        traceId: 'trace-123',
        spanId: 'span-456',
        operationName: 'test.operation',
        startTime: Date.now() * 1_000_000, // Nanoseconds
        status: { code: 1 },
        resource: {
          'service.name': 'test-service',
          'service.version': '1.0.0',
          'service.instance.id': 'test-instance',
          'deployment.environment': 'test'
        },
        attributes: { test: 'attribute' }
      };

      await processor.processEvent(span);

      expect(consoleSpy).toHaveBeenCalled();
      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain('test-service');
      expect(logCall).toContain('test.operation');
    });

    it('should handle span with invalid startTime', async () => {
      const span: OtelSpan = {
        traceId: 'trace-123',
        spanId: 'span-456',
        operationName: 'test.operation',
        startTime: NaN, // Invalid startTime
        status: { code: 1 },
        resource: {
          'service.name': 'test-service',
          'service.version': '1.0.0',
          'service.instance.id': 'test-instance',
          'deployment.environment': 'test'
        },
        attributes: {}
      };

      await expect(processor.processEvent(span)).resolves.not.toThrow();
    });

    it('should handle span with zero startTime', async () => {
      const span: OtelSpan = {
        traceId: 'trace-123',
        spanId: 'span-456',
        operationName: 'test.operation',
        startTime: 0, // Zero startTime
        status: { code: 1 },
        resource: {
          'service.name': 'test-service',
          'service.version': '1.0.0',
          'service.instance.id': 'test-instance',
          'deployment.environment': 'test'
        },
        attributes: {}
      };

      await expect(processor.processEvent(span)).resolves.not.toThrow();
    });

    it('should handle span with negative startTime', async () => {
      const span: OtelSpan = {
        traceId: 'trace-123',
        spanId: 'span-456',
        operationName: 'test.operation',
        startTime: -1_000_000, // Negative nanoseconds
        status: { code: 1 },
        resource: {
          'service.name': 'test-service',
          'service.version': '1.0.0',
          'service.instance.id': 'test-instance',
          'deployment.environment': 'test'
        },
        attributes: {}
      };

      await expect(processor.processEvent(span)).resolves.not.toThrow();
    });
  });

  describe('Event Types from API Server', () => {
    it('should handle service.started event', async () => {
      const event: OtelSpan = {
        traceId: 'trace-123',
        spanId: 'span-456',
        operationName: 'service.started',
        startTime: Date.now() * 1_000_000,
        status: { code: 1 },
        resource: {
          'service.name': 'api',
          'service.version': '1.0.0',
          'service.instance.id': 'test-instance',
          'deployment.environment': 'test'
        },
        attributes: { port: 3331, version: '1.0.0' }
      };

      await expect(processor.processEvent(event)).resolves.not.toThrow();
    });

    it('should handle health.check event', async () => {
      const event: OtelSpan = {
        traceId: 'trace-123',
        spanId: 'span-456',
        operationName: 'health.check',
        startTime: Date.now() * 1_000_000,
        status: { code: 1 },
        resource: {
          'service.name': 'api',
          'service.version': '1.0.0',
          'service.instance.id': 'test-instance',
          'deployment.environment': 'test'
        },
        attributes: { status: 'healthy' }
      };

      await expect(processor.processEvent(event)).resolves.not.toThrow();
    });

    it('should handle websocket.connection event', async () => {
      const event: OtelSpan = {
        traceId: 'trace-123',
        spanId: 'span-456',
        operationName: 'websocket.connection',
        startTime: Date.now() * 1_000_000,
        status: { code: 1 },
        resource: {
          'service.name': 'api',
          'service.version': '1.0.0',
          'service.instance.id': 'test-instance',
          'deployment.environment': 'test'
        },
        attributes: { socketId: 'socket-123', action: 'connect' }
      };

      await expect(processor.processEvent(event)).resolves.not.toThrow();
    });

    it('should handle redis.operation event', async () => {
      const event: OtelSpan = {
        traceId: 'trace-123',
        spanId: 'span-456',
        operationName: 'redis.operation',
        startTime: Date.now() * 1_000_000,
        status: { code: 1 },
        resource: {
          'service.name': 'api',
          'service.version': '1.0.0',
          'service.instance.id': 'test-instance',
          'deployment.environment': 'test'
        },
        attributes: {
          operation: 'HMSET',
          key: 'machine:123',
          durationMs: 5
        }
      };

      await expect(processor.processEvent(event)).resolves.not.toThrow();
    });

    it('should handle error event', async () => {
      const event: OtelSpan = {
        traceId: 'trace-123',
        spanId: 'span-456',
        operationName: 'error.uncaught',
        startTime: Date.now() * 1_000_000,
        status: { code: 2 }, // Error status
        resource: {
          'service.name': 'api',
          'service.version': '1.0.0',
          'service.instance.id': 'test-instance',
          'deployment.environment': 'test'
        },
        attributes: {
          'error.message': 'Test error',
          'error.stack': 'Error: Test error\n  at ...',
          'error.type': 'Error'
        }
      };

      await expect(processor.processEvent(event)).resolves.not.toThrow();
    });
  });

  describe('Batch Processing', () => {
    it('should batch events and flush when batch size reached', async () => {
      processor = new EventProcessor({
        outputFormat: 'console',
        batchSize: 3,
        flushInterval: 10000
      });

      const flushSpy = vi.spyOn(processor, 'flush');

      // Add 2 events - should not flush
      for (let i = 0; i < 2; i++) {
        await processor.processEvent({
          timestamp: Date.now(),
          service: 'test',
          eventType: `event.${i}`,
          traceId: `trace-${i}`,
          data: {}
        });
      }
      expect(flushSpy).not.toHaveBeenCalled();

      // Add 3rd event - should trigger flush
      await processor.processEvent({
        timestamp: Date.now(),
        service: 'test',
        eventType: 'event.3',
        traceId: 'trace-3',
        data: {}
      });
      expect(flushSpy).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed event object', async () => {
      const malformed = {
        notAValidField: 'test'
      } as any;

      await expect(processor.processEvent(malformed)).resolves.not.toThrow();
    });

    it('should handle null event', async () => {
      await expect(processor.processEvent(null as any)).resolves.not.toThrow();
    });

    it('should handle undefined event', async () => {
      await expect(processor.processEvent(undefined as any)).resolves.not.toThrow();
    });

    it('should handle event with circular reference in data', async () => {
      const circularData: any = { self: null };
      circularData.self = circularData;

      const event: TelemetryEvent = {
        timestamp: Date.now(),
        service: 'test',
        eventType: 'circular',
        traceId: 'trace-123',
        data: circularData
      };

      await expect(processor.processEvent(event)).resolves.not.toThrow();
    });
  });
});