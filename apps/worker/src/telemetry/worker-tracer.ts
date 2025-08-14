/**
 * Worker OpenTelemetry Instrumentation
 * 
 * Lightweight telemetry for worker processes that sends to local OTel collector
 * Uses direct HTTP calls to match the exact format that works with Dash0
 */

import { trace, context, SpanKind, SpanStatusCode } from '@opentelemetry/api';

export class WorkerTracer {
  private tracer: any = null;
  private enabled: boolean;
  private workerId: string;
  
  constructor(workerId: string) {
    this.workerId = workerId;
    this.enabled = process.env.OTEL_ENABLED !== 'false';
    
    if (!this.enabled) {
      console.log('OpenTelemetry disabled via OTEL_ENABLED=false');
      return;
    }
    
    try {
      this.initializeTracing();
      console.log(`Worker telemetry initialized for ${workerId}`);
    } catch (error) {
      console.error('Failed to initialize worker telemetry:', error);
      this.enabled = false;
    }
  }
  
  private initializeTracing() {
    // Simply get the tracer instance - let the machine handle OTel setup
    this.tracer = trace.getTracer('emp-worker', '1.0.0');
  }

  /**
   * Send trace directly to OTel collector using the exact format that works with Dash0
   */
  private async sendTraceToCollector(serviceName: string, spanName: string, attributes: Record<string, any> = {}) {
    if (!this.enabled) return;

    const traceId = this.generateTraceId();
    const spanId = this.generateSpanId();
    const now = Date.now();
    
    const traceData = {
      resourceSpans: [{
        resource: {
          attributes: [
            {
              key: "service.name",
              value: { stringValue: serviceName }
            },
            {
              key: "worker.id", 
              value: { stringValue: this.workerId }
            },
            {
              key: "machine.id",
              value: { stringValue: process.env.MACHINE_ID || 'unknown' }
            }
          ]
        },
        scopeSpans: [{
          spans: [{
            traceId: traceId,
            spanId: spanId,
            name: spanName,
            kind: 1, // SPAN_KIND_SERVER
            startTimeUnixNano: `${now * 1000000}`,
            endTimeUnixNano: `${(now + 1000) * 1000000}`,
            attributes: Object.entries(attributes).map(([key, value]) => ({
              key,
              value: { stringValue: String(value) }
            }))
          }]
        }]
      }]
    };

    try {
      const response = await fetch('http://localhost:4318/v1/traces', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(traceData)
      });
      
      if (!response.ok) {
        console.error(`Failed to send trace: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error sending trace to collector:', error);
    }
  }

  private generateTraceId(): string {
    // Generate a 32-character hex string
    return Array.from({length: 32}, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }

  private generateSpanId(): string {
    // Generate a 16-character hex string
    return Array.from({length: 16}, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }
  
  /**
   * Create a span for job processing using the proven Dash0 format
   */
  async traceJobProcessing<T>(jobId: string, jobType: string, operation: () => Promise<T>): Promise<T> {
    if (!this.enabled) {
      return operation();
    }
    
    const startTime = Date.now();
    
    try {
      // Send job started trace
      await this.sendTraceToCollector(
        `simulation-${jobType}-worker`,
        'job.processing.started',
        {
          'job.id': jobId,
          'job.type': jobType,
          'worker.id': this.workerId,
          'job.status': 'started'
        }
      );
      
      const result = await operation();
      
      const processingTime = Date.now() - startTime;
      
      // Send job completed trace
      await this.sendTraceToCollector(
        `simulation-${jobType}-worker`,
        'job.processing.completed', 
        {
          'job.id': jobId,
          'job.type': jobType,
          'worker.id': this.workerId,
          'job.status': 'completed',
          'job.processing_time_ms': processingTime.toString()
        }
      );
      
      return result;
    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      
      // Send job error trace
      await this.sendTraceToCollector(
        `simulation-${jobType}-worker`,
        'job.processing.error',
        {
          'job.id': jobId,
          'job.type': jobType,
          'worker.id': this.workerId,
          'job.status': 'error',
          'job.processing_time_ms': processingTime.toString(),
          'error.message': error.message
        }
      );
      
      throw error;
    }
  }
  
  /**
   * Create a span for WebSocket operations
   */
  traceWebSocketOperation<T>(operationType: string, operation: () => Promise<T>): Promise<T> {
    if (!this.enabled || !this.tracer) {
      return operation();
    }
    
    return this.tracer.startActiveSpan(
      `websocket.${operationType}`,
      {
        kind: SpanKind.CLIENT,
        attributes: {
          'worker.id': this.workerId,
          'protocol': 'websocket',
          'operation.type': operationType
        }
      },
      async (span: any) => {
        try {
          span.addEvent(`websocket.${operationType}.started`, {
            'timestamp': new Date().toISOString()
          });
          
          const result = await operation();
          
          span.addEvent(`websocket.${operationType}.completed`, {
            'timestamp': new Date().toISOString()
          });
          
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (error: any) {
          span.setStatus({ 
            code: SpanStatusCode.ERROR, 
            message: error.message 
          });
          
          span.addEvent(`websocket.${operationType}.error`, {
            'error.message': error.message,
            'timestamp': new Date().toISOString()
          });
          
          throw error;
        } finally {
          span.end();
        }
      }
    );
  }
  
  /**
   * Add a simple test event to verify telemetry is working using proven Dash0 format
   */
  async addTestEvent(message: string, attributes: Record<string, any> = {}) {
    if (!this.enabled) {
      return;
    }
    
    await this.sendTraceToCollector(
      'simulation-worker-telemetry',
      'worker.event',
      {
        'event.message': message,
        'worker.id': this.workerId,
        'timestamp': new Date().toISOString(),
        ...attributes
      }
    );
  }
  
  /**
   * Shutdown telemetry
   */
  async shutdown() {
    // No SDK to shutdown in simplified version
    console.log(`Worker telemetry shutdown for ${this.workerId}`);
  }
}