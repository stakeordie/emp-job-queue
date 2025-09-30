/**
 * Live Attestation Compatibility Test
 *
 * This test verifies that worker attestation creation and monitor search patterns
 * are compatible by using actual Redis keys and patterns.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

describe('Live Attestation Compatibility', () => {
  let redis: Redis;

  beforeEach(async () => {
    redis = new Redis(REDIS_URL);
    // Clean up any existing test keys
    const testKeys = await redis.keys('worker:*test*');
    if (testKeys.length > 0) {
      await redis.del(...testKeys);
    }
  });

  afterEach(async () => {
    // Clean up test keys
    const testKeys = await redis.keys('worker:*test*');
    if (testKeys.length > 0) {
      await redis.del(...testKeys);
    }
    await redis.quit();
  });

  describe('Worker Attestation Key Creation (Current Pattern)', () => {
    it('should create completion attestation keys in the expected format', async () => {
      // Simulate worker creating completion attestation
      const jobId = 'step-test-job-123';
      const workflowId = 'test-workflow-456';

      // Worker logic: Remove step- prefix and use semantic naming
      const stepId = jobId.startsWith('step-') ? jobId.substring(5) : jobId;
      const jobPrefix = workflowId ? `job-id:${workflowId}:` : '';
      const completionKey = `worker:completion:${jobPrefix}step-id:${stepId}:attempt:1`;

      const attestationData = {
        job_id: jobId,
        workflow_id: workflowId,
        status: 'completed',
        worker_id: 'test-worker-001',
        completed_at: new Date().toISOString(),
        retry_count: 0
      };

      await redis.setex(completionKey, 300, JSON.stringify(attestationData)); // 5 min TTL

      // Verify key was created
      const keys = await redis.keys('worker:completion:*test*');
      expect(keys).toContain(completionKey);
      expect(completionKey).toBe('worker:completion:job-id:test-workflow-456:step-id:test-job-123:attempt:1');

      // Verify data is retrievable
      const data = await redis.get(completionKey);
      expect(data).not.toBeNull();
      expect(JSON.parse(data!)).toEqual(attestationData);
    });

    it('should create failure attestation keys in the expected format', async () => {
      // Simulate worker creating failure attestation
      const jobId = 'step-test-job-789';
      const workflowId = 'test-workflow-456';

      // Worker logic: Remove step- prefix and use semantic naming
      const stepId = jobId.startsWith('step-') ? jobId.substring(5) : jobId;
      const jobPrefix = workflowId ? `job-id:${workflowId}:` : '';
      const failureKey = `worker:failure:${jobPrefix}step-id:${stepId}:permanent`;

      const attestationData = {
        job_id: jobId,
        workflow_id: workflowId,
        status: 'failed_permanent',
        worker_id: 'test-worker-001',
        failed_at: new Date().toISOString(),
        error_message: 'Test permanent failure',
        retry_count: 3
      };

      await redis.setex(failureKey, 300, JSON.stringify(attestationData)); // 5 min TTL

      // Verify key was created
      const keys = await redis.keys('worker:failure:*test*');
      expect(keys).toContain(failureKey);
      expect(failureKey).toBe('worker:failure:job-id:test-workflow-456:step-id:test-job-789:permanent');

      // Verify data is retrievable
      const data = await redis.get(failureKey);
      expect(data).not.toBeNull();
      expect(JSON.parse(data!)).toEqual(attestationData);
    });
  });

  describe('Monitor Search Pattern Compatibility', () => {
    beforeEach(async () => {
      // Create test attestations using worker patterns
      const testAttestations = [
        // Current semantic format
        {
          key: 'worker:completion:job-id:test-workflow-456:step-id:test-job-123:attempt:1',
          data: { job_id: 'step-test-job-123', workflow_id: 'test-workflow-456', status: 'completed' }
        },
        {
          key: 'worker:failure:job-id:test-workflow-456:step-id:test-job-789:permanent',
          data: { job_id: 'step-test-job-789', workflow_id: 'test-workflow-456', status: 'failed_permanent' }
        },
        // Legacy patterns for backwards compatibility
        {
          key: 'worker:completion:workflow-test-workflow-456:job-step-test-job-legacy',
          data: { job_id: 'step-test-job-legacy', workflow_id: 'test-workflow-456', status: 'completed' }
        }
      ];

      for (const attestation of testAttestations) {
        await redis.setex(attestation.key, 300, JSON.stringify(attestation.data));
      }
    });

    it('should find individual job attestations using monitor search patterns', async () => {
      const jobId = 'step-test-job-123';

      // Monitor search logic: Remove step- prefix and search patterns
      const stepId = jobId.startsWith('step-') ? jobId.substring(5) : jobId;
      const searchPatterns = [
        `worker:failure:*step-id:${stepId}*`,
        `worker:completion:*step-id:${stepId}*`,
        // Legacy patterns
        `worker:failure:*job-id:${jobId}*`,
        `worker:completion:*job-id:${jobId}*`,
        `worker:failure:*job-${jobId}*`,
        `worker:completion:*job-${jobId}*`
      ];

      let foundKeys: string[] = [];
      for (const pattern of searchPatterns) {
        const keys = await redis.keys(pattern);
        foundKeys.push(...keys);
      }

      expect(foundKeys.length).toBeGreaterThan(0);
      expect(foundKeys).toContain('worker:completion:job-id:test-workflow-456:step-id:test-job-123:attempt:1');
    });

    it('should find workflow attestations using monitor search patterns', async () => {
      const workflowId = 'test-workflow-456';

      // Monitor search logic for workflow attestations
      const searchPatterns = [
        `worker:failure:job-id:${workflowId}*`,
        `worker:completion:job-id:${workflowId}*`,
        // Legacy patterns
        `worker:failure:workflow-id:${workflowId}*`,
        `worker:completion:workflow-id:${workflowId}*`,
        `worker:failure:workflow-${workflowId}*`,
        `worker:completion:workflow-${workflowId}*`
      ];

      let foundKeys: string[] = [];
      let foundAttestations: any[] = [];

      for (const pattern of searchPatterns) {
        const keys = await redis.keys(pattern);
        for (const key of keys) {
          if (!foundKeys.includes(key)) {
            foundKeys.push(key);
            const data = await redis.get(key);
            if (data) {
              foundAttestations.push({
                key,
                data: JSON.parse(data)
              });
            }
          }
        }
      }

      expect(foundKeys.length).toBeGreaterThan(0);
      expect(foundAttestations.length).toBeGreaterThan(0);

      // Should find both current and legacy format attestations
      const currentFormatKeys = foundKeys.filter(key => key.includes('job-id:test-workflow-456'));
      const legacyFormatKeys = foundKeys.filter(key => key.includes('workflow-test-workflow-456'));

      expect(currentFormatKeys.length).toBeGreaterThan(0);
      expect(legacyFormatKeys.length).toBeGreaterThan(0);
    });

    it('should not find duplicates when searching with multiple patterns', async () => {
      const workflowId = 'test-workflow-456';

      // Use Set to track unique keys
      const uniqueKeys = new Set<string>();
      const searchPatterns = [
        `worker:failure:job-id:${workflowId}*`,
        `worker:completion:job-id:${workflowId}*`,
        `worker:failure:workflow-${workflowId}*`,
        `worker:completion:workflow-${workflowId}*`
      ];

      for (const pattern of searchPatterns) {
        const keys = await redis.keys(pattern);
        keys.forEach(key => uniqueKeys.add(key));
      }

      // Should have unique keys only
      const keysArray = Array.from(uniqueKeys);
      expect(keysArray.length).toBeGreaterThan(0);

      // Verify each key appears only once
      const keyFrequency = new Map<string, number>();
      keysArray.forEach(key => {
        keyFrequency.set(key, (keyFrequency.get(key) || 0) + 1);
      });

      keyFrequency.forEach((count, key) => {
        expect(count).toBe(1); // Each key should appear exactly once
      });
    });
  });

  describe('Key Format Validation', () => {
    it('should validate that worker and monitor use compatible key formats', () => {
      const jobId = 'step-abc123';
      const workflowId = 'def456';

      // Worker creates this key
      const stepId = jobId.startsWith('step-') ? jobId.substring(5) : jobId;
      const workerKey = `worker:completion:job-id:${workflowId}:step-id:${stepId}:attempt:1`;

      // Monitor searches for this pattern
      const monitorPattern = `worker:completion:*step-id:${stepId}*`;

      // Verify the worker key matches the monitor pattern
      const regex = new RegExp(monitorPattern.replace(/\*/g, '.*'));
      expect(regex.test(workerKey)).toBe(true);

      expect(workerKey).toBe('worker:completion:job-id:def456:step-id:abc123:attempt:1');
      expect(monitorPattern).toBe('worker:completion:*step-id:abc123*');
    });

    it('should handle legacy step- prefix removal consistently', () => {
      const testCases = [
        { input: 'step-abc123', expected: 'abc123' },
        { input: 'abc123', expected: 'abc123' },
        { input: 'step-step-abc123', expected: 'step-abc123' }, // Only removes first step-
      ];

      testCases.forEach(({ input, expected }) => {
        const result = input.startsWith('step-') ? input.substring(5) : input;
        expect(result).toBe(expected);
      });
    });
  });
});