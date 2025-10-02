/**
 * Telemetry Collector Environment Interface
 * OTLP HTTP endpoint that forwards traces to Dash0
 */

export const TelemetryCollectorEnvInterface = {
  name: "telemetry-collector",
  location: "apps/telemetry-collector",

  required: {
    // OTLP endpoint configuration
    "OTLP_HTTP_PORT": "TELEMETRY_OTLP_HTTP_PORT",
    "OTLP_GRPC_PORT": "TELEMETRY_OTLP_GRPC_PORT",

    "DASH0_ENDPOINT": "TELEMETRY_DASH0_ENDPOINT",
    "DASH0_DATASET": "TELEMETRY_DASH0_DATASET",

    // Optional health check endpoint
  },
  optional: {
  },
  secret: {
    "DASH0_AUTH_TOKEN": "TELEMETRY_DASH0_AUTH_TOKEN"
  },
  defaults: {
  }
};
