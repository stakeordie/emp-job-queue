#!/usr/bin/env node

/**
 * Job Archival CLI Tool
 *
 * Archives completed and failed jobs from Redis to date-partitioned files
 * Keeps Redis performance optimal by removing old job data
 */

import { RedisService } from '../core/redis-service.js';
import { JobBroker } from '../core/job-broker.js';
import { logger } from '../core/utils/logger.js';

interface ArchiveOptions {
  olderThanMinutes?: number;
  olderThanDays?: number;
  archiveDir?: string;
  cleanup?: boolean;
  cleanupDays?: number;
  dryRun?: boolean;
}

async function archiveJobs(options: ArchiveOptions = {}) {
  const {
    olderThanMinutes,
    olderThanDays = 7,
    archiveDir = './data/archived-jobs',
    cleanup = false,
    cleanupDays = 90,
    dryRun = false,
  } = options;

  // Use minutes if specified, otherwise convert days to minutes
  const archiveMinutes = olderThanMinutes || olderThanDays * 24 * 60;

  let redisService: RedisService | null = null;

  try {
    // Initialize Redis connection
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    redisService = new RedisService(redisUrl);
    await redisService.connect();

    const jobBroker = new JobBroker(redisService);

    if (dryRun) {
      logger.info('DRY RUN MODE - No changes will be made');
    }

    logger.info(`Starting job archival process...`);
    logger.info(`- Archive directory: ${archiveDir}`);
    if (olderThanMinutes) {
      logger.info(`- Archive jobs older than: ${olderThanMinutes} minutes`);
    } else {
      logger.info(`- Archive jobs older than: ${olderThanDays} days`);
    }

    if (!dryRun) {
      // Archive old jobs
      const result = await jobBroker.archiveCompletedJobs(archiveMinutes, archiveDir);
      logger.info(`Archival completed: ${result.archived} jobs archived, ${result.errors} errors`);

      // Cleanup old archive files if requested
      if (cleanup) {
        logger.info(`Cleaning up archive files older than ${cleanupDays} days...`);
        const cleanupResult = await jobBroker.cleanupArchives(cleanupDays, archiveDir);
        logger.info(
          `Cleanup completed: ${cleanupResult.deleted} files deleted, ${cleanupResult.errors} errors`
        );
      }
    } else {
      // Dry run - just count what would be archived
      const completedJobs = await redisService['redis'].hgetall('jobs:completed');
      const failedJobs = await redisService['redis'].hgetall('jobs:failed');
      const cutoffTime = Date.now() - archiveMinutes * 60 * 1000;

      let wouldArchive = 0;

      for (const [, jobDataStr] of Object.entries(completedJobs)) {
        try {
          const jobData = JSON.parse(jobDataStr);
          const completedAt = jobData.completed_at || jobData.created_at || Date.now();
          if (completedAt < cutoffTime) wouldArchive++;
        } catch (_e) {
          // ignore parse errors in dry run
        }
      }

      for (const [, jobDataStr] of Object.entries(failedJobs)) {
        try {
          const jobData = JSON.parse(jobDataStr);
          const completedAt = jobData.completed_at || jobData.created_at || Date.now();
          if (completedAt < cutoffTime) wouldArchive++;
        } catch (_e) {
          // ignore parse errors in dry run
        }
      }

      logger.info(`DRY RUN: Would archive ${wouldArchive} jobs`);
      logger.info(
        `Current job counts: ${Object.keys(completedJobs).length} completed, ${Object.keys(failedJobs).length} failed`
      );
    }
  } catch (error) {
    logger.error('Error during job archival:', error);
    process.exit(1);
  } finally {
    if (redisService) {
      await redisService.disconnect();
    }
  }
}

// CLI argument parsing
function parseArgs(): ArchiveOptions {
  const args = process.argv.slice(2);
  const options: ArchiveOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--minutes':
      case '-m':
        options.olderThanMinutes = parseInt(args[++i]);
        break;
      case '--days':
      case '-d':
        options.olderThanDays = parseInt(args[++i]);
        break;
      case '--archive-dir':
      case '-a':
        options.archiveDir = args[++i];
        break;
      case '--cleanup':
      case '-c':
        options.cleanup = true;
        break;
      case '--cleanup-days':
        options.cleanupDays = parseInt(args[++i]);
        break;
      case '--dry-run':
      case '-n':
        options.dryRun = true;
        break;
      case '--help':
      case '-h':
        process.stdout.write(`
Job Archival Tool

Usage: node archive-jobs.js [options]

Options:
  -m, --minutes <number>        Archive jobs older than N minutes
  -d, --days <number>           Archive jobs older than N days (default: 7)
  -a, --archive-dir <path>      Archive directory path (default: ./data/archived-jobs)
  -c, --cleanup                 Also cleanup old archive files
  --cleanup-days <number>       Delete archive files older than N days (default: 90)
  -n, --dry-run                 Show what would be archived without making changes
  -h, --help                    Show this help message

Examples:
  node archive-jobs.js                           # Archive jobs older than 7 days
  node archive-jobs.js -d 14                     # Archive jobs older than 14 days
  node archive-jobs.js -d 7 -c --cleanup-days 30 # Archive jobs and cleanup old files
  node archive-jobs.js --dry-run                 # See what would be archived
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

// Run the archival process
if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs();
  archiveJobs(options).catch(error => {
    logger.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { archiveJobs };
