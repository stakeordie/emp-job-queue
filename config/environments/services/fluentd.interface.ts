
export const FluentdEnvInterface = {
  name: "fluentd",
  location: "apps/fluentd",
  
  required: {
    // Web server configuration
    "DASH0_DATASET": "TELEMETRY_DASH0_DATASET",
    "DASH0_API_KEY": "TELEMETRY_DASH0_API_KEY",
    "REDIS_URL": "REDIS_URL",
    "DASH0_LOGS_ENDPOINT": "TELEMETRY_DASH0_LOGS_ENDPOINT"

  },
  optional: {
  },
  
  defaults: {
    "FLUENTD_COMPANION_PORT": 3335
  }
};