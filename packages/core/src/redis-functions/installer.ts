// Redis Function Installer - Manages function installation and updates

import Redis from 'ioredis';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../utils/logger.js';
import { FunctionInstallResult, FunctionInfo } from './types.js';

export class RedisFunctionInstaller {
  private redis: Redis;
  private functionDir: string;
  private libraryName = 'jobMatching';

  constructor(redisUrl: string, functionDir?: string) {
    this.redis = new Redis(redisUrl);
    // Use provided directory or default relative path
    this.functionDir = functionDir || path.join(process.cwd(), 'src/redis-functions/functions');
  }

  /**
   * Install or update Redis functions
   */
  async installOrUpdate(): Promise<FunctionInstallResult> {
    try {
      logger.info('🔍 Checking Redis functions...');

      // Check Redis version
      const info = await this.redis.info('server');
      const versionMatch = info.match(/redis_version:(\d+)\.(\d+)\.(\d+)/);
      if (versionMatch) {
        const major = parseInt(versionMatch[1]);
        if (major < 7) {
          throw new Error(`Redis Functions require Redis 7.0+, found ${versionMatch[0]}`);
        }
      }

      // Load function code
      const functionCode = await this.loadFunctionCode();
      const checksum = this.calculateChecksum(functionCode);

      // Check if function exists and if it's up to date
      const needsUpdate = await this.checkIfNeedsUpdate(checksum);

      if (needsUpdate) {
        logger.info('⚙️ Installing/updating Redis functions...');
        await this.installFunction(functionCode);
        await this.saveChecksum(checksum);
        logger.info(' Redis functions installed successfully');

        // List installed functions
        const functions = await this.listInstalledFunctions();
        return {
          success: true,
          functionsInstalled: functions.map(f => f.name),
        };
      } else {
        logger.info(' Redis functions are up to date');
        const functions = await this.listInstalledFunctions();
        return {
          success: true,
          functionsInstalled: functions.map(f => f.name),
        };
      }
    } catch (error) {
      logger.error('L Failed to install Redis functions:', error);
      return {
        success: false,
        functionsInstalled: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Load function code from files
   */
  private async loadFunctionCode(): Promise<string> {
    const functionFiles = ['findMatchingJob.lua'];
    const codes: string[] = [];

    for (const file of functionFiles) {
      const filePath = path.join(this.functionDir, file);
      try {
        const code = await fs.readFile(filePath, 'utf-8');
        codes.push(code);
      } catch (error) {
        logger.error(`Failed to load function file ${file}:`, error);
        throw new Error(`Cannot load function file: ${file}`);
      }
    }

    return codes.join('\n\n');
  }

  /**
   * Calculate checksum of function code
   */
  private calculateChecksum(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  /**
   * Check if functions need to be updated
   */
  private async checkIfNeedsUpdate(checksum: string): Promise<boolean> {
    try {
      // Check if library exists
      const libraries = (await this.redis.call('FUNCTION', 'LIST')) as unknown[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existingLibrary = libraries.find((lib: any) => lib.library_name === this.libraryName);

      if (!existingLibrary) {
        logger.info('Function library not found, installation needed');
        return true;
      }

      // Check stored checksum
      const storedChecksum = await this.redis.get(`function:checksum:${this.libraryName}`);
      if (storedChecksum !== checksum) {
        logger.info('Function code has changed, update needed');
        return true;
      }

      return false;
    } catch (error) {
      // If FUNCTION command fails, we might be on Redis < 7.0
      if (error instanceof Error && error.message.includes('unknown command')) {
        throw new Error('Redis Functions require Redis 7.0 or higher');
      }
      // Other errors mean we should try to install
      return true;
    }
  }

  /**
   * Install function to Redis
   */
  private async installFunction(code: string): Promise<void> {
    try {
      // First, try to delete existing function library
      try {
        await this.redis.call('FUNCTION', 'DELETE', this.libraryName);
        logger.info(`Deleted existing function library: ${this.libraryName}`);
      } catch {
        // Ignore error if function doesn't exist
      }

      // Load new function with REPLACE flag
      await this.redis.call('FUNCTION', 'LOAD', 'REPLACE', code);
      logger.info(`Loaded function library: ${this.libraryName}`);
    } catch (error) {
      logger.error('Failed to install function:', error);
      throw error;
    }
  }

  /**
   * Save checksum for version tracking
   */
  private async saveChecksum(checksum: string): Promise<void> {
    await this.redis.set(`function:checksum:${this.libraryName}`, checksum);
  }

  /**
   * List all installed functions
   */
  async listFunctions(): Promise<unknown[]> {
    try {
      const result = (await this.redis.call('FUNCTION', 'LIST')) as unknown[];
      return result;
    } catch (error) {
      logger.error('Failed to list functions:', error);
      return [];
    }
  }

  /**
   * List functions from our library
   */
  async listInstalledFunctions(): Promise<FunctionInfo[]> {
    const allLibraries = await this.listFunctions();

    // Redis FUNCTION LIST returns flat array format from ioredis:
    // [[key1, val1, key2, val2, ...], ...]
    for (const lib of allLibraries) {
      if (!Array.isArray(lib)) continue;

      // Convert flat array to object: [k1, v1, k2, v2] -> {k1: v1, k2: v2}
      const libObj: Record<string, unknown> = {};
      for (let i = 0; i < lib.length; i += 2) {
        libObj[lib[i] as string] = lib[i + 1];
      }

      // Check if this is our library
      if (libObj['library_name'] !== this.libraryName) continue;

      // Parse functions array (also in flat array format)
      const functions = libObj['functions'];
      if (!Array.isArray(functions)) return [];

      return functions.map((func: unknown): FunctionInfo | null => {
        if (!Array.isArray(func)) return null;

        const funcObj: Record<string, unknown> = {};
        for (let i = 0; i < func.length; i += 2) {
          funcObj[func[i] as string] = func[i + 1];
        }

        return {
          name: funcObj['name'] as string,
          library: this.libraryName,
          description: funcObj['description'] as string | undefined,
        };
      }).filter((f): f is FunctionInfo => f !== null);
    }

    return [];
  }

  /**
   * Delete installed functions
   */
  async deleteFunction(): Promise<void> {
    try {
      await this.redis.call('FUNCTION', 'DELETE', this.libraryName);
      await this.redis.del(`function:checksum:${this.libraryName}`);
      logger.info(`Deleted function library: ${this.libraryName}`);
    } catch (error) {
      logger.error('Failed to delete functions:', error);
      throw error;
    }
  }

  /**
   * Test function with sample data
   */
  async testFunction(): Promise<void> {
    try {
      logger.info('>� Testing findMatchingJob function...');

      // Create test data
      const testJobId = 'test-job-123';
      const testJob = {
        id: testJobId,
        service_required: 'comfyui',
        priority: '100',
        payload: JSON.stringify({ test: true }),
        requirements: JSON.stringify({
          hardware: { gpu_memory_gb: 16 },
          models: ['sdxl'],
        }),
        created_at: new Date().toISOString(),
        status: 'pending',
        retry_count: '0',
        max_retries: '3',
      };

      // Add test job
      await this.redis.hmset(`job:${testJobId}`, testJob);
      await this.redis.zadd('jobs:pending', 100, testJobId);

      // Test with matching worker
      const matchingWorker = {
        worker_id: 'test-worker-1',
        services: ['comfyui', 'a1111'],
        hardware: { gpu_memory_gb: 24, cpu_cores: 8, ram_gb: 32 },
        models: { comfyui: ['sdxl', 'sd15'] },
      };

      const result = (await this.redis.fcall(
        'findMatchingJob',
        0,
        JSON.stringify(matchingWorker),
        '10'
      )) as string | null;

      if (result) {
        const parsed = JSON.parse(result);
        logger.info(' Function test passed - matched job:', parsed.jobId);
      } else {
        logger.warn('L Function test failed - no match found');
      }

      // Test with non-matching worker
      const nonMatchingWorker = {
        worker_id: 'test-worker-2',
        services: ['a1111'], // doesn't have comfyui
        hardware: { gpu_memory_gb: 8 },
      };

      const result2 = (await this.redis.fcall(
        'findMatchingJob',
        0,
        JSON.stringify(nonMatchingWorker),
        '10'
      )) as string | null;

      if (!result2) {
        logger.info(' Function test passed - correctly rejected non-matching worker');
      } else {
        logger.warn('L Function test failed - incorrectly matched job');
      }

      // Cleanup
      await this.redis.del(`job:${testJobId}`);
      await this.redis.zrem('jobs:pending', testJobId);
    } catch (error) {
      logger.error('Function test failed:', error);
      throw error;
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }
}
