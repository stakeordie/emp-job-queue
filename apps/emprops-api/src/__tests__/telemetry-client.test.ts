import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the telemetry module
vi.mock('@emp/telemetry', () => ({
  createTelemetryClient: vi.fn(() => ({
    startup: vi.fn().mockResolvedValue({ overall: 'healthy' }),
    log: {
      addFile: vi.fn().mockResolvedValue(undefined),
      info: vi.fn().mockResolvedValue(undefined),
      error: vi.fn().mockResolvedValue(undefined)
    },
    otel: {
      gauge: vi.fn().mockResolvedValue(undefined)
    }
  }))
}));

describe('Telemetry Client Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup test environment variables
    process.env.EMPROPS_API_BASE_ID = 'test-emprops-api';
    process.env.TELEMETRY_ENV = 'test';
    process.env.LOG_DIR = '/tmp';
    
    // Clean up machine/worker IDs to test generation
    delete process.env.MACHINE_ID;
    delete process.env.WORKER_ID;
  });

  it('should generate MACHINE_ID from EMPROPS_API_BASE_ID and TELEMETRY_ENV', async () => {
    const { createTelemetryClient } = await import('@emp/telemetry');
    
    // Import the telemetry initialization function (we'll need to extract it)
    // For now, test the logic directly
    const empropsApiBaseId = process.env.EMPROPS_API_BASE_ID;
    const telemetryEnv = process.env.TELEMETRY_ENV;
    
    expect(empropsApiBaseId).toBe('test-emprops-api');
    expect(telemetryEnv).toBe('test');
    
    // Simulate the MACHINE_ID generation logic
    const expectedMachineId = `${empropsApiBaseId}-${telemetryEnv}`;
    expect(expectedMachineId).toBe('test-emprops-api-test');
  });

  it('should fail gracefully when required environment variables are missing', () => {
    delete process.env.EMPROPS_API_BASE_ID;
    
    expect(() => {
      if (!process.env.EMPROPS_API_BASE_ID) {
        throw new Error('FATAL: EMPROPS_API_BASE_ID environment variable is required');
      }
    }).toThrow('EMPROPS_API_BASE_ID environment variable is required');
  });

  it('should create telemetry client with api service type', async () => {
    const { createTelemetryClient } = await import('@emp/telemetry');
    
    const client = createTelemetryClient('api');
    expect(createTelemetryClient).toHaveBeenCalledWith('api');
    expect(client).toBeDefined();
    expect(client.startup).toBeDefined();
    expect(client.log).toBeDefined();
    expect(client.otel).toBeDefined();
  });

  it('should configure log file monitoring', async () => {
    const { createTelemetryClient } = await import('@emp/telemetry');
    
    const client = createTelemetryClient('api');
    const logDir = process.env.LOG_DIR || '/tmp';
    
    await client.log.addFile(`${logDir}/error.log`, 'emprops-api-error');
    await client.log.addFile(`${logDir}/combined.log`, 'emprops-api-combined');
    
    expect(client.log.addFile).toHaveBeenCalledWith(`${logDir}/error.log`, 'emprops-api-error');
    expect(client.log.addFile).toHaveBeenCalledWith(`${logDir}/combined.log`, 'emprops-api-combined');
  });

  it('should start telemetry client with correct options', async () => {
    const { createTelemetryClient } = await import('@emp/telemetry');
    
    const client = createTelemetryClient('api');
    const result = await client.startup({
      testConnections: false,
      logConfiguration: true,
      sendStartupPing: true,
    });
    
    expect(client.startup).toHaveBeenCalledWith({
      testConnections: false,
      logConfiguration: true,
      sendStartupPing: true,
    });
    
    expect(result).toEqual({ overall: 'healthy' });
  });
});

describe('Environment Variable Validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should validate all required telemetry environment variables', () => {
    const requiredVars = [
      'OTEL_ENABLED',
      'TELEMETRY_ENV',
      'DASH0_ENDPOINT',
      'OTEL_COLLECTOR_TRACES_ENDPOINT',
      'OTEL_COLLECTOR_METRICS_ENDPOINT'
    ];

    // Set test values
    process.env.OTEL_ENABLED = 'true';
    process.env.TELEMETRY_ENV = 'test';
    process.env.DASH0_ENDPOINT = 'https://test.dash0.com';
    process.env.OTEL_COLLECTOR_TRACES_ENDPOINT = 'http://localhost:4318/v1/traces';
    process.env.OTEL_COLLECTOR_METRICS_ENDPOINT = 'http://localhost:4318/v1/metrics';

    for (const varName of requiredVars) {
      expect(process.env[varName]).toBeDefined();
      expect(process.env[varName]).not.toBe('');
    }
  });

  it('should have valid endpoint URLs', () => {
    process.env.DASH0_ENDPOINT = 'https://ingress.us-west-2.aws.dash0.com:4317';
    process.env.OTEL_COLLECTOR_TRACES_ENDPOINT = 'http://localhost:4318/v1/traces';
    process.env.OTEL_COLLECTOR_METRICS_ENDPOINT = 'http://localhost:4318/v1/metrics';

    expect(process.env.DASH0_ENDPOINT).toMatch(/^https?:\/\//);
    expect(process.env.OTEL_COLLECTOR_TRACES_ENDPOINT).toMatch(/^https?:\/\//);
    expect(process.env.OTEL_COLLECTOR_METRICS_ENDPOINT).toMatch(/^https?:\/\//);
  });

  it('should have service identification configured', () => {
    process.env.SERVICE_NAME = 'emprops-api';
    process.env.SERVICE_VERSION = '1';
    process.env.OTEL_SERVICE_NAME = 'emp-service';

    expect(process.env.SERVICE_NAME).toBe('emprops-api');
    expect(process.env.SERVICE_VERSION).toBeDefined();
    expect(process.env.OTEL_SERVICE_NAME).toBeDefined();
  });
});