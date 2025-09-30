/**
 * Unit tests for retry suffix generation logic
 *
 * Tests the filename suffix generation without full AssetSaver integration
 */

import { describe, it, expect } from 'vitest';

// Simulate the retry suffix logic from AssetSaver
function generateRetrySuffix(ctx: any): string {
  // Use nullish coalescing to properly handle 0 values
  const retryCount = ctx?.workflow_context?.retry_attempt ?? ctx?.retry_count ?? ctx?.retryCount ?? 0;
  return retryCount > 0 ? `_r${retryCount}` : '';
}

// Simulate filename generation with retry suffix
function generateFilename(jobId: string, timestamp: number, hash: string, suffix: string, extension: string): string {
  return `${jobId}_${timestamp}_${hash}${suffix}.${extension}`;
}

describe('Unit: Retry Suffix Generation', () => {
  describe('suffix generation from workflow_context.retry_attempt', () => {
    it('should not add suffix for initial attempt (retry_attempt = 0)', () => {
      const ctx = {
        workflow_context: {
          retry_attempt: 0
        }
      };

      const suffix = generateRetrySuffix(ctx);
      expect(suffix).toBe('');

      const filename = generateFilename('test-job', 1234567890, 'abcd1234', suffix, 'png');
      expect(filename).toBe('test-job_1234567890_abcd1234.png');
    });

    it('should add _r1 suffix for first retry (retry_attempt = 1)', () => {
      const ctx = {
        workflow_context: {
          retry_attempt: 1
        }
      };

      const suffix = generateRetrySuffix(ctx);
      expect(suffix).toBe('_r1');

      const filename = generateFilename('retry-job', 1234567890, 'abcd1234', suffix, 'png');
      expect(filename).toBe('retry-job_1234567890_abcd1234_r1.png');
    });

    it('should add _r2 suffix for second retry (retry_attempt = 2)', () => {
      const ctx = {
        workflow_context: {
          retry_attempt: 2
        }
      };

      const suffix = generateRetrySuffix(ctx);
      expect(suffix).toBe('_r2');

      const filename = generateFilename('retry-job-2', 1234567890, 'abcd1234', suffix, 'jpg');
      expect(filename).toBe('retry-job-2_1234567890_abcd1234_r2.jpg');
    });

    it('should handle high retry counts (retry_attempt = 10)', () => {
      const ctx = {
        workflow_context: {
          retry_attempt: 10
        }
      };

      const suffix = generateRetrySuffix(ctx);
      expect(suffix).toBe('_r10');

      const filename = generateFilename('high-retry', 1234567890, 'abcd1234', suffix, 'mp4');
      expect(filename).toBe('high-retry_1234567890_abcd1234_r10.mp4');
    });
  });

  describe('fallback retry sources', () => {
    it('should fall back to ctx.retry_count when workflow_context unavailable', () => {
      const ctx = {
        retry_count: 3
      };

      const suffix = generateRetrySuffix(ctx);
      expect(suffix).toBe('_r3');
    });

    it('should fall back to ctx.retryCount when other sources unavailable', () => {
      const ctx = {
        retryCount: 4
      };

      const suffix = generateRetrySuffix(ctx);
      expect(suffix).toBe('_r4');
    });

    it('should default to no suffix when no retry count found', () => {
      const ctx = {};

      const suffix = generateRetrySuffix(ctx);
      expect(suffix).toBe('');
    });
  });

  describe('precedence order', () => {
    it('should prioritize workflow_context.retry_attempt over other sources', () => {
      const ctx = {
        workflow_context: {
          retry_attempt: 5
        },
        retry_count: 10,
        retryCount: 15
      };

      const suffix = generateRetrySuffix(ctx);
      expect(suffix).toBe('_r5');
    });

    it('should use workflow_context.retry_attempt even when 0', () => {
      const ctx = {
        workflow_context: {
          retry_attempt: 0
        },
        retry_count: 7
      };

      const suffix = generateRetrySuffix(ctx);
      expect(suffix).toBe(''); // 0 means no retry, so no suffix
    });
  });

  describe('data type handling', () => {
    it('should handle string retry count values', () => {
      const ctx = {
        workflow_context: {
          retry_attempt: '6'
        }
      };

      const suffix = generateRetrySuffix(ctx);
      expect(suffix).toBe('_r6');
    });

    it('should handle null retry count gracefully', () => {
      const ctx = {
        workflow_context: {
          retry_attempt: null
        },
        retry_count: null,
        retryCount: null
      };

      const suffix = generateRetrySuffix(ctx);
      expect(suffix).toBe('');
    });

    it('should handle undefined retry count gracefully', () => {
      const ctx = {
        workflow_context: {}
      };

      const suffix = generateRetrySuffix(ctx);
      expect(suffix).toBe('');
    });
  });

  describe('different file formats', () => {
    it('should add retry suffix to all file formats', () => {
      const ctx = {
        workflow_context: {
          retry_attempt: 2
        }
      };

      const suffix = generateRetrySuffix(ctx);
      const formats = ['png', 'jpg', 'webp', 'gif', 'mp4', 'wav'];

      for (const format of formats) {
        const filename = generateFilename(`test-${format}`, 1234567890, 'abcd1234', suffix, format);
        expect(filename).toBe(`test-${format}_1234567890_abcd1234_r2.${format}`);
      }
    });
  });
});