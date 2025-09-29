/**
 * Tests for retry count extraction from workflow context
 *
 * Tests the complex retry count logic that extracts retry_attempt from:
 * jobData.ctx.workflow_context.retry_attempt (primary source)
 * with fallbacks to various other locations for backward compatibility
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RedisDirectWorkerClient } from '../redis-direct-worker-client.js';
import { createMockJobData, createMockResult, mockRedis } from './setup.js';

describe('Retry Count Extraction', () => {
  let client: RedisDirectWorkerClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new RedisDirectWorkerClient('redis://localhost:6379', 'test-worker');
    // Replace the Redis instance with our mock
    (client as any).redis = mockRedis;
  });

  describe('from workflow_context.retry_attempt', () => {
    it('should extract retry count from jobData.ctx.workflow_context.retry_attempt', async () => {
      const jobData = createMockJobData({
        id: 'retry-test-1',
        ctx: JSON.stringify({
          workflow_context: {
            retry_attempt: 2
          }
        })
      });

      const result = createMockResult();

      await client.completeJob('retry-test-1', result, jobData);

      // Check that the attestation was created with correct retry count
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'worker:completion:retry-test-1',
        expect.any(Number),
        expect.stringContaining('"retry_count":2')
      );
    });

    it('should handle string retry_attempt values', async () => {
      const jobData = createMockJobData({
        id: 'retry-test-2',
        ctx: JSON.stringify({
          workflow_context: {
            retry_attempt: '3'  // String value
          }
        })
      });

      const result = createMockResult();

      await client.completeJob('retry-test-2', result, jobData);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'worker:completion:retry-test-2',
        expect.any(Number),
        expect.stringContaining('"retry_count":"3"')
      );
    });

    it('should handle nested workflow context', async () => {
      const jobData = createMockJobData({
        id: 'retry-test-3',
        ctx: JSON.stringify({
          user_id: 'user123',
          workflow_context: {
            retry_attempt: 1,
            original_job_id: 'orig-123',
            step_data: { foo: 'bar' }
          },
          other_data: 'test'
        })
      });

      const result = createMockResult();

      await client.completeJob('retry-test-3', result, jobData);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'worker:completion:retry-test-3',
        expect.any(Number),
        expect.stringContaining('"retry_count":1')
      );
    });
  });

  describe('fallback retry count extraction', () => {
    it('should fall back to parsedPayload.ctx.retry_count', async () => {
      const jobData = createMockJobData({
        id: 'fallback-test-1',
        ctx: JSON.stringify({}), // No workflow_context
        payload: JSON.stringify({
          ctx: { retry_count: 4 },
          model: 'gpt-4'
        })
      });

      const result = createMockResult();

      await client.completeJob('fallback-test-1', result, jobData);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'worker:completion:fallback-test-1',
        expect.any(Number),
        expect.stringContaining('"retry_count":4')
      );
    });

    it('should fall back to parsedPayload.ctx.retryCount', async () => {
      const jobData = createMockJobData({
        id: 'fallback-test-2',
        ctx: JSON.stringify({}),
        payload: JSON.stringify({
          ctx: { retryCount: 5 }, // Different property name
          model: 'gpt-4'
        })
      });

      const result = createMockResult();

      await client.completeJob('fallback-test-2', result, jobData);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'worker:completion:fallback-test-2',
        expect.any(Number),
        expect.stringContaining('"retry_count":5')
      );
    });

    it('should fall back to jobData.retry_count', async () => {
      const jobData = createMockJobData({
        id: 'fallback-test-3',
        ctx: JSON.stringify({}),
        payload: JSON.stringify({ model: 'gpt-4' }), // No ctx
        retry_count: '6'
      });

      const result = createMockResult();

      await client.completeJob('fallback-test-3', result, jobData);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'worker:completion:fallback-test-3',
        expect.any(Number),
        expect.stringContaining('"retry_count":"6"')
      );
    });

    it('should default to 0 when no retry count found', async () => {
      const jobData = createMockJobData({
        id: 'fallback-test-4',
        ctx: JSON.stringify({}),
        payload: JSON.stringify({ model: 'gpt-4' }),
        retry_count: undefined
      });

      const result = createMockResult();

      await client.completeJob('fallback-test-4', result, jobData);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'worker:completion:fallback-test-4',
        expect.any(Number),
        expect.stringContaining('"retry_count":0')
      );
    });
  });

  describe('error handling', () => {
    it('should handle malformed ctx JSON gracefully', async () => {
      const jobData = createMockJobData({
        id: 'error-test-1',
        ctx: 'invalid-json{',
        retry_count: '2'
      });

      const result = createMockResult();

      await client.completeJob('error-test-1', result, jobData);

      // Should fall back to jobData.retry_count
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'worker:completion:error-test-1',
        expect.any(Number),
        expect.stringContaining('"retry_count":"2"')
      );
    });

    it('should handle malformed payload JSON gracefully', async () => {
      const jobData = createMockJobData({
        id: 'error-test-2',
        ctx: JSON.stringify({}),
        payload: 'invalid-json{',
        retry_count: '3'
      });

      const result = createMockResult();

      await client.completeJob('error-test-2', result, jobData);

      // Should fall back to jobData.retry_count
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'worker:completion:error-test-2',
        expect.any(Number),
        expect.stringContaining('"retry_count":"3"')
      );
    });
  });

  describe('precedence order', () => {
    it('should prioritize workflow_context.retry_attempt over all others', async () => {
      const jobData = createMockJobData({
        id: 'precedence-test-1',
        ctx: JSON.stringify({
          workflow_context: { retry_attempt: 10 } // Highest priority
        }),
        payload: JSON.stringify({
          ctx: { retry_count: 20, retryCount: 30 }
        }),
        retry_count: '40' // Lowest priority
      });

      const result = createMockResult();

      await client.completeJob('precedence-test-1', result, jobData);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'worker:completion:precedence-test-1',
        expect.any(Number),
        expect.stringContaining('"retry_count":10')
      );
    });

    it('should respect fallback order when primary source unavailable', async () => {
      const jobData = createMockJobData({
        id: 'precedence-test-2',
        ctx: JSON.stringify({}), // No workflow_context
        payload: JSON.stringify({
          ctx: { retry_count: 50 } // Should be chosen over retryCount and jobData
        }),
        retry_count: '60'
      });

      const result = createMockResult();

      await client.completeJob('precedence-test-2', result, jobData);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'worker:completion:precedence-test-2',
        expect.any(Number),
        expect.stringContaining('"retry_count":50')
      );
    });
  });
});