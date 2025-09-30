/**
 * Send ONE simple test event to Redis stream
 */
import { createClient } from 'redis';

async function sendSingleTestEvent() {
  const client = createClient({ url: 'redis://localhost:6379' });
  await client.connect();

  const testEvent = {
    eventType: 'test.simple',
    timestamp: Date.now(),
    level: 'info',
    data: { message: 'single test event' }
  };

  console.log('📤 Sending single test event:', testEvent);

  await client.xAdd('telemetry:events', '*', {
    event: JSON.stringify(testEvent)
  });

  console.log('✅ Event sent to Redis stream');

  await client.quit();
}

sendSingleTestEvent().catch(console.error);