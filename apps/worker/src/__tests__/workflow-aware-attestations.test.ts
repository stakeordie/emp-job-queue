/**
 * Comprehensive Tests for New Workflow-Aware Attestation System
 *
 * Tests the new key structure and service error handling:
 * - Workflow-aware key patterns with workflow_id in keys
 * - Different service error types and failure detection
 * - Complete vs retry attestation handling
 * - Monitor API compatibility with new patterns
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RedisDirectWorkerClient } from '../redis-direct-worker-client.js';
import { createMockJobData, mockRedis } from './setup.js';
import { JobStatus } from '@emp/core';

// Mock different types of service errors for testing
const SERVICE_ERRORS = {
  HTTP_500: {
    success: false,
    error: 'HTTP 500: Internal Server Error',
    shouldRetry: true,
    response_status: 500
  },
  HTTP_404: {
    success: false,
    error: 'HTTP 404: Model not found',
    shouldRetry: false,
    response_status: 404
  },
  OPENAI_AUTH_ERROR: {
    success: false,
    error: 'OpenAI API authentication failed - invalid API key',
    shouldRetry: false,
    response_code: 'invalid_api_key'
  },
  NETWORK_TIMEOUT: {
    success: false,
    error: 'Network timeout after 30 seconds',
    shouldRetry: true,
    timeout: true
  },
  RATE_LIMIT: {
    success: false,
    error: 'Rate limit exceeded: 429 Too Many Requests',
    shouldRetry: true,
    response_status: 429,
    retry_after: 60
  },
  JSON_PARSE_ERROR: {
    success: false,
    error: 'Failed to parse JSON response: Unexpected token at position 42',
    shouldRetry: false,
    parse_error: true
  },
  OUT_OF_MEMORY: {
    success: false,
    error: 'Process ran out of memory: Cannot allocate 8GB for model',
    shouldRetry: false,
    memory_error: true
  }
};

describe('Workflow-Aware Attestation System', () => {
  let client: RedisDirectWorkerClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new RedisDirectWorkerClient('redis://localhost:6379', 'test-worker');
    (client as any).redis = mockRedis;

    // Mock process environment
    process.env.MACHINE_ID = 'test-machine-456';
    process.env.VERSION = '1.0.0-test';

    // Mock job lookup responses
    mockRedis.hgetall.mockImplementation((key: string) => {
      if (key === 'job:workflow-job-123') {
        return Promise.resolve({
          id: 'workflow-job-123',
          status: JobStatus.ASSIGNED,
          retry_count: '1',
          max_retries: '3',
          workflow_id: 'wf-456',
          current_step: '2',
          total_steps: '5',
          service_required: 'openai_responses'
        });
      }
      if (key === 'job:standalone-job-789') {
        return Promise.resolve({
          id: 'standalone-job-789',
          status: JobStatus.ASSIGNED,
          retry_count: '0',
          max_retries: '2',
          // No workflow_id - standalone job
          service_required: 'comfyui'
        });
      }
      return Promise.resolve({});
    });

    // Mock fresh job data fetch for both completeJob and failJob
    mockRedis.hgetall.mockImplementation((key: string) => {
      if (key === 'job:workflow-job-123') {
        return Promise.resolve({
          id: 'workflow-job-123',
          status: JobStatus.ASSIGNED,
          retry_count: '1', // This should give us attempt:2 in completion key
          max_retries: '3',
          workflow_id: 'wf-456',
          current_step: '2',
          total_steps: '5',
          service_required: 'openai_responses'
        });
      }
      if (key === 'job:standalone-job-789') {
        return Promise.resolve({
          id: 'standalone-job-789',
          status: JobStatus.ASSIGNED,
          retry_count: '0',
          max_retries: '2',
          // No workflow_id - standalone job
          service_required: 'comfyui'
        });
      }
      return Promise.resolve({});
    });

    // Mock getJob method
    (client as any).getJob = vi.fn().mockImplementation((jobId: string) => {
      if (jobId === 'workflow-job-123') {
        return Promise.resolve({
          id: 'workflow-job-123',
          status: JobStatus.ASSIGNED,
          retry_count: 1,
          max_retries: 3
        });
      }
      if (jobId === 'standalone-job-789') {
        return Promise.resolve({
          id: 'standalone-job-789',
          status: JobStatus.ASSIGNED,
          retry_count: 0,
          max_retries: 2
        });
      }
      return Promise.resolve(null);
    });
  });

  describe('New Workflow-Aware Key Patterns', () => {
    it('should create workflow-aware completion keys for workflow jobs', async () => {
      const result = { success: true, data: { response: 'Success!' } };

      await client.completeJob('workflow-job-123', result);

      // Should use new workflow-aware key pattern
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'worker:completion:workflow-wf-456:job-workflow-job-123:attempt:2', // retry_count + 1
        expect.any(Number),
        expect.any(String)
      );
    });

    it('should create workflow-aware failure keys for workflow job failures', async () => {
      await client.failJob('workflow-job-123', 'Test error', true); // Retry attempt

      // Should create workflow-aware failure key
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'worker:failure:workflow-wf-456:job-workflow-job-123:attempt:2',
        expect.any(Number),
        expect.any(String)
      );

      // Should also create workflow-level failure attestation
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'workflow:failure:wf-456:attempt:2',
        expect.any(Number),
        expect.any(String)
      );
    });

    it('should create permanent failure keys for non-retryable failures', async () => {
      await client.failJob('workflow-job-123', 'Permanent error', false);

      // Should create permanent failure key
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'worker:failure:workflow-wf-456:job-workflow-job-123:permanent',
        expect.any(Number),
        expect.any(String)
      );

      // Should create workflow-level permanent failure
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'workflow:failure:wf-456:permanent',
        expect.any(Number),
        expect.any(String)
      );

      // Should also create backwards-compatible completion key
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'worker:completion:workflow-wf-456:job-workflow-job-123',
        expect.any(Number),
        expect.any(String)
      );
    });

    it('should create standalone job keys for non-workflow jobs', async () => {
      await client.failJob('standalone-job-789', 'Standalone error', false);

      // Should create standalone job key (no workflow prefix)
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'worker:failure:job-standalone-job-789:permanent',
        expect.any(Number),
        expect.any(String)
      );

      // Should create backwards-compatible completion key
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'worker:completion:job-standalone-job-789',
        expect.any(Number),
        expect.any(String)
      );

      // Should NOT create workflow-level failures (no workflow)
      const workflowFailureCalls = (mockRedis.setex as any).mock.calls.filter(
        (call: any) => call[0].includes('workflow:failure')
      );
      expect(workflowFailureCalls).toHaveLength(0);
    });
  });

  describe('Service Error Type Detection and Handling', () => {
    it('should handle HTTP 500 errors as retryable', async () => {
      const error = SERVICE_ERRORS.HTTP_500;

      await client.failJob('workflow-job-123', error.error, error.shouldRetry);

      // Should create retry attempt (not permanent)
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'worker:failure:workflow-wf-456:job-workflow-job-123:attempt:2',
        expect.any(Number),
        expect.stringMatching(/failed_retrying/)
      );

      // Should requeue job
      expect(mockRedis.hmset).toHaveBeenCalledWith(
        'job:workflow-job-123',
        expect.objectContaining({
          status: JobStatus.PENDING,
          retry_count: '2'
        })
      );
    });

    it('should handle authentication errors as non-retryable', async () => {
      const error = SERVICE_ERRORS.OPENAI_AUTH_ERROR;

      await client.failJob('workflow-job-123', error.error, error.shouldRetry);

      // Should create permanent failure
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'worker:failure:workflow-wf-456:job-workflow-job-123:permanent',
        expect.any(Number),
        expect.stringMatching(/failed_permanent/)
      );

      // Should mark job as FAILED
      expect(mockRedis.hmset).toHaveBeenCalledWith(
        'job:workflow-job-123',
        expect.objectContaining({
          status: JobStatus.FAILED,
          retry_count: '2'
        })
      );
    });

    it('should handle network timeouts as retryable', async () => {
      const error = SERVICE_ERRORS.NETWORK_TIMEOUT;

      await client.failJob('workflow-job-123', error.error, error.shouldRetry);

      // Should create retry attempt
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'worker:failure:workflow-wf-456:job-workflow-job-123:attempt:2',
        expect.any(Number),
        expect.any(String)
      );
    });

    it('should handle rate limits as retryable with metadata', async () => {
      const error = SERVICE_ERRORS.RATE_LIMIT;

      await client.failJob('workflow-job-123', error.error, error.shouldRetry);

      const attestationCall = (mockRedis.setex as any).mock.calls.find(
        (call: any) => call[0] === 'worker:failure:workflow-wf-456:job-workflow-job-123:attempt:2'
      );

      expect(attestationCall).toBeDefined();
      const attestationData = JSON.parse(attestationCall[2]);

      expect(attestationData.error_message).toContain('Rate limit exceeded');
      expect(attestationData.status).toBe('failed_retrying');
    });

    it('should handle JSON parse errors as non-retryable', async () => {
      const error = SERVICE_ERRORS.JSON_PARSE_ERROR;

      await client.failJob('workflow-job-123', error.error, error.shouldRetry);

      // Should create permanent failure
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'worker:failure:workflow-wf-456:job-workflow-job-123:permanent',
        expect.any(Number),
        expect.any(String)
      );
    });

    it('should handle memory errors as non-retryable', async () => {
      const error = SERVICE_ERRORS.OUT_OF_MEMORY;

      await client.failJob('workflow-job-123', error.error, error.shouldRetry);

      // Should create permanent failure
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'worker:failure:workflow-wf-456:job-workflow-job-123:permanent',
        expect.any(Number),
        expect.any(String)
      );

      const attestationCall = (mockRedis.setex as any).mock.calls.find(
        (call: any) => call[0] === 'worker:failure:workflow-wf-456:job-workflow-job-123:permanent'
      );

      const attestationData = JSON.parse(attestationCall[2]);
      expect(attestationData.error_message).toContain('out of memory');
      expect(attestationData.workflow_impact).toBe('workflow_terminated');
    });
  });

  describe('Attestation Data Completeness', () => {
    it('should include all required workflow fields in failure attestations', async () => {
      await client.failJob('workflow-job-123', 'Test error', false);

      const workerAttestationCall = (mockRedis.setex as any).mock.calls.find(
        (call: any) => call[0].includes('worker:failure')
      );

      const attestationData = JSON.parse(workerAttestationCall[2]);

      expect(attestationData).toEqual(expect.objectContaining({
        attestation_type: 'failure_permanent',
        job_id: 'workflow-job-123',
        worker_id: 'test-worker',
        status: 'failed_permanent',
        error_message: 'Test error',
        workflow_id: 'wf-456',
        current_step: '2',
        total_steps: '5',
        machine_id: 'test-machine-456',
        worker_version: '1.0.0-test',
        retry_count: 2,
        will_retry: false,
        max_retries: 3
      }));

      expect(attestationData.failed_at).toBeTypeOf('string');
      expect(attestationData.attestation_created_at).toBeTypeOf('number');
    });

    it('should include workflow-specific data in workflow-level attestations', async () => {
      await client.failJob('workflow-job-123', 'Workflow failure', false);

      const workflowAttestationCall = (mockRedis.setex as any).mock.calls.find(
        (call: any) => call[0].includes('workflow:failure')
      );

      const workflowData = JSON.parse(workflowAttestationCall[2]);

      expect(workflowData).toEqual(expect.objectContaining({
        workflow_attestation_type: 'job_failure',
        failed_job_id: 'workflow-job-123',
        workflow_status: 'failed_permanent',
        workflow_impact: 'workflow_terminated',
        workflow_id: 'wf-456'
      }));
    });
  });

  describe('Backwards Compatibility', () => {
    it('should maintain backwards-compatible keys for permanent failures', async () => {
      await client.failJob('workflow-job-123', 'Permanent failure', false);

      // Should create both new and old key patterns
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'worker:failure:workflow-wf-456:job-workflow-job-123:permanent', // New pattern
        expect.any(Number),
        expect.any(String)
      );

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'worker:completion:workflow-wf-456:job-workflow-job-123', // Backwards compatible
        expect.any(Number),
        expect.any(String)
      );
    });

    it('should handle completion attestations with retry attempts', async () => {
      // Mock job with retry count
      mockRedis.hgetall.mockResolvedValueOnce({
        workflow_id: 'wf-456',
        current_step: '2',
        total_steps: '5',
        retry_count: '1' // Second attempt
      });

      const result = { success: true, data: { response: 'Success after retry' } };
      await client.completeJob('workflow-job-123', result);

      // Should create attempt-based completion key
      const completionCalls = (mockRedis.setex as any).mock.calls.filter(
        (call: any) => call[0].includes('worker:completion')
      );

      expect(completionCalls.length).toBeGreaterThan(0);
      expect(completionCalls[0][0]).toMatch(/attempt:/);
    });
  });
});