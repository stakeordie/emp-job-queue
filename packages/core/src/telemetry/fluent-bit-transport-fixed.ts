// Fluent Bit Transport for Winston (Fixed)
// Properly extends Winston Transport with correct typing

import TransportStream from 'winston-transport';
import fetch from 'node-fetch';

interface FluentBitTransportOptions extends TransportStream.TransportStreamOptions {
  host?: string;
  port?: number;
  endpoint?: string;
  timeout?: number;
  machineId?: string;
  workerId?: string;
  serviceType?: string;
  connectorId?: string;
}

export class FluentBitTransport extends TransportStream {
  private host: string;
  private port: number;
  private endpoint: string;
  private timeout: number;
  private machineId?: string;
  private workerId?: string;
  private serviceType?: string;
  private connectorId?: string;
  private url: string;

  constructor(options: FluentBitTransportOptions = {}) {
    super(options);

    this.host = options.host || process.env.FLUENT_BIT_HOST || 'localhost';
    this.port = options.port || parseInt(process.env.FLUENT_BIT_PORT || '9880');
    this.endpoint = options.endpoint || '/';
    this.timeout = options.timeout || 5000;
    
    // Worker identification
    this.machineId = options.machineId || process.env.MACHINE_ID;
    this.workerId = options.workerId || process.env.WORKER_ID;
    this.serviceType = options.serviceType || process.env.SERVICE_TYPE;
    this.connectorId = options.connectorId;

    this.url = `http://${this.host}:${this.port}${this.endpoint}`;
  }

  log(info: any, callback: () => void): void {
    setImmediate(() => {
      this.emit('logged', info);
    });

    // Prepare log entry with metadata
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: info.level,
      message: info.message,
      ...info, // Include all Winston metadata
      
      // Worker identification (override from info if provided)
      machine_id: info.machine_id || this.machineId,
      worker_id: info.worker_id || this.workerId,
      service_type: info.service_type || this.serviceType,
      connector_id: info.connector_id || this.connectorId,
      
      // Source identification
      source: 'winston-logger',
      logger_name: info.service || 'emp-worker',
    };

    // Remove undefined values to keep logs clean
    Object.keys(logEntry).forEach(key => {
      if (logEntry[key] === undefined) {
        delete logEntry[key];
      }
    });

    this.sendToFluentBit(logEntry)
      .catch(error => {
        // Don't fail the application if logging fails
        // Just emit error event for monitoring
        this.emit('error', error);
      });

    callback();
  }

  private async sendToFluentBit(logEntry: any): Promise<void> {
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(logEntry),
        timeout: this.timeout,
      } as any);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      // Add context to the error
      throw new Error(`Fluent Bit transport failed: ${error.message}`);
    }
  }

  // Update worker identification (useful when workers change context)
  updateWorkerContext(context: {
    machineId?: string;
    workerId?: string;
    serviceType?: string;
    connectorId?: string;
  }): void {
    if (context.machineId) this.machineId = context.machineId;
    if (context.workerId) this.workerId = context.workerId;
    if (context.serviceType) this.serviceType = context.serviceType;
    if (context.connectorId) this.connectorId = context.connectorId;
  }
}