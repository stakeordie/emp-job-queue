/**
 * API Machine Environment Interface
 * Container for API-only workloads (OpenAI, Replicate, RunPod, etc.)
 */

export const ApiMachineEnvInterface = {
  name: "api_machine",
  location: "apps/machine",
  file_name: ".env.api",
  
  required: {
    // Redis connection (used by both machine and workers)
    "HUB_REDIS_URL": "REDIS_URL", // VERIFIED: Used in standalone-wrapper.js:67, environment.js:112

    // Machine identity and Redis connection
    "MACHINE_ID": "API-MACHINE_ID", // VERIFIED: Used in environment.js:103, ecosystem-generator.js:39, etc.
    "MACHINE_CONTAINER_NAME": "API-MACHINE_ID", // VERIFIED: Container naming in docker-compose

    // NOT FOUND IN CODE - COMMENTING OUT
    // "WORKER_RAM_GB": "API-MACHINE_RAM_GB",
    // "WORKER_MAX_CONCURRENT_JOBS": "API-MACHINE_MAX_CONCURRENT_JOBS",
    // "WORKER_JOB_TIMEOUT_MINUTES": "API-MACHINE_JOB_TIMEOUT_MINUTES",

    // PM2 Service Management
    // "PM2_HOME": "MACHINE_PM2_HOME", // VERIFIED: Used in pm2-manager.js:16 BUT has default '/workspace/.pm2' - moving to optional
    "MACHINE_STATUS_UPDATE_INTERVAL_SECONDS": "MACHINE_STATUS_UPDATE_INTERVAL_SECONDS", // VERIFIED: Used in machine-status-aggregator.js:28

    // Enabled Services
    "MACHINE_ENABLE_API": "API-MACHINE_ENABLE_API", // VERIFIED: Used in ecosystem-generator.js:13
    "MACHINE_ENABLE_REDIS_WORKERS": "API-MACHINE_ENABLE_REDIS_WORKERS", // VERIFIED: Used in ecosystem-generator.js:14
    "MACHINE_ENABLE_SIMULATION": "API-MACHINE_ENABLE_SIMULATION", // VERIFIED: Used in index-pm2.js:134
    "MACHINE_EXPOSE_PORTS": "API-MACHINE_EXPOSE_PORTS", // VERIFIED: Used for docker-compose conditional ports

    // TODO: ADD TO COMPONENTS - API Worker Configuration
    "MACHINE_API_WORKER_COUNT": "API-MACHINE_API_WORKER_COUNT", // VERIFIED: Used in ecosystem-generator.js:15
    // NOTE: The code uses MACHINE_API_CONNECTORS but this is conceptually wrong - should be WORKER_CONNECTORS
    // Keeping the wrong name for now to match what the code expects, but this should be fixed in the code
    "MACHINE_API_CONNECTORS": "API-MACHINE_WORKER_CONNECTORS", // VERIFIED: Used in ecosystem-generator.js:127 - BUT SHOULD BE WORKER_CONNECTORS

    // API tokens for external services
    // "MACHINE_OPENAI_API-TOKEN": "API-TOKENS_OPENAI_API_KEY", // NOT USED BY MACHINE CODE - only OPENAI_API_KEY
    // "MACHINE_REPLICATE_API-TOKEN": "API-TOKENS_REPLICATE_API_TOKEN", // NOT USED BY MACHINE CODE - only REPLICATE_API_TOKEN
    "MACHINE_RUNPOD_API_KEY": "API-TOKENS_RUNPOD_API_KEY", // KEEPING - might be used by worker code
    
    // Storage configuration for API services - USED BY SIMULATION SERVICE
    "MACHINE_CLOUD_CDN_URL": "STORAGE-PROVIDER_CDN_URL",
    "MACHINE_AWS_ACCESS_KEY_ID": "STORAGE-PROVIDER_AWS_ACCESS_KEY_ID",
    "MACHINE_AWS_SECRET_ACCESS_KEY_ENCODED": "STORAGE-PROVIDER_AWS_SECRET_ACCESS_KEY_ENCODED",
    "MACHINE_AWS_DEFAULT_REGION": "STORAGE-PROVIDER_AWS_DEFAULT_REGION",
    "MACHINE_AZURE_STORAGE_ACCOUNT": "STORAGE-PROVIDER_AZURE_STORAGE_ACCOUNT",
    "MACHINE_AZURE_STORAGE_KEY": "STORAGE-PROVIDER_AZURE_KEY",
    "MACHINE_CLOUD_PROVIDER": "STORAGE-PROVIDER_CURRENT_PROVIDER",
    "MACHINE_CLOUD_STORAGE_CONTAINER": "STORAGE-PROVIDER_CONTAINER",
  },
  
  optional: {
    // Machine monitoring and health
    "MACHINE_HEALTH_PORT": "API-MACHINE_HEALTH_PORT", // VERIFIED: Used in machine-manager.js:301, index-pm2.js:326,350
    // "MACHINE_LOG_LEVEL": "API-MACHINE_LOG_LEVEL", // NOT FOUND as MACHINE_LOG_LEVEL (only LOG_LEVEL)
    // "MACHINE_TEST_MODE": "API-MACHINE_TEST_MODE", // NOT FOUND as MACHINE_TEST_MODE (only TEST_MODE)

    // TODO: ADD TO COMPONENTS - Need these for code to work
    "LOG_LEVEL": "API-MACHINE_LOG_LEVEL", // VERIFIED: Used in logger.js:63,80
    "TEST_MODE": "API-MACHINE_TEST_MODE", // VERIFIED: Used in environment.js:104
    "NODE_ENV": "DEPLOYMENT_NODE_ENV", // VERIFIED: Used in logger.js:68, ecosystem-generator.js:37,57,etc
    "CONTAINER_NAME": "API-MACHINE_CONTAINER_NAME", // VERIFIED: Used in logger.js:74, version-service.js:95
    "MACHINE_TYPE": "API-MACHINE_TYPE", // VERIFIED: Used in ecosystem-generator.js:10, weather-api-connector.js:186,220
    "PM2_HOME": "MACHINE_PM2_HOME", // VERIFIED: Used in pm2-manager.js:16 - has default but good to be explicit

    // Worker configuration
    "WORKER_CONNECTORS": "API-MACHINE_WORKER_CONNECTORS", // VERIFIED: Used in standalone-wrapper.js:81
    "WORKER_WEBSOCKET_AUTH_TOKEN": "REDIS_PASSWORD", // VERIFIED: Used in standalone-wrapper.js:68

    // TODO: ADD TO COMPONENTS - Simulation service configuration (API machines can run simulation too)
    "SIMULATION_PORT": "SIMULATION_PORT", // VERIFIED: Used in simulation-service.js:11, ecosystem-generator.js:60
    "SIMULATION_HOST": "SIMULATION_HOST", // VERIFIED: Used in simulation-service.js:12
    "SIMULATION_PROCESSING_TIME": "SIMULATION_PROCESSING_TIME", // VERIFIED: Used in simulation-server.js:24
    "SIMULATION_STEPS": "SIMULATION_STEPS", // VERIFIED: Used in simulation-server.js:25
    "SIMULATION_FAILURE_RATE": "SIMULATION_FAILURE_RATE", // VERIFIED: Used in simulation-server.js:26
    "SIMULATION_PROGRESS_INTERVAL_MS": "SIMULATION_PROGRESS_INTERVAL_MS", // VERIFIED: Used in simulation-server.js:27

    // NOT FOUND IN CODE - COMMENTING OUT
    // "WORKER_HEARTBEAT_INTERVAL": "MACHINE_HEARTBEAT_INTERVAL",
    // "WORKER_HEARTBEAT_TIMEOUT_SEC": "MACHINE_HEARTBEAT_TIMEOUT_SEC",
    // "WORKER_POLL_INTERVAL_MS": "MACHINE_POLL_INTERVAL_MS",
    // "WORKER_WEBSOCKET_RECONNECT_DELAY_MS": "MACHINE_WEBSOCKET_RECONNECT_DELAY_MS",
    // "WORKER_WEBSOCKET_MAX_RECONNECT_ATTEMPTS": "MACHINE_WEBSOCKET_MAX_RECONNECT_ATTEMPTS",
    // "WORKER_DASHBOARD_ENABLED": "MACHINE_DASHBOARD_ENABLED",
    // "WORKER_DASHBOARD_PORT": "MACHINE_DASHBOARD_PORT",
    // "WORKER_DEBUGGING_ENABLED": "MACHINE_DEBUGGING_ENABLED",
    // "WORKER_DEVELOPMENT_MODE": "MACHINE_DEVELOPMENT_MODE",
    // "DISABLE_FILE_LOGGING": "MACHINE_DISABLE_FILE_LOGGING",
    // "CUSTOMER_ISOLATION": "PLATFORM_CUSTOMER_ISOLATION",

    // API service environment variables (unprefixed - what the services expect)
    "OPENAI_API_KEY": "API-TOKENS_OPENAI_API_KEY", // VERIFIED: Used in openai-connector.js:12, ecosystem-generator.js:141
    "REPLICATE_API_TOKEN": "API-TOKENS_REPLICATE_API_TOKEN", // VERIFIED: Used in replicate-connector.js:12, ecosystem-generator.js:142
    "RUNPOD_API_KEY": "API-TOKENS_RUNPOD_API_KEY", // VERIFIED: Used in runpod-connector.js:12, ecosystem-generator.js:143
    
    // Storage credentials passed through for API services
    "AWS_ACCESS_KEY_ID": "STORAGE-PROVIDER_AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY_ENCODED": "STORAGE-PROVIDER_AWS_SECRET_ACCESS_KEY_ENCODED",
    "AWS_DEFAULT_REGION": "STORAGE-PROVIDER_AWS_DEFAULT_REGION",
    "AZURE_STORAGE_ACCOUNT": "STORAGE-PROVIDER_AZURE_STORAGE_ACCOUNT", 
    "AZURE_STORAGE_KEY": "STORAGE-PROVIDER_AZURE_KEY", // VERIFIED: Used in simulation-server.js:35,37
    "CLOUD_PROVIDER": "STORAGE-PROVIDER_CURRENT_PROVIDER",
    "CLOUD_STORAGE_CONTAINER": "STORAGE-PROVIDER_CONTAINER", // VERIFIED: Used in simulation-server.js:44
    "CLOUD_CDN_URL": "STORAGE-PROVIDER_CDN_URL",

    // TODO: ADD TO COMPONENTS - Additional Azure storage for simulation
    "CLOUD_STORAGE_TEST_CONTAINER": "CLOUD_STORAGE_TEST_CONTAINER", // VERIFIED: Used in simulation-server.js:43
    "STORAGE_TEST_MODE": "STORAGE_TEST_MODE", // VERIFIED: Used in simulation-server.js:41
  },
  
  defaults: {
    "MACHINE_TYPE": "api",
    "MACHINE_HAS_GPU": "false",
    "MACHINE_API_WORKER_COUNT": "5",
    "WORKER_CONNECTORS": "openai,replicate,runpod,weather" // Default API connectors
  }
};