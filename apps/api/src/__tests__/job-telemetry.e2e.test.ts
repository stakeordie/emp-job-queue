/**
 * End-to-End API Job Telemetry Test
 *
 * Validates the complete telemetry pipeline for API job submission:
 * 1. Submit job to API endpoint
 * 2. Verify job.received telemetry event is created
 * 3. Verify event flows through OTLP collector to Dash0
 * 4. Verify all attributes are preserved
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';

describe('API Job Telemetry E2E Tests', () => {
  const API_PORT = process.env.API_PORT || '3331';
  const API_URL = `http://localhost:${API_PORT}`;

  if (!process.env.OTEL_SERVICE_NAME) {
    throw new Error('OTEL_SERVICE_NAME environment variable is required');
  }
  const EXPECTED_SERVICE_NAME = process.env.OTEL_SERVICE_NAME;

  const testRunId = Date.now();

  let apiProcess: ChildProcess | null = null;
  let collectorProcess: ChildProcess | null = null;
  let servicesStarted = false;

  async function checkServiceRunning(url: string, testEndpoint: string = ''): Promise<boolean> {
    try {
      const response = await fetch(url + testEndpoint);
      return response.ok || response.status === 404; // 404 is fine - service is running
    } catch {
      return false;
    }
  }

  async function startService(command: string, args: string[], serviceName: string): Promise<ChildProcess> {
    console.log(`🚀 Starting ${serviceName}...`);
    const proc = spawn(command, args, {
      cwd: '/Users/the_dusky/code/emprops/ai_infra/emp-job-queue',
      env: { ...process.env },
      shell: true,
      detached: false
    });

    proc.stdout?.on('data', (data) => {
      console.log(`[${serviceName}] ${data.toString().trim()}`);
    });

    proc.stderr?.on('data', (data) => {
      console.error(`[${serviceName} ERROR] ${data.toString().trim()}`);
    });

    // Wait for service to be ready
    await new Promise(resolve => setTimeout(resolve, 3000));
    return proc;
  }

  beforeAll(async () => {
    // Check if API is running (test with root endpoint)
    const apiRunning = await checkServiceRunning(API_URL);
    if (!apiRunning) {
      console.log('⚠️  API not running, starting it...');
      apiProcess = await startService('pnpm', ['dev:api', '--env', 'testrunner'], 'API');
      servicesStarted = true;
    } else {
      console.log('✅ API already running');
    }

    // Check if OTLP collector is running (use env var for correct port)
    if (!process.env.OTEL_COLLECTOR_ENDPOINT) {
      throw new Error('OTEL_COLLECTOR_ENDPOINT environment variable is required');
    }
    const collectorRunning = await checkServiceRunning(process.env.OTEL_COLLECTOR_ENDPOINT, '/v1/traces');
    if (!collectorRunning) {
      console.log('⚠️  OTLP Collector not running, starting it...');
      collectorProcess = await startService('pnpm', ['dev:telcollect', '--env', 'testrunner'], 'OTLP Collector');
      servicesStarted = true;
    } else {
      console.log('✅ OTLP Collector already running');
    }

    // Additional wait if we started services
    if (servicesStarted) {
      console.log('⏳ Waiting for services to fully initialize...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  });

  afterAll(async () => {
    // Only kill processes we started
    if (apiProcess) {
      console.log('🛑 Stopping API process...');
      apiProcess.kill('SIGTERM');
    }
    if (collectorProcess) {
      console.log('🛑 Stopping OTLP Collector process...');
      collectorProcess.kill('SIGTERM');
    }
  });

  it('should create job.received telemetry event and verify in Dash0', async () => {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🧪 API JOB TELEMETRY E2E TEST - Run ID: ${testRunId}`);
    console.log(`${'='.repeat(80)}\n`);

    // ========================================================================
    // STEP 0: Verify OTLP Collector is running and accessible
    // ========================================================================
    console.log('🔍 STEP 0: Verifying OTLP Collector is accessible...');

    if (!process.env.OTEL_COLLECTOR_ENDPOINT) {
      throw new Error('OTEL_COLLECTOR_ENDPOINT environment variable is required');
    }
    const collectorUrl = process.env.OTEL_COLLECTOR_ENDPOINT;
    console.log(`   Collector URL: ${collectorUrl}`);

    try {
      const collectorCheck = await fetch(`${collectorUrl}/v1/traces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resourceSpans: [] })
      });

      console.log(`   Collector response status: ${collectorCheck.status}`);
      expect(collectorCheck.status).toBe(200);
      console.log('✅ OTLP Collector is accessible and responding\n');
    } catch (error: any) {
      console.error(`❌ OTLP Collector not accessible: ${error.message}`);
      throw new Error(`OTLP Collector not accessible at ${collectorUrl}: ${error.message}`);
    }

    // ========================================================================
    // STEP 1: Submit job to API
    // ========================================================================
    console.log('📤 STEP 1: Submitting job to API...');

    const jobPayload = {
      workflow_id: `test-workflow-${testRunId}`,
      customer_id: 'test-customer-e2e',
      service_required: 'comfyui',
      priority: 75,
      data: {
        prompt: 'test prompt',
        testRunId,
        testType: 'e2e-telemetry'
      }
    };

    console.log('📋 Job payload:');
    console.log(JSON.stringify(jobPayload, null, 2));

    const submitResponse = await fetch(`${API_URL}/api/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(jobPayload)
    });

    expect(submitResponse.ok).toBe(true);
    const submitResult = await submitResponse.json();

    console.log('✅ Job submitted successfully');
    console.log(`   Job ID (step_id): ${submitResult.job_id}`);
    console.log(`   Workflow ID (job_id): ${jobPayload.workflow_id}\n`);

    // ========================================================================
    // STEP 2: Verify telemetry event was created
    // ========================================================================
    console.log('🔍 STEP 2: Verifying telemetry event was created by API...');
    console.log('   NOTE: The @emp/telemetry client should have called addEvent()');
    console.log('   The event should contain job_id and step_id attributes\n');

    // Small delay to let telemetry SDK process the event
    await new Promise(resolve => setTimeout(resolve, 500));

    // ========================================================================
    // STEP 3: Wait for telemetry to propagate through OTLP collector
    // ========================================================================
    console.log('⏳ STEP 3: Waiting for telemetry to propagate through pipeline...');
    console.log('   Pipeline: API → OTLP Collector → Dash0');
    console.log('   Initial wait: 5 seconds for OTLP processing...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('✅ Initial wait complete\n');

    // ========================================================================
    // STEP 4: Query Dash0 for the job.received event
    // ========================================================================
    console.log('🌐 STEP 4: Querying Dash0 for job.received event...');

    const timeRange = {
      from: new Date(testRunId - 120000).toISOString(), // 2 minutes before
      to: new Date(Date.now() + 60000).toISOString()    // 1 minute future
    };

    console.log(`   Time range: ${timeRange.from} to ${timeRange.to}`);
    console.log(`   Dataset: ${process.env.DASH0_DATASET || 'testrunner'}`);
    console.log(`   Looking for workflow_id: ${jobPayload.workflow_id}`);

    let dash0Data: any = null;
    let ourEvent: any = null;
    const maxRetries = 6; // 6 retries = 30 seconds total
    const retryDelay = 5000; // 5 seconds between retries

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`\n   Attempt ${attempt}/${maxRetries}: Querying Dash0...`);

      const dash0Response = await fetch('https://api.us-west-2.aws.dash0.com/api/spans', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'authorization': `Bearer ${process.env.DASH0_AUTH_TOKEN}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          timeRange,
          sampling: { mode: 'adaptive' },
          dataset: process.env.DASH0_DATASET || 'testrunner'
        })
      });

      if (!dash0Response.ok) {
        const errorText = await dash0Response.text();
        console.log(`   ❌ Dash0 API error: ${dash0Response.status} ${dash0Response.statusText}`);
        console.log(`   Response body: ${errorText}`);
      }
      expect(dash0Response.ok).toBe(true);
      dash0Data = await dash0Response.json();

      const allSpans = dash0Data.resourceSpans?.flatMap((rs: any) =>
        rs.scopeSpans?.flatMap((ss: any) => ss.spans || []) || []
      ) || [];

      console.log(`   Found ${allSpans.length} total spans`);

      // Look for our specific job.received event
      // Match by workflow_id (job_id in new terminology)
      ourEvent = allSpans.find((span: any) => {
        const hasJobReceived = span.name === 'job.received';
        const hasWorkflowId = span.attributes?.some((attr: any) =>
          attr.key === 'job_id' &&
          attr.value?.stringValue === jobPayload.workflow_id
        );
        const hasStepId = span.attributes?.some((attr: any) =>
          attr.key === 'step_id' &&
          attr.value?.stringValue === submitResult.job_id
        );

        return hasJobReceived && hasWorkflowId && hasStepId;
      });

      if (ourEvent) {
        console.log(`   ✅ Found our job.received event!`);
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
    // STEP 5: VERIFY EVENT DATA INTEGRITY
    // ========================================================================
    console.log(`\n🔍 STEP 5: VERIFYING EVENT DATA INTEGRITY...\n`);

    expect(ourEvent).toBeDefined();
    console.log(`✅ Found job.received event in Dash0!`);
    console.log(`   Event name: ${ourEvent.name}`);

    // Helper to get attribute value
    const getAttr = (key: string) =>
      ourEvent.attributes?.find((attr: any) => attr.key === key);

    // Verify all required attributes from lightweight-api-server.ts:3433-3451
    console.log(`\n📋 Verifying ALL job.received attributes:\n`);

    // New terminology: job_id = workflow_id
    const jobIdAttr = getAttr('job_id');
    expect(jobIdAttr?.value?.stringValue).toBe(jobPayload.workflow_id);
    console.log(`   ✅ job_id (workflow_id): ${jobIdAttr?.value?.stringValue}`);

    // New terminology: step_id = job_id from API response
    const stepIdAttr = getAttr('step_id');
    expect(stepIdAttr?.value?.stringValue).toBe(submitResult.job_id);
    console.log(`   ✅ step_id (job_id): ${stepIdAttr?.value?.stringValue}`);

    // Service attribution
    const serviceAttr = getAttr('service');
    expect(serviceAttr?.value?.stringValue).toBe('Job_Q_API');
    console.log(`   ✅ service: ${serviceAttr?.value?.stringValue}`);

    // Deployment platform
    const platformAttr = getAttr('deployment.platform');
    expect(platformAttr?.value?.stringValue).toBe('railway');
    console.log(`   ✅ deployment.platform: ${platformAttr?.value?.stringValue}`);

    // Source (should be emprops_api because customer_id is present)
    const sourceAttr = getAttr('source');
    expect(sourceAttr?.value?.stringValue).toBe('emprops_api');
    console.log(`   ✅ source: ${sourceAttr?.value?.stringValue}`);

    // Customer ID
    const customerIdAttr = getAttr('customer_id');
    expect(customerIdAttr?.value?.stringValue).toBe(jobPayload.customer_id);
    console.log(`   ✅ customer_id: ${customerIdAttr?.value?.stringValue}`);

    // Service required
    const serviceRequiredAttr = getAttr('service_required');
    expect(serviceRequiredAttr?.value?.stringValue).toBe(jobPayload.service_required);
    console.log(`   ✅ service_required: ${serviceRequiredAttr?.value?.stringValue}`);

    // Priority (can be intValue or stringValue, both may be strings from API)
    const priorityAttr = getAttr('priority');
    const rawValue = priorityAttr?.value?.intValue ?? priorityAttr?.value?.stringValue;
    const priorityValue = typeof rawValue === 'string' ? parseInt(rawValue) : (rawValue ?? 0);
    expect(priorityValue).toBe(jobPayload.priority);
    console.log(`   ✅ priority: ${priorityValue}`);

    // ========================================================================
    // STEP 6: Verify service name is emp-api, NOT emp-telemetry
    // ========================================================================
    console.log(`\n🔍 STEP 6: VERIFYING SERVICE ATTRIBUTION...\n`);

    // Check resource attributes for service.name
    const resourceSpan = dash0Data.resourceSpans?.find((rs: any) =>
      rs.scopeSpans?.some((ss: any) =>
        ss.spans?.some((s: any) => s === ourEvent)
      )
    );

    const serviceNameAttr = resourceSpan?.resource?.attributes?.find(
      (attr: any) => attr.key === 'service.name'
    );

    expect(serviceNameAttr?.value?.stringValue).toBe(EXPECTED_SERVICE_NAME);
    console.log(`   ✅ service.name: ${serviceNameAttr?.value?.stringValue}`);
    console.log(`   ✅ Matches expected: ${EXPECTED_SERVICE_NAME}`);

    console.log(`\n${'='.repeat(80)}`);
    console.log(`✅ COMPLETE PIPELINE SUCCESS: API → OTLP Collector → Dash0`);
    console.log(`   ALL job.received ATTRIBUTES VERIFIED`);
    console.log(`   SERVICE ATTRIBUTION PRESERVED (${EXPECTED_SERVICE_NAME})`);
    console.log(`${'='.repeat(80)}\n`);
  }, 90000); // 90 second timeout for complete pipeline test

  it('should handle job from UI (no customer_id)', async () => {
    console.log('\n🧪 Testing UI-originated job (source: emprops_ui)...');

    const testRunId = Date.now();
    const jobPayload = {
      workflow_id: `test-ui-workflow-${testRunId}`,
      // NO customer_id - indicates UI origin
      service_required: 'comfyui',
      priority: 50,
      data: {
        prompt: 'UI test prompt',
        testRunId
      }
    };

    const submitResponse = await fetch(`${API_URL}/api/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(jobPayload)
    });

    expect(submitResponse.ok).toBe(true);
    const submitResult = await submitResponse.json();

    console.log('✅ UI job submitted');
    console.log(`   Job ID: ${submitResult.job_id}`);

    // Wait for telemetry
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Query Dash0
    const timeRange = {
      from: new Date(testRunId - 60000).toISOString(),
      to: new Date(Date.now() + 60000).toISOString()
    };

    const dash0Response = await fetch('https://api.us-west-2.aws.dash0.com/api/spans', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'authorization': `Bearer ${process.env.DASH0_AUTH_TOKEN}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        timeRange,
        sampling: { mode: 'adaptive' },
        dataset: process.env.DASH0_DATASET || 'testrunner'
      })
    });

    const dash0Data = await dash0Response.json();
    const allSpans = dash0Data.resourceSpans?.flatMap((rs: any) =>
      rs.scopeSpans?.flatMap((ss: any) => ss.spans || []) || []
    ) || [];

    const ourEvent = allSpans.find((span: any) =>
      span.attributes?.some((attr: any) =>
        attr.key === 'step_id' && attr.value?.stringValue === submitResult.job_id
      )
    );

    expect(ourEvent).toBeDefined();

    const sourceAttr = ourEvent.attributes?.find((attr: any) => attr.key === 'source');
    expect(sourceAttr?.value?.stringValue).toBe('emprops_ui');
    console.log(`   ✅ source correctly set to: ${sourceAttr?.value?.stringValue}`);
  }, 60000);
});
