// Asset Saving Utility
// Utility class for saving generated assets to cloud storage

import * as crypto from 'crypto';
import { logger } from '@emp/core';

/**
 * Utility class for saving assets to cloud storage
 * Can be used by any connector that needs to save generated content
 */
export class AssetSaver {
  /**
   * Save base64 asset to cloud storage
   * @param mimeType - MIME type from client (e.g., 'image/png', 'video/mp4')
   */
  static async saveAssetToCloud(
    base64Data: string,
    jobId: string,
    jobData: Record<string, any>,
    mimeType: string = 'image/png',
    format?: string
  ): Promise<{ filePath: string; fileName: string; fileUrl: string; cdnUrl?: string }> {
    try {
      // Validate and normalize MIME type first
      const { contentType, fileExtension, assetCategory } = AssetSaver.validateMimeType(mimeType);

      // Use provided format or derive from MIME type
      const actualFormat = format || fileExtension;

      // Get cloud storage configuration from environment and job data
      const provider = process.env.CLOUD_STORAGE_PROVIDER?.toLowerCase();
      // Use bucket from payload if provided, otherwise fall back to environment variable
      const bucket = jobData.payload?.bucket || process.env.CLOUD_STORAGE_CONTAINER;
      const prefix = jobData.payload?.ctx?.prefix;

      if (!provider) {
        throw new Error('CLOUD_STORAGE_PROVIDER environment variable is required');
      }

      if (!bucket) {
        throw new Error(
          'Bucket is required. Please provide "bucket" in job payload or set CLOUD_STORAGE_CONTAINER environment variable.'
        );
      }

      if (!prefix) {
        throw new Error(
          'Cloud storage prefix is required. Job should include "ctx.prefix" in payload.'
        );
      }

      // Use provided filename or generate unique filename with timestamp and hash
      let fileName: string;
      if (jobData.payload?.ctx?.filename) {
        // Use provided filename, but ensure extension matches actual format
        const providedName = jobData.payload.ctx.filename;
        const hasExtension = providedName.includes('.');

        if (hasExtension) {
          // Replace extension with actual format
          const nameWithoutExt = providedName.substring(0, providedName.lastIndexOf('.'));
          fileName = `${nameWithoutExt}.${actualFormat}`;
        } else {
          // Add actual format extension
          fileName = `${providedName}.${actualFormat}`;
        }
      } else {
        // Generate unique filename with timestamp and hash
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const hash = crypto
          .createHash('md5')
          .update(base64Data.slice(0, 100))
          .digest('hex')
          .slice(0, 8);
        fileName = `${jobId}_${timestamp}_${hash}.${actualFormat}`;
      }

      // Ensure prefix ends with '/'
      const normalizedPrefix = prefix.endsWith('/') ? prefix : prefix + '/';
      const storageKey = normalizedPrefix + fileName;

      // Convert base64 to buffer
      const buffer = Buffer.from(base64Data, 'base64');

      // Upload to cloud storage
      const uploadSuccess = await AssetSaver.uploadToCloudStorage(
        buffer,
        bucket,
        storageKey,
        contentType,
        provider
      );

      // Verify upload success
      if (uploadSuccess && provider === 'azure') {
        const verified = await AssetSaver.verifyAzureUpload(bucket, storageKey);
        if (!verified) {
          throw new Error('Azure upload verification failed');
        }
      }

      if (!uploadSuccess) {
        throw new Error(`Failed to upload ${assetCategory} to ${provider} cloud storage`);
      }

      // For Azure, wait for CDN to be available before returning
      let fileUrl: string;
      if (provider === 'azure' && process.env.CLOUD_CDN_URL) {
        const cdnUrl = `https://${process.env.CLOUD_CDN_URL}/${storageKey}`;
        logger.info(`🌐 Waiting for CDN availability: ${cdnUrl}`);

        // Poll CDN until it's available (required before job completion)
        const cdnAvailable = await AssetSaver.waitForCDNAvailability(cdnUrl);
        if (!cdnAvailable) {
          throw new Error(`CDN failed to propagate after maximum attempts`);
        }

        fileUrl = cdnUrl;
        logger.info(`✅ CDN URL confirmed available: ${cdnUrl}`);
      } else {
        fileUrl = `https://${bucket}.blob.core.windows.net/${storageKey}`;
      }

      logger.info(`Saved ${assetCategory} asset (${contentType}): ${fileName} | URL: ${fileUrl}`);

      return {
        filePath: storageKey,
        fileName,
        fileUrl,
        cdnUrl: fileUrl, // CDN URL is now the primary fileUrl
      };
    } catch (error) {
      const assetCategory = AssetSaver.getMimeTypeCategory(mimeType);
      logger.error(`Failed to save ${assetCategory} asset for job ${jobId}: ${error.message}`);
      throw new Error(`Asset saving failed: ${error.message}`);
    }
  }

