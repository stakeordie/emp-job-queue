/**
 * Smart payload truncation utilities for telemetry and logging
 * Preserves JSON structure while truncating large values (base64, etc.)
 */

export interface TruncationOptions {
  maxTotalSize: number;
  maxValueSize: number;
  preserveStructure: boolean;
  truncateMarker: string;
}

const DEFAULT_OPTIONS: TruncationOptions = {
  maxTotalSize: 8000,
  maxValueSize: 100,
  preserveStructure: true,
  truncateMarker: '...[TRUNCATED]'
};

/**
 * Detects if a string is likely base64 data
 */
function isBase64Like(value: string): boolean {
  if (value.length < 20) return false;
  
  // Check for base64 patterns
  const base64Pattern = /^[A-Za-z0-9+/=]+$/;
  const dataUrlPattern = /^data:[^;]+;base64,/;
  
  return base64Pattern.test(value) || dataUrlPattern.test(value);
}

/**
 * Detects if a string is likely binary/encoded data
 */
function isBinaryLike(value: string): boolean {
  if (value.length < 50) return false;
  
  // Check for long strings with repetitive patterns
  const hasRepeatingChars = /(.)\1{10,}/.test(value);
  const hasHexPattern = /^[0-9a-fA-F]{50,}$/.test(value);
  const hasUrlSafeBase64 = /^[A-Za-z0-9_-]{50,}$/.test(value);
  
  return hasRepeatingChars || hasHexPattern || hasUrlSafeBase64 || isBase64Like(value);
}

/**
 * Detects if a string is human-readable text (for preserving in logs)
 */
function isReadableText(value: string): boolean {
  // If it's very short, consider it readable
  if (value.length < 50) return true;
  
  // Check for common readable text patterns
  const hasLetters = /[a-zA-Z]/.test(value);
  const hasSpaces = /\s/.test(value);
  const hasPunctuation = /[.,!?;:]/.test(value);
  
  // If it has letters and spaces/punctuation, likely readable
  if (hasLetters && (hasSpaces || hasPunctuation)) return true;
  
  // Check for common English words
  const commonWords = ['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'man', 'she', 'use', 'your'];
  const lowerValue = value.toLowerCase();
  const hasCommonWords = commonWords.some(word => lowerValue.includes(word));
  
  return hasCommonWords;
}

/**
 * Smart truncation of a single value
 */
function truncateValue(value: any, options: TruncationOptions): any {
  if (typeof value === 'string') {
    // CRITICAL FIX: Detect and aggressively truncate base64 images
    if (isBase64Like(value) && value.length > 1000) {
      const start = value.substring(0, 50);
      const end = value.substring(value.length - 20);
      return `${start}${options.truncateMarker}BASE64_IMAGE(${value.length} chars)...${end}`;
    }

    // Detect other binary-like data and truncate aggressively
    if (isBinaryLike(value) && value.length > 1000) {
      const start = value.substring(0, 50);
      const end = value.substring(value.length - 20);
      return `${start}${options.truncateMarker}BINARY_DATA(${value.length} chars)...${end}`;
    }

    // Check if string contains any "word" (continuous chars without spaces or backslashes) > 25 chars
    // Split on whitespace AND backslashes since backslashes should be treated as word separators
    const words = value.split(/[\s\\]+/);
    let hasLongWord = false;

    for (const word of words) {
      if (word.length > 25) {
        hasLongWord = true;
        break;
      }
    }

    // If it has long words, truncate those words
    if (hasLongWord) {
      const processedWords = words.map(word => {
        if (word.length > 25) {
          const start = word.substring(0, 12);
          const end = word.substring(word.length - 8);
          return `${start}${options.truncateMarker}(${word.length} chars)...${end}`;
        }
        return word;
      });
      return processedWords.join(' ');
    }

    // All other strings (normal readable text) - preserve completely
    return value;
  }

  return value;
}

/**
 * Recursively truncate an object while preserving structure
 */
function truncateObject(obj: any, options: TruncationOptions, currentSize: { value: number }, visited?: WeakSet<any>): any {
  // Initialize visited set to prevent circular references
  if (!visited) {
    visited = new WeakSet();
  }
  
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    const truncated = truncateValue(obj, options);
    currentSize.value += JSON.stringify(truncated).length;
    return truncated;
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    currentSize.value += JSON.stringify(obj).length;
    return obj;
  }

  // Handle circular references for objects and arrays
  if (typeof obj === 'object' && obj !== null) {
    if (visited.has(obj)) {
      return '[Circular]';
    }
    visited.add(obj);
  }

  if (Array.isArray(obj)) {
    const result = [];
    for (let i = 0; i < obj.length; i++) {
      result.push(truncateObject(obj[i], options, currentSize, visited));
    }
    return result;
  }

  if (typeof obj === 'object') {
    const result: any = {};
    
    // Use try-catch to handle objects that can't be enumerated
    try {
      const entries = Object.entries(obj);
      
      for (let i = 0; i < entries.length; i++) {
        const [key, value] = entries[i];
        try {
          // CRITICAL FIX: Aggressively truncate known base64 image fields
          const isImageField = /^(image_base64|base64_image|img_data|image_data|photo_base64)$/i.test(key);
          const isResultField = key === 'result' && typeof value === 'string' && value.length > 10000;

          if ((isImageField || isResultField) && typeof value === 'string' && value.length > 1000) {
            const start = value.substring(0, 50);
            const end = value.substring(value.length - 20);
            result[key] = `${start}${options.truncateMarker}${isImageField ? 'BASE64_IMAGE' : 'LARGE_RESULT'}(${value.length} chars)...${end}`;
          } else {
            result[key] = truncateObject(value, options, currentSize, visited);
          }
        } catch (error) {
          // If we can't process a property, just mark it as non-serializable
          result[key] = '[Non-serializable]';
        }
      }
    } catch (error) {
      // If we can't enumerate the object at all, return a safe representation
      return '[Non-enumerable object]';
    }
    
    return result;
  }

  return obj;
}

