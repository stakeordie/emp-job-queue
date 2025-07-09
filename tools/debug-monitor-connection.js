#!/usr/bin/env node

/**
 * Debug Monitor Connection
 * 
 * Tests if monitors are properly connected to receive machine events
 */

import WebSocket from 'ws';
import chalk from 'chalk';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const WS_URL = process.env.WS_URL || 'wss://emp-job-queue-production.up.railway.app';
const WS_AUTH_TOKEN = process.env.WS_AUTH_TOKEN || '3u8sdj5389fj3kljsf90u';

console.log(chalk.blue.bold('🔍 MONITOR CONNECTION DEBUG'));
console.log(chalk.blue('═'.repeat(50)));
console.log(chalk.gray(`WebSocket: ${WS_URL}`));
console.log(chalk.gray(`Auth: ${WS_AUTH_TOKEN.substring(0, 8)}...`));
console.log('');

async function debugMonitorConnection() {
  try {
    // 1. Connect as monitor
    console.log(chalk.cyan('1. Connecting as monitor...'));
    const monitorId = `debug-monitor-${Date.now()}`;
    const ws = new WebSocket(`${WS_URL}/ws/monitor/${monitorId}?token=${WS_AUTH_TOKEN}`);
    
    let connected = false;
    let receivedMachineEvent = false;
    let eventCount = 0;
    
    ws.on('open', () => {
      connected = true;
      console.log(chalk.green('✅ Monitor WebSocket connected'));
      
      // Subscribe to all topics
      const subscribeMessage = {
        type: 'subscribe',
        topics: ['all'],
        id: `sub-${Date.now()}`
      };
      
      ws.send(JSON.stringify(subscribeMessage));
      console.log(chalk.cyan('📤 Sent subscription request for all topics'));
    });
    
    ws.on('message', (data) => {
      eventCount++;
      const message = JSON.parse(data.toString());
      
      console.log(chalk.yellow(`📨 Event #${eventCount}: ${message.type}`));
      
      if (message.type === 'machine_startup' || message.type === 'machine_startup_step') {
        receivedMachineEvent = true;
        console.log(chalk.green(`🎉 MACHINE EVENT RECEIVED: ${message.type}`));
        console.log(chalk.green(`   Machine ID: ${message.machine_id}`));
        if (message.type === 'machine_startup_step') {
          console.log(chalk.green(`   Step: ${message.step_name}`));
        }
      }
    });
    
    ws.on('error', (error) => {
      console.log(chalk.red(`❌ WebSocket error: ${error.message}`));
    });
    
    ws.on('close', () => {
      console.log(chalk.yellow('📪 WebSocket closed'));
    });
    
    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (!connected) {
      console.log(chalk.red('❌ Failed to connect to monitor WebSocket'));
      return;
    }
    
    // 2. Now publish some test events to trigger machine events
    console.log(chalk.cyan('\n2. Publishing test machine events...'));
    
    const Redis = (await import('ioredis')).default;
    const redis = new Redis(process.env.REDIS_URL);
    
    const testMachineEvent = {
      worker_id: 'debug-monitor-test-worker',
      event_type: 'startup_begin',
      timestamp: new Date().toISOString(),
      startup_time: Date.now(),
      machine_config: {
        machine_id: 'debug-monitor-test-machine',
        hostname: 'debug-host',
        cpu_cores: 4,
        ram_gb: 8,
        gpu_count: 1,
        gpu_model: 'Test GPU',
        services: ['test-service']
      }
    };
    
    await redis.publish('machine:startup:events', JSON.stringify(testMachineEvent));
    console.log(chalk.green('✅ Published startup_begin event'));
    
    // Wait a bit then publish a step event
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const stepEvent = {
      ...testMachineEvent,
      event_type: 'startup_step',
      step_name: 'test_step',
      elapsed_ms: 1000,
      step_data: { phase: 'core_infrastructure' }
    };
    
    await redis.publish('machine:startup:events', JSON.stringify(stepEvent));
    console.log(chalk.green('✅ Published startup_step event'));
    
    redis.disconnect();
    
    // 3. Wait for events to be received
    console.log(chalk.cyan('\n3. Waiting for machine events...'));
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log(chalk.blue('\n═'.repeat(50)));
    console.log(chalk.blue.bold('🎯 DIAGNOSIS'));
    console.log(chalk.blue('═'.repeat(50)));
    
    console.log(chalk.cyan(`Total events received: ${eventCount}`));
    
    if (receivedMachineEvent) {
      console.log(chalk.green('✅ Monitor IS receiving machine events'));
      console.log(chalk.green('   Machine event flow is working correctly'));
    } else {
      console.log(chalk.red('❌ Monitor is NOT receiving machine events'));
      console.log(chalk.red('   Problem is in EventBroadcaster or API processing'));
      console.log(chalk.yellow('   Check:'));
      console.log(chalk.yellow('   - handleMachineStartupEvent in API'));
      console.log(chalk.yellow('   - EventBroadcaster.broadcastMachineStartup'));
      console.log(chalk.yellow('   - Monitor subscription topics'));
    }
    
    ws.close();
    
  } catch (error) {
    console.log(chalk.red('❌ Error debugging monitor connection:'));
    console.log(chalk.red(`   ${error.message}`));
  }
}

debugMonitorConnection();