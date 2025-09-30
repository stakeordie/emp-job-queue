/**
 * Official OpenTelemetry OTLP Forwarder
 *
 * Uses the official OpenTelemetry SDK and OTLP HTTP exporter to ensure
 * proper OTLP format compliance with Dash0.
 */

import { TelemetryEvent, OtelSpan, WorkflowSpan } from '@emp/core';
import { trace, SpanKind, SpanStatusCode, TraceFlags } from '@opentelemetry/api';
import { BasicTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

export interface Dash0Config {
  endpoint: string;
  authToken: string;
  dataset: string;
  batchSize: number;
  flushInterval: number;
}

export class OfficialOtlpForwarder {
  private provider: BasicTracerProvider;
  private tracer: any;
  private exporter: OTLPTraceExporter;
  private processor: BatchSpanProcessor;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(private config: Dash0Config) {
    this.initializeSDK();
    console.log(`📊 Official OTLP forwarder initialized (dataset: ${config.dataset})`);
    this.startHealthChecks();
  }

  private initializeSDK(): void {
    // Create OTLP HTTP exporter with Dash0 configuration
    this.exporter = new OTLPTraceExporter({
      url: this.config.endpoint,
      headers: {
        'Authorization': `Bearer ${this.config.authToken}`,
        'Dash0-Dataset': this.config.dataset,
        'User-Agent': 'emp-telemetry-collector/1.0.0'
      },
      timeoutMillis: 30000, // 30 second timeout
    });

    // Wrap the export method to log HTTP activity
    const originalExport = this.exporter.export.bind(this.exporter);
    this.exporter.export = (spans: any, resultCallback: any) => {
      console.log(`📤 OTLP Export: Sending ${spans.length} span(s) to ${this.config.endpoint}`);

      // Debug: Log span structure
      if (spans.length > 0) {
        const firstSpan = spans[0];
        console.log(`   Span details:`, {
          name: firstSpan.name,
          hasInstrumentationScope: !!firstSpan.instrumentationScope,
          hasInstrumentationLibrary: !!firstSpan.instrumentationLibrary,
          hasResource: !!firstSpan.resource,
          resourceAttrs: firstSpan.resource?.attributes
        });
      }

      originalExport(spans, (result: any) => {
        if (result.code === 0) {
          console.log(`✅ OTLP Export: Success (${spans.length} spans)`);
        } else {
          console.error(`❌ OTLP Export: Failed:`, result.error);
        }
        resultCallback(result);
      });
    };

    // Create batch span processor with configured batching
    this.processor = new BatchSpanProcessor(this.exporter, {
      maxQueueSize: this.config.batchSize * 2, // Allow some buffering
      maxExportBatchSize: this.config.batchSize,
      exportTimeoutMillis: this.config.flushInterval,
      scheduledDelayMillis: this.config.flushInterval / 2, // Export more frequently
    });

    // Create tracer provider with resource information and span processors
    this.provider = new BasicTracerProvider({
      resource: resourceFromAttributes({
        [SEMRESATTRS_SERVICE_NAME]: 'emp-telemetry',
        [SEMRESATTRS_SERVICE_VERSION]: '1.0.0',
      }),
      spanProcessors: [this.processor], // Pass processors during construction
    });

    // Get tracer directly from the provider
    this.tracer = this.provider.getTracer('emp-telemetry-collector', '1.0.0');
  }

  async forwardEvent(event: TelemetryEvent | OtelSpan | WorkflowSpan): Promise<void> {
    try {
      // Create and immediately finish a span based on the event
      if (this.isWorkflowSpan(event)) {
        this.createSpanFromWorkflowSpan(event);
      } else if (this.isOtelSpan(event)) {
        this.createSpanFromOtelSpan(event);
      } else {
        this.createSpanFromTelemetryEvent(event);
      }
    } catch (error) {
      console.error('Failed to create span from event:', error);
    }
  }

  private isWorkflowSpan(event: TelemetryEvent | OtelSpan | WorkflowSpan): event is WorkflowSpan {
    return event && typeof event === 'object' &&
           'spanId' in event && 'traceId' in event && 'operationName' in event && 'events' in event;
  }

  private isOtelSpan(event: TelemetryEvent | OtelSpan | WorkflowSpan): event is OtelSpan {
    return event && typeof event === 'object' &&
           'operationName' in event && 'spanId' in event && !('events' in event);
  }

  private createSpanFromTelemetryEvent(event: TelemetryEvent): void {
    const span = this.tracer.startSpan(event.eventType, {
      kind: SpanKind.INTERNAL,
      startTime: event.timestamp,
    });

    // Set attributes from event data
    Object.entries(event.data || {}).forEach(([key, value]) => {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        span.setAttributes({ [key]: value });
      } else {
        span.setAttributes({ [key]: JSON.stringify(value) });
      }
    });

    // Add correlation IDs as attributes
    if (event.jobId) span.setAttributes({ 'emp.job.id': event.jobId });
    if (event.workerId) span.setAttributes({ 'emp.worker.id': event.workerId });
    if (event.machineId) span.setAttributes({ 'emp.machine.id': event.machineId });
    if (event.userId) span.setAttributes({ 'emp.user.id': event.userId });

    // Set status based on level
    span.setStatus({
      code: event.level === 'error' ? SpanStatusCode.ERROR : SpanStatusCode.OK
    });

    // End the span immediately (instant event)
    span.end(event.timestamp);
  }

  private createSpanFromWorkflowSpan(workflowSpan: WorkflowSpan): void {
    const span = this.tracer.startSpan(workflowSpan.operationName, {
      kind: SpanKind.INTERNAL,
      startTime: workflowSpan.startTime,
    });

    // Set attributes
    span.setAttributes(workflowSpan.attributes);

    // Add events
    workflowSpan.events.forEach(event => {
      span.addEvent(event.name, event.attributes, event.timestamp);
    });

    // Set status
    span.setStatus({
      code: workflowSpan.status.code,
      message: workflowSpan.status.message
    });

    span.end(workflowSpan.endTime || workflowSpan.startTime);
  }

  private createSpanFromOtelSpan(otelSpan: OtelSpan): void {
    const span = this.tracer.startSpan(otelSpan.operationName, {
      kind: SpanKind.INTERNAL,
      startTime: otelSpan.startTime,
    });

    // Set attributes
    span.setAttributes(otelSpan.attributes);

    // Set status
    span.setStatus({
      code: otelSpan.status.code,
      message: otelSpan.status.message || ''
    });

    span.end(otelSpan.endTime || otelSpan.startTime);
  }

  async flush(): Promise<void> {
    try {
      console.log('🔄 Flushing pending spans...');
      await this.processor.forceFlush();
      console.log('✅ Spans flushed successfully');
    } catch (error) {
      console.error('❌ Failed to flush spans:', error);
    }
  }

  private startHealthChecks(): void {
    // Send health check span every 30 seconds
    this.healthCheckInterval = setInterval(() => {
      this.sendHealthCheck();
    }, 30000);

    // Send initial health check immediately
    this.sendHealthCheck();
  }

  private sendHealthCheck(): void {
    try {
      const span = this.tracer.startSpan('telemetry-collector.health', {
        kind: SpanKind.INTERNAL,
        startTime: Date.now(),
      });

      span.setAttributes({
        'service.name': 'emp-telemetry-collector',
        'health.status': 'healthy',
        'health.check.type': 'periodic',
        'collector.dataset': this.config.dataset,
        'collector.endpoint': this.config.endpoint,
      });

      span.setStatus({ code: SpanStatusCode.OK });
      span.end(Date.now());

      console.log('💚 Sent health check span to Dash0');
    } catch (error) {
      console.error('❌ Failed to send health check:', error);
    }
  }

  async stop(): Promise<void> {
    try {
      console.log('🛑 Stopping OTLP forwarder...');

      // Stop health checks
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
      }

      await this.processor.forceFlush();
      await this.processor.shutdown();
      await this.provider.shutdown();
      console.log('✅ OTLP forwarder stopped');
    } catch (error) {
      console.error('❌ Error stopping OTLP forwarder:', error);
    }
  }

  getStats(): { pendingSpans: number; dataset: string } {
    return {
      pendingSpans: 0, // BatchSpanProcessor doesn't expose pending count
      dataset: this.config.dataset
    };
  }
}