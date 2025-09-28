/**
 * Monitor Redis Connection Utility
 *
 * Provides the same robust Redis connection management as API and webhook services
 * for the monitor's API routes.
 */

import Redis from 'ioredis';
import { RedisService } from '@emp/core';

interface RedisConnectionResult {
  redis: Redis;
  redisService: RedisService;
}

export class MonitorRedisManager {
  private redis: Redis | null = null;
  private redisService: RedisService | null = null;
  private connectionPromise: Promise<RedisConnectionResult> | null = null;

  private async testRedisConnection(redisUrl: string): Promise<void> {
    // Simple ping-based test with robust error handling
    const testClient = new Redis(redisUrl, {
      lazyConnect: true,
      enableReadyCheck: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      commandTimeout: 3000,
    });

    // Suppress errors during testing
    testClient.on('error', () => {});

    try {
      await testClient.ping();
    } finally {
      try {
        await testClient.quit();
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  private async connectToRedisWithRetry(): Promise<RedisConnectionResult> {
    // Use NEXT_PUBLIC_DEFAULT_REDIS_URL for local dev, fallback to individual config
    const redisUrl = process.env.NEXT_PUBLIC_DEFAULT_REDIS_URL ||
                     `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}`;

    const maxRetries = 30; // Limited retries for API routes (not infinite like services)
    const retryInterval = 1000; // 1 second

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Test basic Redis connectivity
        await this.testRedisConnection(redisUrl);

        // If we get here, Redis is available - create connections
        this.redis = new Redis(redisUrl, {
          enableReadyCheck: false,
          lazyConnect: true,
          maxRetriesPerRequest: 3,
          connectTimeout: 5000,
          commandTimeout: 10000,
        });

        // Add robust error handlers
        this.redis.on('error', (error) => {
          console.warn('Monitor Redis connection error (auto-reconnecting):', error.message);
        });

        this.redis.on('reconnecting', (ms) => {
          console.log(`Monitor Redis reconnecting in ${ms}ms...`);
        });

        this.redis.on('ready', () => {
          console.log('Monitor Redis connection restored');
        });

        // Test the connection
        await this.redis.ping();

        // Create RedisService with the established connection
        this.redisService = new RedisService(this.redis as any);

        return {
          redis: this.redis,
          redisService: this.redisService
        };
      } catch (error) {
        console.log(`Monitor waiting for Redis... (attempt ${attempt}/${maxRetries})`);

        // Clean up failed connections
        if (this.redis) {
          try { await this.redis.quit(); } catch {}
          this.redis = null;
        }
        if (this.redisService) {
          this.redisService = null;
        }

        if (attempt === maxRetries) {
          throw new Error(`Failed to connect to Redis after ${maxRetries} attempts`);
        }

        await new Promise(resolve => setTimeout(resolve, retryInterval));
      }
    }

    throw new Error('Failed to connect to Redis');
  }

  async getRedisConnection(): Promise<RedisConnectionResult> {
    // Return existing connection if available and healthy
    if (this.redis && this.redisService && this.redis.status === 'ready') {
      return {
        redis: this.redis,
        redisService: this.redisService
      };
    }

    // If already connecting, wait for that connection
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    // Start new connection
    this.connectionPromise = this.connectToRedisWithRetry();

    try {
      const result = await this.connectionPromise;
      this.connectionPromise = null;
      return result;
    } catch (error) {
      this.connectionPromise = null;
      throw error;
    }
  }

  async safeRedisOperation<T>(operation: () => Promise<T>, operationName: string): Promise<T | null> {
    // Wrapper for Redis operations that prevents crashes on disconnection
    try {
      return await operation();
    } catch (error) {
      console.warn(`Monitor Redis operation '${operationName}' failed (continuing):`, error.message);
      return null;
    }
  }
}

// Singleton instance for the monitor
const monitorRedisManager = new MonitorRedisManager();

/**
 * Get a Redis connection for monitor API routes
 * Uses the same robust connection management as API and webhook services
 */
export async function getMonitorRedisConnection(): Promise<RedisConnectionResult> {
  return monitorRedisManager.getRedisConnection();
}

/**
 * Execute a Redis operation safely without crashing on errors
 */
export async function safeRedisOperation<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T | null> {
  return monitorRedisManager.safeRedisOperation(operation, operationName);
}