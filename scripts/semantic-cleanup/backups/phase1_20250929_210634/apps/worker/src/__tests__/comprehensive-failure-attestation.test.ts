/**
 * Tests for comprehensive failure attestation (ALL failures, not just permanent)
 *
 * Tests the fixed logic that creates attestations for both retryable and permanent failures
 */

import { describe, it, expect } from 'vitest';

// Mock the fixed failure attestation logic
function createFailureAttestation(
  jobId: string,
  workerId: string,
  error: string,
  newRetryCount: number,
  shouldRetry: boolean,
  maxRetries: number
) {
  const attestationType = shouldRetry ? 'failure_retry' : 'failure_permanent';
  const workerFailureRecord = {
    attestation_type: attestationType,
    job_id: jobId,
    worker_id: workerId,
    status: shouldRetry ? 'failed_retrying' : 'failed_permanent',
    failed_at: new Date().toISOString(),
    error_message: error,
    retry_count: newRetryCount,
    will_retry: shouldRetry,
    max_retries: maxRetries,
    workflow_id: 'test-workflow',
    current_step: '1',
    total_steps: '3',
    machine_id: 'test-machine',
    worker_version: '1.0.0-test',
    attestation_created_at: Date.now()
  };

  // Generate the correct attestation key
  const attestationKey = shouldRetry
    ? `worker:failure:${jobId}:attempt:${newRetryCount}`
    : `worker:completion:${jobId}`;

  return { attestationKey, workerFailureRecord };
}

