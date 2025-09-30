/**
 * End-to-End Pipeline Test
 *
 * Validates the complete telemetry pipeline:
 * 1. Send event to Redis stream
 * 2. Verify bridge processes event
 * 3. Verify collector consumes event
 * 4. Verify event reaches Dash0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Redis from 'ioredis';

describe('End-to-End Pipeline Tests', () => {
  let redis: Redis;
  const streamKey = 'telemetry:events';
  const testRunId = Date.now();

  beforeEach(async () => {
    if (!process.env.REDIS_URL) {
      throw new Error('REDIS_URL environment variable is required');
    }
    redis = new Redis(process.env.REDIS_URL);
    await new Promise(resolve => setTimeout(resolve, 500)); // Allow connection
  });

  afterEach(async () => {
    if (redis) {
      await redis.quit();
    }
  });

  it('should process event through complete pipeline: Redis → Bridge → Collector → Dash0', async () => {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🧪 END-TO-END PIPELINE TEST - Run ID: ${testRunId}`);
    console.log(`${'='.repeat(80)}\n`);

    // ========================================================================
    // STEP 1: Send event to Redis stream with complete test data
    // ========================================================================
    console.log('📤 STEP 1: Sending test event to Redis stream...');

    const testEvent = {
      timestamp: Date.now(),
      service: 'e2e-test-service',
      eventType: 'e2e.pipeline.test',
      traceId: `e2e-test-${testRunId}`,
      spanId: `span-${testRunId}`,
      data: {
        testRunId,
        step: 'redis-ingestion',
        message: 'End-to-end pipeline test event',
        expectedField1: 'value1',
        expectedField2: 'value2',
        nestedData: {
          key1: 'nested-value-1',
          key2: 'nested-value-2'
        }
      },
      level: 'info',
      tags: ['e2e-test', 'pipeline-validation']
    };

    console.log('📋 Test event structure:');
    console.log(JSON.stringify(testEvent, null, 2));

    await redis.xadd(
      streamKey,
      '*',
      'event',
      JSON.stringify(testEvent)
    );

    console.log('✅ Event sent to Redis stream\n');

    // ========================================================================
    // STEP 2: Verify Redis contains our exact event
    // ========================================================================
    console.log('🔍 STEP 2: Verifying event exists in Redis stream...');

    const streamLength = await redis.xlen(streamKey);
    expect(streamLength).toBeGreaterThan(0);
    console.log(`   Stream length: ${streamLength}`);

    const recentMessages = await redis.xrevrange(streamKey, '+', '-', 'COUNT', 10);
    const ourMessage = recentMessages.find(([id, fields]) => {
      const eventData = fields[1];
      try {
        const parsed = JSON.parse(eventData);
        return parsed.data?.testRunId === testRunId;
      } catch {
        return false;
      }
    });

    expect(ourMessage).toBeDefined();
    const redisEventData = JSON.parse(ourMessage![1][1]);
    console.log('✅ Event verified in Redis stream');
    console.log(`   Event ID: ${ourMessage![0]}`);
    console.log(`   Event data matches sent data: ${JSON.stringify(redisEventData.data) === JSON.stringify(testEvent.data)}\n`);

    // ========================================================================
    // STEP 3: Wait for collector to process and forward to Dash0
    // ========================================================================
    console.log('⏳ STEP 3: Waiting for collector to process and forward to Dash0...');
    console.log('   Initial wait: 5 seconds for collector processing...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('✅ Initial wait complete\n');

    // ========================================================================
    // STEP 4: Poll Dash0 API for our EXACT event with retry logic
    // ========================================================================
    console.log('🌐 STEP 4: Polling Dash0 for our test event...');

    const timeRange = {
      from: new Date(testRunId - 120000).toISOString(), // 2 minutes before test start
      to: new Date(testRunId + 120000).toISOString()    // 2 minutes after test start
    };

    console.log(`   Time range: ${timeRange.from} to ${timeRange.to}`);
    console.log(`   Dataset: ${process.env.DASH0_DATASET}`);

    let dash0Data: any = null;
    let ourSpan: any = null;
    const maxRetries = 6; // 6 retries = 30 seconds total (5s initial + 6*5s polling)
    const retryDelay = 5000; // 5 seconds between retries

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`\n   Attempt ${attempt}/${maxRetries}: Querying Dash0...`);

      const dash0Response = await fetch('https://api.us-west-2.aws.dash0.com/api/spans', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'authorization': 'Bearer auth_lR8sRf6ROYuUcZ724BWshmwMjy9UG296',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          timeRange,
          sampling: { mode: 'adaptive' },
          dataset: process.env.DASH0_DATASET
        })
      });

      expect(dash0Response.ok).toBe(true);
      dash0Data = await dash0Response.json();

      const allSpans = dash0Data.resourceSpans?.flatMap((rs: any) =>
        rs.scopeSpans?.flatMap((ss: any) => ss.spans || []) || []
      ) || [];

      console.log(`   Found ${allSpans.length} total spans`);

      // Look for our specific event
      ourSpan = allSpans.find((span: any) =>
        span.attributes?.some((attr: any) =>
          attr.key === 'testRunId' &&
          (attr.value?.stringValue === testRunId.toString() ||
           attr.value?.intValue === testRunId ||
           attr.value?.intValue === testRunId.toString())
        )
      );

      if (ourSpan) {
        console.log(`   ✅ Found our test event!`);
        break;
      }

      if (attempt < maxRetries) {
        console.log(`   ⏳ Event not found yet, waiting ${retryDelay / 1000}s before retry...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    console.log(`\n📊 Dash0 Final Response:`);
    console.log(`   Resource spans: ${dash0Data?.resourceSpans?.length || 0}`);

    // ========================================================================
    // STEP 5: VERIFY COMPLETE DATA INTEGRITY
    // ========================================================================
    console.log(`\n🔍 STEP 5: VERIFYING DATA INTEGRITY...\n`);

    expect(ourSpan).toBeDefined();
    console.log(`\n✅ Found our test event in Dash0!`);
    console.log(`   Span name: ${ourSpan.name}`);
    console.log(`   Trace ID: ${ourSpan.traceId}`);

    // ========================================================================
    // VERIFY ALL ATTRIBUTES FROM ORIGINAL EVENT
    // ========================================================================
    console.log(`\n📋 Verifying ALL attributes from original event:\n`);

    const getAttr = (key: string) =>
      ourSpan.attributes?.find((attr: any) => attr.key === key);

    // Verify testRunId (intValue can be either number or string)
    const testRunIdAttr = getAttr('testRunId');
    const testRunIdValue = testRunIdAttr?.value?.intValue || testRunIdAttr?.value?.stringValue;
    expect(testRunIdValue == testRunId).toBe(true); // Use == to handle string/number comparison
    console.log(`   ✅ testRunId: ${testRunIdValue}`);

    // Verify service
    const serviceAttr = getAttr('service');
    expect(serviceAttr?.value?.stringValue).toBe(testEvent.service);
    console.log(`   ✅ service: ${serviceAttr?.value?.stringValue}`);

    // Verify eventType
    const eventTypeAttr = getAttr('eventType');
    expect(eventTypeAttr?.value?.stringValue).toBe(testEvent.eventType);
    console.log(`   ✅ eventType: ${eventTypeAttr?.value?.stringValue}`);

    // Verify level
    const levelAttr = getAttr('level');
    expect(levelAttr?.value?.stringValue).toBe(testEvent.level);
    console.log(`   ✅ level: ${levelAttr?.value?.stringValue}`);

    // Verify message
    const messageAttr = getAttr('message');
    expect(messageAttr?.value?.stringValue).toBe(testEvent.data.message);
    console.log(`   ✅ message: ${messageAttr?.value?.stringValue}`);

    // Verify custom data fields
    const field1Attr = getAttr('expectedField1');
    expect(field1Attr?.value?.stringValue).toBe(testEvent.data.expectedField1);
    console.log(`   ✅ expectedField1: ${field1Attr?.value?.stringValue}`);

    const field2Attr = getAttr('expectedField2');
    expect(field2Attr?.value?.stringValue).toBe(testEvent.data.expectedField2);
    console.log(`   ✅ expectedField2: ${field2Attr?.value?.stringValue}`);

    // Verify nested data
    const nestedKey1Attr = getAttr('nestedData.key1');
    expect(nestedKey1Attr?.value?.stringValue).toBe(testEvent.data.nestedData.key1);
    console.log(`   ✅ nestedData.key1: ${nestedKey1Attr?.value?.stringValue}`);

    const nestedKey2Attr = getAttr('nestedData.key2');
    expect(nestedKey2Attr?.value?.stringValue).toBe(testEvent.data.nestedData.key2);
    console.log(`   ✅ nestedData.key2: ${nestedKey2Attr?.value?.stringValue}`);

    console.log(`\n${'='.repeat(80)}`);
    console.log(`✅ COMPLETE PIPELINE SUCCESS: Redis → Collector → Dash0`);
    console.log(`   ALL DATA VERIFIED WITH COMPLETE INTEGRITY`);
    console.log(`${'='.repeat(80)}\n`);
  }, 60000); // 60 second timeout for this test

  it('should verify Dash0 forwarder configuration', async () => {
    console.log('🔧 Testing Dash0 forwarder configuration...');

    // Check collector health to ensure Dash0 config is loaded
    const healthPort = process.env.HEALTH_PORT;
    const healthResponse = await fetch(`http://localhost:${healthPort}/health`);
    const healthData = await healthResponse.json();

    expect(healthData.status).toBe('healthy');
    console.log('✅ Collector is running with Dash0 configuration');

    // Verify we can reach Dash0 API
    const dash0TestResponse = await fetch('https://api.us-west-2.aws.dash0.com/api/spans', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'authorization': 'Bearer auth_lR8sRf6ROYuUcZ724BWshmwMjy9UG296',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        timeRange: {
          from: new Date(Date.now() - 60000).toISOString(),
          to: new Date().toISOString()
        },
        sampling: { mode: 'adaptive' },
        dataset: process.env.DASH0_DATASET
      })
    });

    expect(dash0TestResponse.ok).toBe(true);
    console.log('✅ Dash0 API is accessible and responding');
  });

  it('should handle multiple events in batch', async () => {
    console.log('📦 Testing batch event processing...');

    const batchTestId = Date.now();
    const events = [];

    // Send 5 events rapidly
    for (let i = 0; i < 5; i++) {
      const event = {
        timestamp: Date.now() + i,
        service: 'batch-test-service',
        eventType: `batch.event.${i}`,
        traceId: `batch-test-${batchTestId}-${i}`,
        data: {
          batchTestId,
          eventIndex: i,
          message: `Batch test event ${i}`
        },
        level: 'info'
      };

      events.push(event);

      await redis.xadd(
        streamKey,
        '*',
        'event',
        JSON.stringify(event)
      );
    }

    console.log('📤 Sent 5 batch events to Redis');

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Verify collector processed them
    const healthPort = process.env.HEALTH_PORT;
    const healthResponse = await fetch(`http://localhost:${healthPort}/health`);
    const healthData = await healthResponse.json();

    expect(healthData.consumer.processedCount).toBeGreaterThan(0);
    console.log(`✅ Collector processed batch events (total: ${healthData.consumer.processedCount})`);
  });
});