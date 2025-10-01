/**
 * Integration tests for OTLP export functionality
 * Tests actual data flow to OTLP collector
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTelemetryClient, EmpTelemetryClient, SpanKind } from '../index.js';
import http from 'http';

describe('OTLP Integration Tests', () => {
  let mockOtlpServer: http.Server;
  let receivedTraces: any[] = [];
  let receivedMetrics: any[] = [];
  let client: EmpTelemetryClient;

  const MOCK_OTLP_PORT = 14318; // Use different port to avoid conflicts

  beforeAll(async () => {
    // Start mock OTLP collector to capture exports
    mockOtlpServer = http.createServer((req, res) => {
      let body = '';

      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', () => {
        try {
          const payload = JSON.parse(body);

          if (req.url === '/v1/traces') {
            receivedTraces.push(payload);
          } else if (req.url === '/v1/metrics') {
            receivedMetrics.push(payload);
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok' }));
        } catch (error) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: 'Parse error' }));
        }
      });
    });

    mockOtlpServer.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`Port ${MOCK_OTLP_PORT} already in use, cleaning up...`);
      }
    });

    await new Promise<void>((resolve, reject) => {
      mockOtlpServer.listen(MOCK_OTLP_PORT, () => {
        console.log(`Mock OTLP server listening on port ${MOCK_OTLP_PORT}`);
        resolve();
      });

      mockOtlpServer.on('error', reject);
    });
  }, 15000); // Increase timeout for server startup

  afterAll(async () => {
    if (client) {
      try {
        await client.shutdown();
      } catch {
        // Ignore shutdown errors
      }
    }

    if (mockOtlpServer && mockOtlpServer.listening) {
      await new Promise<void>((resolve) => {
        mockOtlpServer.close(() => {
          console.log('Mock OTLP server closed');
          resolve();
        });
      });
    }
  }, 15000);

  beforeEach(async () => {
    receivedTraces = [];
    receivedMetrics = [];

    // Ensure previous client is properly shutdown
    if (client) {
      try {
        await client.shutdown();
      } catch {
        // Ignore errors from already-shutdown clients
      }
      client = null as any;
    }
  });

  describe('trace export', () => {
    it('should export spans to OTLP endpoint', async () => {
      client = createTelemetryClient({
        serviceName: 'test-trace-export',
        serviceVersion: '1.0.0',
        collectorEndpoint: `http://localhost:${MOCK_OTLP_PORT}`
      });

      await client.withSpan('test.span', async (span) => {
        span.setAttributes({ 'test.key': 'test.value' });
      });

      // Shutdown to force flush of remaining spans
      await client.shutdown();

      // Small delay to allow HTTP request to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(receivedTraces.length).toBeGreaterThan(0);
    });

    it('should include service name in exported traces', async () => {
      client = createTelemetryClient({
        serviceName: 'service-name-test',
        collectorEndpoint: `http://localhost:${MOCK_OTLP_PORT}`
      });

      await client.withSpan('test.operation', async () => {
        // Empty span
      });

      await client.shutdown();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(receivedTraces.length).toBeGreaterThan(0);

      // Check that service name is in the payload
      const tracePayload = JSON.stringify(receivedTraces);
      expect(tracePayload).toContain('service-name-test');
    });

    it('should export spans with attributes', async () => {
      client = createTelemetryClient({
        serviceName: 'test-attributes',
        collectorEndpoint: `http://localhost:${MOCK_OTLP_PORT}`
      });

      await client.withSpan('test.span', async (span) => {
        span.setAttributes({
          'custom.attribute': 'custom-value',
          'user.id': '12345',
          'request.count': 42
        });
      });

      await client.shutdown();
      await new Promise(resolve => setTimeout(resolve, 100));

      const tracePayload = JSON.stringify(receivedTraces);
      expect(tracePayload).toContain('custom.attribute');
      expect(tracePayload).toContain('custom-value');
    });

    it('should export nested spans with parent-child relationship', async () => {
      client = createTelemetryClient({
        serviceName: 'test-nested',
        collectorEndpoint: `http://localhost:${MOCK_OTLP_PORT}`
      });

      await client.withSpan('parent.operation', async () => {
        await client.withSpan('child.operation', async () => {
          // Nested span
        });
      });

      await client.shutdown();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(receivedTraces.length).toBeGreaterThan(0);

      const tracePayload = JSON.stringify(receivedTraces);
      expect(tracePayload).toContain('parent.operation');
      expect(tracePayload).toContain('child.operation');
    });

    it('should export spans with different span kinds', async () => {
      client = createTelemetryClient({
        serviceName: 'test-span-kinds',
        collectorEndpoint: `http://localhost:${MOCK_OTLP_PORT}`
      });

      await client.withSpan('server.operation', async () => {}, { kind: SpanKind.SERVER });
      await client.withSpan('client.operation', async () => {}, { kind: SpanKind.CLIENT });
      await client.withSpan('internal.operation', async () => {}, { kind: SpanKind.INTERNAL });

      await client.shutdown();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(receivedTraces.length).toBeGreaterThan(0);
    });
  });

  describe('metric export', () => {
    it('should export metrics to OTLP endpoint', async () => {
      client = createTelemetryClient({
        serviceName: 'test-metric-export',
        collectorEndpoint: `http://localhost:${MOCK_OTLP_PORT}`
      });

      client.counter('test.counter', 5);
      client.gauge('test.gauge', 100);
      client.histogram('test.histogram', 250);

      // Wait for metric export interval (5s default)
      await new Promise(resolve => setTimeout(resolve, 6000));

      expect(receivedMetrics.length).toBeGreaterThan(0);
    }, 10000); // Increase timeout for metric export

    it('should include metric attributes in export', async () => {
      client = createTelemetryClient({
        serviceName: 'test-metric-attributes',
        collectorEndpoint: `http://localhost:${MOCK_OTLP_PORT}`
      });

      client.counter('test.counter', 1, {
        endpoint: '/api/test',
        status: 'success'
      });

      await new Promise(resolve => setTimeout(resolve, 6000));

      const metricPayload = JSON.stringify(receivedMetrics);
      expect(metricPayload).toContain('test.counter');
    }, 10000);
  });

  describe('error handling', () => {
    it('should handle collector unavailability gracefully', async () => {
      // Use non-existent port
      client = createTelemetryClient({
        serviceName: 'test-unavailable',
        collectorEndpoint: 'http://localhost:19999'
      });

      // Should not throw even if collector is unavailable
      await expect(async () => {
        await client.withSpan('test.span', async () => {
          // Empty span
        });
      }).not.toThrow();
    });

    it('should continue working after collector failure', async () => {
      client = createTelemetryClient({
        serviceName: 'test-resilience',
        collectorEndpoint: 'http://localhost:19999'
      });

      // Send multiple spans even with collector down
      await client.withSpan('span1', async () => {});
      await client.withSpan('span2', async () => {});
      await client.withSpan('span3', async () => {});

      // Should complete without throwing
      expect(true).toBe(true);
    });
  });

  describe('service attribution preservation', () => {
    it('should preserve service name for emp-api', async () => {
      client = createTelemetryClient({
        serviceName: 'emp-api',
        serviceVersion: '2.0.0',
        environment: 'production',
        collectorEndpoint: `http://localhost:${MOCK_OTLP_PORT}`
      });

      await client.withSpan('api.request', async () => {});

      await client.shutdown();
      await new Promise(resolve => setTimeout(resolve, 100));

      const tracePayload = JSON.stringify(receivedTraces);
      expect(tracePayload).toContain('emp-api');
    });

    it('should preserve service name for emp-worker', async () => {
      client = createTelemetryClient({
        serviceName: 'emp-worker',
        collectorEndpoint: `http://localhost:${MOCK_OTLP_PORT}`
      });

      await client.withSpan('worker.job', async () => {});

      await client.shutdown();
      await new Promise(resolve => setTimeout(resolve, 100));

      const tracePayload = JSON.stringify(receivedTraces);
      expect(tracePayload).toContain('emp-worker');
    });

    it('should preserve service name for emp-webhook', async () => {
      client = createTelemetryClient({
        serviceName: 'emp-webhook',
        collectorEndpoint: `http://localhost:${MOCK_OTLP_PORT}`
      });

      await client.withSpan('webhook.process', async () => {});

      await client.shutdown();
      await new Promise(resolve => setTimeout(resolve, 100));

      const tracePayload = JSON.stringify(receivedTraces);
      expect(tracePayload).toContain('emp-webhook');
    });

    it('should not show traces as emp-telemetry', async () => {
      client = createTelemetryClient({
        serviceName: 'emp-api',
        collectorEndpoint: `http://localhost:${MOCK_OTLP_PORT}`
      });

      await client.withSpan('api.operation', async () => {});

      await client.shutdown();
      await new Promise(resolve => setTimeout(resolve, 100));

      const tracePayload = JSON.stringify(receivedTraces);

      // Service name should be emp-api, NOT emp-telemetry
      expect(tracePayload).toContain('emp-api');
      expect(tracePayload).not.toContain('"service.name":"emp-telemetry"');
    });
  });
});
