/**
 * Telemetry Configuration Manager
 * 
 * Validates environment variables and provides service-specific defaults
 * NO FALLBACKS - fails fast with descriptive errors using @emp/core getRequiredEnv
 */

import { getRequiredEnv, getRequiredEnvInt, getRequiredEnvBool } from '@emp/core';

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
    const enableLogs = process.env.TELEMETRY_LOGS !== 'false';
    if (enableLogs) console.log(`🔧 TelemetryConfigManager: Instantiating for service type: ${options.serviceType}`);
    try {
      this.config = this.buildConfig(options);
      if (enableLogs) console.log(`✅ TelemetryConfigManager: Configuration built successfully`);
      this.validate();
      if (enableLogs) console.log(`✅ TelemetryConfigManager: Configuration validation passed`);
    } catch (error) {
      console.error(`❌ TelemetryConfigManager: Failed during initialization - ${error.message}`);
      throw error;
    }
  }

  private buildConfig(options: ConfigOptions): TelemetryConfig {
    console.log(`🔍 TelemetryConfigManager: Building configuration for ${options.serviceType}`);
    
    // Generate specific service name based on type and base ID
    const serviceName = this.generateServiceName(options.serviceType);
    console.log(`🔍 TelemetryConfigManager: Generated service name: ${serviceName}`);
    
    // Build configuration with service-specific defaults
    const serviceDefaults = this.getServiceDefaults(options.serviceType);
    console.log(`🔍 TelemetryConfigManager: Using service defaults: ${JSON.stringify(serviceDefaults)}`);
    
    const config = {
      // Service Identity (highly specific naming)
      serviceName,
      serviceType: options.serviceType,
      machineId: getRequiredEnv('MACHINE_ID', 'Machine/container identifier for telemetry'),
      workerId: process.env.WORKER_ID, // Optional
      environment: getRequiredEnv('TELEMETRY_ENV', 'Deployment environment (development/staging/production)'),
      buildDate: process.env.BUILD_DATE, // Optional

      // OTEL Configuration (using getRequiredEnv where needed)
      otel: {
        enabled: process.env.OTEL_ENABLED !== 'false',
        collectorEndpoint: process.env.OTEL_COLLECTOR_TRACES_ENDPOINT || serviceDefaults.otelEndpoint,
        serviceName: getRequiredEnv('SERVICE_NAME', 'Service name for OTEL traces'),
        serviceVersion: getRequiredEnv('SERVICE_VERSION', 'Service version for OTEL traces'),
      },

      // Logging Configuration (using getRequiredEnv)
      logging: {
        enabled: process.env.FLUENT_BIT_ENABLED !== 'false',
        fluentdHost: getRequiredEnv('FLUENTD_HOST', 'Fluentd server hostname for log forwarding'),
        fluentdPort: getRequiredEnvInt('FLUENTD_PORT', 'Fluentd server port for log forwarding'),
        fluentdSecure: process.env.FLUENTD_SECURE === 'true',
        logDir: process.env.LOG_DIR, // Optional
      },

      // Dash0 Configuration (using getRequiredEnv)
      dash0: {
        apiKey: getRequiredEnv('DASH0_API_KEY', 'Dash0 API key for telemetry ingestion'),
        dataset: getRequiredEnv('TELEMETRY_ENV', 'Dash0 dataset name (matches environment)'),
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

  /**
   * Generate highly specific service name for clear telemetry identification
   * Uses MACHINE_ID as the primary identifier with service type for clarity
   */
  private generateServiceName(serviceType: string): string {
    // Use MACHINE_ID as primary identifier, fall back to service type
    const machineId = process.env.MACHINE_ID;
    const environment = process.env.TELEMETRY_ENV || 'unknown';
    
    if (machineId) {
      // MACHINE_ID already includes service context (e.g., "webhook-service-development")
      return machineId;
    }
    
    // Fallback if MACHINE_ID not set
    const serviceName = `emp-${serviceType}-${environment}`;
    console.warn(`⚠️  TelemetryConfigManager: MACHINE_ID not set, using generated name: ${serviceName}`);
    return serviceName;
  }

  private getServiceDefaults(serviceType: string) {
    const defaults = {
      api: {
        otelEndpoint: 'http://localhost:4318/v1/traces',
        fluentdHost: 'host.docker.internal',  // Default for containers in development
        fluentdPort: 24224,
      },
      webhook: {
        otelEndpoint: 'http://localhost:4318/v1/traces', 
        fluentdHost: 'host.docker.internal',  // Default for containers in development
        fluentdPort: 24224,
      },
      machine: {
        otelEndpoint: 'http://localhost:4318/v1/traces',
        fluentdHost: 'host.docker.internal',  // Default for containers in development
        fluentdPort: 24224,
      },
      worker: {
        otelEndpoint: 'http://localhost:4318/v1/traces',
        fluentdHost: 'host.docker.internal',  // Default for containers in development
        fluentdPort: 24224,
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

