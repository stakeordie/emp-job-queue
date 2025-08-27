// Logger utility - matches Python core/utils/logger.py functionality
// Provides structured logging with configurable levels

import winston from 'winston';

const logLevel = process.env.LOG_LEVEL || 'info';
const logFormat = process.env.LOG_FORMAT || 'json';

// Create logger instance
export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    logFormat === 'json'
      ? winston.format.json()
      : winston.format.combine(winston.format.colorize(), winston.format.simple())
  ),
  defaultMeta: {
    service: 'emp-redis-js',
    version: process.env.npm_package_version || '1.0.0',
  },
  transports: [
    new winston.transports.Console({
      handleExceptions: true,
      handleRejections: true,
    }),
  ],
});

// Add file logging when LOG_TO_FILE is enabled
if (process.env.LOG_TO_FILE === 'true' && !process.env.DISABLE_FILE_LOGGING) {
  const logDir = process.env.LOG_DIR || '/tmp';

  logger.add(
    new winston.transports.File({
      filename: `${logDir}/error.log`,
      level: 'error',
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    })
  );

  logger.add(
    new winston.transports.File({
      filename: `${logDir}/combined.log`,
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    })
  );
}

// Export logger functions for compatibility with Python logger usage
export default logger;
