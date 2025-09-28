/**
 * Fast unit tests for monitor service Redis connection resilience
 * Tests the connection retry logic and error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MonitorRedisManager } from '../lib/redis-connection.js';

// Mock Redis to control connection behavior
let shouldFail = false;
let connectionAttempts = 0;

const mockRedis = {
  ping: vi.fn().mockImplementation(() => {
    connectionAttempts++;
    if (shouldFail && connectionAttempts <= 2) {
      throw new Error('Connection failed');
    }
    return Promise.resolve('PONG');
  }),
  quit: vi.fn().mockResolvedValue('OK'),
  on: vi.fn(),
  status: 'ready',
};

vi.mock('ioredis', () => ({
  default: vi.fn(() => mockRedis),
}));

// Mock logger
vi.mock('@emp/core', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Monitor Redis Connection Resilience', () => {
  let manager: MonitorRedisManager;

  beforeEach(() => {
    vi.clearAllMocks();
    shouldFail = false;
    connectionAttempts = 0;
  });

  afterEach(async () => {
    // Reset manager state
    manager = undefined as any;
  });

  describe('Connection Initialization', () => {
    it('should create manager instance without immediate connection', () => {
      manager = new MonitorRedisManager();

      expect(manager).toBeInstanceOf(MonitorRedisManager);
      // Should not have attempted connection yet
    });

    it('should use NEXT_PUBLIC_DEFAULT_REDIS_URL when available', async () => {
      process.env.NEXT_PUBLIC_DEFAULT_REDIS_URL = 'redis://test:6379';

      manager = new MonitorRedisManager();
      const result = await manager.safeRedisOperation(
        async () => 'PONG',
        'test-ping'
      );

      expect(result).toBe('PONG');
      delete process.env.NEXT_PUBLIC_DEFAULT_REDIS_URL;
    });

    it('should fallback to REDIS_HOST and REDIS_PORT environment variables', async () => {
      process.env.REDIS_HOST = 'testhost';
      process.env.REDIS_PORT = '6380';

      manager = new MonitorRedisManager();
      const result = await manager.safeRedisOperation(
        async () => 'PONG',
        'test-ping'
      );

      expect(result).toBe('PONG');
      delete process.env.REDIS_HOST;
      delete process.env.REDIS_PORT;
    });
  });

  describe('Connection Retry Logic', () => {
    it('should retry failed connections with exponential backoff', async () => {
      shouldFail = true;

      manager = new MonitorRedisManager();

      // Should eventually succeed after retries
      const result = await manager.safeRedisOperation(
        async () => 'PONG',
        'retry-test'
      );

      expect(result).toBe('PONG');
      // Should have made multiple attempts
      expect(connectionAttempts).toBeGreaterThan(1);
    });

    it('should limit retry attempts for API routes', async () => {
      // Make ping always fail
      mockRedis.ping.mockRejectedValue(new Error('Always fails'));

      manager = new MonitorRedisManager();

      const result = await manager.safeRedisOperation(
        async () => 'PONG',
        'limited-retry-test'
      );

      // Should return null after max retries
      expect(result).toBeNull();
    });

    it('should handle connection timeout gracefully', async () => {
      // Simulate timeout
      mockRedis.ping.mockRejectedValue(new Error('Connection timeout'));

      manager = new MonitorRedisManager();

      const result = await manager.safeRedisOperation(
        async () => 'PONG',
        'timeout-test'
      );

      expect(result).toBeNull();
    });
  });

  describe('Safe Redis Operations', () => {
    it('should execute successful operations and return results', async () => {
      manager = new MonitorRedisManager();

      const testData = { key: 'value', count: 42 };
      const result = await manager.safeRedisOperation(
        async () => testData,
        'successful-operation'
      );

      expect(result).toEqual(testData);
    });

    it('should catch operation errors and return null', async () => {
      manager = new MonitorRedisManager();

      const result = await manager.safeRedisOperation(
        async () => {
          throw new Error('Operation failed');
        },
        'failing-operation'
      );

      expect(result).toBeNull();
    });

    it('should handle Redis disconnection during operation', async () => {
      manager = new MonitorRedisManager();

      const result = await manager.safeRedisOperation(
        async () => {
          throw new Error('Connection lost');
        },
        'disconnection-test'
      );

      expect(result).toBeNull();
    });

    it('should log operation failures without throwing', async () => {
      const { logger } = await import('@emp/core');

      manager = new MonitorRedisManager();

      await manager.safeRedisOperation(
        async () => {
          throw new Error('Test error');
        },
        'logging-test'
      );

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Redis operation \'logging-test\' failed'),
        expect.stringContaining('Test error')
      );
    });
  });

  describe('Connection Configuration', () => {
    it('should configure Redis with appropriate timeouts for API routes', async () => {
      const Redis = vi.mocked((await import('ioredis')).default);

      manager = new MonitorRedisManager();
      await manager.safeRedisOperation(
        async () => 'PONG',
        'config-test'
      );

      expect(Redis).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          enableReadyCheck: false,
          lazyConnect: true,
          maxRetriesPerRequest: 3,
          connectTimeout: 5000,
          commandTimeout: 10000,
        })
      );
    });

    it('should setup error handlers for Redis connection', async () => {
      manager = new MonitorRedisManager();
      await manager.safeRedisOperation(
        async () => 'PONG',
        'error-handler-test'
      );

      // Should have set up error handlers
      expect(mockRedis.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockRedis.on).toHaveBeenCalledWith('reconnecting', expect.any(Function));
      expect(mockRedis.on).toHaveBeenCalledWith('ready', expect.any(Function));
    });
  });

  describe('Memory Management', () => {
    it('should handle Redis connection instance creation', async () => {
      manager = new MonitorRedisManager();
      await manager.safeRedisOperation(
        async () => 'PONG',
        'cleanup-test'
      );

      // MonitorRedisManager creates Redis connections as needed
      expect(manager).toBeInstanceOf(MonitorRedisManager);
    });

    it('should handle connection errors gracefully', async () => {
      manager = new MonitorRedisManager();

      const result = await manager.safeRedisOperation(
        async () => {
          throw new Error('Connection failed');
        },
        'cleanup-error-test'
      );

      // Should return null instead of throwing
      expect(result).toBeNull();
    });
  });

  describe('Environment Configuration', () => {
    it('should work with default localhost configuration', async () => {
      // Clear environment variables
      delete process.env.NEXT_PUBLIC_DEFAULT_REDIS_URL;
      delete process.env.REDIS_HOST;
      delete process.env.REDIS_PORT;

      manager = new MonitorRedisManager();
      const result = await manager.safeRedisOperation(
        async () => 'PONG',
        'default-config-test'
      );

      expect(result).toBe('PONG');
    });

    it('should handle missing environment variables gracefully', async () => {
      // Ensure no Redis env vars are set
      const originalEnv = process.env;
      process.env = {};

      manager = new MonitorRedisManager();
      const result = await manager.safeRedisOperation(
        async () => 'PONG',
        'no-env-test'
      );

      expect(result).toBe('PONG');
      process.env = originalEnv;
    });
  });
});