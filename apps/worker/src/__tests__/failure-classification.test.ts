/**
 * Failure Classification Tests
 *
 * Tests the new 2-tiered failure classification system that categorizes
 * failures into structured types and reasons for better analysis.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FailureClassifier, FailureType, FailureReason } from '../types/failure-classification.js';
import { RedisDirectWorkerClient } from '../redis-direct-worker-client.js';
import { mockRedis, createMockJobData } from './setup.js';

describe('Failure Classification System', () => {
  let client: RedisDirectWorkerClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new RedisDirectWorkerClient('redis://localhost:6379', 'test-worker');
    (client as any).redis = mockRedis;

    // Mock job lookup responses
    mockRedis.hgetall.mockImplementation((key: string) => {
      if (key === 'job:test-job-123') {
        return Promise.resolve({
          id: 'test-job-123',
          status: 'assigned',
          retry_count: '0',
          max_retries: '3',
          service_required: 'openai_responses',
          workflow_id: 'wf-456'
        });
      }
      return Promise.resolve({});
    });

    // Mock getJob method
    (client as any).getJob = vi.fn().mockResolvedValue({
      id: 'test-job-123',
      status: 'assigned',
      retry_count: 0,
      max_retries: 3,
      service_required: 'openai_responses'
    });
  });

  describe('FailureClassifier.classify', () => {
    it('should classify HTTP authentication errors correctly', () => {
      const error = 'Request failed with status code 401 - Invalid API key';
      const context = { httpStatus: 401, serviceType: 'openai_responses' };

      const result = FailureClassifier.classify(error, context);

      expect(result.failure_type).toBe(FailureType.AUTH_ERROR);
      expect(result.failure_reason).toBe(FailureReason.INVALID_API_KEY);
      expect(result.failure_description).toContain('Authentication failed');
    });

    it('should classify rate limit errors correctly', () => {
      const error = 'Rate limit exceeded: 429 Too Many Requests';
      const context = { httpStatus: 429, serviceType: 'openai_responses' };

      const result = FailureClassifier.classify(error, context);

      expect(result.failure_type).toBe(FailureType.RATE_LIMIT);
      expect(result.failure_reason).toBe(FailureReason.REQUESTS_PER_MINUTE);
      expect(result.failure_description).toContain('rate limit');
    });

    it('should classify generation refusal errors correctly', () => {
      const error = 'Content generation refused: cannot generate violent imagery per policy';
      const context = { serviceType: 'openai_responses' };

      const result = FailureClassifier.classify(error, context);

      expect(result.failure_type).toBe(FailureType.GENERATION_REFUSAL);
      expect(result.failure_reason).toBe(FailureReason.VIOLENCE_DETECTED);
      expect(result.failure_description).toContain('violence');
    });

    it('should classify copyright blocking correctly', () => {
      const error = 'Cannot generate copyrighted character artwork';
      const context = { serviceType: 'openai_responses' };

      const result = FailureClassifier.classify(error, context);

      expect(result.failure_type).toBe(FailureType.GENERATION_REFUSAL);
      expect(result.failure_reason).toBe(FailureReason.COPYRIGHT_BLOCKER);
      expect(result.failure_description).toContain('copyright');
    });

    it('should classify timeout errors correctly', () => {
      const error = 'Network timeout after 30 seconds';
      const context = { timeout: true, serviceType: 'openai_responses' };

      const result = FailureClassifier.classify(error, context);

      expect(result.failure_type).toBe(FailureType.NETWORK_ERROR);
      expect(result.failure_reason).toBe(FailureReason.NETWORK_TIMEOUT);
      expect(result.failure_description).toContain('timeout');
    });

    it('should classify server errors correctly', () => {
      const error = 'HTTP 500: Internal Server Error';
      const context = { httpStatus: 500, serviceType: 'openai_responses' };

      const result = FailureClassifier.classify(error, context);

      expect(result.failure_type).toBe(FailureType.SERVICE_ERROR);
      expect(result.failure_reason).toBe(FailureReason.SERVICE_DOWN);
      expect(result.failure_description).toContain('Service is');
    });

    it('should classify resource exhaustion correctly', () => {
      const error = 'Process ran out of memory: Cannot allocate 8GB for model';
      const context = { serviceType: 'comfyui' };

      const result = FailureClassifier.classify(error, context);

      expect(result.failure_type).toBe(FailureType.RESOURCE_LIMIT);
      expect(result.failure_reason).toBe(FailureReason.OUT_OF_MEMORY);
      expect(result.failure_description).toContain('memory');
    });

    it('should classify validation errors correctly', () => {
      const error = 'Failed to parse JSON response: Unexpected token at position 42';
      const context = { serviceType: 'openai_responses' };

      const result = FailureClassifier.classify(error, context);

      expect(result.failure_type).toBe(FailureType.VALIDATION_ERROR);
      expect(result.failure_reason).toBe(FailureReason.INVALID_RESPONSE_FORMAT);
      expect(result.failure_description).toBe('Service returned invalid or malformed response format');
    });

    it('should provide default classification for unknown errors', () => {
      const error = 'Something completely unexpected happened';
      const context = { serviceType: 'openai_responses' };

      const result = FailureClassifier.classify(error, context);

      expect(result.failure_type).toBe(FailureType.UNKNOWN);
      expect(result.failure_reason).toBe(FailureReason.UNKNOWN_ERROR);
      expect(result.failure_description).toBe('Unclassified error type requiring manual investigation');
    });

    it('should handle service-specific model errors', () => {
      const error = 'Model gpt-5 not found or unavailable';
      const context = { httpStatus: 404, serviceType: 'openai_responses' };

      const result = FailureClassifier.classify(error, context);

      expect(result.failure_type).toBe(FailureType.VALIDATION_ERROR);
      expect(result.failure_reason).toBe(FailureReason.MODEL_NOT_FOUND);
      expect(result.failure_description).toBe('Requested AI model not found or not available');
    });
  });

  describe('Integration with WorkerClient', () => {
    it('should store failure classification in worker attestation', async () => {
      const error = 'Request failed with status code 429 - Rate limit exceeded';
      const context = { httpStatus: 429, serviceType: 'openai_responses' };

      await client.failJob('test-job-123', error, true, context);

      // Find the worker failure attestation call
      const failureAttestationCall = (mockRedis.setex as any).mock.calls.find(
        (call: any) => call[0].includes('worker:failure')
      );

      expect(failureAttestationCall).toBeDefined();
      const attestationData = JSON.parse(failureAttestationCall[2]);

      expect(attestationData.failure_type).toBe(FailureType.RATE_LIMIT);
      expect(attestationData.failure_reason).toBe(FailureReason.API_QUOTA_EXCEEDED);
      expect(attestationData.failure_description).toBe('API rate limit exceeded - requests per minute/hour limit reached');
      expect(attestationData.error_message).toBe(error);
    });

    it('should handle workflow failures with structured classification', async () => {
      const error = 'OpenAI API authentication failed - invalid API key';
      const context = { httpStatus: 401, serviceType: 'openai_responses' };

      await client.failJob('test-job-123', error, false, context);

      // Check worker failure attestation
      const workerFailureCall = (mockRedis.setex as any).mock.calls.find(
        (call: any) => call[0].includes('worker:failure:workflow-wf-456:job-test-job-123:permanent')
      );
      expect(workerFailureCall).toBeDefined();

      const workerAttestation = JSON.parse(workerFailureCall[2]);
      expect(workerAttestation.failure_type).toBe(FailureType.AUTHENTICATION_ERROR);
      expect(workerAttestation.failure_reason).toBe(FailureReason.INVALID_API_KEY);
      expect(workerAttestation.workflow_impact).toBe('workflow_terminated');

      // Check workflow failure attestation
      const workflowFailureCall = (mockRedis.setex as any).mock.calls.find(
        (call: any) => call[0].includes('workflow:failure:wf-456:permanent')
      );
      expect(workflowFailureCall).toBeDefined();

      const workflowAttestation = JSON.parse(workflowFailureCall[2]);
      expect(workflowAttestation.failure_type).toBe(FailureType.AUTHENTICATION_ERROR);
      expect(workflowAttestation.failure_reason).toBe(FailureReason.INVALID_API_KEY);
      expect(workflowAttestation.workflow_status).toBe('failed_permanent');
    });

    it('should differentiate between retryable and permanent failures', async () => {
      // Test retryable failure (network timeout)
      await client.failJob('test-job-123', 'Network timeout after 30 seconds', true, {
        timeout: true,
        serviceType: 'openai_responses'
      });

      const retryFailureCall = (mockRedis.setex as any).mock.calls.find(
        (call: any) => call[0].includes(':attempt:')
      );
      expect(retryFailureCall).toBeDefined();

      const retryAttestation = JSON.parse(retryFailureCall[2]);
      expect(retryAttestation.failure_type).toBe(FailureType.TIMEOUT);
      expect(retryAttestation.failure_reason).toBe(FailureReason.NETWORK_TIMEOUT);
      expect(retryAttestation.status).toBe('failed_retrying');
      expect(retryAttestation.will_retry).toBe(true);

      // Reset mocks
      vi.clearAllMocks();
      mockRedis.hgetall.mockImplementation((key: string) => {
        if (key === 'job:test-job-123') {
          return Promise.resolve({
            id: 'test-job-123',
            status: 'assigned',
            retry_count: '0',
            max_retries: '3',
            service_required: 'openai_responses'
          });
        }
        return Promise.resolve({});
      });

      // Test permanent failure (authentication error)
      await client.failJob('test-job-123', 'Invalid API key', false, {
        httpStatus: 401,
        serviceType: 'openai_responses'
      });

      const permanentFailureCall = (mockRedis.setex as any).mock.calls.find(
        (call: any) => call[0].includes(':permanent')
      );
      expect(permanentFailureCall).toBeDefined();

      const permanentAttestation = JSON.parse(permanentFailureCall[2]);
      expect(permanentAttestation.failure_type).toBe(FailureType.AUTHENTICATION_ERROR);
      expect(permanentAttestation.failure_reason).toBe(FailureReason.INVALID_API_KEY);
      expect(permanentAttestation.status).toBe('failed_permanent');
      expect(permanentAttestation.will_retry).toBe(false);
    });

    it('should handle missing context gracefully', async () => {
      const error = 'Unknown service error';

      await client.failJob('test-job-123', error, true);

      const failureCall = (mockRedis.setex as any).mock.calls.find(
        (call: any) => call[0].includes('worker:failure')
      );
      expect(failureCall).toBeDefined();

      const attestation = JSON.parse(failureCall[2]);
      expect(attestation.failure_type).toBe(FailureType.UNKNOWN);
      expect(attestation.failure_reason).toBe(FailureReason.UNKNOWN_ERROR);
      expect(attestation.failure_description).toBe('Unclassified error type requiring manual investigation');
    });
  });

  describe('Priority Classification', () => {
    it('should prioritize HTTP status codes over error message patterns', () => {
      const error = 'Some generic error message about timeout';
      const context = { httpStatus: 401, serviceType: 'openai_responses' };

      const result = FailureClassifier.classify(error, context);

      // Should classify as AUTH_ERROR based on 401 status, not TIMEOUT based on message
      expect(result.failure_type).toBe(FailureType.AUTHENTICATION_ERROR);
      expect(result.failure_reason).toBe(FailureReason.INVALID_API_KEY);
    });

    it('should fall back to message patterns when no HTTP status', () => {
      const error = 'Connection timeout after 30 seconds';
      const context = { serviceType: 'openai_responses' };

      const result = FailureClassifier.classify(error, context);

      expect(result.failure_type).toBe(FailureType.TIMEOUT);
      expect(result.failure_reason).toBe(FailureReason.NETWORK_TIMEOUT);
    });
  });

  describe('Service-Specific Classification', () => {
    it('should handle OpenAI-specific errors', () => {
      const error = 'OpenAI API rate limit exceeded for organization';
      const context = { httpStatus: 429, serviceType: 'openai_responses' };

      const result = FailureClassifier.classify(error, context);

      expect(result.failure_type).toBe(FailureType.RATE_LIMIT);
      expect(result.failure_reason).toBe(FailureReason.API_QUOTA_EXCEEDED);
    });

    it('should handle ComfyUI-specific errors', () => {
      const error = 'CUDA out of memory during image generation';
      const context = { serviceType: 'comfyui' };

      const result = FailureClassifier.classify(error, context);

      expect(result.failure_type).toBe(FailureType.RESOURCE_EXHAUSTION);
      expect(result.failure_reason).toBe(FailureReason.GPU_MEMORY_INSUFFICIENT);
    });
  });
});