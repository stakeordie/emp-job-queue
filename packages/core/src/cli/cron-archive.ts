#!/usr/bin/env node

/**
 * Cron Job Archival Script
 *
 * Designed to run every 5 minutes via cron to keep Redis lean
 * Moves completed/failed jobs from Redis to persistent file storage
 *
 * Usage in crontab:
 * 0,5,10,15,20,25,30,35,40,45,50,55 * * * * cd /path/to/emp-job-queue && node dist/cli/cron-archive.js >> logs/archive.log 2>&1
 */

import { RedisService } from '../redis-service.js';
import { JobBroker } from '../job-broker.js';
import { logger } from '../utils/logger.js';

interface CronArchiveOptions {
  archiveAfterMinutes?: number;
  archiveDir?: string;
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
}

async function cronArchive(options: CronArchiveOptions = {}) {
  const {
    archiveAfterMinutes = 5,
    archiveDir = './data/archived-jobs',
    logLevel = 'info',
  } = options;

  const startTime = Date.now();
  let redisService: RedisService | null = null;

  try {
    // Initialize Redis connection
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    redisService = new RedisService(redisUrl);
    await redisService.connect();

    const jobBroker = new JobBroker(redisService);

    // Get current job counts before archival
    const beforeStats = await getJobCounts(redisService);

    // Archive jobs older than specified minutes
    const result = await jobBroker.archiveCompletedJobs(archiveAfterMinutes, archiveDir);

    // Get job counts after archival
    const afterStats = await getJobCounts(redisService);

    const duration = Date.now() - startTime;

    if (logLevel === 'info' || logLevel === 'debug') {
      logger.info(`Cron archival completed in ${duration}ms`);
      logger.info(`Before: ${beforeStats.completed} completed, ${beforeStats.failed} failed`);
      logger.info(`After: ${afterStats.completed} completed, ${afterStats.failed} failed`);
      logger.info(`Archived: ${result.archived} jobs, ${result.errors} errors`);
    }

    // Only log to console for cron output if there were changes or errors
    if (result.archived > 0 || result.errors > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[${new Date().toISOString()}] Archived ${result.archived} jobs, ${result.errors} errors (${duration}ms)`
      );
    }

    // Exit with error code if there were archival errors
    if (result.errors > 0) {
      process.exit(1);
    }
  } catch (error) {
    logger.error('Cron archival failed:', error);
    console.error(`[${new Date().toISOString()}] CRON ARCHIVAL FAILED:`, error);
    process.exit(1);
  } finally {
    if (redisService) {
      await redisService.disconnect();
    }
  }
}

async function getJobCounts(
  redisService: RedisService
): Promise<{ completed: number; failed: number }> {
  const [completed, failed] = await Promise.all([
    redisService['redis'].hlen('jobs:completed'),
    redisService['redis'].hlen('jobs:failed'),
  ]);

  return { completed, failed };
}

// CLI argument parsing for cron script
function parseArgs(): CronArchiveOptions {
  const args = process.argv.slice(2);
  const options: CronArchiveOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--minutes':
      case '-m':
        options.archiveAfterMinutes = parseInt(args[++i]);
        break;
      case '--archive-dir':
      case '-a':
        options.archiveDir = args[++i];
        break;
      case '--log-level':
      case '-l':
        options.logLevel = args[++i] as 'error' | 'warn' | 'info' | 'debug';
        break;
      case '--quiet':
      case '-q':
        options.logLevel = 'error';
        break;
      case '--verbose':
      case '-v':
        options.logLevel = 'debug';
        break;
      case '--help':
      case '-h':
        process.stdout.write(`
Cron Job Archival Script

Usage: node cron-archive.js [options]

Options:
  -m, --minutes <number>        Archive jobs older than N minutes (default: 5)
  -a, --archive-dir <path>      Archive directory path (default: ./data/archived-jobs)
  -l, --log-level <level>       Log level: error, warn, info, debug (default: info)
  -q, --quiet                   Only log errors
  -v, --verbose                 Enable debug logging
  -h, --help                    Show this help message

Cron Example:
  # Archive every 5 minutes
  */5 * * * * cd /path/to/emp-job-queue && node dist/cli/cron-archive.js >> logs/archive.log 2>&1

Environment Variables:
  REDIS_URL                     Redis connection URL (default: redis://localhost:6379)
        `);
        process.exit(0);
        break;
      default:
        if (arg.startsWith('-')) {
          console.error(`Unknown option: ${arg}`);
          console.error('Use --help for usage information');
          process.exit(1);
        }
    }
  }

  return options;
}

// Run the cron archival process
if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs();
  cronArchive(options).catch(error => {
    console.error(`[${new Date().toISOString()}] FATAL:`, error);
    process.exit(1);
  });
}

export { cronArchive };
