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
    
    // Connection presets for UI (JSON string)
    "CONNECTIONS": "MONITOR_CONNECTION",
    "WEBHOOK_SERVICE_HOST": "WEBHOOK_SERVICE_HOST",
    "WEBHOOK_SERVICE_PORT": "WEBHOOK_SERVICE_PORT",
  },
  
  optional: {
    // Next.js runtime configuration
    "NODE_ENV": "NODE_ENV",
    
    // Client-side auto-connect (exposed to browser)
    "NEXT_PUBLIC_DEFAULT_REDIS_URL": "REDIS_URL",
    "NEXT_PUBLIC_DEFAULT_WS_URL": "API_WEBSOCKET_URL",
    
    // Security
    "AUTH_TOKEN": "MONITOR_AUTH_TOKEN",
    
    // Development
    "LOG_LEVEL": "MONITOR_LOG_LEVEL",
  },
  
  defaults: {
    "PORT": "3003",
    "HOST": "0.0.0.0",
    "CONNECTIONS": JSON.stringify({
      "local": {
        "name": "Local Development",
        "redis": "redis://localhost:6379",
        "websocket": "ws://localhost:3001/ws"
      }
    }),
  }
};