/**
 * Smart truncate a payload string - tries to parse as JSON first
 */
export function smartTruncatePayload(
  payload: string, 
  maxSize: number = DEFAULT_OPTIONS.maxTotalSize,
  options: Partial<TruncationOptions> = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, maxTotalSize: maxSize, ...options };
  
  if (payload.length <= maxSize && !options.preserveStructure) {
    return payload;
  }

  try {
    // Try to parse as JSON for smart truncation
    const parsed = JSON.parse(payload);
    const currentSize = { value: 0 };
    const truncated = truncateObject(parsed, opts, currentSize);
    const result = JSON.stringify(truncated, null, 0);
    
    // If smart truncation didn't help much, fall back to simple truncation
    if (result.length > maxSize * 1.2) {
      return payload.substring(0, maxSize) + opts.truncateMarker;
    }
    
    return result;
  } catch {
    // Not JSON, apply simple truncation with binary detection
    if (isBinaryLike(payload)) {
      const start = payload.substring(0, 100);
      const end = payload.substring(payload.length - 100);
      return `${start}${opts.truncateMarker}(${payload.length} chars)...${end}`;
    }
    
    if (payload.length > maxSize) {
      return payload.substring(0, maxSize) + opts.truncateMarker;
    }
    
    return payload;
  }
}

/**
 * Smart truncate an object directly
 */
export function smartTruncateObject(
  obj: any,
  maxSize: number = DEFAULT_OPTIONS.maxTotalSize,
  options: Partial<TruncationOptions> = {}
): any {
  const opts = { ...DEFAULT_OPTIONS, maxTotalSize: maxSize, ...options };
  const currentSize = { value: 0 };
  return truncateObject(obj, opts, currentSize);
}