  /**
   * Validate MIME type and extract information
   */
  private static validateMimeType(mimeType: string): {
    contentType: string;
    fileExtension: string;
    assetCategory: string;
  } {
    // Normalize MIME type
    const normalizedMimeType = mimeType.toLowerCase().trim();

    // Valid MIME type patterns
    const validMimeTypes: Record<string, { extension: string; category: string }> = {
      'image/png': { extension: 'png', category: 'image' },
      'image/jpeg': { extension: 'jpg', category: 'image' },
      'image/jpg': { extension: 'jpg', category: 'image' },
      'image/webp': { extension: 'webp', category: 'image' },
      'image/gif': { extension: 'gif', category: 'image' },
      'video/mp4': { extension: 'mp4', category: 'video' },
      'video/webm': { extension: 'webm', category: 'video' },
      'audio/wav': { extension: 'wav', category: 'audio' },
      'audio/wave': { extension: 'wav', category: 'audio' },
      'audio/mpeg': { extension: 'mp3', category: 'audio' },
      'audio/mp3': { extension: 'mp3', category: 'audio' },
      'text/plain': { extension: 'txt', category: 'text' },
      'application/json': { extension: 'json', category: 'text' },
    };

    const mimeInfo = validMimeTypes[normalizedMimeType];
    if (!mimeInfo) {
      logger.warn(`Unknown MIME type: ${mimeType}, defaulting to application/octet-stream`);
      return {
        contentType: 'application/octet-stream',
        fileExtension: 'bin',
        assetCategory: 'file',
      };
    }

    return {
      contentType: normalizedMimeType,
      fileExtension: mimeInfo.extension,
      assetCategory: mimeInfo.category,
    };
  }

  /**
   * Get asset category from MIME type for error reporting
   */
  private static getMimeTypeCategory(mimeType: string): string {
    const normalizedMimeType = mimeType.toLowerCase().trim();

    if (normalizedMimeType.startsWith('image/')) return 'image';
    if (normalizedMimeType.startsWith('video/')) return 'video';
    if (normalizedMimeType.startsWith('audio/')) return 'audio';
    if (normalizedMimeType.startsWith('text/')) return 'text';

    return 'file';
  }

