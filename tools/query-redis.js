#!/usr/bin/env node

/**
 * Query Redis for Machine Startup Events
 * 
 * Checks what machine startup events are stored in Redis
 */

import Redis from 'ioredis';
import chalk from 'chalk';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

console.log(chalk.blue.bold('🔍 REDIS QUERY - Machine Startup Events'));
console.log(chalk.blue('═'.repeat(50)));
console.log(chalk.gray(`Redis: ${REDIS_URL}`));
console.log('');

const redis = new Redis(REDIS_URL);

async function queryRedis() {
  try {
    console.log(chalk.yellow('📋 Querying Redis for machine startup events...'));
    
    // 1. Check for machine startup event keys
    console.log(chalk.cyan('\n1. Checking for machine startup keys:'));
    const machineKeys = await redis.keys('machine:startup:*');
    console.log(chalk.gray(`Found ${machineKeys.length} machine startup keys`));
    
    if (machineKeys.length > 0) {
      console.log(chalk.green('✅ Machine startup keys found:'));
      machineKeys.forEach(key => {
        console.log(chalk.green(`   ${key}`));
      });
      
      // Show content of first few keys
      console.log(chalk.cyan('\n📄 Content of recent events:'));
      const recentKeys = machineKeys.slice(-5); // Last 5 keys
      
      for (const key of recentKeys) {
        try {
          const content = await redis.get(key);
          const data = JSON.parse(content);
          console.log(chalk.yellow(`\n🔑 Key: ${key}`));
          console.log(chalk.white(`   Event: ${data.event_type}`));
          console.log(chalk.white(`   Worker: ${data.worker_id}`));
          console.log(chalk.white(`   Machine: ${data.machine_config?.machine_id || 'N/A'}`));
          console.log(chalk.white(`   Time: ${data.timestamp}`));
        } catch (error) {
          console.log(chalk.red(`   Error parsing: ${error.message}`));
        }
      }
    } else {
      console.log(chalk.red('❌ No machine startup keys found'));
    }
    
    // 2. Check for any worker startup keys (legacy)
    console.log(chalk.cyan('\n2. Checking for legacy worker startup keys:'));
    const workerKeys = await redis.keys('worker:startup:*');
    console.log(chalk.gray(`Found ${workerKeys.length} worker startup keys`));
    
    if (workerKeys.length > 0) {
      console.log(chalk.yellow('⚠️  Legacy worker startup keys found:'));
      workerKeys.slice(-3).forEach(key => {
        console.log(chalk.yellow(`   ${key}`));
      });
    }
    
    // 3. Check Redis info
    console.log(chalk.cyan('\n3. Redis connection info:'));
    const info = await redis.info('server');
    const lines = info.split('\n');
    const relevantLines = lines.filter(line => 
      line.includes('redis_version') || 
      line.includes('connected_clients') ||
      line.includes('used_memory_human')
    );
    relevantLines.forEach(line => {
      if (line.trim()) {
        console.log(chalk.gray(`   ${line.trim()}`));
      }
    });
    
    // 4. Check for any recent pub/sub activity
    console.log(chalk.cyan('\n4. Checking pub/sub channels:'));
    const channels = await redis.pubsub('channels');
    console.log(chalk.gray(`Active channels: ${channels.length}`));
    if (channels.length > 0) {
      channels.forEach(channel => {
        console.log(chalk.green(`   ${channel}`));
      });
    }
    
    // 5. Summary
    console.log(chalk.blue('\n═'.repeat(50)));
    console.log(chalk.blue.bold('📊 SUMMARY'));
    console.log(chalk.blue('═'.repeat(50)));
    
    if (machineKeys.length > 0) {
      console.log(chalk.green(`✅ Found ${machineKeys.length} machine startup events`));
      console.log(chalk.green('   basic_machine IS writing to Redis'));
      console.log(chalk.green('   Problem is likely in API server processing'));
    } else {
      console.log(chalk.red('❌ No machine startup events found'));
      console.log(chalk.red('   basic_machine is NOT writing to Redis'));
      console.log(chalk.red('   Check basic_machine Redis connection'));
    }
    
    if (workerKeys.length > 0) {
      console.log(chalk.yellow(`⚠️  Found ${workerKeys.length} legacy worker events`));
      console.log(chalk.yellow('   Old events from before channel rename'));
    }
    
  } catch (error) {
    console.log(chalk.red('❌ Error querying Redis:'));
    console.log(chalk.red(`   ${error.message}`));
  } finally {
    redis.disconnect();
  }
}

queryRedis();