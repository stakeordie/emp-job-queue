// Test worker fixtures for various scenarios
import type { WorkerCapabilitiesDetailed, WorkerInfo } from '../../src/core/types/index.js';

export const createWorkerCapabilities = (overrides: Partial<WorkerCapabilitiesDetailed> = {}): WorkerCapabilitiesDetailed => ({
  worker_id: `worker-${Math.random().toString(36).substring(2, 9)}`,
  services: ['comfyui'],
  components: 'all',
  workflows: 'all',
  hardware: {
    gpu_memory_gb: 16,
    gpu_model: 'RTX 4090',
    cpu_cores: 16,
    cpu_threads: 32,
    ram_gb: 64,
    storage_gb: 2000
  },
  customer_access: {
    isolation: 'loose',
    max_concurrent_customers: 5
  },
  performance: {
    concurrent_jobs: 2,
    quality_levels: ['fast', 'balanced', 'quality']
  },
  location: {
    region: 'us-east',
    compliance: ['gdpr']
  },
  cost: {
    tier: 'standard',
    rate_per_hour: 2.00
  },
  ...overrides
});

export const createWorkerInfo = (overrides: Partial<WorkerInfo> = {}): WorkerInfo => ({
  capabilities: createWorkerCapabilities(),
  status: 'idle',
  connected_at: new Date().toISOString(),
  last_heartbeat: new Date().toISOString(),
  current_jobs: [],
  jobs_processed: 0,
  connection_status: 'connected',
  is_accepting_jobs: true,
  system_info: {
    cpu_usage: 25,
    memory_usage: 40,
    gpu_usage: 0,
    gpu_memory_usage: 2.1,
    disk_usage: 45,
    network_io: { in: 1000, out: 500 }
  },
  ...overrides
});

// High-end GPU worker
export const highEndWorker = createWorkerInfo({
  capabilities: createWorkerCapabilities({
    worker_id: 'gpu-beast-01',
    hardware: {
      gpu_memory_gb: 48,
      gpu_model: 'RTX 4090',
      cpu_cores: 32,
      ram_gb: 128
    },
    performance: {
      concurrent_jobs: 4,
      quality_levels: ['fast', 'balanced', 'quality']
    }
  })
});

// Budget GPU worker
export const budgetWorker = createWorkerInfo({
  capabilities: createWorkerCapabilities({
    worker_id: 'gpu-budget-01',
    hardware: {
      gpu_memory_gb: 8,
      gpu_model: 'RTX 3060',
      cpu_cores: 8,
      ram_gb: 32
    },
    performance: {
      concurrent_jobs: 1,
      quality_levels: ['fast', 'balanced']
    }
  })
});

// ComfyUI specialized worker
export const comfyUIWorker = createWorkerInfo({
  capabilities: createWorkerCapabilities({
    worker_id: 'comfyui-specialist',
    services: ['comfyui'],
    components: ['text-to-image-xl', 'upscaling', 'inpainting'],
    workflows: ['workflow-v2.1', 'workflow-optimized']
  })
});

// A1111 specialized worker
export const a1111Worker = createWorkerInfo({
  capabilities: createWorkerCapabilities({
    worker_id: 'a1111-specialist',
    services: ['a1111'],
    components: ['text-to-image', 'img2img', 'extras']
  })
});

// Multi-service worker
export const multiServiceWorker = createWorkerInfo({
  capabilities: createWorkerCapabilities({
    worker_id: 'multi-service-01',
    services: ['comfyui', 'a1111', 'custom'],
    performance: {
      concurrent_jobs: 3,
      quality_levels: ['fast', 'balanced', 'quality']
    }
  })
});

// Premium isolated worker
export const premiumWorker = createWorkerInfo({
  capabilities: createWorkerCapabilities({
    worker_id: 'premium-isolated',
    customer_access: {
      isolation: 'strict',
      allowed_customers: ['premium-customer-1', 'premium-customer-2'],
      max_concurrent_customers: 1
    },
    cost: {
      tier: 'premium',
      rate_per_hour: 10.00
    }
  })
});

// Busy worker
export const busyWorker = createWorkerInfo({
  status: 'busy',
  current_jobs: ['job-123', 'job-456'],
  system_info: {
    cpu_usage: 85,
    memory_usage: 70,
    gpu_usage: 95,
    gpu_memory_usage: 14.5
  }
});

// Overloaded worker
export const overloadedWorker = createWorkerInfo({
  status: 'busy',
  current_jobs: ['job-111', 'job-222', 'job-333'],
  system_info: {
    cpu_usage: 95,
    memory_usage: 90,
    gpu_usage: 100,
    gpu_memory_usage: 15.8
  }
});

// Disconnected worker
export const disconnectedWorker = createWorkerInfo({
  status: 'disconnected',
  connection_status: 'disconnected',
  is_accepting_jobs: false,
  last_heartbeat: new Date(Date.now() - 300000).toISOString() // 5 minutes ago
});

// Create worker pool for testing
export const createWorkerPool = (count: number) => {
  return Array.from({ length: count }, (_, i) => 
    createWorkerInfo({
      capabilities: createWorkerCapabilities({
        worker_id: `pool-worker-${i.toString().padStart(2, '0')}`
      })
    })
  );
};