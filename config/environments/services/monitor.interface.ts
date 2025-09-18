/**
 * Monitor Service Environment Interface
 * Next.js web UI for monitoring job queues and workers
 */

export const MonitorEnvInterface = {
  name: "monitor",
  location: "apps/monitor",
  
  required: {
    // Web server configuration
    "PORT": "MONITOR_PORT",
    "HOST": "MONITOR_HOST",
    "TELEMETRY_ENV":"TELEMETRY_DASH0_DATASET",
    // Connection presets for UI (JSON string)
    "NEXT_PUBLIC_CONNECTIONS": "MONITOR_CONNECTION",
    "WEBHOOK_SERVICE_URL": "WEBHOOK_SERVICE_URL",
    "NEXT_PUBLIC_WEBHOOK_SERVICE_URL": "WEBHOOK_SERVICE_URL",
    "NODE_ENV": "API_NODE_ENV",
    "NEXT_PUBLIC_EMPROPS_API_URL":"MONITOR_EMPROPS_API_URL",
    "EMPROPS_API_URL":"MONITOR_EMPROPS_API_URL"
  },
  
  optional: {
    // Next.js runtime configuration
    "NODE_ENV": "NODE_ENV",
    
    // Client-side auto-connect (exposed to browser)
    "NEXT_PUBLIC_DEFAULT_REDIS_URL": "REDIS_URL",
    "NEXT_PUBLIC_DEFAULT_WS_URL": "API_WEBSOCKET_URL",
    
    // Development
    "LOG_LEVEL": "MONITOR_LOG_LEVEL",
  },
  secret: {
    "DATABASE_URL": "DATABASE_URL",
    "REDIS_URL": "REDIS_URL",
    "HUB_REDIS_URL": "REDIS_URL",
    "EMPROPS_API_KEY": "EMPROPS_API_KEY",
    "AUTH_TOKEN": "API_AUTH_TOKEN"
  },
  defaults: {
    "SERVICE_TYPE": "monitor",
    "LOG_TO_FILE": "true"
  }
};