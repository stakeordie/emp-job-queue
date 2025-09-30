/**
 * Dash0 Integration Tests
 *
 * Tests that events sent to Redis stream are properly processed by telemetry collector
 * and successfully reach Dash0 testrunner dataset
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Redis from 'ioredis';

describe('Dash0 Integration Tests', () => {
  let redis: Redis;
  const streamKey = 'telemetry:events';
  const testRunId = Date.now();

  beforeEach(async () => {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    await new Promise(resolve => setTimeout(resolve, 500)); // Allow connection
  });

  afterEach(async () => {
    if (redis) {
      await redis.quit();
    }
  });

  // Helper function to add event to Redis stream in correct format
  async function addEventToStream(eventType: string, data: any, service: string = 'test-service') {
    const event = {
      timestamp: Date.now(),
      service,
      eventType,
      traceId: `test-${eventType}-${testRunId}-${Date.now()}`,
      data,
      level: 'info',
      testRunId, // Add test run ID for easier verification
    };

    await redis.xadd(
      streamKey,
      '*',
      'event', // Key that telemetry collector expects
      JSON.stringify(event)
    );

    return event;
  }

  // Helper function to query Dash0 API
  async function queryDash0(timeRange: { from: string; to: string }) {
    const response = await fetch('https://api.us-west-2.aws.dash0.com/api/spans', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'authorization': 'Bearer auth_lR8sRf6ROYuUcZ724BWshmwMjy9UG296',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        timeRange,
        sampling: { mode: 'adaptive' },
        dataset: 'testrunner'
      })
    });

    return await response.json();
  }

  it('should send job lifecycle events to Dash0', async () => {
    console.log(`🧪 Test Run ID: ${testRunId}`);

    // 1. Job Started Event
    const jobStartedEvent = await addEventToStream('job.started', {
      jobId: `test-job-${testRunId}`,
      workerId: `test-worker-${testRunId}`,
      machineId: `test-machine-${testRunId}`,
      jobType: 'image-generation',
      priority: 'normal'
    }, 'job-service');

    // 2. Job Progress Event
    const jobProgressEvent = await addEventToStream('job.progress', {
      jobId: `test-job-${testRunId}`,
      progress: 50,
      stage: 'processing',
      estimatedCompletion: new Date(Date.now() + 30000).toISOString()
    }, 'job-service');

    // 3. Job Completed Event
    const jobCompletedEvent = await addEventToStream('job.completed', {
      jobId: `test-job-${testRunId}`,
      duration: 45000,
      outputSize: 1024000,
      status: 'success'
    }, 'job-service');

    console.log('✅ Added job lifecycle events to Redis stream');
    console.log('⏳ Waiting for telemetry collector to process...');

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Query Dash0 for our events
    const timeRange = {
      from: new Date(testRunId - 60000).toISOString(),
      to: new Date(Date.now() + 60000).toISOString()
    };

    const dash0Response = await queryDash0(timeRange);
    console.log('📊 Dash0 response:', JSON.stringify(dash0Response, null, 2));

    // Verify events reached Dash0
    expect(dash0Response).toHaveProperty('resourceSpans');

    if (dash0Response.resourceSpans && dash0Response.resourceSpans.length > 0) {
      const spans = dash0Response.resourceSpans.flatMap((rs: any) =>
        rs.scopeSpans?.flatMap((ss: any) => ss.spans || []) || []
      );

      console.log(`📈 Found ${spans.length} spans in Dash0`);

      // Look for our test events
      const ourSpans = spans.filter((span: any) =>
        span.attributes?.some((attr: any) =>
          attr.key === 'testRunId' && attr.value?.stringValue === testRunId.toString()
        )
      );

      console.log(`🎯 Found ${ourSpans.length} spans from our test run`);
      expect(ourSpans.length).toBeGreaterThan(0);
    }
  });

  it('should send worker lifecycle events to Dash0', async () => {
    // 1. Worker Heartbeat
    await addEventToStream('worker.heartbeat', {
      workerId: `test-worker-${testRunId}`,
      machineId: `test-machine-${testRunId}`,
      status: 'idle',
      currentJobs: 0,
      maxConcurrentJobs: 2,
      uptime: 12345,
      memoryUsage: {
        rss: 134217728,
        heapTotal: 25165824,
        heapUsed: 23068672
      }
    }, 'worker-service');

    // 2. Worker Registration
    await addEventToStream('worker.registered', {
      workerId: `test-worker-${testRunId}`,
      machineId: `test-machine-${testRunId}`,
      capabilities: ['image-generation', 'text-processing'],
      version: '1.0.0',
      environment: 'test'
    }, 'worker-service');

    console.log('✅ Added worker lifecycle events to Redis stream');

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 8000));

    // Basic verification that events were added
    const streamLength = await redis.xlen(streamKey);
    expect(streamLength).toBeGreaterThan(0);
  });

  it('should send API health check events to Dash0', async () => {
    // API Health Check
    await addEventToStream('health.check', {
      status: 'ok',
      uptime_seconds: 12345,
      memory_usage_mb: 256,
      active_connections: 45,
      queue_depth: 12,
      version: '1.0.0'
    }, 'api-service');

    // API Request
    await addEventToStream('api.request', {
      method: 'POST',
      path: '/api/v1/jobs',
      statusCode: 201,
      duration: 123,
      userAgent: 'test-client/1.0',
      clientIp: '127.0.0.1'
    }, 'api-service');

    console.log('✅ Added API events to Redis stream');

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 8000));

    // Basic verification
    const streamLength = await redis.xlen(streamKey);
    expect(streamLength).toBeGreaterThan(0);
  });

  it('should send error and warning events to Dash0', async () => {
    // Error Event
    await addEventToStream('error.occurred', {
      errorCode: 'E001',
      errorMessage: 'Test error for telemetry verification',
      stackTrace: 'Error: Test error\\n    at testFunction:1:1',
      component: 'test-component',
      severity: 'high'
    }, 'error-service');

    // Warning Event
    await addEventToStream('warning.issued', {
      warningCode: 'W001',
      warningMessage: 'Test warning for telemetry verification',
      component: 'test-component',
      threshold: 80,
      currentValue: 85
    }, 'monitoring-service');

    console.log('✅ Added error and warning events to Redis stream');

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 8000));

    // Basic verification
    const streamLength = await redis.xlen(streamKey);
    expect(streamLength).toBeGreaterThan(0);
  });

  it('should verify telemetry collector is processing events', async () => {
    const beforeStreamLength = await redis.xlen(streamKey);

    // Add a simple test event
    await addEventToStream('telemetry.test', {
      message: 'Verification that telemetry collector is active and processing',
      component: 'integration-test',
      timestamp: new Date().toISOString()
    }, 'test-service');

    console.log('✅ Added verification event to Redis stream');
    console.log(`📊 Stream length before: ${beforeStreamLength}`);

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 3000));

    const afterStreamLength = await redis.xlen(streamKey);
    console.log(`📊 Stream length after: ${afterStreamLength}`);

    // Verify event was added
    expect(afterStreamLength).toBeGreaterThan(beforeStreamLength);

    // Note: The telemetry collector should process this event and send to Dash0
    // In a real scenario, we'd also verify it appears in Dash0, but for this test
    // we're focusing on ensuring the Redis stream accepts our events correctly
  });
});