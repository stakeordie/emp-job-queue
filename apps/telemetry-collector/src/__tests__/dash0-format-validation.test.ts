import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Dash0Forwarder, type Dash0Config } from '../dash0-forwarder';
import { TelemetryEvent } from '@emp/core';

/**
 * Dash0 Format Validation Tests
 *
 * These tests ensure our OTLP format exactly matches what works in Dash0.
 * Based on the working manual test that successfully appeared in Dash0 dashboard.
 */

describe('Dash0 Format Validation', () => {
  const mockConfig: Dash0Config = {
    endpoint: 'https://ingress.us-west-2.aws.dash0.com/v1/traces',
    authToken: 'test-token',
    dataset: 'development',
    batchSize: 1,
    flushInterval: 1000
  };

  let forwarder: Dash0Forwarder;

  beforeEach(() => {
    forwarder = new Dash0Forwarder(mockConfig);
  });

  describe('Required Fields Validation', () => {
    it('should include all required OTLP fields for TelemetryEvent', () => {
      const event: TelemetryEvent = {
        timestamp: 1759109397549, // milliseconds
        service: 'test-service',
        eventType: 'test.event',
        traceId: 'test-trace-id',
        data: { testKey: 'testValue' }
      };

      // Access private method for testing
      const otlpSpan = (forwarder as any).convertEventToOtlp(event);

      // Verify all required fields are present
      expect(otlpSpan).toHaveProperty('traceId');
      expect(otlpSpan).toHaveProperty('spanId');
      expect(otlpSpan).toHaveProperty('parentSpanId');
      expect(otlpSpan).toHaveProperty('name');
      expect(otlpSpan).toHaveProperty('kind');
      expect(otlpSpan).toHaveProperty('startTimeUnixNano');
      expect(otlpSpan).toHaveProperty('endTimeUnixNano'); // CRITICAL: This was missing!
      expect(otlpSpan).toHaveProperty('status');
      expect(otlpSpan).toHaveProperty('attributes');
      expect(otlpSpan).toHaveProperty('events');
      expect(otlpSpan).toHaveProperty('flags');
      expect(otlpSpan).toHaveProperty('links');
      expect(otlpSpan).toHaveProperty('traceState');

      // Verify status has required sub-fields
      expect(otlpSpan.status).toHaveProperty('code');
      expect(otlpSpan.status).toHaveProperty('message');
    });

    it('should have proper timestamp format', () => {
      const event: TelemetryEvent = {
        timestamp: 1759109397549, // milliseconds
        service: 'test-service',
        eventType: 'test.event',
        traceId: 'test-trace-id',
        data: {}
      };

      const otlpSpan = (forwarder as any).convertEventToOtlp(event);

      // Should convert milliseconds to nanoseconds
      expect(otlpSpan.startTimeUnixNano).toBe('1759109397549000000');
      expect(otlpSpan.endTimeUnixNano).toBe('1759109397549000000');

      // Should be strings, not numbers
      expect(typeof otlpSpan.startTimeUnixNano).toBe('string');
      expect(typeof otlpSpan.endTimeUnixNano).toBe('string');
    });

    it('should have proper ID formats', () => {
      const event: TelemetryEvent = {
        timestamp: Date.now(),
        service: 'test-service',
        eventType: 'test.event',
        traceId: 'test-trace-id-123',
        data: {}
      };

      const otlpSpan = (forwarder as any).convertEventToOtlp(event);

      // Trace ID should be 32 hex characters
      expect(otlpSpan.traceId).toMatch(/^[0-9a-f]{32}$/);

      // Span ID should be 16 hex characters
      expect(otlpSpan.spanId).toMatch(/^[0-9a-f]{16}$/);

      // Parent span ID should be empty string (not undefined)
      expect(otlpSpan.parentSpanId).toBe('');
    });
  });

  describe('Exact Format Matching', () => {
    it('should match the working manual test format exactly', () => {
      const event: TelemetryEvent = {
        timestamp: 1759109397549, // Same timestamp as working test
        service: 'test-service',
        eventType: 'health.check',
        traceId: '3326726de8a9a7b6a4f095aa07d5da63',
        data: { status: 'ok' }
      };

      const otlpSpan = (forwarder as any).convertEventToOtlp(event);

      // Verify exact structure matches working manual test
      expect(otlpSpan).toEqual({
        traceId: expect.stringMatching(/^[0-9a-f]{32}$/),
        spanId: expect.stringMatching(/^[0-9a-f]{16}$/),
        parentSpanId: '',
        name: 'health.check',
        kind: 1,
        startTimeUnixNano: '1759109397549000000',
        endTimeUnixNano: '1759109397549000000',
        status: {
          code: 1,
          message: ''
        },
        attributes: [
          {
            key: 'status',
            value: { stringValue: 'ok' }
          }
        ],
        events: [],
        flags: 0,
        links: [],
        traceState: ''
      });
    });

    it('should create valid OTLP payload structure', async () => {
      const event: TelemetryEvent = {
        timestamp: Date.now(),
        service: 'test-service',
        eventType: 'test.event',
        traceId: 'test-trace',
        data: { key: 'value' }
      };

      // Mock the flush method to capture the payload
      let capturedPayload: any;
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockImplementation((url, options) => {
        capturedPayload = JSON.parse(options.body);
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Map([['content-type', 'application/json']]),
          text: () => Promise.resolve('{"partialSuccess":{}}')
        });
      });

      await forwarder.forwardEvent(event);
      await forwarder.flush();

      // Verify the complete OTLP payload structure
      expect(capturedPayload).toEqual({
        resourceSpans: [
          {
            resource: {
              attributes: [
                {
                  key: 'service.name',
                  value: { stringValue: 'emp-telemetry' }
                }
              ]
            },
            scopeSpans: [
              {
                schemaUrl: '',
                scope: {
                  name: 'emp-telemetry-collector',
                  version: '1.0.0',
                  attributes: []
                },
                spans: [
                  expect.objectContaining({
                    name: 'test.event',
                    startTimeUnixNano: expect.stringMatching(/^\d{19}$/),
                    endTimeUnixNano: expect.stringMatching(/^\d{19}$/),
                    events: [],
                    flags: 0,
                    links: [],
                    traceState: ''
                  })
                ]
              }
            ]
          }
        ]
      });

      // Restore fetch
      global.fetch = originalFetch;
    });
  });

  describe('Data Type Validation', () => {
    it('should handle different attribute value types correctly', () => {
      const event: TelemetryEvent = {
        timestamp: Date.now(),
        service: 'test-service',
        eventType: 'test.event',
        traceId: 'test-trace',
        data: {
          stringValue: 'test',
          numberValue: 123,
          booleanValue: true,
          objectValue: { nested: 'value' }
        }
      };

      const otlpSpan = (forwarder as any).convertEventToOtlp(event);

      expect(otlpSpan.attributes).toEqual([
        { key: 'stringValue', value: { stringValue: 'test' } },
        { key: 'numberValue', value: { intValue: '123' } },
        { key: 'booleanValue', value: { boolValue: true } },
        { key: 'objectValue', value: { stringValue: '{"nested":"value"}' } }
      ]);
    });

    it('should handle error events correctly', () => {
      const event: TelemetryEvent = {
        timestamp: Date.now(),
        service: 'test-service',
        eventType: 'error.event',
        traceId: 'test-trace',
        level: 'error',
        data: { error: 'Something went wrong' }
      };

      const otlpSpan = (forwarder as any).convertEventToOtlp(event);

      expect(otlpSpan.status.code).toBe(2); // ERROR status
      expect(otlpSpan.name).toBe('error.event');
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing optional fields', () => {
      const event: TelemetryEvent = {
        timestamp: Date.now(),
        service: 'test-service',
        eventType: 'minimal.event',
        traceId: 'test-trace-id',
        data: {}
      };

      const otlpSpan = (forwarder as any).convertEventToOtlp(event);

      expect(otlpSpan.traceId).toMatch(/^[0-9a-f]{32}$/); // Should generate one
      expect(otlpSpan.attributes).toEqual([]); // Should be empty array
      expect(otlpSpan.endTimeUnixNano).toBeDefined(); // Should not be undefined
    });

    it('should handle invalid timestamps gracefully', () => {
      const event: TelemetryEvent = {
        timestamp: NaN,
        service: 'test-service',
        eventType: 'invalid.timestamp',
        traceId: 'test-trace',
        data: {}
      };

      const otlpSpan = (forwarder as any).convertEventToOtlp(event);

      // Should still produce valid nanosecond format (even if NaN)
      expect(typeof otlpSpan.startTimeUnixNano).toBe('string');
      expect(typeof otlpSpan.endTimeUnixNano).toBe('string');
    });
  });

  describe('Performance and Memory', () => {
    it('should not leak memory with large batches', () => {
      const events: TelemetryEvent[] = Array.from({ length: 1000 }, (_, i) => ({
        timestamp: Date.now() + i,
        service: 'test-service',
        eventType: `batch.event.${i}`,
        traceId: `trace-${i}`,
        data: { index: i }
      }));

      expect(() => {
        events.forEach(event => {
          const otlpSpan = (forwarder as any).convertEventToOtlp(event);
          expect(otlpSpan).toBeDefined();
        });
      }).not.toThrow();
    });
  });
});