/**
 * Unified Telemetry Client
 * 
 * Main entry point for all telemetry operations
 * Handles startup, connection management, and testing
 */

import { TelemetryConfigManager, type TelemetryConfig } from './config.js';
import { TelemetryConnectionManager, type PipelineHealth } from './connections.js';

export interface TelemetryStartupOptions {
  testConnections?: boolean;
  logConfiguration?: boolean;
  sendStartupPing?: boolean;
}

export class EmpTelemetryClient {
  private configManager: TelemetryConfigManager;
  private connectionManager: TelemetryConnectionManager;
  private config: TelemetryConfig;

  constructor(configManager: TelemetryConfigManager) {
    this.configManager = configManager;
    this.config = configManager.getConfig();
    this.connectionManager = new TelemetryConnectionManager(this.config);
  }

  /**
   * Initialize telemetry client and test connections
   */
  async startup(options: TelemetryStartupOptions = {}): Promise<PipelineHealth | null> {
    const {
      testConnections = true,
      logConfiguration = true,
      sendStartupPing = true,
    } = options;

    console.log('🚀 Initializing EMP Telemetry Client...');

    // Log configuration
    if (logConfiguration) {
      this.configManager.logConfiguration();
    }

    // Test connections
    let pipelineHealth: PipelineHealth | null = null;
    if (testConnections) {
      pipelineHealth = await this.connectionManager.testPipeline();
      this.logPipelineHealth(pipelineHealth);
    }

    // Send startup ping
    if (sendStartupPing) {
      await this.sendStartupMessages();
    }

    console.log('✅ Telemetry client initialization complete');
    return pipelineHealth;
  }

  /**
   * Send startup ping messages through both pipelines
   */
  private async sendStartupMessages(): Promise<void> {
    console.log('📡 Sending startup telemetry messages...');

    try {
      const result = await this.connectionManager.sendTestMessage();
      
      if (result.otelSuccess) {
        console.log('✅ OTEL startup trace sent successfully');
      } else {
        console.warn('⚠️ OTEL startup trace failed');
      }

      if (result.fluentdSuccess) {
        console.log('✅ Fluentd startup log sent successfully');
      } else {
        console.warn('⚠️ Fluentd startup log failed');
      }

      if (result.errors.length > 0) {
        console.warn('⚠️ Startup message errors:', result.errors);
      }
    } catch (error) {
      console.error('❌ Failed to send startup messages:', error);
    }
  }

  /**
   * Log pipeline health status
   */
  private logPipelineHealth(health: PipelineHealth): void {
    console.log('🔍 Telemetry Pipeline Health:');
    console.log(`  Overall: ${this.getHealthEmoji(health.overall)} ${health.overall}`);
    
    if (health.otelCollector) {
      console.log(`  OTEL Collector: ${this.getHealthEmoji(health.otelCollector.status)} ${health.otelCollector.status} (${health.otelCollector.latency}ms)`);
      if (health.otelCollector.error) {
        console.log(`    Error: ${health.otelCollector.error}`);
      }
    }

    if (health.fluentd) {
      console.log(`  Fluentd: ${this.getHealthEmoji(health.fluentd.status)} ${health.fluentd.status} (${health.fluentd.latency}ms)`);
      if (health.fluentd.error) {
        console.log(`    Error: ${health.fluentd.error}`);
      }
    }

    if (health.dash0Direct) {
      console.log(`  Dash0 Direct: ${this.getHealthEmoji(health.dash0Direct.status)} ${health.dash0Direct.status} (${health.dash0Direct.latency}ms)`);
      if (health.dash0Direct.error) {
        console.log(`    Error: ${health.dash0Direct.error}`);
      }
    }
  }

  private getHealthEmoji(status: string): string {
    switch (status) {
      case 'connected':
      case 'healthy':
        return '✅';
      case 'disconnected':
      case 'degraded':
        return '⚠️';
      case 'error':
      case 'failed':
        return '❌';
      default:
        return '❓';
    }
  }

  /**
   * Test the complete telemetry pipeline
   */
  async test(): Promise<PipelineHealth> {
    console.log('🧪 Testing telemetry pipeline...');
    return await this.connectionManager.testPipeline();
  }

  /**
   * Get configuration
   */
  getConfig(): TelemetryConfig {
    return this.config;
  }

  /**
   * Get connection manager (for advanced usage)
   */
  getConnectionManager(): TelemetryConnectionManager {
    return this.connectionManager;
  }
}

/**
 * Create telemetry client for any service type
 */
export function createTelemetryClient(serviceType: 'api' | 'webhook' | 'machine' | 'worker'): EmpTelemetryClient {
  const configManager = new TelemetryConfigManager({ serviceType });
  return new EmpTelemetryClient(configManager);
}