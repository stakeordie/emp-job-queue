/**
 * Telemetry Configuration Manager
 * 
 * Validates environment variables and provides service-specific defaults
 * NO FALLBACKS - fails fast with descriptive errors
 */

export interface TelemetryConfig {
  // Service Identity
  serviceName: string;
  serviceType: 'api' | 'webhook' | 'machine' | 'worker';
  machineId: string;
  workerId?: string;
  environment: string;
  buildDate?: string;

  // OTEL Configuration
  otel: {
    enabled: boolean;
    collectorEndpoint: string;
    serviceName: string;
    serviceVersion: string;
  };

  // Fluent Bit / Fluentd Configuration  
  logging: {
    enabled: boolean;
    fluentdHost: string;
    fluentdPort: number;
    fluentdSecure: boolean;
    logDir?: string;
  };

  // Dash0 Configuration
  dash0: {
    apiKey: string;
    dataset: string;
    tracesEndpoint: string;
    metricsEndpoint: string;
    logsEndpoint: string;
  };
}

export interface ConfigOptions {
  serviceType: 'api' | 'webhook' | 'machine' | 'worker';
  required?: string[];
  defaults?: Partial<TelemetryConfig>;
}

export class TelemetryConfigManager {
  private config: TelemetryConfig;

  constructor(options: ConfigOptions) {
    this.config = this.buildConfig(options);
    this.validate();
  }

  private buildConfig(options: ConfigOptions): TelemetryConfig {
    // Required environment variables (NO FALLBACKS)
    const requiredVars = [
      'MACHINE_ID',
      'SERVICE_NAME',
      'SERVICE_VERSION', 
      'TELEMETRY_ENV',
      'DASH0_API_KEY',
      ...(options.required || [])
    ];

    // Validate required variables exist
    const missing = requiredVars.filter(varName => !process.env[varName]);
    if (missing.length > 0) {
      throw new Error(
        `FATAL: Missing required telemetry environment variables: ${missing.join(', ')}. ` +
        `These must be set by deployment configuration.`
      );
    }

    // Build configuration with service-specific defaults
    const serviceDefaults = this.getServiceDefaults(options.serviceType);
    
    return {
      // Service Identity
      serviceName: process.env.SERVICE_NAME!,
      serviceType: options.serviceType,
      machineId: process.env.MACHINE_ID!,
      workerId: process.env.WORKER_ID,
      environment: process.env.TELEMETRY_ENV!,
      buildDate: process.env.BUILD_DATE,

      // OTEL Configuration
      otel: {
        enabled: process.env.OTEL_ENABLED !== 'false',
        collectorEndpoint: process.env.OTEL_COLLECTOR_TRACES_ENDPOINT || serviceDefaults.otelEndpoint,
        serviceName: process.env.SERVICE_NAME!,
        serviceVersion: process.env.SERVICE_VERSION!,
      },

      // Logging Configuration
      logging: {
        enabled: process.env.FLUENT_BIT_ENABLED !== 'false',
        fluentdHost: process.env.FLUENTD_HOST || serviceDefaults.fluentdHost,
        fluentdPort: parseInt(process.env.FLUENTD_PORT || serviceDefaults.fluentdPort.toString()),
        fluentdSecure: process.env.FLUENTD_SECURE === 'true',
        logDir: process.env.LOG_DIR,
      },

      // Dash0 Configuration
      dash0: {
        apiKey: process.env.DASH0_API_KEY!,
        dataset: process.env.TELEMETRY_ENV!,
        tracesEndpoint: process.env.DASH0_TRACES_ENDPOINT || 'https://ingress.us-west-2.aws.dash0.com:4317',
        metricsEndpoint: process.env.DASH0_METRICS_ENDPOINT || 'https://ingress.us-west-2.aws.dash0.com:4317',
        logsEndpoint: process.env.DASH0_LOGS_ENDPOINT || 'https://ingress.us-west-2.aws.dash0.com/logs/json',
      },

      // Apply any custom defaults
      ...options.defaults,
    };
  }

  private getServiceDefaults(serviceType: string) {
    const defaults = {
      api: {
        otelEndpoint: 'http://localhost:4318/v1/traces',
        fluentdHost: 'host.docker.internal',
        fluentdPort: 8888,
      },
      webhook: {
        otelEndpoint: 'http://localhost:4318/v1/traces', 
        fluentdHost: 'host.docker.internal',
        fluentdPort: 8888,
      },
      machine: {
        otelEndpoint: 'http://localhost:4318/v1/traces',
        fluentdHost: 'host.docker.internal', 
        fluentdPort: 8888,
      },
      worker: {
        otelEndpoint: 'http://localhost:4318/v1/traces',
        fluentdHost: 'host.docker.internal',
        fluentdPort: 8888,
      }
    };

    return defaults[serviceType as keyof typeof defaults] || defaults.api;
  }

  private validate(): void {
    // Validate OTEL endpoint
    if (this.config.otel.enabled && !this.config.otel.collectorEndpoint.startsWith('http')) {
      throw new Error(`FATAL: Invalid OTEL collector endpoint: ${this.config.otel.collectorEndpoint}`);
    }

    // Validate Fluentd configuration
    if (this.config.logging.enabled) {
      if (!this.config.logging.fluentdHost) {
        throw new Error('FATAL: FLUENTD_HOST is required when logging is enabled');
      }
      if (isNaN(this.config.logging.fluentdPort) || this.config.logging.fluentdPort <= 0) {
        throw new Error(`FATAL: Invalid FLUENTD_PORT: ${this.config.logging.fluentdPort}`);
      }
    }

    // Validate Dash0 configuration
    if (!this.config.dash0.apiKey.startsWith('auth_')) {
      throw new Error('FATAL: DASH0_API_KEY must start with "auth_"');
    }
  }

  public getConfig(): TelemetryConfig {
    return { ...this.config };
  }

  public logConfiguration(): void {
    console.log('🔧 Telemetry Configuration:');
    console.log(`  Service: ${this.config.serviceName} (${this.config.serviceType})`);
    console.log(`  Machine: ${this.config.machineId}`);
    console.log(`  Environment: ${this.config.environment}`);
    console.log(`  OTEL: ${this.config.otel.enabled ? 'enabled' : 'disabled'} → ${this.config.otel.collectorEndpoint}`);
    console.log(`  Logging: ${this.config.logging.enabled ? 'enabled' : 'disabled'} → ${this.config.logging.fluentdHost}:${this.config.logging.fluentdPort}`);
    console.log(`  Dash0: ${this.config.dash0.dataset} → ${this.config.dash0.tracesEndpoint}`);
  }
}

