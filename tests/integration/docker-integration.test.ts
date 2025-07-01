/**
 * Docker-based Integration Test for Multi-GPU Job Processing
 * 
 * This test spins up a complete isolated environment with:
 * - Redis instance
 * - Hub service
 * - 4 GPU servers with 15 total workers across different GPU configurations
 * - Mock AI services for realistic job processing
 * 
 * Tests the complete job lifecycle from submission to completion
 * with realistic worker capabilities and GPU-to-service binding.
 */

import { execSync } from 'child_process';
import { Redis } from 'ioredis';
import WebSocket from 'ws';
import { logger } from '@core/utils/logger';

// Use built-in fetch in Node 18+
declare global {
  var fetch: any;
}

if (!global.fetch) {
  // @ts-ignore
  global.fetch = require('node-fetch');
}

describe('Docker Multi-GPU Integration Test', () => {
  const DOCKER_COMPOSE_FILE = 'tests/integration/docker-compose.test.yml';
  const REDIS_URL = 'redis://localhost:6380';
  const HUB_WS_URL = 'ws://localhost:3012';
  
  let redis: Redis;
  let wsClient: WebSocket;

  beforeAll(async () => {
    // Start the Docker environment
    logger.info('🐳 Starting Docker test environment...');
    execSync(`docker-compose -f ${DOCKER_COMPOSE_FILE} up -d`, { stdio: 'inherit' });
    
    // Wait for services to be ready
    await waitForServices();
    
    // Connect to Redis and WebSocket
    redis = new Redis(REDIS_URL);
    wsClient = new WebSocket(HUB_WS_URL);
    
    await new Promise(resolve => {
      wsClient.on('open', resolve);
    });

    logger.info('✅ Test environment ready');
  }, 120000); // 2 minutes timeout for Docker startup

  afterAll(async () => {
    // Cleanup connections
    if (redis) await redis.quit();
    if (wsClient) wsClient.close();
    
    // Stop Docker environment
    logger.info('🛑 Stopping Docker test environment...');
    execSync(`docker-compose -f ${DOCKER_COMPOSE_FILE} down -v`, { stdio: 'inherit' });
  }, 30000);

  describe('Multi-GPU Worker Architecture', () => {
    test('should have workers from all GPU servers connected', async () => {
      // Wait for all workers to connect
      await waitForWorkersToConnect(15); // Total expected workers
      
      // Get worker information from Redis
      const workerKeys = await redis.keys('worker:*:info');
      expect(workerKeys).toHaveLength(15);
      
      const workers = await Promise.all(
        workerKeys.map(async key => {
          const workerData = await redis.hgetall(key);
          return {
            worker_id: workerData.worker_id,
            gpu_id: parseInt(workerData.gpu_id),
            gpu_model: workerData.gpu_model,
            gpu_memory_gb: parseInt(workerData.gpu_memory_gb),
            services: JSON.parse(workerData.services || '[]'),
            server_id: workerData.worker_id.split('-gpu-')[0]
          };
        })
      );

      // Verify GPU server architectures
      const serverSummary = groupWorkersByServer(workers);
      
      expect(serverSummary['gpu-server-1']).toHaveLength(4); // 4 GPUs
      expect(serverSummary['gpu-server-2']).toHaveLength(2); // 2 GPUs
      expect(serverSummary['gpu-server-3']).toHaveLength(1); // 1 GPU
      expect(serverSummary['gpu-server-4']).toHaveLength(8); // 8 GPUs

      logger.info('GPU Server Summary:');
      Object.entries(serverSummary).forEach(([serverId, serverWorkers]) => {
        const workers = serverWorkers as any[];
        logger.info(`  ${serverId}: ${workers.length} workers`);
        workers.forEach(worker => {
          logger.info(`    GPU ${worker.gpu_id}: ${worker.worker_id} (${worker.gpu_model}, ${worker.services.join(', ')})`);
        });
      });
    });

    test('should correctly route jobs to specific GPU workers', async () => {
      const jobSubmissions = [
        // ComfyUI jobs - should go to ComfyUI-capable workers
        { service: 'comfyui', model: 'flux-dev', priority: 80 },
        { service: 'comfyui', model: 'sdxl', priority: 70 },
        
        // Flux jobs - should go to Flux-capable workers 
        { service: 'flux', model: 'flux-pro', priority: 90 },
        { service: 'flux', model: 'flux-schnell', priority: 60 },
        
        // A1111 jobs - should go to A1111-capable workers
        { service: 'a1111', model: 'sd15', priority: 50 },
        { service: 'a1111', model: 'sdxl', priority: 65 },
        
        // High memory requirement - should go to high-end GPUs
        { service: 'comfyui', model: 'flux-pro', priority: 95, gpu_memory_required: 24 },
        
        // Customer-restricted job - should only go to allowed workers
        { service: 'a1111', model: 'sd15', priority: 85, customer_id: 'customer-a' }
      ];

      const submittedJobs = [];
      
      // Submit jobs to the hub
      for (const jobSpec of jobSubmissions) {
        const jobId = await submitJobToHub(jobSpec);
        submittedJobs.push({ id: jobId, spec: jobSpec });
      }

      // Wait for jobs to be processed
      await waitForJobsToComplete(submittedJobs.map(j => j.id));

      // Verify job assignments
      for (const { id: jobId, spec } of submittedJobs) {
        const jobData = await redis.hgetall(`job:${jobId}`);
        const assignedWorkerId = jobData.worker_id;
        
        expect(assignedWorkerId).toBeTruthy();
        
        const workerData = await redis.hgetall(`worker:${assignedWorkerId}:info`);
        const workerServices = JSON.parse(workerData.services || '[]');
        const workerModels = JSON.parse(workerData.models || '{}');
        
        // Verify service compatibility
        expect(workerServices).toContain(spec.service);
        
        // Verify model compatibility
        if (spec.model && workerModels[spec.service]) {
          expect(workerModels[spec.service]).toContain(spec.model);
        }
        
        // Verify GPU memory requirements
        if (spec.gpu_memory_required) {
          const workerGpuMemory = parseInt(workerData.gpu_memory_gb);
          expect(workerGpuMemory).toBeGreaterThanOrEqual(spec.gpu_memory_required);
        }
        
        // Verify customer restrictions
        if (spec.customer_id === 'customer-a') {
          // Should only be assigned to workers that allow customer-a
          const customerAccess = JSON.parse(workerData.customer_access || '{}');
          if (customerAccess.allowed_customers) {
            expect(customerAccess.allowed_customers).toContain('customer-a');
          }
        }

        logger.info(`✅ Job ${jobId} (${spec.service}/${spec.model}) → Worker ${assignedWorkerId} (GPU ${workerData.gpu_id})`);
      }
    });

    test('should handle concurrent job processing across multiple GPUs', async () => {
      // Submit many jobs simultaneously to test concurrency
      const concurrentJobs = Array.from({ length: 30 }, (_, i) => ({
        service: ['comfyui', 'a1111', 'flux'][i % 3],
        priority: Math.floor(Math.random() * 100),
        payload: { prompt: `Concurrent job ${i}`, seed: i }
      }));

      const startTime = Date.now();
      
      // Submit all jobs at once
      const jobIds = await Promise.all(
        concurrentJobs.map(jobSpec => submitJobToHub(jobSpec))
      );

      // Wait for all jobs to complete
      await waitForJobsToComplete(jobIds);
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Verify all jobs completed successfully
      const completedJobs = await Promise.all(
        jobIds.map(async jobId => {
          const jobData = await redis.hgetall(`job:${jobId}`);
          return {
            id: jobId,
            status: jobData.status,
            worker_id: jobData.worker_id,
            processing_time: parseInt(jobData.processing_time || '0')
          };
        })
      );

      const successfulJobs = completedJobs.filter(job => job.status === 'completed');
      expect(successfulJobs).toHaveLength(30);

      // Verify jobs were distributed across multiple workers
      const workerAssignments = new Set(completedJobs.map(job => job.worker_id));
      expect(workerAssignments.size).toBeGreaterThan(1);

      logger.info(`🚀 Processed ${successfulJobs.length} concurrent jobs in ${totalTime}ms`);
      logger.info(`📊 Jobs distributed across ${workerAssignments.size} workers`);
      
      // Log distribution per GPU server
      const serverDistribution = {};
      completedJobs.forEach(job => {
        const serverId = job.worker_id.split('-gpu-')[0];
        serverDistribution[serverId] = (serverDistribution[serverId] || 0) + 1;
      });
      
      logger.info('Job distribution by GPU server:');
      Object.entries(serverDistribution).forEach(([serverId, count]) => {
        logger.info(`  ${serverId}: ${count} jobs`);
      });
    });

    test('should detect and mark unworkable jobs', async () => {
      // Submit a job requiring a service that no worker supports
      const unworkableJob = await submitJobToHub({
        service: 'dalle3', // No workers support this
        priority: 100,
        payload: { prompt: 'This should be unworkable' }
      });

      // Submit a normal job for comparison
      const workableJob = await submitJobToHub({
        service: 'comfyui',
        priority: 90,
        payload: { prompt: 'This should work' }
      });

      // Wait a bit for job broker to process
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Check if unworkable job was detected
      const unworkableJobData = await redis.hgetall(`job:${unworkableJob}`);
      const workableJobData = await redis.hgetall(`job:${workableJob}`);

      // The unworkable job should remain in pending or be marked unworkable
      expect(['pending', 'unworkable']).toContain(unworkableJobData.status);
      
      // The workable job should be processed
      expect(['assigned', 'in_progress', 'completed']).toContain(workableJobData.status);

      logger.info(`Unworkable job ${unworkableJob}: ${unworkableJobData.status}`);
      logger.info(`Workable job ${workableJob}: ${workableJobData.status}`);
    });
  });

  // Helper functions

  async function waitForServices(): Promise<void> {
    // Wait for Redis
    await waitForRedis();
    
    // Wait for Hub
    await waitForHub();
    
    logger.info('✅ All core services ready');
  }

  async function waitForRedis(): Promise<void> {
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const testRedis = new Redis(REDIS_URL);
        await testRedis.ping();
        await testRedis.quit();
        return;
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    throw new Error('Redis not ready after 30 seconds');
  }

  async function waitForHub(): Promise<void> {
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch('http://localhost:3011/health');
        if (response.ok) return;
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    throw new Error('Hub not ready after 30 seconds');
  }

  async function waitForWorkersToConnect(expectedCount: number): Promise<void> {
    const maxAttempts = 60; // 60 seconds
    for (let i = 0; i < maxAttempts; i++) {
      const workerKeys = await redis.keys('worker:*:info');
      if (workerKeys.length >= expectedCount) {
        logger.info(`✅ ${workerKeys.length} workers connected`);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    const finalCount = await redis.keys('worker:*:info');
    throw new Error(`Only ${finalCount.length} of ${expectedCount} workers connected after 60 seconds`);
  }

  async function submitJobToHub(jobSpec: any): Promise<string> {
    const jobRequest = {
      service_required: jobSpec.service,
      priority: jobSpec.priority || 50,
      payload: jobSpec.payload || { prompt: `Test ${jobSpec.service} job` },
      customer_id: jobSpec.customer_id,
      requirements: {
        service_type: jobSpec.service,
        models: jobSpec.model ? [jobSpec.model] : undefined,
        hardware: jobSpec.gpu_memory_required ? {
          gpu_memory_gb: jobSpec.gpu_memory_required
        } : undefined
      }
    };

    const response = await fetch('http://localhost:3011/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jobRequest)
    });

    if (!response.ok) {
      throw new Error(`Failed to submit job: ${response.statusText}`);
    }

    const result = await response.json() as any;
    return result.job_id;
  }

  async function waitForJobsToComplete(jobIds: string[]): Promise<void> {
    const maxWaitTime = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      const jobStatuses = await Promise.all(
        jobIds.map(async jobId => {
          const jobData = await redis.hgetall(`job:${jobId}`);
          return jobData.status;
        })
      );

      const pendingJobs = jobStatuses.filter(status => 
        !['completed', 'failed', 'cancelled'].includes(status)
      );

      if (pendingJobs.length === 0) {
        logger.info(`✅ All ${jobIds.length} jobs completed`);
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error(`Jobs did not complete within ${maxWaitTime}ms`);
  }

  function groupWorkersByServer(workers: any[]) {
    return workers.reduce((acc, worker) => {
      const serverId = worker.server_id;
      if (!acc[serverId]) acc[serverId] = [];
      acc[serverId].push(worker);
      return acc;
    }, {});
  }
});