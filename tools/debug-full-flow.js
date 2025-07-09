#!/usr/bin/env node

/**
 * Comprehensive Event Flow Debugger
 * 
 * Tests the entire event flow from Redis publish -> API server -> Monitor WebSocket
 * Helps identify exactly where the chain breaks in the machine event system.
 */

import Redis from 'ioredis';
import WebSocket from 'ws';
import chalk from 'chalk';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const API_URL = process.env.API_URL || 'ws://localhost:3001';
const AUTH_TOKEN = process.env.WS_AUTH_TOKEN || '3u8sdj5389fj3kljsf90u';

console.log(chalk.blue.bold('🔍 COMPREHENSIVE EVENT FLOW DEBUGGER'));
console.log(chalk.blue('═'.repeat(60)));
console.log(chalk.gray(`Redis:     ${REDIS_URL}`));
console.log(chalk.gray(`API:       ${API_URL}`));
console.log(chalk.gray(`Auth:      ${AUTH_TOKEN.substring(0, 8)}...`));
console.log('');

// Test Results
const results = {
  redisConnection: false,
  redisPublish: false,
  redisSubscribe: false,
  apiConnection: false,
  apiReceive: false,
  fullFlowTest: false
};

// Step 1: Test Redis Connection
console.log(chalk.yellow('🔵 STEP 1: Testing Redis Connection'));
const redis = new Redis(REDIS_URL);
const subscriber = new Redis(REDIS_URL);

redis.on('connect', () => {
  results.redisConnection = true;
  console.log(chalk.green('✅ Redis connection: SUCCESS'));
  testRedisPublish();
});

redis.on('error', (error) => {
  console.log(chalk.red('❌ Redis connection: FAILED'));
  console.log(chalk.red(`   Error: ${error.message}`));
  showResults();
});

// Step 2: Test Redis Publish
async function testRedisPublish() {
  console.log(chalk.yellow('\n🔵 STEP 2: Testing Redis Publish'));
  
  try {
    const testEvent = {
      worker_id: 'debug-worker-001',
      event_type: 'startup_begin',
      timestamp: new Date().toISOString(),
      machine_config: {
        machine_id: 'debug-machine-001',
        hostname: 'debug-host',
        cpu_cores: 4,
        ram_gb: 16,
        gpu_count: 1,
        services: ['test']
      }
    };
    
    await redis.publish('machine:startup:events', JSON.stringify(testEvent));
    results.redisPublish = true;
    console.log(chalk.green('✅ Redis publish: SUCCESS'));
    testRedisSubscribe();
    
  } catch (error) {
    console.log(chalk.red('❌ Redis publish: FAILED'));
    console.log(chalk.red(`   Error: ${error.message}`));
    showResults();
  }
}

// Step 3: Test Redis Subscribe
function testRedisSubscribe() {
  console.log(chalk.yellow('\n🔵 STEP 3: Testing Redis Subscribe'));
  
  let subscribeTimer;
  
  subscriber.subscribe('machine:startup:events');
  
  subscriber.on('message', (channel, message) => {
    if (channel === 'machine:startup:events') {
      clearTimeout(subscribeTimer);
      results.redisSubscribe = true;
      console.log(chalk.green('✅ Redis subscribe: SUCCESS'));
      console.log(chalk.gray(`   Received: ${message.substring(0, 50)}...`));
      testAPIConnection();
    }
  });
  
  // Publish test message after subscribing
  setTimeout(async () => {
    try {
      const testMsg = {
        worker_id: 'subscribe-test',
        event_type: 'startup_step',
        step_name: 'test-subscribe',
        timestamp: new Date().toISOString(),
        machine_config: { machine_id: 'test-machine' }
      };
      await redis.publish('machine:startup:events', JSON.stringify(testMsg));
    } catch (error) {
      console.log(chalk.red('❌ Failed to publish test message for subscribe test'));
    }
  }, 1000);
  
  // Timeout after 5 seconds
  subscribeTimer = setTimeout(() => {
    console.log(chalk.red('❌ Redis subscribe: TIMEOUT'));
    console.log(chalk.red('   No messages received within 5 seconds'));
    testAPIConnection(); // Continue anyway
  }, 5000);
}

