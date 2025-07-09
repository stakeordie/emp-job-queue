#!/usr/bin/env node

/**
 * Debug Machine Config Structure
 * 
 * Examines the exact structure of machine_config in Redis events
 */

import Redis from 'ioredis';
import chalk from 'chalk';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

console.log(chalk.blue.bold('🔍 MACHINE CONFIG DEBUG'));
console.log(chalk.blue('═'.repeat(50)));
console.log(chalk.gray(`Redis: ${REDIS_URL}`));
console.log('');

const redis = new Redis(REDIS_URL);

async function debugMachineConfig() {
  try {
    // Get all machine startup keys
    const machineKeys = await redis.keys('machine:startup:*');
    console.log(chalk.cyan(`Found ${machineKeys.length} machine startup events`));
    
    if (machineKeys.length === 0) {
      console.log(chalk.red('❌ No machine startup events found'));
      return;
    }
    
    // Get the most recent event
    const recentKey = machineKeys[machineKeys.length - 1];
    console.log(chalk.yellow(`\n🔑 Examining most recent event: ${recentKey}`));
    
    const eventData = await redis.get(recentKey);
    const event = JSON.parse(eventData);
    
    console.log(chalk.cyan('\n📋 Full Event Structure:'));
    console.log(JSON.stringify(event, null, 2));
    
    console.log(chalk.cyan('\n🏭 Machine Config Analysis:'));
    console.log(chalk.white(`Event Type: ${event.event_type}`));
    console.log(chalk.white(`Worker ID: ${event.worker_id}`));
    console.log(chalk.white(`Timestamp: ${event.timestamp}`));
    
    if (event.machine_config) {
      console.log(chalk.green('\n✅ machine_config exists:'));
      console.log(chalk.white(`  machine_id: ${event.machine_config.machine_id}`));
      console.log(chalk.white(`  hostname: ${event.machine_config.hostname}`));
      console.log(chalk.white(`  cpu_cores: ${event.machine_config.cpu_cores}`));
      console.log(chalk.white(`  ram_gb: ${event.machine_config.ram_gb}`));
      console.log(chalk.white(`  gpu_count: ${event.machine_config.gpu_count}`));
      console.log(chalk.white(`  gpu_memory: ${event.machine_config.gpu_memory}`));
      console.log(chalk.white(`  gpu_model: ${event.machine_config.gpu_model}`));
      console.log(chalk.white(`  services: ${JSON.stringify(event.machine_config.services)}`));
    } else {
      console.log(chalk.red('❌ machine_config is missing!'));
    }
    
    // Check several more events to see if this is consistent
    console.log(chalk.cyan('\n📊 Checking last 5 events for consistency:'));
    const lastFiveKeys = machineKeys.slice(-5);
    
    for (const key of lastFiveKeys) {
      const data = await redis.get(key);
      const evt = JSON.parse(data);
      const machineId = evt.machine_config?.machine_id || 'MISSING';
      const eventType = evt.event_type;
      console.log(chalk.white(`  ${eventType}: machine_id = ${machineId}`));
    }
    
    // Check if machine_config is being serialized correctly
    console.log(chalk.cyan('\n🔬 Serialization Test:'));
    const testConfig = {
      machine_id: 'test-machine-001',
      hostname: 'test-host',
      cpu_cores: 8,
      ram_gb: 16
    };
    
    const serialized = JSON.stringify(testConfig);
    const deserialized = JSON.parse(serialized);
    
    console.log(chalk.white(`Original: ${JSON.stringify(testConfig)}`));
    console.log(chalk.white(`Serialized: ${serialized}`));
    console.log(chalk.white(`Deserialized machine_id: ${deserialized.machine_id}`));
    
    console.log(chalk.blue('\n═'.repeat(50)));
    console.log(chalk.blue.bold('🎯 DIAGNOSIS'));
    console.log(chalk.blue('═'.repeat(50)));
    
    if (event.machine_config && event.machine_config.machine_id) {
      console.log(chalk.green('✅ machine_config.machine_id IS present in Redis'));
      console.log(chalk.green('   Problem must be in API server processing'));
    } else {
      console.log(chalk.red('❌ machine_config.machine_id is MISSING from Redis'));
      console.log(chalk.red('   Problem is in basic_machine event publishing'));
    }
    
  } catch (error) {
    console.log(chalk.red('❌ Error debugging machine config:'));
    console.log(chalk.red(`   ${error.message}`));
  } finally {
    redis.disconnect();
  }
}

debugMachineConfig();