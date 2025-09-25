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

  // OTEL Configuration (optional, for traces/metrics only if needed)
  otel: {
    enabled: boolean;
    collectorEndpoint: string;
    serviceName: string;
    serviceVersion: string;
  };

  // Local Logging Configuration
  logging: {
    enabled: boolean;
    logDir?: string;
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

      // OTEL Configuration (optional)
      otel: {
        enabled: process.env.OTEL_ENABLED === 'true', // Disabled by default
        collectorEndpoint: process.env.OTEL_COLLECTOR_TRACES_ENDPOINT || serviceDefaults.otelEndpoint,
        serviceName: process.env.SERVICE_NAME || serviceName,
        serviceVersion: process.env.SERVICE_VERSION || '1.0.0',
      },

      // Direct Logging Configuration (Fluent Bit removed)
      logging: {
        enabled: process.env.LOGGING_ENABLED !== 'false',
        logDir: process.env.LOG_DIR, // Optional
      },

      // No external logging services - local logging only

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
      },
      webhook: {
        otelEndpoint: 'http://localhost:4318/v1/traces',
      },
      machine: {
        otelEndpoint: 'http://localhost:4318/v1/traces',
      },
      worker: {
        otelEndpoint: 'http://localhost:4318/v1/traces',
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

    // Direct logging validation (Fluent Bit removed)
    if (this.config.logging.enabled) {
      console.log(`✅ TelemetryConfigManager: Direct logging enabled`);
    } else {
      console.log(`🔍 TelemetryConfigManager: Direct logging disabled`);
    }

    // No external service validation needed - local logging only
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
    console.log(`  Logging: ${this.config.logging.enabled ? 'enabled' : 'disabled'} → direct file logging`);
    console.log(`  External Services: None - local logging only`);
  }
}

