/**
 * Image URL to Base64 Converter Utility
 * Simple, efficient utility for connectors to convert image URLs to base64
 */

import axios from 'axios';
import { createHash } from 'crypto';

export type ImageOutputFormat = 
  | 'base64'          // Raw base64 string
  | 'data_url'        // data:image/jpeg;base64,xxx format
  | 'url'             // Keep original URL (no conversion)
  | 'buffer'          // Binary buffer
  | 'file_path';      // Download and return local file path

export interface ImageConversionOptions {
  maxSizeBytes?: number;        // Default: 20MB
  timeout?: number;            // Default: 30 seconds  
  outputFormat?: ImageOutputFormat; // Default: 'data_url'
  allowedTypes?: string[];     // Allowed MIME types
  userAgent?: string;          // Custom user agent
  downloadPath?: string;       // For 'file_path' format - where to save
}

export interface ImageConversionResult {
  data: string | Buffer;       // Converted data (format depends on outputFormat)
  originalUrl: string;         // Original URL
  mimeType: string;           // Original MIME type (e.g., 'image/jpeg')
  sizeBytes: number;          // File size in bytes
  format: string;             // Image format (e.g., 'jpeg', 'png')
  hash: string;               // SHA-256 hash for caching/deduplication
  outputFormat: ImageOutputFormat; // What format was returned
}

export class ImageUrlConverter {
  private static readonly DEFAULT_OPTIONS: Required<Omit<ImageConversionOptions, 'downloadPath'>> & { downloadPath?: string } = {
    maxSizeBytes: 20 * 1024 * 1024, // 20MB - generous for AI image inputs
    timeout: 30000,                  // 30 seconds
    outputFormat: 'data_url',       // Most APIs expect data URL format
    allowedTypes: [
      'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 
      'image/gif', 'image/bmp', 'image/tiff'
    ],
    userAgent: 'EMP-Job-Queue/1.0 (Image Converter)',
    downloadPath: undefined,
  };

  /**
   * Convert image URL to base64 string
   * 
   * @param imageUrl - The URL of the image to convert
   * @param options - Conversion options
   * @returns Promise<ImageConversionResult>
   */
  static async convert(
    imageUrl: string, 
    options: ImageConversionOptions = {}
  ): Promise<ImageConversionResult> {
    const config = { ...this.DEFAULT_OPTIONS, ...options };
    
    // If output format is 'url', just return the URL as-is (no conversion)
    if (config.outputFormat === 'url') {
      return {
        data: imageUrl,
        originalUrl: imageUrl,
        mimeType: 'unknown',
        sizeBytes: 0,
        format: 'url',
        hash: createHash('sha256').update(imageUrl).digest('hex'),
        outputFormat: 'url',
      };
    }
    
    // Validate URL
    this.validateUrl(imageUrl);
    
    try {
      // Download image
      const response = await axios({
        method: 'GET',
        url: imageUrl,
        responseType: 'arraybuffer',
        timeout: config.timeout,
        maxContentLength: config.maxSizeBytes,
        maxBodyLength: config.maxSizeBytes,
        headers: {
          'User-Agent': config.userAgent,
          'Accept': config.allowedTypes.join(', '),
        },
        validateStatus: (status) => status >= 200 && status < 300,
      });

      // Validate content type
      const contentType = response.headers['content-type'] || '';
      if (!config.allowedTypes.includes(contentType)) {
        throw new Error(
          `Unsupported image type: ${contentType}. Supported: ${config.allowedTypes.join(', ')}`
        );
      }

      // Convert to buffer
      const imageBuffer = Buffer.from(response.data);
      
      // Generate hash for caching
      const hash = createHash('sha256').update(imageBuffer).digest('hex');
      
      // Extract format from content type
      const format = contentType.split('/')[1]?.replace('jpeg', 'jpg') || 'unknown';

      // Convert to requested output format
      let data: string | Buffer;
      switch (config.outputFormat) {
        case 'base64':
          data = imageBuffer.toString('base64');
          break;
        case 'data_url':
          data = `data:${contentType};base64,${imageBuffer.toString('base64')}`;
          break;
        case 'buffer':
          data = imageBuffer;
          break;
        case 'file_path':
          throw new Error('file_path output format not yet implemented');
        default:
          data = `data:${contentType};base64,${imageBuffer.toString('base64')}`;
      }

      return {
        data,
        originalUrl: imageUrl,
        mimeType: contentType,
        sizeBytes: imageBuffer.length,
        format,
        hash,
        outputFormat: config.outputFormat,
      };

    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          throw new Error(`Image download timeout after ${config.timeout}ms: ${imageUrl}`);
        }
        if (error.response?.status === 404) {
          throw new Error(`Image not found (404): ${imageUrl}`);
        }
        if (error.response?.status === 403) {
          throw new Error(`Image access forbidden (403): ${imageUrl}`);
        }
        throw new Error(`Failed to download image: ${error.message}`);
      }
      
