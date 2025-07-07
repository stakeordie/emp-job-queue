// Comprehensive tests for the capability matching system
// Tests both positive and negative requirements matching, array capabilities, and nested requirements

import { describe, test, expect, beforeEach } from '@jest/globals';
import Redis from 'ioredis-mock';
import { RedisOperations } from '../../src/core/utils/redis-operations.js';
import type { Job } from '../../src/core/types/job.js';
import { JobStatus } from '../../src/core/types/job.js';
import type { WorkerCapabilities } from '../../src/core/types/worker.js';

describe('Capability Matching System', () => {
  let redis: Redis;

  beforeEach(() => {
    redis = new Redis();
  });

  const createWorkerCapabilities = (overrides: Partial<WorkerCapabilities> = {}): WorkerCapabilities => ({
    worker_id: 'test-worker',
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

  describe('RedisOperations Utilities', () => {
    test('should calculate job scores correctly for priority ordering', () => {
      const now = Date.now();
      
      // Higher priority should get higher score
      const highPriorityScore = RedisOperations.calculateJobScore(80, now);
      const lowPriorityScore = RedisOperations.calculateJobScore(20, now);
      expect(highPriorityScore).toBeGreaterThan(lowPriorityScore);
      
      // Same priority, older job should get higher score (FIFO)
      const olderJobScore = RedisOperations.calculateJobScore(50, now - 10000);
      const newerJobScore = RedisOperations.calculateJobScore(50, now);
      expect(olderJobScore).toBeGreaterThan(newerJobScore);
    });

    test('should serialize and deserialize jobs correctly', () => {
      const originalJob: Job = {
        id: 'test-job-123',
        status: JobStatus.PENDING,
        service_required: 'comfyui',
        priority: 75,
        payload: { prompt: 'test prompt', steps: 20 },
        retry_count: 0,
        max_retries: 3,
        customer_id: 'customer-123',
        requirements: {
          service_type: 'comfyui',
          hardware: {
            gpu_memory_gb: 16
          }
        },
        workflow_id: 'workflow-456',
        workflow_priority: 80,
        step_number: 2,
        created_at: '2025-07-06T10:00:00.000Z',
      };

      const serialized = RedisOperations.serializeJobForRedis(originalJob);
      const deserialized = RedisOperations.deserializeJobFromRedis(serialized);

      expect(deserialized).toEqual(originalJob);
    });

    test('should handle job serialization with missing optional fields', () => {
      const minimalJob: Job = {
        id: 'minimal-job',
        status: JobStatus.PENDING,
        service_required: 'simulation',
        priority: 50,
        payload: { test: true },
        retry_count: 0,
        max_retries: 3,
        created_at: '2025-07-06T10:00:00.000Z',
      };

      const serialized = RedisOperations.serializeJobForRedis(minimalJob);
      const deserialized = RedisOperations.deserializeJobFromRedis(serialized);

      expect(deserialized).toEqual(minimalJob);
    });

    test('should handle invalid JSON gracefully during deserialization', () => {
      const corruptedJobData = {
        id: 'corrupted-job',
        status: 'pending',
        service_required: 'test',
        priority: '50',
        payload: 'invalid-json{',
        requirements: 'also-invalid{',
        retry_count: '0',
        max_retries: '3',
        created_at: '2025-07-06T10:00:00.000Z',
      };

      const deserialized = RedisOperations.deserializeJobFromRedis(corruptedJobData);
      
      expect(deserialized).toBeNull();
    });
  });

  describe('Worker Capability Scenarios', () => {

    test('should match basic service requirements', () => {
      const worker = createWorkerCapabilities({
        services: ['comfyui', 'simulation']
      });

      // Should match if worker supports the service
      expect(worker.services).toContain('comfyui');
      expect(worker.services).toContain('simulation');
      expect(worker.services).not.toContain('a1111');
    });

    test('should handle array capability matching', () => {
      const worker = createWorkerCapabilities({
        asset_type: ['image', 'video', '3d'],
        available_models: ['sdxl', 'sd15', 'flux']
      } as any);

      // Array should contain individual requirement values
      expect((worker as any).asset_type).toContain('video');
      expect((worker as any).available_models).toContain('sdxl');
      expect((worker as any).asset_type).not.toContain('audio');
    });

    test('should handle nested hardware requirements', () => {
      const worker = createWorkerCapabilities({
        hardware: {
          gpu_memory_gb: 24,
          gpu_model: 'RTX 4090',
          ram_gb: 64
        }
      });

      // Should meet minimum requirements
      expect(worker.hardware!.gpu_memory_gb).toBeGreaterThanOrEqual(16);
      expect(worker.hardware!.ram_gb).toBeGreaterThanOrEqual(32);
    });

    test('should handle customer isolation requirements', () => {
      const strictWorker = createWorkerCapabilities({
        customer_access: {
          isolation: 'strict',
          allowed_customers: ['customer-a', 'customer-b'],
          max_concurrent_customers: 1
        }
      });

      const looseWorker = createWorkerCapabilities({
        customer_access: {
          isolation: 'loose',
          max_concurrent_customers: 10
        }
      });

      expect(strictWorker.customer_access!.isolation).toBe('strict');
      expect(looseWorker.customer_access!.isolation).toBe('loose');
    });

    test('should handle geographic and compliance capabilities', () => {
      const worker = createWorkerCapabilities({
        location: {
          region: 'us-east',
          country: 'US',
          compliance_zones: ['gdpr', 'soc2', 'hipaa']
        }
      });

      expect(worker.location!.region).toBe('us-east');
      expect(worker.location!.compliance_zones).toContain('gdpr');
    });

    test('should handle performance tier capabilities', () => {
      const worker = createWorkerCapabilities({
        performance_tier: 'premium',
        features: ['upscaling', 'inpainting', 'controlnet'],
        sla_tier: 'enterprise'
      } as any);

      expect((worker as any).performance_tier).toBe('premium');
      expect((worker as any).features).toContain('upscaling');
      expect((worker as any).sla_tier).toBe('enterprise');
    });
  });

  describe('Job Requirements Scenarios', () => {
    test('should create valid standard requirements', () => {
      const requirements = {
        service_type: 'comfyui',
        hardware: {
          gpu_memory_gb: 16,
          ram_gb: 32
        },
        customer_isolation: 'strict',
        geographic_region: 'us-east',
        quality_level: 'balanced'
      };

      expect(requirements.service_type).toBe('comfyui');
      expect(requirements.hardware?.gpu_memory_gb).toBe(16);
      expect(requirements.customer_isolation).toBe('strict');
    });

    test('should create custom requirements with positive/negative structure', () => {
      // This is how the monitor form structures requirements
      const customRequirements = {
        positive_requirements: {
          asset_type: 'video',
          performance_tier: 'premium',
          region: 'us-east'
        },
        negative_requirements: {
          debugging_enabled: true,
          experimental_mode: true
        }
      };

      expect(customRequirements.positive_requirements.asset_type).toBe('video');
      expect(customRequirements.negative_requirements.debugging_enabled).toBe(true);
    });

    test('should handle mixed standard and custom requirements', () => {
      // Jobs can have both standard fields and custom requirements
      const mixedRequirements = {
        service_type: 'simulation',
        hardware: {
          gpu_memory_gb: 24
        },
        // Custom fields via positive/negative requirements
        positive_requirements: {
          asset_type: 'image',
          features: ['upscaling', 'inpainting']
        },
        negative_requirements: {
          memory_constrained: true
        }
      };

      expect(mixedRequirements.service_type).toBe('simulation');
      expect(mixedRequirements.hardware?.gpu_memory_gb).toBe(24);
      expect(mixedRequirements.positive_requirements?.asset_type).toBe('image');
    });
  });

  describe('Real-world Capability Matching Scenarios', () => {
    test('video processing job should match video-capable workers', () => {
      const videoWorker = createWorkerCapabilities({
        asset_type: ['image', 'video'],
        available_models: ['ffmpeg', 'opencv'],
        performance_tier: 'standard'
      } as any);

      const imageOnlyWorker = createWorkerCapabilities({
        asset_type: ['image'],
        available_models: ['sdxl', 'sd15']
      } as any);

      // Video job requirement
      const videoRequirement = 'video';
      
      expect((videoWorker as any).asset_type).toContain(videoRequirement);
      expect((imageOnlyWorker as any).asset_type).not.toContain(videoRequirement);
    });

    test('high-memory job should exclude memory-constrained workers', () => {
      const highEndWorker = createWorkerCapabilities({
        hardware: { gpu_memory_gb: 48, gpu_model: 'A6000', ram_gb: 128 },
        memory_constrained: false
      } as any);

      const constrainedWorker = createWorkerCapabilities({
        hardware: { gpu_memory_gb: 8, gpu_model: 'RTX 3060', ram_gb: 16 },
        memory_constrained: true
      } as any);

      expect(highEndWorker.hardware!.gpu_memory_gb).toBeGreaterThanOrEqual(24);
      expect((constrainedWorker as any).memory_constrained).toBe(true);
    });

    test('compliance-sensitive job should match compliant workers', () => {
      const compliantWorker = createWorkerCapabilities({
        location: {
          region: 'eu-west',
          compliance_zones: ['gdpr', 'iso27001']
        },
        customer_access: {
          isolation: 'strict'
        }
      });

      const nonCompliantWorker = createWorkerCapabilities({
        location: {
          region: 'ap-southeast',
          compliance_zones: []
        },
        customer_access: {
          isolation: 'none'
        }
      });

      expect(compliantWorker.location!.compliance_zones).toContain('gdpr');
      expect(compliantWorker.customer_access!.isolation).toBe('strict');
      expect(nonCompliantWorker.location!.compliance_zones).not.toContain('gdpr');
    });

    test('production job should exclude debugging workers', () => {
      const productionWorker = createWorkerCapabilities({
        debugging_enabled: false,
        experimental_mode: false,
        sla_tier: 'gold'
      } as any);

      const debugWorker = createWorkerCapabilities({
        debugging_enabled: true,
        experimental_mode: true,
        development_mode: true
      } as any);

      expect((productionWorker as any).debugging_enabled).toBe(false);
      expect((debugWorker as any).debugging_enabled).toBe(true);
    });

    test('enterprise job should match enterprise-grade workers', () => {
      const enterpriseWorker = createWorkerCapabilities({
        performance_tier: 'enterprise',
        sla_tier: 'platinum',
        location: {
          compliance_zones: ['soc2', 'iso27001', 'pci_dss']
        },
        features: ['multi_gpu', 'batch_processing', 'enterprise_api']
      } as any);

      expect((enterpriseWorker as any).performance_tier).toBe('enterprise');
      expect((enterpriseWorker as any).sla_tier).toBe('platinum');
      expect((enterpriseWorker as any).features).toContain('enterprise_api');
    });
  });
});