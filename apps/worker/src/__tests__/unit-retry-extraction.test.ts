/**
 * Unit tests for retry count extraction logic
 *
 * Tests the specific retry count extraction logic without full system integration
 */

import { describe, it, expect } from 'vitest';

// Simulate the retry count extraction logic from the worker
function extractRetryCount(jobData: any, parsedPayload: any = {}) {
  let parsedCtx: any = null;
  try {
    parsedCtx = typeof jobData.ctx === 'string' ? JSON.parse(jobData.ctx) : jobData.ctx;
  } catch (error) {
    // Handle malformed ctx gracefully
  }

  const retryCount =
    parsedCtx?.workflow_context?.retry_attempt ||
    parsedPayload.ctx?.retry_count ||
    parsedPayload.ctx?.retryCount ||
    parseInt(jobData.retry_count || '0');

  return retryCount;
}

describe('Unit: Retry Count Extraction Logic', () => {
  describe('workflow_context.retry_attempt precedence', () => {
    it('should extract retry count from workflow_context.retry_attempt', () => {
      const jobData = {
        id: 'test-job',
        ctx: JSON.stringify({
          workflow_context: {
            retry_attempt: 2
          }
        }),
        retry_count: '0'
      };

      const result = extractRetryCount(jobData);
      expect(result).toBe(2);
    });

    it('should handle string retry_attempt values', () => {
      const jobData = {
        ctx: JSON.stringify({
          workflow_context: {
            retry_attempt: '3'
          }
        })
      };

      const result = extractRetryCount(jobData);
      expect(result).toBe('3');
    });

    it('should prioritize workflow_context over other sources', () => {
      const jobData = {
        ctx: JSON.stringify({
          workflow_context: { retry_attempt: 5 }
        }),
        retry_count: '10'
      };

      const parsedPayload = {
        ctx: { retry_count: 15, retryCount: 20 }
      };

      const result = extractRetryCount(jobData, parsedPayload);
      expect(result).toBe(5);
    });
  });

  describe('fallback sources', () => {
    it('should fall back to parsedPayload.ctx.retry_count', () => {
      const jobData = {
        ctx: JSON.stringify({}),
        retry_count: '10'
      };

      const parsedPayload = {
        ctx: { retry_count: 4 }
      };

      const result = extractRetryCount(jobData, parsedPayload);
      expect(result).toBe(4);
    });

    it('should fall back to parsedPayload.ctx.retryCount', () => {
      const jobData = {
        ctx: JSON.stringify({}),
        retry_count: '10'
      };

      const parsedPayload = {
        ctx: { retryCount: 7 }
      };

      const result = extractRetryCount(jobData, parsedPayload);
      expect(result).toBe(7);
    });

    it('should fall back to jobData.retry_count', () => {
      const jobData = {
        ctx: JSON.stringify({}),
        retry_count: '6'
      };

      const parsedPayload = {};

      const result = extractRetryCount(jobData, parsedPayload);
      expect(result).toBe(6);
    });

    it('should default to 0 when no sources available', () => {
      const jobData = {
        ctx: JSON.stringify({})
      };

      const result = extractRetryCount(jobData);
      expect(result).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should handle malformed ctx JSON gracefully', () => {
      const jobData = {
        ctx: 'invalid-json{',
        retry_count: '2'
      };

      const result = extractRetryCount(jobData);
      expect(result).toBe(2);
    });

    it('should handle null/undefined values gracefully', () => {
      const jobData = {
        ctx: JSON.stringify({
          workflow_context: { retry_attempt: null }
        }),
        retry_count: null
      };

      const result = extractRetryCount(jobData);
      expect(result).toBe(0);
    });
  });
});