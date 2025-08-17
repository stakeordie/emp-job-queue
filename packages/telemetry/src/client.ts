/**
 * Unified Telemetry Client
 * 
 * Main entry point for all telemetry operations
 * Handles startup, connection management, and testing
 */

import { TelemetryConfigManager, type TelemetryConfig } from './config.js';
import { TelemetryConnectionManager, type PipelineHealth } from './connections.js';
import { promises as fs } from 'fs';
import { dirname } from 'path';

export interface TelemetryStartupOptions {
  testConnections?: boolean;
  logConfiguration?: boolean;
  sendStartupPing?: boolean;
}

export class EmpTelemetryClient {
  private configManager: TelemetryConfigManager;
  private connectionManager: TelemetryConnectionManager;
  private config: TelemetryConfig;
  private startTime: number;
  private logFilePath: string;

  constructor(configManager: TelemetryConfigManager) {
    this.startTime = Date.now();
    console.log(`🔧 EmpTelemetryClient: Instantiating telemetry client`);
    this.configManager = configManager;
    this.config = configManager.getConfig();
    console.log(`✅ EmpTelemetryClient: Configuration retrieved`);
    this.connectionManager = new TelemetryConnectionManager(this.config);
    console.log(`✅ EmpTelemetryClient: Connection manager created`);
    
    // Set default log file path based on service type
    this.logFilePath = this.getDefaultLogFilePath();
    console.log(`📁 EmpTelemetryClient: Default log file: ${this.logFilePath}`);
  }

  private getDefaultLogFilePath(): string {
    // For API service running in Docker, use /api-server/logs to match Fluent Bit config
    const baseDir = this.config.logging.logDir || 
      (this.config.serviceType === 'api' ? '/api-server/logs' : '/logs');
    return `${baseDir}/${this.config.serviceName}-${this.config.serviceType}.log`;
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

    // Send startup metric with initialization time
    const initializationTime = Date.now() - this.startTime;
    console.log(`📊 Telemetry initialization completed in ${initializationTime}ms`);
    
    if (this.config.otel.enabled) {
      try {
        await this.sendStartupMetric(initializationTime);
        console.log('✅ Startup metric sent successfully');
      } catch (error) {
        console.warn('⚠️ Failed to send startup metric:', error);
      }
    }

    // Write startup logs to demonstrate file-based log pipeline
    if (this.config.logging.enabled) {
      try {
        await this.writeStartupLogs();
        console.log('✅ Startup logs written to file for Fluent Bit pickup');
      } catch (error) {
        console.warn('⚠️ Failed to write startup logs:', error);
      }
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

      if (result.metricsSuccess) {
        console.log('✅ OTEL startup metric sent successfully');
      } else {
        console.warn('⚠️ OTEL startup metric failed');
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
   * Send startup metric with initialization time
   */
  private async sendStartupMetric(initializationTimeMs: number): Promise<void> {
    console.log(`📊 Sending startup metric: telemetry initialized in ${initializationTimeMs}ms`);
    console.log(`🔍 Startup metric debug: value=${initializationTimeMs}, type=${typeof initializationTimeMs}, rounded=${Math.round(initializationTimeMs)}`);
    
    const timestamp = Date.now();
    const metricData = {
      resourceMetrics: [{
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: this.config.serviceName }},
            { key: "service.type", value: { stringValue: this.config.serviceType }},
            { key: "machine.id", value: { stringValue: this.config.machineId }},
            { key: "deployment.environment", value: { stringValue: this.config.environment }}
          ]
        },
        scopeMetrics: [{
          metrics: [{
            name: 'telemetry.startup.initialization_time',
            description: 'Time taken to initialize telemetry client',
            unit: 'ms',
            gauge: {
              dataPoints: [{
                attributes: [
                  { key: "startup.phase", value: { stringValue: "telemetry_initialization" }},
                  { key: "client.version", value: { stringValue: "1.0.0" }},
                  { key: "service.type", value: { stringValue: this.config.serviceType }}
                ],
                timeUnixNano: `${timestamp * 1000000}`,
                asInt: Math.round(initializationTimeMs)
              }]
            }
          }]
        }]
      }]
    };

    const metricsEndpoint = this.config.otel.collectorEndpoint.replace('/v1/traces', '/v1/metrics');
    console.log(`🔍 Sending startup metric to: ${metricsEndpoint}`);

