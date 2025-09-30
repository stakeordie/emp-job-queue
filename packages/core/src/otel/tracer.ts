/**
 * OpenTelemetry Tracer Initialization
 * Shared across all services (API, Worker, Machines)
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { trace, context, Span, SpanStatusCode } from '@opentelemetry/api';

export interface TracerConfig {
  serviceName: string;
  serviceVersion?: string;
  collectorEndpoint: string; // Points to your telemetry-collector
  environment?: string;
}

let sdk: NodeSDK | null = null;

/**
 * Initialize OpenTelemetry SDK
 * Call this ONCE at service startup before any other operations
 */
export function initTracer(config: TracerConfig): void {
  if (sdk) {
    console.warn('OpenTelemetry SDK already initialized');
    return;
  }

  const exporter = new OTLPTraceExporter({
    url: `${config.collectorEndpoint}/v1/traces`,
    headers: {},
  });

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.serviceName,
      [ATTR_SERVICE_VERSION]: config.serviceVersion || '1.0.0',
      'deployment.environment': config.environment || process.env.NODE_ENV || 'development'
    }),
    spanProcessor: new BatchSpanProcessor(exporter, {
      maxQueueSize: 2048,
      maxExportBatchSize: 512,
      scheduledDelayMillis: 5000,
    }),
  });

  sdk.start();
  console.log(`🔭 OpenTelemetry initialized: ${config.serviceName} -> ${config.collectorEndpoint}`);
}

/**
 * Get tracer for a specific component
 */
export function getTracer(name: string) {
  return trace.getTracer(name);
}

/**
 * Graceful shutdown
 */
export async function shutdownTracer(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = null;
  }
}

// Re-export OpenTelemetry API for convenience
export { trace, context, Span, SpanStatusCode };
export type { Tracer } from '@opentelemetry/api';
