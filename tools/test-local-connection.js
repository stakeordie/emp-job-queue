#!/usr/bin/env node

/**
 * Test Local Monitor Connection
 * 
 * Tests monitor connection to local API server
 */

import WebSocket from 'ws';
import chalk from 'chalk';

const WS_URL = 'ws://localhost:3331';
const WS_AUTH_TOKEN = '3u8sdj5389fj3kljsf90u';

console.log(chalk.blue.bold('🔍 LOCAL MONITOR CONNECTION TEST'));
console.log(chalk.blue('═'.repeat(50)));
console.log(chalk.gray(`WebSocket: ${WS_URL}`));
console.log('');

async function testLocalConnection() {
  try {
    console.log(chalk.cyan('1. Connecting to local API server...'));
    const monitorId = `debug-monitor-${Date.now()}`;
    const ws = new WebSocket(`${WS_URL}/ws/monitor/${monitorId}?token=${WS_AUTH_TOKEN}`);
    
    let connected = false;
    let eventCount = 0;
    
    ws.on('open', () => {
      connected = true;
      console.log(chalk.green('✅ Local Monitor WebSocket connected'));
      
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
      
      if (message.message && message.message.includes('Hello World')) {
        console.log(chalk.green(`🎉 HELLO WORLD MESSAGE RECEIVED!`));
        console.log(chalk.green(`   Message: ${message.message}`));
      }
      
      if (message.type === 'machine_startup' || message.type === 'machine_startup_step') {
        console.log(chalk.green(`🏭 MACHINE EVENT RECEIVED: ${message.type}`));
        console.log(chalk.green(`   Machine ID: ${message.machine_id}`));
      }
    });
    
    ws.on('error', (error) => {
      console.log(chalk.red(`❌ WebSocket error: ${error.message}`));
    });
    
    ws.on('close', () => {
      console.log(chalk.yellow('📪 WebSocket closed'));
    });
    
    // Wait for connection and events
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    console.log(chalk.blue('\n═'.repeat(50)));
    console.log(chalk.blue.bold('🎯 LOCAL TEST RESULTS'));
    console.log(chalk.blue('═'.repeat(50)));
    
    if (connected) {
      console.log(chalk.green('✅ Local API connection works'));
      console.log(chalk.cyan(`Total events received: ${eventCount}`));
    } else {
      console.log(chalk.red('❌ Could not connect to local API'));
      console.log(chalk.red('   Make sure API server is running locally'));
    }
    
    ws.close();
    
  } catch (error) {
    console.log(chalk.red('❌ Error testing local connection:'));
    console.log(chalk.red(`   ${error.message}`));
  }
}

testLocalConnection();