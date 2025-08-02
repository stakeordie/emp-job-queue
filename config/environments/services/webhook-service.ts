/**
 * Webhook Service Environment Interface
 * Next.js web UI for monitoring job queues and workers
 */

export const WebhookServiceEnvInterface = {
  name: "webhook-service",
  location: "apps/webhook-service",
  
  required: {
    // Web server configuration
    REDIS_URL: "REDIS_URL"
  },
  
  optional: {
  },
  
  defaults: {
  }
};