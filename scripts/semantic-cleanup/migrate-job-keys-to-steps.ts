#!/usr/bin/env tsx
/**
 * Phase 4.3.2: Data Migration Script
 *
 * Copies existing job:* Redis keys to step:* keys
 * - Preserves original data (no deletions)
 * - Validates each copy
 * - Logs progress and errors
 * - Idempotent (safe to re-run)
 */

import Redis from 'ioredis';
import { logger } from '../../packages/core/src/utils/logger.js';

interface MigrationStats {
  totalKeys: number;
  migrated: number;
  skipped: number;
  errors: number;
  startTime: number;
  endTime?: number;
}

interface MigrationOptions {
  redisUrl: string;
  batchSize: number;
  dryRun: boolean;
  validateCopies: boolean;
}

class JobToStepMigration {
  private redis: Redis;
  private stats: MigrationStats;
  private options: MigrationOptions;

  constructor(options: MigrationOptions) {
    this.options = options;
    this.redis = new Redis(options.redisUrl, {
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
    });

    this.stats = {
      totalKeys: 0,
      migrated: 0,
      skipped: 0,
      errors: 0,
      startTime: Date.now(),
    };
  }

  async connect(): Promise<void> {
    await this.redis.ping();
    logger.info('✅ Connected to Redis');
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
    logger.info('✅ Disconnected from Redis');
  }

  /**
   * Main migration flow
   */
  async migrate(): Promise<MigrationStats> {
    logger.info('🔄 Starting job:* → step:* migration');
    logger.info(`   Mode: ${this.options.dryRun ? 'DRY RUN' : 'LIVE'}`);
    logger.info(`   Batch size: ${this.options.batchSize}`);
    logger.info(`   Validation: ${this.options.validateCopies ? 'enabled' : 'disabled'}`);

    try {
      // Migrate hash keys (job:{id})
      await this.migrateHashKeys();

      // Migrate sorted sets (jobs:pending)
      await this.migrateSortedSets();

      // Migrate regular sets (jobs:active, jobs:completed, jobs:failed)
      await this.migrateSets();

      this.stats.endTime = Date.now();
      this.printSummary();

      return this.stats;
    } catch (error) {
      logger.error('❌ Migration failed:', error);
      throw error;
    }
  }

  /**
   * Migrate individual job hash keys: job:{id} → step:{id}
   */
  private async migrateHashKeys(): Promise<void> {
    logger.info('\n📦 Migrating hash keys: job:{id} → step:{id}');

    let cursor = '0';
    let iteration = 0;

    do {
      // Scan for job:* keys (excluding job:{id}:progress which we'll handle separately)
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        'job:*',
        'COUNT',
        this.options.batchSize
      );

      cursor = nextCursor;
      iteration++;

      // Filter to only job:{id} keys (exclude job:{id}:progress, jobs:pending, etc.)
      const jobHashKeys = keys.filter(
        key => key.startsWith('job:') && !key.includes(':') && key !== 'jobs:pending'
      );

      if (jobHashKeys.length > 0) {
        logger.info(`   Batch ${iteration}: Found ${jobHashKeys.length} job hash keys`);
        this.stats.totalKeys += jobHashKeys.length;

        for (const jobKey of jobHashKeys) {
          await this.migrateHashKey(jobKey);
        }
      }

      // Progress update every 10 batches
      if (iteration % 10 === 0) {
        logger.info(
          `   Progress: ${this.stats.migrated} migrated, ${this.stats.skipped} skipped, ${this.stats.errors} errors`
        );
      }
    } while (cursor !== '0');

