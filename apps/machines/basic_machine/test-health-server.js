#!/usr/bin/env node

/**
 * Test health server functionality
 */

// Load test environment before importing modules
import dotenv from 'dotenv';
dotenv.config({ path: '.env.test' });

import { ServiceOrchestrator } from './src/orchestrator.js';
import config from './src/config/environment.js';
import { createLogger } from './src/utils/logger.js';

const logger = createLogger('test-health');

async function testHealthServer() {
  logger.info('Testing health server functionality...');
  
  try {
    // Create orchestrator instance
    const orchestrator = new ServiceOrchestrator();
    
    // Start only the health server
    logger.info('Starting health server...');
    await orchestrator.startService('health-server', { port: 9090 });
    
    // Wait a moment for server to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test the endpoints
    const axios = (await import('axios')).default;
    
    try {
      logger.info('Testing /health endpoint...');
      const healthResponse = await axios.get('http://localhost:9090/health');
      logger.info('Health response:', JSON.stringify(healthResponse.data, null, 2));
      
      logger.info('Testing /status endpoint...');
      const statusResponse = await axios.get('http://localhost:9090/status');
      logger.info('Status response:', JSON.stringify(statusResponse.data, null, 2));
      
      logger.info('Testing /services endpoint...');
      const servicesResponse = await axios.get('http://localhost:9090/services');
      logger.info('Services response:', JSON.stringify(servicesResponse.data, null, 2));
      
      logger.info('Testing /ready endpoint...');
      const readyResponse = await axios.get('http://localhost:9090/ready');
      logger.info('Ready response:', JSON.stringify(readyResponse.data, null, 2));
      
    } catch (httpError) {
      logger.error('HTTP request failed:', httpError.message);
      if (httpError.response) {
        logger.error('Response:', httpError.response.data);
      }
    }
    
    logger.info('Health server test completed successfully!');
    
  } catch (error) {
    logger.error('Health server test failed:', error);
  } finally {
    logger.info('Cleaning up...');
    process.exit(0);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, exiting...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, exiting...');
  process.exit(0);
});

testHealthServer().catch((error) => {
  logger.error('Test failed:', error);
  process.exit(1);
});