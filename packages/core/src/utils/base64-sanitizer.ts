/**
 * Utility for removing base64 data from objects to prevent Redis storage bloat
 */

/**
 * Sanitize an object by removing base64 data from specific fields
 * - Replaces image_base64 fields with [BASE64_IMAGE_REMOVED]
 * - Finds and replaces base64 patterns in raw_output fields with [BASE64_DATA_REMOVED]
 */
export function sanitizeBase64Data(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  // Deep clone to avoid mutating original
  const sanitized = JSON.parse(JSON.stringify(obj));

  // Recursively remove base64 data
  removeBase64Fields(sanitized);

  return sanitized;
}

/**
 * Recursively remove base64 data from image_base64 fields and raw_output fields
 */
function removeBase64Fields(obj: any): void {
  if (!obj || typeof obj !== 'object') {
    return;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    obj.forEach(item => removeBase64Fields(item));
    return;
  }

  // Handle objects
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];

      if (key === 'image_base64' && typeof value === 'string') {
        // Replace the entire image_base64 field with placeholder text
        obj[key] = '[BASE64_IMAGE_REMOVED]';
      } else if (key === 'raw_output' && typeof value === 'string') {
        // Find and replace base64 data within raw_output field
        obj[key] = replaceBase64InString(value);
      } else if (typeof value === 'string' && isJsonString(value)) {
        // If the value is a JSON string, parse it, sanitize it, and stringify it back
        try {
          const parsedValue = JSON.parse(value);
          removeBase64Fields(parsedValue);
          obj[key] = JSON.stringify(parsedValue);
        } catch (e) {
          // If parsing fails, treat as regular string and check for base64 patterns
          obj[key] = replaceBase64InString(value);
        }
      } else if (typeof value === 'object') {
        // Recursively process nested objects
        removeBase64Fields(value);
      } else if (typeof value === 'string') {
        // Check if the string contains base64 patterns
        obj[key] = replaceBase64InString(value);
      }
    }
  }
}

/**
 * Replace base64 data patterns within a string with placeholder text
 */
function replaceBase64InString(str: string): string {
  // Pattern to match base64 data (sequences of base64 characters that are typically long)
  // Base64 uses A-Z, a-z, 0-9, +, / and = for padding
  // Look for sequences of 100+ base64 characters to avoid false positives
  const base64Pattern = /[A-Za-z0-9+/]{100,}={0,2}/g;

  return str.replace(base64Pattern, '[BASE64_DATA_REMOVED]');
}

/**
 * Check if a string appears to be JSON
 */
function isJsonString(str: string): boolean {
  if (typeof str !== 'string') return false;

  const trimmed = str.trim();
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
         (trimmed.startsWith('[') && trimmed.endsWith(']'));
}