      throw new Error(`Image conversion failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Convert multiple image URLs concurrently (with rate limiting)
   * 
   * @param imageUrls - Array of image URLs to convert
   * @param options - Conversion options
   * @param concurrency - Max concurrent downloads (default: 3)
   * @returns Array of results or errors
   */
  static async convertBatch(
    imageUrls: string[],
    options: ImageConversionOptions = {},
    concurrency: number = 3
  ): Promise<(ImageConversionResult | Error)[]> {
    const results: (ImageConversionResult | Error)[] = [];
    
    // Process in batches to avoid overwhelming servers
    for (let i = 0; i < imageUrls.length; i += concurrency) {
      const batch = imageUrls.slice(i, i + concurrency);
      
      const batchResults = await Promise.allSettled(
        batch.map(url => this.convert(url, options))
      );
      
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push(new Error(result.reason?.message || 'Unknown conversion error'));
        }
      }
      
      // Small delay between batches to be respectful
      if (i + concurrency < imageUrls.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return results;
  }

  /**
   * Check if a string is a valid image URL (basic validation)
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
   * Get estimated base64 size from image URL headers (without downloading)
   */
  static async getEstimatedSize(imageUrl: string): Promise<number | null> {
    try {
      const response = await axios.head(imageUrl, { timeout: 5000 });
      const contentLength = response.headers['content-length'];
      
      if (contentLength) {
        // Base64 is ~33% larger than binary
        return Math.ceil(parseInt(contentLength) * 1.33);
      }
      
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Extract image format from data URL
   */
  static extractFormatFromDataUrl(dataUrl: string): string | null {
    const match = dataUrl.match(/^data:image\/([^;]+);base64,/);
    return match ? match[1] : null;
  }

  /**
   * Validate URL format
   */
  private static validateUrl(url: string): void {
    try {
      const parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error(`Unsupported protocol: ${parsedUrl.protocol}. Only HTTP/HTTPS supported.`);
      }
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(`Invalid URL format: ${url}`);
      }
      throw error;
    }
  }
}

/**
 * Simple helper function for basic usage - returns base64 string
 */
export async function imageUrlToBase64(
  imageUrl: string,
  includeDataUrl: boolean = true
): Promise<string> {
  const result = await ImageUrlConverter.convert(imageUrl, { 
    outputFormat: includeDataUrl ? 'data_url' : 'base64' 
  });
  return result.data as string;
}

/**
 * Generic helper function to convert image URL to mime_type + base64 data object
 * Can be used by any connector that needs this format
 */
export async function imageUrlToMimeAndData(
  imageUrl: string,
  options: ImageConversionOptions = {}
): Promise<{ mime_type: string; data: string }> {
  const result = await ImageUrlConverter.convert(imageUrl, {
    ...options,
    outputFormat: 'base64', // Always base64 for this format
  });

  return {
    mime_type: result.mimeType, // e.g., "image/jpeg", "image/png"
    data: result.data as string // base64 string
  };
}