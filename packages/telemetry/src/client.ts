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
   * Generate telemetry infrastructure configurations and start nginx
   * Creates nginx, Fluent Bit, and OTEL collector configs and starts nginx proxy
   */
  private async setupFluentdProxy(): Promise<void> {
    console.log('🔧 TelemetryClient: Generating telemetry infrastructure configurations');
    console.log('📋 TelemetryClient: Environment:', this.config.environment);
    console.log('📋 TelemetryClient: Service Type:', this.config.serviceType);
    console.log('📋 TelemetryClient: Fluentd Target:', `${this.config.logging.fluentdHost}:${this.config.logging.fluentdPort}`);
    
    try {
      // Generate all configurations
      await this.generateTelemetryConfigs();
      console.log('✅ TelemetryClient: Telemetry configurations generated at /tmp/telemetry/');
      
      // Start nginx proxy for Forward protocol
      await this.startNginxProxy();
      
      // For all services using enhanced TelemetryClient, start OTEL Collector and Fluent Bit processes
      if (this.config.serviceType === 'machine' || this.config.serviceType === 'api' || this.config.serviceType === 'webhook') {
        console.log(`🔧 TelemetryClient: ${this.config.serviceType} service - starting telemetry processes`);
        
        console.log(`🔍 TelemetryClient DEBUG: OTEL_ENABLED=${process.env.OTEL_ENABLED}, config.otel.enabled=${this.config.otel.enabled}`);
        
        if (this.config.otel.enabled) {
          await this.startOtelCollector();
          console.log(`✅ TelemetryClient: OTEL Collector started - THIS IS THE NEW CODE!`);
        } else {
          console.log(`⚠️  TelemetryClient: OTEL Collector disabled (OTEL_ENABLED=false) - THIS IS THE NEW CODE!`);
        }
        
        await this.startFluentBit();
        console.log(`✅ TelemetryClient: Telemetry processes started for ${this.config.serviceType} service`);
      }
      
      console.log('📋 TelemetryClient: Fluent Bit will send to localhost:24224');
      console.log('📋 TelemetryClient: nginx will proxy to', `${this.config.logging.fluentdHost}:${this.config.logging.fluentdPort}`);
    } catch (error) {
      console.error('❌ TelemetryClient: Failed to setup telemetry infrastructure:', error);
      console.error('❌ TelemetryClient: Error details:', {
        message: error.message,
        stack: error.stack,
        code: error.code
      });
      // Don't throw - allow service to start without telemetry
      console.warn('⚠️ TelemetryClient: Continuing without telemetry infrastructure');
      console.warn('⚠️ TelemetryClient: Service will run but logs won\'t be forwarded to Dash0');
    }
  }

  /**
   * Generate all telemetry configuration files
   */
  private async generateTelemetryConfigs(): Promise<void> {
    const configDir = '/tmp/telemetry';
    console.log('📁 TelemetryClient: Creating config directory:', configDir);
    
    try {
      // Create directory
      await fs.mkdir(configDir, { recursive: true });
      console.log('✅ TelemetryClient: Config directory created');
    } catch (error) {
      console.error('❌ TelemetryClient: Failed to create config directory:', error);
      throw error;
    }
    
    try {
      // Generate nginx config for Forward protocol proxy
      console.log('🔧 TelemetryClient: Generating nginx config...');
      const nginxConfig = this.generateNginxConfig();
      await fs.writeFile(`${configDir}/nginx.conf`, nginxConfig, 'utf8');
      console.log('✅ TelemetryClient: Generated nginx.conf');
      console.log('📋 TelemetryClient: nginx routes localhost:24224 →', `${this.config.logging.fluentdHost}:${this.config.logging.fluentdPort}`);
    } catch (error) {
      console.error('❌ TelemetryClient: Failed to generate nginx.conf:', error);
      throw error;
    }
    
    try {
      // Generate Fluent Bit config
      console.log('🔧 TelemetryClient: Generating Fluent Bit config...');
      const fluentBitConfig = this.generateFluentBitConfig();
      await fs.writeFile(`${configDir}/fluent-bit.conf`, fluentBitConfig, 'utf8');
      console.log('✅ TelemetryClient: Generated fluent-bit.conf');
      console.log('📋 TelemetryClient: Fluent Bit will monitor:', this.logFilePath);
    } catch (error) {
      console.error('❌ TelemetryClient: Failed to generate fluent-bit.conf:', error);
      throw error;
    }
    
    try {
      // Generate OTEL Collector config
      console.log('🔧 TelemetryClient: Generating OTEL Collector config...');
      const otelConfig = this.generateOtelCollectorConfig();
      await fs.writeFile(`${configDir}/otel-collector.yaml`, otelConfig, 'utf8');
      console.log('✅ TelemetryClient: Generated otel-collector.yaml');
      console.log('📋 TelemetryClient: OTEL will export to:', this.config.dash0.tracesEndpoint);
    } catch (error) {
      console.error('❌ TelemetryClient: Failed to generate otel-collector.yaml:', error);
      throw error;
    }
  }

  private generateNginxConfig(): string {
    const targetHost = this.config.logging.fluentdHost;
    const targetPort = this.config.logging.fluentdPort;
    const useSSL = this.config.logging.fluentdSecure;
    
    return `# nginx TCP Stream Proxy for Fluent Bit Forward Protocol
# Generated by EMP TelemetryClient
# Routes localhost:24224 → ${targetHost}:${targetPort}

# Load stream module (required for dynamic module)
load_module /usr/lib/nginx/modules/ngx_stream_module.so;

events {
    worker_connections 1024;
}

stream {
    # DNS resolver for external domains
    resolver 8.8.8.8 8.8.4.4 valid=300s;
    resolver_timeout 5s;
    
    # Forward Protocol Proxy to Production Fluentd
    upstream fluentd_target {
        server ${targetHost}:${targetPort};
    }
    
    server {
        listen 24224;
        proxy_pass fluentd_target;
        proxy_timeout 30s;
        proxy_connect_timeout 10s;
        proxy_responses 1;
        ${useSSL ? 'proxy_ssl on;' : ''}
        
        # Logging (error log only for stream module)
        error_log /var/log/nginx/fluentd_forward_error.log warn;
    }
}`;
  }

  /**
   * Generate Fluent Bit configuration with prominent source identification
   */
  private generateFluentBitConfig(): string {
    const serviceType = this.config.serviceType;
    const logPath = this.logFilePath;
    const serviceName = this.config.serviceName;
    const machineId = this.config.machineId;
    
    return `# Fluent Bit Configuration - Generated by TelemetryClient
# Service: ${serviceName} | Machine: ${machineId} | Log File: ${logPath}
[SERVICE]
    Flush 5
    Log_Level info
    Daemon off

# Collect ${serviceType} log files from ${logPath}
[INPUT]
    Name tail
    Tag ${serviceType}.logs
    Path ${logPath}
    Skip_Long_Lines On
    Skip_Empty_Lines On
    Refresh_Interval 5

# Add prominent source metadata for clear identification in Dash0
[FILTER]
    Name record_modifier
    Match ${serviceType}.*
    Record service_name ${serviceName}
    Record service_version ${this.config.otel.serviceVersion || '1.0.0'}
    Record service_type ${serviceType}
    Record environment ${this.config.environment}
    Record machine_id ${machineId}
    Record log_file_path ${logPath}
    Record telemetry_source fluent-bit-file-tail
    Record pipeline_stage file-to-fluentd-forward
    Record source_identification ${serviceName}:${machineId}:${logPath}

# Send to local nginx proxy (which forwards to Fluentd)
[OUTPUT]
    Name forward
    Match ${serviceType}.*
    Host localhost
    Port 24224
    tls off`;
  }

  /**
   * Start OTEL Collector process using generated config
   */
  private async startOtelCollector(): Promise<void> {
    console.log('🔧 TelemetryClient: Starting OTEL Collector process');
    
    const configFile = '/tmp/telemetry/otel-collector.yaml';
    
    try {
      // Import spawn for running OTEL Collector
      const { spawn } = await import('child_process');
      
      // Start OTEL Collector with the generated configuration
      const otelProcess = spawn('otelcol-contrib', [
        '--config', configFile
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false
      });
      
      // Log OTEL Collector output
      if (otelProcess.stdout) {
        otelProcess.stdout.on('data', (data) => {
          console.log('📋 OTEL Collector stdout:', data.toString().trim());
        });
      }
      
      if (otelProcess.stderr) {
        otelProcess.stderr.on('data', (data) => {
          console.log('📋 OTEL Collector stderr:', data.toString().trim());
        });
      }
      
      // Handle OTEL Collector process events
      otelProcess.on('error', (error) => {
        console.error('❌ TelemetryClient: OTEL Collector process error:', error);
      });
      
      otelProcess.on('exit', (code, signal) => {
        if (code !== 0) {
          console.error(`❌ TelemetryClient: OTEL Collector exited with code ${code}, signal ${signal}`);
        } else {
          console.log('✅ TelemetryClient: OTEL Collector process exited normally');
        }
      });
      
      // Give OTEL Collector a moment to start
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      console.log('✅ TelemetryClient: OTEL Collector started successfully');
      console.log('📋 TelemetryClient: OTEL Collector listening on localhost:4318');
      
    } catch (error) {
      console.error('❌ TelemetryClient: Failed to start OTEL Collector:', error);
      throw error;
    }
  }

  /**
   * Start Fluent Bit process using generated config
   */
  private async startFluentBit(): Promise<void> {
    console.log('🔧 TelemetryClient: Starting Fluent Bit process');
    
    const configFile = '/tmp/telemetry/fluent-bit.conf';
    
    try {
      // Import spawn for running Fluent Bit
      const { spawn } = await import('child_process');
      
      // Start Fluent Bit with the generated configuration
      const fluentBitProcess = spawn('/opt/fluent-bit/bin/fluent-bit', [
        '-c', configFile
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false
      });
      
      // Log Fluent Bit output
      if (fluentBitProcess.stdout) {
        fluentBitProcess.stdout.on('data', (data) => {
          console.log('📋 Fluent Bit stdout:', data.toString().trim());
        });
      }
      
      if (fluentBitProcess.stderr) {
        fluentBitProcess.stderr.on('data', (data) => {
          console.log('📋 Fluent Bit stderr:', data.toString().trim());
        });
      }
      
      // Handle Fluent Bit process events
      fluentBitProcess.on('error', (error) => {
        console.error('❌ TelemetryClient: Fluent Bit process error:', error);
      });
      
      fluentBitProcess.on('exit', (code, signal) => {
        if (code !== 0) {
          console.error(`❌ TelemetryClient: Fluent Bit exited with code ${code}, signal ${signal}`);
        } else {
          console.log('✅ TelemetryClient: Fluent Bit process exited normally');
        }
      });
      
      // Give Fluent Bit a moment to start
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log('✅ TelemetryClient: Fluent Bit started successfully');
      console.log('📋 TelemetryClient: Fluent Bit monitoring log files and sending to nginx proxy');
      
    } catch (error) {
      console.error('❌ TelemetryClient: Failed to start Fluent Bit:', error);
      throw error;
    }
  }

  /**
   * Start nginx proxy for Forward protocol routing
   */
  private async startNginxProxy(): Promise<void> {
    console.log('🔧 TelemetryClient: Starting nginx proxy for Forward protocol');
    
    try {
      // Import spawn for running nginx
      const { spawn } = await import('child_process');
      
      // Start nginx with the generated configuration
      const nginxProcess = spawn('nginx', [
        '-c', '/tmp/telemetry/nginx.conf',
        '-g', 'daemon off;'
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false
      });
      
      // Log nginx output
      if (nginxProcess.stdout) {
        nginxProcess.stdout.on('data', (data) => {
          console.log('📋 nginx stdout:', data.toString().trim());
        });
      }
      
      if (nginxProcess.stderr) {
        nginxProcess.stderr.on('data', (data) => {
          console.log('📋 nginx stderr:', data.toString().trim());
        });
      }
      
      // Handle nginx process events
      nginxProcess.on('error', (error) => {
        console.error('❌ TelemetryClient: nginx process error:', error);
      });
      
      nginxProcess.on('exit', (code, signal) => {
        if (code !== 0) {
          console.error(`❌ TelemetryClient: nginx exited with code ${code}, signal ${signal}`);
        } else {
          console.log('✅ TelemetryClient: nginx process exited normally');
        }
      });
      
      // Give nginx a moment to start
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log('✅ TelemetryClient: nginx proxy started successfully');
      console.log('📋 TelemetryClient: Forward protocol proxy active on localhost:24224');
      console.log('📋 TelemetryClient: Proxying to production Fluentd at', `${this.config.logging.fluentdHost}:${this.config.logging.fluentdPort}`);
      
    } catch (error) {
      console.error('❌ TelemetryClient: Failed to start nginx proxy:', error);
      throw error;
    }
  }

  /**
   * Generate OTEL Collector configuration with enhanced source identification
   */
  private generateOtelCollectorConfig(): string {
    const dash0ApiKey = this.config.dash0.apiKey;
    const dash0Endpoint = this.config.dash0.tracesEndpoint;
    const serviceName = this.config.serviceName;
    const machineId = this.config.machineId;
    
    return `# OTEL Collector Configuration - Generated by TelemetryClient
# Service: ${serviceName} | Machine: ${machineId} | Log File: ${this.logFilePath}
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318
      grpc:
        endpoint: 0.0.0.0:4317

processors:
  batch:
    timeout: 10s
    send_batch_size: 100
  
  # Add resource attributes for prominent source identification
  resource:
    attributes:
      - key: service.instance.id
        value: "${machineId}"
        action: upsert
      - key: service.name
        value: "${serviceName}"
        action: upsert
      - key: service.type
        value: "${this.config.serviceType}"
        action: upsert
      - key: deployment.environment
        value: "${this.config.environment}"
        action: upsert
      - key: telemetry.log_file
        value: "${this.logFilePath}"
        action: upsert
      - key: telemetry.source_identification
        value: "${serviceName}:${machineId}:${this.logFilePath}"
        action: upsert

exporters:
  otlp:
    endpoint: ${dash0Endpoint}
    headers:
      "Authorization": "Bearer ${dash0ApiKey}"
      "Dash0-Dataset": "${this.config.dash0.dataset}"
    tls:
      insecure: false

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [resource, batch]
      exporters: [otlp]
    metrics:
      receivers: [otlp]
      processors: [resource, batch]
      exporters: [otlp]
    logs:
      receivers: [otlp]
      processors: [resource, batch]
      exporters: [otlp]`;
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

    // Setup Fluentd proxy for production routing
    if (this.config.logging.enabled) {
      await this.setupFluentdProxy();
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
            // Prominent source identification
            { key: "service.name", value: { stringValue: this.config.serviceName }},
            { key: "service.instance.id", value: { stringValue: this.config.machineId }},
            { key: "service.type", value: { stringValue: this.config.serviceType }},
            { key: "deployment.environment", value: { stringValue: this.config.environment }},
            { key: "telemetry.log_file", value: { stringValue: this.logFilePath }},
            { key: "telemetry.source_identification", value: { stringValue: `${this.config.serviceName}:${this.config.machineId}:${this.logFilePath}` }},
            // Backwards compatibility
            { key: "machine.id", value: { stringValue: this.config.machineId }}
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
                  { key: "service.type", value: { stringValue: this.config.serviceType }},
                  { key: "source_identification", value: { stringValue: `${this.config.serviceName}:${this.config.machineId}` }}
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
        await this.writeLog('info', `🔍 VALIDATION: Log file monitoring started for ${filePath}`, {
          log_file_path: filePath,
          tag: tag || this.config.serviceName,
          fluent_bit_monitoring: true,
          validation_type: 'log_file_creation',
          expected_pipeline: 'file → fluent-bit → fluentd → dash0'
        });
        
        console.log(`✅ Log file added and validation entry written: ${filePath}`);
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
            // Prominent source identification
            { key: "service.name", value: { stringValue: this.config.serviceName }},
            { key: "service.instance.id", value: { stringValue: this.config.machineId }},
            { key: "service.type", value: { stringValue: this.config.serviceType }},
            { key: "deployment.environment", value: { stringValue: this.config.environment }},
            { key: "telemetry.log_file", value: { stringValue: this.logFilePath }},
            { key: "telemetry.source_identification", value: { stringValue: `${this.config.serviceName}:${this.config.machineId}:${this.logFilePath}` }},
            // Backwards compatibility
            { key: "machine.id", value: { stringValue: this.config.machineId }}
          ]
        },
        scopeMetrics: [{
          metrics: [{
            name,
            description: `Custom metric: ${name}`,
            unit,
            gauge: {
              dataPoints: [{
                attributes: [
                  // Include source identification in metric attributes
                  { key: "source_identification", value: { stringValue: `${this.config.serviceName}:${this.config.machineId}` }},
                  ...Object.entries(attributes).map(([key, value]) => ({
                    key,
                    value: { stringValue: value }
                  }))
                ],
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
   * Write a log entry to the configured log file with prominent source identification
   * This will be picked up by Fluent Bit and sent to Fluentd → Dash0
   */
  async writeLog(level: 'info' | 'warn' | 'error' | 'debug', message: string, context: Record<string, any> = {}): Promise<void> {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      // Prominent source identification fields
      service_name: this.config.serviceName,
      service_type: this.config.serviceType,
      machine_id: this.config.machineId,
      environment: this.config.environment,
      log_file_path: this.logFilePath,
      telemetry_source: 'emp-telemetry-client',
      source_identification: `${this.config.serviceName}:${this.config.machineId}:${this.logFilePath}`,
      // Original service field for backwards compatibility
      service: this.config.serviceName,
      ...context
    };

    const logLine = JSON.stringify(logEntry) + '\n';

    try {
      // Ensure log directory exists
      await fs.mkdir(dirname(this.logFilePath), { recursive: true });
      
      // Append to log file
      await fs.appendFile(this.logFilePath, logLine);
      
      console.log(`📝 Log written to ${this.logFilePath}: ${level.toUpperCase()} - ${message}`);
      console.log(`🔍 Source: ${this.config.serviceName}:${this.config.machineId} → Fluent Bit → ${this.config.logging.fluentdHost}:${this.config.logging.fluentdPort}`);
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
      await this.writeLog('info', '🚀 VALIDATION: Telemetry client initialized successfully', {
        startup_phase: 'initialization_complete',
        initialization_time_ms: Date.now() - this.startTime,
        validation_type: 'telemetry_startup',
        expected_pipeline: 'file → fluent-bit → fluentd → dash0'
      });

      await this.writeLog('info', '📋 VALIDATION: File-based log pipeline test - this message should reach Dash0', {
        test_type: 'log_pipeline_validation',
        fluent_bit_enabled: this.config.logging.enabled,
        fluentd_host: this.config.logging.fluentdHost,
        fluentd_port: this.config.logging.fluentdPort,
        validation_type: 'pipeline_test',
        expected_result: 'This log should appear in Dash0 logs section with fluent-bit-file-tail source'
      });

      console.log('✅ Startup logs written successfully');
      
      // Add a monitoring log to show the pipeline is active
      setTimeout(async () => {
        await this.writeLog('info', '🔄 MONITORING: 30-second pipeline check - if you see this in Dash0, the file pipeline is working!', {
          monitoring_type: 'pipeline_health_check',
          file_path: this.logFilePath,
          fluent_bit_config: `watching /api-server/logs/*.log`,
          expected_flow: 'file → fluent-bit (HTTP) → fluentd → dash0'
        });
      }, 30000); // 30 seconds after startup
      
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