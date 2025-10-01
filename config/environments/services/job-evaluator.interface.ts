/**
 * Webhook Service Environment Interface
 * Next.js web UI for monitoring job queues and workers
 */

export const JobEvaluatorEnvInterface = {
  name: "job-evaluator",
  location: "services/job-evaluator",
  
  required: {
    "OTEL_COLLECTOR_ENDPOINT": "TELEMETRY_OTEL_COLLECTOR_URL",
  },
  optional: {
  },
  secret: {
    "DATABASE_URL": "DATABASE_URL",
    "REDIS_URL": "REDIS_URL",
    "DASH0_AUTH_TOKEN": "TELEMETRY_DASH0_AUTH_TOKEN"
  }, 
  defaults: {
    "PROFILE":"local-dev",
    "LOG_LEVEL":"info",
    "LOG_FORMAT":"json",
    "IGNORE_IS_CLEANUP_EVALUATED": "FALSE"
  }
};