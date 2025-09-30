/**
 * Event Processor - Transforms telemetry events for OpenTelemetry
 *
 * Handles event routing, transformation, and batching for efficient forwarding
 */

import { TelemetryEvent, OtelSpan } from '@emp/core';
import { OfficialOtlpForwarder, Dash0Config } from './official-otlp-forwarder.js';

export interface ProcessorConfig {
  outputFormat: 'console' | 'otel' | 'both';
  batchSize: number;
  flushInterval: number;

  // Dash0 integration
  dash0?: {
    enabled: boolean;
    endpoint: string;
    authToken: string;
    dataset: string;
    batchSize: number;
    flushInterval: number;
  };
}

export class EventProcessor {
  private eventBatch: (TelemetryEvent | OtelSpan)[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private dash0Forwarder?: OfficialOtlpForwarder;

  constructor(private config: ProcessorConfig) {
    this.startFlushTimer();

    // Initialize Dash0 forwarder if enabled
    if (config.dash0?.enabled) {
      this.dash0Forwarder = new OfficialOtlpForwarder({
        endpoint: config.dash0.endpoint,
        authToken: config.dash0.authToken,
        dataset: config.dash0.dataset,
        batchSize: config.dash0.batchSize,
        flushInterval: config.dash0.flushInterval
      });

      console.log(`📊 Official OTLP forwarder initialized (dataset: ${config.dash0.dataset})`);
    }
  }

  async processEvent(event: TelemetryEvent | OtelSpan): Promise<void> {
    // Validate event exists
    if (!event) {
      console.error('Received null or undefined event');
      return;
    }

    // Forward to Dash0 immediately for real-time observability
    if (this.dash0Forwarder) {
      try {
        await this.dash0Forwarder.forwardEvent(event);
      } catch (error) {
        console.error('Failed to forward event to Dash0:', error);
      }
    }

    // Add to batch for other processing
    this.eventBatch.push(event);

    // Console output for immediate visibility
    if (this.config.outputFormat === 'console' || this.config.outputFormat === 'both') {
      try {
        this.logData(event);
      } catch (error) {
        console.error('Failed to log event:', error);
      }
    }

    // Flush if batch is full
    if (this.eventBatch.length >= this.config.batchSize) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.eventBatch.length === 0) {
      return;
    }

    const data = this.eventBatch.splice(0);

    try {
      if (this.config.outputFormat === 'otel' || this.config.outputFormat === 'both') {
        await this.forwardToOtel(data);
      }
    } catch (error) {
      console.error('Failed to forward data to OpenTelemetry:', error);
      // Could implement retry logic here
    }
  }

  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    // Flush remaining events
    await this.flush();

