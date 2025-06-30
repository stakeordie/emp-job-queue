// Global test setup for all test suites
import { jest } from '@jest/globals';

// Mock Redis for unit tests by default
jest.mock('ioredis', () => {
  return {
    default: jest.fn(() => ({
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      zadd: jest.fn(),
      zrange: jest.fn(),
      zrem: jest.fn(),
      hget: jest.fn(),
      hset: jest.fn(),
      hdel: jest.fn(),
      lpush: jest.fn(),
      rpop: jest.fn(),
      publish: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      quit: jest.fn(),
      eval: jest.fn(),
      pipeline: jest.fn(() => ({
        exec: jest.fn(),
        zadd: jest.fn(),
        zrem: jest.fn()
      }))
    }))
  };
});

// Mock WebSocket for unit tests
jest.mock('ws', () => ({
  WebSocket: jest.fn(),
  WebSocketServer: jest.fn()
}));

// Global test utilities
global.testUtils = {
  // Create test job with defaults
  createTestJob: (overrides = {}) => ({
    id: 'test-job-123',
    type: 'text_to_image',
    priority: 50,
    payload: { prompt: 'test prompt' },
    requirements: {
      service_type: 'comfyui',
      hardware: { gpu_memory_gb: 8 }
    },
    customer_id: 'test-customer',
    created_at: new Date().toISOString(),
    ...overrides
  }),

  // Create test worker with defaults
  createTestWorker: (overrides = {}) => ({
    worker_id: 'test-worker-1',
    capabilities: {
      services: ['comfyui'],
      hardware: {
        gpu_memory_gb: 16,
        gpu_model: 'RTX 4090',
        cpu_cores: 8,
        ram_gb: 32
      },
      customer_access: {
        isolation: 'none' as const
      }
    },
    status: 'idle' as any,
    connected_at: new Date().toISOString(),
    ...overrides
  }),

  // Create test message
  createTestMessage: (type: string, overrides = {}) => ({
    type,
    timestamp: Date.now(),
    ...overrides
  }),

  // Wait for async operations
  waitFor: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),

  // Create Redis mock with specific responses
  createRedisMock: (responses: any = {}) => ({
    get: jest.fn().mockImplementation((key: string) => responses[key] || null),
    set: jest.fn().mockResolvedValue('OK' as any),
    del: jest.fn().mockResolvedValue(1 as any),
    zadd: jest.fn().mockResolvedValue(1 as any),
    zrange: jest.fn().mockResolvedValue([] as any),
    zrem: jest.fn().mockResolvedValue(1 as any),
    hget: jest.fn().mockResolvedValue(null as any),
    hset: jest.fn().mockResolvedValue(1 as any),
    hdel: jest.fn().mockResolvedValue(1 as any),
    eval: jest.fn().mockResolvedValue(null as any),
    pipeline: jest.fn(() => ({
      exec: jest.fn().mockResolvedValue([] as any),
      zadd: jest.fn(),
      zrem: jest.fn()
    })),
    ...responses
  })
};

// Increase timeout for complex tests
jest.setTimeout(10000);

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});