import { metrics } from '@opentelemetry/api';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('telemetry-broadcaster');

/**
 * Dash0-specific TelemetryBroadcaster that sends directly to Dash0
 * No local collector needed - bypasses localhost completely
 */
export class TelemetryBroadcasterDash0 {
  constructor(machineId) {
    this.machineId = machineId;
    this.enabled = process.env.OTEL_ENABLED !== 'false';
    
    if (!this.enabled) {
      logger.info('OpenTelemetry broadcasting disabled via OTEL_ENABLED=false');
      return;
    }
    
    try {
      this.initializeOpenTelemetry();
      logger.info(`Dash0 telemetry broadcaster initialized for machine ${machineId}`);
    } catch (error) {
      logger.error('Failed to initialize Dash0 telemetry broadcaster:', error);
      this.enabled = false;
    }
  }
  
  initializeOpenTelemetry() {
    // Environment-based dataset namespacing - match Dash0's datasets exactly
    const environment = process.env.NODE_ENV || 'development';
    const dataset = process.env.DASH0_DATASET || environment;
    
    logger.info(`Dash0 telemetry: environment=${environment}, dataset=${dataset}`);
    
    // Create local OTel collector exporter (collector forwards to Dash0)
    const exporter = new OTLPMetricExporter({
      url: process.env.OTEL_COLLECTOR_METRICS_ENDPOINT || 'http://localhost:4318/v1/metrics'
      // No auth headers needed - local collector handles Dash0 authentication
    });
    
    // Create metric reader
    const metricReader = new PeriodicExportingMetricReader({
      exporter: exporter,
      exportIntervalMillis: 5000 // Export every 5 seconds
    });

    // Create minimal meter provider
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
   * Broadcast machine status directly to Dash0
   */
  broadcastMachineStatus(statusMessage) {
    if (!this.enabled) return;
    
    try {
      const machineStatus = statusMessage.status?.machine;
      const workers = statusMessage.status?.workers || {};
      const services = statusMessage.status?.services || {};
      
      // Simple labels
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
      
      logger.debug(`📊 Sent to Dash0: ${totalCount} workers (${activeCount} active), ${healthyCount}/${totalServiceCount} services healthy`);
      
    } catch (error) {
      logger.error('Error broadcasting machine status to Dash0:', error);
    }
  }
  
  /**
   * Shutdown telemetry gracefully
   */
  async shutdown() {
    if (!this.enabled) return;
    
    try {
      logger.info('Dash0 telemetry broadcaster shutdown complete');
    } catch (error) {
      logger.error('Error during Dash0 telemetry shutdown:', error);
    }
  }
}

export default TelemetryBroadcasterDash0;