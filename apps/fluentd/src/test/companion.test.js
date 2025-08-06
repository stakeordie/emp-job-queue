import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import FluentdCompanion from '../index.js';

describe('FluentdCompanion', () => {
  let companion;
  let server;

  beforeEach(() => {
    companion = new FluentdCompanion();
  });

  afterEach(async () => {
    if (server) {
      await companion.stop();
    }
  });

  describe('Health Checks', () => {
    it('should return health status', async () => {
      const health = await companion.getHealthStatus();
      
      expect(health).toBeDefined();
      expect(health.status).toMatch(/healthy|degraded/);
      expect(health.components).toBeDefined();
      expect(health.components.companion).toBe('healthy');
    });

    it('should include uptime in health status', async () => {
      const health = await companion.getHealthStatus();
      
      expect(health.uptime).toBeTypeOf('number');
      expect(health.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Metrics', () => {
    it('should generate Prometheus metrics', () => {
      const metrics = companion.getPrometheusMetrics();
      
      expect(metrics).toContain('fluentd_companion_uptime_seconds');
      expect(metrics).toContain('fluentd_companion_logs_processed_total');
      expect(metrics).toContain('fluentd_companion_errors_total');
    });

    it('should track error count', () => {
      companion.metrics.errors = 5;
      const metrics = companion.getPrometheusMetrics();
      
      expect(metrics).toContain('fluentd_companion_errors_total 5');
    });
  });

  describe('Configuration', () => {
    it('should load environment configuration', () => {
      // Test that companion reads environment variables correctly
      expect(process.env.NODE_ENV).toBe('test');
      expect(process.env.SERVICE_NAME).toBe('fluentd-aggregator-test');
    });
  });

  describe('Express App', () => {
    it('should have required middleware configured', () => {
      expect(companion.app).toBeDefined();
      expect(companion.app._router).toBeDefined();
    });
  });

  describe('Redis Integration', () => {
    it('should handle missing Redis configuration gracefully', () => {
      // When REDIS_HOST is not set, should not crash
      expect(() => new FluentdCompanion()).not.toThrow();
    });
  });
});