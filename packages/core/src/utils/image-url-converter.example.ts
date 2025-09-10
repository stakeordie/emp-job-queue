/**
 * Example usage of ImageUrlConverter utility for connectors
 */

import { ImageUrlConverter, imageUrlToBase64 } from './image-url-converter.js';

// Example 1: Simple usage for connectors
export async function exampleSimpleUsage() {
  try {
    // Quick conversion with defaults (perfect for most connectors)
    const base64 = await imageUrlToBase64('https://example.com/image.jpg');
    console.log('Base64 result:', base64.substring(0, 50) + '...');
    
    return base64; // Ready to send to API
  } catch (error) {
    console.error('Conversion failed:', error.message);
    throw error;
  }
}

// Example 2: Advanced usage with options
export async function exampleAdvancedUsage() {
  try {
    const result = await ImageUrlConverter.convert('https://example.com/image.jpg', {
      maxSizeBytes: 5 * 1024 * 1024,  // 5MB limit
      timeout: 15000,                  // 15 second timeout
      outputFormat: 'data_url',        // Include data:image/jpeg;base64, prefix
      allowedTypes: ['image/jpeg', 'image/png'], // Only allow JPEG/PNG
    });
    
    console.log('Conversion result:', {
      format: result.format,
      size: `${Math.round(result.sizeBytes / 1024)}KB`,
      mimeType: result.mimeType,
      hash: result.hash.substring(0, 8) + '...', // For caching
    });
    
    return result.data as string;
  } catch (error) {
    console.error('Advanced conversion failed:', error.message);
    throw error;
  }
}

// Example 3: Batch conversion for multiple images
export async function exampleBatchUsage() {
  const imageUrls = [
    'https://example.com/image1.jpg',
    'https://example.com/image2.png',
    'https://example.com/image3.webp',
  ];
  
  try {
    const results = await ImageUrlConverter.convertBatch(imageUrls, {
      maxSizeBytes: 10 * 1024 * 1024, // 10MB per image
      timeout: 30000,                  // 30s timeout
    }, 2); // Max 2 concurrent downloads
    
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      
      if (result instanceof Error) {
        console.error(`Image ${i + 1} failed:`, result.message);
      } else {
        console.log(`Image ${i + 1} converted:`, {
          format: result.format,
          size: `${Math.round(result.sizeBytes / 1024)}KB`,
        });
      }
    }
    
    return results;
  } catch (error) {
    console.error('Batch conversion failed:', error.message);
    throw error;
  }
}

// Example 4: Pre-flight size check (avoid downloading huge images)
export async function exampleSizeCheck() {
  const imageUrl = 'https://example.com/potentially-huge-image.jpg';
  
  try {
    // Check estimated size before downloading
    const estimatedSize = await ImageUrlConverter.getEstimatedSize(imageUrl);
    
    if (estimatedSize && estimatedSize > 20 * 1024 * 1024) {
      throw new Error(`Image too large: ${Math.round(estimatedSize / 1024 / 1024)}MB`);
    }
    
    console.log(`Safe to download: ~${Math.round((estimatedSize || 0) / 1024)}KB`);
    
    // Proceed with conversion
    return await imageUrlToBase64(imageUrl);
  } catch (error) {
    console.error('Size check or conversion failed:', error.message);
    throw error;
  }
}

// Example 5: Connector implementation pattern
export class ExampleGeminiConnector {
  async preprocessPayload(payload: any): Promise<any> {
    const processedPayload = { ...payload };
    
    // Define which fields need image URL to base64 conversion
    const imageFields = ['image', 'style_reference', 'mask_image'];
    
    for (const field of imageFields) {
      if (processedPayload[field] && typeof processedPayload[field] === 'string') {
        // Check if it's a URL that needs conversion
        if (ImageUrlConverter.isValidImageUrl(processedPayload[field])) {
          try {
            console.log(`Converting ${field} URL to base64...`);
            processedPayload[field] = await imageUrlToBase64(processedPayload[field]);
            console.log(`✅ Converted ${field} to base64`);
          } catch (error) {
            console.error(`❌ Failed to convert ${field}:`, error.message);
            throw new Error(`Image conversion failed for ${field}: ${error.message}`);
          }
        }
      }
    }
    
    return processedPayload;
  }
}