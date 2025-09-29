#!/usr/bin/env node

/**
 * Simple webhook test server for telemetry testing
 *
 * Usage:
 * 1. node webhook-test-server.js
 * 2. ngrok http 9876
 * 3. Use the ngrok URL as DASH0_TRACES_ENDPOINT
 */

import { createServer } from 'http';
const port = process.env.WEBHOOK_PORT || 9876;

let requestCount = 0;
const receivedRequests = [];

const server = createServer((req, res) => {
  let body = '';

  req.on('data', (chunk) => {
    body += chunk.toString();
  });

  req.on('end', () => {
    requestCount++;

    try {
      const parsedBody = body ? JSON.parse(body) : null;

      // Log request details
      console.log(`\n📨 Request #${requestCount}: ${req.method} ${req.url}`);
      console.log(`📅 Time: ${new Date().toISOString()}`);
      console.log(`📦 Size: ${body.length} bytes`);

      // Log OTLP details if present
      if (parsedBody?.resourceSpans) {
        const resourceSpans = parsedBody.resourceSpans;
        let totalSpans = 0;

        resourceSpans.forEach(rs => {
          rs.scopeSpans?.forEach(ss => {
            totalSpans += ss.spans?.length || 0;

            ss.spans?.forEach((span, idx) => {
              console.log(`📊 Span ${idx + 1}: ${span.name}`);
              console.log(`   🔗 TraceId: ${span.traceId?.substring(0, 16)}...`);
              console.log(`   🆔 SpanId: ${span.spanId}`);
              console.log(`   ⏱️  Duration: ${((span.endTimeUnixNano - span.startTimeUnixNano) / 1000000).toFixed(2)}ms`);

              // Log key attributes
              if (span.attributes?.length > 0) {
                console.log(`   🏷️  Attributes:`);
                span.attributes.slice(0, 3).forEach(attr => {
                  const value = attr.value.stringValue || attr.value.intValue || attr.value.doubleValue;
                  console.log(`      ${attr.key}: ${value}`);
                });
                if (span.attributes.length > 3) {
                  console.log(`      ... and ${span.attributes.length - 3} more`);
                }
              }
            });
          });
        });

        console.log(`✅ Total spans received: ${totalSpans}`);
      }

      // Store request for analysis
      receivedRequests.push({
        timestamp: Date.now(),
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: parsedBody,
        rawBody: body
      });

      // Keep only last 100 requests
      if (receivedRequests.length > 100) {
        receivedRequests.shift();
      }

    } catch (error) {
      console.log(`❌ Error parsing request: ${error.message}`);
      console.log(`📄 Raw body: ${body.substring(0, 200)}...`);
    }

    // Send Dash0-like response
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end(JSON.stringify({ partialSuccess: {} }));
  });
});

// Handle OPTIONS for CORS
server.on('request', (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
  }
});

server.listen(port, () => {
  console.log(`🎣 Webhook test server listening on port ${port}`);
  console.log(`🌐 Expose with: ngrok http ${port}`);
  console.log(`📋 Stats endpoint: http://localhost:${port}/stats`);
  console.log(`🧹 Clear logs: http://localhost:${port}/clear`);
  console.log(`\n⏳ Waiting for telemetry data...`);
});

// Add stats and control endpoints
server.on('request', (req, res) => {
  if (req.method === 'GET' && req.url === '/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      totalRequests: requestCount,
      recentRequests: receivedRequests.length,
      lastRequest: receivedRequests[receivedRequests.length - 1]?.timestamp || null,
      uptime: process.uptime()
    }, null, 2));
  } else if (req.method === 'GET' && req.url === '/clear') {
    requestCount = 0;
    receivedRequests.length = 0;
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('✅ Logs cleared');
    console.log('🧹 Logs cleared');
  } else if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', port, uptime: process.uptime() }));
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down webhook server...');
  server.close(() => {
    console.log('✅ Server stopped');
    process.exit(0);
  });
});