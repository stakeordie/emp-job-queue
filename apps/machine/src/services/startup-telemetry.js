/**
 * Machine Startup Telemetry Service
 * 
 * Instruments the complete machine bootstrap lifecycle with distributed tracing
 * Sends traces to local OTel collector which forwards to Dash0
 */

import { createLogger } from '../utils/logger.js';
import { formatErrorMessage } from '../utils/error-formatter.js';

const logger = createLogger('startup-telemetry');

export class StartupTelemetry {
  constructor(machineId, machineType = 'unknown') {
    this.machineId = machineId;
    this.machineType = machineType;
    this.enabled = process.env.OTEL_ENABLED !== 'false';
    this.collectorEndpoint = process.env.OTEL_COLLECTOR_TRACES_ENDPOINT || 'http://localhost:4318/v1/traces';
    
    // Track startup phases
    this.startupStartTime = Date.now();
    this.phases = new Map();
    this.activeSpans = new Map();
    
    if (!this.enabled) {
      logger.info('Startup telemetry disabled via OTEL_ENABLED=false');
      return;
    }
    
    logger.info(`Startup telemetry initialized for machine ${machineId} (${machineType})`);
    
    // Start the root startup span
    this.startRootSpan();
  }
  
  /**
   * Generate OpenTelemetry-compatible trace and span IDs
   */
  generateTraceId() {
    return Array.from({length: 32}, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }
  
  generateSpanId() {
    return Array.from({length: 16}, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }
  
  /**
   * Start the root machine startup span
   */
  startRootSpan() {
    const traceId = this.generateTraceId();
    const spanId = this.generateSpanId();
    const startTime = this.startupStartTime;
    
    this.rootTrace = { traceId, spanId, startTime };
    
    logger.info(`Started root startup trace: ${traceId}`);
    
    // Don't send the root span yet - wait until startup completes
    this.rootSpanData = {
      traceId,
      spanId,
      name: 'machine.startup',
      startTime,
      attributes: {
        'machine.id': this.machineId,
        'machine.type': this.machineType,
        'deployment.environment': process.env.NODE_ENV || 'production',
        'workers.specification': process.env.WORKERS || 'unknown',
        'container.platform': process.platform,
        'startup.initiated_at': new Date(startTime).toISOString()
      }
    };
  }
  
  /**
   * Start a new startup phase
   */
  startPhase(phaseName, attributes = {}) {
    if (!this.enabled) return null;
    
    const spanId = this.generateSpanId();
    const startTime = Date.now();
    
    const phaseData = {
      traceId: this.rootTrace.traceId,
      parentSpanId: this.rootTrace.spanId,
      spanId,
      name: `machine.startup.${phaseName}`,
      startTime,
      attributes: {
        'machine.id': this.machineId,
        'startup.phase': phaseName,
        'phase.start_time': new Date(startTime).toISOString(),
        ...attributes
      }
    };
    
    this.phases.set(phaseName, phaseData);
    this.activeSpans.set(phaseName, phaseData);
    
    logger.debug(`Started startup phase: ${phaseName}`);
    return spanId;
  }
  
  /**
   * Complete a startup phase
   */
  completePhase(phaseName, attributes = {}) {
    if (!this.enabled || !this.phases.has(phaseName)) return;
    
    const phaseData = this.phases.get(phaseName);
    const endTime = Date.now();
    const duration = endTime - phaseData.startTime;
    
    // Update phase data with completion info
    phaseData.endTime = endTime;
    phaseData.duration = duration;
    phaseData.attributes = {
      ...phaseData.attributes,
      'phase.duration_ms': duration,
      'phase.end_time': new Date(endTime).toISOString(),
      'phase.success': true,
      ...attributes
    };
    
    // Remove from active spans
    this.activeSpans.delete(phaseName);
    
    // Send the completed phase span
    this.sendSpanToCollector(phaseData);
    
    logger.info(`Completed startup phase: ${phaseName} (${duration}ms)`);
  }
  
  /**
   * Fail a startup phase
   */
  failPhase(phaseName, error, attributes = {}) {
    if (!this.enabled || !this.phases.has(phaseName)) return;
    
    const phaseData = this.phases.get(phaseName);
    const endTime = Date.now();
    const duration = endTime - phaseData.startTime;
    
    phaseData.endTime = endTime;
    phaseData.duration = duration;
    phaseData.attributes = {
      ...phaseData.attributes,
      'phase.duration_ms': duration,
      'phase.end_time': new Date(endTime).toISOString(),
      'phase.success': false,
      'error.message': error.message,
      'error.type': error.constructor.name,
      ...attributes
    };
    
    this.activeSpans.delete(phaseName);
    this.sendSpanToCollector(phaseData);
    
    logger.error(`Failed startup phase: ${phaseName} (${duration}ms) - ${error.message}`);
  }
  
  /**
   * Add an event to a phase
   */
  addPhaseEvent(phaseName, eventName, attributes = {}) {
    if (!this.enabled) return;
    
    const eventData = {
      traceId: this.rootTrace.traceId,
      spanId: this.generateSpanId(),
      parentSpanId: this.phases.get(phaseName)?.spanId || this.rootTrace.spanId,
      name: `startup.event.${eventName}`,
      startTime: Date.now(),
      endTime: Date.now() + 1,
      attributes: {
        'machine.id': this.machineId,
        'event.name': eventName,
        'event.phase': phaseName,
        'event.timestamp': new Date().toISOString(),
        ...attributes
      }
    };
    
    this.sendSpanToCollector(eventData);
    logger.debug(`Startup event: ${phaseName}.${eventName}`);
  }
  
  /**
   * Complete the entire startup process
   */
  completeStartup(attributes = {}) {
    if (!this.enabled) return;
    
    const endTime = Date.now();
    const totalDuration = endTime - this.startupStartTime;
    
    // Complete any remaining active spans
    for (const [phaseName, phaseData] of this.activeSpans) {
      logger.warn(`Force completing active phase: ${phaseName}`);
      this.completePhase(phaseName, { 'force_completed': true });
    }
    
    // Update root span with completion data
    this.rootSpanData.endTime = endTime;
    this.rootSpanData.duration = totalDuration;
    this.rootSpanData.attributes = {
      ...this.rootSpanData.attributes,
      'startup.total_duration_ms': totalDuration,
      'startup.completed_at': new Date(endTime).toISOString(),
      'startup.phases_completed': this.phases.size,
      'startup.success': true,
      'startup.ready_for_jobs': true,
      ...attributes
    };
    
    // Send the root span
    this.sendSpanToCollector(this.rootSpanData);
    
    logger.info(`Machine startup completed: ${this.machineId} (${totalDuration}ms total, ${this.phases.size} phases)`);
  }
  
  /**
   * Fail the entire startup process
   */
  failStartup(error, attributes = {}) {
    if (!this.enabled) return;
    
    const endTime = Date.now();
    const totalDuration = endTime - this.startupStartTime;
    
    // Fail any remaining active spans
    for (const [phaseName] of this.activeSpans) {
      this.failPhase(phaseName, error, { 'cascade_failure': true });
    }
    
    this.rootSpanData.endTime = endTime;
    this.rootSpanData.duration = totalDuration;
    this.rootSpanData.attributes = {
      ...this.rootSpanData.attributes,
      'startup.total_duration_ms': totalDuration,
      'startup.failed_at': new Date(endTime).toISOString(),
      'startup.phases_completed': this.phases.size,
      'startup.success': false,
      'startup.ready_for_jobs': false,
      'error.message': error.message,
      'error.type': error.constructor.name,
      ...attributes
    };
    
    this.sendSpanToCollector(this.rootSpanData);
    
    logger.error(`Machine startup failed: ${this.machineId} (${totalDuration}ms) - ${error.message}`);
  }
  
  /**
   * Send span data to local OTel collector
   */
  async sendSpanToCollector(spanData) {
    if (!this.enabled) return;
    
    const traceData = {
      resourceSpans: [{
        resource: {
          attributes: [
            {
              key: "service.name",
              value: { stringValue: "emp-machine-bootstrap" }
            },
            {
              key: "machine.id",
              value: { stringValue: this.machineId }
            },
            {
              key: "machine.type",
              value: { stringValue: this.machineType }
            },
            {
              key: "deployment.environment",
              value: { stringValue: process.env.NODE_ENV || 'production' }
            }
          ]
        },
        scopeSpans: [{
          spans: [{
            traceId: spanData.traceId,
            spanId: spanData.spanId,
            parentSpanId: spanData.parentSpanId || undefined,
            name: spanData.name,
            kind: 1, // SPAN_KIND_SERVER
            startTimeUnixNano: `${spanData.startTime * 1000000}`,
            endTimeUnixNano: `${(spanData.endTime || (spanData.startTime + 1000)) * 1000000}`,
            attributes: Object.entries(spanData.attributes).map(([key, value]) => ({
              key,
              value: { stringValue: String(value) }
            }))
          }]
        }]
      }]
    };
    
    try {
      const response = await fetch(this.collectorEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(traceData)
      });
      
      if (!response.ok) {
        logger.error(`Failed to send startup trace: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      logger.error(`Error sending startup trace to collector: ${formatErrorMessage(error)}`);
    }
  }
  
  /**
   * Get startup performance summary
   */
  getPerformanceSummary() {
    if (!this.enabled) return null;
    
    const phases = Array.from(this.phases.entries()).map(([name, data]) => ({
      name,
      duration: data.duration || (Date.now() - data.startTime),
      success: data.attributes['phase.success'] !== false
    }));
    
    const totalDuration = Date.now() - this.startupStartTime;
    
    return {
      machineId: this.machineId,
      machineType: this.machineType,
      totalDuration,
      phases,
      traceId: this.rootTrace?.traceId,
      isComplete: this.activeSpans.size === 0
    };
  }
}

// Helper functions for instrumenting specific startup operations

/**
 * Instrument component installation
 */
export async function traceComponentInstallation(telemetry, componentName, installFn, metadata = {}) {
  if (!telemetry?.enabled) {
    return await installFn();
  }
  
  const spanId = telemetry.startPhase(`component_install.${componentName}`, {
    'component.name': componentName,
    'component.type': metadata.type || 'unknown',
    'component.version': metadata.version || 'unknown',
    'component.url': metadata.url || 'unknown',
    ...metadata
  });
  
  try {
    telemetry.addPhaseEvent(`component_install.${componentName}`, 'download_started', {
      'download.url': metadata.url,
      'download.method': metadata.method || 'unknown'
    });
    
    const result = await installFn();
    
    telemetry.addPhaseEvent(`component_install.${componentName}`, 'installation_completed', {
      'install.success': true,
      'install.result_size': typeof result === 'object' ? JSON.stringify(result).length : 0
    });
    
    telemetry.completePhase(`component_install.${componentName}`, {
      'component.installed': true,
      'component.validation_passed': true
    });
    
    return result;
  } catch (error) {
    telemetry.addPhaseEvent(`component_install.${componentName}`, 'installation_failed', {
      'error.message': error.message,
      'error.code': error.code || 'unknown'
    });
    
    telemetry.failPhase(`component_install.${componentName}`, error, {
      'component.installed': false,
      'install.retry_recommended': true
    });
    
    throw error;
  }
}

/**
 * Instrument service startup
 */
export async function traceServiceStartup(telemetry, serviceName, startupFn, metadata = {}) {
  if (!telemetry?.enabled) {
    return await startupFn();
  }
  
  telemetry.startPhase(`service_startup.${serviceName}`, {
    'service.name': serviceName,
    'service.type': metadata.type || 'unknown',
    'service.command': metadata.command || 'unknown',
    'service.port': metadata.port || 'unknown',
    ...metadata
  });
  
  try {
    const result = await startupFn();
    
    telemetry.completePhase(`service_startup.${serviceName}`, {
      'service.started': true,
      'service.health_check_passed': true,
      'service.ready_for_requests': true
    });
    
    return result;
  } catch (error) {
    telemetry.failPhase(`service_startup.${serviceName}`, error, {
      'service.started': false,
      'service.restart_required': true
    });
    
    throw error;
  }
}

export default StartupTelemetry;