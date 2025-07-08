#!/usr/bin/env node

import { createLogger } from './src/utils/logger.js';
import config from './src/config/environment.js';
import ComfyUIService from './src/services/comfyui-service.js';

const logger = createLogger('test');

async function testComfyUI() {
  logger.info('Starting ComfyUI service test...');

  // Create ComfyUI service instance
  const comfyService = new ComfyUIService({ gpu: 0 }, config);

  // Set up event listeners
  comfyService.on('error', (error) => {
    logger.error('ComfyUI service error:', error);
  });

  comfyService.on('process-exit', ({ code, signal }) => {
    logger.info(`ComfyUI process exited with code ${code}, signal ${signal}`);
  });

  try {
    // Test service metadata
    logger.info('Service metadata:', comfyService.getMetadata());

    // Test service status
    logger.info('Service status:', comfyService.getStatus());

    // Test configuration
    logger.info(`ComfyUI will run on port: ${comfyService.port}`);
    logger.info(`ComfyUI work directory: ${comfyService.workDir}`);
    logger.info(`Mock GPU mode: ${comfyService.mockGpu}`);

    // Test directory setup
    await comfyService.setupDirectories();
    logger.info('Directories setup completed');

    // Test log setup
    await comfyService.setupLogs();
    logger.info('Logs setup completed');

    // Test command building
    const cmd = comfyService.buildCommand();
    logger.info(`ComfyUI command: ${cmd.join(' ')}`);

    // Test port availability
    const portInUse = await comfyService.isPortInUse(comfyService.port);
    logger.info(`Port ${comfyService.port} in use: ${portInUse}`);

    // Test health check (should fail since service is not running)
    const healthy = await comfyService.isHealthy();
    logger.info(`Service healthy: ${healthy}`);

    logger.info('ComfyUI service test completed successfully!');
  } catch (error) {
    logger.error('ComfyUI service test failed:', error);
    process.exit(1);
  }
}

// Run test
testComfyUI().catch((error) => {
  logger.error('Test failed:', error);
  process.exit(1);
});