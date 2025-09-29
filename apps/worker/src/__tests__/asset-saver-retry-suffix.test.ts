/**
 * Tests for asset saver retry suffix handling
 *
 * Tests the retry suffix generation that creates filenames like:
 * - job123_timestamp_hash.png (retry 0)
 * - job123_timestamp_hash_r1.png (retry 1)
 * - job123_timestamp_hash_r2.png (retry 2)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AssetSaver } from '../connectors/asset-saver.js';

// Mock cloud storage providers
vi.mock('@azure/storage-blob', () => ({
  BlobServiceClient: {
    fromConnectionString: vi.fn().mockReturnValue({
      getContainerClient: vi.fn().mockReturnValue({
        getBlockBlobClient: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ requestId: 'test-request-id' }),
          url: 'https://test.blob.core.windows.net/container/test-file.png'
        })
      })
    })
  }
}));

describe('Asset Saver Retry Suffix Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup test environment
    process.env.CLOUD_STORAGE_PROVIDER = 'azure';
    process.env.CLOUD_STORAGE_CONTAINER = 'test-container';
    process.env.AZURE_STORAGE_CONNECTION_STRING = 'DefaultEndpointsProtocol=https;AccountName=test;AccountKey=testkey;EndpointSuffix=core.windows.net';
  });

  describe('retry suffix generation from workflow_context.retry_attempt', () => {
    it('should not add suffix for initial attempt (retry_attempt = 0)', async () => {
      const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      const jobId = 'test-job-123';
      const jobData = {
        ctx: {
          workflow_context: {
            retry_attempt: 0
          },
          storage: {
            provider: 'azure',
            container: 'test-container',
            bucket: 'test-bucket'
          }
        }
      };

      const result = await AssetSaver.saveAssetToCloud(base64Data, jobId, jobData, 'image/png');

      // Should not have retry suffix for initial attempt
      expect(result.fileName).toMatch(/^test-job-123_\d+_[a-f0-9]{8}\.png$/);
      expect(result.fileName).not.toContain('_r');
    });

    it('should add _r1 suffix for first retry (retry_attempt = 1)', async () => {
      const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      const jobId = 'retry-job-456';
      const jobData = {
        ctx: {
          workflow_context: {
            retry_attempt: 1
          },
          storage: {
            provider: 'azure',
            container: 'test-container',
            bucket: 'test-bucket'
          }
        }
      };

      const result = await AssetSaver.saveAssetToCloud(base64Data, jobId, jobData, 'image/png');

      expect(result.fileName).toMatch(/^retry-job-456_\d+_[a-f0-9]{8}_r1\.png$/);
    });

    it('should add _r2 suffix for second retry (retry_attempt = 2)', async () => {
      const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      const jobId = 'retry-job-789';
      const jobData = {
        ctx: {
          workflow_context: {
            retry_attempt: 2
          },
          storage: {
            provider: 'azure',
            container: 'test-container',
            bucket: 'test-bucket'
          }
        }
      };

      const result = await AssetSaver.saveAssetToCloud(base64Data, jobId, jobData, 'image/png');

      expect(result.fileName).toMatch(/^retry-job-789_\d+_[a-f0-9]{8}_r2\.png$/);
    });

    it('should handle high retry counts (retry_attempt = 10)', async () => {
      const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      const jobId = 'high-retry-job';
      const jobData = {
        ctx: {
          workflow_context: {
            retry_attempt: 10
          },
          storage: {
            provider: 'azure',
            container: 'test-container',
            bucket: 'test-bucket'
          }
        }
      };

      const result = await AssetSaver.saveAssetToCloud(base64Data, jobId, jobData, 'image/png');

      expect(result.fileName).toMatch(/^high-retry-job_\d+_[a-f0-9]{8}_r10\.png$/);
    });
  });

  describe('fallback retry count sources', () => {
    it('should fall back to ctx.retry_count when workflow_context unavailable', async () => {
      const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      const jobId = 'fallback-job-1';
      const jobData = {
        ctx: {
          retry_count: 3, // No workflow_context, should use this
          storage: {
            provider: 'azure',
            container: 'test-container',
            bucket: 'test-bucket'
          }
        }
      };

      const result = await AssetSaver.saveAssetToCloud(base64Data, jobId, jobData, 'image/png');

      expect(result.fileName).toMatch(/^fallback-job-1_\d+_[a-f0-9]{8}_r3\.png$/);
    });

    it('should fall back to ctx.retryCount when other sources unavailable', async () => {
      const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      const jobId = 'fallback-job-2';
      const jobData = {
        ctx: {
          retryCount: 4, // Different property name
          storage: {
            provider: 'azure',
            container: 'test-container',
            bucket: 'test-bucket'
          }
        }
      };

      const result = await AssetSaver.saveAssetToCloud(base64Data, jobId, jobData, 'image/png');

      expect(result.fileName).toMatch(/^fallback-job-2_\d+_[a-f0-9]{8}_r4\.png$/);
    });

    it('should default to no suffix when no retry count found', async () => {
      const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      const jobId = 'no-retry-job';
      const jobData = {
        ctx: {
          // No retry count information
          storage: {
            provider: 'azure',
            container: 'test-container',
            bucket: 'test-bucket'
          }
        }
      };

      const result = await AssetSaver.saveAssetToCloud(base64Data, jobId, jobData, 'image/png');

      expect(result.fileName).toMatch(/^no-retry-job_\d+_[a-f0-9]{8}\.png$/);
      expect(result.fileName).not.toContain('_r');
    });
  });

  describe('precedence order', () => {
    it('should prioritize workflow_context.retry_attempt over other sources', async () => {
      const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      const jobId = 'precedence-job';
      const jobData = {
        ctx: {
          workflow_context: {
            retry_attempt: 5 // Should be used (highest priority)
          },
          retry_count: 10,    // Should be ignored
          retryCount: 15,     // Should be ignored
          storage: {
            provider: 'azure',
            container: 'test-container',
            bucket: 'test-bucket'
          }
        }
      };

      const result = await AssetSaver.saveAssetToCloud(base64Data, jobId, jobData, 'image/png');

      expect(result.fileName).toMatch(/^precedence-job_\d+_[a-f0-9]{8}_r5\.png$/);
    });

    it('should use retry_count when workflow_context.retry_attempt is 0', async () => {
      const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      const jobId = 'zero-precedence-job';
      const jobData = {
        ctx: {
          workflow_context: {
            retry_attempt: 0 // Falsy value, should fall back
          },
          retry_count: 7,
          storage: {
            provider: 'azure',
            container: 'test-container',
            bucket: 'test-bucket'
          }
        }
      };

      const result = await AssetSaver.saveAssetToCloud(base64Data, jobId, jobData, 'image/png');

      // When retry_attempt is 0, it should use that (no suffix) rather than falling back
      expect(result.fileName).toMatch(/^zero-precedence-job_\d+_[a-f0-9]{8}\.png$/);
      expect(result.fileName).not.toContain('_r');
    });
  });

  describe('data type handling', () => {
    it('should handle string retry count values', async () => {
      const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      const jobId = 'string-retry-job';
      const jobData = {
        ctx: {
          workflow_context: {
            retry_attempt: '6' // String value
          },
          storage: {
            provider: 'azure',
            container: 'test-container',
            bucket: 'test-bucket'
          }
        }
      };

      const result = await AssetSaver.saveAssetToCloud(base64Data, jobId, jobData, 'image/png');

      expect(result.fileName).toMatch(/^string-retry-job_\d+_[a-f0-9]{8}_r6\.png$/);
    });

    it('should handle null retry count gracefully', async () => {
      const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      const jobId = 'null-retry-job';
      const jobData = {
        ctx: {
          workflow_context: {
            retry_attempt: null
          },
          retry_count: null,
          retryCount: null,
          storage: {
            provider: 'azure',
            container: 'test-container',
            bucket: 'test-bucket'
          }
        }
      };

      const result = await AssetSaver.saveAssetToCloud(base64Data, jobId, jobData, 'image/png');

      expect(result.fileName).toMatch(/^null-retry-job_\d+_[a-f0-9]{8}\.png$/);
      expect(result.fileName).not.toContain('_r');
    });

    it('should handle undefined retry count gracefully', async () => {
      const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      const jobId = 'undefined-retry-job';
      const jobData = {
        ctx: {
          workflow_context: {
            // retry_attempt undefined
          },
          storage: {
            provider: 'azure',
            container: 'test-container',
            bucket: 'test-bucket'
          }
        }
      };

      const result = await AssetSaver.saveAssetToCloud(base64Data, jobId, jobData, 'image/png');

      expect(result.fileName).toMatch(/^undefined-retry-job_\d+_[a-f0-9]{8}\.png$/);
      expect(result.fileName).not.toContain('_r');
    });
  });

  describe('different file formats', () => {
    it('should add retry suffix to different image formats', async () => {
      const formats = [
        { mimeType: 'image/jpeg', extension: 'jpg' },
        { mimeType: 'image/png', extension: 'png' },
        { mimeType: 'image/webp', extension: 'webp' },
        { mimeType: 'image/gif', extension: 'gif' }
      ];

      for (const { mimeType, extension } of formats) {
        const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
        const jobId = `format-test-${extension}`;
        const jobData = {
          ctx: {
            workflow_context: {
              retry_attempt: 2
            },
            storage: {
              provider: 'azure',
              container: 'test-container'
            }
          }
        };

        const result = await AssetSaver.saveAssetToCloud(base64Data, jobId, jobData, mimeType);

        expect(result.fileName).toMatch(new RegExp(`^format-test-${extension}_\\d+_[a-f0-9]{8}_r2\\.${extension}$`));
      }
    });

    it('should add retry suffix to video formats', async () => {
      const base64Data = 'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE='; // Mock video data
      const jobId = 'video-retry-test';
      const jobData = {
        ctx: {
          workflow_context: {
            retry_attempt: 3
          },
          storage: {
            provider: 'azure',
            container: 'test-container',
            bucket: 'test-bucket'
          }
        }
      };

      const result = await AssetSaver.saveAssetToCloud(base64Data, jobId, jobData, 'video/mp4');

      expect(result.fileName).toMatch(/^video-retry-test_\d+_[a-f0-9]{8}_r3\.mp4$/);
    });
  });
});