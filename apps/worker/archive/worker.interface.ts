/**
 * Worker Service Environment Interface
 * Job execution engine with capability declarations
 * Note: Worker runs inside machine container - machine provides hardware context
 */

export const WorkerEnvInterface = {
  name: "worker",
  location: "apps/worker",
  
  required: {
    // Core runtime connection
    "HUB_REDIS_URL": "REDIS_URL",
    "MACHINE_ID": "MACHINE_ID",
    "WORKER_ID_PREFIX": "WORKER_ID_PREFIX",
    
    // Service connections (from machine context)
    "WORKER_CONNECTORS": "WORKER_CONNECTORS"
  },
  
  optional: {
    // Authentication
    "WORKER_WEBSOCKET_AUTH_TOKEN": "REDIS_PASSWORD",
    
    // ComfyUI advanced config
    "WORKER_COMFYUI_TIMEOUT_SECONDS": "COMFYUI_HEALTH_CHECK_TIMEOUT",
    "WORKER_COMFYUI_MAX_CONCURRENT_JOBS": "COMFYUI_MAX_CONCURRENT_JOBS",
    "WORKER_COMFYUI_USERNAME": "COMFYUI_USERNAME",
    "WORKER_COMFYUI_PASSWORD": "COMFYUI_PASSWORD",
    
    // Worker behavior  
    "WORKER_POLL_INTERVAL_MS": "WORKER_POLL_INTERVAL_MS",
    "WORKER_JOB_TIMEOUT_MINUTES": "WORKER_JOB_TIMEOUT_MINUTES",
    
    // North Star: Pool capabilities (for specialized machine pools)
    "WORKER_MODELS": "WORKER_MODELS", // JSON array of available models
    "WORKER_PERFORMANCE_TIER": "WORKER_PERFORMANCE_TIER", // fast/standard/heavy
    "WORKER_FEATURES": "WORKER_FEATURES", // JSON array of capabilities
    
    // Quality and SLA
    "WORKER_SLA_TIER": "WORKER_SLA_TIER",
    "QUALITY_LEVELS": "WORKER_QUALITY_LEVELS",
    
    // Development flags
    "WORKER_DEBUGGING_ENABLED": "WORKER_DEBUGGING_ENABLED",
    "WORKER_DEVELOPMENT_MODE": "WORKER_DEVELOPMENT_MODE",
  },
  
  defaults: {
    "WORKER_CONNECTORS": "comfyui",
    "WORKER_POLL_INTERVAL_MS": "1000",
    "WORKER_JOB_TIMEOUT_MINUTES": "30", 
    "WORKER_COMFYUI_TIMEOUT_SECONDS": "300",
    "WORKER_COMFYUI_MAX_CONCURRENT_JOBS": "1",
    "QUALITY_LEVELS": "fast,balanced,quality",
    "WORKER_DEBUGGING_ENABLED": "false",
    "WORKER_DEVELOPMENT_MODE": "false",
  }
};