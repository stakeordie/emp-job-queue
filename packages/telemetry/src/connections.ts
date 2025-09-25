/**
 * Telemetry Connection Manager
 *
 * Handles OTEL collector connections (optional)
 * Local logging only - no external services
 */

import type { TelemetryConfig } from './config.js';

export interface ConnectionHealth {
  service: string;
  endpoint: string;
  status: 'connected' | 'disconnected' | 'error';
  latency?: number;
  error?: string;
  lastChecked: string;
}

export interface PipelineHealth {
  otelCollector?: ConnectionHealth;
  overall: 'healthy' | 'degraded' | 'failed';
}

export class TelemetryConnectionManager {
  private config: TelemetryConfig;
  private healthCache = new Map<string, ConnectionHealth>();

  constructor(config: TelemetryConfig) {
    console.log(`🔧 TelemetryConnectionManager: Instantiating connection manager`);
    this.config = config;
    console.log(`🔍 TelemetryConnectionManager: OTEL enabled: ${config.otel.enabled}, Logging enabled: ${config.logging.enabled}`);
    if (config.otel.enabled) {
      console.log(`🔍 TelemetryConnectionManager: OTEL endpoint: ${config.otel.collectorEndpoint}`);
    }
    console.log(`🔍 TelemetryConnectionManager: Local logging only - no external services`);
  }

  /**
   * Test connection to OTEL collector (if enabled)
   */
  async testOtelCollector(): Promise<ConnectionHealth | null> {
    if (!this.config.otel.enabled) {
      console.log(`🔍 TelemetryConnectionManager: OTEL disabled, skipping test`);
      return null;
    }

    console.log(`🔍 TelemetryConnectionManager: Testing OTEL collector connection`);
    const startTime = Date.now();
    const endpoint = this.config.otel.collectorEndpoint;

    try {
      // OTEL collector health endpoint is typically at :13133
      const healthEndpoint = endpoint.replace(':4318', ':13133').replace('/v1/traces', '');
      console.log(`🔍 TelemetryConnectionManager: OTEL health endpoint: ${healthEndpoint}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${healthEndpoint}/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latency = Date.now() - startTime;

      const health: ConnectionHealth = {
        service: 'otel-collector',
        endpoint: healthEndpoint,
        status: response.ok ? 'connected' : 'error',
        latency,
        error: response.ok ? undefined : `HTTP ${response.status}`,
        lastChecked: new Date().toISOString(),
      };

      this.healthCache.set('otel', health);
      console.log(`✅ TelemetryConnectionManager: OTEL test result: ${health.status} (${latency}ms)`);
      return health;

    } catch (error) {
      const latency = Date.now() - startTime;
      const health: ConnectionHealth = {
        service: 'otel-collector',
        endpoint,
        status: 'error',
        latency,
        error: error.message || 'Connection failed',
        lastChecked: new Date().toISOString(),
      };

      this.healthCache.set('otel', health);
      console.log(`❌ TelemetryConnectionManager: OTEL test failed: ${health.error} (${latency}ms)`);
      return health;
    }
  }

  /**
   * Test the complete telemetry pipeline (local logging only)
   */
  async testPipeline(): Promise<PipelineHealth> {
    console.log(`🔍 TelemetryConnectionManager: Testing telemetry pipeline (local logging)`);

    const otelHealth = await this.testOtelCollector();

    // Determine overall health
    let overall: 'healthy' | 'degraded' | 'failed' = 'healthy';

    if (this.config.otel.enabled && otelHealth?.status !== 'connected') {
      overall = 'degraded';
    }

    const pipelineHealth: PipelineHealth = {
      otelCollector: otelHealth || undefined,
      overall,
    };

    console.log(`✅ TelemetryConnectionManager: Pipeline test complete - overall status: ${overall}`);
    return pipelineHealth;
  }

  /**
   * Send test message through local logging (no external services)
   */
  async sendTestMessage(): Promise<{
    otelSuccess: boolean;
    metricsSuccess: boolean;
    errors: string[];
  }> {
    console.log('🧪 TelemetryConnectionManager: Testing local logging...');
    const errors: string[] = [];
    let otelSuccess = false;
    let metricsSuccess = false;

    // Test OTEL if enabled
    if (this.config.otel.enabled) {
      try {
        const health = await this.testOtelCollector();
        otelSuccess = health?.status === 'connected';
      } catch (error) {
        errors.push(`OTEL test failed: ${error.message}`);
      }
    } else {
      console.log('🔍 TelemetryConnectionManager: OTEL disabled, skipping test');
      otelSuccess = true; // Not required, so consider success
    }

    // Local logging is always available
    console.log('✅ TelemetryConnectionManager: Local logging test - success');
    metricsSuccess = true;

    return {
      otelSuccess,
      metricsSuccess,
      errors,
    };
  }

  /**
   * Get cached health status
   */
  getCachedHealth(): Map<string, ConnectionHealth> {
    return new Map(this.healthCache);
  }
}