  /**
   * Upload to cloud storage using JavaScript SDKs
   */
  private static async uploadToCloudStorage(
    buffer: Buffer,
    bucket: string,
    storageKey: string,
    contentType: string,
    provider: string
  ): Promise<boolean> {
    try {
      if (provider === 'azure') {
        return await AssetSaver.uploadToAzure(buffer, bucket, storageKey, contentType);
      } else if (provider === 'aws') {
        throw new Error('AWS S3 upload not implemented yet - install @aws-sdk/client-s3');
      } else if (provider === 'google') {
        throw new Error(
          'Google Cloud Storage upload not implemented yet - install @google-cloud/storage'
        );
      } else {
        throw new Error(`Unsupported provider: ${provider}`);
      }
    } catch (error) {
      logger.error(`Cloud storage upload failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Upload to Azure Blob Storage using JavaScript SDK
   */
  private static async uploadToAzure(
    buffer: Buffer,
    containerName: string,
    blobName: string,
    contentType: string
  ): Promise<boolean> {
    try {
      const { BlobServiceClient, StorageSharedKeyCredential } = await import('@azure/storage-blob');

      const accountName = process.env.AZURE_STORAGE_ACCOUNT;
      const accountKey = process.env.AZURE_STORAGE_KEY;

      if (!accountName || !accountKey) {
        throw new Error(
          'AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_KEY environment variables are required'
        );
      }

      // Create credential and BlobServiceClient
      const credential = new StorageSharedKeyCredential(accountName, accountKey);
      const blobServiceClient = new BlobServiceClient(
        `https://${accountName}.blob.core.windows.net`,
        credential
      );

      // Get container client
      const containerClient = blobServiceClient.getContainerClient(containerName);

      // Get blob client
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      // Upload buffer
      await blockBlobClient.upload(buffer, buffer.length, {
        blobHTTPHeaders: {
          blobContentType: contentType,
        },
      });

      logger.info(`Successfully uploaded to Azure: ${blobName} (${buffer.length} bytes)`);
      return true;
    } catch (error) {
      logger.error(`Azure upload failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Verify Azure blob upload with retries
   */
  private static async verifyAzureUpload(
    containerName: string,
    blobName: string,
    maxAttempts: number = 5
  ): Promise<boolean> {
    try {
      const { BlobServiceClient, StorageSharedKeyCredential } = await import('@azure/storage-blob');

      const accountName = process.env.AZURE_STORAGE_ACCOUNT;
      const accountKey = process.env.AZURE_STORAGE_KEY;

      if (!accountName || !accountKey) {
        return false;
      }

      const credential = new StorageSharedKeyCredential(accountName, accountKey);
      const blobServiceClient = new BlobServiceClient(
        `https://${accountName}.blob.core.windows.net`,
        credential
      );

      const containerClient = blobServiceClient.getContainerClient(containerName);
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const exists = await blockBlobClient.exists();
          if (exists) {
            logger.info(`Azure upload verified: ${blobName}`);
            return true;
          }

          if (attempt < maxAttempts) {
            logger.warn(`Azure verification attempt ${attempt}/${maxAttempts} failed, retrying...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (error) {
          if (attempt < maxAttempts) {
            logger.warn(`Azure verification attempt ${attempt}/${maxAttempts} failed, retrying...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
          } else {
            logger.error(
              `Azure verification failed after ${maxAttempts} attempts: ${error.message}`
            );
            return false;
          }
        }
      }
      return false;
    } catch (error) {
      logger.error(`Azure verification error: ${error.message}`);
      return false;
    }
  }

  /**
   * Wait for CDN to be available by polling every 2 seconds
   */
  private static async waitForCDNAvailability(
    cdnUrl: string,
    maxAttempts: number = 30, // 30 attempts * 2 seconds = 1 minute max wait
    intervalMs: number = 2000
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout per request

        const response = await fetch(cdnUrl, {
          method: 'HEAD',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.status === 200) {
          logger.info(
            `✅ CDN available after ${attempt} attempts (${((attempt - 1) * intervalMs) / 1000}s)`
          );
          return true;
        }

        logger.info(
          `⏳ CDN attempt ${attempt}/${maxAttempts} - Status: ${response.status}, waiting ${intervalMs}ms...`
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.info(
          `⏳ CDN attempt ${attempt}/${maxAttempts} - Error: ${errorMsg}, waiting ${intervalMs}ms...`
        );
      }

      // Wait before next attempt (except on last attempt)
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
    }

    logger.error(
      `❌ CDN failed to become available after ${maxAttempts} attempts (${(maxAttempts * intervalMs) / 1000}s)`
    );
    return false;
  }

  /**
   * Get required environment variables for asset saving
   * Override in subclasses to add connector-specific env vars
   */
  static getBaseRequiredEnvVars(): Record<string, string> {
    return {
      // Cloud storage configuration
      CLOUD_STORAGE_PROVIDER: '${CLOUD_STORAGE_PROVIDER:-}',
      CLOUD_STORAGE_CONTAINER: '${CLOUD_STORAGE_CONTAINER:-}',
      CLOUD_CDN_URL: '${CLOUD_CDN_URL:-}',
      AZURE_STORAGE_ACCOUNT: '${AZURE_STORAGE_ACCOUNT:-}',
      AZURE_STORAGE_KEY: '${AZURE_STORAGE_KEY:-}',
    };
  }
}
