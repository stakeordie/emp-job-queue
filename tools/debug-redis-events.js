#!/usr/bin/env node

/**
 * Redis Event Debugger
 * 
 * Monitors Redis channels to debug event flow in the job queue system.
 * Helps identify where events are being published and what data they contain.
 */

import Redis from 'ioredis';
import chalk from 'chalk';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

console.log(chalk.blue.bold('🔍 Redis Event Debugger'));
console.log(chalk.gray(`Connecting to Redis: ${REDIS_URL}`));

const subscriber = new Redis(REDIS_URL);

// Channels to monitor
const channels = [
  'machine:startup:events',
  'worker:startup:events', // Legacy channel (should be empty)
  'update_job_progress',
  'worker_status',
  'complete_job'
];

// Subscribe to all channels
channels.forEach(channel => {
  subscriber.subscribe(channel);
  console.log(chalk.green(`✅ Subscribed to: ${channel}`));
});

// Also monitor keyspace notifications for job and worker changes
subscriber.psubscribe('__keyspace@0__:job:*');
subscriber.psubscribe('__keyspace@0__:worker:*');
console.log(chalk.green('✅ Subscribed to keyspace notifications'));

let eventCount = 0;

subscriber.on('message', (channel, message) => {
  eventCount++;
  
  console.log(chalk.yellow('\n' + '='.repeat(80)));
  console.log(chalk.yellow.bold(`📨 EVENT #${eventCount} - Channel: ${channel}`));
  console.log(chalk.yellow('='.repeat(80)));
  
  try {
    const data = JSON.parse(message);
    
    // Color code based on event type
    let color = chalk.white;
    if (channel.includes('machine') || channel.includes('worker')) {
      color = chalk.cyan;
    } else if (channel.includes('job')) {
      color = chalk.green;
    } else if (channel.includes('progress')) {
      color = chalk.blue;
    }
    
    console.log(color('📋 Parsed Data:'));
    console.log(color(JSON.stringify(data, null, 2)));
    
    // Highlight important fields
    if (data.machine_id) {
      console.log(chalk.magenta.bold(`🏭 Machine ID: ${data.machine_id}`));
    }
    if (data.worker_id) {
      console.log(chalk.cyan.bold(`👷 Worker ID: ${data.worker_id}`));
    }
    if (data.event_type) {
      console.log(chalk.yellow.bold(`🎯 Event Type: ${data.event_type}`));
    }
    if (data.step_name) {
      console.log(chalk.blue.bold(`📝 Step: ${data.step_name}`));
    }
    
  } catch (error) {
    console.log(chalk.red('❌ Failed to parse JSON:'));
    console.log(chalk.red(message));
    console.log(chalk.red(`Error: ${error.message}`));
  }
  
  console.log(chalk.gray(`⏰ Timestamp: ${new Date().toISOString()}`));
});

subscriber.on('pmessage', (pattern, channel, event) => {
  eventCount++;
  
  console.log(chalk.yellow('\n' + '='.repeat(80)));
  console.log(chalk.yellow.bold(`🔔 KEYSPACE EVENT #${eventCount}`));
  console.log(chalk.yellow('='.repeat(80)));
  console.log(chalk.orange(`📡 Pattern: ${pattern}`));
  console.log(chalk.orange(`📍 Channel: ${channel}`));
  console.log(chalk.orange(`🎬 Event: ${event}`));
  console.log(chalk.gray(`⏰ Timestamp: ${new Date().toISOString()}`));
});

subscriber.on('connect', () => {
  console.log(chalk.green.bold('\n✅ Connected to Redis'));
  console.log(chalk.gray('Monitoring for events... Press Ctrl+C to stop\n'));
});

subscriber.on('error', (error) => {
  console.error(chalk.red.bold('❌ Redis Error:'), error);
});

// Display summary every 30 seconds
setInterval(() => {
  if (eventCount === 0) {
    console.log(chalk.red.bold('\n⚠️  No events received in the last 30 seconds'));
    console.log(chalk.red('   Check if:'));
    console.log(chalk.red('   1. basic_machine is running and publishing events'));
    console.log(chalk.red('   2. Redis connection is working'));
    console.log(chalk.red('   3. Events are being published to the correct channels'));
  } else {
    console.log(chalk.green.bold(`\n📊 Received ${eventCount} events in the last 30 seconds`));
    eventCount = 0;
  }
}, 30000);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log(chalk.blue.bold('\n👋 Shutting down Redis Event Debugger...'));
  subscriber.disconnect();
  process.exit(0);
});