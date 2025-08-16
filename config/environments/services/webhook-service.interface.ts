/**
 * Webhook Service Environment Interface
 * Next.js web UI for monitoring job queues and workers
 */

export const WebhookServiceEnvInterface = {
  name: "webhook-service",
  location: "apps/webhook-service",
  
  required: {
    // Web server configuration
    "HUB_REDIS_URL": "REDIS_URL",
    "WEBHOOK_SERVICE_PORT": "WEBHOOK_SERVICE_PORT",
    "CORS_ORIGINS": "WEBHOOK_SERVICE_CORS_ORIGINS",
    "NEXT_PUBLIC_APP_URL": "WEBHOOK_SERVICE_URL",
    "AUTH_TOKEN": "API_AUTH_TOKEN"
  },
  optional: {
  },
  
  defaults: {
  }
};