// Step 4: Test API WebSocket Connection
function testAPIConnection() {
  console.log(chalk.yellow('\n🔵 STEP 4: Testing API WebSocket Connection'));
  
  const monitorId = `debug-monitor-${Date.now()}`;
  const wsUrl = `${API_URL}/ws/monitor/${monitorId}?token=${AUTH_TOKEN}`;
  
  try {
    const ws = new WebSocket(wsUrl);
    let connectionTimer;
    
    ws.on('open', () => {
      clearTimeout(connectionTimer);
      results.apiConnection = true;
      console.log(chalk.green('✅ API WebSocket connection: SUCCESS'));
      
      // Subscribe to all topics
      ws.send(JSON.stringify({
        type: 'subscribe',
        topics: ['workers', 'jobs', 'machines', 'system'],
        timestamp: Date.now()
      }));
      
      testAPIReceive(ws);
    });
    
    ws.on('error', (error) => {
      clearTimeout(connectionTimer);
      console.log(chalk.red('❌ API WebSocket connection: FAILED'));
      console.log(chalk.red(`   Error: ${error.message}`));
      showResults();
    });
    
    connectionTimer = setTimeout(() => {
      console.log(chalk.red('❌ API WebSocket connection: TIMEOUT'));
      showResults();
    }, 10000);
    
  } catch (error) {
    console.log(chalk.red('❌ API WebSocket connection: FAILED'));
    console.log(chalk.red(`   Error: ${error.message}`));
    showResults();
  }
}

// Step 5: Test API Event Receive
function testAPIReceive(ws) {
  console.log(chalk.yellow('\n🔵 STEP 5: Testing API Event Reception'));
  
  let receiveTimer;
  let eventCount = 0;
  
  ws.on('message', (data) => {
    eventCount++;
    
    try {
      const event = JSON.parse(data);
      
      if (event.type?.includes('machine')) {
        clearTimeout(receiveTimer);
        results.apiReceive = true;
        console.log(chalk.green('✅ API event reception: SUCCESS'));
        console.log(chalk.gray(`   Event type: ${event.type}`));
        console.log(chalk.gray(`   Machine ID: ${event.machine_id || 'N/A'}`));
        
        testFullFlow(ws);
        return;
      }
      
      console.log(chalk.cyan(`📨 Received event #${eventCount}: ${event.type || 'unknown'}`));
      
    } catch (error) {
      console.log(chalk.red(`❌ Failed to parse WebSocket message: ${error.message}`));
    }
  });
  
  // Publish test event after setting up listener
  setTimeout(async () => {
    try {
      const testEvent = {
        worker_id: 'api-test-worker',
        event_type: 'startup_begin',
        timestamp: new Date().toISOString(),
        machine_config: {
          machine_id: 'api-test-machine',
          hostname: 'api-test-host',
          cpu_cores: 2,
          ram_gb: 8,
          gpu_count: 1
        }
      };
      
      console.log(chalk.blue('📤 Publishing test event to trigger API processing...'));
      await redis.publish('machine:startup:events', JSON.stringify(testEvent));
      
    } catch (error) {
      console.log(chalk.red('❌ Failed to publish API test event'));
    }
  }, 2000);
  
  // Timeout after 15 seconds
  receiveTimer = setTimeout(() => {
    console.log(chalk.red('❌ API event reception: TIMEOUT'));
    console.log(chalk.red(`   Received ${eventCount} events but no machine events`));
    if (eventCount > 0) {
      console.log(chalk.yellow('   ⚠️  API is receiving events but not machine events'));
      console.log(chalk.yellow('      Check if API is subscribing to machine:startup:events'));
      console.log(chalk.yellow('      Check handleMachineStartupEvent processing'));
    }
    showResults();
  }, 15000);
}

// Step 6: Full Flow Test
async function testFullFlow(ws) {
  console.log(chalk.yellow('\n🔵 STEP 6: Testing Full Event Flow'));
  
  let flowTimer;
  let receivedFullFlowEvent = false;
  
  ws.on('message', (data) => {
    try {
      const event = JSON.parse(data);
      if (event.machine_id === 'full-flow-test-machine') {
        clearTimeout(flowTimer);
        results.fullFlowTest = true;
        receivedFullFlowEvent = true;
        console.log(chalk.green('✅ Full flow test: SUCCESS'));
        console.log(chalk.green('🎉 ENTIRE EVENT CHAIN IS WORKING!'));
        showResults();
      }
    } catch (error) {
      // Ignore parse errors for this test
    }
  });
  
  // Publish comprehensive test event
  setTimeout(async () => {
    try {
      const fullFlowEvent = {
        worker_id: 'full-flow-test-worker',
        event_type: 'startup_complete',
        timestamp: new Date().toISOString(),
        total_startup_time_ms: 5000,
        machine_config: {
          machine_id: 'full-flow-test-machine',
          hostname: 'full-flow-host',
          cpu_cores: 8,
          ram_gb: 32,
          gpu_count: 2,
          services: ['comfyui', 'a1111']
        }
      };
      
      console.log(chalk.blue('📤 Publishing full flow test event...'));
      await redis.publish('machine:startup:events', JSON.stringify(fullFlowEvent));
      
    } catch (error) {
      console.log(chalk.red('❌ Failed to publish full flow test event'));
      showResults();
    }
  }, 1000);
  
  // Timeout after 10 seconds
  flowTimer = setTimeout(() => {
    if (!receivedFullFlowEvent) {
      console.log(chalk.red('❌ Full flow test: TIMEOUT'));
      console.log(chalk.red('   Published event but didn\'t receive it back through API'));
    }
    showResults();
  }, 10000);
}

