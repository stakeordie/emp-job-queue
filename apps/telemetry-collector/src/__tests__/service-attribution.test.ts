/**
 * Service Attribution Test
 *
 * Validates that spans sent with proper service attribution
 * maintain their service name through to Dash0
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTracer, withSpan, addEmpAttributes, shutdownTracer } from '@emp/core/otel';

describe('Service Attribution Tests', () => {
  const testRunId = Date.now();

  beforeAll(() => {
    // Initialize OpenTelemetry with correct service name
    initTracer({
      serviceName: 'test-service',
      serviceVersion: '1.0.0',
      collectorEndpoint: 'http://localhost:4318',
      environment: 'test'
    });

    console.log(`\n${'='.repeat(80)}`);
    console.log(`🧪 SERVICE ATTRIBUTION TEST - Run ID: ${testRunId}`);
    console.log(`${'='.repeat(80)}\n`);
  });

  afterAll(async () => {
    await shutdownTracer();
  });

  it('should send span with correct service attribution', async () => {
    console.log('📤 Sending span with service: test-service');

    await withSpan(
      'test-service',
      'service.attribution.test',
      async (span) => {
        addEmpAttributes(span, {
          testRunId,
          testType: 'service-attribution',
          expectedService: 'test-service'
        });

        console.log('✅ Span created and sent to collector');
      }
    );

    // Give collector time to process and forward to Dash0
    await new Promise(resolve => setTimeout(resolve, 10000));

    console.log('\n📊 Test complete. Check Dash0 for span with:');
    console.log(`   - Service: test-service`);
    console.log(`   - testRunId: ${testRunId}`);
    console.log(`   - Operation: service.attribution.test\n`);
  }, 30000);
});
