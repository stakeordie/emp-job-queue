import Joi from 'joi';
import dotenv from 'dotenv';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('config');

// Load environment variables
dotenv.config();

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
  
  // Service configuration
  services: Joi.object({
    nginx: Joi.object({
      enabled: Joi.boolean().default(true),
      port: Joi.number().port().default(80)
    }),
    comfyui: Joi.object({
      enabled: Joi.boolean().default(true),
      basePort: Joi.number().port().default(8188)
    }),
    automatic1111: Joi.object({
      enabled: Joi.boolean().default(true),
      basePort: Joi.number().port().default(3001)
    }),
    redisWorker: Joi.object({
      enabled: Joi.boolean().default(true)
    }),
    ollama: Joi.object({
      enabled: Joi.boolean().default(true),
      port: Joi.number().port().default(11434),
      models: Joi.array().items(Joi.string()).default(['llama3'])
    }),
    simulation: Joi.object({
      enabled: Joi.boolean().default(false),
      port: Joi.number().port().default(8299)
    })
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

// Build configuration from environment variables
// GPU configuration will be auto-detected at runtime
function buildConfig() {
  const config = {
    machine: {
      id: process.env.MACHINE_ID || process.env.CONTAINER_NAME,
      testMode: process.env.TEST_MODE === 'true',
      gpu: {
        count: parseInt(process.env.NUM_GPUS || '1'),
        memoryGB: parseInt(process.env.GPU_MEMORY_GB || '16'),
        model: process.env.GPU_MODEL
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
    services: {
      nginx: {
        enabled: process.env.ENABLE_NGINX === 'true',
        port: parseInt(process.env.NGINX_PORT || '80')
      },
      comfyui: {
        enabled: process.env.ENABLE_COMFYUI !== 'false',
        basePort: parseInt(process.env.COMFYUI_BASE_PORT || '8188')
      },
      automatic1111: {
        enabled: process.env.ENABLE_A1111 === 'true',
        basePort: parseInt(process.env.A1111_BASE_PORT || '3001')
      },
      redisWorker: {
        enabled: process.env.ENABLE_REDIS_WORKERS !== 'false'
      },
      ollama: {
        enabled: process.env.ENABLE_OLLAMA === 'true',
        port: parseInt(process.env.OLLAMA_PORT || '11434'),
        models: process.env.OLLAMA_MODELS?.split(',').map(s => s.trim())
      },
      simulation: {
        enabled: process.env.ENABLE_SIMULATION === 'true',
        port: parseInt(process.env.SIMULATION_PORT || '8299')
      }
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
  const { error, value } = schema.validate(rawConfig, { 
    abortEarly: false,
    stripUnknown: true 
  });
  
  if (error) {
    logger.error('Configuration validation failed:', error.details);
    throw new Error(`Invalid configuration: ${error.message}`);
  }
  
  config = value;
  logger.info('Configuration loaded successfully', {
    gpuCount: config.machine.gpu.count,
    services: Object.entries(config.services)
      .filter(([_, s]) => s.enabled)
      .map(([name]) => name)
  });
} catch (error) {
  logger.error('Failed to load configuration:', error);
  process.exit(1);
}

export default config;