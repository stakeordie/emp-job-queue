/**
 * Dash0 OpenTelemetry Forwarder
 *
 * Converts telemetry events to OTLP format and forwards to Dash0
 */

import { TelemetryEvent, OtelSpan, WorkflowSpan } from '@emp/core';

export interface Dash0Config {
  endpoint: string;
  authToken: string;
  dataset: string;
  batchSize: number;
  flushInterval: number;
}

export interface OtlpSpan {
  traceId: string;
  spanId: string;
  parentSpanId: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string; // Made required
  status: {
    code: number;
    message: string; // Made required
  };
  attributes: Array<{
    key: string;
    value: {
      stringValue?: string;
      intValue?: string;
      doubleValue?: number;
      boolValue?: boolean;
    };
  }>;
  events: any[];
  flags: number;
  links: any[];
  traceState: string;
}

export class Dash0Forwarder {
  private spanBatch: OtlpSpan[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(private config: Dash0Config) {
    this.startFlushTimer();
  }

  async forwardEvent(event: TelemetryEvent | OtelSpan | WorkflowSpan): Promise<void> {
    let otlpSpan: OtlpSpan;

    if (this.isWorkflowSpan(event)) {
      otlpSpan = this.convertWorkflowSpanToOtlp(event);
    } else if (this.isOtelSpan(event)) {
      otlpSpan = this.convertOtelSpanToOtlp(event);
    } else {
      otlpSpan = this.convertEventToOtlp(event);
    }

    this.spanBatch.push(otlpSpan);

    if (this.spanBatch.length >= this.config.batchSize) {
      await this.flush();
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

  private convertWorkflowSpanToOtlp(span: WorkflowSpan): OtlpSpan {
    const startTime = (span.startTime * 1_000_000).toString(); // Convert ms to ns
    const endTime = span.endTime ? (span.endTime * 1_000_000).toString() : startTime;

    // Convert WorkflowSpan events to OTLP span events
    const spanEvents = span.events.map(event => ({
      timeUnixNano: (event.timestamp * 1_000_000).toString(),
      name: event.name,
      attributes: Object.entries(event.attributes || {}).map(([key, value]) => ({
        key,
        value: this.convertAttributeValue(value)
      }))
    }));

    return {
      traceId: this.formatTraceId(span.traceId),
      spanId: this.formatSpanId(span.spanId),
      parentSpanId: span.parentSpanId ? this.formatSpanId(span.parentSpanId) : "",
      name: span.operationName,
      kind: 1, // SPAN_KIND_INTERNAL
      startTimeUnixNano: startTime,
      endTimeUnixNano: endTime,
      status: {
        code: span.status.code,
        message: span.status.message
      },
      attributes: this.convertAttributes(span.attributes),
      events: spanEvents,
      flags: 0,
      links: [],
      traceState: ""
    };
  }

  private convertOtelSpanToOtlp(span: OtelSpan): OtlpSpan {
    const startTime = span.startTime.toString();
    const endTime = span.endTime?.toString() || startTime; // Fallback to start time

    return {
      traceId: this.formatTraceId(span.traceId),
      spanId: this.formatSpanId(span.spanId),
      parentSpanId: span.parentSpanId ? this.formatSpanId(span.parentSpanId) : "",
      name: span.operationName,
      kind: 1, // SPAN_KIND_INTERNAL
      startTimeUnixNano: startTime,
      endTimeUnixNano: endTime,
      status: {
        code: span.status.code,
        message: span.status.message || ""
      },
      attributes: this.convertAttributes(span.attributes),
      events: [],
      flags: 0,
      links: [],
      traceState: ""
    };
  }

  private convertEventToOtlp(event: TelemetryEvent): OtlpSpan {
    // Generate span ID for legacy events
    const spanId = this.generateSpanId();
    const traceId = event.traceId || this.generateTraceId();

    // Ensure proper nanosecond timestamp
    const timestampNs = (event.timestamp * 1_000_000).toString(); // Convert ms to ns

    return {
      traceId: this.formatTraceId(traceId),
      spanId: this.formatSpanId(spanId),
      parentSpanId: "",
      name: event.eventType,
      kind: 1, // SPAN_KIND_INTERNAL
      startTimeUnixNano: timestampNs,
      endTimeUnixNano: timestampNs, // Set end time same as start for instant events
      status: {
        code: event.level === 'error' ? 2 : 1, // ERROR : OK
        message: ""
      },
      attributes: this.convertEventDataToAttributes(event),
      events: [],
      flags: 0,
      links: [],
      traceState: ""
    };
  }

  private convertAttributes(attributes: Record<string, any>): Array<{ key: string; value: any }> {
    return Object.entries(attributes).map(([key, value]) => ({
      key,
      value: this.convertAttributeValue(value)
    }));
  }


  private convertEventDataToAttributes(event: TelemetryEvent): Array<{ key: string; value: any }> {
    const attributes: Array<{ key: string; value: any }> = [];

    // Add correlation IDs
    if (event.jobId) {
      attributes.push({
        key: 'emp.job.id',
        value: { stringValue: event.jobId }
      });
    }
    if (event.workerId) {
      attributes.push({
        key: 'emp.worker.id',
        value: { stringValue: event.workerId }
      });
    }
    if (event.machineId) {
      attributes.push({
        key: 'emp.machine.id',
        value: { stringValue: event.machineId }
      });
    }
    if (event.userId) {
      attributes.push({
        key: 'emp.user.id',
        value: { stringValue: event.userId }
      });
    }

    // Add event data
    Object.entries(event.data || {}).forEach(([key, value]) => {
      attributes.push({
        key,
        value: this.convertAttributeValue(value)
      });
    });

    return attributes;
  }

  private convertAttributeValue(value: any): any {
    if (typeof value === 'string') {
      return { stringValue: value };
    } else if (typeof value === 'number') {
      return Number.isInteger(value) ? { intValue: value.toString() } : { doubleValue: value };
    } else if (typeof value === 'boolean') {
      return { boolValue: value };
    } else {
      return { stringValue: JSON.stringify(value) };
    }
  }

  private formatTraceId(traceId: string): string {
    // Ensure trace ID is 32 hex characters, then convert to base64
    const cleaned = traceId.replace(/[^a-f0-9]/gi, '');
    const hex = cleaned.padStart(32, '0').slice(0, 32);
    // Convert hex string to bytes then to base64 (OTLP/HTTP+JSON requirement)
    const bytes = Buffer.from(hex, 'hex');
    return bytes.toString('base64');
  }

  private formatSpanId(spanId: string): string {
    // Ensure span ID is 16 hex characters, then convert to base64
    const cleaned = spanId.replace(/[^a-f0-9]/gi, '');
    const hex = cleaned.padStart(16, '0').slice(0, 16);
    // Convert hex string to bytes then to base64 (OTLP/HTTP+JSON requirement)
    const bytes = Buffer.from(hex, 'hex');
    return bytes.toString('base64');
  }

  private generateSpanId(): string {
    return Math.random().toString(16).slice(2, 18).padStart(16, '0');
  }

  private generateTraceId(): string {
    return Math.random().toString(16).slice(2, 18).padStart(32, '0');
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(error => {
        console.error('Timer flush failed:', error);
      });
    }, this.config.flushInterval);
  }

  async flush(): Promise<void> {
    if (this.spanBatch.length === 0) {
      return;
    }

    const spans = this.spanBatch.splice(0);

    try {
      const otlpPayload = {
        resourceSpans: [
          {
            resource: {
              attributes: [
                {
                  key: 'service.name',
                  value: { stringValue: 'emp-telemetry' }
                }
              ]
            },
            scopeSpans: [
              {
                schemaUrl: "",
                scope: {
                  name: 'emp-telemetry-collector',
                  version: '1.0.0',
                  attributes: []
                },
                spans: spans
              }
            ]
          }
        ]
      };

      console.log(`🌐 Sending ${spans.length} spans to Dash0: ${this.config.endpoint}`);
      console.log(`🔑 Auth token: ${this.config.authToken.substring(0, 10)}...`);
      console.log(`📊 Dataset: ${this.config.dataset}`);
      console.log(`📦 OTLP Payload:`, JSON.stringify(otlpPayload, null, 2));

      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.authToken}`,
          'Dash0-Dataset': this.config.dataset,
          'User-Agent': 'emp-telemetry-collector/1.0.0'
        },
        body: JSON.stringify(otlpPayload)
      });

      console.log(`📡 Dash0 response: ${response.status} ${response.statusText}`);
      console.log(`📋 Response headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()))}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Dash0 error response body: ${errorText}`);
        throw new Error(`Dash0 forwarding failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const responseText = await response.text();
      console.log(`✅ Dash0 success response: ${responseText}`);
      console.log(`📊 Successfully forwarded ${spans.length} spans to Dash0 (${this.config.dataset})`);

    } catch (error) {
      console.error('❌ Failed to forward spans to Dash0:', error);
      // Re-add spans to batch for retry
      this.spanBatch.unshift(...spans);
    }
  }

  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    await this.flush();
  }

  getStats(): { pendingSpans: number; dataset: string } {
    return {
      pendingSpans: this.spanBatch.length,
      dataset: this.config.dataset
    };
  }
}