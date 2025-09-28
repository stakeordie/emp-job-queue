/**
 * Telemetry Collector - Main Entry Point
 *
 * Redis Stream consumer that processes telemetry events and forwards to OpenTelemetry
 */

import 'dotenv/config';
import { RedisConsumer, ConsumerConfig } from './redis-consumer.js';
import { EventProcessor, ProcessorConfig } from './event-processor.js';
import { StreamConfig } from '@emp/core';

class TelemetryCollector {
  private consumer: RedisConsumer;
  private processor: EventProcessor;

  constructor() {
    // Consumer configuration
    const consumerConfig: ConsumerConfig = {
      redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
      streamKey: process.env.TELEMETRY_STREAM_KEY || StreamConfig.DEFAULT_STREAM_KEY,
      consumerGroup: process.env.CONSUMER_GROUP || StreamConfig.CONSUMER_GROUP,
      consumerName: process.env.CONSUMER_NAME || `collector-${Math.random().toString(36).substr(2, 9)}`,
      batchSize: parseInt(process.env.BATCH_SIZE || '10'),
      blockTime: parseInt(process.env.BLOCK_TIME || '5000'),
    };

    // Processor configuration
    const processorConfig: ProcessorConfig = {
      outputFormat: (process.env.OUTPUT_FORMAT as any) || 'console',
      batchSize: parseInt(process.env.PROCESSOR_BATCH_SIZE || '50'),
      flushInterval: parseInt(process.env.FLUSH_INTERVAL || '10000'),
    };

    // Create processor
    this.processor = new EventProcessor(processorConfig);

    // Create consumer with processor callback
    this.consumer = new RedisConsumer(
      consumerConfig,
      async (event) => {
        await this.processor.processEvent(event);
      }
    );

    console.log('🚀 Telemetry Collector initialized');
    console.log(`📡 Redis: ${consumerConfig.redisUrl}`);
    console.log(`📊 Stream: ${consumerConfig.streamKey}`);
    console.log(`👥 Group: ${consumerConfig.consumerGroup}`);
    console.log(`🏷️  Consumer: ${consumerConfig.consumerName}`);
  }

  async start(): Promise<void> {
    console.log('🔄 Starting Telemetry Collector...');

    // Graceful shutdown handling
    process.on('SIGTERM', () => this.stop());
    process.on('SIGINT', () => this.stop());

    // Start consumer (now resilient to Redis connection failures)
    await this.consumer.start();

    // Start health check endpoint (simple HTTP server)
    await this.startHealthCheck();

    // Log stats periodically
    this.startStatsLogging();

    console.log('✅ Telemetry Collector started successfully');
  }

  async stop(): Promise<void> {
    console.log('🛑 Shutting down Telemetry Collector...');

    try {
      await this.processor.stop();
      await this.consumer.stop();
      console.log('✅ Telemetry Collector stopped gracefully');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  }

  private async startHealthCheck(): Promise<void> {
    const http = await import('http');

    const server = http.createServer((req: any, res: any) => {
      if (req.url === '/health') {
        const stats = {
          status: 'healthy',
          consumer: this.consumer.getStats(),
          processor: this.processor.getStats(),
          uptime: process.uptime(),
          memory: process.memoryUsage(),
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(stats, null, 2));
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    const port = process.env.HEALTH_PORT || 9090;
    server.listen(port, () => {
      console.log(`🏥 Health check endpoint: http://localhost:${port}/health`);
    });
  }

  private startStatsLogging(): void {
    const interval = parseInt(process.env.STATS_INTERVAL || '60000'); // 1 minute

    setInterval(() => {
      const consumerStats = this.consumer.getStats();
      const processorStats = this.processor.getStats();

      console.log(`📊 Stats: processed=${consumerStats.processedCount}, pending=${processorStats.pendingEvents}, memory=${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
    }, interval);
  }
}

// Start the collector
const collector = new TelemetryCollector();
collector.start().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});