#!/usr/bin/env node

/**
 * Trigger Machine Event and Listen for API Response
 * 
 * Publishes a machine event and monitors for API processing
 */

import Redis from 'ioredis';
import chalk from 'chalk';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

console.log(chalk.blue.bold('🔍 TRIGGER MACHINE EVENT TEST'));
console.log(chalk.blue('═'.repeat(50)));
console.log(chalk.gray(`Redis: ${REDIS_URL}`));
console.log('');

async function triggerMachineEvent() {
  try {
    console.log(chalk.cyan('1. Publishing test machine event...'));
    
    const redis = new Redis(REDIS_URL);
    
    const testEvent = {
      worker_id: 'test-trigger-worker',
      event_type: 'startup_begin',
      timestamp: new Date().toISOString(),
      startup_time: Date.now(),
      machine_config: {
        machine_id: 'test-trigger-machine',
        hostname: 'test-host',
        cpu_cores: 4,
        ram_gb: 8,
        gpu_count: 1,
        gpu_model: 'Test GPU',
        services: ['test-service']
      }
    };
    
    const result = await redis.publish('machine:startup:events', JSON.stringify(testEvent));
    console.log(chalk.green(`✅ Published test event (${result} subscribers received)`));
    
    console.log(chalk.cyan('\n2. Event details:'));
    console.log(chalk.white(`   Event Type: ${testEvent.event_type}`));
    console.log(chalk.white(`   Worker ID: ${testEvent.worker_id}`));
    console.log(chalk.white(`   Machine ID: ${testEvent.machine_config.machine_id}`));
    
    console.log(chalk.cyan('\n3. If API is processing this event, you should see:'));
    console.log(chalk.yellow('   - In API logs: "🏭 Processing machine event for: test-trigger-machine"'));
    console.log(chalk.yellow('   - In API logs: "🧪 Sent Hello World test message to monitors"'));
    console.log(chalk.yellow('   - In API logs: "🚀 Broadcasting machine startup for: test-trigger-machine"'));
    
    redis.disconnect();
    
    console.log(chalk.blue('\n═'.repeat(50)));
    console.log(chalk.green('✅ Test event published successfully'));
    console.log(chalk.cyan('Check Railway API logs to see if event was processed'));
    
  } catch (error) {
    console.log(chalk.red('❌ Error triggering machine event:'));
    console.log(chalk.red(`   ${error.message}`));
  }
}

triggerMachineEvent();