    logger.info(`✅ Hash key migration complete: ${this.stats.migrated} keys migrated`);
  }

  /**
   * Migrate a single hash key
   */
  private async migrateHashKey(jobKey: string): Promise<void> {
    const stepKey = jobKey.replace(/^job:/, 'step:');

    try {
      // Check if already migrated
      const exists = await this.redis.exists(stepKey);
      if (exists) {
        logger.debug(`   Skip: ${stepKey} already exists`);
        this.stats.skipped++;
        return;
      }

      // Get all hash fields
      const data = await this.redis.hgetall(jobKey);

      if (Object.keys(data).length === 0) {
        logger.warn(`   Skip: ${jobKey} is empty`);
        this.stats.skipped++;
        return;
      }

      if (!this.options.dryRun) {
        // Copy to new key
        await this.redis.hmset(stepKey, data);

        // Validate if enabled
        if (this.options.validateCopies) {
          await this.validateHashCopy(jobKey, stepKey);
        }

        logger.debug(`   ✅ Migrated: ${jobKey} → ${stepKey}`);
      } else {
        logger.debug(`   [DRY RUN] Would migrate: ${jobKey} → ${stepKey}`);
      }

      this.stats.migrated++;
    } catch (error) {
      logger.error(`   ❌ Error migrating ${jobKey}:`, error);
      this.stats.errors++;
    }
  }

  /**
   * Validate that hash was copied correctly
   */
  private async validateHashCopy(sourceKey: string, destKey: string): Promise<void> {
    const sourceData = await this.redis.hgetall(sourceKey);
    const destData = await this.redis.hgetall(destKey);

    const sourceKeys = Object.keys(sourceData).sort();
    const destKeys = Object.keys(destData).sort();

    if (JSON.stringify(sourceKeys) !== JSON.stringify(destKeys)) {
      throw new Error(`Key mismatch: ${sourceKey} vs ${destKey}`);
    }

    for (const key of sourceKeys) {
      if (sourceData[key] !== destData[key]) {
        throw new Error(`Value mismatch for field ${key}: ${sourceKey} vs ${destKey}`);
      }
    }
  }

  /**
   * Migrate sorted sets: jobs:pending → steps:pending
   */
  private async migrateSortedSets(): Promise<void> {
    logger.info('\n📊 Migrating sorted sets');

    const sortedSets = [
      { old: 'jobs:pending', new: 'steps:pending' },
    ];

    for (const { old: oldKey, new: newKey } of sortedSets) {
      try {
        const exists = await this.redis.exists(newKey);
        if (exists) {
          logger.info(`   Skip: ${newKey} already exists`);
          continue;
        }

        // Get all members with scores
        const members = await this.redis.zrange(oldKey, 0, -1, 'WITHSCORES');

        if (members.length === 0) {
          logger.info(`   Skip: ${oldKey} is empty`);
          continue;
        }

        if (!this.options.dryRun) {
          // Copy to new sorted set
          // members is [member1, score1, member2, score2, ...]
          await this.redis.zadd(newKey, ...members);

          logger.info(`   ✅ Migrated: ${oldKey} → ${newKey} (${members.length / 2} members)`);
        } else {
          logger.info(
            `   [DRY RUN] Would migrate: ${oldKey} → ${newKey} (${members.length / 2} members)`
          );
        }

        this.stats.migrated++;
      } catch (error) {
        logger.error(`   ❌ Error migrating ${oldKey}:`, error);
        this.stats.errors++;
      }
    }
  }

  /**
   * Migrate regular sets: jobs:active, jobs:completed, jobs:failed
   */
  private async migrateSets(): Promise<void> {
    logger.info('\n📋 Migrating sets');

    const sets = [
      { old: 'jobs:active', new: 'steps:active' },
      { old: 'jobs:completed', new: 'steps:completed' },
      { old: 'jobs:failed', new: 'steps:failed' },
    ];

    for (const { old: oldKey, new: newKey } of sets) {
      try {
        const exists = await this.redis.exists(newKey);
        if (exists) {
          logger.info(`   Skip: ${newKey} already exists`);
          continue;
        }

        // Get all members
        const members = await this.redis.smembers(oldKey);

        if (members.length === 0) {
          logger.info(`   Skip: ${oldKey} is empty`);
          continue;
        }

        if (!this.options.dryRun) {
          // Copy to new set
          await this.redis.sadd(newKey, ...members);

          logger.info(`   ✅ Migrated: ${oldKey} → ${newKey} (${members.length} members)`);
        } else {
          logger.info(
            `   [DRY RUN] Would migrate: ${oldKey} → ${newKey} (${members.length} members)`
          );
        }

        this.stats.migrated++;
      } catch (error) {
        logger.error(`   ❌ Error migrating ${oldKey}:`, error);
        this.stats.errors++;
      }
    }
  }

  /**
   * Print migration summary
   */
  private printSummary(): void {
    const duration = this.stats.endTime
      ? ((this.stats.endTime - this.stats.startTime) / 1000).toFixed(2)
      : 'N/A';

    logger.info('\n' + '='.repeat(60));
    logger.info('📊 Migration Summary');
    logger.info('='.repeat(60));
    logger.info(`Total keys found:    ${this.stats.totalKeys}`);
    logger.info(`Successfully migrated: ${this.stats.migrated}`);
    logger.info(`Skipped (already exist): ${this.stats.skipped}`);
    logger.info(`Errors: ${this.stats.errors}`);
    logger.info(`Duration: ${duration}s`);
    logger.info('='.repeat(60));

    if (this.stats.errors > 0) {
      logger.warn('⚠️  Some keys failed to migrate. Check logs above for details.');
    } else {
      logger.info('✅ All keys migrated successfully!');
    }
  }
}

/**
 * Main execution
 */
async function main() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const dryRun = process.env.DRY_RUN === 'true';
  const batchSize = parseInt(process.env.BATCH_SIZE || '100');
  const validateCopies = process.env.VALIDATE_COPIES !== 'false'; // Default true

  logger.info('🚀 Job → Step Redis Keys Migration');
  logger.info('');
  logger.info('Configuration:');
  logger.info(`  Redis URL: ${redisUrl.replace(/:[^:@]+@/, ':****@')}`);
  logger.info(`  Dry Run: ${dryRun}`);
  logger.info(`  Batch Size: ${batchSize}`);
  logger.info(`  Validate Copies: ${validateCopies}`);
  logger.info('');

  const migration = new JobToStepMigration({
    redisUrl,
    batchSize,
    dryRun,
    validateCopies,
  });

  try {
    await migration.connect();
    const stats = await migration.migrate();
    await migration.disconnect();

    if (stats.errors > 0) {
      process.exit(1);
    }
  } catch (error) {
    logger.error('❌ Migration failed:', error);
    await migration.disconnect();
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { JobToStepMigration, MigrationStats, MigrationOptions };
