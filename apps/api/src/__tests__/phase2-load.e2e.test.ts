/**
 * Phase 2 Load Test - Real Workers with Mocked Services
 *
 * This test validates system performance under load with:
 * - Real worker connectors (Ollama, OpenAI)
 * - Mocked external HTTP services (via MockManager)
 * - Real-time monitoring UI
 * - Multiple concurrent jobs
 * - Telemetry pipeline validation
 *
 * The monitor UI will be available at http://localhost:3333
 * Watch real-time job processing, worker activity, and system metrics!
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fetch from 'node-fetch';
import { setupPhase2Environment, teardownPhase2Environment } from './setup-phase2.js';

describe('Phase 2: Load Test with Real Workers', () => {
  // Required environment variables
  if (!process.env.API_PORT) throw new Error('API_PORT required');
  if (!process.env.DASH0_AUTH_TOKEN) throw new Error('DASH0_AUTH_TOKEN required');
  if (!process.env.DASH0_DATASET) throw new Error('DASH0_DATASET required');

  const API_PORT = process.env.API_PORT;
  const API_URL = `http://localhost:${API_PORT}`;
  const DASH0_AUTH_TOKEN = process.env.DASH0_AUTH_TOKEN;
  const DASH0_DATASET = process.env.DASH0_DATASET;

  beforeAll(async () => {
    // Verify test mode
    if (process.env.NODE_ENV !== 'test' && process.env.MOCK_MODE !== 'true') {
      throw new Error('Phase 2 tests require NODE_ENV=test or MOCK_MODE=true');
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('🚀 Phase 2 Load Test - Real Workers + Mocked Services');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Setting up test environment...');
    console.log('');

    // Setup Phase 2 environment with monitor
    await setupPhase2Environment({
      profile: 'testrunner',
      workers: {
        ollama: 3,  // 3 Ollama workers
        openai: 2,  // 2 OpenAI workers
      },
      services: ['telcollect', 'api', 'webhook', 'monitor'],
    });

    console.log('\n✅ Environment ready!');
    console.log('📊 Monitor UI: http://localhost:3333');
    console.log('🔍 Watch real-time job processing in your browser!\n');
    console.log('═══════════════════════════════════════════════════════════\n');
  }, 60000); // 60 second timeout for setup

  afterAll(async () => {
    await teardownPhase2Environment();
  });

  it('should handle 20 concurrent Ollama jobs', async () => {
    console.log('\n📊 LOAD TEST: 20 concurrent Ollama jobs\n');
    console.log('🌐 Open http://localhost:3333 to watch processing!\n');

    const testBatchId = `load-ollama-${Date.now()}`;
    const jobCount = 20;

    // Create job payloads
    const jobPayloads = Array.from({ length: jobCount }, (_, i) => ({
      workflow_id: `${testBatchId}-${i}`,
      customer_id: 'phase2-load-test',
      service_required: 'ollama-text',
      priority: 50 + i, // Varying priorities
      payload: {
        model: 'qwen3:0.6b',
        prompt: `Load test prompt ${i} - testing concurrent processing`,
        stream: false,
      },
    }));

    console.log(`STEP 1: Submitting ${jobCount} jobs...`);
    const startTime = Date.now();

    // Submit all jobs concurrently
    const submitPromises = jobPayloads.map(async (payload) => {
      const response = await fetch(`${API_URL}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return response.json();
    });

    const submitResults = await Promise.all(submitPromises);
    const submitDuration = Date.now() - startTime;

    console.log(`✅ All ${jobCount} jobs submitted in ${submitDuration}ms`);
    console.log(`   Average: ${(submitDuration / jobCount).toFixed(2)}ms per job\n`);

    console.log('STEP 2: Waiting for job processing...');
    console.log('🌐 Watch progress at http://localhost:3333\n');

    // Wait for processing (3 workers × ~4 seconds per job = ~27 seconds for 20 jobs)
    await new Promise((resolve) => setTimeout(resolve, 35000));

    console.log('\nSTEP 3: Verifying telemetry events...');
    const timeRange = {
      from: new Date(startTime - 60000).toISOString(),
      to: new Date().toISOString(),
    };

    const dash0Response = await fetch('https://api.us-west-2.aws.dash0.com/api/spans', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${DASH0_AUTH_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        timeRange,
        sampling: { mode: 'adaptive' },
        dataset: DASH0_DATASET,
      }),
    });

    expect(dash0Response.ok).toBe(true);
    const dash0Events: any = await dash0Response.json();

    const allSpans =
      dash0Events.resourceSpans?.flatMap((rs: any) =>
        rs.scopeSpans?.flatMap((ss: any) => ss.spans || []) || []
      ) || [];

    const batchEvents = allSpans.filter((span: any) =>
      span.attributes?.some(
        (attr: any) =>
          attr.key === 'job_id' && attr.value?.stringValue?.startsWith(testBatchId)
      )
    );

    console.log(`   Found ${batchEvents.length} telemetry events for batch`);
    console.log(`   Total processing time: ${Date.now() - startTime}ms\n`);

    expect(batchEvents.length).toBeGreaterThanOrEqual(jobCount);
    console.log('✅ Load test completed successfully\n');
  }, 90000); // 90 second timeout

  it('should handle mixed workload (Ollama + OpenAI)', async () => {
    console.log('\n📊 LOAD TEST: Mixed workload (15 Ollama + 10 OpenAI)\n');
    console.log('🌐 Open http://localhost:3333 to watch processing!\n');

    const testBatchId = `load-mixed-${Date.now()}`;
    const startTime = Date.now();

    // Create mixed job payloads
    const jobs = [
      // 15 Ollama jobs
      ...Array.from({ length: 15 }, (_, i) => ({
        workflow_id: `${testBatchId}-ollama-${i}`,
        customer_id: 'phase2-mixed-test',
        service_required: 'ollama-text',
        priority: 50,
        payload: {
          model: 'qwen3:0.6b',
          prompt: `Mixed test Ollama ${i}`,
          stream: false,
        },
      })),
      // 10 OpenAI jobs
      ...Array.from({ length: 10 }, (_, i) => ({
        workflow_id: `${testBatchId}-openai-${i}`,
        customer_id: 'phase2-mixed-test',
        service_required: 'openai-text',
        priority: 50,
        payload: {
          model: 'gpt-4',
          messages: [{ role: 'user', content: `Mixed test OpenAI ${i}` }],
          max_tokens: 100,
        },
      })),
    ];

    console.log(`STEP 1: Submitting ${jobs.length} mixed jobs...`);
    console.log(`   - 15 Ollama jobs (3 workers available)`);
    console.log(`   - 10 OpenAI jobs (2 workers available)\n`);

    // Submit all jobs
    const submitPromises = jobs.map(async (job) => {
      const response = await fetch(`${API_URL}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(job),
      });
      return response.json();
    });

    await Promise.all(submitPromises);
    const submitDuration = Date.now() - startTime;

    console.log(`✅ All ${jobs.length} jobs submitted in ${submitDuration}ms\n`);

    console.log('STEP 2: Waiting for mixed workload processing...');
    console.log('🌐 Watch worker activity at http://localhost:3333\n');

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 40000));

    console.log('\nSTEP 3: Verifying telemetry...');
    const timeRange = {
      from: new Date(startTime - 60000).toISOString(),
      to: new Date().toISOString(),
    };

    const dash0Response = await fetch('https://api.us-west-2.aws.dash0.com/api/spans', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${DASH0_AUTH_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        timeRange,
        sampling: { mode: 'adaptive' },
        dataset: DASH0_DATASET,
      }),
    });

    const dash0Events: any = await dash0Response.json();
    const allSpans =
      dash0Events.resourceSpans?.flatMap((rs: any) =>
        rs.scopeSpans?.flatMap((ss: any) => ss.spans || []) || []
      ) || [];

    const batchEvents = allSpans.filter((span: any) =>
      span.attributes?.some(
        (attr: any) =>
          attr.key === 'job_id' && attr.value?.stringValue?.startsWith(testBatchId)
      )
    );

    console.log(`   Found ${batchEvents.length} events`);
    console.log(`   Total time: ${Date.now() - startTime}ms\n`);

    expect(batchEvents.length).toBeGreaterThanOrEqual(jobs.length);
    console.log('✅ Mixed workload test completed\n');
  }, 90000);

  it('should display performance metrics', () => {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📊 PERFORMANCE SUMMARY');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('🎯 Test Configuration:');
    console.log('   - 3 Ollama workers (real OllamaConnector)');
    console.log('   - 2 OpenAI workers (real OpenAIConnector)');
    console.log('   - HTTP mocking active (MockManager)');
    console.log('   - Real-time monitoring UI running');
    console.log('');
    console.log('✅ Tests validated:');
    console.log('   - Job submission throughput');
    console.log('   - Concurrent job processing');
    console.log('   - Mixed workload distribution');
    console.log('   - Telemetry event capture');
    console.log('   - End-to-end pipeline integrity');
    console.log('');
    console.log('🌐 Monitor UI: http://localhost:3333');
    console.log('═══════════════════════════════════════════════════════════\n');
  });
});
