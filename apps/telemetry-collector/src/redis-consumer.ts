/**
 * Redis Stream Consumer for Telemetry Events
 *
 * Consumes events from Redis Stream and forwards to OpenTelemetry
 */

import Redis from 'ioredis';
import { TelemetryEvent, StreamConfig } from '@emp/core';
import { OtelSpan } from '@emp/core';

export interface ConsumerConfig {
  redisUrl: string;
  streamKey: string;
  consumerGroup: string;
  consumerName: string;
  batchSize: number;
  blockTime: number;
}

export class RedisConsumer {
  private redis: Redis;
  private isRunning = false;
  private processedCount = 0;

  constructor(
    private config: ConsumerConfig,
    private onEvent: (event: TelemetryEvent | OtelSpan) => Promise<void>
  ) {
    this.redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
      retryStrategy: () => null, // Disable ioredis retry, we handle it ourselves
      enableOfflineQueue: true,
      lazyConnect: true,
    });
  }

  async start(): Promise<void> {
    console.log('🔄 Starting Redis Stream consumer...');
    this.isRunning = true;

    // Start single connection attempt
    this.connectWithRetry();

    console.log(`✅ Redis consumer started - will connect when Redis is available`);
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

        // Connection successful, exit retry loop
        return;
      } catch (error) {
        console.error('❌ Redis connection failed:', error.message);
        console.log('🔄 Will retry Redis connection in 5 seconds...');

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  async stop(): Promise<void> {
    console.log('🛑 Stopping Redis consumer...');
    this.isRunning = false;

    try {
      if (this.redis && this.redis.status !== 'end') {
        await this.redis.quit();
      }
    } catch (error) {
      // Ignore errors during shutdown
    }

    console.log(`✅ Redis consumer stopped (processed ${this.processedCount} events)`);
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
        // Group already exists, that's fine
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

        // Also process any pending events (from previous crashes)
        await this.processPendingEvents();
      } catch (error: any) {
        console.error('Error in consume loop:', error.message);

        // If it's a connection error, restart the connection
        if (this.isConnectionError(error)) {
          console.log('🔄 Connection lost, restarting connection...');
          this.connectWithRetry();
          return; // Exit this consume loop, new one will start after reconnection
        }

        // For other errors, wait and continue
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s before retry
      }
    }
  }

  private isConnectionError(error: any): boolean {
    const connectionErrors = [
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT',
      'Connection is closed',
      'connect ECONNREFUSED'
    ];

    return connectionErrors.some(errType =>
      error.message?.includes(errType) || error.code === errType
    );
  }

  private async processStreamResults(results: any): Promise<void> {
    for (const [streamKey, messages] of results) {
      for (const [messageId, fields] of messages) {
        try {
          // Parse data from Redis fields
          const dataType = fields[0]; // 'event' or 'span'
          const dataJson = fields[1];

          let data: TelemetryEvent | OtelSpan;

          if (dataType === 'span') {
            data = JSON.parse(dataJson) as OtelSpan;
          } else {
            // Legacy event format or 'event' type
            data = JSON.parse(dataJson) as TelemetryEvent;
          }

          // Process the data
          await this.onEvent(data);

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
          // Message remains unacknowledged and will be retried
        }
      }
    }
  }

  private async processPendingEvents(): Promise<void> {
    try {
      // Get pending events for this consumer
      const pending = await this.redis.xpending(
        this.config.streamKey,
        this.config.consumerGroup,
        '-',
        '+',
        10 // Process up to 10 pending at a time
      );

      if (pending && Array.isArray(pending) && pending.length > 1) {
        const pendingMessages = pending.slice(1); // Skip the summary

        for (const pendingInfo of (pendingMessages as any[])) {
          const messageId = pendingInfo[0];

          try {
            // Claim the pending message
            const claimed = await this.redis.xclaim(
              this.config.streamKey,
              this.config.consumerGroup,
              this.config.consumerName,
              60000, // Min idle time in ms (1 minute)
              messageId
            );

            if (claimed && claimed.length > 0) {
              const [claimedId, fields] = (claimed as any[])[0];
              const dataType = fields[0];
              const dataJson = fields[1];

              let data: TelemetryEvent | OtelSpan;

              if (dataType === 'span') {
                data = JSON.parse(dataJson) as OtelSpan;
              } else {
                data = JSON.parse(dataJson) as TelemetryEvent;
              }

              await this.onEvent(data);

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
      // Ignore pending processing errors to avoid disrupting main flow
    }
  }

  getStats(): { processedCount: number; isRunning: boolean } {
    return {
      processedCount: this.processedCount,
      isRunning: this.isRunning,
    };
  }

  /**
   * Check if data is an OTEL span
   */
  private isOtelSpan(data: any): data is OtelSpan {
    return data && typeof data.spanId === 'string' && typeof data.traceId === 'string' && typeof data.operationName === 'string';
  }

  /**
   * Check if data is a legacy telemetry event
   */
  private isTelemetryEvent(data: any): data is TelemetryEvent {
    return data && typeof data.eventType === 'string' && typeof data.service === 'string';
  }
}