// Show final results
function showResults() {
  console.log(chalk.blue('\n' + '═'.repeat(60)));
  console.log(chalk.blue.bold('📊 DIAGNOSTIC RESULTS'));
  console.log(chalk.blue('═'.repeat(60)));
  
  Object.entries(results).forEach(([test, passed]) => {
    const icon = passed ? '✅' : '❌';
    const color = passed ? chalk.green : chalk.red;
    const status = passed ? 'PASS' : 'FAIL';
    console.log(color(`${icon} ${test.padEnd(20)} ${status}`));
  });
  
  console.log('');
  
  // Recommendations
  if (!results.redisConnection) {
    console.log(chalk.red('🔧 REDIS CONNECTION FAILED:'));
    console.log(chalk.red('   • Check if Redis server is running'));
    console.log(chalk.red('   • Verify REDIS_URL environment variable'));
    console.log(chalk.red('   • Check network connectivity'));
  }
  
  if (results.redisConnection && !results.redisPublish) {
    console.log(chalk.red('🔧 REDIS PUBLISH FAILED:'));
    console.log(chalk.red('   • Check Redis permissions'));
    console.log(chalk.red('   • Verify Redis configuration allows PUBLISH'));
  }
  
  if (results.redisPublish && !results.redisSubscribe) {
    console.log(chalk.red('🔧 REDIS SUBSCRIBE FAILED:'));
    console.log(chalk.red('   • Check if multiple Redis instances are running'));
    console.log(chalk.red('   • Verify channel name consistency'));
  }
  
  if (results.redisSubscribe && !results.apiConnection) {
    console.log(chalk.red('🔧 API CONNECTION FAILED:'));
    console.log(chalk.red('   • Check if API server is running'));
    console.log(chalk.red('   • Verify API_URL environment variable'));
    console.log(chalk.red('   • Check WS_AUTH_TOKEN is correct'));
    console.log(chalk.red('   • Verify API server WebSocket endpoint'));
  }
  
  if (results.apiConnection && !results.apiReceive) {
    console.log(chalk.red('🔧 API EVENT PROCESSING FAILED:'));
    console.log(chalk.red('   • Check API server Redis subscription'));
    console.log(chalk.red('   • Verify machine:startup:events channel subscription'));
    console.log(chalk.red('   • Check handleMachineStartupEvent method'));
    console.log(chalk.red('   • Verify EventBroadcaster integration'));
  }
  
  if (results.apiReceive && !results.fullFlowTest) {
    console.log(chalk.yellow('🔧 PARTIAL SUCCESS:'));
    console.log(chalk.yellow('   • Basic events work but full flow may have issues'));
    console.log(chalk.yellow('   • Check event processing consistency'));
  }
  
  if (results.fullFlowTest) {
    console.log(chalk.green('🎉 EVERYTHING IS WORKING!'));
    console.log(chalk.green('   • Redis publish/subscribe: OK'));
    console.log(chalk.green('   • API server processing: OK'));
    console.log(chalk.green('   • EventBroadcaster: OK'));
    console.log(chalk.green('   • WebSocket delivery: OK'));
    console.log(chalk.green(''));
    console.log(chalk.green('   If monitor UI still not working, check:'));
    console.log(chalk.green('   • Monitor UI WebSocket connection'));
    console.log(chalk.green('   • Monitor event handling in React store'));
    console.log(chalk.green('   • Browser console for errors'));
  }
  
  cleanup();
}

function cleanup() {
  console.log(chalk.gray('\n👋 Cleaning up connections...'));
  if (redis) redis.disconnect();
  if (subscriber) subscriber.disconnect();
  process.exit(results.fullFlowTest ? 0 : 1);
}

// Handle interruption
process.on('SIGINT', () => {
  console.log(chalk.blue('\n\n👋 Test interrupted by user'));
  cleanup();
});