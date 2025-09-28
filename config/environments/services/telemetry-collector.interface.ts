/**
 * Webhook Service Environment Interface
 * Next.js web UI for monitoring job queues and workers
 */

export const TelemetryCollectorEnvInterface = {
  name: "telemetry-collector",
  location: "apps/telemetry-collector",
  
  required: {
    "TELEMETRY_STREAM_KEY": "TELEMETRY_STREAM_KEY",
    "CONSUMER_GROUP": "TELEMETRY_CONSUMER_GROUP",
    "CONSUMER_NAME": "TELEMETRY_CONSUMER_NAME",
    "BATCH_SIZE": "TELEMETRY_BATCH_SIZE",
    "BLOCK_TIME": "TELEMETRY_BLOCK_TIME",

    "OUTPUT_FORMAT": "TELEMETRY_OUTPUT_FORMAT",
    "PROCESSOR_BATCH_SIZE": "TELEMETRY_PROCESSOR_BATCH_SIZE",
    "FLUSH_INTERVAL": "TELEMETRY_FLUSH_INTERVAL",

    "STATS_INTERVAL": "TELEMETRY_STATS_INTERVAL"
  },
  optional: {
  },
  secret: {
    "REDIS_URL": "REDIS_URL",
  }, 
  defaults: {

  }
};