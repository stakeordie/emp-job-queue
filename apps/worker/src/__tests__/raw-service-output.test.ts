/**
 * Tests for raw service output storage in attestations
 *
 * Tests that raw service requests and responses are properly captured,
 * sanitized (base64 data scrubbed), and stored in worker attestations
 * for debugging and forensics purposes.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RedisDirectWorkerClient } from '../redis-direct-worker-client.js';
import { createMockJobData, createMockResult, mockRedis } from './setup.js';

describe('Raw Service Output Storage', () => {
  let client: RedisDirectWorkerClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new RedisDirectWorkerClient('redis://localhost:6379', 'test-worker');
    (client as any).redis = mockRedis;
  });

  describe('completion attestation raw output', () => {
    it('should store raw service output with base64 data scrubbed', async () => {
      const jobData = createMockJobData({
        id: 'raw-output-test-1'
      });

      const result = createMockResult({
        success: true,
        data: {
          choices: [
            {
              message: {
                content: 'Generated text response'
              }
            }
          ],
          usage: {
            prompt_tokens: 50,
            completion_tokens: 100,
            total_tokens: 150
          }
        },
        raw_request_payload: {
          model: 'gpt-4',
          messages: [
            { role: 'user', content: 'Create an image' }
          ],
          max_tokens: 100
        }
      });

      await client.completeJob('raw-output-test-1', result, jobData);

      const attestationCall = mockRedis.setex.mock.calls.find(call =>
        call[0] === 'worker:completion:raw-output-test-1'
      );

      expect(attestationCall).toBeDefined();
      const attestationData = JSON.parse(attestationCall[2]);

      // Should have raw service output with scrubbed base64
      expect(attestationData.raw_service_output).toBeDefined();
      const rawOutput = JSON.parse(attestationData.raw_service_output);

      expect(rawOutput).toEqual(expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          choices: [
            {
              message: {
                content: 'Generated text response'
              }
            }
          ],
          usage: {
            prompt_tokens: 50,
            completion_tokens: 100,
            total_tokens: 150
          }
        })
      }));
    });

    it('should store raw request payload when available', async () => {
      const jobData = createMockJobData({
        id: 'raw-request-test-1'
      });

      const result = createMockResult({
        raw_request_payload: {
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: 'You are a helpful assistant' },
            { role: 'user', content: 'Generate a sunset image' }
          ],
          temperature: 0.7,
          max_tokens: 200
        }
      });

      await client.completeJob('raw-request-test-1', result, jobData);

      const attestationCall = mockRedis.setex.mock.calls.find(call =>
        call[0] === 'worker:completion:raw-request-test-1'
      );

      const attestationData = JSON.parse(attestationCall[2]);

      expect(attestationData.raw_service_request).toBeDefined();
      const rawRequest = JSON.parse(attestationData.raw_service_request);

      expect(rawRequest).toEqual({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a helpful assistant' },
          { role: 'user', content: 'Generate a sunset image' }
        ],
        temperature: 0.7,
        max_tokens: 200
      });
    });

    it('should handle null raw request payload gracefully', async () => {
      const jobData = createMockJobData({
        id: 'null-request-test'
      });

      const result = createMockResult({
        raw_request_payload: null
      });

      await client.completeJob('null-request-test', result, jobData);

      const attestationCall = mockRedis.setex.mock.calls.find(call =>
        call[0] === 'worker:completion:null-request-test'
      );

      const attestationData = JSON.parse(attestationCall[2]);

      expect(attestationData.raw_service_request).toBe(null);
    });

    it('should handle missing raw request payload gracefully', async () => {
      const jobData = createMockJobData({
        id: 'missing-request-test'
      });

      const result = createMockResult({
        // No raw_request_payload property
      });

      await client.completeJob('missing-request-test', result, jobData);

      const attestationCall = mockRedis.setex.mock.calls.find(call =>
        call[0] === 'worker:completion:missing-request-test'
      );

      const attestationData = JSON.parse(attestationCall[2]);

      expect(attestationData.raw_service_request).toBe(null);
    });
  });

  describe('base64 data scrubbing', () => {
    it('should scrub base64 image data from raw output', async () => {
      const jobData = createMockJobData({
        id: 'base64-scrub-test'
      });

      const result = createMockResult({
        data: {
          images: [
            {
              base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
              url: 'https://cdn.example.com/generated-image.png'
            }
          ]
        }
      });

      await client.completeJob('base64-scrub-test', result, jobData);

      const attestationCall = mockRedis.setex.mock.calls.find(call =>
        call[0] === 'worker:completion:base64-scrub-test'
      );

      const attestationData = JSON.parse(attestationCall[2]);
      const rawOutput = JSON.parse(attestationData.raw_service_output);

      // Base64 data should be scrubbed but URLs preserved
      expect(rawOutput.data.images[0]).toEqual({
        base64: '[SCRUBBED_BASE64_DATA]',
        url: 'https://cdn.example.com/generated-image.png'
      });
    });

    it('should preserve non-base64 data in raw output', async () => {
      const jobData = createMockJobData({
        id: 'preserve-data-test'
      });

      const result = createMockResult({
        data: {
          text: 'Generated response text',
          metadata: {
            model: 'gpt-4',
            finish_reason: 'stop',
            usage: {
              prompt_tokens: 25,
              completion_tokens: 75
            }
          },
          urls: [
            'https://example.com/image1.png',
            'https://example.com/image2.jpg'
          ]
        }
      });

      await client.completeJob('preserve-data-test', result, jobData);

      const attestationCall = mockRedis.setex.mock.calls.find(call =>
        call[0] === 'worker:completion:preserve-data-test'
      );

      const attestationData = JSON.parse(attestationCall[2]);
      const rawOutput = JSON.parse(attestationData.raw_service_output);

      // All non-base64 data should be preserved exactly
      expect(rawOutput.data).toEqual({
        text: 'Generated response text',
        metadata: {
          model: 'gpt-4',
          finish_reason: 'stop',
          usage: {
            prompt_tokens: 25,
            completion_tokens: 75
          }
        },
        urls: [
          'https://example.com/image1.png',
          'https://example.com/image2.jpg'
        ]
      });
    });

    it('should handle nested base64 data scrubbing', async () => {
      const jobData = createMockJobData({
        id: 'nested-base64-test'
      });

      const result = createMockResult({
        data: {
          results: [
            {
              type: 'image',
              content: {
                base64_data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB...',
                mime_type: 'image/png',
                metadata: {
                  width: 512,
                  height: 512,
                  another_base64: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEA...'
                }
              }
            }
          ]
        }
      });

      await client.completeJob('nested-base64-test', result, jobData);

      const attestationCall = mockRedis.setex.mock.calls.find(call =>
        call[0] === 'worker:completion:nested-base64-test'
      );

      const attestationData = JSON.parse(attestationCall[2]);
      const rawOutput = JSON.parse(attestationData.raw_service_output);

      // Both base64 fields should be scrubbed
      expect(rawOutput.data.results[0].content).toEqual({
        base64_data: '[SCRUBBED_BASE64_DATA]',
        mime_type: 'image/png',
        metadata: {
          width: 512,
          height: 512,
          another_base64: '[SCRUBBED_BASE64_DATA]'
        }
      });
    });
  });

  describe('large payload handling', () => {
    it('should handle very large raw outputs without truncation', async () => {
      const jobData = createMockJobData({
        id: 'large-output-test'
      });

      // Create a large response object
      const largeResponse = {
        data: {
          results: Array.from({ length: 100 }, (_, i) => ({
            id: `result-${i}`,
            content: `Generated content ${i}`.repeat(100), // ~2KB per result
            metadata: {
              timestamp: Date.now(),
              index: i,
              tags: Array.from({ length: 10 }, (_, j) => `tag-${i}-${j}`)
            }
          }))
        }
      };

      const result = createMockResult(largeResponse);

      await client.completeJob('large-output-test', result, jobData);

      const attestationCall = mockRedis.setex.mock.calls.find(call =>
        call[0] === 'worker:completion:large-output-test'
      );

      const attestationData = JSON.parse(attestationCall[2]);
      const rawOutput = JSON.parse(attestationData.raw_service_output);

      // Should preserve the full large response
      expect(rawOutput.data.results).toHaveLength(100);
      expect(rawOutput.data.results[0]).toEqual(expect.objectContaining({
        id: 'result-0',
        content: expect.stringContaining('Generated content 0'),
        metadata: expect.objectContaining({
          index: 0,
          tags: expect.arrayContaining(['tag-0-0', 'tag-0-1'])
        })
      }));
    });
  });

  describe('error cases', () => {
    it('should handle malformed result object gracefully', async () => {
      const jobData = createMockJobData({
        id: 'malformed-result-test'
      });

      const malformedResult = {
        // Missing expected structure
        weird_property: 'unexpected',
        circular_ref: null
      };
      // Create circular reference
      malformedResult.circular_ref = malformedResult;

      // This should not crash the attestation process
      await expect(
        client.submitJobCompletion('malformed-result-test', malformedResult, jobData)
      ).resolves.not.toThrow();
    });

    it('should handle JSON serialization errors gracefully', async () => {
      const jobData = createMockJobData({
        id: 'json-error-test'
      });

      const result = createMockResult({
        raw_request_payload: {
          // This will cause JSON.stringify to fail
          undefinedValue: undefined,
          functionValue: () => 'test',
          symbolValue: Symbol('test')
        }
      });

      // Should handle serialization errors without crashing
      await expect(
        client.submitJobCompletion('json-error-test', result, jobData)
      ).resolves.not.toThrow();
    });
  });

  describe('attestation metadata', () => {
    it('should include attestation type and timestamps', async () => {
      const jobData = createMockJobData({
        id: 'metadata-test'
      });

      const result = createMockResult();

      await client.completeJob('metadata-test', result, jobData);

      const attestationCall = mockRedis.setex.mock.calls.find(call =>
        call[0] === 'worker:completion:metadata-test'
      );

      const attestationData = JSON.parse(attestationCall[2]);

      expect(attestationData).toEqual(expect.objectContaining({
        attestation_type: 'completion',
        job_id: 'metadata-test',
        worker_id: 'test-worker',
        machine_id: 'test-machine-456',
        worker_version: '1.0.0-test',
        attestation_created_at: expect.any(Number),
        completed_at: expect.any(String)
      }));

      // Timestamps should be recent
      expect(attestationData.attestation_created_at).toBeGreaterThan(Date.now() - 5000);
    });
  });
});