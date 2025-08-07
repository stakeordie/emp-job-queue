// Logging Integration Example
// Demonstrates how to integrate the new structured logging system with existing workers

import { ConnectorLogger, FluentBitTransport } from '@emp/core';

// Example 1: Basic ConnectorLogger usage in a connector
export class ExampleConnector {
  private logger: ConnectorLogger;

  constructor(connectorId: string) {
    // Initialize with worker context
    this.logger = new ConnectorLogger({
      machineId: process.env.MACHINE_ID || 'local-machine',
      workerId: process.env.WORKER_ID || 'worker-001',
      serviceType: 'comfyui',
      connectorId,
    });
  }

  async processJob(jobId: string, jobData: any): Promise<void> {
    const jobLogger = this.logger.withJobContext(jobId);
    
    try {
      // Log job received
      jobLogger.jobReceived({
        jobId,
        model: jobData.model,
        inputSize: JSON.stringify(jobData).length,
      });

      // Simulate processing
      jobLogger.jobStarted({ jobId });
      
      // Simulate progress updates
      for (let progress = 0; progress <= 100; progress += 25) {
        await new Promise(resolve => setTimeout(resolve, 100));
        jobLogger.jobProgress({ 
          jobId, 
          progress,
          execution_step: `Step ${progress / 25 + 1}`,
        });
      }

      // Log completion
      jobLogger.jobCompleted({
        jobId,
        duration: 400, // ms
        outputSize: 1024,
      });

    } catch (error) {
      jobLogger.jobFailed({
        jobId,
        error: error.message,
        duration: 200,
      });
      throw error;
    }
  }

  async healthCheck(): Promise<void> {
    try {
      // Simulate health check
      const isHealthy = Math.random() > 0.1; // 90% chance of being healthy
      
      if (isHealthy) {
        this.logger.healthCheck('healthy', {
          api_available: true,
          models_loaded: 5,
          queue_size: 0,
          vram_usage: 4096,
        });
      } else {
        this.logger.healthCheck('unhealthy', {
          error: 'Service unavailable',
          api_available: false,
        });
      }
    } catch (error) {
      this.logger.healthCheck('unhealthy', {
        error: error.message,
      });
    }
  }

  // Connector-specific events
  onWebSocketMessage(messageType: string, data: any): void {
    this.logger.debug('WebSocket message received', {
      event_type: 'websocket_message',
      websocket_message_type: messageType,
      prompt_id: data.prompt_id,
      client_id: data.client_id,
    });
  }

  onModelLoad(modelName: string, loadTime: number): void {
    this.logger.info('Model loaded', {
      event_type: 'model_loaded',
      model_name: modelName,
      load_time_ms: loadTime,
    });
  }
}

// Example 2: Standalone logging for utility functions
export class WorkerUtilities {
  private static logger = new ConnectorLogger({
    machineId: process.env.MACHINE_ID || 'local-machine',
    workerId: process.env.WORKER_ID || 'worker-001', 
    serviceType: 'utility',
    connectorId: 'worker-utils',
  });

  static async downloadModel(modelUrl: string, modelName: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Model download started', {
        event_type: 'model_download_start',
        model_name: modelName,
        model_url: modelUrl,
      });

      // Simulate download with progress
      for (let progress = 0; progress <= 100; progress += 10) {
        await new Promise(resolve => setTimeout(resolve, 50));
        this.logger.debug('Download progress', {
          event_type: 'model_download_progress',
          model_name: modelName,
          progress,
          bytes_downloaded: progress * 1024 * 1024, // Simulated bytes
        });
      }

      const duration = Date.now() - startTime;
      this.logger.info('Model download completed', {
        event_type: 'model_download_complete',
        model_name: modelName,
        duration,
        file_size: 1024 * 1024 * 100, // 100MB simulated
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Model download failed', error, {
        event_type: 'model_download_failed',
        model_name: modelName,
        duration,
        error_type: error.code || 'download_error',
      });
      throw error;
    }
  }

  static reportSystemStats(): void {
    this.logger.info('System statistics', {
      event_type: 'system_stats',
      memory_usage: process.memoryUsage(),
      uptime: process.uptime(),
      cpu_usage: process.cpuUsage(),
      node_version: process.version,
    });
  }
}

// Example 3: Testing the logging system
export async function testLoggingSystem(): Promise<void> {
  console.log('🧪 Testing structured logging system...');

  // Test basic connector logging
  const connector = new ExampleConnector('test-connector');
  
  await connector.processJob('job-001', {
    model: 'sdxl',
    prompt: 'A beautiful landscape',
  });

  await connector.healthCheck();

  connector.onWebSocketMessage('execution_start', {
    prompt_id: 'prompt-123',
    client_id: 'client-456', 
  });

  connector.onModelLoad('sdxl-base', 2500);

  // Test utility logging
  await WorkerUtilities.downloadModel(
    'https://example.com/model.safetensors',
    'sdxl-base'
  );

  WorkerUtilities.reportSystemStats();

  console.log('✅ Logging system test completed');
  console.log('📝 Check Fluent Bit logs and Dash0 for structured log entries');
}

// Example 4: Environment configuration helper
export function getLoggingConfig() {
  return {
    // Fluent Bit connection
    fluentBitHost: process.env.FLUENT_BIT_HOST || 'localhost',
    fluentBitPort: parseInt(process.env.FLUENT_BIT_PORT || '9880'),
    
    // Worker identification
    machineId: process.env.MACHINE_ID || 'unknown',
    workerId: process.env.WORKER_ID || 'unknown',
    serviceType: process.env.SERVICE_TYPE || 'unknown',
    
    // Railway-specific
    deploymentEnv: process.env.RAILWAY_ENVIRONMENT || 'development',
    region: process.env.RAILWAY_REGION || 'unknown',
    serviceInstance: process.env.RAILWAY_SERVICE_INSTANCE_ID || 'unknown',
    
    // Feature flags
    enableFluentBit: process.env.DISABLE_FLUENT_BIT_LOGGING !== 'true',
    enableDebugLogs: process.env.LOG_LEVEL === 'debug',
  };
}

// Run test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testLoggingSystem().catch(console.error);
}