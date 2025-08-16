/**
 * Error Formatter Utility
 * 
 * Ensures error messages are always strings for safe logging with Winston
 * Prevents character-indexed object conversion issues
 */

/**
 * Convert any error type to a safe string for logging
 * @param {*} error - Error object, string, or undefined
 * @returns {string} - Always returns a string
 */
export function formatErrorMessage(error) {
  if (error === undefined || error === null) {
    return 'Unknown error';
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  // Check if it has a message property
  if (error.message !== undefined && error.message !== null) {
    // If message is already a string, use it
    if (typeof error.message === 'string') {
      return error.message;
    }
    // Otherwise stringify the message
    return String(error.message);
  }
  
  // No message property, stringify the whole error
  return String(error);
}

/**
 * Format error for detailed logging (includes stack trace if available)
 * @param {*} error - Error object, string, or undefined
 * @returns {object} - Object with message and optional stack
 */
export function formatErrorDetails(error) {
  const message = formatErrorMessage(error);
  
  const details = { message };
  
  // Add stack trace if available
  if (error && typeof error === 'object' && error.stack) {
    details.stack = error.stack;
  }
  
  // Add error code if available
  if (error && typeof error === 'object' && error.code) {
    details.code = error.code;
  }
  
  return details;
}

export default formatErrorMessage;