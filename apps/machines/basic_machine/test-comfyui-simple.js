#!/usr/bin/env node

import { createLogger } from './src/utils/logger.js';
import ComfyUIService from './src/services/comfyui-service.js';

const logger = createLogger('test-simple');

async function testComfyUISimple() {
  logger.info('Starting simple ComfyUI service test...');

  // Create minimal config without Redis requirement
  const config = {
    services: {
      comfyui: {
        basePort: 8200
      }
    }
  };

  // Create ComfyUI service instance
  const comfyService = new ComfyUIService({ gpu: 0 }, config);

  // Set up event listeners
  comfyService.on('error', (error) => {
    logger.error('ComfyUI service error:', error);
  });

  comfyService.on('process-exit', ({ code, signal }) => {
    logger.info(`ComfyUI process exited with code ${code}, signal ${signal}`);
  });

  comfyService.on('started', () => {
    logger.info('ComfyUI service started successfully!');
  });

  try {
    logger.info(`Starting ComfyUI service on port ${comfyService.port}`);
    logger.info(`Working directory: ${comfyService.workDir}`);
    
    // Start the service
    await comfyService.start();
    
    logger.info('Service started! Testing health check...');
    
    // Test health check
    const healthy = await comfyService.isHealthy();
    logger.info(`Service healthy: ${healthy}`);
    
    // Test service status
    const status = comfyService.getStatus();
    logger.info('Service status:', {
      name: status.name,
      status: status.status,
      uptime: status.uptime,
      pid: status.metadata.pid
    });
    
    // Test HTTP endpoint
    if (healthy) {
      logger.info('Testing HTTP endpoint...');
      try {
        const response = await comfyService.makeHealthRequest();
        logger.info(`HTTP response status: ${response.statusCode}`);
      } catch (error) {
        logger.error('HTTP test failed:', error.message);
      }
    }
    
    // Let it run for a few seconds
    logger.info('Letting service run for 5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Test health check again
    const stillHealthy = await comfyService.isHealthy();
    logger.info(`Service still healthy: ${stillHealthy}`);
    
    // Stop the service
    logger.info('Stopping ComfyUI service...');
    await comfyService.stop();
    
    logger.info('ComfyUI simple test completed successfully!');
  } catch (error) {
    logger.error('ComfyUI simple test failed:', error);
    
    // Try to stop service if it's running
    try {
      await comfyService.stop();
    } catch (stopError) {
      logger.error('Error stopping service:', stopError);
    }
    
    process.exit(1);
  }
}

// Run test
testComfyUISimple().catch((error) => {
  logger.error('Test failed:', error);
  process.exit(1);
});