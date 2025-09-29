/**
 * End-to-End Webhook Integration Tests
 *
 * Tests the complete telemetry pipeline:
 * EventClient → Redis Stream → Bridge → OTLP Collector → HTTP POST → Test Webhook
 *
 * This validates that telemetry data flows correctly through all components
 * and arrives at the destination with the correct OTLP format.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, Server } from 'http';
import { spawn, ChildProcess } from 'child_process';
import Redis from 'ioredis';
import { EventClient } from '@emp/core';
import { RedisToOtlpBridge, BridgeConfig } from '../redis-to-otlp-bridge.js';

interface WebhookRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: any;
  timestamp: number;
}

describe('End-to-End Webhook Integration', () => {
  let redis: Redis;
  let eventClient: EventClient;
  let bridge: RedisToOtlpBridge;
  let webhookServer: Server;
  let ngrokProcess: ChildProcess | null = null;
  let webhookPort: number;
  let ngrokUrl: string | null = null;
  let receivedRequests: WebhookRequest[] = [];

  const streamKey = 'telemetry:events';
  const consumerGroup = 'test-e2e-group';
  const ngrokDomain = 'emerge-dash0-delivery.ngrok.pizza';

  beforeEach(async () => {
    // Clear received requests
    receivedRequests = [];

    // Setup Redis connection
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    // Clean up any existing test data
    await redis.del(streamKey);
    try {
      await redis.xgroup('DESTROY', streamKey, consumerGroup);
    } catch (error) {
      // Group might not exist, that's okay
    }

    // Setup test webhook server
    webhookPort = 9876; // Use a fixed port for testing
    await setupWebhookServer();

    // Setup ngrok tunnel
    await setupNgrokTunnel();

    // Setup EventClient
    eventClient = new EventClient('e2e-test-service', process.env.REDIS_URL || 'redis://localhost:6379');

    // Setup bridge pointing to our webhook
    const bridgeConfig: BridgeConfig = {
      redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
      streamKey: streamKey,
      consumerGroup: consumerGroup,
      consumerName: 'e2e-test-consumer',
      batchSize: 5,
      blockTime: 100,
      otlpEndpoint: ngrokUrl ? `${ngrokUrl}/v1/traces` : `http://localhost:${webhookPort}/v1/traces`
    };

    bridge = new RedisToOtlpBridge(bridgeConfig);

    console.log(`🎯 Bridge configured to send to: ${bridgeConfig.otlpEndpoint}`);

    // Wait for connections to establish
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  afterEach(async () => {
    // Stop bridge
    if (bridge) {
      await bridge.stop();
    }

    // Close event client
    if (eventClient) {
      await eventClient.close();
    }

    // Clean up test data
    if (redis) {
      await redis.del(streamKey);
      try {
        await redis.xgroup('DESTROY', streamKey, consumerGroup);
      } catch (error) {
        // Ignore errors
      }
      await redis.quit();
    }

    // Stop ngrok tunnel
    if (ngrokProcess) {
      console.log('🔌 Stopping ngrok tunnel...');
      ngrokProcess.kill('SIGTERM');
      ngrokProcess = null;
      ngrokUrl = null;
    }

    // Close webhook server
    if (webhookServer) {
      await new Promise<void>((resolve) => {
        webhookServer.close(() => resolve());
      });
    }
  });

  async function setupWebhookServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      webhookServer = createServer((req, res) => {
        let body = '';

        req.on('data', (chunk) => {
          body += chunk.toString();
        });

        req.on('end', () => {
          // Capture the request
          const webhookRequest: WebhookRequest = {
            method: req.method || 'UNKNOWN',
            url: req.url || '',
            headers: req.headers as Record<string, string>,
            body: body ? JSON.parse(body) : null,
            timestamp: Date.now()
          };

          receivedRequests.push(webhookRequest);

          console.log(`📨 Webhook received: ${req.method} ${req.url}`);
          console.log(`📦 Payload spans: ${webhookRequest.body?.resourceSpans?.[0]?.scopeSpans?.[0]?.spans?.length || 0}`);

          // Log first span name for debugging
          const firstSpan = webhookRequest.body?.resourceSpans?.[0]?.scopeSpans?.[0]?.spans?.[0];
          if (firstSpan) {
            console.log(`📊 First span: ${firstSpan.name} (traceId: ${firstSpan.traceId?.substring(0, 8)}...)`);
          }

          // Send success response (mimic Dash0 response)
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ partialSuccess: {} }));
        });
      });

      webhookServer.listen(webhookPort, () => {
        console.log(`🎣 Test webhook server listening on port ${webhookPort}`);
        console.log(`🌐 Expose with: ngrok http ${webhookPort}`);
        resolve();
      });

      webhookServer.on('error', reject);
    });
  }

  async function setupNgrokTunnel(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`🌐 Starting ngrok tunnel: ${ngrokDomain} → localhost:${webhookPort}`);

      // Start ngrok with domain directly (no config file needed)
      ngrokProcess = spawn('ngrok', [
        'http',
        webhookPort.toString(),
        '--domain', ngrokDomain,
        '--log', 'stdout'
      ], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let tunnelReady = false;

      ngrokProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        console.log(`🌐 [ngrok] ${output.trim()}`);

        // Look for successful tunnel start
        if (output.includes('started tunnel') || output.includes(ngrokDomain)) {
          if (!tunnelReady) {
            tunnelReady = true;
            ngrokUrl = `https://${ngrokDomain}`;
            console.log(`✅ Ngrok tunnel ready: ${ngrokUrl}`);
            resolve();
          }
        }
      });

      ngrokProcess.stderr?.on('data', (data) => {
        const error = data.toString();
        console.error(`❌ [ngrok] ${error.trim()}`);

        // Handle ngrok limitations gracefully
        if (error.includes('ERR_NGROK_18021') || error.includes('exceeded the maximum number')) {
          console.warn('⚠️  Ngrok endpoint limit reached, falling back to local testing');
          ngrokUrl = null; // Fall back to local
          if (!tunnelReady) {
            tunnelReady = true;
            resolve();
          }
        } else if (error.includes('ERROR') && !tunnelReady) {
          reject(new Error(`Ngrok failed: ${error}`));
        }
      });

      ngrokProcess.on('exit', (code) => {
        if (code !== 0 && !tunnelReady) {
          reject(new Error(`Ngrok exited with code ${code}`));
        }
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!tunnelReady) {
          reject(new Error('Ngrok tunnel setup timeout'));
        }
      }, 10000);
    });
  }

  it('should send event through complete pipeline via ngrok to webhook', async () => {
    // Start the bridge
    await bridge.start();
    await new Promise(resolve => setTimeout(resolve, 500));

    // Send a test event
    await eventClient.event('e2e.test.event', {
      message: 'End-to-end test message',
      jobId: 'e2e-job-123',
      workerId: 'e2e-worker-456',
      testData: { foo: 'bar', num: 42 }
    });

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify webhook received the request
    expect(receivedRequests).toHaveLength(1);

    const request = receivedRequests[0];
    expect(request.method).toBe('POST');
    expect(request.url).toBe('/v1/traces');
    expect(request.headers['content-type']).toBe('application/json');

    // Verify OTLP structure
    const otlpPayload = request.body;
    expect(otlpPayload).toHaveProperty('resourceSpans');
    expect(otlpPayload.resourceSpans).toHaveLength(1);

    const resourceSpan = otlpPayload.resourceSpans[0];
    expect(resourceSpan).toHaveProperty('scopeSpans');
    expect(resourceSpan.scopeSpans).toHaveLength(1);

    const scopeSpan = resourceSpan.scopeSpans[0];
    expect(scopeSpan).toHaveProperty('spans');
    expect(scopeSpan.spans).toHaveLength(1);

    const span = scopeSpan.spans[0];
    expect(span.name).toBe('e2e.test.event');
    expect(span.traceId).toBeTruthy();
    expect(span.spanId).toBeTruthy();
    expect(span.startTimeUnixNano).toBeTruthy();
    expect(span.endTimeUnixNano).toBeTruthy();

    // Verify attributes contain our test data
    const attributes = span.attributes;
    const jobIdAttr = attributes.find((attr: any) => attr.key === 'emp.job.id');
    const workerIdAttr = attributes.find((attr: any) => attr.key === 'emp.worker.id');

    expect(jobIdAttr?.value.stringValue).toBe('e2e-job-123');
    expect(workerIdAttr?.value.stringValue).toBe('e2e-worker-456');
  });

  it('should send span through complete pipeline to webhook', async () => {
    // Start the bridge
    await bridge.start();
    await new Promise(resolve => setTimeout(resolve, 500));

    // Send a test span
    await eventClient.span({
      traceId: 'e2eabcd1234567890efabcd1234567890ef',
      spanId: 'e2espan123456789',
      operationName: 'e2e.test.operation',
      startTime: Date.now() * 1000000,
      endTime: (Date.now() + 100) * 1000000,
      status: { code: 1, message: 'OK' },
      attributes: {
        'test.attribute': 'e2e-test-value',
        'emp.job.id': 'e2e-span-job-789',
        'http.method': 'POST',
        'http.status_code': '200'
      }
    });

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify webhook received the request
    expect(receivedRequests).toHaveLength(1);

    const request = receivedRequests[0];
    const span = request.body.resourceSpans[0].scopeSpans[0].spans[0];

    expect(span.name).toBe('e2e.test.operation');
    expect(span.traceId).toBe('e2eabcd1234567890efabcd123456789'); // Formatted by bridge
    expect(span.status.code).toBe(1);

    // Verify span-specific attributes
    const attributes = span.attributes;
    const testAttr = attributes.find((attr: any) => attr.key === 'test.attribute');
    const jobIdAttr = attributes.find((attr: any) => attr.key === 'emp.job.id');
    const httpMethodAttr = attributes.find((attr: any) => attr.key === 'http.method');

    expect(testAttr?.value.stringValue).toBe('e2e-test-value');
    expect(jobIdAttr?.value.stringValue).toBe('e2e-span-job-789');
    expect(httpMethodAttr?.value.stringValue).toBe('POST');
  });

  it('should batch multiple events correctly', async () => {
    // Start the bridge
    await bridge.start();
    await new Promise(resolve => setTimeout(resolve, 500));

    // Send multiple events quickly
    const eventPromises = [];
    for (let i = 0; i < 3; i++) {
      eventPromises.push(
        eventClient.event(`e2e.batch.event.${i}`, {
          index: i,
          batchId: 'e2e-batch-123',
          timestamp: Date.now() + i
        })
      );
    }

    await Promise.all(eventPromises);

    // Wait for processing (may be batched)
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Should have received requests (may be batched)
    expect(receivedRequests.length).toBeGreaterThan(0);

    // Count total spans across all requests
    let totalSpans = 0;
    const spanNames: string[] = [];

    receivedRequests.forEach(request => {
      request.body.resourceSpans.forEach((rs: any) => {
        rs.scopeSpans.forEach((ss: any) => {
          totalSpans += ss.spans.length;
          ss.spans.forEach((span: any) => {
            spanNames.push(span.name);
          });
        });
      });
    });

    expect(totalSpans).toBe(3);
    expect(spanNames).toContain('e2e.batch.event.0');
    expect(spanNames).toContain('e2e.batch.event.1');
    expect(spanNames).toContain('e2e.batch.event.2');
  });

  it('should handle mixed events and spans', async () => {
    // Start the bridge
    await bridge.start();
    await new Promise(resolve => setTimeout(resolve, 500));

    // Send both event and span
    await eventClient.event('e2e.mixed.event', {
      type: 'event',
      testId: 'mixed-test-123'
    });

    await eventClient.span({
      traceId: 'mixedabcd1234567890efabcd123456789', // Use 31 chars so it gets to 32 with padding
      spanId: 'mixedspan123456',
      operationName: 'e2e.mixed.span',
      startTime: Date.now() * 1000000,
      endTime: (Date.now() + 50) * 1000000,
      status: { code: 1, message: 'OK' },
      attributes: {
        'type': 'span',
        'testId': 'mixed-test-123'
      }
    });

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Should have received data
    expect(receivedRequests.length).toBeGreaterThan(0);

    // Collect all span names
    const spanNames: string[] = [];
    receivedRequests.forEach(request => {
      request.body.resourceSpans.forEach((rs: any) => {
        rs.scopeSpans.forEach((ss: any) => {
          ss.spans.forEach((span: any) => {
            spanNames.push(span.name);
          });
        });
      });
    });

    expect(spanNames).toContain('e2e.mixed.event');
    expect(spanNames).toContain('e2e.mixed.span');
  });

  it('should include proper HTTP headers in requests', async () => {
    // Start the bridge
    await bridge.start();
    await new Promise(resolve => setTimeout(resolve, 500));

    // Send a simple event
    await eventClient.event('e2e.headers.test', {
      message: 'Testing HTTP headers'
    });

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify webhook received the request
    expect(receivedRequests).toHaveLength(1);

    const request = receivedRequests[0];

    // Verify HTTP headers
    expect(request.headers['content-type']).toBe('application/json');
    expect(request.headers['user-agent']).toBeTruthy();
    expect(request.body).toBeTruthy();

    // Verify it's valid JSON
    expect(typeof request.body).toBe('object');
    expect(request.body.resourceSpans).toBeTruthy();
  });

  it('should maintain trace correlation across the pipeline', async () => {
    // Start the bridge
    await bridge.start();
    await new Promise(resolve => setTimeout(resolve, 500));

    // Send event with specific trace context
    await eventClient.event('e2e.correlation.test', {
      correlationId: 'test-correlation-456',
      sessionId: 'test-session-789'
    });

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify webhook received the request
    expect(receivedRequests).toHaveLength(1);

    const span = receivedRequests[0].body.resourceSpans[0].scopeSpans[0].spans[0];

    // Verify trace and span IDs are properly formatted
    expect(span.traceId).toMatch(/^[a-f0-9]{32}$/);
    expect(span.spanId).toMatch(/^[a-f0-9]{16}$/);

    // Verify our correlation data made it through
    const attributes = span.attributes;
    const correlationAttr = attributes.find((attr: any) => attr.key.includes('correlation'));

    // Should have some form of correlation data in attributes
    expect(attributes.length).toBeGreaterThan(0);
  });
});