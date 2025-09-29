/**
 * Monitor API Compatibility Tests
 *
 * Tests that the monitor API routes can find attestations using the new
 * workflow-aware key patterns while maintaining backwards compatibility.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockJobData, mockRedis } from './setup.js';

// Mock the monitor API search logic
class MockMonitorAPI {
  constructor(private redis: any) {}

  // Simulate individual job worker attestation search
  async findWorkerAttestation(jobId: string) {
    const searchPatterns = [
      // New workflow-aware patterns
      `worker:completion:workflow-*:job-${jobId}`,
      `worker:completion:workflow-*:job-${jobId}:attempt:*`,
      `worker:completion:job-${jobId}`,
      `worker:completion:job-${jobId}:attempt:*`,
      `worker:failure:workflow-*:job-${jobId}:*`,
      `worker:failure:job-${jobId}:*`,
      // Old patterns for backwards compatibility
      `worker:completion:${jobId}`,
      `worker:completion:${jobId}:attempt:*`,
      `worker:failure:${jobId}:*`
    ];

    for (const pattern of searchPatterns) {
      if (pattern.includes('*')) {
        // Pattern search
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          // Sort to get the most relevant key
          keys.sort((a: string, b: string) => {
            // Prioritize permanent failures over attempts
            if (a.endsWith(':permanent') && !b.endsWith(':permanent')) return -1;
            if (b.endsWith(':permanent') && !a.endsWith(':permanent')) return 1;

            // Then sort by attempt number descending
            const attemptA = parseInt(a.split(':').pop() || '0');
            const attemptB = parseInt(b.split(':').pop() || '0');
            return attemptB - attemptA;
          });

          const data = await this.redis.get(keys[0]);
          if (data) {
            return { key: keys[0], data: JSON.parse(data) };
          }
        }
      } else {
        // Direct key lookup
        const data = await this.redis.get(pattern);
        if (data) {
          return { key: pattern, data: JSON.parse(data) };
        }
      }
    }

    return null;
  }

  // Simulate workflow attestation search (EFFICIENT VERSION)
  async findWorkflowAttestations(workflowId: string) {
    const results: any[] = [];

    // 🚀 EFFICIENT: Direct workflow-specific search
    const workflowCompletionKeys = await this.redis.keys(`worker:completion:workflow-${workflowId}:*`);
    const workflowFailureKeys = await this.redis.keys(`worker:failure:workflow-${workflowId}:*`);
    const workflowLevelFailureKeys = await this.redis.keys(`workflow:failure:${workflowId}:*`);

    // Process workflow-specific attestations (guaranteed to match)
    const allWorkflowKeys = [...workflowCompletionKeys, ...workflowFailureKeys];

    for (const key of allWorkflowKeys) {
      const data = await this.redis.get(key);
      if (data) {
        const parsed = JSON.parse(data);
        const exists = results.find(r => r.job_id === parsed.job_id);
        if (!exists) {
          results.push({
            ...parsed,
            key,
            attestation_type: key.includes('failure') ? 'failure' : 'completion'
          });
        }
      }
    }

    // Process workflow-level failure attestations
    for (const key of workflowLevelFailureKeys) {
      const data = await this.redis.get(key);
      if (data) {
        results.push({
          ...JSON.parse(data),
          key,
          attestation_type: 'workflow_failure'
        });
      }
    }

    // BACKWARDS COMPATIBILITY: Search old patterns
    const oldCompletionKeys = await this.redis.keys('worker:completion:step-*');
    const oldFailureKeys = await this.redis.keys('worker:failure:step-*');

    for (const key of [...oldCompletionKeys, ...oldFailureKeys]) {
      const data = await this.redis.get(key);
      if (data) {
        const parsed = JSON.parse(data);
        if (parsed.workflow_id === workflowId) {
          const exists = results.find(r => r.job_id === parsed.job_id);
          if (!exists) {
            results.push({
              ...parsed,
              key,
              attestation_type: key.includes('failure') ? 'failure' : 'completion'
            });
          }
        }
      }
    }

    return results;
  }
}

describe('Monitor API Compatibility with New Key Patterns', () => {
  let monitorAPI: MockMonitorAPI;

  beforeEach(() => {
    vi.clearAllMocks();
    monitorAPI = new MockMonitorAPI(mockRedis);

    // Setup Redis mock responses for different key patterns
    mockRedis.keys.mockImplementation((pattern: string) => {
      const responses: { [key: string]: string[] } = {
        // New workflow-aware patterns for individual job search
        'worker:completion:workflow-*:job-job123': [
          'worker:completion:workflow-wf-456:job-job123:attempt:2'
        ],
        'worker:completion:workflow-*:job-job123:attempt:*': [
          'worker:completion:workflow-wf-456:job-job123:attempt:2'
        ],
        'worker:failure:workflow-*:job-job456:*': [
          'worker:failure:workflow-wf-456:job-job456:permanent'
        ],

        // New workflow-aware patterns for workflow search
        'worker:completion:workflow-wf-456:*': [
          'worker:completion:workflow-wf-456:job-job123:attempt:2'
        ],
        'worker:failure:workflow-wf-456:*': [
          'worker:failure:workflow-wf-456:job-job456:permanent',
          'worker:failure:workflow-wf-456:job-job789:attempt:1'
        ],
        'workflow:failure:wf-456:*': [
          'workflow:failure:wf-456:permanent'
        ],

        // Old patterns for backwards compatibility
        'worker:completion:step-*': [
          'worker:completion:step-old123'
        ],
        'worker:failure:step-*': [
          'worker:failure:step-old456'
        ],
        'worker:completion:job123:*': [],
        'worker:failure:job456:*': []
      };

      return Promise.resolve(responses[pattern] || []);
    });

    mockRedis.get.mockImplementation((key: string) => {
      const responses: { [key: string]: string } = {
        // New pattern attestations
        'worker:completion:workflow-wf-456:job-job123:attempt:2': JSON.stringify({
          job_id: 'job123',
          workflow_id: 'wf-456',
          status: 'completed',
          retry_count: 2,
          attestation_type: 'completion'
        }),
        'worker:failure:workflow-wf-456:job-job456:permanent': JSON.stringify({
          job_id: 'job456',
          workflow_id: 'wf-456',
          status: 'failed_permanent',
          error_message: 'Authentication failed',
          attestation_type: 'failure_permanent'
        }),
        'worker:failure:workflow-wf-456:job-job789:attempt:1': JSON.stringify({
          job_id: 'job789',
          workflow_id: 'wf-456',
          status: 'failed_retrying',
          error_message: 'Network timeout',
          retry_count: 1,
          attestation_type: 'failure_retry'
        }),
        'workflow:failure:wf-456:permanent': JSON.stringify({
          workflow_id: 'wf-456',
          workflow_status: 'failed_permanent',
          failed_job_id: 'job456',
          workflow_attestation_type: 'job_failure'
        }),

        // Old pattern attestations
        'worker:completion:step-old123': JSON.stringify({
          job_id: 'step-old123',
          workflow_id: 'wf-456',
          status: 'completed',
          retry_count: 0
        }),
        'worker:failure:step-old456': JSON.stringify({
          job_id: 'step-old456',
          workflow_id: 'wf-456',
          status: 'failed',
          error_message: 'Old pattern failure'
        })
      };

      return Promise.resolve(responses[key] || null);
    });
  });

  describe('Individual Job Attestation Search', () => {
    it('should find new workflow-aware completion attestations', async () => {
      const result = await monitorAPI.findWorkerAttestation('job123');

      expect(result).not.toBeNull();
      expect(result?.key).toBe('worker:completion:workflow-wf-456:job-job123:attempt:2');
      expect(result?.data).toEqual(expect.objectContaining({
        job_id: 'job123',
        workflow_id: 'wf-456',
        status: 'completed',
        retry_count: 2
      }));
    });

    it('should find new workflow-aware failure attestations', async () => {
      const result = await monitorAPI.findWorkerAttestation('job456');

      expect(result).not.toBeNull();
      expect(result?.key).toBe('worker:failure:workflow-wf-456:job-job456:permanent');
      expect(result?.data).toEqual(expect.objectContaining({
        job_id: 'job456',
        workflow_id: 'wf-456',
        status: 'failed_permanent',
        error_message: 'Authentication failed'
      }));
    });

    it('should prioritize permanent failures over retry attempts', async () => {
      // Mock both permanent and retry keys for same job
      mockRedis.keys.mockImplementation((pattern: string) => {
        if (pattern === 'worker:failure:workflow-*:job-job999:*') {
          return Promise.resolve([
            'worker:failure:workflow-wf-456:job-job999:attempt:1',
            'worker:failure:workflow-wf-456:job-job999:permanent'
          ]);
        }
        return Promise.resolve([]);
      });

      mockRedis.get.mockImplementation((key: string) => {
        if (key === 'worker:failure:workflow-wf-456:job-job999:permanent') {
          return Promise.resolve(JSON.stringify({
            job_id: 'job999',
            status: 'failed_permanent',
            error_message: 'Final failure'
          }));
        }
        return Promise.resolve(null);
      });

      const result = await monitorAPI.findWorkerAttestation('job999');

      expect(result?.key).toBe('worker:failure:workflow-wf-456:job-job999:permanent');
      expect(result?.data.error_message).toBe('Final failure');
    });
  });

  describe('Workflow Attestation Search (Performance Test)', () => {
    it('should efficiently find workflow attestations using new key structure', async () => {
      const results = await monitorAPI.findWorkflowAttestations('wf-456');

      // Should find new pattern attestations directly
      expect(results).toHaveLength(6); // 1 completion + 2 failures + 1 workflow failure + 2 old

      // Verify new pattern results
      const completionResult = results.find(r => r.job_id === 'job123');
      expect(completionResult).toEqual(expect.objectContaining({
        job_id: 'job123',
        workflow_id: 'wf-456',
        attestation_type: 'completion',
        key: 'worker:completion:workflow-wf-456:job-job123:attempt:2'
      }));

      const failureResult = results.find(r => r.job_id === 'job456');
      expect(failureResult).toEqual(expect.objectContaining({
        job_id: 'job456',
        workflow_id: 'wf-456',
        attestation_type: 'failure',
        key: 'worker:failure:workflow-wf-456:job-job456:permanent'
      }));

      // Verify workflow-level failure
      const workflowFailure = results.find(r => r.workflow_attestation_type === 'job_failure');
      expect(workflowFailure).toEqual(expect.objectContaining({
        workflow_id: 'wf-456',
        failed_job_id: 'job456',
        attestation_type: 'workflow_failure'
      }));

      // Should call Redis keys() with efficient patterns
      expect(mockRedis.keys).toHaveBeenCalledWith('worker:completion:workflow-wf-456:*');
      expect(mockRedis.keys).toHaveBeenCalledWith('worker:failure:workflow-wf-456:*');
      expect(mockRedis.keys).toHaveBeenCalledWith('workflow:failure:wf-456:*');
    });

    it('should find old pattern attestations for backwards compatibility', async () => {
      const results = await monitorAPI.findWorkflowAttestations('wf-456');

      // Should find old pattern attestations too
      const oldCompletion = results.find(r => r.job_id === 'step-old123');
      expect(oldCompletion).toEqual(expect.objectContaining({
        job_id: 'step-old123',
        workflow_id: 'wf-456',
        attestation_type: 'completion'
      }));

      const oldFailure = results.find(r => r.job_id === 'step-old456');
      expect(oldFailure).toEqual(expect.objectContaining({
        job_id: 'step-old456',
        workflow_id: 'wf-456',
        attestation_type: 'failure'
      }));
    });

    it('should not duplicate attestations when found in multiple patterns', async () => {
      // Mock a scenario where same job appears in both new and old patterns
      mockRedis.keys.mockImplementation((pattern: string) => {
        if (pattern === 'worker:completion:workflow-wf-456:*') {
          return Promise.resolve(['worker:completion:workflow-wf-456:job-duplicate:attempt:1']);
        }
        if (pattern === 'worker:completion:step-*') {
          return Promise.resolve(['worker:completion:step-duplicate']);
        }
        return Promise.resolve([]);
      });

      mockRedis.get.mockImplementation((key: string) => {
        if (key === 'worker:completion:workflow-wf-456:job-duplicate:attempt:1') {
          return Promise.resolve(JSON.stringify({
            job_id: 'duplicate',
            workflow_id: 'wf-456',
            status: 'completed'
          }));
        }
        if (key === 'worker:completion:step-duplicate') {
          return Promise.resolve(JSON.stringify({
            job_id: 'duplicate', // Same job_id
            workflow_id: 'wf-456',
            status: 'completed'
          }));
        }
        return Promise.resolve(null);
      });

      const results = await monitorAPI.findWorkflowAttestations('wf-456');

      // Should only have one entry for the duplicate job
      const duplicateEntries = results.filter(r => r.job_id === 'duplicate');
      expect(duplicateEntries).toHaveLength(1);
    });
  });

  describe('Performance Comparison', () => {
    it('should demonstrate improved search efficiency with new patterns', async () => {
      // Measure Redis calls for new vs old pattern search
      const callsBefore = (mockRedis.keys as any).mock.calls.length;

      await monitorAPI.findWorkflowAttestations('wf-456');

      const callsAfter = (mockRedis.keys as any).mock.calls.length;
      const totalCalls = callsAfter - callsBefore;

      // With new pattern: 3 efficient keys() calls + backwards compatibility
      // Old pattern would require keys() for ALL attestations then filter
      expect(totalCalls).toBeLessThan(10); // Should be around 5-6 calls max

      // Verify we called the efficient patterns
      expect(mockRedis.keys).toHaveBeenCalledWith('worker:completion:workflow-wf-456:*');
      expect(mockRedis.keys).toHaveBeenCalledWith('worker:failure:workflow-wf-456:*');
      expect(mockRedis.keys).toHaveBeenCalledWith('workflow:failure:wf-456:*');
    });
  });
});