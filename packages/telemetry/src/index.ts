/**
 * @emp/telemetry - OTLP-Native Telemetry Client
 *
 * Simple wrapper around OpenTelemetry SDK that sends directly to OTLP collector
 * Preserves service attribution for proper service topology in Dash0
 */

import { trace, metrics, Span, SpanStatusCode, SpanKind, context } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT
} from '@opentelemetry/semantic-conventions';

export interface TelemetryConfig {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  collectorEndpoint?: string;
}

export interface SpanOptions {
  kind?: SpanKind;
  attributes?: Record<string, string | number | boolean>;
}

export class EmpTelemetryClient {
  private sdk: NodeSDK;
  private serviceName: string;
  private tracer: any;
  private meter: any;

  constructor(config: TelemetryConfig) {
    this.serviceName = config.serviceName;

    const collectorEndpoint = config.collectorEndpoint || process.env.OTEL_COLLECTOR_ENDPOINT || 'http://localhost:4318';

    // Create resource with service information
    const resource = new Resource({
      [SEMRESATTRS_SERVICE_NAME]: config.serviceName,
      [SEMRESATTRS_SERVICE_VERSION]: config.serviceVersion || '1.0.0',
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: config.environment || process.env.NODE_ENV || 'development',
    });

    // Create OTLP exporters
    const traceExporter = new OTLPTraceExporter({
      url: `${collectorEndpoint}/v1/traces`,
    });

    const metricExporter = new OTLPMetricExporter({
      url: `${collectorEndpoint}/v1/metrics`,
    });

    // Initialize SDK
    const metricReader = new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 5000,
    });

    this.sdk = new NodeSDK({
      resource,
      traceExporter,
      metricReader: metricReader as any, // Type workaround for SDK compatibility
    });

    // Start SDK
    this.sdk.start();

    // Get tracer and meter
    this.tracer = trace.getTracer(config.serviceName, config.serviceVersion || '1.0.0');
    this.meter = metrics.getMeter(config.serviceName, config.serviceVersion || '1.0.0');

    console.log(`✅ EmpTelemetryClient initialized for service: ${config.serviceName}`);
    console.log(`📡 OTLP Collector: ${collectorEndpoint}`);
  }

  /**
   * Create a span and execute a function within it
   */
  async withSpan<T>(
    name: string,
    fn: (span: Span) => Promise<T>,
    options?: SpanOptions
  ): Promise<T> {
    return await this.tracer.startActiveSpan(name, { kind: options?.kind || SpanKind.INTERNAL }, async (span: Span) => {
      try {
        // Add attributes if provided
        if (options?.attributes) {
          span.setAttributes(options.attributes);
        }

        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Record a metric gauge value
   */
  gauge(name: string, value: number, attributes?: Record<string, string>): void {
    const gauge = this.meter.createObservableGauge(name);
    gauge.addCallback((observableResult: any) => {
      observableResult.observe(value, attributes || {});
    });
  }

  /**
   * Increment a counter
   */
  counter(name: string, value: number = 1, attributes?: Record<string, string>): void {
    const counter = this.meter.createCounter(name);
    counter.add(value, attributes || {});
  }

  /**
   * Record a histogram value (e.g., latency, request size)
   */
  histogram(name: string, value: number, attributes?: Record<string, string>): void {
    const histogram = this.meter.createHistogram(name);
    histogram.record(value, attributes || {});
  }

  /**
   * Add event to current span (structured logging within trace context)
   */
  addEvent(name: string, attributes?: Record<string, any>): void {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.addEvent(name, attributes);
    } else {
      // If no active span, create a short-lived span for the event
      const span = this.tracer.startSpan(name, { kind: SpanKind.INTERNAL });
      if (attributes) {
        span.setAttributes(attributes);
      }
      span.end();
    }
  }

  /**
   * Shutdown telemetry (flush remaining data)
   */
  async shutdown(): Promise<void> {
    console.log(`🛑 Shutting down telemetry for ${this.serviceName}...`);
    await this.sdk.shutdown();
    console.log(`✅ Telemetry shutdown complete`);
  }
}

/**
 * Factory function to create telemetry client
 */
export function createTelemetryClient(config: TelemetryConfig): EmpTelemetryClient {
  return new EmpTelemetryClient(config);
}

// Export OpenTelemetry types for convenience
export { Span, SpanKind, SpanStatusCode } from '@opentelemetry/api';
