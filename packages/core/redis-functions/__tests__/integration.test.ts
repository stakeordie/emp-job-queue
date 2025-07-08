// Integration tests for Redis Functions - Job/Worker capability matching
// Tests the complete orchestration system end-to-end

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { RedisFunctionInstaller } from '../installer.js';
import { WorkerCapabilities } from '../../core/types/worker.js';
import { Job, JobRequirements } from '../../core/types/job.js';

describe('Redis Function Integration Tests', () => {
  let redis: Redis;
  let installer: RedisFunctionInstaller;
  const redisUrl =
    process.env.REDIS_URL || process.env.RAILWAY_REDIS_URL || 'redis://localhost:6379';
  const testDb = process.env.NODE_ENV === 'test' ? 0 : 15; // Use db 0 for Railway, 15 for local

  beforeAll(async () => {
    // Connect to test Redis database
    redis = new Redis(redisUrl, { db: testDb });
    installer = new RedisFunctionInstaller(`${redisUrl}/15`);

    // Wait for Redis connection
    await redis.ping();

    // Install Redis functions
    const result = await installer.installOrUpdate();
    expect(result.success).toBe(true);
    expect(result.functionsInstalled).toContain('findMatchingJob');
  });

  afterAll(async () => {
    // Clean up
    await installer.deleteFunction();
    await installer.close();
    await redis.quit();
  });

  beforeEach(async () => {
    // Clear test data before each test
    await redis.flushdb();
  });

  afterEach(async () => {
    // Clean up after each test
    await redis.flushdb();
  });

  describe('Basic Job Matching', () => {
    it('should match worker with compatible service', async () => {
      // Setup job
      const jobId = 'test-job-1';
      const job = {
        id: jobId,
        service_required: 'comfyui',
        priority: '100',
        payload: JSON.stringify({ prompt: 'test prompt' }),
        requirements: JSON.stringify({}),
        created_at: new Date().toISOString(),
        status: 'pending',
        retry_count: '0',
        max_retries: '3',
      };

      await redis.hmset(`job:${jobId}`, job);
      await redis.zadd('jobs:pending', 100, jobId);

      // Setup compatible worker
      const worker: WorkerCapabilities = {
        worker_id: 'worker-1',
        services: ['comfyui', 'a1111'],
        hardware: { gpu_memory_gb: 16, gpu_model: 'RTX 4090', ram_gb: 32 },
        cpu_cores: 8, // Custom capability using generic system
      };

      // Test function call
      const result = (await redis.fcall('findMatchingJob', 0, JSON.stringify(worker), '10')) as
        | string
        | null;

      expect(result).not.toBeNull();
      const parsed = JSON.parse(result!);
      expect(parsed.jobId).toBe(jobId);
      expect(parsed.job.id).toBe(jobId);

      // Verify job was claimed
      const pendingJobs = await redis.zrange('jobs:pending', 0, -1);
      expect(pendingJobs).not.toContain(jobId);

      // Verify job status updated
      const jobData = await redis.hgetall(`job:${jobId}`);
      expect(jobData.status).toBe('assigned');
      expect(jobData.worker_id).toBe('worker-1');
    });

    it('should reject worker with incompatible service', async () => {
      // Setup job requiring comfyui
      const jobId = 'test-job-2';
      const job = {
        id: jobId,
        service_required: 'comfyui',
        priority: '100',
        payload: JSON.stringify({ prompt: 'test prompt' }),
        requirements: JSON.stringify({}),
        created_at: new Date().toISOString(),
        status: 'pending',
        retry_count: '0',
        max_retries: '3',
      };

      await redis.hmset(`job:${jobId}`, job);
      await redis.zadd('jobs:pending', 100, jobId);

      // Setup worker that only supports a1111
      const worker: WorkerCapabilities = {
        worker_id: 'worker-2',
        services: ['a1111'], // No comfyui support
        hardware: { gpu_memory_gb: 16, gpu_model: 'RTX 3080', ram_gb: 16 },
      };

      // Test function call
      const result = (await redis.fcall('findMatchingJob', 0, JSON.stringify(worker), '10')) as
        | string
        | null;

      expect(result).toBeNull();

      // Verify job was NOT claimed
      const pendingJobs = await redis.zrange('jobs:pending', 0, -1);
      expect(pendingJobs).toContain(jobId);
    });
  });

  describe('Hardware Requirements', () => {
    it('should match worker with sufficient GPU memory', async () => {
      const jobId = 'gpu-job-1';
      const job = {
        id: jobId,
        service_required: 'comfyui',
        priority: '100',
        payload: JSON.stringify({ prompt: 'high res image' }),
        requirements: JSON.stringify({
          hardware: { gpu_memory_gb: 16 },
        }),
        created_at: new Date().toISOString(),
        status: 'pending',
        retry_count: '0',
        max_retries: '3',
      };

      await redis.hmset(`job:${jobId}`, job);
      await redis.zadd('jobs:pending', 100, jobId);

      // Worker with sufficient GPU memory
      const worker: WorkerCapabilities = {
        worker_id: 'gpu-worker-1',
        services: ['comfyui'],
        hardware: { gpu_memory_gb: 24, gpu_model: 'RTX 4090', ram_gb: 32 },
      };

      const result = (await redis.fcall('findMatchingJob', 0, JSON.stringify(worker), '10')) as
        | string
        | null;

      expect(result).not.toBeNull();
      const parsed = JSON.parse(result!);
      expect(parsed.jobId).toBe(jobId);
    });

    it('should reject worker with insufficient GPU memory', async () => {
      const jobId = 'gpu-job-2';
      const job = {
        id: jobId,
        service_required: 'comfyui',
        priority: '100',
        payload: JSON.stringify({ prompt: 'high res image' }),
        requirements: JSON.stringify({
          hardware: { gpu_memory_gb: 24 },
        }),
        created_at: new Date().toISOString(),
        status: 'pending',
        retry_count: '0',
        max_retries: '3',
      };

      await redis.hmset(`job:${jobId}`, job);
      await redis.zadd('jobs:pending', 100, jobId);

      // Worker with insufficient GPU memory
      const worker: WorkerCapabilities = {
        worker_id: 'gpu-worker-2',
        services: ['comfyui'],
        hardware: { gpu_memory_gb: 16, gpu_model: 'RTX 3080', ram_gb: 16 }, // Less than required 24GB
      };

      const result = (await redis.fcall('findMatchingJob', 0, JSON.stringify(worker), '10')) as
        | string
        | null;

      expect(result).toBeNull();

      // Verify job was NOT claimed
      const pendingJobs = await redis.zrange('jobs:pending', 0, -1);
      expect(pendingJobs).toContain(jobId);
    });

    it('should handle multiple hardware requirements', async () => {
      const jobId = 'multi-hw-job';
      const job = {
        id: jobId,
        service_required: 'comfyui',
        priority: '100',
        payload: JSON.stringify({ prompt: 'complex task' }),
        requirements: JSON.stringify({
          hardware: {
            gpu_memory_gb: 16,
            cpu_cores: 8,
            ram_gb: 32,
          },
        }),
        created_at: new Date().toISOString(),
        status: 'pending',
        retry_count: '0',
        max_retries: '3',
      };

      await redis.hmset(`job:${jobId}`, job);
      await redis.zadd('jobs:pending', 100, jobId);

      // Worker that meets all requirements
      const worker: WorkerCapabilities = {
        worker_id: 'multi-hw-worker',
        services: ['comfyui'],
        hardware: {
          gpu_memory_gb: 24, // > 16
          gpu_model: 'RTX 4090',
          ram_gb: 64, // > 32
        },
        cpu_cores: 12, // > 8 - Custom capability using generic system
      };

      const result = (await redis.fcall('findMatchingJob', 0, JSON.stringify(worker), '10')) as
        | string
        | null;

      expect(result).not.toBeNull();
      const parsed = JSON.parse(result!);
      expect(parsed.jobId).toBe(jobId);
    });
  });

  describe('Model Requirements', () => {
    it('should match worker with required models', async () => {
      const jobId = 'model-job-1';
      const job = {
        id: jobId,
        service_required: 'comfyui',
        priority: '100',
        payload: JSON.stringify({ model: 'sdxl' }),
        requirements: JSON.stringify({
          models: ['sdxl'],
        }),
        created_at: new Date().toISOString(),
        status: 'pending',
        retry_count: '0',
        max_retries: '3',
      };

      await redis.hmset(`job:${jobId}`, job);
      await redis.zadd('jobs:pending', 100, jobId);

      // Worker with required model
      const worker: WorkerCapabilities = {
        worker_id: 'model-worker-1',
        services: ['comfyui'],
        models: {
          comfyui: ['sdxl', 'sd15', 'sd21'],
        },
      };

      const result = (await redis.fcall('findMatchingJob', 0, JSON.stringify(worker), '10')) as
        | string
        | null;

      expect(result).not.toBeNull();
      const parsed = JSON.parse(result!);
      expect(parsed.jobId).toBe(jobId);
    });

    it('should reject worker missing required models', async () => {
      const jobId = 'model-job-2';
      const job = {
        id: jobId,
        service_required: 'comfyui',
        priority: '100',
        payload: JSON.stringify({ model: 'sdxl' }),
        requirements: JSON.stringify({
          models: ['sdxl', 'controlnet'],
        }),
        created_at: new Date().toISOString(),
        status: 'pending',
        retry_count: '0',
        max_retries: '3',
      };

      await redis.hmset(`job:${jobId}`, job);
      await redis.zadd('jobs:pending', 100, jobId);

      // Worker missing one required model
      const worker: WorkerCapabilities = {
        worker_id: 'model-worker-2',
        services: ['comfyui'],
        models: {
          comfyui: ['sdxl', 'sd15'], // Missing 'controlnet'
        },
      };

      const result = (await redis.fcall('findMatchingJob', 0, JSON.stringify(worker), '10')) as
        | string
        | null;

      expect(result).toBeNull();
    });
  });

  describe('Customer Isolation', () => {
    it('should respect strict customer isolation', async () => {
      const jobId = 'isolation-job-1';
      const job = {
        id: jobId,
        service_required: 'comfyui',
        customer_id: 'customer-123',
        priority: '100',
        payload: JSON.stringify({ prompt: 'sensitive data' }),
        requirements: JSON.stringify({
          customer_isolation: 'strict',
        }),
        created_at: new Date().toISOString(),
        status: 'pending',
        retry_count: '0',
        max_retries: '3',
      };

      await redis.hmset(`job:${jobId}`, job);
      await redis.zadd('jobs:pending', 100, jobId);

      // Worker with strict isolation
      const strictWorker: WorkerCapabilities = {
        worker_id: 'strict-worker',
        services: ['comfyui'],
        customer_access: {
          isolation: 'strict',
        },
      };

      const result1 = (await redis.fcall(
        'findMatchingJob',
        0,
        JSON.stringify(strictWorker),
        '10'
      )) as string | null;

      expect(result1).not.toBeNull();

      // Reset for next test
      await redis.hmset(`job:${jobId}`, job);
      await redis.zadd('jobs:pending', 100, jobId);

      // Worker without strict isolation should be rejected
      const looseWorker: WorkerCapabilities = {
        worker_id: 'loose-worker',
        services: ['comfyui'],
        customer_access: {
          isolation: 'loose',
        },
      };

      const result2 = (await redis.fcall(
        'findMatchingJob',
        0,
        JSON.stringify(looseWorker),
        '10'
      )) as string | null;

      expect(result2).toBeNull();
    });

    it('should handle customer allowlist', async () => {
      const jobId = 'allowlist-job';
      const job = {
        id: jobId,
        service_required: 'comfyui',
        customer_id: 'customer-456',
        priority: '100',
        payload: JSON.stringify({ prompt: 'test' }),
        requirements: JSON.stringify({}),
        created_at: new Date().toISOString(),
        status: 'pending',
        retry_count: '0',
        max_retries: '3',
      };

      await redis.hmset(`job:${jobId}`, job);
      await redis.zadd('jobs:pending', 100, jobId);

      // Worker with customer in allowlist
      const allowedWorker: WorkerCapabilities = {
        worker_id: 'allowed-worker',
        services: ['comfyui'],
        customer_access: {
          isolation: 'loose',
          allowed_customers: ['customer-456', 'customer-789'],
        },
      };

      const result = (await redis.fcall(
        'findMatchingJob',
        0,
        JSON.stringify(allowedWorker),
        '10'
      )) as string | null;

      expect(result).not.toBeNull();
    });
  });

  describe('Priority Ordering', () => {
    it('should select highest priority job first', async () => {
      // Create jobs with different priorities
      const lowPriorityJob = {
        id: 'low-priority',
        service_required: 'comfyui',
        priority: '50',
        payload: JSON.stringify({ priority: 'low' }),
        requirements: JSON.stringify({}),
        created_at: new Date().toISOString(),
        status: 'pending',
        retry_count: '0',
        max_retries: '3',
      };

      const highPriorityJob = {
        id: 'high-priority',
        service_required: 'comfyui',
        priority: '200',
        payload: JSON.stringify({ priority: 'high' }),
        requirements: JSON.stringify({}),
        created_at: new Date().toISOString(),
        status: 'pending',
        retry_count: '0',
        max_retries: '3',
      };

      // Add jobs (low priority first)
      await redis.hmset('job:low-priority', lowPriorityJob);
      await redis.zadd('jobs:pending', 50, 'low-priority');

      await redis.hmset('job:high-priority', highPriorityJob);
      await redis.zadd('jobs:pending', 200, 'high-priority');

      // Worker that can handle both
      const worker: WorkerCapabilities = {
        worker_id: 'priority-worker',
        services: ['comfyui'],
      };

      const result = (await redis.fcall('findMatchingJob', 0, JSON.stringify(worker), '10')) as
        | string
        | null;

      expect(result).not.toBeNull();
      const parsed = JSON.parse(result!);
      expect(parsed.jobId).toBe('high-priority'); // Should get high priority job
    });
  });

  describe('Custom Capabilities', () => {
    it('should handle unlimited custom requirements', async () => {
      const jobId = 'custom-job';
      const job = {
        id: jobId,
        service_required: 'comfyui',
        priority: '100',
        payload: JSON.stringify({ custom: true }),
        requirements: JSON.stringify({
          region: 'us-west',
          certification: 'hipaa',
          speed_tier: 'premium',
          custom_feature: {
            enabled: true,
            version: 2,
          },
        }),
        created_at: new Date().toISOString(),
        status: 'pending',
        retry_count: '0',
        max_retries: '3',
      };

      await redis.hmset(`job:${jobId}`, job);
      await redis.zadd('jobs:pending', 100, jobId);

      // Worker with matching custom capabilities
      const worker: WorkerCapabilities = {
        worker_id: 'custom-worker',
        services: ['comfyui'],
        region: 'us-west',
        certification: 'hipaa',
        speed_tier: 'premium',
        custom_feature: {
          enabled: true,
          version: 3, // Higher version should match
        },
      };

      const result = (await redis.fcall('findMatchingJob', 0, JSON.stringify(worker), '10')) as
        | string
        | null;

      expect(result).not.toBeNull();
      const parsed = JSON.parse(result!);
      expect(parsed.jobId).toBe(jobId);
    });

    it('should reject worker missing custom capabilities', async () => {
      const jobId = 'custom-job-2';
      const job = {
        id: jobId,
        service_required: 'comfyui',
        priority: '100',
        payload: JSON.stringify({ custom: true }),
        requirements: JSON.stringify({
          special_hardware: 'quantum_processor',
          compliance: ['sox', 'pci'],
        }),
        created_at: new Date().toISOString(),
        status: 'pending',
        retry_count: '0',
        max_retries: '3',
      };

      await redis.hmset(`job:${jobId}`, job);
      await redis.zadd('jobs:pending', 100, jobId);

      // Worker missing custom capabilities
      const worker: WorkerCapabilities = {
        worker_id: 'basic-worker',
        services: ['comfyui'],
        // Missing special_hardware and compliance
      };

      const result = (await redis.fcall('findMatchingJob', 0, JSON.stringify(worker), '10')) as
        | string
        | null;

      expect(result).toBeNull();
    });
  });

  describe('Concurrent Claims', () => {
    it('should handle multiple workers claiming the same job atomically', async () => {
      const jobId = 'concurrent-job';
      const job = {
        id: jobId,
        service_required: 'comfyui',
        priority: '100',
        payload: JSON.stringify({ test: 'concurrency' }),
        requirements: JSON.stringify({}),
        created_at: new Date().toISOString(),
        status: 'pending',
        retry_count: '0',
        max_retries: '3',
      };

      await redis.hmset(`job:${jobId}`, job);
      await redis.zadd('jobs:pending', 100, jobId);

      // Multiple compatible workers
      const worker1: WorkerCapabilities = {
        worker_id: 'worker-1',
        services: ['comfyui'],
      };

      const worker2: WorkerCapabilities = {
        worker_id: 'worker-2',
        services: ['comfyui'],
      };

      // Simulate concurrent claims
      const [result1, result2] = await Promise.all([
        redis.fcall('findMatchingJob', 0, JSON.stringify(worker1), '10'),
        redis.fcall('findMatchingJob', 0, JSON.stringify(worker2), '10'),
      ]);

      // Only one should succeed
      const successCount = [result1, result2].filter(r => r !== null).length;
      expect(successCount).toBe(1);

      // Job should be removed from pending
      const pendingJobs = await redis.zrange('jobs:pending', 0, -1);
      expect(pendingJobs).not.toContain(jobId);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty job queue', async () => {
      const worker: WorkerCapabilities = {
        worker_id: 'empty-queue-worker',
        services: ['comfyui'],
      };

      const result = (await redis.fcall('findMatchingJob', 0, JSON.stringify(worker), '10')) as
        | string
        | null;

      expect(result).toBeNull();
    });

    it('should handle malformed job requirements', async () => {
      const jobId = 'malformed-job';
      const job = {
        id: jobId,
        service_required: 'comfyui',
        priority: '100',
        payload: JSON.stringify({ test: true }),
        requirements: 'invalid json{', // Malformed JSON
        created_at: new Date().toISOString(),
        status: 'pending',
        retry_count: '0',
        max_retries: '3',
      };

      await redis.hmset(`job:${jobId}`, job);
      await redis.zadd('jobs:pending', 100, jobId);

      const worker: WorkerCapabilities = {
        worker_id: 'resilient-worker',
        services: ['comfyui'],
      };

      // Should not crash and should still match (empty requirements)
      const result = (await redis.fcall('findMatchingJob', 0, JSON.stringify(worker), '10')) as
        | string
        | null;

      expect(result).not.toBeNull();
    });

    it('should respect maxScan parameter', async () => {
      // Create multiple jobs
      for (let i = 0; i < 5; i++) {
        const jobId = `scan-test-${i}`;
        const job = {
          id: jobId,
          service_required: 'a1111', // Different service so they won't match
          priority: '100',
          payload: JSON.stringify({ index: i }),
          requirements: JSON.stringify({}),
          created_at: new Date().toISOString(),
          status: 'pending',
          retry_count: '0',
          max_retries: '3',
        };

        await redis.hmset(`job:${jobId}`, job);
        await redis.zadd('jobs:pending', 100, jobId);
      }

      const worker: WorkerCapabilities = {
        worker_id: 'limited-scan-worker',
        services: ['comfyui'], // Won't match any jobs
      };

      // Should only scan first 3 jobs
      const result = (await redis.fcall('findMatchingJob', 0, JSON.stringify(worker), '3')) as
        | string
        | null;

      expect(result).toBeNull(); // No matches expected
    });
  });
});
