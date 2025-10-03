#!/usr/bin/env node

import { prisma } from '@emergexyz/db';
import { logger } from '@emp/core';
import { JobEvaluator } from './index.js';

async function main() {
  const evaluator = new JobEvaluator();

  try {
    logger.info('Running job resolver only...');
    await evaluator.resolveDataStructureIssues();
    logger.info('Job resolver completed successfully');
  } catch (error) {
    logger.error('Job resolver failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Handle process termination gracefully
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

if (require.main === module) {
  main().catch((error) => {
    logger.error('Unhandled error in resolver:', error);
    process.exit(1);
  });
}