/**
 * Efficient Image URL to Base64 Conversion Utility
 * Handles various image formats, streaming, and memory optimization
 */

import axios, { AxiosResponse } from 'axios';
import { createHash } from 'crypto';

export interface ImageConversionOptions {
  maxSizeBytes?: number; // Default 10MB
  timeout?: number; // Default 30 seconds
  allowedFormats?: string[]; // Default ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  includeDataUrl?: boolean; // Include data:image/format;base64, prefix
}

export interface ImageConversionResult {
  base64: string;
  mimeType: string;
  sizeBytes: number;
  hash: string; // SHA-256 for caching/deduplication
  format: string; // 'jpeg', 'png', etc.
}

export class ImageConverter {
  private static readonly DEFAULT_OPTIONS: Required<ImageConversionOptions> = {
    maxSizeBytes: 10 * 1024 * 1024, // 10MB
    timeout: 30000, // 30 seconds
    allowedFormats: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'],
    includeDataUrl: false,
  };

  /**
   * Convert image URL to base64 with efficient streaming and validation
   */
  static async urlToBase64(
    imageUrl: string,
    options: ImageConversionOptions = {}
  ): Promise<ImageConversionResult> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };

    try {
      // Validate URL format
      const url = new URL(imageUrl);
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error(`Unsupported protocol: ${url.protocol}. Only HTTP/HTTPS supported.`);
      }

      // Download image with streaming and size limits
      const response = await this.downloadImage(imageUrl, opts);
      
      // Validate content type
      const contentType = response.headers['content-type'] || '';
      if (!opts.allowedFormats.includes(contentType)) {
        throw new Error(`Unsupported image format: ${contentType}. Allowed: ${opts.allowedFormats.join(', ')}`);
      }

      // Convert to base64
      const imageBuffer = Buffer.from(response.data);
      const base64String = imageBuffer.toString('base64');
      
      // Generate hash for caching/deduplication
      const hash = createHash('sha256').update(imageBuffer).digest('hex');
      
      // Extract format
      const format = contentType.split('/')[1] || 'unknown';
      
      return {
        base64: opts.includeDataUrl ? `data:${contentType};base64,${base64String}` : base64String,
        mimeType: contentType,
        sizeBytes: imageBuffer.length,
        hash,
        format,
      };

    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Image conversion failed: ${error.message}`);
      }
      throw new Error(`Image conversion failed: ${String(error)}`);
    }
  }

  /**
   * Download image with streaming and size validation
   */
  private static async downloadImage(
    imageUrl: string,
    options: Required<ImageConversionOptions>
  ): Promise<AxiosResponse<ArrayBuffer>> {
    const response = await axios({
      method: 'GET',
      url: imageUrl,
      responseType: 'arraybuffer',
      timeout: options.timeout,
      maxContentLength: options.maxSizeBytes,
      maxBodyLength: options.maxSizeBytes,
      validateStatus: (status) => status >= 200 && status < 300,
      headers: {
        'User-Agent': 'EMP-Job-Queue/1.0 (Image Converter)',
        'Accept': options.allowedFormats.join(', '),
      },
    });

    return response;
  }

  /**
   * Batch convert multiple image URLs with concurrent processing
   */
  static async batchUrlToBase64(
    imageUrls: string[],
    options: ImageConversionOptions = {},
    concurrency = 3
  ): Promise<(ImageConversionResult | Error)[]> {
    const results: (ImageConversionResult | Error)[] = [];
    
    // Process in batches to avoid overwhelming the system
    for (let i = 0; i < imageUrls.length; i += concurrency) {
      const batch = imageUrls.slice(i, i + concurrency);
      const batchPromises = batch.map(async (url) => {
        try {
          return await this.urlToBase64(url, options);
        } catch (error) {
          return error instanceof Error ? error : new Error(String(error));
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    return results;
  }

  /**
   * Validate if a string is a valid image URL
   */
  static isValidImageUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return ['http:', 'https:'].includes(parsedUrl.protocol);
    } catch {
      return false;
    }
  }

  /**
   * Get image format from base64 data URL
   */
  static getFormatFromDataUrl(dataUrl: string): string | null {
    const match = dataUrl.match(/^data:image\/([a-zA-Z]+);base64,/);
    return match ? match[1] : null;
  }
}