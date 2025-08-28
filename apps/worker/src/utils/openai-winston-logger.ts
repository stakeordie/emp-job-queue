// OpenAI Winston Logger - Dedicated Winston setup for OpenAI SDK integration
// Provides structured logging with file output for FluentBit ingestion

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { promises as fs } from 'fs';

// Define log levels specifically for OpenAI SDK
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

winston.addColors(colors);

// Structured format for OpenAI logs - optimized for telemetry extraction
const openaiLogFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, service = 'openai-sdk', ...meta }) => {
    // Structure log for easy FluentBit parsing and telemetry extraction
    const logEntry: any = {
      timestamp,
      level,
      service,
      message,
      ...meta
    };

    // For HTTP requests/responses, add telemetry markers
    if (meta.method || meta.url || meta.status) {
      logEntry.telemetry_type = 'http_request';
      logEntry.openai_api_call = true;
    }

    if (meta.usage || meta.model || meta.created) {
      logEntry.telemetry_type = 'openai_response';
      logEntry.has_usage_data = !!meta.usage;
    }

    return JSON.stringify(logEntry);
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
  winston.format.printf(({ timestamp, level, message, service, method, url, status, ...meta }) => {
    let msg = `${timestamp} [${level}] [${service || 'openai-sdk'}]`;
    
    // Add HTTP context if available
    if (method && url) {
      msg += ` ${method} ${url}`;
      if (status) msg += ` → ${status}`;
    }
    
    msg += ` ${message}`;
    
    // Add important metadata
    const filteredMeta = { ...meta };
    delete filteredMeta.headers; // Too verbose for console
    delete filteredMeta.body;    // Too verbose for console
    
    const metaStr = Object.keys(filteredMeta).length ? 
      ` ${JSON.stringify(filteredMeta)}` : '';
    
    return msg + metaStr;
  })
);

// Create Winston logger for OpenAI SDK
class OpenAIWinstonLogger {
  private logger: winston.Logger;
  private logDir: string;

  constructor() {
    // Determine log directory - support both development and production
    this.logDir = process.env.LOG_DIR || 
                 process.env.WORKSPACE_DIR ? path.join(process.env.WORKSPACE_DIR, 'logs') :
                 '/workspace/logs';

    this.setupLogger();
  }

  private async setupLogger() {
    // Ensure log directory exists
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      console.warn(`Failed to create log directory ${this.logDir}:`, error.message);
      // Fallback to current directory
      this.logDir = './logs';
      await fs.mkdir(this.logDir, { recursive: true });
    }

    const transports: winston.transport[] = [
      // Console transport for development
      new winston.transports.Console({
        format: consoleFormat,
        level: process.env.OPENAI_LOG_LEVEL || process.env.LOG_LEVEL || 'info'
      })
    ];

    // Always add file transports for FluentBit ingestion
    const logLevel = process.env.OPENAI_LOG_LEVEL || process.env.LOG_LEVEL || 'info';
    
    // Main OpenAI log file - structured JSON for FluentBit
    transports.push(
      new DailyRotateFile({
        filename: path.join(this.logDir, 'openai-sdk-%DATE%.log'),
        datePattern: 'YYYY-MM-DD-HH',
        zippedArchive: false, // Keep uncompressed for FluentBit real-time ingestion
        maxSize: '100m',
        maxFiles: '24h', // Keep 24 hours of hourly logs
        format: openaiLogFormat,
        level: logLevel
      })
    );

    // Separate telemetry file - high-value events for metrics
    // Note: We'll filter in application logic instead of transport level
    transports.push(
      new DailyRotateFile({
        filename: path.join(this.logDir, 'openai-telemetry-%DATE%.log'),
        datePattern: 'YYYY-MM-DD-HH',
        zippedArchive: false,
        maxSize: '50m',
        maxFiles: '24h',
        format: openaiLogFormat,
        level: 'http' // Capture HTTP and above for telemetry
      })
    );

    // Error-only file
    transports.push(
      new DailyRotateFile({
        filename: path.join(this.logDir, 'openai-errors-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        zippedArchive: false,
        maxSize: '20m',
        maxFiles: '7d',
        format: openaiLogFormat,
        level: 'error'
      })
    );

    this.logger = winston.createLogger({
      levels,
      format: openaiLogFormat,
      transports,
      exitOnError: false
    });

    // Log setup completion
    this.logger.info('OpenAI Winston logger initialized', {
      logDir: this.logDir,
      logLevel,
      transports: transports.length
    });
  }

  // Create OpenAI SDK compatible logger interface
  getOpenAILogger() {
    const self = this;
    
    return {
      error: (message: string, ...args: any[]) => {
        self.logger.error(message, { args });
      },
      
      warn: (message: string, ...args: any[]) => {
        self.logger.warn(message, { args });
      },
      
      info: (message: string, ...args: any[]) => {
        self.logger.info(message, { args });
      },
      
      debug: (message: string, ...args: any[]) => {
        self.logger.debug(message, { args });
      },

      // Custom method for HTTP request/response logging with telemetry
      logHTTP: (data: {
        method?: string;
        url?: string;
        status?: number;
        headers?: Record<string, any>;
        body?: any;
        response?: any;
        duration?: number;
        usage?: any;
        model?: string;
        created?: number;
      }) => {
        const level = data.status && data.status >= 400 ? 'error' : 
                     data.status && data.status >= 300 ? 'warn' : 'http';
        
        const message = data.method && data.url ? 
          `${data.method} ${data.url}` : 
          'OpenAI API call';

        self.logger.log(level, message, {
          ...data,
          telemetry_type: 'http_request',
          openai_api_call: true
        });
      },

      // Custom method for usage/billing telemetry
      logUsage: (data: {
        model?: string;
        usage?: any;
        cost_estimate?: number;
        job_id?: string;
        connector_id?: string;
      }) => {
        self.logger.info('OpenAI usage data', {
          ...data,
          telemetry_type: 'usage_metrics',
          has_usage_data: true
        });
      }
    };
  }

  // Get native Winston logger for advanced usage
  getWinstonLogger(): winston.Logger {
    return this.logger;
  }

  // Get log directory path for FluentBit configuration
  getLogDirectory(): string {
    return this.logDir;
  }
}

// Singleton instance
let openaiLogger: OpenAIWinstonLogger | null = null;

export function getOpenAILogger() {
  if (!openaiLogger) {
    openaiLogger = new OpenAIWinstonLogger();
  }
  return openaiLogger;
}

export default getOpenAILogger;