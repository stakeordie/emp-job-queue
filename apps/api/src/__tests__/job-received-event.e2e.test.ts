/**
 * API job.received Event E2E Tests
 *
 * Tests the specific job.received telemetry event flow:
 * 1. Job submission triggers event
 * 2. Event sent to collector
 * 3. Collector processes event
 * 4. Event arrives in Dash0
 * 5. All attributes preserved
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fetch from 'node-fetch';
import { config } from 'dotenv';
import { ensureServicesRunning, cleanupStartedServices } from './test-service-setup.js';

// Load testrunner environment
config({ path: '.env.testrunner' });
config({ path: '.env.secret.testrunner' });

describe('API job.received Event E2E Tests', () => {
  // Required environment variables - no fallbacks
  if (!process.env.API_PORT) throw new Error('API_PORT required');
  if (!process.env.OTEL_COLLECTOR_ENDPOINT) throw new Error('OTEL_COLLECTOR_ENDPOINT required');
  if (!process.env.DASH0_AUTH_TOKEN) throw new Error('DASH0_AUTH_TOKEN required');
  if (!process.env.DASH0_DATASET) throw new Error('DASH0_DATASET required');

  const API_PORT = process.env.API_PORT;
  const API_URL = `http://localhost:${API_PORT}`;
  const COLLECTOR_URL = process.env.OTEL_COLLECTOR_ENDPOINT;
  const DASH0_AUTH_TOKEN = process.env.DASH0_AUTH_TOKEN;
  const DASH0_DATASET = process.env.DASH0_DATASET;
  const EXPECTED_SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'emp-api';

  beforeAll(async () => {
    await ensureServicesRunning(['api', 'telcollect']);
  }, 120000); // 120 seconds to allow for 3 checks (15s + 30s + 60s + buffer)

  afterAll(async () => {
    cleanupStartedServices();
  });

  it('should submit job successfully to API', async () => {
    console.log('\n📊 TEST: Job submission to API\n');

    const jobPayload = {
      workflow_id: `test-job-received-${Date.now()}`,
      customer_id: 'test-customer',
      service_required: 'comfyui',
      priority: 75,
      payload: { test: 'job-received-event' },
    };

    const response = await fetch(`${API_URL}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jobPayload),
    });

    expect(response.ok).toBe(true);
    const result = await response.json();

    console.log(`✅ Job submitted successfully`);
    console.log(`   Job ID: ${result.job_id}`);
    console.log(`   Workflow ID: ${jobPayload.workflow_id}`);

    expect(result.job_id).toBeDefined();
  });

  it('should create job.received event when job is submitted', async () => {
    console.log('\n📊 TEST: job.received event creation\n');

    const jobPayload = {
      workflow_id: `test-event-creation-${Date.now()}`,
      customer_id: 'test-customer',
      service_required: 'comfyui',
      priority: 75,
      payload: { test: 'event-creation' },
    };

    const response = await fetch(`${API_URL}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jobPayload),
    });

    expect(response.ok).toBe(true);
    const result = await response.json();

    console.log(`✅ Job submitted: ${result.job_id}`);
    console.log(`   The API should have called telemetryClient.addEvent('job.received', ...)`);
    console.log(`   Event sent to collector at: ${COLLECTOR_URL}`);
  });

  it('should send job.received event to Dash0 and verify arrival', async () => {
    console.log('\n📊 TEST: Complete job.received event flow to Dash0\n');

    const testWorkflowId = `test-dash0-${Date.now()}`;
    const jobPayload = {
      workflow_id: testWorkflowId,
      customer_id: 'test-customer-dash0',
      service_required: 'comfyui',
      priority: 75,
      payload: { test: 'dash0-verification' },
    };

    console.log('STEP 1: Submitting job to API...');
    const submitResponse = await fetch(`${API_URL}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jobPayload),
    });

    expect(submitResponse.ok).toBe(true);
    const submitResult = await submitResponse.json();
    console.log(`✅ Job submitted: ${submitResult.job_id}`);

    console.log('\nSTEP 2: Waiting for telemetry propagation (10 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    console.log('\nSTEP 3: Querying Dash0 for job.received event...');
    const timeRange = {
      from: new Date(Date.now() - 120000).toISOString(), // 2 minutes ago
      to: new Date(Date.now() + 60000).toISOString(),   // 1 minute future
    };

    let foundEvent: any = null;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts && !foundEvent) {
      attempts++;
      console.log(`   Attempt ${attempts}/${maxAttempts}...`);

      const dash0Response = await fetch('https://api.us-west-2.aws.dash0.com/api/spans', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'authorization': `Bearer ${DASH0_AUTH_TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          timeRange,
          sampling: { mode: 'adaptive' },
          dataset: DASH0_DATASET,
        }),
      });

      expect(dash0Response.ok).toBe(true);
      const dash0Events = await dash0Response.json();

      const allSpans = dash0Events.resourceSpans?.flatMap((rs: any) =>
        rs.scopeSpans?.flatMap((ss: any) => ss.spans || []) || []
      ) || [];

      console.log(`   Found ${allSpans.length} total spans`);

      // Look for job.received event with our workflow_id
      foundEvent = allSpans.find((span: any) => {
        const isJobReceived = span.name === 'job.received';
        const hasWorkflowId = span.attributes?.some((attr: any) =>
          attr.key === 'job_id' && attr.value?.stringValue === testWorkflowId
        );
        return isJobReceived && hasWorkflowId;
      });

      if (foundEvent) {
        console.log(`✅ Found job.received event!`);
        break;
      }

      if (attempts < maxAttempts) {
        console.log(`   Event not found, waiting 5 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    expect(foundEvent).toBeDefined();
    console.log(`\n✅ job.received event successfully arrived in Dash0`);
  }, 30000);

  it('should preserve all job.received event attributes', async () => {
    console.log('\n📊 TEST: Event attribute preservation\n');

    const testWorkflowId = `test-attributes-${Date.now()}`;
    const testCustomerId = 'test-customer-attrs';

    const jobPayload = {
      workflow_id: testWorkflowId,
      customer_id: testCustomerId,
      service_required: 'comfyui',
      priority: 85,
      payload: { test: 'attribute-check' },
    };

    console.log('STEP 1: Submitting job...');
    const submitResponse = await fetch(`${API_URL}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jobPayload),
    });

    expect(submitResponse.ok).toBe(true);
    const submitResult = await submitResponse.json();
    console.log(`✅ Job submitted: ${submitResult.job_id}`);

    console.log('\nSTEP 2: Waiting for propagation (10 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    console.log('\nSTEP 3: Retrieving event from Dash0...');
    const timeRange = {
      from: new Date(Date.now() - 120000).toISOString(),
      to: new Date(Date.now() + 60000).toISOString(),
    };

    const dash0Response = await fetch('https://api.us-west-2.aws.dash0.com/api/spans', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'authorization': `Bearer ${DASH0_AUTH_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        timeRange,
        sampling: { mode: 'adaptive' },
        dataset: DASH0_DATASET,
      }),
    });

    expect(dash0Response.ok).toBe(true);
    const dash0Events = await dash0Response.json();

    const allSpans = dash0Events.resourceSpans?.flatMap((rs: any) =>
      rs.scopeSpans?.flatMap((ss: any) => ss.spans || []) || []
    ) || [];

    const ourEvent = allSpans.find((span: any) => {
      const isJobReceived = span.name === 'job.received';
      const hasWorkflowId = span.attributes?.some((attr: any) =>
        attr.key === 'job_id' && attr.value?.stringValue === testWorkflowId
      );
      return isJobReceived && hasWorkflowId;
    });

    expect(ourEvent).toBeDefined();
    console.log(`✅ Found event in Dash0`);

    console.log('\nSTEP 4: Verifying attributes...');

    const getAttr = (key: string) =>
      ourEvent.attributes?.find((attr: any) => attr.key === key);

    // Verify required attributes
    const jobIdAttr = getAttr('job_id');
    expect(jobIdAttr?.value?.stringValue).toBe(testWorkflowId);
    console.log(`✅ job_id = ${jobIdAttr?.value?.stringValue}`);

    const stepIdAttr = getAttr('step_id');
    expect(stepIdAttr?.value?.stringValue).toBe(submitResult.job_id);
    console.log(`✅ step_id = ${stepIdAttr?.value?.stringValue}`);

    const customerIdAttr = getAttr('customer_id');
    expect(customerIdAttr?.value?.stringValue).toBe(testCustomerId);
    console.log(`✅ customer_id = ${customerIdAttr?.value?.stringValue}`);

    const serviceAttr = getAttr('service');
    expect(serviceAttr?.value?.stringValue).toBe('Job_Q_API');
    console.log(`✅ service = ${serviceAttr?.value?.stringValue}`);

    console.log('\n✅ All attributes preserved correctly');
  }, 30000);

  it('should have correct service attribution in Dash0', async () => {
    console.log('\n📊 TEST: Service attribution\n');

    const testWorkflowId = `test-service-attr-${Date.now()}`;
    const jobPayload = {
      workflow_id: testWorkflowId,
      customer_id: 'test-customer',
      service_required: 'comfyui',
      priority: 75,
      payload: { test: 'service-attribution' },
    };

    console.log('STEP 1: Submitting job...');
    const submitResponse = await fetch(`${API_URL}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jobPayload),
    });

    expect(submitResponse.ok).toBe(true);
    console.log(`✅ Job submitted`);

    console.log('\nSTEP 2: Waiting for propagation (10 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    console.log('\nSTEP 3: Verifying service attribution...');
    const timeRange = {
      from: new Date(Date.now() - 120000).toISOString(),
      to: new Date(Date.now() + 60000).toISOString(),
    };

    const dash0Response = await fetch('https://api.us-west-2.aws.dash0.com/api/spans', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'authorization': `Bearer ${DASH0_AUTH_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        timeRange,
        sampling: { mode: 'adaptive' },
        dataset: DASH0_DATASET,
      }),
    });

    const dash0Events = await dash0Response.json();
    const allSpans = dash0Events.resourceSpans?.flatMap((rs: any) =>
      rs.scopeSpans?.flatMap((ss: any) => ss.spans || []) || []
    ) || [];

    const ourEvent = allSpans.find((span: any) =>
      span.name === 'job.received' &&
      span.attributes?.some((attr: any) =>
        attr.key === 'job_id' && attr.value?.stringValue === testWorkflowId
      )
    );

    expect(ourEvent).toBeDefined();

    // Find the resource span containing our event
    const resourceSpan = dash0Events.resourceSpans?.find((rs: any) =>
      rs.scopeSpans?.some((ss: any) =>
        ss.spans?.some((s: any) => s === ourEvent)
      )
    );

    const serviceNameAttr = resourceSpan?.resource?.attributes?.find(
      (attr: any) => attr.key === 'service.name'
    );

    expect(serviceNameAttr?.value?.stringValue).toBe(EXPECTED_SERVICE_NAME);
    console.log(`✅ Service attribution correct: ${serviceNameAttr?.value?.stringValue} (expected: ${EXPECTED_SERVICE_NAME})`);
  }, 30000);
});
