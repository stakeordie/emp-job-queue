#!/usr/bin/env node

/**
 * Debug Current Machine Events
 * 
 * Checks the actual machine events being published by the running basic-machine
 */

import Redis from 'ioredis';
import chalk from 'chalk';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

console.log(chalk.blue.bold('🔍 CURRENT MACHINE EVENTS DEBUG'));
console.log(chalk.blue('═'.repeat(50)));
console.log(chalk.gray(`Redis: ${REDIS_URL}`));
console.log('');

async function debugCurrentMachineEvents() {
  try {
    // 1. Get the most recent machine events
    console.log(chalk.cyan('1. Getting most recent machine events...'));
    
    const redis = new Redis(REDIS_URL);
    const machineKeys = await redis.keys('machine:startup:*');
    
    if (machineKeys.length === 0) {
      console.log(chalk.red('❌ No machine events found'));
      return;
    }
    
    // Sort by timestamp (last part of key)
    const sortedKeys = machineKeys.sort();
    const recentKeys = sortedKeys.slice(-10); // Last 10 events
    
    console.log(chalk.green(`✅ Found ${machineKeys.length} total events, showing last 10:`));
    
    // 2. Examine the structure of recent events
    console.log(chalk.cyan('\n2. Examining recent event structures...'));
    
    for (const key of recentKeys) {
      const eventData = await redis.get(key);
      const event = JSON.parse(eventData);
      
      console.log(chalk.yellow(`\n🔑 ${key}`));
      console.log(chalk.white(`   Event Type: ${event.event_type}`));
      console.log(chalk.white(`   Worker ID: ${event.worker_id}`));
      console.log(chalk.white(`   Timestamp: ${event.timestamp}`));
      
      if (event.machine_config) {
        console.log(chalk.green(`   ✅ machine_config exists:`));
        console.log(chalk.green(`      machine_id: ${event.machine_config.machine_id}`));
        console.log(chalk.green(`      hostname: ${event.machine_config.hostname}`));
        console.log(chalk.green(`      cpu_cores: ${event.machine_config.cpu_cores}`));
        console.log(chalk.green(`      ram_gb: ${event.machine_config.ram_gb}`));
        console.log(chalk.green(`      gpu_count: ${event.machine_config.gpu_count}`));
      } else {
        console.log(chalk.red(`   ❌ machine_config is MISSING`));
      }
    }
    
    // 3. Subscribe to live events for a few seconds
    console.log(chalk.cyan('\n3. Subscribing to live machine events...'));
    
    const subscriber = new Redis(REDIS_URL);
    let liveEventCount = 0;
    
    subscriber.subscribe('machine:startup:events');
    
    subscriber.on('message', (channel, message) => {
      if (channel === 'machine:startup:events') {
        liveEventCount++;
        const event = JSON.parse(message);
        
        console.log(chalk.yellow(`\n📨 Live Event #${liveEventCount}: ${event.event_type}`));
        console.log(chalk.white(`   Worker ID: ${event.worker_id}`));
        
        if (event.machine_config) {
          console.log(chalk.green(`   ✅ machine_config.machine_id: ${event.machine_config.machine_id}`));
        } else {
          console.log(chalk.red(`   ❌ machine_config is MISSING`));
        }
      }
    });
    
    console.log(chalk.cyan('   Listening for 10 seconds...'));
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    subscriber.disconnect();
    
    console.log(chalk.blue('\n═'.repeat(50)));
    console.log(chalk.blue.bold('🎯 CURRENT EVENT ANALYSIS'));
    console.log(chalk.blue('═'.repeat(50)));
    
    const hasRecentEvents = recentKeys.length > 0;
    const recentEvent = hasRecentEvents ? JSON.parse(await redis.get(recentKeys[recentKeys.length - 1])) : null;
    const hasMachineConfig = recentEvent?.machine_config?.machine_id;
    
    console.log(chalk.cyan(`Recent events found: ${recentKeys.length}`));
    console.log(chalk.cyan(`Live events received: ${liveEventCount}`));
    
    if (hasMachineConfig) {
      console.log(chalk.green('✅ Recent events HAVE machine_config with machine_id'));
      console.log(chalk.green(`   Latest machine_id: ${recentEvent.machine_config.machine_id}`));
      console.log(chalk.green('   The fix is working - events should be processed correctly'));
    } else {
      console.log(chalk.red('❌ Recent events are MISSING machine_config'));
      console.log(chalk.red('   API server cannot extract machine_id from events'));
    }
    
    if (liveEventCount > 0) {
      console.log(chalk.green('✅ Live events are being published'));
    } else {
      console.log(chalk.yellow('⚠️  No live events received (machine may not be running)'));
    }
    
    redis.disconnect();
    
  } catch (error) {
    console.log(chalk.red('❌ Error debugging current machine events:'));
    console.log(chalk.red(`   ${error.message}`));
  }
}

debugCurrentMachineEvents();