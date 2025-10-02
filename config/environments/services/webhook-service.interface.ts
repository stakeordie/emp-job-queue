/**
 * Webhook Service Environment Interface
 * Next.js web UI for monitoring job queues and workers
 */

export const WebhookServiceEnvInterface = {
  name: "webhook-service",
  location: "apps/webhook-service",
  
  required: {
    "API_PORT": "API_PORT",
    // Web server configuration
    "WEBHOOK_BASE_ID": "WEBHOOK_SERVICE_BASE_ID",
    "WEBHOOK_SERVICE_PORT": "WEBHOOK_SERVICE_PORT",
    "CORS_ORIGINS": "WEBHOOK_SERVICE_CORS_ORIGINS",
    "NEXT_PUBLIC_APP_URL": "WEBHOOK_SERVICE_URL",
    
    //TELEMETRY
    "OTEL_COLLECTOR_ENDPOINT": "TELEMETRY_OTEL_COLLECTOR_URL",

    "EMPROPS_API_URL": "EMPROPS_API_URL",
    "NODE_ENV": "API_NODE_ENV"
  },
  optional: {
  },
  secret: {
    "HUB_REDIS_URL": "REDIS_URL",
    "REDIS_URL": "REDIS_URL",
    "AUTH_TOKEN": "API_AUTH_TOKEN",
    "DASH0_AUTH_TOKEN": "TELEMETRY_DASH0_AUTH_TOKEN",
    "EMPROPS_API_AUTH": "EMPROPS_API_AUTH",
    "EMPROPS_API_KEY": "EMPROPS_API_KEY"
  }, 
  
  defaults: {
    "SERVICE_TYPE":"webhook",
    "LOG_TO_FILE": "true"
  }
};