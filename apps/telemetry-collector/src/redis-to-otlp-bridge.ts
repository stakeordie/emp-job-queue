/**
 * Redis Stream to OTLP Bridge
 *
 * Reads telemetry events from Redis Stream and forwards as OTLP to OpenTelemetry Collector
 * This maintains the fire-and-forget Redis architecture while using real OTEL components
 */

import Redis from 'ioredis';
import { TelemetryEvent, OtelSpan, WorkflowSpan } from '@emp/core';

export interface BridgeConfig {
  redisUrl: string;
  streamKey: string;
  consumerGroup: string;
  consumerName: string;
  batchSize: number;
  blockTime: number;
  otlpEndpoint: string; // OTEL Collector HTTP endpoint (e.g., http://localhost:4318/v1/traces)
}

export class RedisToOtlpBridge {
  private redis: Redis;
  private isRunning = false;
  private processedCount = 0;

  constructor(private config: BridgeConfig) {
    this.redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
      retryStrategy: () => null,
      enableOfflineQueue: true,
      lazyConnect: true,
    });
  }

  async start(): Promise<void> {
    console.log('🌉 Starting Redis to OTLP Bridge...');
    this.isRunning = true;
    this.connectWithRetry();
    console.log(`✅ Bridge started - will connect when Redis is available`);
  }

  private async connectWithRetry(): Promise<void> {
    while (this.isRunning) {
      try {
        console.log('📡 Attempting to connect to Redis...');
        await this.redis.connect();
        console.log('✅ Connected to Redis');

        // Ensure consumer group exists
        await this.ensureConsumerGroup();

        // Start consuming events
        this.consumeLoop();
        return;
      } catch (error) {
        console.error('❌ Redis connection failed:', error.message);
        console.log('🔄 Will retry Redis connection in 5 seconds...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  private async ensureConsumerGroup(): Promise<void> {
    try {
      await this.redis.xgroup(
        'CREATE',
        this.config.streamKey,
        this.config.consumerGroup,
        '0',
        'MKSTREAM'
      );
      console.log(`📋 Created consumer group: ${this.config.consumerGroup}`);
    } catch (error: any) {
      if (error.message?.includes('BUSYGROUP')) {
        console.log(`📋 Consumer group already exists: ${this.config.consumerGroup}`);
      } else {
        throw error;
      }
    }
  }

  private async consumeLoop(): Promise<void> {
    console.log('🔄 Starting consume loop...');

    while (this.isRunning) {
      try {
        // Read new events from stream
        const results = await this.redis.xreadgroup(
          'GROUP',
          this.config.consumerGroup,
          this.config.consumerName,
          'COUNT',
          this.config.batchSize,
          'BLOCK',
          this.config.blockTime,
          'STREAMS',
          this.config.streamKey,
          '>'
        );

        if (results) {
          await this.processStreamResults(results);
        }

        // Also process any pending events
        await this.processPendingEvents();
      } catch (error: any) {
        console.error('Error in consume loop:', error.message);

        if (this.isConnectionError(error)) {
          console.log('🔄 Connection lost, restarting connection...');
          this.connectWithRetry();
          return;
        }

        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  private isConnectionError(error: any): boolean {
    const connectionErrors = [
      'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT',
      'Connection is closed', 'connect ECONNREFUSED'
    ];
    return connectionErrors.some(errType =>
      error.message?.includes(errType) || error.code === errType
    );
  }

  private async processStreamResults(results: any): Promise<void> {
    for (const [streamKey, messages] of results) {
      for (const [messageId, fields] of messages) {
        try {
          // Parse Redis event data - expecting [dataType, eventJson] format
          if (!Array.isArray(fields) || fields.length < 2) {
            console.log(`⚠️  Skipping malformed message ${messageId}: invalid fields structure`);
            continue;
          }

          const dataType = fields[0];
          const dataJson = fields[1];

          if (typeof dataJson !== 'string') {
            console.log(`⚠️  Skipping message ${messageId}: data is not a string`);
            continue;
          }

          let eventData: TelemetryEvent | OtelSpan | WorkflowSpan;

          try {
            eventData = JSON.parse(dataJson);
          } catch (parseError) {
            console.log(`⚠️  Skipping message ${messageId}: invalid JSON - ${dataJson.substring(0, 50)}...`);
            continue;
          }

          if (!eventData || typeof eventData !== 'object') {
            console.log(`⚠️  Skipping message ${messageId}: parsed data is not an object`);
            continue;
          }

          // Convert to OTLP and send to collector
          await this.sendToOtlpCollector(eventData, dataType);

          // Acknowledge the message
          await this.redis.xack(
            this.config.streamKey,
            this.config.consumerGroup,
            messageId
          );

          this.processedCount++;

          if (this.processedCount % 100 === 0) {
            console.log(`📊 Processed ${this.processedCount} events`);
          }
        } catch (error) {
          console.error(`Failed to process message ${messageId}:`, error);
        }
      }
    }
  }

  private async processPendingEvents(): Promise<void> {
    try {
      const pending = await this.redis.xpending(
        this.config.streamKey,
        this.config.consumerGroup,
        '-', '+', 10
      );

      if (pending && Array.isArray(pending) && pending.length > 1) {
        const pendingMessages = pending.slice(1);

        for (const pendingInfo of (pendingMessages as any[])) {
          const messageId = pendingInfo[0];

          try {
            const claimed = await this.redis.xclaim(
              this.config.streamKey,
              this.config.consumerGroup,
              this.config.consumerName,
              60000, // Min idle time in ms (1 minute)
              messageId
            );

            if (claimed && claimed.length > 0) {
              const [claimedId, fields] = (claimed as any[])[0];

              if (!Array.isArray(fields) || fields.length < 2) {
                console.log(`⚠️  Skipping malformed pending message ${messageId}`);
                continue;
              }

              const dataType = fields[0];
              const dataJson = fields[1];

              if (typeof dataJson !== 'string') {
                console.log(`⚠️  Skipping pending message ${messageId}: data is not a string`);
                continue;
              }

              let eventData: TelemetryEvent | OtelSpan | WorkflowSpan;

              try {
                eventData = JSON.parse(dataJson);
              } catch (parseError) {
                console.log(`⚠️  Skipping pending message ${messageId}: invalid JSON`);
                continue;
              }

              if (!eventData || typeof eventData !== 'object') {
                console.log(`⚠️  Skipping pending message ${messageId}: parsed data is not an object`);
                continue;
              }

              await this.sendToOtlpCollector(eventData, dataType);

              await this.redis.xack(
                this.config.streamKey,
                this.config.consumerGroup,
                claimedId
              );

              this.processedCount++;
            }
          } catch (error) {
            console.error(`Failed to process pending message ${messageId}:`, error);
          }
        }
      }
    } catch (error) {
      // Ignore pending processing errors
    }
  }

  private async sendToOtlpCollector(eventData: any, dataType: string): Promise<void> {
    try {
      // Convert to OTLP format
      const otlpPayload = this.convertToOtlp(eventData, dataType);

      // Send to OpenTelemetry Collector via HTTP
      const response = await fetch(this.config.otlpEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(otlpPayload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ OTLP Collector error: ${response.status} ${response.statusText} - ${errorText}`);
      } else {
        console.log(`✅ Sent ${dataType} to OTLP Collector`);
      }
    } catch (error) {
      console.error('❌ Failed to send to OTLP Collector:', error);
    }
  }

  private convertToOtlp(eventData: any, dataType: string): any {
    const now = Date.now() * 1_000_000; // Convert to nanoseconds

    if (dataType === 'span') {
      return {
        resourceSpans: [{
          resource: {
            attributes: [{
              key: 'service.name',
              value: { stringValue: eventData.service || 'emp-telemetry' }
            }]
          },
          scopeSpans: [{
            scope: {
              name: 'emp-telemetry-bridge',
              version: '1.0.0'
            },
            spans: [{
              traceId: this.formatTraceId(eventData.traceId),
              spanId: this.formatSpanId(eventData.spanId || this.generateSpanId()),
              parentSpanId: eventData.parentSpanId ? this.formatSpanId(eventData.parentSpanId) : "",
              name: eventData.operationName || eventData.eventType,
              kind: 1, // SPAN_KIND_INTERNAL
              startTimeUnixNano: eventData.startTime?.toString() || now.toString(),
              endTimeUnixNano: eventData.endTime?.toString() || now.toString(),
              status: {
                code: eventData.status?.code || (eventData.level === 'error' ? 2 : 1),
                message: eventData.status?.message || ""
              },
              attributes: this.convertAttributes(eventData),
              events: [],
              flags: 0,
              links: [],
              traceState: ""
            }]
          }]
        }]
      };
    } else {
      // Convert event to span
      return {
        resourceSpans: [{
          resource: {
            attributes: [{
              key: 'service.name',
              value: { stringValue: eventData.service || 'emp-telemetry' }
            }]
          },
          scopeSpans: [{
            scope: {
              name: 'emp-telemetry-bridge',
              version: '1.0.0'
            },
            spans: [{
              traceId: this.formatTraceId(eventData.traceId || this.generateTraceId()),
              spanId: this.formatSpanId(this.generateSpanId()),
              parentSpanId: "",
              name: eventData.eventType,
              kind: 1,
              startTimeUnixNano: (eventData.timestamp * 1_000_000).toString(),
              endTimeUnixNano: (eventData.timestamp * 1_000_000).toString(),
              status: {
                code: eventData.level === 'error' ? 2 : 1,
                message: ""
              },
              attributes: this.convertEventToAttributes(eventData),
              events: [],
              flags: 0,
              links: [],
              traceState: ""
            }]
          }]
        }]
      };
    }
  }

  private convertAttributes(data: any): Array<{ key: string; value: any }> {
    const attributes: Array<{ key: string; value: any }> = [];

    // Add correlation IDs
    if (data.jobId) attributes.push({ key: 'emp.job.id', value: { stringValue: data.jobId } });
    if (data.workerId) attributes.push({ key: 'emp.worker.id', value: { stringValue: data.workerId } });
    if (data.machineId) attributes.push({ key: 'emp.machine.id', value: { stringValue: data.machineId } });
    if (data.userId) attributes.push({ key: 'emp.user.id', value: { stringValue: data.userId } });

    // Add other attributes
    Object.entries(data.attributes || {}).forEach(([key, value]) => {
      attributes.push({ key, value: this.convertAttributeValue(value) });
    });

    return attributes;
  }

  private convertEventToAttributes(event: any): Array<{ key: string; value: any }> {
    const attributes: Array<{ key: string; value: any }> = [];

    // Add correlation IDs
    if (event.jobId) attributes.push({ key: 'emp.job.id', value: { stringValue: event.jobId } });
    if (event.workerId) attributes.push({ key: 'emp.worker.id', value: { stringValue: event.workerId } });
    if (event.machineId) attributes.push({ key: 'emp.machine.id', value: { stringValue: event.machineId } });
    if (event.userId) attributes.push({ key: 'emp.user.id', value: { stringValue: event.userId } });

    // Add event data
    Object.entries(event.data || {}).forEach(([key, value]) => {
      attributes.push({ key, value: this.convertAttributeValue(value) });
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
    const cleaned = traceId.replace(/[^a-f0-9]/gi, '');
    return cleaned.padStart(32, '0').slice(0, 32);
  }

  private formatSpanId(spanId: string): string {
    const cleaned = spanId.replace(/[^a-f0-9]/gi, '');
    return cleaned.padStart(16, '0').slice(0, 16);
  }

  private generateSpanId(): string {
    return Math.random().toString(16).slice(2, 18).padStart(16, '0');
  }

  private generateTraceId(): string {
    return Math.random().toString(16).slice(2, 18).padStart(32, '0');
  }

  async stop(): Promise<void> {
    console.log('🛑 Stopping Redis to OTLP Bridge...');
    this.isRunning = false;

    try {
      if (this.redis && this.redis.status !== 'end') {
        await this.redis.quit();
      }
    } catch (error) {
      // Ignore errors during shutdown
    }

    console.log(`✅ Bridge stopped (processed ${this.processedCount} events)`);
  }

  getStats(): { processedCount: number; isRunning: boolean } {
    return {
      processedCount: this.processedCount,
      isRunning: this.isRunning,
    };
  }
}