    const response = await fetch(metricsEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metricData),
    });

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(`HTTP ${response.status}: ${response.statusText} - ${responseText}`);
    }

    console.log(`✅ Startup metric sent: ${initializationTimeMs}ms initialization time`);
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

  /**
   * Logging interface - clean API for services
   */
  get log() {
    return {
      /**
       * Add a log file to be monitored by Fluent Bit
       * @param filePath - Path to the log file to monitor
       * @param tag - Optional tag for the logs (defaults to service name)
       */
      addFile: async (filePath: string, tag?: string) => {
        console.log(`📁 Adding log file to monitoring: ${filePath}`);
        this.setLogFile(filePath);
        
        // Ensure the directory exists
        try {
          await fs.mkdir(dirname(filePath), { recursive: true });
          console.log(`✅ Log directory created/verified: ${dirname(filePath)}`);
        } catch (error) {
          console.error(`❌ Failed to create log directory: ${error}`);
        }
        
        // Write a test log to verify the file works
        await this.writeLog('info', `Log file monitoring started for ${filePath}`, {
          log_file_path: filePath,
          tag: tag || this.config.serviceName,
          fluent_bit_monitoring: true
        });
        
        console.log(`✅ Log file added and test entry written: ${filePath}`);
      },

      /**
       * Write a log entry (shorthand for writeLog)
       */
      write: (level: 'info' | 'warn' | 'error' | 'debug', message: string, context: Record<string, any> = {}) => {
        return this.writeLog(level, message, context);
      },

      /**
       * Log levels as methods
       */
      info: (message: string, context: Record<string, any> = {}) => this.writeLog('info', message, context),
      warn: (message: string, context: Record<string, any> = {}) => this.writeLog('warn', message, context),
      error: (message: string, context: Record<string, any> = {}) => this.writeLog('error', message, context),
      debug: (message: string, context: Record<string, any> = {}) => this.writeLog('debug', message, context),
    };
  }

  /**
   * OTEL interface - clean API for metrics and traces
   */
  get otel() {
    return {
      /**
       * Send a metric
       */
      metric: (name: string, value: number, attributes: Record<string, string> = {}, unit: string = '') => {
        return this.sendMetric(name, value, attributes, unit);
      },

      /**
       * Common metric types
       */
      counter: (name: string, value: number = 1, attributes: Record<string, string> = {}) => {
        return this.sendMetric(name, value, { ...attributes, metric_type: 'counter' });
      },

      gauge: (name: string, value: number, attributes: Record<string, string> = {}) => {
        return this.sendMetric(name, value, { ...attributes, metric_type: 'gauge' });
      },

      histogram: (name: string, value: number, attributes: Record<string, string> = {}, unit: string = '') => {
        return this.sendMetric(name, value, { ...attributes, metric_type: 'histogram' }, unit);
      },
    };
  }

  /**
   * Send a custom metric to the OTEL collector
   */
  async sendMetric(name: string, value: number, attributes: Record<string, string> = {}, unit: string = ''): Promise<void> {
    if (!this.config.otel.enabled) {
      console.warn('⚠️ OTEL not enabled, skipping metric:', name);
      return;
    }

    const timestamp = Date.now();
    const metricData = {
      resourceMetrics: [{
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: this.config.serviceName }},
            { key: "service.type", value: { stringValue: this.config.serviceType }},
            { key: "machine.id", value: { stringValue: this.config.machineId }},
            { key: "deployment.environment", value: { stringValue: this.config.environment }}
          ]
        },
        scopeMetrics: [{
          metrics: [{
            name,
            description: `Custom metric: ${name}`,
            unit,
            gauge: {
              dataPoints: [{
                attributes: Object.entries(attributes).map(([key, value]) => ({
                  key,
                  value: { stringValue: value }
                })),
                timeUnixNano: `${timestamp * 1000000}`,
                asDouble: value
              }]
            }
          }]
        }]
      }]
    };

    const metricsEndpoint = this.config.otel.collectorEndpoint.replace('/v1/traces', '/v1/metrics');
    
    try {
      const response = await fetch(metricsEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metricData),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      console.log(`📊 Metric sent: ${name}=${value}${unit ? ' ' + unit : ''}`);
    } catch (error) {
      console.error(`❌ Failed to send metric ${name}:`, error);
      throw error;
    }
  }

  /**
   * Set custom log file path for this client
   */
  setLogFile(filePath: string): void {
    this.logFilePath = filePath;
    console.log(`📁 Log file path updated: ${this.logFilePath}`);
  }

  /**
   * Get current log file path
   */
  getLogFile(): string {
    return this.logFilePath;
  }

  /**
   * Write a log entry to the configured log file
   * This will be picked up by Fluent Bit and sent to Fluentd → Dash0
   */
  async writeLog(level: 'info' | 'warn' | 'error' | 'debug', message: string, context: Record<string, any> = {}): Promise<void> {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      service: this.config.serviceName,
      service_type: this.config.serviceType,
      machine_id: this.config.machineId,
      environment: this.config.environment,
      ...context
    };

    const logLine = JSON.stringify(logEntry) + '\n';

    try {
      // Ensure log directory exists
      await fs.mkdir(dirname(this.logFilePath), { recursive: true });
      
      // Append to log file
      await fs.appendFile(this.logFilePath, logLine);
      
      console.log(`📝 Log written: ${level.toUpperCase()} - ${message}`);
    } catch (error) {
      console.error(`❌ Failed to write log to ${this.logFilePath}:`, error);
    }
  }

  /**
   * Write startup logs to demonstrate the log pipeline
   */
  async writeStartupLogs(): Promise<void> {
    console.log('📝 Writing startup logs to demonstrate log pipeline...');
    
    try {
      await this.writeLog('info', 'Telemetry client initialized successfully', {
        startup_phase: 'initialization_complete',
        initialization_time_ms: Date.now() - this.startTime
      });

      await this.writeLog('info', 'Log pipeline test - this message should reach Dash0', {
        test_type: 'log_pipeline_validation',
        fluent_bit_enabled: this.config.logging.enabled,
        fluentd_host: this.config.logging.fluentdHost,
        fluentd_port: this.config.logging.fluentdPort
      });

      console.log('✅ Startup logs written successfully');
    } catch (error) {
      console.error('❌ Failed to write startup logs:', error);
    }
  }
}

/**
 * Create telemetry client for any service type
 */
export function createTelemetryClient(serviceType: 'api' | 'webhook' | 'machine' | 'worker'): EmpTelemetryClient {
  console.log(`🚀 createTelemetryClient: Creating telemetry client for service type: ${serviceType}`);
  const configManager = new TelemetryConfigManager({ serviceType });
  const client = new EmpTelemetryClient(configManager);
  console.log(`✅ createTelemetryClient: Telemetry client created successfully`);
  return client;
}