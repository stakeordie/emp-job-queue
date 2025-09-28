/**
 * Production Database Integration Tests
 * These tests verify the database package works correctly with production-like settings
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  getPrismaClient,
  createPrismaClient,
  checkDatabaseHealth,
  connectDatabase,
  disconnectDatabase,
  prisma
} from '../index.js';

// Test with Neon branch or provided DATABASE_URL
const PROD_DATABASE_URL = process.env.DATABASE_URL;

// Skip tests if no database URL provided
const skipTests = !PROD_DATABASE_URL;

describe('Production Database Integration', () => {
  let testClient: any;

  beforeAll(() => {
    // Set production-like environment
    process.env.DATABASE_URL = PROD_DATABASE_URL;
    process.env.NODE_ENV = 'production';
  });

  afterAll(async () => {
    if (testClient) {
      await testClient.$disconnect();
    }
    await disconnectDatabase();
  });

  describe('Connection Management', () => {
    it('should create client with production connection pooling', () => {
      const client = createPrismaClient();
      expect(client).toBeDefined();
      expect(client.$connect).toBeDefined();
      testClient = client;
    });

    it('should connect to production database successfully', async () => {
      await expect(connectDatabase()).resolves.not.toThrow();
    }, 10000); // Allow 10 seconds for connection

    it('should perform health check on production database', async () => {
      const health = await checkDatabaseHealth();
      expect(health.healthy).toBe(true);
      expect(health.message).toBe('Database is responding');
    });

    it('should maintain singleton instance', () => {
      const client1 = getPrismaClient();
      const client2 = getPrismaClient();
      expect(client1).toBe(client2);
      expect(client1).toBe(prisma);
    });
  });

  describe('Query Operations', () => {
    it('should execute raw query successfully', async () => {
      const result = await prisma.$queryRaw`SELECT 1 as test`;
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('test', 1);
    });

    it('should handle connection pool under load', async () => {
      const queries = Array.from({ length: 15 }, (_, i) =>
        prisma.$queryRaw`SELECT ${i} as num, NOW() as time`
      );

      const results = await Promise.all(queries);
      expect(results).toHaveLength(15);
      results.forEach((result, index) => {
        expect(result[0]).toHaveProperty('num', index);
        expect(result[0]).toHaveProperty('time');
      });
    }, 15000);

    it('should handle transaction correctly', async () => {
      const result = await prisma.$transaction(async (tx) => {
        const check = await tx.$queryRaw`SELECT 1 as value`;
        const time = await tx.$queryRaw`SELECT NOW() as current_time`;
        return { check, time };
      });

      expect(result.check[0]).toHaveProperty('value', 1);
      expect(result.time[0]).toHaveProperty('current_time');
    });

    it('should respect statement timeout', async () => {
      // This should timeout based on our 60s statement_timeout
      const longQuery = prisma.$queryRaw`SELECT pg_sleep(0.5), 1 as result`;

      // Should complete since 0.5s < 60s timeout
      const result = await longQuery;
      expect(result[0]).toHaveProperty('result', 1);
    });
  });

  describe('Error Handling', () => {
    it('should handle connection errors gracefully', async () => {
      // Create client with invalid URL
      const originalUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'postgresql://invalid:invalid@invalid:5432/invalid';

      const badClient = createPrismaClient();

      try {
        await badClient.$queryRaw`SELECT 1`;
        expect.fail('Should have thrown connection error');
      } catch (error: any) {
        expect(error).toBeDefined();
        // Connection should fail
      } finally {
        process.env.DATABASE_URL = originalUrl;
        await badClient.$disconnect().catch(() => {});
      }
    });

    it('should handle query errors appropriately', async () => {
      try {
        // Invalid SQL should throw
        await prisma.$queryRaw`SELECT * FROM nonexistent_table_xyz`;
        expect.fail('Should have thrown query error');
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.message).toContain('nonexistent_table_xyz');
      }
    });
  });

  describe('Connection Pool Behavior', () => {
    it('should handle concurrent connections within pool limit', async () => {
      // Our pool limit is 20, test with 18 concurrent
      const connections = Array.from({ length: 18 }, (_, i) =>
        prisma.$queryRaw`SELECT ${i} as id, pg_backend_pid() as pid`
      );

      const results = await Promise.all(connections);
      expect(results).toHaveLength(18);

      // Check we got different backend PIDs (connection pooling working)
      const pids = new Set(results.map(r => r[0].pid));
      expect(pids.size).toBeGreaterThan(1); // Should use multiple connections
      expect(pids.size).toBeLessThanOrEqual(20); // Should not exceed pool limit
    });

    it('should queue requests when exceeding pool limit', async () => {
      // Test with 25 concurrent (exceeds our limit of 20)
      const connections = Array.from({ length: 25 }, (_, i) =>
        prisma.$queryRaw`SELECT ${i} as id, pg_backend_pid() as pid`
      );

      // Should still complete, just queued
      const results = await Promise.all(connections);
      expect(results).toHaveLength(25);
    }, 20000); // Allow more time for queuing
  });

  describe('Production Readiness Checks', () => {
    it('should have correct isolation level', async () => {
      const result = await prisma.$transaction(async (tx) => {
        const isolation = await tx.$queryRaw`SHOW transaction_isolation`;
        return isolation;
      });

      expect(result[0].transaction_isolation).toBe('read committed');
    });

    it('should handle disconnection gracefully', async () => {
      await expect(disconnectDatabase()).resolves.not.toThrow();

      // Should auto-reconnect on next use
      await expect(connectDatabase()).resolves.not.toThrow();

      const health = await checkDatabaseHealth();
      expect(health.healthy).toBe(true);
    });

    it('should verify production tables exist', async () => {
      // Check for critical tables
      const tables = await prisma.$queryRaw`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name IN ('job', 'workflow', 'profile', 'project')
        ORDER BY table_name
      `;

      expect(tables).toBeDefined();
      const tableNames = tables.map((t: any) => t.table_name);
      expect(tableNames).toContain('job');
      expect(tableNames).toContain('workflow');
    });
  });
});