
export const FluentdEnvInterface = {
  name: "fluentd",
  location: "apps/fluentd",
  
  required: {
    // Environment identification for Fluentd template
    "ENV": "TELEMETRY_DASH0_DATASET",
    // Web server configuration  
    "TELEMETRY_ENV":"TELEMETRY_DASH0_DATASET",
    "DASH0_DATASET": "TELEMETRY_DASH0_DATASET",
    "HUB_REDIS_URL": "REDIS_URL",
    "DASH0_LOGS_ENDPOINT": "TELEMETRY_DASH0_LOGS_ENDPOINT",
    "NODE_ENV": "API_NODE_ENV"
  },
  
  secret: {
    // Sensitive API keys
    "DASH0_API_KEY": "DASH0_API_KEY"
  },
  
  optional: {
  },
  
  defaults: {
    "FLUENTD_COMPANION_PORT": 3335,
    "SERVICE_TYPE":"fluentd",
    "LOG_TO_FILE": "true"
  }
};