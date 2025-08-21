/**
 * Clean startPM2Services function using Sequential Startup Orchestrator
 */

import { SequentialStartupOrchestrator } from './sequential-startup-orchestrator.js';

export async function startPM2ServicesSequentially(pm2Manager, logger) {
  logger.info('🚀 Starting PM2 daemon and services with Sequential Startup Orchestrator...');
  
  try {
    // Start PM2 daemon
    await pm2Manager.pm2Exec('ping');
    logger.info('PM2 daemon started');
    
    // Load the Sequential Startup Orchestrator
    const orchestrator = new SequentialStartupOrchestrator(logger);
    
    // Load the ecosystem configuration
    const fs = await import('fs');
    const configPath = '/workspace/pm2-ecosystem.config.cjs';
    
    if (!fs.existsSync(configPath)) {
      throw new Error('PM2 ecosystem config not found. Ecosystem generation may have failed.');
    }
    
    // Load ecosystem config
    delete require.cache[require.resolve(configPath)]; // Clear cache
    const ecosystemConfig = require(configPath);
    
    logger.info(`📋 Starting ${ecosystemConfig.apps.length} services sequentially with connection validation`);
    
    // Use sequential startup instead of parallel PM2 start
    // Ports are already predetermined in the ecosystem config
    const startedServices = await orchestrator.startServicesSequentially(ecosystemConfig);
    
    logger.info(`✅ Sequential startup completed. Started services: ${startedServices.join(', ')}`);
    
  } catch (error) {
    logger.error('Failed to start PM2 services with sequential orchestrator:', error);
    throw error;
  }
}