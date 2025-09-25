/**
 * Unified Telemetry Client
 *
 * Local logging only - simplified for direct file logging
 */

import { TelemetryConfigManager, type TelemetryConfig } from './config.js';
import { TelemetryConnectionManager, type PipelineHealth } from './connections.js';
import { promises as fs, readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

export interface TelemetryStartupOptions {
  testConnections?: boolean;
  logConfiguration?: boolean;
  sendStartupPing?: boolean;
}

export interface TelemetryLogInterface {
  info(message: string, context?: Record<string, any>): Promise<void>;
  warn(message: string, context?: Record<string, any>): Promise<void>;
  error(message: string, context?: Record<string, any>): Promise<void>;
  debug(message: string, context?: Record<string, any>): Promise<void>;
  addFile(filePath: string, tag?: string): Promise<void>;
}

export interface TelemetryOTelInterface {
  gauge(metricName: string, value: number, labels?: Record<string, string>, unit?: string): Promise<void>;
}

export class EmpTelemetryClient {
  private configManager: TelemetryConfigManager;
  private connectionManager: TelemetryConnectionManager;
  private config: TelemetryConfig;
  private startTime: number;
  private logFilePaths: Array<{path: string, tag?: string}>;

  constructor(configManager: TelemetryConfigManager) {
    this.startTime = Date.now();
    console.log(`🔧 EmpTelemetryClient: Instantiating telemetry client for local logging`);
    this.configManager = configManager;
    this.config = configManager.getConfig();
    console.log(`✅ EmpTelemetryClient: Configuration retrieved`);
    this.connectionManager = new TelemetryConnectionManager(this.config);
    console.log(`✅ EmpTelemetryClient: Connection manager created`);

    // Set default log file path based on service type
    const defaultLogPath = this.getDefaultLogFilePath();
    this.logFilePaths = [{path: defaultLogPath, tag: this.config.serviceType}];
    console.log(`📁 EmpTelemetryClient: Default log file: ${defaultLogPath}`);

    // For machine services, also collect telemetry logs from external services
    if (this.config.serviceType === 'machine') {
      this.addExternalServiceTelemetryLogs();
    }
  }

  private getDefaultLogFilePath(): string {
    // Direct logging approach - no external dependency
    const baseDir = this.config.logging.logDir ||
      (this.config.serviceType === 'api' ? '/api-server/logs' : '/logs');
    return `${baseDir}/${this.config.serviceName}-${this.config.serviceType}.log`;
  }

  /**
   * Add telemetry logs from external services (OpenAI, etc.) for machine services
   */
  private addExternalServiceTelemetryLogs(): void {
    try {
      console.log('🔍 TelemetryClient: Looking for external services telemetry logs...');

      // Parse WORKERS environment variable (e.g., "openai:1,comfyui:2")
      const workersEnv = process.env.WORKERS;
      if (!workersEnv) {
        console.log('📋 TelemetryClient: No WORKERS configured, skipping external service logs');
        return;
      }

      console.log(`📋 TelemetryClient: WORKERS environment: ${workersEnv}`);

      // Load service mapping configuration
      const serviceMapping = this.loadServiceMapping();
      if (!serviceMapping) {
        console.warn('⚠️ TelemetryClient: Could not load service mapping, skipping external service logs');
        return;
      }

      // Parse worker configurations (e.g., "openai:1" -> worker type "openai")
      const workers = workersEnv.split(',').map(w => w.trim().split(':')[0]);
      console.log(`📋 TelemetryClient: Parsed workers: ${workers.join(', ')}`);

      let addedCount = 0;

      // For each worker type, find its services and collect telemetry logs
      for (const workerType of workers) {
        const workerConfig = serviceMapping.workers[workerType];
        if (!workerConfig) {
          console.log(`📋 TelemetryClient: No configuration found for worker type: ${workerType}`);
          continue;
        }

        console.log(`📋 TelemetryClient: Processing worker ${workerType} with services: ${workerConfig.services.join(', ')}`);

        // For each service in this worker, collect telemetry logs
        for (const serviceName of workerConfig.services) {
          const serviceConfig = serviceMapping.services[serviceName];
          if (!serviceConfig) {
            console.log(`📋 TelemetryClient: No service configuration found for: ${serviceName}`);
            continue;
          }

          // Only process external services with telemetry_logs
          if (serviceConfig.type === 'external' && serviceConfig.telemetry_logs) {
            console.log(`📋 TelemetryClient: Found external service ${serviceName} with ${serviceConfig.telemetry_logs.length} telemetry logs`);

            for (const telemetryLog of serviceConfig.telemetry_logs) {
              this.logFilePaths.push({
                path: telemetryLog.path,
                tag: telemetryLog.name
              });
              addedCount++;
              console.log(`✅ TelemetryClient: Added telemetry log: ${telemetryLog.path} (tag: ${telemetryLog.name})`);
            }
          }
        }
      }

      console.log(`✅ TelemetryClient: Added ${addedCount} external service telemetry logs`);

    } catch (error) {
      console.error('❌ TelemetryClient: Failed to add external service telemetry logs:', error);
      console.warn('⚠️ TelemetryClient: Continuing without external service logs');
    }
  }

  /**
   * Load service mapping configuration from expected paths
   */
  private loadServiceMapping(): any {
    try {
      // Get the current directory for ES modules
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);

      // Try common paths where service-mapping.json might be located
      const possiblePaths = [
        '/workspace/service-mapping.json',
        '/app/service-mapping.json',
        '/service-manager/src/config/service-mapping.json', // This is where the container has it
        process.env.SERVICE_MAPPING_PATH,
        join(process.cwd(), 'service-mapping.json'),
        join(process.cwd(), 'src/config/service-mapping.json'),
        join(__dirname, '../../../apps/machine/src/config/service-mapping.json')
      ].filter(Boolean);

      for (const configPath of possiblePaths) {
        try {
          if (existsSync(configPath)) {
            console.log(`📁 TelemetryClient: Loading service mapping from: ${configPath}`);
            const content = readFileSync(configPath, 'utf8');
            return JSON.parse(content);
          }
        } catch (error) {
          console.log(`📋 TelemetryClient: Could not load service mapping from ${configPath}: ${error.message}`);
        }
      }

      console.warn('⚠️ TelemetryClient: Service mapping file not found in any expected location');
      console.log('📋 TelemetryClient: Searched paths:', possiblePaths.join(', '));
      return null;

    } catch (error) {
      console.error('❌ TelemetryClient: Error loading service mapping:', error);
      return null;
    }
  }

  /**
   * Setup local logging only
   */
  private async setupLocalLogging(): Promise<void> {
    console.log('🔧 TelemetryClient: Setting up local file logging');
    console.log('📋 TelemetryClient: Environment:', this.config.environment);
    console.log('📋 TelemetryClient: Service Type:', this.config.serviceType);
    console.log('📁 TelemetryClient: Log directory:', this.getDefaultLogFilePath());

    // Create log directory if needed
    try {
      const logDir = dirname(this.getDefaultLogFilePath());
      await fs.mkdir(logDir, { recursive: true });
      console.log('✅ TelemetryClient: Log directory ensured');
    } catch (error) {
      console.warn('⚠️ TelemetryClient: Could not create log directory:', error);
    }

    console.log('📋 TelemetryClient: Local logging configured - no external services');
  }

  /**
   * Initialize telemetry client and test connections
   */
  async startup(options: TelemetryStartupOptions = {}): Promise<PipelineHealth | null> {
    const {
      testConnections = true,
      logConfiguration = true,
      sendStartupPing = false, // Disabled for local logging
    } = options;

    console.log('🚀 Initializing EMP Telemetry Client (Local Logging)...');

    // Log configuration
    if (logConfiguration) {
      this.configManager.logConfiguration();
    }

    // Setup local logging
    if (this.config.logging.enabled) {
      await this.setupLocalLogging();
    }

    // Test connections (OTEL only if enabled)
    let pipelineHealth: PipelineHealth | null = null;
    if (testConnections) {
      pipelineHealth = await this.connectionManager.testPipeline();
      this.logPipelineHealth(pipelineHealth);
    }

    // Write startup logs to demonstrate local logging
    if (this.config.logging.enabled) {
      try {
        await this.writeStartupLogs();
        console.log('✅ Startup logs written to file');
      } catch (error) {
        console.warn('⚠️ Failed to write startup logs:', error);
      }
    }

    // Send startup metric with initialization time (OTEL only if enabled)
    const initializationTime = Date.now() - this.startTime;

    if (this.config.otel.enabled) {
      try {
        console.log('📊 Telemetry initialization completed with OTEL');
        // Could send startup metric here if OTEL collector is configured
      } catch (error) {
        console.warn('⚠️ Failed to send startup metric:', error);
      }
    }

    console.log('✅ Telemetry client initialization complete (Local Logging)');
    return pipelineHealth;
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
       * Add a log file to be monitored
       * @param filePath - Path to the log file to monitor
       * @param tag - Optional tag for the logs (defaults to service name)
       */
      addFile: async (filePath: string, tag?: string) => {
        console.log(`📁 Adding log file to monitoring: ${filePath}`);

        // Check if file is already being monitored
        const existing = this.logFilePaths.find(f => f.path === filePath);
        if (!existing) {
          this.logFilePaths.push({path: filePath, tag: tag || this.config.serviceName});
          console.log(`✅ Added ${filePath} to monitoring list (${this.logFilePaths.length} total files)`);
        } else {
          console.log(`📋 File ${filePath} already being monitored`);
        }

        // Check if path contains wildcard characters
        const isWildcardPath = filePath.includes('*') || filePath.includes('?');

        if (!isWildcardPath) {
          // For regular paths, ensure directory exists and write test log
          try {
            await fs.mkdir(dirname(filePath), { recursive: true });
            console.log(`✅ Log directory created/verified: ${dirname(filePath)}`);
          } catch (error) {
            console.error(`❌ Failed to create log directory: ${error}`);
          }

          // Write a test log to the specific file
          await this.writeLogToFile(filePath, 'info', `🔍 VALIDATION: Local log file created for ${filePath}`, {
            log_file_path: filePath,
            tag: tag || this.config.serviceName,
            local_logging: true,
            validation_type: 'log_file_creation',
            expected_pipeline: 'local file logging only'
          });
        }

        console.log(`✅ Log file added to monitoring: ${filePath}`);
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
   * OTEL interface - clean API for OpenTelemetry metrics
   */
  get otel() {
    return {
      /**
       * Send a gauge metric
       * @param metricName - Name of the metric
       * @param value - Metric value
       * @param labels - Optional labels for the metric
       * @param unit - Optional unit for the metric
       */
      gauge: async (metricName: string, value: number, labels?: Record<string, string>, unit?: string) => {
        // If OTEL is disabled, just log the metric locally for debugging
        if (!this.config.otel.enabled) {
          console.log(`📊 OTEL disabled - metric ${metricName}: ${value} ${unit || ''} (labels: ${JSON.stringify(labels || {})})`);
          return;
        }

        // In a real OTEL implementation, this would send to the collector
        // For now, we'll just log it since OTEL collector integration is optional
        // Commented out to reduce log spam in development
        // console.log(`📊 OTEL metric - ${metricName}: ${value} ${unit || ''} (labels: ${JSON.stringify(labels || {})})`);

        try {
          await this.writeLog('info', `📊 OTEL Metric: ${metricName}`, {
            metric_name: metricName,
            value,
            labels: labels || {},
            unit: unit || 'count',
            otel_enabled: this.config.otel.enabled,
            validation_type: 'otel_metric'
          });
        } catch (error) {
          // Also commenting out warning to reduce spam
          // console.warn(`⚠️ Could not log OTEL metric ${metricName}:`, error.message);
        }
      }
    };
  }

  /**
   * Set custom log file path for this client (legacy - adds to array)
   */
  setLogFile(filePath: string): void {
    // Clear existing files and set new primary file
    this.logFilePaths = [{path: filePath, tag: this.config.serviceType}];
    console.log(`📁 Primary log file path updated: ${filePath}`);
  }

  /**
   * Get current primary log file path (legacy - returns first file)
   */
  getLogFile(): string {
    return this.logFilePaths[0]?.path || '';
  }

  /**
   * Write a log entry to a specific log file
   */
  async writeLogToFile(filePath: string, level: 'info' | 'warn' | 'error' | 'debug', message: string, context: Record<string, any> = {}): Promise<void> {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      service_name: this.config.serviceName,
      service_type: this.config.serviceType,
      machine_id: this.config.machineId,
      environment: this.config.environment,
      log_file_path: filePath,
      telemetry_source: 'emp-telemetry-client',
      source_identification: `${this.config.serviceName}:${this.config.machineId}:${filePath}`,
      service: this.config.serviceName,
      ...context
    };

    const logLine = JSON.stringify(logEntry) + '\n';

    try {
      await fs.mkdir(dirname(filePath), { recursive: true });
      await fs.appendFile(filePath, logLine);
      // Commented out to reduce log spam
      // console.log(`📝 Log written to ${filePath}: ${level.toUpperCase()} - ${message}`);
    } catch (error) {
      console.error(`❌ Failed to write log to ${filePath}:`, error);
    }
  }

  /**
   * Write a log entry to the configured log file
   * Local logging only - no external services
   */
  async writeLog(level: 'info' | 'warn' | 'error' | 'debug', message: string, context: Record<string, any> = {}): Promise<void> {
    const primaryLogFile = this.logFilePaths[0]?.path;
    if (!primaryLogFile) {
      console.warn('⚠️ No log files configured for writeLog');
      return;
    }

    // Use the writeLogToFile helper
    await this.writeLogToFile(primaryLogFile, level, message, {
      ...context,
      source_identification: `${this.config.serviceName}:${this.config.machineId}:${primaryLogFile}`
    });

    // Commented out to reduce log spam
    // console.log(`🔍 Source: ${this.config.serviceName}:${this.config.machineId} → Local file: ${primaryLogFile}`);
  }

  /**
   * Write startup logs to demonstrate the log pipeline
   */
  async writeStartupLogs(): Promise<void> {
    console.log('📝 Writing startup logs to demonstrate local logging...');

    try {
      await this.writeLog('info', '🚀 VALIDATION: Telemetry client initialized successfully', {
        startup_phase: 'initialization_complete',
        initialization_time_ms: Date.now() - this.startTime,
        validation_type: 'telemetry_startup',
        expected_pipeline: 'local file logging only'
      });

      await this.writeLog('info', '📋 VALIDATION: Local logging test - message written to local file', {
        test_type: 'local_log_validation',
        logging_enabled: this.config.logging.enabled,
        validation_type: 'local_logging_test',
        expected_result: 'This log is written to local file only - no external forwarding'
      });

      console.log('✅ Startup logs written successfully');

      // Add a monitoring log to show the pipeline is active
      setTimeout(async () => {
        await this.writeLog('info', '🔄 MONITORING: 30-second local logging check - logs written to local file', {
          monitoring_type: 'local_logging_health_check',
          file_path: this.logFilePaths[0]?.path || 'unknown',
          logging_approach: 'local file writing only',
          expected_flow: 'local file logging'
        });
      }, 30000); // 30 seconds after startup

    } catch (error) {
      console.error('❌ Failed to write startup logs:', error);
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
    } else {
      console.log(`  OTEL Collector: disabled`);
    }

    console.log(`  Local Logging: ✅ enabled`);
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

}

/**
 * Create telemetry client for any service type
 */
export function createTelemetryClient(serviceType: 'api' | 'webhook' | 'machine' | 'worker'): EmpTelemetryClient {
  console.log(`🚀 createTelemetryClient: Creating telemetry client for service type: ${serviceType} (local logging)`);
  const configManager = new TelemetryConfigManager({ serviceType });
  const client = new EmpTelemetryClient(configManager);
  console.log(`✅ createTelemetryClient: Telemetry client created successfully`);
  return client;
}