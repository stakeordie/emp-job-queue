/**
 * Telemetry Connection Manager
 * 
 * Handles connections to OTEL collector, Fluentd, and Dash0
 * Includes retry logic, health checking, and pipeline validation
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
  otelCollector: ConnectionHealth;
  fluentd: ConnectionHealth;
  dash0Direct?: ConnectionHealth;
  overall: 'healthy' | 'degraded' | 'failed';
}

export class TelemetryConnectionManager {
  private config: TelemetryConfig;
  private healthCache = new Map<string, ConnectionHealth>();

  constructor(config: TelemetryConfig) {
    console.log(`🔧 TelemetryConnectionManager: Instantiating connection manager`);
    this.config = config;
    console.log(`🔍 TelemetryConnectionManager: OTEL enabled: ${config.otel.enabled}, Logging enabled: ${config.logging.enabled}`);
    console.log(`🔍 TelemetryConnectionManager: OTEL endpoint: ${config.otel.collectorEndpoint}`);
    console.log(`🔍 TelemetryConnectionManager: Fluentd endpoint: ${config.logging.fluentdHost}:${config.logging.fluentdPort}`);
    console.log(`🔍 TelemetryConnectionManager: Dash0 endpoint: ${config.dash0.tracesEndpoint}`);
  }

  /**
   * Test connection to OTEL collector
   */
  async testOtelCollector(): Promise<ConnectionHealth> {
    console.log(`🔍 TelemetryConnectionManager: Testing OTEL collector connection`);
    const startTime = Date.now();
    const endpoint = this.config.otel.collectorEndpoint;

    try {
      // OTEL collector health endpoint is typically at :13133
      const healthEndpoint = endpoint.replace(':4318', ':13133').replace('/v1/traces', '');
      console.log(`🔍 TelemetryConnectionManager: OTEL health endpoint: ${healthEndpoint}`);
      
      const response = await fetch(healthEndpoint, {
        method: 'GET',
      });

      console.log(`🔍 TelemetryConnectionManager: OTEL response status: ${response.status}`);

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
      console.log(`${health.status === 'connected' ? '✅' : '❌'} TelemetryConnectionManager: OTEL test result: ${health.status} (${health.latency}ms)`);
      return health;
    } catch (error) {
      console.error(`❌ TelemetryConnectionManager: OTEL connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      const health: ConnectionHealth = {
        service: 'otel-collector',
        endpoint,
        status: 'error',
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        lastChecked: new Date().toISOString(),
      };

      this.healthCache.set('otel', health);
      return health;
    }
  }

  /**
   * Test connection to Fluentd
   */
  async testFluentd(): Promise<ConnectionHealth> {
    console.log(`🔍 TelemetryConnectionManager: Testing Fluentd connection`);
    const startTime = Date.now();
    const endpoint = `http://${this.config.logging.fluentdHost}:${this.config.logging.fluentdPort}`;
    console.log(`🔍 TelemetryConnectionManager: Fluentd endpoint: ${endpoint}/test`);

    try {
      // Send a test message to Fluentd
      const testPayload = {
        service: 'telemetry-client',
        message: 'connection test',
        timestamp: new Date().toISOString(),
        test: true,
      };

      const response = await fetch(`${endpoint}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload),
      });

      console.log(`🔍 TelemetryConnectionManager: Fluentd response status: ${response.status}`);

      const latency = Date.now() - startTime;
      const health: ConnectionHealth = {
        service: 'fluentd',
        endpoint: `${endpoint}/test`,
        status: response.ok ? 'connected' : 'error',
        latency,
        error: response.ok ? undefined : `HTTP ${response.status}`,
        lastChecked: new Date().toISOString(),
      };

      this.healthCache.set('fluentd', health);
      console.log(`${health.status === 'connected' ? '✅' : '❌'} TelemetryConnectionManager: Fluentd test result: ${health.status} (${health.latency}ms)`);
      return health;
    } catch (error) {
      console.error(`❌ TelemetryConnectionManager: Fluentd connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      const health: ConnectionHealth = {
        service: 'fluentd',
        endpoint,
        status: 'error',
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        lastChecked: new Date().toISOString(),
      };

      this.healthCache.set('fluentd', health);
      return health;
    }
  }

  /**
   * Test direct connection to Dash0 (optional)
   */
  async testDash0Direct(): Promise<ConnectionHealth> {
    console.log(`🔍 TelemetryConnectionManager: Testing Dash0 direct connection`);
    const startTime = Date.now();
    const endpoint = this.config.dash0.tracesEndpoint;
    console.log(`🔍 TelemetryConnectionManager: Dash0 endpoint: ${endpoint}`);

    try {
      // Simple connectivity test to Dash0
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.dash0.apiKey}`
        },
        body: JSON.stringify({ test: true }),
      });

      console.log(`🔍 TelemetryConnectionManager: Dash0 response status: ${response.status}`);

      const latency = Date.now() - startTime;
      const health: ConnectionHealth = {
        service: 'dash0',
        endpoint,
        status: response.status < 500 ? 'connected' : 'error', // 4xx is connection success
        latency,
        error: response.status >= 500 ? `HTTP ${response.status}` : undefined,
        lastChecked: new Date().toISOString(),
      };

      this.healthCache.set('dash0', health);
      console.log(`${health.status === 'connected' ? '✅' : '❌'} TelemetryConnectionManager: Dash0 test result: ${health.status} (${health.latency}ms)`);
      return health;
    } catch (error) {
      console.error(`❌ TelemetryConnectionManager: Dash0 connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      const health: ConnectionHealth = {
        service: 'dash0',
        endpoint,
        status: 'error',
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        lastChecked: new Date().toISOString(),
      };

      this.healthCache.set('dash0', health);
      return health;
    }
  }

  /**
   * Test the complete telemetry pipeline
   */
  async testPipeline(): Promise<PipelineHealth> {
    console.log('🔍 Testing telemetry pipeline...');

    // Test all connections in parallel
    const [otelHealth, fluentdHealth, dash0Health] = await Promise.all([
      this.config.otel.enabled ? this.testOtelCollector() : Promise.resolve(null),
      this.config.logging.enabled ? this.testFluentd() : Promise.resolve(null),
      this.testDash0Direct(), // Always test Dash0 direct
    ]);

    // Determine overall health
    const connections = [otelHealth, fluentdHealth].filter(Boolean) as ConnectionHealth[];
    const hasErrors = connections.some(c => c.status === 'error');
    const hasDegraded = connections.some(c => c.status === 'disconnected');

    let overall: 'healthy' | 'degraded' | 'failed';
    if (hasErrors) {
      overall = 'failed';
    } else if (hasDegraded) {
      overall = 'degraded';
    } else {
      overall = 'healthy';
    }

    const pipeline: PipelineHealth = {
      otelCollector: otelHealth!,
      fluentd: fluentdHealth!,
      dash0Direct: dash0Health,
      overall,
    };

    return pipeline;
  }

  /**
   * Send a test message through the complete pipeline
   */
  async sendTestMessage(): Promise<{
    otelSuccess: boolean;
    fluentdSuccess: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];
    let otelSuccess = false;
    let fluentdSuccess = false;

    // Test OTEL trace
    if (this.config.otel.enabled) {
      try {
        await this.sendTestTrace();
        otelSuccess = true;
        console.log('✅ Test trace sent to OTEL collector');
      } catch (error) {
        errors.push(`OTEL: ${error instanceof Error ? error.message : 'Unknown error'}`);
        console.log('❌ Failed to send test trace to OTEL collector');
      }
    }

    // Test Fluentd log
    if (this.config.logging.enabled) {
      try {
        await this.sendTestLog();
        fluentdSuccess = true;
        console.log('✅ Test log sent to Fluentd');
      } catch (error) {
        errors.push(`Fluentd: ${error instanceof Error ? error.message : 'Unknown error'}`);
        console.log('❌ Failed to send test log to Fluentd');
      }
    }

    return { otelSuccess, fluentdSuccess, errors };
  }

  private async sendTestTrace(): Promise<void> {
    const traceId = Array.from({length: 32}, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const spanId = Array.from({length: 16}, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const startTime = Date.now();

    const traceData = {
      resourceSpans: [{
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: this.config.serviceName }},
            { key: "machine.id", value: { stringValue: this.config.machineId }},
            { key: "test.connection", value: { stringValue: "true" }}
          ]
        },
        scopeSpans: [{
          spans: [{
            traceId,
            spanId,
            name: 'telemetry.client.test',
            kind: 1,
            startTimeUnixNano: `${startTime * 1000000}`,
            endTimeUnixNano: `${(startTime + 1) * 1000000}`,
            attributes: [
              { key: "test.type", value: { stringValue: "connection_test" }},
              { key: "client.version", value: { stringValue: "1.0.0" }}
            ]
          }]
        }]
      }]
    };

    const response = await fetch(this.config.otel.collectorEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(traceData),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  }

  private async sendTestLog(): Promise<void> {
    const logPayload = {
      service: this.config.serviceName,
      message: 'telemetry client connection test',
      level: 'info',
      timestamp: new Date().toISOString(),
      machine_id: this.config.machineId,
      test: true,
    };

    const endpoint = `http://${this.config.logging.fluentdHost}:${this.config.logging.fluentdPort}/test`;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(logPayload),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  }

  /**
   * Get cached health status
   */
  getCachedHealth(): Map<string, ConnectionHealth> {
    return new Map(this.healthCache);
  }

  /**
   * Clear health cache
   */
  clearHealthCache(): void {
    this.healthCache.clear();
  }
}