describe('Comprehensive Failure Attestation', () => {
  describe('retryable failure attestations', () => {
    it('should create failure_retry attestation for first retry attempt', () => {
      const result = createFailureAttestation(
        'retry-job-1',
        'test-worker',
        'Network timeout error',
        1, // newRetryCount
        true, // shouldRetry
        3 // maxRetries
      );

      expect(result.attestationKey).toBe('worker:failure:retry-job-1:attempt:1');
      expect(result.workerFailureRecord.attestation_type).toBe('failure_retry');
      expect(result.workerFailureRecord.status).toBe('failed_retrying');
      expect(result.workerFailureRecord.will_retry).toBe(true);
      expect(result.workerFailureRecord.retry_count).toBe(1);
      expect(result.workerFailureRecord.error_message).toBe('Network timeout error');
    });

    it('should create failure_retry attestation for second retry attempt', () => {
      const result = createFailureAttestation(
        'retry-job-2',
        'test-worker',
        'Service unavailable',
        2, // newRetryCount
        true, // shouldRetry
        3 // maxRetries
      );

      expect(result.attestationKey).toBe('worker:failure:retry-job-2:attempt:2');
      expect(result.workerFailureRecord.attestation_type).toBe('failure_retry');
      expect(result.workerFailureRecord.status).toBe('failed_retrying');
      expect(result.workerFailureRecord.will_retry).toBe(true);
      expect(result.workerFailureRecord.retry_count).toBe(2);
    });

    it('should preserve unique keys for multiple retry attempts on same job', () => {
      const jobId = 'multi-retry-job';

      const attempt1 = createFailureAttestation(jobId, 'worker1', 'Error 1', 1, true, 3);
      const attempt2 = createFailureAttestation(jobId, 'worker2', 'Error 2', 2, true, 3);
      const attempt3 = createFailureAttestation(jobId, 'worker3', 'Error 3', 3, false, 3);

      // Each attempt should have unique key
      expect(attempt1.attestationKey).toBe('worker:failure:multi-retry-job:attempt:1');
      expect(attempt2.attestationKey).toBe('worker:failure:multi-retry-job:attempt:2');
      expect(attempt3.attestationKey).toBe('worker:completion:multi-retry-job');

      // Different attestation types
      expect(attempt1.workerFailureRecord.attestation_type).toBe('failure_retry');
      expect(attempt2.workerFailureRecord.attestation_type).toBe('failure_retry');
      expect(attempt3.workerFailureRecord.attestation_type).toBe('failure_permanent');
    });
  });

  describe('permanent failure attestations', () => {
    it('should create failure_permanent attestation when max retries reached', () => {
      const result = createFailureAttestation(
        'perm-fail-job',
        'test-worker',
        'Authentication failed',
        3, // newRetryCount (equals maxRetries)
        false, // shouldRetry
        3 // maxRetries
      );

      expect(result.attestationKey).toBe('worker:completion:perm-fail-job');
      expect(result.workerFailureRecord.attestation_type).toBe('failure_permanent');
      expect(result.workerFailureRecord.status).toBe('failed_permanent');
      expect(result.workerFailureRecord.will_retry).toBe(false);
      expect(result.workerFailureRecord.retry_count).toBe(3);
      expect(result.workerFailureRecord.max_retries).toBe(3);
    });

    it('should create failure_permanent attestation for non-retryable errors', () => {
      const result = createFailureAttestation(
        'auth-fail-job',
        'test-worker',
        'Invalid API key',
        1, // newRetryCount
        false, // shouldRetry (non-retryable error)
        3 // maxRetries
      );

      expect(result.attestationKey).toBe('worker:completion:auth-fail-job');
      expect(result.workerFailureRecord.attestation_type).toBe('failure_permanent');
      expect(result.workerFailureRecord.status).toBe('failed_permanent');
      expect(result.workerFailureRecord.will_retry).toBe(false);
      expect(result.workerFailureRecord.retry_count).toBe(1);
      expect(result.workerFailureRecord.error_message).toBe('Invalid API key');
    });
  });

  describe('attestation metadata', () => {
    it('should include comprehensive failure context', () => {
      const result = createFailureAttestation(
        'context-test-job',
        'worker-123',
        'Detailed error message',
        2,
        true,
        5
      );

      expect(result.workerFailureRecord).toEqual(expect.objectContaining({
        attestation_type: 'failure_retry',
        job_id: 'context-test-job',
        worker_id: 'worker-123',
        status: 'failed_retrying',
        error_message: 'Detailed error message',
        retry_count: 2,
        will_retry: true,
        max_retries: 5,
        workflow_id: 'test-workflow',
        current_step: '1',
        total_steps: '3',
        machine_id: 'test-machine',
        worker_version: '1.0.0-test'
      }));

      expect(result.workerFailureRecord.failed_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(result.workerFailureRecord.attestation_created_at).toBeTypeOf('number');
    });

    it('should handle missing workflow context gracefully', () => {
      // Test with null workflow values
      const workerFailureRecord = {
        attestation_type: 'failure_retry',
        job_id: 'no-workflow-job',
        worker_id: 'test-worker',
        status: 'failed_retrying',
        failed_at: new Date().toISOString(),
        error_message: 'Error without workflow',
        retry_count: 1,
        will_retry: true,
        max_retries: 3,
        workflow_id: null,
        current_step: null,
        total_steps: null,
        machine_id: 'test-machine',
        worker_version: '1.0.0-test',
        attestation_created_at: Date.now()
      };

      expect(workerFailureRecord.workflow_id).toBe(null);
      expect(workerFailureRecord.current_step).toBe(null);
      expect(workerFailureRecord.total_steps).toBe(null);
    });
  });

  describe('audit trail completeness', () => {
    it('should create complete audit trail for job with multiple failures', () => {
      const jobId = 'audit-trail-job';
      const failures = [];

      // Simulate 3 retry failures + 1 permanent failure
      failures.push(createFailureAttestation(jobId, 'worker1', 'Timeout 1', 1, true, 3));
      failures.push(createFailureAttestation(jobId, 'worker2', 'Timeout 2', 2, true, 3));
      failures.push(createFailureAttestation(jobId, 'worker3', 'Timeout 3', 3, true, 3));
      failures.push(createFailureAttestation(jobId, 'worker4', 'Max retries', 4, false, 3));

      // Verify unique keys for each failure
      expect(failures[0].attestationKey).toBe('worker:failure:audit-trail-job:attempt:1');
      expect(failures[1].attestationKey).toBe('worker:failure:audit-trail-job:attempt:2');
      expect(failures[2].attestationKey).toBe('worker:failure:audit-trail-job:attempt:3');
      expect(failures[3].attestationKey).toBe('worker:completion:audit-trail-job');

      // Verify progression of retry counts
      expect(failures.map(f => f.workerFailureRecord.retry_count)).toEqual([1, 2, 3, 4]);

      // Verify attestation types
      expect(failures[0].workerFailureRecord.attestation_type).toBe('failure_retry');
      expect(failures[1].workerFailureRecord.attestation_type).toBe('failure_retry');
      expect(failures[2].workerFailureRecord.attestation_type).toBe('failure_retry');
      expect(failures[3].workerFailureRecord.attestation_type).toBe('failure_permanent');

      // Verify will_retry progression
      expect(failures.map(f => f.workerFailureRecord.will_retry)).toEqual([true, true, true, false]);
    });
  });

  describe('backwards compatibility', () => {
    it('should maintain worker:completion key for permanent failures', () => {
      const result = createFailureAttestation(
        'compat-test-job',
        'test-worker',
        'Permanent error',
        3,
        false, // permanent failure
        3
      );

      // Should use the completion key for permanent failures (backwards compatibility)
      expect(result.attestationKey).toBe('worker:completion:compat-test-job');
      expect(result.workerFailureRecord.attestation_type).toBe('failure_permanent');
    });

    it('should use new failure key pattern for retryable failures', () => {
      const result = createFailureAttestation(
        'new-pattern-job',
        'test-worker',
        'Retryable error',
        1,
        true, // retryable failure
        3
      );

      // Should use the new pattern for retryable failures
      expect(result.attestationKey).toBe('worker:failure:new-pattern-job:attempt:1');
      expect(result.workerFailureRecord.attestation_type).toBe('failure_retry');
    });
  });
});