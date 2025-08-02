import Joi from 'joi';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('config');

// Load environment variables
// Note: .env.secret is loaded by Docker Compose via env_file and available in process.env
// Load .env from service-manager directory (baked into image)
dotenv.config({ path: '/service-manager/.env' }); // Load .env (public variables baked into image)

// Define configuration schema
const schema = Joi.object({
  // Machine configuration
  machine: Joi.object({
    id: Joi.string().default(`${process.env.CONTAINER_NAME || 'basic-machine'}`),
    testMode: Joi.boolean().default(false),
    gpu: Joi.object({
      count: Joi.number().integer().min(0).default(1),
      memoryGB: Joi.number().integer().min(0).default(16),
      model: Joi.string().default('Unknown')
    })
  }),
  
  // Redis configuration
  redis: Joi.object({
    url: Joi.string().uri({ scheme: ['redis', 'rediss'] }).required(),
    authToken: Joi.string().allow('').default('')
  }),
  
  // Worker configuration
  worker: Joi.object({
    idPrefix: Joi.string().default('worker'),
    connectors: Joi.array().items(Joi.string()).default(['simulation', 'comfyui', 'a1111']),
    downloadUrl: Joi.string().uri().default(
      'https://github.com/stakeordie/emp-job-queue/releases/latest/download/emp-job-queue-worker.tar.gz'
    ),
    useLocalPath: Joi.string().allow('').optional(), // Path to local worker build for development
    skipDownload: Joi.boolean().default(false) // Skip download entirely if local path is set
  }),
  
  // Worker-driven configuration
  workers: Joi.object({
    connectors: Joi.string().default('simulation:1'),
    bundleMode: Joi.string().valid('local', 'remote').default('remote')
  }),
  
  // Port configurations
  ports: Joi.object({
    comfyui: Joi.object({
      base: Joi.number().port().default(8188),
      increment: Joi.number().integer().min(1).default(1)
    }),
    simulation: Joi.object({
      base: Joi.number().port().default(8299)
    }),
    nginx: Joi.number().port().default(80),
    ollama: Joi.number().port().default(11434)
  }),
  
  // Logging configuration
  logging: Joi.object({
    level: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
    maxFiles: Joi.string().default('14d'),
    maxSize: Joi.string().default('20m'),
    directory: Joi.string().default('/workspace/logs')
  }),
  
  // Health check configuration
  health: Joi.object({
    checkInterval: Joi.number().integer().min(1000).default(30000),
    checkTimeout: Joi.number().integer().min(1000).default(5000),
    startupGracePeriod: Joi.number().integer().min(0).default(300000) // 5 minutes
  }),
  
  // Cloud storage configuration
  cloud: Joi.object({
    provider: Joi.string().valid('azure', 'gcs', 'aws', 'none').default('none'),
    skipModelDownload: Joi.boolean().default(false),
    azure: Joi.when('provider', {
      is: 'azure',
      then: Joi.object({
        storageAccount: Joi.string().required(),
        storageKey: Joi.string().required(),
        modelsContainer: Joi.string().default('models')
      })
    })
  })
});

// Generate a short UUID for machine uniqueness
function generateShortUUID() {
  return crypto.randomBytes(4).toString('hex');
}

// Build configuration from environment variables
// GPU configuration will be auto-detected at runtime
function buildConfig() {
  // Generate unique machine ID with short UUID suffix
  const baseId = process.env.MACHINE_ID || process.env.CONTAINER_NAME || 'basic-machine';
  const machineId = baseId.includes('-') ? `${baseId}-${generateShortUUID()}` : `${baseId}-${generateShortUUID()}`;
  
  const config = {
    machine: {
      id: machineId,
      testMode: process.env.TEST_MODE === 'true',
      gpu: {
        count: parseInt(process.env.MACHINE_NUM_GPUS || '2'),
        memoryGB: parseInt(process.env.MACHINE_GPU_MEMORY_GB || '16'),
        model: process.env.MACHINE_GPU_MODEL || 'Unknown'
      }
    },
    redis: {
      url: process.env.HUB_REDIS_URL,
      authToken: process.env.WORKER_WEBSOCKET_AUTH_TOKEN
    },
    worker: {
      idPrefix: process.env.WORKER_ID_PREFIX,
      connectors: process.env.WORKER_CONNECTORS?.split(',').map(s => s.trim()),
      downloadUrl: process.env.WORKER_DOWNLOAD_URL,
      useLocalPath: process.env.WORKER_LOCAL_PATH,
      skipDownload: !!process.env.WORKER_LOCAL_PATH
    },
    // Worker-driven service configuration - services determined by WORKERS environment variable
    workers: {
      connectors: process.env.WORKERS || process.env.WORKER_CONNECTORS || 'simulation:1',
      bundleMode: process.env.WORKER_BUNDLE_MODE || 'remote'
    },
    // Port configurations for services when needed
    ports: {
      comfyui: {
        base: parseInt(process.env.COMFYUI_BASE_PORT || '8188'),
        increment: parseInt(process.env.COMFYUI_PORT_INCREMENT || '1')
      },
      simulation: {
        base: parseInt(process.env.SIMULATION_PORT || '8299')
      },
      nginx: parseInt(process.env.NGINX_PORT || '80'),
      ollama: parseInt(process.env.OLLAMA_PORT || '11434')
    },
    logging: {
      level: process.env.LOG_LEVEL,
      maxFiles: process.env.LOG_MAX_FILES,
      maxSize: process.env.LOG_MAX_SIZE,
      directory: process.env.LOG_DIR
    },
    health: {
      checkInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000'),
      checkTimeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000'),
      startupGracePeriod: parseInt(process.env.STARTUP_GRACE_PERIOD || '300000')
    },
    cloud: {
      provider: process.env.CLOUD_PROVIDER,
      skipModelDownload: process.env.SKIP_MODEL_DOWNLOAD === 'true',
      azure: {
        storageAccount: process.env.AZURE_STORAGE_ACCOUNT,
        storageKey: process.env.AZURE_STORAGE_KEY,
        modelsContainer: process.env.CLOUD_MODELS_CONTAINER
      }
    }
  };
  
  // Remove undefined values
  return JSON.parse(JSON.stringify(config));
}

// Validate and export configuration
let config;
try {
  const rawConfig = buildConfig();
  console.log('DEBUG: Raw config workers section:', rawConfig.workers);
  
  const { error, value } = schema.validate(rawConfig, { 
    abortEarly: false,
    stripUnknown: true 
  });
  
  console.log('DEBUG: Validation error:', error);
  console.log('DEBUG: Validated config workers section:', value?.workers);
  
  if (error) {
    logger.error('Configuration validation failed:', error.details);
    throw new Error(`Invalid configuration: ${error.message}`);
  }
  
  config = value;
  logger.info('Configuration loaded successfully', {
    gpuCount: config.machine.gpu.count,
    workers: config.workers?.connectors || 'not configured',
    bundleMode: config.workers?.bundleMode || 'not configured'
  });
} catch (error) {
  logger.error('Failed to load configuration:', error);
  process.exit(1);
}

export default config;