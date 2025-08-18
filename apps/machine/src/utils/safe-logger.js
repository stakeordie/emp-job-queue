/**
 * Safe Logger Wrapper
 * 
 * Prevents Winston from doing insane character-by-character logging of objects.
 * All objects are properly stringified before logging.
 */

import { createLogger as winstonCreateLogger, format, transports } from 'winston';

class SafeLogger {
  constructor(label) {
    this.label = label;
    this.winston = winstonCreateLogger({
      level: process.env.MACHINE_LOG_LEVEL || 'info',
      format: format.combine(
        format.timestamp(),
        format.label({ label }),
        format.printf(({ timestamp, level, label, message }) => {
          return `${timestamp} [${level}] [${label}] ${message}`;
        })
      ),
      transports: [
        new transports.Console()
      ]
    });
  }

  /**
   * Safely format any arguments to prevent character array logging
   * Mimics error-formatter.js approach for consistent handling
   */
  _safeFormat(...args) {
    return args.map(arg => {
      // Handle null/undefined
      if (arg === null) return 'null';
      if (arg === undefined) return 'undefined';
      
      // Handle primitives
      if (typeof arg === 'string') return arg;
      if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
      
      // Handle errors specifically (like error-formatter.js)
      if (arg instanceof Error) {
        return arg.message || String(arg);
      }
      
      // Handle objects - ensure we never pass raw objects to Winston
      if (typeof arg === 'object') {
        try {
          // Always stringify objects to prevent Winston character array conversion
          return JSON.stringify(arg);
        } catch (e) {
          // Circular reference fallback
          return '[Circular Object]';
        }
      }
      
      // Fallback - always return string
      return String(arg);
    }).join(' ');
  }

  info(message, meta) {
    if (meta !== undefined) {
      // Two-parameter format: message + metadata object
      const safeMessage = this._safeFormat(message);
      const safeMeta = this._safeFormat(meta);
      this.winston.info(`${safeMessage} ${safeMeta}`);
    } else {
      // Single parameter or multiple parameters
      const safeMessage = this._safeFormat(message);
      this.winston.info(safeMessage);
    }
  }

  error(message, meta) {
    if (meta !== undefined) {
      const safeMessage = this._safeFormat(message);
      const safeMeta = this._safeFormat(meta);
      this.winston.error(`${safeMessage} ${safeMeta}`);
    } else {
      const safeMessage = this._safeFormat(message);
      this.winston.error(safeMessage);
    }
  }

  warn(message, meta) {
    if (meta !== undefined) {
      const safeMessage = this._safeFormat(message);
      const safeMeta = this._safeFormat(meta);
      this.winston.warn(`${safeMessage} ${safeMeta}`);
    } else {
      const safeMessage = this._safeFormat(message);
      this.winston.warn(safeMessage);
    }
  }

  debug(message, meta) {
    if (meta !== undefined) {
      const safeMessage = this._safeFormat(message);
      const safeMeta = this._safeFormat(meta);
      this.winston.debug(`${safeMessage} ${safeMeta}`);
    } else {
      const safeMessage = this._safeFormat(message);
      this.winston.debug(safeMessage);
    }
  }
}

export function createSafeLogger(label) {
  return new SafeLogger(label);
}

export default SafeLogger;