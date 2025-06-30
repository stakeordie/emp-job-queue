// Test job fixtures for various scenarios
import type { Job, JobRequirements } from '../../src/core/types/index.js';

export const createJob = (overrides: Partial<Job> = {}): Job => ({
  id: `job-${Math.random().toString(36).substring(2, 9)}`,
  type: 'text_to_image',
  priority: 50,
  payload: {
    prompt: 'A beautiful landscape',
    steps: 20,
    cfg_scale: 7.5,
    width: 512,
    height: 512
  },
  requirements: {
    service_type: 'comfyui',
    hardware: {
      gpu_memory_gb: 8,
      cpu_cores: 4,
      ram_gb: 16
    },
    timeout_minutes: 30
  },
  customer_id: 'test-customer',
  created_at: new Date().toISOString(),
  status: 'pending',
  max_retries: 3,
  retry_count: 0,
  ...overrides
});

// High priority jobs
export const highPriorityJob = createJob({
  priority: 90,
  type: 'urgent_generation'
});

// Low priority job
export const lowPriorityJob = createJob({
  priority: 10,
  type: 'background_task'
});

// GPU intensive job
export const gpuIntensiveJob = createJob({
  requirements: {
    service_type: 'comfyui',
    component: 'text-to-image-xl',
    hardware: {
      gpu_memory_gb: 16,
      gpu_model: 'RTX 4090'
    }
  }
});

// CPU job
export const cpuJob = createJob({
  type: 'preprocessing',
  requirements: {
    service_type: 'custom',
    hardware: {
      cpu_cores: 8,
      ram_gb: 32
    }
  }
});

// ComfyUI specific job
export const comfyUIJob = createJob({
  requirements: {
    service_type: 'comfyui',
    component: 'text-to-image-xl',
    workflow: 'workflow-v2.1'
  }
});

// A1111 specific job
export const a1111Job = createJob({
  requirements: {
    service_type: 'a1111',
    component: 'text-to-image'
  }
});

// Customer isolation job
export const isolatedJob = createJob({
  customer_id: 'premium-customer',
  requirements: {
    service_type: 'comfyui',
    customer_isolation: 'strict'
  }
});

// Large job with timeout
export const longRunningJob = createJob({
  type: 'video_generation',
  requirements: {
    service_type: 'comfyui',
    timeout_minutes: 120,
    hardware: {
      gpu_memory_gb: 24
    }
  }
});

// Jobs for queue ordering tests
export const createJobBatch = (count: number, basePriority: number = 50) => {
  return Array.from({ length: count }, (_, i) => 
    createJob({
      priority: basePriority + (i % 10), // Vary priority slightly
      created_at: new Date(Date.now() + i * 1000).toISOString() // Space out creation times
    })
  );
};

// Jobs with same priority for FIFO testing
export const createFIFOJobBatch = (count: number, priority: number = 50) => {
  return Array.from({ length: count }, (_, i) => 
    createJob({
      priority,
      created_at: new Date(Date.now() + i * 1000).toISOString(),
      id: `fifo-job-${i.toString().padStart(3, '0')}`
    })
  );
};