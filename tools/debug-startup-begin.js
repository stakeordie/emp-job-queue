#!/usr/bin/env node

/**
 * Debug Startup Begin Events
 * 
 * Find and examine startup_begin events specifically
 */

import Redis from 'ioredis';
import chalk from 'chalk';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

console.log(chalk.blue.bold('🔍 STARTUP BEGIN DEBUG'));
console.log(chalk.blue('═'.repeat(50)));
console.log(chalk.gray(`Redis: ${REDIS_URL}`));
console.log('');

const redis = new Redis(REDIS_URL);

async function debugStartupBegin() {
  try {
    // Get all machine startup keys
    const machineKeys = await redis.keys('machine:startup:*');
    console.log(chalk.cyan(`Found ${machineKeys.length} total machine startup events`));
    
    // Filter for startup_begin events
    const startupBeginKeys = [];
    for (const key of machineKeys) {
      if (key.includes('startup_begin')) {
        startupBeginKeys.push(key);
      }
    }
    
    console.log(chalk.cyan(`Found ${startupBeginKeys.length} startup_begin events`));
    
    if (startupBeginKeys.length === 0) {
      console.log(chalk.red('❌ No startup_begin events found'));
      return;
    }
    
    // Examine the most recent startup_begin event
    const recentKey = startupBeginKeys[startupBeginKeys.length - 1];
    console.log(chalk.yellow(`\n🔑 Examining most recent startup_begin: ${recentKey}`));
    
    const eventData = await redis.get(recentKey);
    const event = JSON.parse(eventData);
    
    console.log(chalk.cyan('\n📋 Full startup_begin Event Structure:'));
    console.log(JSON.stringify(event, null, 2));
    
    console.log(chalk.cyan('\n🏭 Machine Config in startup_begin:'));
    if (event.machine_config) {
      console.log(chalk.green('✅ machine_config exists in startup_begin:'));
      console.log(chalk.white(`  machine_id: ${event.machine_config.machine_id}`));
      console.log(chalk.white(`  hostname: ${event.machine_config.hostname}`));
      console.log(chalk.white(`  cpu_cores: ${event.machine_config.cpu_cores}`));
      console.log(chalk.white(`  ram_gb: ${event.machine_config.ram_gb}`));
      console.log(chalk.white(`  gpu_count: ${event.machine_config.gpu_count}`));
      console.log(chalk.white(`  services: ${JSON.stringify(event.machine_config.services)}`));
    } else {
      console.log(chalk.red('❌ machine_config is missing from startup_begin!'));
    }
    
    console.log(chalk.blue('\n═'.repeat(50)));
    console.log(chalk.blue.bold('🎯 DIAGNOSIS'));
    console.log(chalk.blue('═'.repeat(50)));
    
    if (event.machine_config && event.machine_config.machine_id) {
      console.log(chalk.green('✅ machine_config.machine_id IS in startup_begin events'));
      console.log(chalk.yellow('⚠️  But machine_config is missing from startup_step events'));
      console.log(chalk.cyan('💡 Solution: Add machine_config to all event types'));
    } else {
      console.log(chalk.red('❌ machine_config.machine_id is missing from startup_begin'));
    }
    
  } catch (error) {
    console.log(chalk.red('❌ Error debugging startup_begin:'));
    console.log(chalk.red(`   ${error.message}`));
  } finally {
    redis.disconnect();
  }
}

debugStartupBegin();