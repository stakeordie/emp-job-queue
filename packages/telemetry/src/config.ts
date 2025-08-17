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
    console.log(`🔧 TelemetryConfigManager: Instantiating for service type: ${options.serviceType}`);
    try {
      this.config = this.buildConfig(options);
      console.log(`✅ TelemetryConfigManager: Configuration built successfully`);
      this.validate();
      console.log(`✅ TelemetryConfigManager: Configuration validation passed`);
    } catch (error) {
      console.error(`❌ TelemetryConfigManager: Failed during initialization - ${error.message}`);
      throw error;
    }
  }

  private buildConfig(options: ConfigOptions): TelemetryConfig {
    console.log(`🔍 TelemetryConfigManager: Building configuration for ${options.serviceType}`);
    
    // Required environment variables (NO FALLBACKS)
    const requiredVars = [
      'MACHINE_ID',
      'SERVICE_NAME',
      'SERVICE_VERSION', 
      'TELEMETRY_ENV',
      'DASH0_API_KEY',
      ...(options.required || [])
    ];

    console.log(`🔍 TelemetryConfigManager: Checking required vars: ${requiredVars.join(', ')}`);

    // Validate required variables exist
    const missing = requiredVars.filter(varName => !process.env[varName]);
    if (missing.length > 0) {
      console.error(`❌ TelemetryConfigManager: Missing environment variables: ${missing.join(', ')}`);
      console.error(`🔍 TelemetryConfigManager: Available env vars: ${Object.keys(process.env).filter(k => k.includes('TELEMETRY') || k.includes('DASH0') || k.includes('SERVICE') || k.includes('MACHINE')).join(', ')}`);
      throw new Error(
        `FATAL: Missing required telemetry environment variables: ${missing.join(', ')}. ` +
        `These must be set by deployment configuration.`
      );
    }

    console.log(`✅ TelemetryConfigManager: All required variables present`);

    // Build configuration with service-specific defaults
    const serviceDefaults = this.getServiceDefaults(options.serviceType);
    console.log(`🔍 TelemetryConfigManager: Using service defaults: ${JSON.stringify(serviceDefaults)}`);
    
    const config = {
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

    console.log(`✅ TelemetryConfigManager: Configuration object created`);
    console.log(`🔍 TelemetryConfigManager: Service: ${config.serviceName}, Machine: ${config.machineId}, Environment: ${config.environment}`);
    
    return config;
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
    console.log(`🔍 TelemetryConfigManager: Starting configuration validation`);

    // Validate OTEL endpoint
    if (this.config.otel.enabled && !this.config.otel.collectorEndpoint.startsWith('http')) {
      console.error(`❌ TelemetryConfigManager: Invalid OTEL endpoint: ${this.config.otel.collectorEndpoint}`);
      throw new Error(`FATAL: Invalid OTEL collector endpoint: ${this.config.otel.collectorEndpoint}`);
    }
    console.log(`✅ TelemetryConfigManager: OTEL endpoint validation passed: ${this.config.otel.collectorEndpoint}`);

    // Validate Fluentd configuration
    if (this.config.logging.enabled) {
      if (!this.config.logging.fluentdHost) {
        console.error(`❌ TelemetryConfigManager: Missing FLUENTD_HOST`);
        throw new Error('FATAL: FLUENTD_HOST is required when logging is enabled');
      }
      if (isNaN(this.config.logging.fluentdPort) || this.config.logging.fluentdPort <= 0) {
        console.error(`❌ TelemetryConfigManager: Invalid FLUENTD_PORT: ${this.config.logging.fluentdPort}`);
        throw new Error(`FATAL: Invalid FLUENTD_PORT: ${this.config.logging.fluentdPort}`);
      }
      console.log(`✅ TelemetryConfigManager: Fluentd validation passed: ${this.config.logging.fluentdHost}:${this.config.logging.fluentdPort}`);
    } else {
      console.log(`🔍 TelemetryConfigManager: Fluentd logging disabled, skipping validation`);
    }

    // Validate Dash0 configuration
    if (!this.config.dash0.apiKey.startsWith('auth_')) {
      console.error(`❌ TelemetryConfigManager: Invalid DASH0_API_KEY format: ${this.config.dash0.apiKey.substring(0, 10)}...`);
      throw new Error('FATAL: DASH0_API_KEY must start with "auth_"');
    }
    console.log(`✅ TelemetryConfigManager: Dash0 validation passed`);
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

