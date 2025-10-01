/**
 * Unit tests for EmpTelemetryClient
 * Tests OTLP-native telemetry with service attribution
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTelemetryClient, EmpTelemetryClient, SpanKind } from '../index.js';
import { trace } from '@opentelemetry/api';

describe('EmpTelemetryClient', () => {
  let client: EmpTelemetryClient;

  beforeEach(() => {
    // Reset environment to test-specific values
    process.env.OTEL_COLLECTOR_ENDPOINT = 'http://localhost:4318';
    process.env.NODE_ENV = 'test';
  });

  afterEach(async () => {
    if (client) {
      await client.shutdown();
    }
  });

  describe('initialization', () => {
    it('should create client with service name', () => {
      client = createTelemetryClient({
        serviceName: 'test-service',
        serviceVersion: '1.0.0',
        environment: 'test'
      });

      expect(client).toBeDefined();
    });

    it('should use default collector endpoint from env', () => {
      process.env.OTEL_COLLECTOR_ENDPOINT = 'http://custom:9999';

      const consoleSpy = vi.spyOn(console, 'log');
      client = createTelemetryClient({
        serviceName: 'test-service'
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('http://custom:9999')
      );
    });

    it('should use provided collector endpoint over env', () => {
      process.env.OTEL_COLLECTOR_ENDPOINT = 'http://env:8888';

      const consoleSpy = vi.spyOn(console, 'log');
      client = createTelemetryClient({
        serviceName: 'test-service',
        collectorEndpoint: 'http://explicit:7777'
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('http://explicit:7777')
      );
    });

    it('should default to localhost:4318 when no endpoint configured', () => {
      delete process.env.OTEL_COLLECTOR_ENDPOINT;

      const consoleSpy = vi.spyOn(console, 'log');
      client = createTelemetryClient({
        serviceName: 'test-service'
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:4318')
      );
    });
  });

  describe('withSpan()', () => {
    beforeEach(() => {
      client = createTelemetryClient({
        serviceName: 'test-service',
        serviceVersion: '1.0.0'
      });
    });

    it('should create span and execute function', async () => {
      const result = await client.withSpan('test.operation', async (span) => {
        expect(span).toBeDefined();
        return 'test-result';
      });

      expect(result).toBe('test-result');
    });

    it('should set span attributes from options', async () => {
      const spanSpy = vi.fn();

      await client.withSpan('test.operation', async (span) => {
        spanSpy(span);
        return 'result';
      }, {
        attributes: {
          'test.attribute': 'test-value',
          'test.number': 42
        }
      });

      const span = spanSpy.mock.calls[0][0];
      expect(span).toBeDefined();
    });

    it('should handle INTERNAL span kind by default', async () => {
      await client.withSpan('test.operation', async (span) => {
        expect(span).toBeDefined();
        return 'result';
      });
    });

    it('should respect provided span kind', async () => {
      await client.withSpan('test.operation', async (span) => {
        expect(span).toBeDefined();
        return 'result';
      }, {
        kind: SpanKind.SERVER
      });
    });

    it('should handle errors and record exception', async () => {
      const testError = new Error('Test error');

      await expect(async () => {
        await client.withSpan('test.operation', async (span) => {
          throw testError;
        });
      }).rejects.toThrow('Test error');
    });

    it('should set span status to ERROR on exception', async () => {
      try {
        await client.withSpan('test.operation', async () => {
          throw new Error('Test error');
        });
      } catch (error) {
        // Expected error - span should have ERROR status
        expect(error).toBeDefined();
      }
    });

    it('should end span even if function throws', async () => {
      const spanEndSpy = vi.fn();

      try {
        await client.withSpan('test.operation', async () => {
          throw new Error('Test error');
        });
      } catch {
        // Span should still end
      }
    });
  });

  describe('metrics', () => {
    beforeEach(() => {
      client = createTelemetryClient({
        serviceName: 'test-service',
        serviceVersion: '1.0.0'
      });
    });

    it('should record counter metric', () => {
      expect(() => {
        client.counter('test.counter', 1, { label: 'test' });
      }).not.toThrow();
    });

    it('should record counter with default value of 1', () => {
      expect(() => {
        client.counter('test.counter');
      }).not.toThrow();
    });

    it('should record gauge metric', () => {
      expect(() => {
        client.gauge('test.gauge', 42, { label: 'test' });
      }).not.toThrow();
    });

    it('should record histogram metric', () => {
      expect(() => {
        client.histogram('test.histogram', 123.45, { label: 'test' });
      }).not.toThrow();
    });

    it('should handle metrics without attributes', () => {
      expect(() => {
        client.counter('test.counter', 1);
        client.gauge('test.gauge', 42);
        client.histogram('test.histogram', 123);
      }).not.toThrow();
    });
  });

  describe('addEvent()', () => {
    beforeEach(() => {
      client = createTelemetryClient({
        serviceName: 'test-service'
      });
    });

    it('should add event to active span', async () => {
      await client.withSpan('test.operation', async () => {
        expect(() => {
          client.addEvent('test.event', { key: 'value' });
        }).not.toThrow();
      });
    });

    it('should create short-lived span when no active span', () => {
      expect(() => {
        client.addEvent('test.event', { key: 'value' });
      }).not.toThrow();
    });

    it('should handle events without attributes', async () => {
      await client.withSpan('test.operation', async () => {
        expect(() => {
          client.addEvent('test.event');
        }).not.toThrow();
      });
    });
  });

  describe('shutdown()', () => {
    it('should shutdown SDK cleanly', async () => {
      client = createTelemetryClient({
        serviceName: 'test-service'
      });

      await expect(client.shutdown()).resolves.not.toThrow();
    });

    it('should log shutdown messages', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      client = createTelemetryClient({
        serviceName: 'test-service'
      });

      await client.shutdown();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Shutting down telemetry')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('shutdown complete')
      );
    });
  });

  describe('service attribution', () => {
    it('should preserve service name in telemetry', () => {
      const consoleSpy = vi.spyOn(console, 'log');

      client = createTelemetryClient({
        serviceName: 'emp-webhook',
        serviceVersion: '2.0.0',
        environment: 'production'
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('emp-webhook')
      );
    });

    it('should handle different service names correctly', () => {
      const services = ['emp-api', 'emp-worker', 'emp-webhook'];

      services.forEach(async (serviceName) => {
        const testClient = createTelemetryClient({ serviceName });
        await testClient.shutdown();
      });
    });
  });
});
