import winston from 'winston';
import config from '../config/environment.js';

/**
 * Create a logger instance for the API machine
 * @param {string} service - Service name for the logger
 * @param {object} options - Additional logger options
 * @returns {winston.Logger} Configured logger instance
 */
export function createLogger(service, options = {}) {
  const logFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
      let logMessage = `${timestamp} [${service}] ${level.toUpperCase()}: ${message}`;
      
      // Add metadata if present
      if (Object.keys(meta).length > 0) {
        logMessage += ` ${JSON.stringify(meta)}`;
      }
      
      // Add stack trace for errors
      if (stack) {
        logMessage += `\n${stack}`;
      }
      
      return logMessage;
    })
  );

  const logger = winston.createLogger({
    level: config.logging.level,
    format: logFormat,
    transports: [
      new winston.transports.Console({
        handleExceptions: true,
        handleRejections: true
      })
    ],
    exitOnError: false
  });

  return logger;
}

export default createLogger;