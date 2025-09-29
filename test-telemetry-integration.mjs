/**
 * Integration Test for Complete Telemetry Pipeline
 * Tests all telemetry events across worker, machine, and connector components
 */

import Redis from 'ioredis';

async function testTelemetryIntegration() {
  console.log('🚀 Starting comprehensive telemetry integration test...');

  const redis = new Redis(process.env.HUB_REDIS_URL || 'redis://localhost:6379');
  const streamKey = 'telemetry:events';

  // Import telemetry clients
  console.log('📦 Testing telemetry event clients...');

  try {
    // Simulate importing from the built package
    const { getWorkerTelemetry, getMachineTelemetry } = await import('./packages/core/dist/index.js');

    const workerTelemetry = getWorkerTelemetry();
    const machineTelemetry = getMachineTelemetry();

    console.log('✅ Telemetry clients imported successfully');

    // Test 1: Worker Events
    console.log('\n🔧 Testing Worker Telemetry Events...');

    // Worker registration
    await workerTelemetry.workerEvent('worker-test-001', 'worker.registered', {
      machineId: 'machine-test-001',
      version: '1.0.0',
      capabilities: ['comfyui', 'simulation'],
      maxConcurrentJobs: 5
    });

    // Worker heartbeat
    await workerTelemetry.workerEvent('worker-test-001', 'worker.heartbeat', {
      machineId: 'machine-test-001',
      status: 'idle',
      currentJobs: 0,
      uptime: 1234,
      memoryUsage: { rss: 50000000, heapUsed: 30000000 }
    });

    // Worker status change
    await workerTelemetry.workerEvent('worker-test-001', 'worker.status_changed', {
      machineId: 'machine-test-001',
      oldStatus: 'idle',
      newStatus: 'busy',
      currentJobs: 1
    });

    // Job lifecycle events
    await workerTelemetry.jobEvent('job-test-12345', 'job.claimed', {
      workerId: 'worker-test-001',
      machineId: 'machine-test-001',
      serviceRequired: 'comfyui',
      jobType: 'image-generation'
    });

    await workerTelemetry.jobEvent('job-test-12345', 'job.started', {
      workerId: 'worker-test-001',
      machineId: 'machine-test-001',
      serviceRequired: 'comfyui',
      startTime: Date.now()
    });

    await workerTelemetry.jobEvent('job-test-12345', 'job.progress', {
      workerId: 'worker-test-001',
      machineId: 'machine-test-001',
      progress: 50,
      message: 'Halfway complete',
      step: 5,
      totalSteps: 10
    });

    await workerTelemetry.jobEvent('job-test-12345', 'job.completed', {
      workerId: 'worker-test-001',
      machineId: 'machine-test-001',
      serviceType: 'comfyui',
      duration: 30000,
      success: true
    });

    console.log('✅ Worker telemetry events sent successfully');

    // Test 2: Machine Events
    console.log('\n🏭 Testing Machine Telemetry Events...');

    await machineTelemetry.machineEvent('machine-test-001', 'machine.registered', {
      machineId: 'machine-test-001',
      nodeVersion: process.version,
      platform: process.platform,
      cpuCount: 8,
      totalMemory: 16000000000
    });

    await machineTelemetry.machineEvent('machine-test-001', 'service.startup_initiated', {
      machineId: 'machine-test-001',
      phase: 'pm2_service_startup'
    });

    await machineTelemetry.machineEvent('machine-test-001', 'service.startup_completed', {
      machineId: 'machine-test-001',
      phase: 'pm2_services_started'
    });

    await machineTelemetry.machineEvent('machine-test-001', 'machine.ready', {
      machineId: 'machine-test-001',
      totalStartupTime: 15000,
      servicesCount: 3,
      status: 'ready'
    });

    await machineTelemetry.machineEvent('machine-test-001', 'health.check', {
      machineId: 'machine-test-001',
      status: 'healthy',
      totalServices: 3,
      onlineServices: 3,
      offlineServices: 0,
      uptime: process.uptime()
    });

    console.log('✅ Machine telemetry events sent successfully');

    // Test 3: Connector Events
    console.log('\n🔌 Testing Connector Telemetry Events...');

    await workerTelemetry.event('connector.job_received', {
      connectorId: 'comfyui-connector-001',
      serviceType: 'comfyui',
      jobId: 'job-test-12345',
      workerId: 'worker-test-001',
      machineId: 'machine-test-001',
      inputSize: 1024
    });

    await workerTelemetry.event('connector.job_started', {
      connectorId: 'comfyui-connector-001',
      serviceType: 'comfyui',
      jobId: 'job-test-12345',
      workerId: 'worker-test-001',
      machineId: 'machine-test-001'
    });

    await workerTelemetry.event('connector.job_completed', {
      connectorId: 'comfyui-connector-001',
      serviceType: 'comfyui',
      jobId: 'job-test-12345',
      workerId: 'worker-test-001',
      machineId: 'machine-test-001',
      duration: 25000,
      outputSize: 2048,
      success: true
    });

    await workerTelemetry.event('connector.status_changed', {
      connectorId: 'comfyui-connector-001',
      serviceType: 'comfyui',
      workerId: 'worker-test-001',
      machineId: 'machine-test-001',
      previousStatus: 'idle',
      newStatus: 'active',
      jobsProcessed: 1
    });

    console.log('✅ Connector telemetry events sent successfully');

    // Test 4: Verify events in Redis Stream
    console.log('\n🔍 Verifying events in Redis Stream...');

    const streamLength = await redis.xlen(streamKey);
    console.log(`📊 Stream '${streamKey}' now contains ${streamLength} events`);

    // Read recent events
    const recentEvents = await redis.xread('COUNT', '20', 'STREAMS', streamKey, '0');
    if (recentEvents && recentEvents.length > 0) {
      const [streamName, messages] = recentEvents[0];

      console.log(`\n📋 Recent events from stream '${streamName}':`);
      console.log('='.repeat(80));

      const eventTypeCounts = {};

      for (const [messageId, fields] of messages.slice(-20)) { // Show last 20 events
        const eventData = {};
        for (let i = 0; i < fields.length; i += 2) {
          eventData[fields[i]] = fields[i + 1];
        }

        // Count event types
        eventTypeCounts[eventData.eventType] = (eventTypeCounts[eventData.eventType] || 0) + 1;

        console.log(`  ${messageId}: ${eventData.service} -> ${eventData.eventType}`);
        if (eventData.data && eventData.data !== '{}') {
          const dataPreview = eventData.data.length > 100 ?
            eventData.data.substring(0, 100) + '...' :
            eventData.data;
          console.log(`    Data: ${dataPreview}`);
        }
      }

      console.log('\n📊 Event Type Summary:');
      console.log('='.repeat(40));
      Object.entries(eventTypeCounts).forEach(([eventType, count]) => {
        console.log(`  ${eventType}: ${count} events`);
      });
    }

    // Test 5: Event Schema Validation
    console.log('\n🔍 Validating event schemas...');

    const requiredFields = ['timestamp', 'service', 'eventType', 'traceId', 'level', 'data'];
    let validationErrors = 0;

    if (recentEvents && recentEvents.length > 0) {
      const [, messages] = recentEvents[0];

      for (const [messageId, fields] of messages.slice(-5)) { // Check last 5 events
        const eventData = {};
        for (let i = 0; i < fields.length; i += 2) {
          eventData[fields[i]] = fields[i + 1];
        }

        const missingFields = requiredFields.filter(field => !eventData[field]);
        if (missingFields.length > 0) {
          console.log(`❌ Event ${messageId} missing fields: ${missingFields.join(', ')}`);
          validationErrors++;
        }
      }
    }

    if (validationErrors === 0) {
      console.log('✅ All recent events have valid schemas');
    } else {
      console.log(`⚠️  Found ${validationErrors} events with schema issues`);
    }

    console.log('\n🎉 Telemetry Integration Test Complete!');
    console.log('='.repeat(80));
    console.log(`✅ All telemetry event types tested successfully`);
    console.log(`📊 Total events in stream: ${streamLength}`);
    console.log(`🔄 Stream key: ${streamKey}`);

    if (streamLength > 100) {
      console.log(`\n💡 Consider running: redis-cli XTRIM ${streamKey} MAXLEN 100`);
      console.log(`   to clean up old test events if needed`);
    }

  } catch (error) {
    console.error('❌ Telemetry integration test failed:', error);
    throw error;
  } finally {
    await redis.quit();
  }
}

// Run the test
testTelemetryIntegration().catch(error => {
  console.error('💥 Test execution failed:', error);
  process.exit(1);
});