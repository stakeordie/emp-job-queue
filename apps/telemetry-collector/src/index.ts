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
    // Consumer configuration - NO FALLBACKS
    if (!process.env.REDIS_URL) throw new Error('REDIS_URL environment variable is required');
    if (!process.env.TELEMETRY_STREAM_KEY) throw new Error('TELEMETRY_STREAM_KEY environment variable is required');
    if (!process.env.CONSUMER_GROUP) throw new Error('CONSUMER_GROUP environment variable is required');
    if (!process.env.CONSUMER_NAME) throw new Error('CONSUMER_NAME environment variable is required');
    if (!process.env.BATCH_SIZE) throw new Error('BATCH_SIZE environment variable is required');
    if (!process.env.BLOCK_TIME) throw new Error('BLOCK_TIME environment variable is required');

    const consumerConfig: ConsumerConfig = {
      redisUrl: process.env.REDIS_URL,
      streamKey: process.env.TELEMETRY_STREAM_KEY,
      consumerGroup: process.env.CONSUMER_GROUP,
      consumerName: process.env.CONSUMER_NAME,
      batchSize: parseInt(process.env.BATCH_SIZE),
      blockTime: parseInt(process.env.BLOCK_TIME),
    };

    // Processor configuration - NO FALLBACKS
    if (!process.env.OUTPUT_FORMAT) throw new Error('OUTPUT_FORMAT environment variable is required');
    if (!process.env.PROCESSOR_BATCH_SIZE) throw new Error('PROCESSOR_BATCH_SIZE environment variable is required');
    if (!process.env.FLUSH_INTERVAL) throw new Error('FLUSH_INTERVAL environment variable is required');

    const processorConfig: ProcessorConfig = {
      outputFormat: process.env.OUTPUT_FORMAT as any,
      batchSize: parseInt(process.env.PROCESSOR_BATCH_SIZE),
      flushInterval: parseInt(process.env.FLUSH_INTERVAL),

      // Dash0 configuration - NO FALLBACKS
      dash0: {
        enabled: process.env.DASH0_ENABLED === 'true',
        endpoint: (() => {
          if (process.env.DASH0_ENABLED === 'true') {
            if (!process.env.DASH0_TRACES_ENDPOINT) throw new Error('DASH0_TRACES_ENDPOINT environment variable is required when DASH0_ENABLED=true');
            if (!process.env.DASH0_AUTH_TOKEN) throw new Error('DASH0_AUTH_TOKEN environment variable is required when DASH0_ENABLED=true');
            if (!process.env.DASH0_DATASET) throw new Error('DASH0_DATASET environment variable is required when DASH0_ENABLED=true');
            if (!process.env.DASH0_BATCH_SIZE) throw new Error('DASH0_BATCH_SIZE environment variable is required when DASH0_ENABLED=true');
            if (!process.env.DASH0_FLUSH_INTERVAL) throw new Error('DASH0_FLUSH_INTERVAL environment variable is required when DASH0_ENABLED=true');
          }
          return process.env.DASH0_TRACES_ENDPOINT || '';
        })(),
        authToken: process.env.DASH0_AUTH_TOKEN || '',
        dataset: process.env.DASH0_DATASET || '',
        batchSize: parseInt(process.env.DASH0_BATCH_SIZE || '0'),
        flushInterval: parseInt(process.env.DASH0_FLUSH_INTERVAL || '0'),
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
    console.log('🔍 DEBUG: About to call startOtlpEndpoint() - CODE VERSION 2');

    // Graceful shutdown handling
    process.on('SIGTERM', () => this.stop());
    process.on('SIGINT', () => this.stop());

    // Start OTLP HTTP endpoint (acts as transparent proxy to Dash0)
    console.log('🔍 DEBUG: Calling startOtlpEndpoint() NOW...');
    await this.startOtlpEndpoint();
    console.log('🔍 DEBUG: startOtlpEndpoint() returned successfully');

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
    if (!process.env.OTLP_PORT) throw new Error('OTLP_PORT environment variable is required');
    const port = parseInt(process.env.OTLP_PORT);

    console.log(`🔧 Starting OTLP HTTP endpoint on port ${port}...`);

    this.otlpServer = http.createServer(async (req, res) => {
      // Only handle OTLP trace endpoint
      if (req.url === '/v1/traces' && req.method === 'POST') {
        let body = '';

        req.on('data', chunk => {
          body += chunk.toString();
        });

        req.on('end', async () => {
          try {
            console.log(`📥 Received OTLP HTTP request (${body.length} bytes)`);

            // Parse the OTLP payload
            const payload = JSON.parse(body);

            // Forward directly to Dash0 without modification
            if (this.dash0Forwarder) {
              console.log(`📤 Forwarding OTLP payload to Dash0...`);
              await this.dash0Forwarder.forwardRaw(payload);
              console.log(`✅ OTLP payload forwarded successfully`);
            } else {
              console.warn(`⚠️  No Dash0 forwarder configured - OTLP payload dropped`);
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

    await new Promise<void>((resolve, reject) => {
      this.otlpServer!.on('error', (error) => {
        console.error(`❌ OTLP server error:`, error);
        reject(error);
      });

      this.otlpServer!.listen(port, () => {
        console.log(`🌐 OTLP HTTP endpoint: http://localhost:${port}/v1/traces`);
        console.log(`✅ OTLP server listening and ready to accept traces`);
        resolve();
      });
    });
  }

  private async startHealthCheck(): Promise<void> {
    if (!process.env.HEALTH_PORT) throw new Error('HEALTH_PORT environment variable is required');
    const port = parseInt(process.env.HEALTH_PORT);

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

    server.listen(port, () => {
      console.log(`🏥 Health check endpoint: http://localhost:${port}/health`);
    });
  }

  private startStatsLogging(): void {
    if (!process.env.STATS_INTERVAL) throw new Error('STATS_INTERVAL environment variable is required');
    const interval = parseInt(process.env.STATS_INTERVAL);

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