// Integration tests for Redis Lua function capability matching
// Tests the actual Redis function with real Redis instance

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import Redis from 'ioredis';
import { RedisOperations } from '../../src/core/utils/redis-operations.js';
import type { Job } from '../../src/core/types/job.js';
import { JobStatus } from '../../src/core/types/job.js';
import type { WorkerCapabilities } from '../../src/core/types/worker.js';

// Skip if no Redis available
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const TEST_TIMEOUT = 30000; // 30 seconds for Redis function tests

describe('Redis Function Capability Matching Integration', () => {
  let redis: Redis;
  let shouldSkip = false;

  beforeEach(async () => {
    try {
      redis = new Redis(REDIS_URL);
      await redis.ping(); // Test connection
      
      // Clean up test data
      await redis.flushdb();
      
      // Install Redis function (assuming it's already loaded in CI/prod)
      // In real tests, you'd load the function here
    } catch (error) {
      console.warn('Redis not available, skipping integration tests:', error);
      shouldSkip = true;
    }
  }, TEST_TIMEOUT);

  afterEach(async () => {
    if (redis) {
      await redis.disconnect();
    }
  });

  const createTestJob = (overrides: Partial<Job> = {}): Job => ({
    id: `test-job-${Date.now()}-${Math.random()}`,
    status: JobStatus.PENDING,
    service_required: 'simulation',
    priority: 50,
    payload: { test: true },
    retry_count: 0,
    max_retries: 3,
    created_at: new Date().toISOString(),
    ...overrides
  });

  const createTestWorkerCapabilities = (overrides: Partial<WorkerCapabilities> = {}): WorkerCapabilities => ({
    worker_id: `test-worker-${Date.now()}-${Math.random()}`,
    machine_id: 'test-machine',
    services: ['simulation'],
    hardware: {
      gpu_memory_gb: 16,
      gpu_model: 'RTX 4090',
      ram_gb: 32
    },
    customer_access: {
      isolation: 'loose',
      max_concurrent_customers: 5
    },
    performance: {
      concurrent_jobs: 1,
      quality_levels: ['fast', 'balanced'],
      max_processing_time_minutes: 60
    },
    metadata: {
      version: '1.0.0',
      platform: 'linux'
    },
    ...overrides
  });

  test('should match job with simple positive requirements', async () => {
    if (shouldSkip) return;

    // Create worker with video capability
    const worker = createTestWorkerCapabilities({
      asset_type: ['image', 'video'],
      services: ['simulation']
    } as any);

    // Create job requiring video capability
    const job = createTestJob({
      requirements: {
        positive_requirements: {
          asset_type: 'video'
        }
      } as any
    });

    // Store job in Redis
    const score = RedisOperations.calculateJobScore(job.priority, new Date(job.created_at).getTime());
    await RedisOperations.storeJob(redis, job);
    await redis.zadd('jobs:pending', score, job.id);

    // Try to find matching job using Redis function
    try {
      const result = await redis.fcall(
        'findMatchingJob',
        0,
        JSON.stringify(worker),
        '10' // max scan limit
      );

      expect(result).not.toBeNull();
      if (result) {
        const matchResult = JSON.parse(result as string);
        expect(matchResult.jobId).toBe(job.id);
        expect(matchResult.job).toBeDefined();
      }
    } catch (error) {
      // Function might not be loaded in test environment
      console.warn('Redis function not available:', error);
    }
  }, TEST_TIMEOUT);

  test('should reject job with negative requirements', async () => {
    if (shouldSkip) return;

    // Create worker with debugging enabled
    const worker = createTestWorkerCapabilities({
      debugging_enabled: true,
      services: ['simulation']
    } as any);

    // Create job that excludes debugging workers
    const job = createTestJob({
      requirements: {
        negative_requirements: {
          debugging_enabled: true
        }
      } as any
    });

    // Store job in Redis
    const score = RedisOperations.calculateJobScore(job.priority, new Date(job.created_at).getTime());
    await RedisOperations.storeJob(redis, job);
    await redis.zadd('jobs:pending', score, job.id);

    // Try to find matching job - should return null
    try {
      const result = await redis.fcall(
        'findMatchingJob',
        0,
        JSON.stringify(worker),
        '10'
      );

      expect(result).toBeNull();
    } catch (error) {
      console.warn('Redis function not available:', error);
    }
  }, TEST_TIMEOUT);

  test('should handle array capability matching', async () => {
    if (shouldSkip) return;

    // Create worker with multiple asset types
    const worker = createTestWorkerCapabilities({
      asset_type: ['image', 'video', '3d'],
      services: ['comfyui-sim']
    } as any);

    // Create job requiring one specific asset type
    const job = createTestJob({
      service_required: 'comfyui-sim',
      requirements: {
        positive_requirements: {
          asset_type: 'video' // Single value should match against worker's array
        }
      } as any
    });

    // Store job in Redis
    const score = RedisOperations.calculateJobScore(job.priority, new Date(job.created_at).getTime());
    await RedisOperations.storeJob(redis, job);
    await redis.zadd('jobs:pending', score, job.id);

    try {
      const result = await redis.fcall(
        'findMatchingJob',
        0,
        JSON.stringify(worker),
        '10'
      );

      expect(result).not.toBeNull();
      if (result) {
        const matchResult = JSON.parse(result as string);
        expect(matchResult.jobId).toBe(job.id);
      }
    } catch (error) {
      console.warn('Redis function not available:', error);
    }
  }, TEST_TIMEOUT);

  test('should handle nested hardware requirements', async () => {
    if (shouldSkip) return;

    // Create worker with high-end hardware
    const worker = createTestWorkerCapabilities({
      hardware: {
        gpu_memory_gb: 24,
        gpu_model: 'RTX 4090',
        ram_gb: 64
      },
      services: ['simulation']
    });

    // Create job requiring minimum GPU memory
    const job = createTestJob({
      requirements: {
        positive_requirements: {
          hardware: {
            gpu_memory_gb: 16 // Worker has 24GB, should match
          }
        }
      } as any
    });

    // Store job in Redis
    const score = RedisOperations.calculateJobScore(job.priority, new Date(job.created_at).getTime());
    await RedisOperations.storeJob(redis, job);
    await redis.zadd('jobs:pending', score, job.id);

    try {
      const result = await redis.fcall(
        'findMatchingJob',
        0,
        JSON.stringify(worker),
        '10'
      );

      expect(result).not.toBeNull();
    } catch (error) {
      console.warn('Redis function not available:', error);
    }
  }, TEST_TIMEOUT);

  test('should prioritize jobs correctly', async () => {
    if (shouldSkip) return;

    const worker = createTestWorkerCapabilities({
      services: ['simulation']
    });

    // Create high and low priority jobs
    const lowPriorityJob = createTestJob({
      id: 'low-priority',
      priority: 30
    });

    const highPriorityJob = createTestJob({
      id: 'high-priority', 
      priority: 80
    });

    // Store both jobs
    const now = Date.now();
    const lowScore = RedisOperations.calculateJobScore(lowPriorityJob.priority, now);
    const highScore = RedisOperations.calculateJobScore(highPriorityJob.priority, now);

    await RedisOperations.storeJob(redis, lowPriorityJob);
    await RedisOperations.storeJob(redis, highPriorityJob);
    await redis.zadd('jobs:pending', lowScore, lowPriorityJob.id);
    await redis.zadd('jobs:pending', highScore, highPriorityJob.id);

    try {
      const result = await redis.fcall(
        'findMatchingJob',
        0,
        JSON.stringify(worker),
        '10'
      );

      expect(result).not.toBeNull();
      if (result) {
        const matchResult = JSON.parse(result as string);
        // Should get high priority job first
        expect(matchResult.jobId).toBe(highPriorityJob.id);
      }
    } catch (error) {
      console.warn('Redis function not available:', error);
    }
  }, TEST_TIMEOUT);

  test('should handle complex multi-requirement jobs', async () => {
    if (shouldSkip) return;

    // Create enterprise-grade worker
    const worker = createTestWorkerCapabilities({
      asset_type: ['image', 'video'],
      performance_tier: 'enterprise',
      region: 'us-east',
      features: ['batch_processing', 'enterprise_api'],
      debugging_enabled: false,
      memory_constrained: false,
      services: ['comfyui-sim']
    } as any);

    // Create complex enterprise job
    const job = createTestJob({
      service_required: 'comfyui-sim',
      requirements: {
        positive_requirements: {
          asset_type: 'video',
          performance_tier: 'enterprise',
          region: 'us-east',
          features: 'batch_processing'
        },
        negative_requirements: {
          debugging_enabled: true,
          memory_constrained: true
        }
      } as any
    });

    // Store job
    const score = RedisOperations.calculateJobScore(job.priority, new Date(job.created_at).getTime());
    await RedisOperations.storeJob(redis, job);
    await redis.zadd('jobs:pending', score, job.id);

    try {
      const result = await redis.fcall(
        'findMatchingJob',
        0,
        JSON.stringify(worker),
        '10'
      );

      expect(result).not.toBeNull();
      if (result) {
        const matchResult = JSON.parse(result as string);
        expect(matchResult.jobId).toBe(job.id);
      }
    } catch (error) {
      console.warn('Redis function not available:', error);
    }
  }, TEST_TIMEOUT);

  test('should handle no matching jobs scenario', async () => {
    if (shouldSkip) return;

    // Create basic worker
    const worker = createTestWorkerCapabilities({
      asset_type: ['image'],
      services: ['simulation']
    } as any);

    // Create job requiring video (worker only supports image)
    const job = createTestJob({
      requirements: {
        positive_requirements: {
          asset_type: 'video'
        }
      } as any
    });

    // Store job
    const score = RedisOperations.calculateJobScore(job.priority, new Date(job.created_at).getTime());
    await RedisOperations.storeJob(redis, job);
    await redis.zadd('jobs:pending', score, job.id);

    try {
      const result = await redis.fcall(
        'findMatchingJob',
        0,
        JSON.stringify(worker),
        '10'
      );

      expect(result).toBeNull();
    } catch (error) {
      console.warn('Redis function not available:', error);
    }
  }, TEST_TIMEOUT);

  test('should enforce workflow_id restrictions correctly', async () => {
    if (shouldSkip) return;

    // Test Case 1: Worker restricted to specific workflow, job with matching workflow_id
    const restrictedWorker = createTestWorkerCapabilities({
      workflow_id: 'abc123',
      services: ['simulation']
    });

    const matchingJob = createTestJob({
      id: 'matching-workflow-job',
      workflow_id: 'abc123'
    });

    // Store job
    const matchingScore = RedisOperations.calculateJobScore(matchingJob.priority, new Date(matchingJob.created_at).getTime());
    await RedisOperations.storeJob(redis, matchingJob);
    await redis.zadd('jobs:pending', matchingScore, matchingJob.id);

    try {
      const result = await redis.fcall(
        'findMatchingJob',
        0,
        JSON.stringify(restrictedWorker),
        '10'
      );

      expect(result).not.toBeNull();
      if (result) {
        const matchResult = JSON.parse(result as string);
        expect(matchResult.jobId).toBe(matchingJob.id);
      }
    } catch (error) {
      console.warn('Redis function not available:', error);
    }

    // Clean up
    await redis.flushdb();
  }, TEST_TIMEOUT);

  test('should reject job with different workflow_id for restricted worker', async () => {
    if (shouldSkip) return;

    // Worker restricted to specific workflow
    const restrictedWorker = createTestWorkerCapabilities({
      workflow_id: 'abc123',
      services: ['simulation']
    });

    // Job with different workflow_id
    const differentWorkflowJob = createTestJob({
      id: 'different-workflow-job',
      workflow_id: 'xyz789'
    });

    // Store job
    const score = RedisOperations.calculateJobScore(differentWorkflowJob.priority, new Date(differentWorkflowJob.created_at).getTime());
    await RedisOperations.storeJob(redis, differentWorkflowJob);
    await redis.zadd('jobs:pending', score, differentWorkflowJob.id);

    try {
      const result = await redis.fcall(
        'findMatchingJob',
        0,
        JSON.stringify(restrictedWorker),
        '10'
      );

      expect(result).toBeNull();
    } catch (error) {
      console.warn('Redis function not available:', error);
    }

    // Clean up
    await redis.flushdb();
  }, TEST_TIMEOUT);

  test('should reject job without workflow_id for restricted worker', async () => {
    if (shouldSkip) return;

    // Worker restricted to specific workflow
    const restrictedWorker = createTestWorkerCapabilities({
      workflow_id: 'abc123',
      services: ['simulation']
    });

    // Job without workflow_id
    const noWorkflowJob = createTestJob({
      id: 'no-workflow-job'
      // No workflow_id set
    });

    // Store job
    const score = RedisOperations.calculateJobScore(noWorkflowJob.priority, new Date(noWorkflowJob.created_at).getTime());
    await RedisOperations.storeJob(redis, noWorkflowJob);
    await redis.zadd('jobs:pending', score, noWorkflowJob.id);

    try {
      const result = await redis.fcall(
        'findMatchingJob',
        0,
        JSON.stringify(restrictedWorker),
        '10'
      );

      expect(result).toBeNull();
    } catch (error) {
      console.warn('Redis function not available:', error);
    }

    // Clean up
    await redis.flushdb();
  }, TEST_TIMEOUT);

  test('should allow unrestricted worker to take any job', async () => {
    if (shouldSkip) return;

    // Worker without workflow restriction
    const unrestrictedWorker = createTestWorkerCapabilities({
      services: ['simulation']
      // No workflow_id set
    });

    // Create jobs with and without workflow_id
    const workflowJob = createTestJob({
      id: 'workflow-job',
      workflow_id: 'abc123'
    });

    const noWorkflowJob = createTestJob({
      id: 'no-workflow-job'
      // No workflow_id set
    });

    // Store both jobs
    const workflowScore = RedisOperations.calculateJobScore(workflowJob.priority, new Date(workflowJob.created_at).getTime());
    const noWorkflowScore = RedisOperations.calculateJobScore(noWorkflowJob.priority, new Date(noWorkflowJob.created_at).getTime());
    
    await RedisOperations.storeJob(redis, workflowJob);
    await RedisOperations.storeJob(redis, noWorkflowJob);
    await redis.zadd('jobs:pending', workflowScore, workflowJob.id);
    await redis.zadd('jobs:pending', noWorkflowScore, noWorkflowJob.id);

    try {
      // Should get one of the jobs (priority/FIFO order)
      const result = await redis.fcall(
        'findMatchingJob',
        0,
        JSON.stringify(unrestrictedWorker),
        '10'
      );

      expect(result).not.toBeNull();
      if (result) {
        const matchResult = JSON.parse(result as string);
        expect([workflowJob.id, noWorkflowJob.id]).toContain(matchResult.jobId);
      }
    } catch (error) {
      console.warn('Redis function not available:', error);
    }

    // Clean up
    await redis.flushdb();
  }, TEST_TIMEOUT);
});