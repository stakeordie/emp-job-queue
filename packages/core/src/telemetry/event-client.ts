/**
 * Event Client - Simple API for emitting telemetry events
 *
 * Provides fire-and-forget event emission with Redis Stream backend
 * and local buffering for resilience
 */

import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { TelemetryEvent, TelemetryConfig, StreamConfig } from './types.js';
import { OtelSpan, EmpSpanTypes, EmpSpanFactory, EmpTraceContext, SpanStatusCode, ResourceAttributes } from './otel-types.js';

export class EventClient {
  private redis: Redis | null = null;
  private buffer: OtelSpan[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private isConnected = false;
  private resourceAttributes: ResourceAttributes;

  constructor(
    private config: TelemetryConfig,
    private traceId: string = uuidv4()
  ) {
    this.resourceAttributes = {
      'service.name': config.serviceName,
      'service.version': process.env.SERVICE_VERSION || '1.0.0',
      'service.instance.id': process.env.SERVICE_INSTANCE_ID || this.generateInstanceId(),
      'deployment.environment': process.env.NODE_ENV || 'development'
    };
    this.initializeRedis();
    this.startFlushTimer();
  }

  /**
   * Emit a telemetry span (fire-and-forget)
   */
  async span(
    operationType: EmpSpanTypes | string,
    data: Record<string, any> = {},
    options: {
      jobId?: string;
      workerId?: string;
      machineId?: string;
      userId?: string;
      parentSpanId?: string;
      traceId?: string;
      duration?: number;
      status?: 'ok' | 'error' | 'unset';
    } = {}
  ): Promise<string> {
    const traceContext: EmpTraceContext = {
      traceId: options.traceId || this.traceId,
      parentSpanId: options.parentSpanId,
      traceFlags: 1, // Sampled
    };

    const span: OtelSpan = {
      traceId: traceContext.traceId,
      spanId: this.generateSpanId(),
      parentSpanId: traceContext.parentSpanId,
      operationName: operationType,
      startTime: Date.now() * 1_000_000, // Convert to nanoseconds
      status: {
        code: options.status === 'ok' ? SpanStatusCode.OK :
              options.status === 'error' ? SpanStatusCode.ERROR :
              SpanStatusCode.UNSET
      },
      resource: this.resourceAttributes,
      attributes: this.buildSpanAttributes(data, options),
    };

    // Add end time if duration provided
    if (options.duration) {
      span.endTime = span.startTime + (options.duration * 1_000_000);
      span.duration = options.duration * 1_000_000;
    }

    // Add to buffer (never blocks)
    this.buffer.push(span);

    // Trim buffer if too large
    if (this.buffer.length > this.config.maxBufferSize) {
      this.buffer = this.buffer.slice(-this.config.maxBufferSize);
    }

    // Try immediate flush if connected
    if (this.isConnected && this.buffer.length >= this.config.batchSize) {
      this.flushEvents().catch(() => {
        // Silent failure - events remain in buffer for retry
      });
    }

    return span.spanId;
  }

  /**
   * Emit a simple event (backward compatibility)
   */
  async event(
    eventType: string,
    data: Record<string, any> = {},
    options: {
      jobId?: string;
      workerId?: string;
      machineId?: string;
      userId?: string;
      level?: 'debug' | 'info' | 'warn' | 'error';
      traceId?: string;
    } = {}
  ): Promise<void> {
    const status = options.level === 'error' ? 'error' : 'ok';
    await this.span(eventType, data, { ...options, status });
  }

  /**
   * Job-specific span helper
   */
  async jobSpan(
    jobId: string,
    operationType: EmpSpanTypes,
    data: Record<string, any> = {},
    options: {
      parentSpanId?: string;
      traceId?: string;
      duration?: number;
      status?: 'ok' | 'error' | 'unset';
    } = {}
  ): Promise<string> {
    return this.span(operationType, data, { jobId, ...options });
  }

  /**
   * Job-specific event helper (backward compatibility)
   */
  async jobEvent(
    jobId: string,
    eventType: string,
    data: Record<string, any> = {},
    options: {
      level?: 'debug' | 'info' | 'warn' | 'error';
      traceId?: string;
    } = {}
  ): Promise<void> {
    return this.event(eventType, data, { jobId, ...options });
  }

  /**
   * Worker-specific span helper
   */
  async workerSpan(
    workerId: string,
    operationType: EmpSpanTypes,
    data: Record<string, any> = {},
    options: {
      parentSpanId?: string;
      traceId?: string;
      duration?: number;
      status?: 'ok' | 'error' | 'unset';
    } = {}
  ): Promise<string> {
    return this.span(operationType, data, { workerId, ...options });
  }

  /**
   * Worker-specific event helper (backward compatibility)
   */
  async workerEvent(
    workerId: string,
    eventType: string,
    data: Record<string, any> = {},
    options: {
      level?: 'debug' | 'info' | 'warn' | 'error';
      traceId?: string;
    } = {}
  ): Promise<void> {
    return this.event(eventType, data, { workerId, ...options });
  }

  /**
   * Disconnect method (alias for close for backward compatibility)
   */
  async disconnect(): Promise<void> {
    return this.close();
  }

  /**
   * Error event helper
   */
  async errorEvent(
    error: Error | string,
    context: Record<string, any> = {}
  ): Promise<void> {
    const errorData = {
      error: typeof error === 'string' ? error : error.message,
      stack: typeof error === 'object' ? error.stack : undefined,
      ...context,
    };

    return this.event('error.occurred', errorData, { level: 'error' });
  }

  /**
   * Flush all buffered events to Redis
   */
  async flush(): Promise<void> {
    await this.flushEvents();
  }

  /**
   * Close the client and flush remaining events
   */
  async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    await this.flush();

    if (this.redis) {
      await this.redis.quit();
    }
  }

