/**
 * Telemetry Collector Environment Interface
 * OTLP HTTP endpoint that forwards traces to Dash0
 */

export const TelemetryCollectorEnvInterface = {
  name: "telemetry-collector",
  location: "apps/telemetry-collector",

  required: {
    // OTLP endpoint configuration
    "OTLP_PORT": "TELEMETRY_OTLP_PORT",

    // Dash0 forwarding configuration
    "DASH0_ENABLED": "TELEMETRY_DASH0_ENABLED",
    "DASH0_TRACES_ENDPOINT": "TELEMETRY_DASH0_TRACES_ENDPOINT",
    "DASH0_DATASET": "TELEMETRY_DASH0_DATASET",
    "DASH0_BATCH_SIZE": "TELEMETRY_DASH0_BATCH_SIZE",
    "DASH0_FLUSH_INTERVAL": "TELEMETRY_DASH0_FLUSH_INTERVAL",

    // Optional health check endpoint
    "ENABLE_HEALTH_CHECK": "TELEMETRY_COLLECTOR_HEALTH_CHECK",
    "HEALTH_PORT": "TELEMETRY_HEALTH_PORT"
  },
  optional: {
  },
  secret: {
    "DASH0_AUTH_TOKEN": "TELEMETRY_DASH0_AUTH_TOKEN"
  },
  defaults: {
  }
};