    // Stop Dash0 forwarder
    if (this.dash0Forwarder) {
      await this.dash0Forwarder.stop();
    }
  }

  private logData(data: TelemetryEvent | OtelSpan): void {
    if (this.isOtelSpan(data)) {
      this.logSpan(data);
    } else {
      this.logEvent(data);
    }
  }

  private logEvent(event: TelemetryEvent): void {
    // Safe timestamp handling
    let timestamp: string;
    try {
      const ts = event.timestamp;
      if (ts === undefined || ts === null || isNaN(Number(ts))) {
        timestamp = new Date().toISOString();
      } else {
        timestamp = new Date(Number(ts)).toISOString();
      }
    } catch (error) {
      timestamp = new Date().toISOString();
    }

    const level = event.level || 'info';
    const levelIcon = this.getLevelIcon(level);

    console.log(
      `${timestamp} ${levelIcon} [${event.service}] ${event.eventType} ${this.formatEventData(event)}`
    );
  }

  private logSpan(span: OtelSpan): void {
    // Safe timestamp handling for spans
    let timestamp: string;
    try {
      const startTime = span.startTime;
      if (startTime === undefined || startTime === null || isNaN(Number(startTime))) {
        timestamp = new Date().toISOString();
      } else {
        // Convert nanoseconds to milliseconds
        timestamp = new Date(Math.floor(Number(startTime) / 1_000_000)).toISOString();
      }
    } catch (error) {
      timestamp = new Date().toISOString();
    }

    const level = span.status?.code === 2 ? 'error' : 'info'; // SpanStatusCode.ERROR = 2
    const levelIcon = this.getLevelIcon(level);
    const serviceName = span.resource['service.name'];

    console.log(
      `${timestamp} ${levelIcon} [${serviceName}] ${span.operationName} ${this.formatSpanData(span)}`
    );
  }

  private getLevelIcon(level: string): string {
    switch (level) {
      case 'error': return '🔴';
      case 'warn': return '🟡';
      case 'info': return '🔵';
      case 'debug': return '⚫';
      default: return '⚪';
    }
  }

  private formatEventData(event: TelemetryEvent): string {
    const context = [];

    if (event.jobId) context.push(`job:${event.jobId.slice(0, 8)}`);
    if (event.workerId) context.push(`worker:${event.workerId.slice(0, 8)}`);
    if (event.machineId) context.push(`machine:${event.machineId.slice(0, 8)}`);
    if (event.traceId) context.push(`trace:${event.traceId.slice(0, 8)}`);

    const contextStr = context.length > 0 ? `[${context.join(' ')}]` : '';

    // Safe JSON stringification with circular reference handling
    let dataStr = '';
    if (event.data && Object.keys(event.data).length > 0) {
      try {
        dataStr = JSON.stringify(event.data);
      } catch (error) {
        // Handle circular references
        try {
          const seen = new WeakSet();
          dataStr = JSON.stringify(event.data, (key, value) => {
            if (typeof value === 'object' && value !== null) {
              if (seen.has(value)) {
                return '[Circular]';
              }
              seen.add(value);
            }
            return value;
          });
        } catch (fallbackError) {
          dataStr = '[Complex Data]';
        }
      }
    }

    return `${contextStr} ${dataStr}`.trim();
  }

  private formatSpanData(span: OtelSpan): string {
    const context = [];

    if (span.attributes['emp.job.id']) context.push(`job:${String(span.attributes['emp.job.id']).slice(0, 8)}`);
    if (span.attributes['emp.worker.id']) context.push(`worker:${String(span.attributes['emp.worker.id']).slice(0, 8)}`);
    if (span.attributes['emp.machine.id']) context.push(`machine:${String(span.attributes['emp.machine.id']).slice(0, 8)}`);
    if (span.traceId) context.push(`trace:${span.traceId.slice(0, 8)}`);
    if (span.spanId) context.push(`span:${span.spanId.slice(0, 8)}`);
    if (span.parentSpanId) context.push(`parent:${span.parentSpanId.slice(0, 8)}`);

    const contextStr = context.length > 0 ? `[${context.join(' ')}]` : '';

    // Show duration if available
    let durationStr = '';
    if (span.duration) {
      const durationMs = Math.round(span.duration / 1_000_000);
      durationStr = `(${durationMs}ms)`;
    }

    return `${contextStr} ${durationStr}`.trim();
  }

  private async forwardToOtel(data: (TelemetryEvent | OtelSpan)[]): Promise<void> {
    const spans: OtelSpan[] = [];
    const legacyEvents: TelemetryEvent[] = [];

    // Separate OTEL spans from legacy events
    for (const item of data) {
      if (this.isOtelSpan(item)) {
        spans.push(item);
      } else {
        legacyEvents.push(item);
        // Convert legacy event to OTEL span
        spans.push(this.convertEventToSpan(item));
      }
    }

    if (spans.length === 0) {
      return;
    }

    // Group spans by trace for better organization
    const traceGroups = this.groupSpansByTrace(spans);

    console.log(`📤 Forwarding ${spans.length} spans in ${Object.keys(traceGroups).length} traces to OpenTelemetry`);

    // TODO: Implement actual OTLP HTTP forwarding to Dash0
    // For now, demonstrate the structure
    for (const [traceId, traceSpans] of Object.entries(traceGroups)) {
      console.log(`  📊 Trace ${traceId.slice(0, 8)}: ${traceSpans.length} spans`);
    }
  }

  private convertEventToSpan(event: TelemetryEvent): OtelSpan {
    return {
      traceId: event.traceId,
      spanId: this.generateSpanId(),
      operationName: event.eventType,
      startTime: event.timestamp * 1_000_000, // Convert to nanoseconds
      status: {
        code: event.level === 'error' ? 2 : 1, // ERROR = 2, OK = 1
        message: event.level === 'error' ? 'ERROR' : 'OK'
      },
      resource: {
        'service.name': event.service,
        'service.version': '1.0.0',
        'service.instance.id': 'converted-legacy',
        'deployment.environment': process.env.NODE_ENV || 'development'
      },
      attributes: {
        ...event.data,
        ...(event.jobId && { 'emp.job.id': event.jobId }),
        ...(event.workerId && { 'emp.worker.id': event.workerId }),
        ...(event.machineId && { 'emp.machine.id': event.machineId }),
        ...(event.userId && { 'emp.user.id': event.userId }),
        'legacy_event': true
      }
    };
  }

  private groupSpansByTrace(spans: OtelSpan[]): Record<string, OtelSpan[]> {
    return spans.reduce((groups, span) => {
      if (!groups[span.traceId]) {
        groups[span.traceId] = [];
      }
      groups[span.traceId].push(span);
      return groups;
    }, {} as Record<string, OtelSpan[]>);
  }

  private generateSpanId(): string {
    return Math.random().toString(16).substr(2, 16).padStart(16, '0');
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      if (this.eventBatch.length > 0) {
        this.flush().catch(error => {
          console.error('Timer flush failed:', error);
        });
      }
    }, this.config.flushInterval);
  }

  getStats(): { batchSize: number; pendingEvents: number } {
    return {
      batchSize: this.config.batchSize,
      pendingEvents: this.eventBatch.length,
    };
  }

  private isOtelSpan(data: any): data is OtelSpan {
    return !!(data &&
           typeof data.spanId === 'string' &&
           typeof data.traceId === 'string' &&
           typeof data.operationName === 'string' &&
           typeof data.startTime === 'number' &&
           data.resource &&
           data.attributes);
  }
}