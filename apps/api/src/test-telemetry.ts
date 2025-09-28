/**
 * Simple test script to verify telemetry integration
 */

import { createEventClient, EventTypes } from '@emp/core';

async function testTelemetry() {
  console.log('🧪 Testing telemetry integration...');

  const telemetry = createEventClient('test');

  try {
    // Test basic event
    await telemetry.event(EventTypes.SERVICE_STARTED, {
      test: true,
      timestamp: Date.now()
    });

    // Test job event
    await telemetry.jobEvent('test-job-123', EventTypes.JOB_SUBMITTED, {
      service_required: 'test-service'
    });

    // Test error event
    await telemetry.errorEvent(new Error('Test error'), {
      context: 'telemetry-test'
    });

    console.log('✅ Telemetry events sent successfully');

    // Flush and close
    await telemetry.flush();
    await telemetry.close();

    console.log('✅ Telemetry test completed');
  } catch (error) {
    console.error('❌ Telemetry test failed:', error);
  }
}

testTelemetry();