  private buildSpanAttributes(data: Record<string, any>, options: any): Record<string, any> {
    const attributes: Record<string, any> = { ...data };

    // Add EMP-specific attributes
    if (options.jobId) attributes['emp.job.id'] = options.jobId;
    if (options.workerId) attributes['emp.worker.id'] = options.workerId;
    if (options.machineId) attributes['emp.machine.id'] = options.machineId;
    if (options.userId) attributes['emp.user.id'] = options.userId;

    return attributes;
  }

  private generateSpanId(): string {
    return Math.random().toString(16).substr(2, 16).padStart(16, '0');
  }

  private generateInstanceId(): string {
    return `${this.config.serviceName}-${Math.random().toString(36).substr(2, 8)}`;
  }

  private async initializeRedis(): Promise<void> {
    try {
      this.redis = new Redis(this.config.redisUrl, {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
      });

      this.redis.on('connect', () => {
        this.isConnected = true;
      });

      this.redis.on('error', () => {
        this.isConnected = false;
      });

      // Test connection
      await this.redis.ping();
      this.isConnected = true;
    } catch (error) {
      this.isConnected = false;
      // Silent failure - will retry on flush timer
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      if (this.buffer.length > 0) {
        this.flushEvents().catch(() => {
          // Silent failure - will retry next interval
        });
      }
    }, this.config.flushInterval);
  }

  private async flushEvents(): Promise<void> {
    if (this.buffer.length === 0 || !this.redis) {
      return;
    }

    // Reconnect if needed
    if (!this.isConnected) {
      try {
        await this.redis.ping();
        this.isConnected = true;
      } catch {
        return; // Can't connect, try again later
      }
    }

    const eventsToFlush = this.buffer.splice(0, this.config.batchSize);

    try {
      // Send events to Redis Stream
      const pipeline = this.redis.pipeline();

      for (const span of eventsToFlush) {
        pipeline.xadd(
          this.config.streamKey,
          '*', // Auto-generate ID
          'span',
          JSON.stringify(span)
        );
      }

      await pipeline.exec();
    } catch (error) {
      // Return spans to buffer on failure
      this.buffer.unshift(...eventsToFlush);
      this.isConnected = false;
      throw error;
    }
  }
}

/**
 * Create a new EventClient with default configuration
 */
export function createEventClient(
  serviceName: string,
  redisUrl?: string
): EventClient {
  const config: TelemetryConfig = {
    redisUrl: redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
    streamKey: StreamConfig.DEFAULT_STREAM_KEY,
    serviceName,
    maxBufferSize: StreamConfig.DEFAULT_BUFFER_SIZE,
    batchSize: StreamConfig.DEFAULT_BATCH_SIZE,
    flushInterval: StreamConfig.DEFAULT_FLUSH_INTERVAL,
  };

  return new EventClient(config);
}

/**
 * Create a new EventClient with partial configuration (fills in defaults)
 */
export function createEventClientWithDefaults(
  config: Partial<TelemetryConfig> & { serviceName: string }
): EventClient {
  const fullConfig: TelemetryConfig = {
    redisUrl: config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
    streamKey: config.streamKey || StreamConfig.DEFAULT_STREAM_KEY,
    serviceName: config.serviceName,
    maxBufferSize: config.maxBufferSize || StreamConfig.DEFAULT_BUFFER_SIZE,
    batchSize: config.batchSize || StreamConfig.DEFAULT_BATCH_SIZE,
    flushInterval: config.flushInterval || StreamConfig.DEFAULT_FLUSH_INTERVAL,
  };

  return new EventClient(fullConfig);
}