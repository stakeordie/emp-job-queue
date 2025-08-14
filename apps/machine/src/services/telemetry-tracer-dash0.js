import { trace } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('telemetry-tracer');

/**
 * Dash0-specific OpenTelemetry Tracing setup
 * Sends traces directly to Dash0 without local collector
 */
export class TelemetryTracerDash0 {
  constructor(machineId) {
    this.machineId = machineId;
    this.enabled = process.env.OTEL_ENABLED !== 'false';
    this.sdk = null;
    this.tracer = null;
    
    if (!this.enabled) {
      logger.info('OpenTelemetry tracing disabled via OTEL_ENABLED=false');
      return;
    }
    
    try {
      this.initializeTracing();
      logger.info(`Dash0 telemetry tracer initialized for machine ${machineId}`);
    } catch (error) {
      logger.error('Failed to initialize Dash0 telemetry tracer:', error);
      this.enabled = false;
    }
  }
  
  initializeTracing() {
    // Environment-based dataset namespacing
    const environment = process.env.NODE_ENV || 'development';
    const dataset = process.env.DASH0_DATASET || environment;
    
    logger.info(`Dash0 tracing: environment=${environment}, dataset=${dataset}`);
    
    // Create local OTel collector exporter (collector forwards to Dash0)
    const traceExporter = new OTLPTraceExporter({
      url: process.env.OTEL_COLLECTOR_TRACES_ENDPOINT || 'http://localhost:4318/v1/traces'
      // No auth headers needed - local collector handles Dash0 authentication
    });
    
    // Create SDK with auto-instrumentation
    this.sdk = new NodeSDK({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: 'emp-machine',
        [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
        [SemanticResourceAttributes.SERVICE_INSTANCE_ID]: this.machineId,
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: environment,
        // Custom attributes for machine context
        'machine.id': this.machineId,
        'machine.type': 'worker-machine',
        'machine.dataset': dataset
      }),
      traceExporter: traceExporter,
      // Enable auto-instrumentation for common libraries
      instrumentations: [
        // Auto-instruments http, https, fs, etc.
      ]
    });
    
    // Start the SDK
    this.sdk.start();
    
    // Get tracer for manual instrumentation
    this.tracer = trace.getTracer('emp-machine', '1.0.0');
    
    logger.debug('OpenTelemetry SDK started with Dash0 exporter');
  }
  
  /**
   * Create a new span for tracing operations
   */
  startSpan(name, attributes = {}) {
    if (!this.enabled || !this.tracer) {
      return null;
    }
    
    return this.tracer.startSpan(name, {
      attributes: {
        'machine.id': this.machineId,
        ...attributes
      }
    });
  }
  
  /**
   * Start a span and return a function to end it
   */
  startOperation(name, attributes = {}) {
    if (!this.enabled) {
      return () => {}; // Return no-op function
    }
    
    const span = this.startSpan(name, attributes);
    if (!span) {
      return () => {};
    }
    
    return (result = {}) => {
      if (result.error) {
        span.recordException(result.error);
        span.setStatus({ code: trace.SpanStatusCode.ERROR, message: result.error.message });
      } else {
        span.setStatus({ code: trace.SpanStatusCode.OK });
      }
      
      // Add result attributes
      if (result.attributes) {
        span.setAttributes(result.attributes);
      }
      
      span.end();
    };
  }
  
  /**
   * Trace component installation operation
   */
  traceComponentInstallation(componentName, callback) {
    if (!this.enabled) {
      return callback();
    }
    
    const span = this.startSpan('component.install', {
      'component.name': componentName,
      'operation.type': 'installation'
    });
    
    if (!span) {
      return callback();
    }
    
    return trace.setActiveSpan(span, async () => {
      try {
        const result = await callback();
        span.setStatus({ code: trace.SpanStatusCode.OK });
        span.setAttributes({
          'component.install.success': true
        });
        return result;
      } catch (error) {
        span.recordException(error);
        span.setStatus({ code: trace.SpanStatusCode.ERROR, message: error.message });
        span.setAttributes({
          'component.install.success': false,
          'component.install.error': error.message
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }
  
  /**
   * Trace model download operation
   */
  traceModelDownload(modelName, modelUrl, callback) {
    if (!this.enabled) {
      return callback();
    }
    
    const span = this.startSpan('model.download', {
      'model.name': modelName,
      'model.url': modelUrl,
      'operation.type': 'download'
    });
    
    if (!span) {
      return callback();
    }
    
    return trace.setActiveSpan(span, async () => {
      try {
        const result = await callback();
        span.setStatus({ code: trace.SpanStatusCode.OK });
        span.setAttributes({
          'model.download.success': true,
          'model.download.size_bytes': result?.size || 0
        });
        return result;
      } catch (error) {
        span.recordException(error);
        span.setStatus({ code: trace.SpanStatusCode.ERROR, message: error.message });
        span.setAttributes({
          'model.download.success': false,
          'model.download.error': error.message
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }
  
  /**
   * Trace service startup operation
   */
  traceServiceStartup(serviceName, serviceType, callback) {
    if (!this.enabled) {
      return callback();
    }
    
    const span = this.startSpan('service.startup', {
      'service.name': serviceName,
      'service.type': serviceType,
      'operation.type': 'startup'
    });
    
    if (!span) {
      return callback();
    }
    
    return trace.setActiveSpan(span, async () => {
      try {
        const result = await callback();
        span.setStatus({ code: trace.SpanStatusCode.OK });
        span.setAttributes({
          'service.startup.success': true,
          'service.startup.duration_ms': result?.duration || 0
        });
        return result;
      } catch (error) {
        span.recordException(error);
        span.setStatus({ code: trace.SpanStatusCode.ERROR, message: error.message });
        span.setAttributes({
          'service.startup.success': false,
          'service.startup.error': error.message
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }
  
  /**
   * Add custom attributes to the current active span
   */
  addAttributes(attributes) {
    if (!this.enabled) return;
    
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.setAttributes(attributes);
    }
  }
  
  /**
   * Record an exception in the current active span
   */
  recordException(error) {
    if (!this.enabled) return;
    
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.recordException(error);
      activeSpan.setStatus({ code: trace.SpanStatusCode.ERROR, message: error.message });
    }
  }
  
  /**
   * Shutdown tracing gracefully
   */
  async shutdown() {
    if (!this.enabled || !this.sdk) return;
    
    try {
      await this.sdk.shutdown();
      logger.info('Dash0 telemetry tracer shutdown complete');
    } catch (error) {
      logger.error('Error during Dash0 telemetry tracer shutdown:', error);
    }
  }
}

export default TelemetryTracerDash0;