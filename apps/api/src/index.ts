// API Server Entry Point
import { LightweightAPIServer } from './lightweight-api-server.js';
import { logger } from '@emp/core';

// Also export components for library use
export * from './lightweight-api-server.js';
export * from './hybrid-client.js';

// Main execution when run directly
async function main() {
  const config = {
    port: parseInt(process.env.API_PORT || '3001'),
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['*'],
  };

  logger.info('Starting API server with config:', config);

  const server = new LightweightAPIServer(config);

  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });

  try {
    await server.start();
    logger.info('API server started successfully');
  } catch (error) {
    logger.error('Failed to start API server:', error);
    process.exit(1);
  }
}

// Only run main if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    logger.error('Unhandled error in main:', error);
    process.exit(1);
  });
}
