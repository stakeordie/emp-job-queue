/**
 * Redis Stream-based Event Client
 * Phase 4 Implementation from Execution Plan
 *
 * Lightweight, fire-and-forget event emission to Redis Stream
 * Never blocks service operation - silent failure on errors
 */
import Redis from 'ioredis';

export const TELEMETRY_CONFIG = {
  streamName: 'telemetry:events',
  maxLength: 10000, // Keep last 10k events
  retention: 24 * 60 * 60 * 1000, // 24 hours
  trimStrategy: 'MAXLEN' // Trim by count, not time
};

export class EventClient {
  redis = null;
  serviceName: string;
  connected = false;

  constructor(serviceName: string, redisUrl?: string) {
    this.serviceName = serviceName;

    // Initialize Redis connection
    try {
      const url = redisUrl || process.env.HUB_REDIS_URL || process.env.REDIS_URL || 'redis://localhost:6379';
      this.redis = new Redis(url, {
        // Non-blocking configuration - never wait for Redis
        connectTimeout: 1000,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false, // Critical: don't queue commands when offline
      });

      this.redis.on('connect', () => {
        this.connected = true;
      });

      this.redis.on('error', (error) => {
        this.connected = false;
        // Silent failure - never log errors to avoid spam
      });

      this.redis.on('close', () => {
        this.connected = false;
      });

      // Attempt connection but don't wait for it
      this.redis.connect().catch(() => {
        // Silent failure - service continues without telemetry
      });
    } catch (error) {
      // Silent failure - service continues without telemetry
      this.redis = null;
    }
  }

  /**
   * Generate a trace ID for event correlation
   */
  generateTraceId(): string {
    return `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Fire-and-forget event emission to Redis Stream
   * Never blocks service operation
   */
  async event(type: string, data: Record<string, any> = {}): Promise<void> {
    if (!this.redis || !this.connected) {
      return; // Silent failure - service continues
    }

    try {
      const event = {
        timestamp: Date.now(),
        service: this.serviceName,
        eventType: type,
        traceId: this.generateTraceId(),
        data,
        level: data.level || 'info'
      };

      // Add to Redis Stream with automatic trimming
      await this.redis.xadd(
        TELEMETRY_CONFIG.streamName,
        'MAXLEN', '~', TELEMETRY_CONFIG.maxLength,
        '*', // Let Redis generate timestamp ID
        'timestamp', event.timestamp.toString(),
        'service', event.service,
        'eventType', event.eventType,
        'traceId', event.traceId,
        'level', event.level || 'info',
        'data', JSON.stringify(event.data)
      );
    } catch (error) {
      // Silent failure - never break service operation
    }
  }

  /**
   * Job-related event with jobId correlation
   */
  async jobEvent(jobId: string, type: string, data: Record<string, any> = {}): Promise<void> {
    return this.event(type, { jobId, ...data });
  }

  /**
   * Worker-related event with workerId correlation
   */
  async workerEvent(workerId: string, type: string, data: Record<string, any> = {}): Promise<void> {
    return this.event(type, { workerId, ...data });
  }

  /**
   * Machine-related event with machineId correlation
   */
  async machineEvent(machineId: string, type: string, data: Record<string, any> = {}): Promise<void> {
    return this.event(type, { machineId, ...data });
  }

  /**
   * Error event with enhanced error information
   */
  async errorEvent(errorType: string, error: Error, context?: Record<string, any>): Promise<void> {
    return this.event(`error.${errorType}`, {
      message: error.message,
      stack: error.stack,
      name: error.constructor.name,
      level: 'error',
      ...context
    });
  }

  /**
   * Graceful shutdown
   */
  async close(): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch (error) {
        // Silent failure
      }
      this.redis = null;
    }
  }

  /**
   * Flush any pending operations (no-op for fire-and-forget)
   */
  async flush(): Promise<void> {
    // No-op - events are sent immediately
  }
}

// Service-specific instances for convenience
let apiTelemetry: EventClient | null = null;
let workerTelemetry: EventClient | null = null;
let machineTelemetry: EventClient | null = null;
let webhookTelemetry: EventClient | null = null;
let monitorTelemetry: EventClient | null = null;

export const getApiTelemetry = (): EventClient => {
  if (!apiTelemetry) {
    apiTelemetry = new EventClient('api-server');
  }
  return apiTelemetry;
};

export const getWorkerTelemetry = (): EventClient => {
  if (!workerTelemetry) {
    workerTelemetry = new EventClient('worker');
  }
  return workerTelemetry;
};

export const getMachineTelemetry = (): EventClient => {
  if (!machineTelemetry) {
    machineTelemetry = new EventClient('machine');
  }
  return machineTelemetry;
};

export const getWebhookTelemetry = (): EventClient => {
  if (!webhookTelemetry) {
    webhookTelemetry = new EventClient('webhook-service');
  }
  return webhookTelemetry;
};

export const getMonitorTelemetry = (): EventClient => {
  if (!monitorTelemetry) {
    monitorTelemetry = new EventClient('monitor');
  }
  return monitorTelemetry;
};

// Legacy compatibility exports
export { getWorkerTelemetry as workerTelemetry };
export { getMachineTelemetry as machineTelemetry };
export { getApiTelemetry as apiTelemetry };
export { getWebhookTelemetry as webhookTelemetry };
export { getMonitorTelemetry as monitorTelemetry };