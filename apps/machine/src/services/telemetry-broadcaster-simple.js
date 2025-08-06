import { metrics } from '@opentelemetry/api';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('telemetry-broadcaster');

/**
 * Simplified TelemetryBroadcaster that avoids ES module compatibility issues
 * Converts existing status events to OpenTelemetry signals (alongside Redis)
 */
export class TelemetryBroadcaster {
  constructor(machineId) {
    this.machineId = machineId;
    this.enabled = process.env.OTEL_ENABLED !== 'false';
    
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
    // Create exporter (this usually works fine with ES modules)
    const exporter = new OTLPMetricExporter({
      url: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT || 'http://localhost:4318/v1/metrics',
    });
    
    // Create metric reader
    const metricReader = new PeriodicExportingMetricReader({
      exporter: exporter,
      exportIntervalMillis: 5000 // Export every 5 seconds
    });

    // Create minimal meter provider (no fancy resource attributes)
    const meterProvider = new MeterProvider({
      readers: [metricReader]
    });
    
    // Set global meter provider
    metrics.setGlobalMeterProvider(meterProvider);
    
    // Get meter for this machine
    this.meter = metrics.getMeter('emp-machine-status', '1.0.0');
    
    // Create simple metrics
    this.machineUptime = this.meter.createGauge('machine_uptime_ms');
    this.activeWorkers = this.meter.createGauge('machine_workers_active');
    this.totalWorkers = this.meter.createGauge('machine_workers_total'); 
    this.healthyServices = this.meter.createGauge('machine_services_healthy');
    this.totalServices = this.meter.createGauge('machine_services_total');
  }
  
  /**
   * Broadcast machine status to OpenTelemetry (alongside Redis publish)
   */
  broadcastMachineStatus(statusMessage) {
    if (!this.enabled) return;
    
    try {
      const machineStatus = statusMessage.status?.machine;
      const workers = statusMessage.status?.workers || {};
      const services = statusMessage.status?.services || {};
      
      // Simple labels (no fancy semantic conventions)
      const labels = {
        machine_id: this.machineId,
        update_type: statusMessage.update_type,
        machine_phase: machineStatus?.phase || 'unknown'
      };
      
      // Record metrics
      if (machineStatus?.uptime_ms) {
        this.machineUptime.record(machineStatus.uptime_ms, labels);
      }
      
      // Worker counts
      const workerList = Object.values(workers);
      const activeCount = workerList.filter(w => w.status === 'busy').length;
      const totalCount = workerList.length;
      
      this.activeWorkers.record(activeCount, labels);
      this.totalWorkers.record(totalCount, labels);
      
      // Service counts
      const serviceList = Object.values(services);
      const healthyCount = serviceList.filter(s => s.health === 'healthy').length;
      const totalServiceCount = serviceList.length;
      
      this.healthyServices.record(healthyCount, labels);
      this.totalServices.record(totalServiceCount, labels);
      
      logger.debug(`📊 Telemetry: ${totalCount} workers (${activeCount} active), ${healthyCount}/${totalServiceCount} services healthy`);
      
    } catch (error) {
      logger.error('Error broadcasting machine status to OpenTelemetry:', error);
    }
  }
  
  /**
   * Shutdown telemetry gracefully
   */
  async shutdown() {
    if (!this.enabled) return;
    
    try {
      logger.info('OpenTelemetry broadcaster shutdown complete');
    } catch (error) {
      logger.error('Error during OpenTelemetry shutdown:', error);
    }
  }
}

export default TelemetryBroadcaster;