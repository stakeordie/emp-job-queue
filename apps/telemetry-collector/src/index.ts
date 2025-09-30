/**
 * Telemetry Collector - Main Entry Point
 *
 * Transparent OTLP HTTP endpoint that receives traces and forwards to Dash0
 * Acts as a simple proxy without creating its own spans
 */

import 'dotenv/config';
import { RedisConsumer, ConsumerConfig } from './redis-consumer.js';
import { EventProcessor, ProcessorConfig } from './event-processor.js';
import { StreamConfig } from '@emp/core';
import http from 'http';
import { OfficialOtlpForwarder } from './official-otlp-forwarder.js';

class TelemetryCollector {
  private consumer: RedisConsumer;
  private processor: EventProcessor;
  private otlpServer?: http.Server;
  private dash0Forwarder?: OfficialOtlpForwarder;

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

    // Processor configuration with Dash0 integration
    const processorConfig: ProcessorConfig = {
      outputFormat: (process.env.OUTPUT_FORMAT as any) || 'console',
      batchSize: parseInt(process.env.PROCESSOR_BATCH_SIZE || '50'),
      flushInterval: parseInt(process.env.FLUSH_INTERVAL || '10000'),

      // Dash0 configuration
      dash0: {
        enabled: process.env.DASH0_ENABLED === 'true',
        endpoint: process.env.DASH0_TRACES_ENDPOINT || process.env.DASH0_ENDPOINT + '/v1/traces',
        authToken: process.env.DASH0_AUTH_TOKEN || '',
        dataset: process.env.DASH0_DATASET || 'development',
        batchSize: parseInt(process.env.DASH0_BATCH_SIZE || '20'),
        flushInterval: parseInt(process.env.DASH0_FLUSH_INTERVAL || '5000'),
      }
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

    // Initialize Dash0 forwarder
    if (processorConfig.dash0?.enabled) {
      this.dash0Forwarder = new OfficialOtlpForwarder({
        endpoint: processorConfig.dash0.endpoint,
        authToken: processorConfig.dash0.authToken,
        dataset: processorConfig.dash0.dataset,
        batchSize: processorConfig.dash0.batchSize,
        flushInterval: processorConfig.dash0.flushInterval
      });
    }

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

    // Start OTLP HTTP endpoint (acts as transparent proxy to Dash0)
    await this.startOtlpEndpoint();

    // Start consumer (now resilient to Redis connection failures)
    await this.consumer.start();

    // Start health check endpoint only if enabled (disabled in dev to avoid port conflicts)
    if (process.env.ENABLE_HEALTH_CHECK === 'true') {
      await this.startHealthCheck();
    }

    // Log stats periodically
    this.startStatsLogging();

    console.log('✅ Telemetry Collector started successfully');
  }

  async stop(): Promise<void> {
    console.log('🛑 Shutting down Telemetry Collector...');

    try {
      if (this.otlpServer) {
        this.otlpServer.close();
      }
      await this.processor.stop();
      await this.consumer.stop();
      if (this.dash0Forwarder) {
        await this.dash0Forwarder.stop();
      }
      console.log('✅ Telemetry Collector stopped gracefully');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  }

  private async startOtlpEndpoint(): Promise<void> {
    const port = process.env.OTLP_PORT || 4318;

    this.otlpServer = http.createServer(async (req, res) => {
      // Only handle OTLP trace endpoint
      if (req.url === '/v1/traces' && req.method === 'POST') {
        let body = '';

        req.on('data', chunk => {
          body += chunk.toString();
        });

        req.on('end', async () => {
          try {
            // Parse the OTLP payload
            const payload = JSON.parse(body);

            // Forward directly to Dash0 without modification
            if (this.dash0Forwarder) {
              await this.dash0Forwarder.forwardRaw(payload);
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok' }));
          } catch (error) {
            console.error('❌ Error processing OTLP request:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
          }
        });
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    await new Promise<void>((resolve) => {
      this.otlpServer!.listen(port, () => {
        console.log(`🌐 OTLP HTTP endpoint: http://localhost:${port}/v1/traces`);
        resolve();
      });
    });
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