import { describe, it, expect, beforeEach } from 'vitest';
import { Dash0Forwarder, type Dash0Config } from '../dash0-forwarder';
import { WorkflowSpan } from '@emp/core';

/**
 * WorkflowSpan Format Validation Tests
 *
 * These tests ensure our WorkflowSpan format is correctly converted to OTLP
 * and includes all necessary fields for proper service maps and trace hierarchies.
 */

describe('WorkflowSpan to OTLP Conversion', () => {
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

  describe('WorkflowSpan Format Validation', () => {
    it('should convert WorkflowSpan with complete ID hierarchy', () => {
      const workflowSpan: WorkflowSpan = {
        traceId: 'abc123def456789012345678901234',
        spanId: '1234567890abcdef',
        parentSpanId: 'fedcba0987654321',
        operationName: 'job.validation',
        startTime: Date.now(),
        endTime: Date.now() + 100,
        status: {
          code: 1, // OK
          message: 'Validation successful'
        },
        attributes: {
          'service.name': 'emp-api',
          'emp.workflow.id': 'workflow-123',
          'emp.job.id': 'job-456',
          'emp.claim.id': 'claim-789',
          'emp.generation.id': 'gen-abc',
          'emp.collection.id': 'collection-xyz',
          'emp.user.id': 'user-123',
          'validation.schema_version': '1.2',
          'validation.rules_applied': 12
        },
        events: [
          {
            timestamp: Date.now() + 50,
            name: 'validation.completed',
            attributes: {
              'validation.duration_ms': 50,
              'validation.result': 'passed'
            }
          }
        ]
      };

      const otlpSpan = (forwarder as any).convertWorkflowSpanToOtlp(workflowSpan);

      // Verify span structure
      expect(otlpSpan.traceId).toMatch(/^[0-9a-f]{32}$/);
      expect(otlpSpan.spanId).toMatch(/^[0-9a-f]{16}$/);
      expect(otlpSpan.parentSpanId).toBe('fedcba0987654321');
      expect(otlpSpan.name).toBe('job.validation');
      expect(otlpSpan.kind).toBe(1); // INTERNAL
      expect(otlpSpan.status.code).toBe(1);
      expect(otlpSpan.status.message).toBe('Validation successful');

      // Verify timestamps are in nanoseconds
      expect(otlpSpan.startTimeUnixNano).toMatch(/^\d{19}$/);
      expect(otlpSpan.endTimeUnixNano).toMatch(/^\d{19}$/);
      expect(BigInt(otlpSpan.endTimeUnixNano)).toBeGreaterThan(BigInt(otlpSpan.startTimeUnixNano));

      // Verify attributes include all correlation IDs
      const attrMap = new Map(otlpSpan.attributes.map(a => [a.key, a.value]));
      expect(attrMap.get('service.name')).toEqual({ stringValue: 'emp-api' });
      expect(attrMap.get('emp.workflow.id')).toEqual({ stringValue: 'workflow-123' });
      expect(attrMap.get('emp.job.id')).toEqual({ stringValue: 'job-456' });
      expect(attrMap.get('emp.claim.id')).toEqual({ stringValue: 'claim-789' });
      expect(attrMap.get('emp.generation.id')).toEqual({ stringValue: 'gen-abc' });
      expect(attrMap.get('emp.collection.id')).toEqual({ stringValue: 'collection-xyz' });
      expect(attrMap.get('emp.user.id')).toEqual({ stringValue: 'user-123' });

      // Verify events are converted
      expect(otlpSpan.events).toHaveLength(1);
      expect(otlpSpan.events[0].name).toBe('validation.completed');
      expect(otlpSpan.events[0].timeUnixNano).toMatch(/^\d{19}$/);
    });

    it('should maintain parent-child relationships for service maps', () => {
      // Root span (API service)
      const apiSpan: WorkflowSpan = {
        traceId: 'trace123',
        spanId: 'abc0000000000001',
        operationName: 'api.request',
        startTime: Date.now(),
        endTime: Date.now() + 200,
        status: { code: 1, message: '' },
        attributes: {
          'service.name': 'emp-api',
          'http.method': 'POST',
          'http.route': '/api/jobs/submit'
        },
        events: []
      };

      // Child span (Redis operation)
      const redisSpan: WorkflowSpan = {
        traceId: 'trace123', // Same trace
        spanId: 'abc0000000000002',
        parentSpanId: 'abc0000000000001', // Points to API span
        operationName: 'redis.operation',
        startTime: Date.now() + 10,
        endTime: Date.now() + 50,
        status: { code: 1, message: '' },
        attributes: {
          'service.name': 'redis',
          'redis.operation': 'HMSET',
          'redis.key': 'job:123'
        },
        events: []
      };

      const apiOtlp = (forwarder as any).convertWorkflowSpanToOtlp(apiSpan);
      const redisOtlp = (forwarder as any).convertWorkflowSpanToOtlp(redisSpan);

      // Verify trace connectivity
      expect(apiOtlp.traceId).toBe(redisOtlp.traceId);
      expect(redisOtlp.parentSpanId).toBe('abc0000000000001'); // Exact match

      // Verify service differentiation for maps
      const apiAttrs = new Map(apiOtlp.attributes.map(a => [a.key, a.value]));
      const redisAttrs = new Map(redisOtlp.attributes.map(a => [a.key, a.value]));

      expect(apiAttrs.get('service.name')).toEqual({ stringValue: 'emp-api' });
      expect(redisAttrs.get('service.name')).toEqual({ stringValue: 'redis' });
    });

    it('should handle error spans with rich debugging context', () => {
      const errorSpan: WorkflowSpan = {
        traceId: 'error-trace',
        spanId: 'error-span',
        operationName: 'model.download',
        startTime: Date.now(),
        endTime: Date.now() + 5000,
        status: {
          code: 2, // ERROR
          message: 'Download failed: Connection timeout'
        },
        attributes: {
          'service.name': 'emp-worker',
          'error.name': 'NetworkError',
          'error.message': 'Connection timeout after 5000ms',
          'error.stack': 'NetworkError: Connection timeout...',
          'error.fingerprint': 'net-timeout-model',
          'model.name': 'stable-diffusion-v1-5',
          'model.size_gb': 4.2,
          'download.retry_count': 3,
          'network.provider': 'salad-network',
          'storage.available_mb': 800,
          'worker.id': 'worker-gpu-01'
        },
        events: [
          {
            timestamp: Date.now() + 1000,
            name: 'download.retry',
            attributes: { 'retry.attempt': 1 }
          },
          {
            timestamp: Date.now() + 2500,
            name: 'download.retry',
            attributes: { 'retry.attempt': 2 }
          },
          {
            timestamp: Date.now() + 4000,
            name: 'download.retry',
            attributes: { 'retry.attempt': 3 }
          },
          {
            timestamp: Date.now() + 5000,
            name: 'exception',
            attributes: {
              'exception.type': 'NetworkError',
              'exception.message': 'Connection timeout after 5000ms'
            }
          }
        ]
      };

      const otlpSpan = (forwarder as any).convertWorkflowSpanToOtlp(errorSpan);

      // Verify error status
      expect(otlpSpan.status.code).toBe(2);
      expect(otlpSpan.status.message).toBe('Download failed: Connection timeout');

      // Verify error attributes for debugging
      const attrMap = new Map(otlpSpan.attributes.map(a => [a.key, a.value]));
      expect(attrMap.get('error.name')).toEqual({ stringValue: 'NetworkError' });
      expect(attrMap.get('error.fingerprint')).toEqual({ stringValue: 'net-timeout-model' });
      expect(attrMap.get('download.retry_count')).toEqual({ intValue: '3' });
      expect(attrMap.get('storage.available_mb')).toEqual({ intValue: '800' });

      // Verify events are preserved for timeline
      expect(otlpSpan.events).toHaveLength(4);
      expect(otlpSpan.events[3].name).toBe('exception');
    });

    it('should create service-specific spans for proper service maps', () => {
      const services = ['emp-api', 'redis', 'emp-worker', 'emp-telemetry'];
      const spans: WorkflowSpan[] = services.map((service, i) => ({
        traceId: 'service-test-trace',
        spanId: `abc000000000000${i}`,
        parentSpanId: i > 0 ? `abc000000000000${i - 1}` : undefined,
        operationName: `${service}.operation`,
        startTime: Date.now() + (i * 100),
        endTime: Date.now() + (i * 100) + 50,
        status: { code: 1, message: '' },
        attributes: {
          'service.name': service,
          'operation.type': 'test'
        },
        events: []
      }));

      const otlpSpans = spans.map(span =>
        (forwarder as any).convertWorkflowSpanToOtlp(span)
      );

      // Verify each span has distinct service name
      const serviceNames = otlpSpans.map(span => {
        const attrs = new Map(span.attributes.map(a => [a.key, a.value]));
        return (attrs.get('service.name') as any)?.stringValue;
      });

      expect(serviceNames).toEqual(['emp-api', 'redis', 'emp-worker', 'emp-telemetry']);

      // Verify parent-child chain
      expect(otlpSpans[0].parentSpanId).toBe('');
      expect(otlpSpans[1].parentSpanId).toBe('abc0000000000000');
      expect(otlpSpans[2].parentSpanId).toBe('abc0000000000001');
      expect(otlpSpans[3].parentSpanId).toBe('abc0000000000002');
    });
  });

  describe('Integration Test', () => {
    it('should verify complete workflow trace hierarchy', () => {
      // Simulate a complete workflow from API → Redis → Worker
      const workflowContext = {
        traceId: 'complete-workflow-trace',
        workflowId: 'wf-123',
        generationId: 'gen-456',
        jobId: 'job-789',
        userId: 'user-abc',
        collectionId: 'coll-xyz'
      };

      // 1. API receives request
      const apiReceiveSpan: WorkflowSpan = {
        traceId: workflowContext.traceId,
        spanId: 'api-receive',
        operationName: 'api.request',
        startTime: 1000,
        endTime: 1200,
        status: { code: 1, message: '' },
        attributes: {
          'service.name': 'emp-api',
          'emp.workflow.id': workflowContext.workflowId,
          'emp.generation.id': workflowContext.generationId,
          'emp.user.id': workflowContext.userId,
          'http.method': 'POST',
          'http.route': '/api/jobs/submit'
        },
        events: []
      };

      // 2. API validates job
      const validationSpan: WorkflowSpan = {
        traceId: workflowContext.traceId,
        spanId: 'api-validate',
        parentSpanId: 'api-receive',
        operationName: 'job.validation',
        startTime: 1050,
        endTime: 1100,
        status: { code: 1, message: '' },
        attributes: {
          'service.name': 'emp-api',
          'emp.workflow.id': workflowContext.workflowId,
          'emp.job.id': workflowContext.jobId,
          'validation.passed': true
        },
        events: []
      };

      // 3. API writes to Redis
      const redisWriteSpan: WorkflowSpan = {
        traceId: workflowContext.traceId,
        spanId: 'redis-write',
        parentSpanId: 'api-receive',
        operationName: 'redis.operation',
        startTime: 1110,
        endTime: 1130,
        status: { code: 1, message: '' },
        attributes: {
          'service.name': 'redis',
          'emp.workflow.id': workflowContext.workflowId,
          'emp.job.id': workflowContext.jobId,
          'redis.operation': 'HMSET'
        },
        events: []
      };

      // 4. Worker claims job
      const workerClaimSpan: WorkflowSpan = {
        traceId: workflowContext.traceId,
        spanId: 'worker-claim',
        parentSpanId: 'redis-write',
        operationName: 'worker.claim',
        startTime: 2000,
        endTime: 2050,
        status: { code: 1, message: '' },
        attributes: {
          'service.name': 'emp-worker',
          'emp.workflow.id': workflowContext.workflowId,
          'emp.job.id': workflowContext.jobId,
          'emp.claim.id': 'claim-123',
          'worker.id': 'worker-gpu-01'
        },
        events: []
      };

      const spans = [apiReceiveSpan, validationSpan, redisWriteSpan, workerClaimSpan];
      const otlpSpans = spans.map(span =>
        (forwarder as any).convertWorkflowSpanToOtlp(span)
      );

      // Verify all spans share the same trace
      const traceIds = [...new Set(otlpSpans.map(s => s.traceId))];
      expect(traceIds).toHaveLength(1);

      // Verify workflow ID is present in all spans
      otlpSpans.forEach(span => {
        const attrs = new Map(span.attributes.map(a => [a.key, a.value]));
        expect(attrs.get('emp.workflow.id')).toEqual({ stringValue: 'wf-123' });
      });

      // Verify service diversity for proper map
      const services = otlpSpans.map(span => {
        const attrs = new Map(span.attributes.map(a => [a.key, a.value]));
        return (attrs.get('service.name') as any)?.stringValue;
      });
      expect([...new Set(services)]).toEqual(['emp-api', 'redis', 'emp-worker']);
    });
  });
});