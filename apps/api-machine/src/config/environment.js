import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

/**
 * API Machine Environment Configuration
 * Lightweight configuration for Railway deployment
 */
const config = {
  // Service identification
  machine: {
    id: process.env.MACHINE_ID || `api-machine-${Math.random().toString(36).substr(2, 9)}`,
    type: 'api-machine',
    environment: process.env.NODE_ENV || 'development'
  },

  // Redis connection
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0')
  },

  // API server configuration
  server: {
    port: parseInt(process.env.PORT || '3000'),
    host: process.env.HOST || '0.0.0.0',
    healthPort: parseInt(process.env.HEALTH_PORT || '9090')
  },

  // Worker configuration
  workers: {
    count: parseInt(process.env.WORKER_COUNT || '2'),
    services: (process.env.WORKER_SERVICES || 'simulation,openai').split(',').map(s => s.trim()),
    pollInterval: parseInt(process.env.WORKER_POLL_INTERVAL || '1000')
  },

  // Service-specific configuration
  services: {
    simulation: {
      enabled: process.env.ENABLE_SIMULATION === 'true',
      port: parseInt(process.env.SIMULATION_PORT || '8000'),
      responseDelay: parseInt(process.env.SIMULATION_DELAY || '2000')
    },
    openai: {
      enabled: process.env.ENABLE_OPENAI === 'true',
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      timeout: parseInt(process.env.OPENAI_TIMEOUT || '60000'),
      retries: parseInt(process.env.OPENAI_RETRIES || '3')
    }
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json'
  },

  // Error handling
  errorHandling: {
    maxRetries: parseInt(process.env.MAX_JOB_RETRIES || '3'),
    retryDelay: parseInt(process.env.RETRY_DELAY || '5000'),
    timeoutMinutes: parseInt(process.env.JOB_TIMEOUT_MINUTES || '30')
  }
};

export default config;