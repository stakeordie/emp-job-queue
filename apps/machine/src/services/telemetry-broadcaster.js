import { metrics } from '@opentelemetry/api';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('telemetry-broadcaster');

/**
 * TelemetryBroadcaster converts existing status events to OpenTelemetry signals
 * This runs alongside Redis pub/sub - it doesn't replace anything
 */
export class TelemetryBroadcaster {
  constructor(machineId) {
    this.machineId = machineId;
    this.enabled = process.env.OTEL_ENABLED !== 'false'; // Default to enabled
    
    if (!this.enabled) {
      logger.info('OpenTelemetry broadcasting disabled via OTEL_ENABLED=false');
      return;
    }
    
    try {
      this.initializeOpenTelemetry();
      logger.info(`OpenTelemetry broadcaster initialized for machine ${machineId}`);
    } catch (error) {
      logger.error('Failed to initialize OpenTelemetry broadcaster:', error);
      this.enabled = false;
    }
  }
  
  initializeOpenTelemetry() {
    // Create exporter
    const exporter = new OTLPMetricExporter({
      url: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT || 'http://localhost:4318/v1/metrics',
      headers: process.env.OTEL_EXPORTER_OTLP_HEADERS ? 
        JSON.parse(process.env.OTEL_EXPORTER_OTLP_HEADERS) : {},
    });
    
    // Create metric reader
    const metricReader = new PeriodicExportingMetricReader({
      exporter: exporter,
      exportIntervalMillis: 5000 // Export every 5 seconds
    });

    // Create meter provider with resource
    const meterProvider = new MeterProvider({
      resource: new Resource({
        [SEMRESATTRS_SERVICE_NAME]: 'emp-machine-status',
        [SEMRESATTRS_SERVICE_VERSION]: process.env.VERSION || '1.0.0',
        'machine.id': this.machineId,
        'environment': process.env.NODE_ENV || 'development',
      }),
      readers: [metricReader]
    });
    
    // Set global meter provider
    metrics.setGlobalMeterProvider(meterProvider);
    
    // Get meter for this machine
    this.meter = metrics.getMeter('emp-machine-status', '1.0.0');
    
    // Create metrics
    this.machineUptime = this.meter.createGauge('machine.uptime_ms', {
      description: 'Machine uptime in milliseconds'
    });
    
    this.activeWorkers = this.meter.createGauge('machine.workers.active', {
      description: 'Number of active workers on this machine'
    });
    
    this.totalWorkers = this.meter.createGauge('machine.workers.total', {
      description: 'Total number of workers on this machine'
    });
    
    this.serviceHealth = this.meter.createGauge('machine.services.healthy', {
      description: 'Number of healthy services on this machine'
    });
  }
  
  /**
   * Broadcast machine status to OpenTelemetry
   * This is called alongside Redis publish - doesn't replace it
   */
  broadcastMachineStatus(statusMessage) {
    if (!this.enabled) return;
    
    try {
      const machineStatus = statusMessage.status?.machine;
      const workers = statusMessage.status?.workers || {};
      const services = statusMessage.status?.services || {};
      
      const labels = {
        'machine.id': this.machineId,
        'update.type': statusMessage.update_type,
        'machine.phase': machineStatus?.phase || 'unknown'
      };
      
      // Machine uptime
      if (machineStatus?.uptime_ms) {
        this.machineUptime.record(machineStatus.uptime_ms, labels);
      }
      
      // Worker metrics
      const workerStatuses = Object.values(workers);
      const activeCount = workerStatuses.filter(w => w.status === 'busy').length;
      const totalCount = workerStatuses.length;
      
      this.activeWorkers.record(activeCount, labels);
      this.totalWorkers.record(totalCount, labels);
      
      // Service health metrics
      const serviceList = Object.values(services);
      const healthyCount = serviceList.filter(s => s.health === 'healthy').length;
      
      this.serviceHealth.record(healthyCount, {
        ...labels,
        'total.services': serviceList.length
      });
      
      logger.debug(`Broadcasted telemetry: ${totalCount} workers (${activeCount} active), ${healthyCount} healthy services`);
      
    } catch (error) {
      logger.error('Error broadcasting machine status to OpenTelemetry:', error);
    }
  }
  
  /**
   * Broadcast worker status change
   */
  broadcastWorkerStatus(workerId, status, machineId) {
    if (!this.enabled) return;
    
    try {
      // You could add worker-specific metrics here
      logger.debug(`Worker ${workerId} status: ${status}`);
    } catch (error) {
      logger.error('Error broadcasting worker status:', error);
    }
  }
  
  /**
   * Shutdown telemetry gracefully
   */
  async shutdown() {
    if (!this.enabled) return;
    
    try {
      // Force export any pending metrics
      await this.meter._meterProvider.forceFlush();
      logger.info('OpenTelemetry broadcaster shutdown complete');
    } catch (error) {
      logger.error('Error during OpenTelemetry shutdown:', error);
    }
  }
}

export default TelemetryBroadcaster;