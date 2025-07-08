#!/usr/bin/env node

/**
 * Local test script to verify basic functionality
 */

import { spawn } from 'child_process';
import axios from 'axios';

console.log('Testing Basic Machine locally...\n');

// Set minimal test environment
process.env.NUM_GPUS = '1';
process.env.HUB_REDIS_URL = process.env.HUB_REDIS_URL || 'redis://localhost:6379';
process.env.LOG_LEVEL = 'debug';
process.env.ENABLE_NGINX = 'false';
process.env.ENABLE_COMFYUI = 'false'; 
process.env.ENABLE_A1111 = 'false';
process.env.ENABLE_OLLAMA = 'false';
process.env.ENABLE_REDIS_WORKERS = 'true';

console.log('Configuration:');
console.log(`- NUM_GPUS: ${process.env.NUM_GPUS}`);
console.log(`- HUB_REDIS_URL: ${process.env.HUB_REDIS_URL}`);
console.log(`- Services: Redis Workers only\n`);

// Start the service
const proc = spawn('node', ['src/index.js'], {
  stdio: 'inherit',
  env: process.env
});

// Wait a bit then check health
setTimeout(async () => {
  try {
    console.log('\nChecking health endpoint...');
    const response = await axios.get('http://localhost:9090/health');
    console.log('Health check response:', JSON.stringify(response.data, null, 2));
    
    console.log('\nChecking status endpoint...');
    const statusResponse = await axios.get('http://localhost:9090/status');
    console.log('Status response:', JSON.stringify(statusResponse.data, null, 2));
    
    console.log('\n✅ Basic Machine is working!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Health check failed:', error.message);
    process.exit(1);
  }
}, 5000);

// Handle termination
process.on('SIGINT', () => {
  console.log('\nStopping test...');
  proc.kill('SIGTERM');
  process.exit(0);
});