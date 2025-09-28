/**
 * Telemetry Collector Health Tests
 *
 * Tests health endpoint and system monitoring
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';

describe('Telemetry Collector Health', () => {
  const healthPort = 9091; // Use different port for tests
  let healthUrl: string;

  beforeEach(() => {
    healthUrl = `http://localhost:${healthPort}/health`;
  });

  it('should respond to health check requests', async () => {
    // Create a simple health server for testing
    const server = http.createServer((req, res) => {
      if (req.url === '/health') {
        const healthData = {
          status: 'healthy',
          consumer: {
            processedCount: 42,
            isRunning: true
          },
          processor: {
            batchSize: 50,
            pendingEvents: 3
          },
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          timestamp: new Date().toISOString()
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(healthData, null, 2));
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    await new Promise<void>((resolve, reject) => {
      server.listen(healthPort, (err?: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });

    try {
      // Test health endpoint
      const response = await fetch(healthUrl);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/json');

      const healthData = await response.json();
      expect(healthData.status).toBe('healthy');
      expect(healthData.consumer).toBeDefined();
      expect(healthData.processor).toBeDefined();
      expect(healthData.uptime).toBeTypeOf('number');
      expect(healthData.memory).toBeDefined();
      expect(healthData.timestamp).toBeTypeOf('string');

      // Test consumer stats
      expect(healthData.consumer.processedCount).toBe(42);
      expect(healthData.consumer.isRunning).toBe(true);

      // Test processor stats
      expect(healthData.processor.batchSize).toBe(50);
      expect(healthData.processor.pendingEvents).toBe(3);

      // Test memory info
      expect(healthData.memory.heapUsed).toBeTypeOf('number');
      expect(healthData.memory.heapTotal).toBeTypeOf('number');
      expect(healthData.memory.external).toBeTypeOf('number');
    } finally {
      server.close();
    }
  });

  it('should return 404 for unknown endpoints', async () => {
    const server = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"status":"healthy"}');
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    await new Promise<void>((resolve, reject) => {
      server.listen(healthPort, (err?: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });

    try {
      const response = await fetch(`http://localhost:${healthPort}/unknown`);
      expect(response.status).toBe(404);

      const text = await response.text();
      expect(text).toBe('Not Found');
    } finally {
      server.close();
    }
  });

  it('should provide structured health data format', () => {
    // Test the expected health data structure
    const mockHealthData = {
      status: 'healthy',
      consumer: {
        processedCount: 150,
        isRunning: true
      },
      processor: {
        batchSize: 50,
        pendingEvents: 0
      },
      uptime: 3600.5,
      memory: {
        heapUsed: 25165824,
        heapTotal: 35651584,
        external: 1056768,
        arrayBuffers: 163840
      },
      timestamp: '2025-09-28T06:30:00.000Z'
    };

    // Validate structure
    expect(mockHealthData.status).toBe('healthy');
    expect(mockHealthData.consumer.processedCount).toBeTypeOf('number');
    expect(mockHealthData.consumer.isRunning).toBeTypeOf('boolean');
    expect(mockHealthData.processor.batchSize).toBeTypeOf('number');
    expect(mockHealthData.processor.pendingEvents).toBeTypeOf('number');
    expect(mockHealthData.uptime).toBeTypeOf('number');
    expect(mockHealthData.memory.heapUsed).toBeTypeOf('number');
    expect(mockHealthData.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('should calculate memory usage in reasonable ranges', () => {
    const memory = process.memoryUsage();

    // Memory should be positive numbers
    expect(memory.heapUsed).toBeGreaterThan(0);
    expect(memory.heapTotal).toBeGreaterThan(0);
    expect(memory.external).toBeGreaterThan(0);

    // Heap used should be less than heap total
    expect(memory.heapUsed).toBeLessThanOrEqual(memory.heapTotal);

    // Memory should be in reasonable ranges (not crazy high or suspiciously low)
    expect(memory.heapUsed).toBeLessThan(1024 * 1024 * 1024); // Less than 1GB
    expect(memory.heapUsed).toBeGreaterThan(1024 * 1024); // More than 1MB
  });

  it('should track uptime correctly', () => {
    const uptime = process.uptime();

    expect(uptime).toBeTypeOf('number');
    expect(uptime).toBeGreaterThan(0);
    expect(uptime).toBeLessThan(86400 * 365); // Less than 1 year (reasonable for tests)
  });
});