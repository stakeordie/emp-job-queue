/**
 * Format Conversion Tests
 *
 * Tests the conversion between legacy TelemetryEvent format and OTEL span format
 * Ensures proper format validation and transformation both ways
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TelemetryEvent, OtelSpan, EmpSpanTypes, SpanStatusCode } from '@emp/core';
import { EventProcessor } from '../event-processor.js';

describe('Format Conversion', () => {
  let processor: EventProcessor;

  beforeEach(() => {
    processor = new EventProcessor({
      outputFormat: 'console',
      batchSize: 10,
      flushInterval: 1000,
    });
  });

  describe('Legacy Event to OTEL Span Conversion', () => {
    it('should convert simple legacy event to OTEL span', () => {
      const legacyEvent: TelemetryEvent = {
        timestamp: 1632847200000, // 2021-09-28T12:00:00Z
        service: 'test-service',
        eventType: 'job.created',
        traceId: 'trace-abc123',
        data: {
          userId: 'user-456',
          priority: 'high'
        },
        level: 'info'
      };

      // Access the private method for testing
      const convertMethod = (processor as any).convertEventToSpan.bind(processor);
      const span: OtelSpan = convertMethod(legacyEvent);

      // Verify basic conversion
      expect(span.traceId).toBe('trace-abc123');
      expect(span.operationName).toBe('job.created');
      expect(span.startTime).toBe(1632847200000 * 1_000_000); // Converted to nanoseconds
      expect(span.status.code).toBe(SpanStatusCode.OK); // info level = OK

      // Verify resource attributes
      expect(span.resource['service.name']).toBe('test-service');
      expect(span.resource['service.version']).toBe('1.0.0');
      expect(span.resource['deployment.environment']).toBe(process.env.NODE_ENV || 'development');

      // Verify span attributes
      expect(span.attributes.userId).toBe('user-456');
      expect(span.attributes.priority).toBe('high');
      expect(span.attributes.legacy_event).toBe(true);
    });

    it('should convert error-level event to error span', () => {
      const errorEvent: TelemetryEvent = {
        timestamp: 1632847200000,
        service: 'worker-service',
        eventType: 'job.failed',
        traceId: 'trace-error-123',
        data: {
          error: 'Out of memory',
          errorCode: 'OOM'
        },
        level: 'error',
        jobId: 'job-789'
      };

      const convertMethod = (processor as any).convertEventToSpan.bind(processor);
      const span: OtelSpan = convertMethod(errorEvent);

      // Verify error status
      expect(span.status.code).toBe(SpanStatusCode.ERROR);

      // Verify EMP-specific attributes are mapped
      expect(span.attributes['emp.job.id']).toBe('job-789');
      expect(span.attributes.error).toBe('Out of memory');
      expect(span.attributes.errorCode).toBe('OOM');
    });

    it('should handle all EMP context fields in conversion', () => {
      const contextEvent: TelemetryEvent = {
        timestamp: 1632847200000,
        service: 'api-service',
        eventType: 'request.processed',
        traceId: 'trace-context-123',
        data: {
          method: 'POST',
          statusCode: 201
        },
        level: 'info',
        jobId: 'job-context-456',
        workerId: 'worker-context-789',
        machineId: 'machine-context-abc',
        userId: 'user-context-def'
      };

      const convertMethod = (processor as any).convertEventToSpan.bind(processor);
      const span: OtelSpan = convertMethod(contextEvent);

      // Verify all EMP context fields are mapped
      expect(span.attributes['emp.job.id']).toBe('job-context-456');
      expect(span.attributes['emp.worker.id']).toBe('worker-context-789');
      expect(span.attributes['emp.machine.id']).toBe('machine-context-abc');
      expect(span.attributes['emp.user.id']).toBe('user-context-def');

      // Verify data fields are preserved
      expect(span.attributes.method).toBe('POST');
      expect(span.attributes.statusCode).toBe(201);
    });
  });

  describe('OTEL Span Format Validation', () => {
    it('should correctly identify valid OTEL span', () => {
      const validSpan: OtelSpan = {
        traceId: 'trace-valid-123',
        spanId: 'span-valid-456',
        operationName: EmpSpanTypes.JOB_CREATE,
        startTime: Date.now() * 1_000_000,
        status: { code: SpanStatusCode.OK },
        resource: {
          'service.name': 'test-service',
          'service.version': '1.0.0',
          'service.instance.id': 'instance-123',
          'deployment.environment': 'test'
        },
        attributes: {
          'emp.job.id': 'job-123',
          'emp.job.type': 'image_generation'
        }
      };

      const isOtelSpan = (processor as any).isOtelSpan.bind(processor);
      const result = isOtelSpan(validSpan);

      expect(result).toBe(true);
    });

    it('should reject incomplete OTEL span', () => {
      const incompleteSpan = {
        traceId: 'trace-incomplete-123',
        // Missing spanId, operationName, etc.
        status: { code: SpanStatusCode.OK }
      };

      const isOtelSpan = (processor as any).isOtelSpan.bind(processor);
      expect(isOtelSpan(incompleteSpan)).toBe(false);
    });

    it('should reject legacy event when checking for OTEL span', () => {
      const legacyEvent: TelemetryEvent = {
        timestamp: 1632847200000,
        service: 'test-service',
        eventType: 'job.created',
        traceId: 'trace-legacy-123',
        data: {}
      };

      const isOtelSpan = (processor as any).isOtelSpan.bind(processor);
      expect(isOtelSpan(legacyEvent)).toBe(false);
    });
  });

  describe('Span Grouping and Organization', () => {
    it('should group spans by trace correctly', () => {
      const spans: OtelSpan[] = [
        {
          traceId: 'trace-1',
          spanId: 'span-1a',
          operationName: 'job.created',
          startTime: Date.now() * 1_000_000,
          status: { code: SpanStatusCode.OK },
          resource: { 'service.name': 'api' } as any,
          attributes: {}
        },
        {
          traceId: 'trace-1',
          spanId: 'span-1b',
          operationName: 'job.queued',
          startTime: Date.now() * 1_000_000,
          status: { code: SpanStatusCode.OK },
          resource: { 'service.name': 'api' } as any,
          attributes: {}
        },
        {
          traceId: 'trace-2',
          spanId: 'span-2a',
          operationName: 'worker.started',
          startTime: Date.now() * 1_000_000,
          status: { code: SpanStatusCode.OK },
          resource: { 'service.name': 'worker' } as any,
          attributes: {}
        }
      ];

      const groupMethod = (processor as any).groupSpansByTrace.bind(processor);
      const grouped = groupMethod(spans);

      expect(Object.keys(grouped)).toHaveLength(2);
      expect(grouped['trace-1']).toHaveLength(2);
      expect(grouped['trace-2']).toHaveLength(1);

      expect(grouped['trace-1'][0].spanId).toBe('span-1a');
      expect(grouped['trace-1'][1].spanId).toBe('span-1b');
      expect(grouped['trace-2'][0].spanId).toBe('span-2a');
    });
  });

  describe('Format-Specific Logging', () => {
    it('should format legacy event log correctly', () => {
      const event: TelemetryEvent = {
        timestamp: 1632847200000,
        service: 'test-service',
        eventType: 'job.created',
        traceId: 'trace-log-123',
        data: { priority: 'high' },
        level: 'info',
        jobId: 'job-short-id-12345678'
      };

      // Capture console output
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: any[]) => logs.push(args.join(' '));

      try {
        const logMethod = (processor as any).logEvent.bind(processor);
        logMethod(event);

        expect(logs).toHaveLength(1);
        const logLine = logs[0];

        // Verify log format components
        expect(logLine).toContain('🔵'); // Info level icon
        expect(logLine).toContain('[test-service]');
        expect(logLine).toContain('job.created');
        expect(logLine).toContain('job:job-shor'); // Truncated job ID
        expect(logLine).toContain('trace:trace-lo'); // Truncated trace ID
        expect(logLine).toContain('{"priority":"high"}');
      } finally {
        console.log = originalLog;
      }
    });

    it('should format OTEL span log correctly', () => {
      const span: OtelSpan = {
        traceId: 'trace-span-log-123456',
        spanId: 'span-log-789012',
        parentSpanId: 'parent-span-345678',
        operationName: EmpSpanTypes.JOB_PROCESS,
        startTime: 1632847200000 * 1_000_000,
        endTime: 1632847205000 * 1_000_000,
        duration: 5000 * 1_000_000, // 5 seconds in nanoseconds
        status: { code: SpanStatusCode.OK },
        resource: {
          'service.name': 'worker-service',
          'service.version': '2.0.0',
          'service.instance.id': 'worker-instance-123',
          'deployment.environment': 'production'
        },
        attributes: {
          'emp.job.id': 'job-span-456789',
          'emp.worker.id': 'worker-span-123456'
        }
      };

      // Capture console output
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: any[]) => logs.push(args.join(' '));

      try {
        const logMethod = (processor as any).logSpan.bind(processor);
        logMethod(span);

        expect(logs).toHaveLength(1);
        const logLine = logs[0];

        // Verify span log format components
        expect(logLine).toContain('🔵'); // OK status icon
        expect(logLine).toContain('[worker-service]');
        expect(logLine).toContain(EmpSpanTypes.JOB_PROCESS);
        expect(logLine).toContain('job:job-span'); // Truncated job ID
        expect(logLine).toContain('worker:worker-s'); // Truncated worker ID
        expect(logLine).toContain('trace:trace-sp'); // Truncated trace ID
        expect(logLine).toContain('span:span-log'); // Truncated span ID
        expect(logLine).toContain('parent:parent-s'); // Truncated parent span ID
        expect(logLine).toContain('(5000ms)'); // Duration in milliseconds
      } finally {
        console.log = originalLog;
      }
    });

    it('should format error span log with error icon', () => {
      const errorSpan: OtelSpan = {
        traceId: 'trace-error-span-123',
        spanId: 'span-error-456',
        operationName: 'job.failed',
        startTime: Date.now() * 1_000_000,
        status: {
          code: SpanStatusCode.ERROR,
          message: 'Job execution failed'
        },
        resource: {
          'service.name': 'worker-service',
          'service.version': '1.0.0',
          'service.instance.id': 'worker-1',
          'deployment.environment': 'test'
        },
        attributes: {
          'error.type': 'TimeoutError',
          'error.message': 'Job timed out after 30 seconds'
        }
      };

      // Capture console output
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: any[]) => logs.push(args.join(' '));

      try {
        const logMethod = (processor as any).logSpan.bind(processor);
        logMethod(errorSpan);

        expect(logs).toHaveLength(1);
        const logLine = logs[0];

        // Verify error formatting
        expect(logLine).toContain('🔴'); // Error level icon
        expect(logLine).toContain('job.failed');
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('Mixed Format Processing', () => {
    it('should handle mixed legacy events and OTEL spans in same batch', async () => {
      // Create processor with batch size 2 for this test
      const mixedProcessor = new EventProcessor({
        outputFormat: 'both',
        batchSize: 2,
        flushInterval: 1000,
      });

      const mixedData: (TelemetryEvent | OtelSpan)[] = [
        // Legacy event
        {
          timestamp: 1632847200000,
          service: 'api-service',
          eventType: 'request.received',
          traceId: 'trace-mixed-123',
          data: { endpoint: '/api/jobs' }
        },
        // OTEL span
        {
          traceId: 'trace-mixed-123',
          spanId: 'span-mixed-456',
          operationName: EmpSpanTypes.HTTP_REQUEST,
          startTime: 1632847200100 * 1_000_000,
          status: { code: SpanStatusCode.OK },
          resource: {
            'service.name': 'api-service',
            'service.version': '1.0.0',
            'service.instance.id': 'api-1',
            'deployment.environment': 'test'
          },
          attributes: {
            'http.method': 'POST',
            'http.route': '/api/jobs'
          }
        }
      ];

      // Capture forwarding behavior
      let forwardedData: (TelemetryEvent | OtelSpan)[] = [];
      const originalForward = (mixedProcessor as any).forwardToOtel.bind(mixedProcessor);
      (mixedProcessor as any).forwardToOtel = async (data: (TelemetryEvent | OtelSpan)[]) => {
        forwardedData = [...data]; // Copy the array
        return await originalForward(data);
      };

      // Process mixed data - this should trigger automatic flush at batch size 2
      for (const item of mixedData) {
        await mixedProcessor.processEvent(item);
      }

      // Verify both items were processed and converted appropriately
      expect(forwardedData).toHaveLength(2);

      await mixedProcessor.stop();
    });
  });

  describe('Resource Attributes Validation', () => {
    it('should ensure all required OTEL resource attributes are present', () => {
      const legacyEvent: TelemetryEvent = {
        timestamp: 1632847200000,
        service: 'validation-service',
        eventType: 'test.event',
        traceId: 'trace-validation-123',
        data: {}
      };

      const convertMethod = (processor as any).convertEventToSpan.bind(processor);
      const span: OtelSpan = convertMethod(legacyEvent);

      // Verify all required OTEL resource attributes
      expect(span.resource['service.name']).toBeDefined();
      expect(span.resource['service.version']).toBeDefined();
      expect(span.resource['service.instance.id']).toBeDefined();
      expect(span.resource['deployment.environment']).toBeDefined();

      // Verify proper values
      expect(span.resource['service.name']).toBe('validation-service');
      expect(typeof span.resource['service.version']).toBe('string');
      expect(typeof span.resource['service.instance.id']).toBe('string');
      expect(typeof span.resource['deployment.environment']).toBe('string');
    });
  });
});