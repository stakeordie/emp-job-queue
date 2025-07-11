#!/usr/bin/env node

/**
 * API Server Event Flow Debugger
 * 
 * Monitors the API server's event processing pipeline to identify bottlenecks
 * and failures in the event broadcasting system.
 */

import Redis from 'ioredis';
import chalk from 'chalk';
import WebSocket from 'ws';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const API_URL = process.env.API_URL || 'ws://localhost:3001';
const AUTH_TOKEN = process.env.WS_AUTH_TOKEN || '3u8sdj5389fj3kljsf90u';

console.log(chalk.blue.bold('🔍 API Server Event Flow Debugger'));
console.log(chalk.gray(`Redis: ${REDIS_URL}`));
console.log(chalk.gray(`API: ${API_URL}`));

// Test Redis connection
const redis = new Redis(REDIS_URL);
let redisConnected = false;

redis.on('connect', () => {
  redisConnected = true;
  console.log(chalk.green('✅ Redis connection: OK'));
});

redis.on('error', (error) => {
  console.log(chalk.red('❌ Redis connection: FAILED'));
  console.log(chalk.red(`   Error: ${error.message}`));
});

// Test API WebSocket connection  
const monitorId = `debug-monitor-${Date.now()}`;
const wsUrl = `${API_URL}/ws/monitor/${monitorId}?token=${AUTH_TOKEN}`;

console.log(chalk.cyan(`🔗 Connecting to API as monitor: ${wsUrl}`));

let ws;
let wsConnected = false;
let receivedEvents = 0;

try {
  ws = new WebSocket(wsUrl);
  
  ws.on('open', () => {
    wsConnected = true;
    console.log(chalk.green('✅ WebSocket connection: OK'));
    
    // Subscribe to all topics
    ws.send(JSON.stringify({
      type: 'subscribe',
      topics: ['workers', 'jobs', 'machines', 'system'],
      timestamp: Date.now()
    }));
    
    console.log(chalk.blue('📡 Subscribed to all topics'));
  });
  
  ws.on('message', (data) => {
    receivedEvents++;
    
    try {
      const event = JSON.parse(data);
      
      console.log(chalk.yellow('\n' + '─'.repeat(60)));
      console.log(chalk.yellow.bold(`📨 API EVENT #${receivedEvents}`));
      console.log(chalk.yellow('─'.repeat(60)));
      
      // Color code by event type
      let color = chalk.white;
      if (event.type?.includes('machine')) {
        color = chalk.cyan;
      } else if (event.type?.includes('worker')) {
        color = chalk.blue;
      } else if (event.type?.includes('job')) {
        color = chalk.green;
      }
      
      console.log(color(`🎯 Type: ${event.type}`));
      
      if (event.machine_id) {
        console.log(color(`🏭 Machine: ${event.machine_id}`));
      }
      if (event.worker_id) {
        console.log(color(`👷 Worker: ${event.worker_id}`));
      }
      if (event.step_name) {
        console.log(color(`📝 Step: ${event.step_name}`));
      }
      if (event.phase) {
        console.log(color(`🔄 Phase: ${event.phase}`));
      }
      
      console.log(chalk.gray(`⏰ ${new Date().toISOString()}`));
      
      // Show full event data in debug mode
      if (process.env.DEBUG === 'verbose') {
        console.log(color('\n📋 Full Event:'));
        console.log(color(JSON.stringify(event, null, 2)));
      }
      
    } catch (error) {
      console.log(chalk.red(`❌ Failed to parse WebSocket message: ${error.message}`));
      console.log(chalk.red(`Raw data: ${data}`));
    }
  });
  
  ws.on('close', (code, reason) => {
    wsConnected = false;
    console.log(chalk.red(`❌ WebSocket closed: ${code} ${reason}`));
  });
  
  ws.on('error', (error) => {
    console.log(chalk.red('❌ WebSocket error:'));
    console.log(chalk.red(`   ${error.message}`));
  });
  
} catch (error) {
  console.log(chalk.red('❌ Failed to create WebSocket connection:'));
  console.log(chalk.red(`   ${error.message}`));
}

// Test Redis publishing capability
async function testRedisPublish() {
  if (!redisConnected) {
    console.log(chalk.red('❌ Cannot test Redis publish - not connected'));
    return;
  }
  
  console.log(chalk.blue('\n🧪 Testing Redis publish capability...'));
  
  const testEvent = {
    worker_id: 'test-worker-debug',
    event_type: 'startup_begin',
    timestamp: new Date().toISOString(),
    machine_config: {
      machine_id: 'test-machine-debug',
      hostname: 'debug-host',
      cpu_cores: 4,
      ram_gb: 16,
      gpu_count: 1,
      services: ['test']
    }
  };
  
  try {
    await redis.publish('machine:startup:events', JSON.stringify(testEvent));
    console.log(chalk.green('✅ Test event published to machine:startup:events'));
  } catch (error) {
    console.log(chalk.red('❌ Failed to publish test event:'));
    console.log(chalk.red(`   ${error.message}`));
  }
}

// Status summary
function showStatus() {
  console.log(chalk.blue.bold('\n📊 CONNECTION STATUS'));
  console.log(chalk.blue('═'.repeat(40)));
  
  console.log(`Redis:     ${redisConnected ? chalk.green('✅ Connected') : chalk.red('❌ Disconnected')}`);
  console.log(`WebSocket: ${wsConnected ? chalk.green('✅ Connected') : chalk.red('❌ Disconnected')}`);
  console.log(`Events:    ${receivedEvents > 0 ? chalk.green(`✅ ${receivedEvents} received`) : chalk.red('❌ None received')}`);
  
  if (!redisConnected || !wsConnected) {
    console.log(chalk.yellow('\n⚠️  TROUBLESHOOTING:'));
    if (!redisConnected) {
      console.log(chalk.yellow('   • Check Redis server is running'));
      console.log(chalk.yellow('   • Verify REDIS_URL environment variable'));
    }
    if (!wsConnected) {
      console.log(chalk.yellow('   • Check API server is running'));
      console.log(chalk.yellow('   • Verify API_URL environment variable'));
      console.log(chalk.yellow('   • Check WS_AUTH_TOKEN is correct'));
    }
  }
  
  if (redisConnected && wsConnected && receivedEvents === 0) {
    console.log(chalk.yellow('\n⚠️  Connections OK but no events received:'));
    console.log(chalk.yellow('   • Check if basic_machine is running'));
    console.log(chalk.yellow('   • Verify API server is subscribing to Redis channels'));
    console.log(chalk.yellow('   • Check EventBroadcaster integration'));
  }
}

// Show status every 15 seconds
setInterval(showStatus, 15000);

// Test Redis publish after initial connection
setTimeout(testRedisPublish, 5000);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log(chalk.blue.bold('\n👋 Shutting down debugger...'));
  if (ws) ws.close();
  redis.disconnect();
  process.exit(0);
});

// Show initial status
setTimeout(showStatus, 2000);