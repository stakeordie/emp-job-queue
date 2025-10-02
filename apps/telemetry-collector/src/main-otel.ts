/**
 * Real OpenTelemetry Collector Integration
 *
 * This replaces the custom collector with:
 * Redis Stream → Bridge → Real OTEL Collector → Dash0 (gRPC)
 */

import { RedisToOtlpBridge, BridgeConfig } from './redis-to-otlp-bridge.js';

async function main() {
  console.log('🚀 Starting EMP Telemetry with Real OpenTelemetry Collector...');

  const config: BridgeConfig = {
    redisUrl: process.env.HUB_REDIS_URL || process.env.REDIS_URL || 'redis://localhost:6379',
    streamKey: 'telemetry:events',
    consumerGroup: 'otel-bridge-group',
    consumerName: 'otel-bridge-consumer',
    batchSize: 10,
    blockTime: 5000,
    otlpEndpoint: 'http://localhost:4318/v1/traces' // OTEL Collector HTTP endpoint
  };

  const bridge = new RedisToOtlpBridge(config);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
    await bridge.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await bridge.start();

    console.log('✅ EMP Telemetry Bridge is running!');
    console.log('📊 Architecture: EventClient → Redis Stream → Bridge → OTEL Collector → Dash0');
    console.log('🔧 Redis Stream:', config.streamKey);
    console.log('🌉 Bridge → OTEL Collector:', config.otlpEndpoint);
    console.log('🎯 OTEL Collector → Dash0: gRPC');

    // Keep alive
    setInterval(() => {
      const stats = bridge.getStats();
      console.log(`📈 Bridge Stats: ${stats.processedCount} events processed, running: ${stats.isRunning}`);
    }, 30000);

  } catch (error) {
    console.error('❌ Failed to start telemetry bridge:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('💥 Unhandled error:', error);
  process.exit(1);
});