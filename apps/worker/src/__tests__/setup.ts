/**
 * Test setup for worker attestation tests
 */

import { beforeAll, afterAll } from 'vitest';
import Redis from 'ioredis';

// Mock Redis for tests
export const mockRedis = {
  setex: vi.fn(),
  hmset: vi.fn(),
  hset: vi.fn(),
  expire: vi.fn(),
  lpush: vi.fn(),
  publish: vi.fn(),
  get: vi.fn(),
  hget: vi.fn(),
  hgetall: vi.fn(),
  del: vi.fn(),
  flushdb: vi.fn(),
  quit: vi.fn()
};

// Mock environment variables
const originalEnv = process.env;

beforeAll(() => {
  // Setup test environment
  process.env = {
    ...originalEnv,
    WORKER_ID: 'test-worker-123',
    MACHINE_ID: 'test-machine-456',
    VERSION: '1.0.0-test',
    OPENAI_API_KEY: 'test-key',
    CLOUD_STORAGE_PROVIDER: 'azure',
    CLOUD_STORAGE_CONTAINER: 'test-container'
  };
});

afterAll(() => {
  // Restore environment
  process.env = originalEnv;
});

// Helper function to create mock job data
export function createMockJobData(overrides: Partial<any> = {}) {
  return {
    id: 'test-job-123',
    type: 'openai_responses',
    priority: 1,
    service_required: 'openai_responses',
    payload: JSON.stringify({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'test' }]
    }),
    ctx: JSON.stringify({
      workflow_context: {
        retry_attempt: 0,
        ...overrides.workflow_context
      }
    }),
    retry_count: '0',
    max_retries: '3',
    status: 'assigned',
    workflow_id: 'test-workflow-789',
    current_step: 1,
    total_steps: 3,
    ...overrides
  };
}

// Helper function to create mock results
export function createMockResult(overrides: Partial<any> = {}) {
  return {
    success: true,
    data: {
      choices: [{ message: { content: 'test response' } }],
      ...overrides.data
    },
    raw_request_payload: {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'test' }]
    },
    ...overrides
  };
}