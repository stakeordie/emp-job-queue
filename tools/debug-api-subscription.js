#!/usr/bin/env node

/**
 * Debug API Server Redis Subscription
 * 
 * Tests if the API server is properly subscribed to machine:startup:events
 */

import Redis from 'ioredis';
import chalk from 'chalk';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

console.log(chalk.blue.bold('🔍 API SUBSCRIPTION DEBUG'));
console.log(chalk.blue('═'.repeat(50)));
console.log(chalk.gray(`Redis: ${REDIS_URL}`));
console.log('');

const redis = new Redis(REDIS_URL);

async function debugApiSubscription() {
  try {
    // 1. Check Redis connection
    console.log(chalk.cyan('1. Testing Redis connection...'));
    await redis.ping();
    console.log(chalk.green('✅ Redis connection: SUCCESS'));
    
    // 2. Check active subscriptions
    console.log(chalk.cyan('\n2. Checking active Redis subscriptions...'));
    const subscriptions = await redis.pubsub('channels');
    console.log(chalk.gray(`Found ${subscriptions.length} active subscriptions:`));
    subscriptions.forEach(sub => {
      console.log(chalk.white(`   ${sub}`));
    });
    
    // 3. Check specifically for machine:startup:events subscribers
    console.log(chalk.cyan('\n3. Checking machine:startup:events subscribers...'));
    const machineChannelSubs = await redis.pubsub('numsub', 'machine:startup:events');
    console.log(chalk.gray(`machine:startup:events subscribers: ${machineChannelSubs[1]}`));
    
    if (machineChannelSubs[1] > 0) {
      console.log(chalk.green('✅ API server IS subscribed to machine:startup:events'));
    } else {
      console.log(chalk.red('❌ API server is NOT subscribed to machine:startup:events'));
    }
    
    // 4. Publish a test event and see if it gets processed
    console.log(chalk.cyan('\n4. Publishing test event to machine:startup:events...'));
    
    const testEvent = {
      worker_id: 'debug-test-worker',
      event_type: 'startup_begin',
      timestamp: new Date().toISOString(),
      startup_time: Date.now(),
      machine_config: {
        machine_id: 'debug-test-machine',
        hostname: 'debug-host',
        cpu_cores: 4,
        ram_gb: 8,
        gpu_count: 1,
        gpu_model: 'Test GPU',
        services: ['test-service']
      }
    };
    
    const publishResult = await redis.publish('machine:startup:events', JSON.stringify(testEvent));
    console.log(chalk.green(`✅ Published test event (${publishResult} subscribers received)`));
    
    // 5. Subscribe to see if we can receive events
    console.log(chalk.cyan('\n5. Testing direct subscription to machine:startup:events...'));
    
    const subscriber = new Redis(REDIS_URL);
    let receivedEvent = false;
    
    subscriber.subscribe('machine:startup:events');
    
    subscriber.on('message', (channel, message) => {
      if (channel === 'machine:startup:events') {
        receivedEvent = true;
        const event = JSON.parse(message);
        console.log(chalk.green(`✅ Received event: ${event.event_type} from ${event.worker_id}`));
      }
    });
    
    // Publish another test event
    setTimeout(async () => {
      await redis.publish('machine:startup:events', JSON.stringify({
        ...testEvent,
        worker_id: 'debug-test-worker-2',
        event_type: 'startup_step',
        step_name: 'test-step'
      }));
    }, 1000);
    
    // Wait for subscription test
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (receivedEvent) {
      console.log(chalk.green('✅ Direct subscription works - Redis pub/sub is functional'));
    } else {
      console.log(chalk.red('❌ Direct subscription failed - Redis pub/sub issue'));
    }
    
    subscriber.disconnect();
    
    console.log(chalk.blue('\n═'.repeat(50)));
    console.log(chalk.blue.bold('🎯 DIAGNOSIS'));
    console.log(chalk.blue('═'.repeat(50)));
    
    if (machineChannelSubs[1] > 0) {
      console.log(chalk.green('✅ API server Redis subscription is active'));
      console.log(chalk.yellow('⚠️  If monitor not showing events, check EventBroadcaster'));
    } else {
      console.log(chalk.red('❌ API server Redis subscription is MISSING'));
      console.log(chalk.red('   API server may not be properly initialized'));
      console.log(chalk.red('   Check API server logs for Redis connection errors'));
    }
    
  } catch (error) {
    console.log(chalk.red('❌ Error debugging API subscription:'));
    console.log(chalk.red(`   ${error.message}`));
  } finally {
    redis.disconnect();
  }
}

debugApiSubscription();